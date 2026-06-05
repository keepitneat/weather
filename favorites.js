/* ─── Favorites (saved locations) ──────────────────────────────────
 * Data model + operations for a small list of saved locations the user can
 * switch between (e.g. "weather where family lives"). Pure over an injected
 * store (localStorage-shaped: getItem/setItem/removeItem), so the whole module
 * is unit-testable with a fake — no DOM, no network.
 *
 * Each favorite stores the RESOLVED NWS endpoints (forecast/hourly/observation)
 * captured at add-time, so switching to a favorite needs no geocode/points
 * round-trip — app.js just refetches forecast + obs from the cached URLs.
 * alertsUrl is NOT stored; it's derived from the saved lat/lon on switch, so
 * the format stays in sync with the one app.js builds elsewhere.
 *
 * "Current location" (the geolocation-resolved home) is intentionally NOT a
 * favorite — it lives in the existing location cache. A null current-favorite-id
 * means "showing Current location," which is the sensible default.
 * ──────────────────────────────────────────────────────────────── */

export const FAVORITES_KEY = 'favorites';
export const CURRENT_FAVORITE_KEY = 'current-favorite-id';

// Mirrors NWS_ALERTS in app.js: query alerts by point, 4-decimal coords. Kept
// here (not imported) so this module stays DOM-free and standalone-testable;
// the favoriteToLocation test pins the format so the two can't drift silently.
function alertsUrlFor(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
}

// A favorite is usable only if we can both identify it and fetch its weather,
// so an entry missing an id or the forecast/hourly URLs is dropped on read —
// the same resilience the alerts seen-set and forecast cache already practice.
function isUsableFavorite(fav) {
  return Boolean(fav && fav.id && fav.forecastUrl && fav.hourlyUrl);
}

// Read the stored list, tolerating absent / malformed / non-array storage by
// returning []. Each favorite is a fresh object so callers can't mutate the
// parsed-once internal copy back into storage corruption.
export function getFavorites(store) {
  const raw = store.getItem(FAVORITES_KEY);
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isUsableFavorite).map((fav) => ({ ...fav }));
}

function writeFavorites(store, favorites) {
  store.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

// Collision-resistant enough for a hand-curated list; not a security token.
function generateId() {
  return `fav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Build the stored favorite shape from a resolved location (the NEAT-58
// resolveFromCoords output). Pure — no store, no id generation — so it's
// trivially testable and reusable.
export function locationToFavorite(location, { id, label } = {}) {
  return {
    id,
    label: label || location.locationName,
    lat: location.lat,
    lon: location.lon,
    forecastUrl: location.forecastUrl,
    hourlyUrl: location.hourlyUrl,
    observationUrl: location.observationUrl ?? null,
    stationName: location.stationName ?? null,
    locationName: location.locationName,
  };
}

// Save a resolved location as a favorite. Dedupes by forecastUrl (the stable
// per-gridpoint identity) so re-adding the same place returns the existing
// favorite instead of stacking duplicates. Returns the favorite either way.
export function addFavorite(store, location, { label } = {}) {
  const favorites = getFavorites(store);
  const existing = favorites.find((f) => f.forecastUrl === location.forecastUrl);
  if (existing) return existing;

  const favorite = locationToFavorite(location, { id: generateId(), label });
  writeFavorites(store, [...favorites, favorite]);
  return favorite;
}

export function findFavorite(store, id) {
  if (!id) return null;
  return getFavorites(store).find((f) => f.id === id) || null;
}

// Remove a favorite by id. If it was the displayed one, clear the current-id
// pointer too so the app falls back to Current location rather than pointing at
// a favorite that no longer exists.
export function removeFavorite(store, id) {
  const favorites = getFavorites(store);
  writeFavorites(store, favorites.filter((f) => f.id !== id));
  if (getCurrentFavoriteId(store) === id) clearCurrentFavoriteId(store);
}

export function getCurrentFavoriteId(store) {
  return store.getItem(CURRENT_FAVORITE_KEY) || null;
}

export function setCurrentFavoriteId(store, id) {
  store.setItem(CURRENT_FAVORITE_KEY, id);
}

export function clearCurrentFavoriteId(store) {
  store.removeItem(CURRENT_FAVORITE_KEY);
}

// Adapt a stored favorite into the location shape fetchForecast expects. The
// alertsUrl is rebuilt from the saved coords (we don't store it) so a switch
// queries alerts for the right point without a re-resolve.
export function favoriteToLocation(fav) {
  return {
    forecastUrl: fav.forecastUrl,
    hourlyUrl: fav.hourlyUrl,
    observationUrl: fav.observationUrl ?? null,
    alertsUrl: alertsUrlFor(fav.lat, fav.lon),
    locationName: fav.locationName,
    stationName: fav.stationName ?? null,
  };
}
