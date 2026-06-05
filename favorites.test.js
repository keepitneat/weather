/* ─── Favorites tests ─────────────────────────────────────────────
 * Run with: node --test
 * The whole module is pure data-model logic over an injected store, so it's
 * exercised here without a browser. Each test builds a fresh fake store so a
 * malformed-storage case can't bleed into the next.
 * ──────────────────────────────────────────────────────────────── */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FAVORITES_KEY,
  CURRENT_FAVORITE_KEY,
  getFavorites,
  addFavorite,
  removeFavorite,
  findFavorite,
  getCurrentFavoriteId,
  setCurrentFavoriteId,
  clearCurrentFavoriteId,
  favoriteToLocation,
  locationToFavorite,
  findFavoriteByForecastUrl,
  isFavorited,
} from './favorites.js';

// ─── A minimal localStorage-shaped fake ──────────────────────────

function fakeStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _dump: () => Object.fromEntries(map),
  };
}

// A resolved location as produced by resolveFromCoords (NEAT-58 shape).
const MADISON = {
  lat: 43.07469,
  lon: -89.3841663,
  forecastUrl: 'https://api.weather.gov/gridpoints/MKX/37,63/forecast',
  hourlyUrl: 'https://api.weather.gov/gridpoints/MKX/37,63/forecast/hourly',
  observationUrl: 'https://api.weather.gov/stations/KMSN/observations/latest',
  stationName: 'Dane County Regional Airport',
  locationName: 'Madison, WI',
};

const DENVER = {
  lat: 39.7392,
  lon: -104.9903,
  forecastUrl: 'https://api.weather.gov/gridpoints/BOU/62,61/forecast',
  hourlyUrl: 'https://api.weather.gov/gridpoints/BOU/62,61/forecast/hourly',
  observationUrl: 'https://api.weather.gov/stations/KBKF/observations/latest',
  stationName: 'Buckley Field',
  locationName: 'Denver, CO',
};

// ─── getFavorites: empty + malformed resilience ──────────────────

test('getFavorites: empty store yields an empty array', () => {
  assert.deepEqual(getFavorites(fakeStore()), []);
});

test('getFavorites: malformed JSON yields an empty array, not a throw', () => {
  const store = fakeStore({ [FAVORITES_KEY]: '{not json' });
  assert.deepEqual(getFavorites(store), []);
});

test('getFavorites: a stored non-array (object) yields an empty array', () => {
  const store = fakeStore({ [FAVORITES_KEY]: '{"id":"x"}' });
  assert.deepEqual(getFavorites(store), []);
});

test('getFavorites: drops entries missing an id or the resolved URLs', () => {
  const store = fakeStore({
    [FAVORITES_KEY]: JSON.stringify([
      { label: 'no id', forecastUrl: 'u', hourlyUrl: 'h' },
      { id: 'a', label: 'no urls' },
      { id: 'b', label: 'good', forecastUrl: 'u', hourlyUrl: 'h', lat: 1, lon: 2 },
    ]),
  });
  const favs = getFavorites(store);
  assert.equal(favs.length, 1);
  assert.equal(favs[0].id, 'b');
});

// ─── addFavorite ─────────────────────────────────────────────────

test('addFavorite: persists a favorite with a generated id and the full shape', () => {
  const store = fakeStore();
  const fav = addFavorite(store, MADISON);

  assert.ok(fav.id, 'gets an id');
  assert.equal(fav.label, 'Madison, WI');
  assert.equal(fav.lat, MADISON.lat);
  assert.equal(fav.lon, MADISON.lon);
  assert.equal(fav.forecastUrl, MADISON.forecastUrl);
  assert.equal(fav.hourlyUrl, MADISON.hourlyUrl);
  assert.equal(fav.observationUrl, MADISON.observationUrl);
  assert.equal(fav.stationName, MADISON.stationName);
  assert.equal(fav.locationName, MADISON.locationName);

  const stored = getFavorites(store);
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0], fav);
});

test('addFavorite: appends additional favorites in order', () => {
  const store = fakeStore();
  addFavorite(store, MADISON);
  addFavorite(store, DENVER);
  const favs = getFavorites(store);
  assert.deepEqual(favs.map((f) => f.label), ['Madison, WI', 'Denver, CO']);
});

test('addFavorite: dedupes by forecastUrl — returns the existing favorite, no duplicate row', () => {
  const store = fakeStore();
  const first = addFavorite(store, MADISON);
  const again = addFavorite(store, { ...MADISON, locationName: 'Madison (again)' });

  assert.equal(again.id, first.id, 'same id back');
  assert.equal(getFavorites(store).length, 1, 'no duplicate stored');
});

test('addFavorite: a custom label overrides the locationName default', () => {
  const store = fakeStore();
  const fav = addFavorite(store, MADISON, { label: "Mom's house" });
  assert.equal(fav.label, "Mom's house");
});

test('addFavorite: generated ids are unique across favorites', () => {
  const store = fakeStore();
  const a = addFavorite(store, MADISON);
  const b = addFavorite(store, DENVER);
  assert.notEqual(a.id, b.id);
});

// ─── findFavorite ────────────────────────────────────────────────

test('findFavorite: returns the favorite matching an id', () => {
  const store = fakeStore();
  const a = addFavorite(store, MADISON);
  const b = addFavorite(store, DENVER);
  assert.equal(findFavorite(store, b.id).label, 'Denver, CO');
  assert.equal(findFavorite(store, a.id).label, 'Madison, WI');
});

test('findFavorite: an unknown id returns null', () => {
  const store = fakeStore();
  addFavorite(store, MADISON);
  assert.equal(findFavorite(store, 'nope'), null);
  assert.equal(findFavorite(store, null), null);
});

// ─── findFavoriteByForecastUrl / isFavorited — the identity predicate ─

test('findFavoriteByForecastUrl: returns the favorite whose forecastUrl matches', () => {
  const store = fakeStore();
  addFavorite(store, MADISON);
  const denver = addFavorite(store, DENVER);
  const found = findFavoriteByForecastUrl(store, DENVER.forecastUrl);
  assert.equal(found.id, denver.id);
  assert.equal(found.label, 'Denver, CO');
});

test('findFavoriteByForecastUrl: no match returns null', () => {
  const store = fakeStore();
  addFavorite(store, MADISON);
  assert.equal(findFavoriteByForecastUrl(store, DENVER.forecastUrl), null);
});

test('findFavoriteByForecastUrl: empty store returns null', () => {
  assert.equal(findFavoriteByForecastUrl(fakeStore(), MADISON.forecastUrl), null);
});

test('findFavoriteByForecastUrl: malformed store returns null, not a throw', () => {
  const store = fakeStore({ [FAVORITES_KEY]: '{not json' });
  assert.equal(findFavoriteByForecastUrl(store, MADISON.forecastUrl), null);
});

test('findFavoriteByForecastUrl: a falsy url returns null (no accidental match)', () => {
  const store = fakeStore();
  addFavorite(store, MADISON);
  assert.equal(findFavoriteByForecastUrl(store, undefined), null);
  assert.equal(findFavoriteByForecastUrl(store, ''), null);
  assert.equal(findFavoriteByForecastUrl(store, null), null);
});

test('isFavorited: true when a favorite has that forecastUrl, false otherwise', () => {
  const store = fakeStore();
  addFavorite(store, MADISON);
  assert.equal(isFavorited(store, MADISON.forecastUrl), true);
  assert.equal(isFavorited(store, DENVER.forecastUrl), false);
});

test('isFavorited: empty store is always false', () => {
  assert.equal(isFavorited(fakeStore(), MADISON.forecastUrl), false);
});

// ─── removeFavorite ──────────────────────────────────────────────

test('removeFavorite: drops the matching favorite, leaves the rest', () => {
  const store = fakeStore();
  const a = addFavorite(store, MADISON);
  const b = addFavorite(store, DENVER);
  removeFavorite(store, a.id);
  const favs = getFavorites(store);
  assert.deepEqual(favs.map((f) => f.id), [b.id]);
});

test('removeFavorite: removing the current favorite clears the current-id pointer', () => {
  const store = fakeStore();
  const a = addFavorite(store, MADISON);
  setCurrentFavoriteId(store, a.id);
  removeFavorite(store, a.id);
  assert.equal(getCurrentFavoriteId(store), null);
});

test('removeFavorite: removing a non-current favorite keeps the current-id pointer', () => {
  const store = fakeStore();
  const a = addFavorite(store, MADISON);
  const b = addFavorite(store, DENVER);
  setCurrentFavoriteId(store, a.id);
  removeFavorite(store, b.id);
  assert.equal(getCurrentFavoriteId(store), a.id);
});

test('removeFavorite: an unknown id is a no-op', () => {
  const store = fakeStore();
  addFavorite(store, MADISON);
  removeFavorite(store, 'nope');
  assert.equal(getFavorites(store).length, 1);
});

// ─── current-favorite-id pointer ─────────────────────────────────

test('getCurrentFavoriteId: defaults to null', () => {
  assert.equal(getCurrentFavoriteId(fakeStore()), null);
});

test('setCurrentFavoriteId / getCurrentFavoriteId: round-trips', () => {
  const store = fakeStore();
  setCurrentFavoriteId(store, 'abc');
  assert.equal(getCurrentFavoriteId(store), 'abc');
});

test('clearCurrentFavoriteId: resets the pointer to null (used by Current location)', () => {
  const store = fakeStore();
  setCurrentFavoriteId(store, 'abc');
  clearCurrentFavoriteId(store);
  assert.equal(getCurrentFavoriteId(store), null);
});

// ─── favoriteToLocation: adapter to the fetchForecast shape ───────

test('favoriteToLocation: maps a favorite to the resolved-location shape with a derived alertsUrl', () => {
  const store = fakeStore();
  const fav = addFavorite(store, MADISON);
  const location = favoriteToLocation(fav);

  assert.equal(location.forecastUrl, MADISON.forecastUrl);
  assert.equal(location.hourlyUrl, MADISON.hourlyUrl);
  assert.equal(location.observationUrl, MADISON.observationUrl);
  assert.equal(location.stationName, MADISON.stationName);
  assert.equal(location.locationName, MADISON.locationName);
  // alertsUrl is derived from the stored lat/lon (we don't store it), and must
  // match the NWS point-query format app.js uses elsewhere (4-decimal coords).
  assert.equal(
    location.alertsUrl,
    'https://api.weather.gov/alerts/active?point=43.0747,-89.3842'
  );
});

test('favoriteToLocation: a favorite without coords yields a null alertsUrl (no bad query)', () => {
  const fav = { id: 'x', label: 'L', forecastUrl: 'f', hourlyUrl: 'h', locationName: 'L' };
  assert.equal(favoriteToLocation(fav).alertsUrl, null);
});

// ─── locationToFavorite: round-trip shape (no store, pure) ────────

test('locationToFavorite: produces the stored favorite shape from a resolved location', () => {
  const fav = locationToFavorite(MADISON, { id: 'id-1' });
  assert.deepEqual(fav, {
    id: 'id-1',
    label: 'Madison, WI',
    lat: MADISON.lat,
    lon: MADISON.lon,
    forecastUrl: MADISON.forecastUrl,
    hourlyUrl: MADISON.hourlyUrl,
    observationUrl: MADISON.observationUrl,
    stationName: MADISON.stationName,
    locationName: MADISON.locationName,
  });
});

// ─── immutability: returned favorites don't alias internal state ──

test('getFavorites: mutating a returned favorite does not corrupt storage', () => {
  const store = fakeStore();
  addFavorite(store, MADISON);
  const favs = getFavorites(store);
  favs[0].label = 'MUTATED';
  assert.equal(getFavorites(store)[0].label, 'Madison, WI');
});
