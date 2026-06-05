/* ─── Geocoding tests ─────────────────────────────────────────────
 * Run with: node --test
 * Pure parsing/URL logic plus the thin geocode() orchestration with an
 * injected fetch — no real network calls.
 *
 * The parser tests use REAL captured Nominatim responses (curled live
 * for "Madison, WI" and ZIP "53703") — the test class whose absence let
 * a provider that returns nothing in production ship green.
 * ──────────────────────────────────────────────────────────────── */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  looksLikeZip,
  buildGeocodeUrl,
  parseNominatimResults,
  shortLocationName,
  geocode,
} from './geocode.js';

// ─── Real captured Nominatim responses ───────────────────────────
// Verbatim from:
//   curl 'https://nominatim.openstreetmap.org/search?q=Madison%2C+WI&format=json&limit=1&countrycodes=us&addressdetails=1'
//   curl 'https://nominatim.openstreetmap.org/search?q=53703&format=json&limit=1&countrycodes=us&addressdetails=1'

const REAL_CITY_RESPONSE = [
  {
    place_id: 373347806,
    osm_type: 'relation',
    osm_id: 3352040,
    lat: '43.0746900',
    lon: '-89.3841663',
    class: 'boundary',
    type: 'administrative',
    addresstype: 'city',
    name: 'Madison',
    display_name: 'Madison, Dane County, Wisconsin, United States',
  },
];

const REAL_ZIP_RESPONSE = [
  {
    place_id: 382571302,
    lat: '43.0782413',
    lon: '-89.3760345',
    class: 'place',
    type: 'postcode',
    addresstype: 'postcode',
    name: '53703',
    display_name: '53703, Madison, Dane County, Wisconsin, United States',
  },
];

// ─── looksLikeZip ────────────────────────────────────────────────

test('looksLikeZip: a bare 5-digit string is a ZIP', () => {
  assert.equal(looksLikeZip('53703'), true);
  assert.equal(looksLikeZip('  53703 '), true);
});

test('looksLikeZip: ZIP+4 is a ZIP', () => {
  assert.equal(looksLikeZip('53703-1234'), true);
});

test('looksLikeZip: city names and partial digits are not ZIPs', () => {
  assert.equal(looksLikeZip('Madison, WI'), false);
  assert.equal(looksLikeZip('5370'), false);
  assert.equal(looksLikeZip('537033'), false);
  assert.equal(looksLikeZip(''), false);
  assert.equal(looksLikeZip(null), false);
});

// ─── buildGeocodeUrl ─────────────────────────────────────────────

test('buildGeocodeUrl: targets Nominatim with the US-scoped query params', () => {
  const url = new URL(buildGeocodeUrl('Madison, WI'));
  assert.equal(url.hostname, 'nominatim.openstreetmap.org');
  assert.equal(url.searchParams.get('q'), 'Madison, WI');
  assert.equal(url.searchParams.get('format'), 'json');
  assert.equal(url.searchParams.get('limit'), '1');
  assert.equal(url.searchParams.get('countrycodes'), 'us');
});

// ─── parseNominatimResults (real fixtures) ───────────────────────

test('parseNominatimResults: extracts numeric lat/lon + name from a real city response', () => {
  const results = parseNominatimResults(REAL_CITY_RESPONSE);
  assert.deepEqual(results, [
    {
      name: 'Madison, Dane County',
      lat: 43.07469,
      lon: -89.3841663,
    },
  ]);
});

test('parseNominatimResults: extracts numeric lat/lon + name from a real ZIP response', () => {
  const results = parseNominatimResults(REAL_ZIP_RESPONSE);
  assert.deepEqual(results, [
    {
      name: '53703, Madison',
      lat: 43.0782413,
      lon: -89.3760345,
    },
  ]);
});

test('parseNominatimResults: empty array / non-array input yields empty array', () => {
  assert.deepEqual(parseNominatimResults([]), []);
  assert.deepEqual(parseNominatimResults(null), []);
  assert.deepEqual(parseNominatimResults({}), []);
});

test('parseNominatimResults: drops results missing usable coordinates', () => {
  const data = [
    { display_name: 'No coords' },
    { display_name: 'Bad coords', lat: 'abc', lon: '1' },
    { display_name: 'Good', lat: '3', lon: '-3' },
  ];
  assert.deepEqual(parseNominatimResults(data), [
    { name: 'Good', lat: 3, lon: -3 },
  ]);
});

// ─── geocode (injected fetch) ────────────────────────────────────

function fakeFetch(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    return {
      ok,
      status,
      json: async () => payload,
    };
  };
  impl.calls = calls;
  return impl;
}

test('geocode: rejects an empty query before hitting the network', async () => {
  const fetchImpl = fakeFetch([]);
  await assert.rejects(() => geocode('   ', { fetchImpl }), /empty/i);
  assert.equal(fetchImpl.calls.length, 0);
});

test('geocode: returns parsed matches from a real Nominatim response', async () => {
  const fetchImpl = fakeFetch(REAL_CITY_RESPONSE);
  const results = await geocode('Madison, WI', { fetchImpl });
  assert.deepEqual(results, [
    {
      name: 'Madison, Dane County',
      lat: 43.07469,
      lon: -89.3841663,
    },
  ]);
  assert.equal(fetchImpl.calls.length, 1);
});

test('geocode: a non-ok response throws', async () => {
  const fetchImpl = fakeFetch(null, { ok: false, status: 503 });
  await assert.rejects(() => geocode('Madison, WI', { fetchImpl }), /503/);
});

test('geocode: a successful response with zero matches resolves to []', async () => {
  const fetchImpl = fakeFetch([]);
  const results = await geocode('Nowheresville, ZZ', { fetchImpl });
  assert.deepEqual(results, []);
});

test('geocode: trims the query before sending it', async () => {
  const fetchImpl = fakeFetch([]);
  await geocode('  Madison, WI  ', { fetchImpl });
  const sent = new URL(fetchImpl.calls[0]);
  assert.equal(sent.searchParams.get('q'), 'Madison, WI');
});

// ─── shortLocationName ───────────────────────────────────────────

test('shortLocationName: city + state → "City, ST"', () => {
  assert.equal(shortLocationName({ address: { city: 'Madison', state: 'Wisconsin' } }), 'Madison, WI');
});

test('shortLocationName: falls back through town/village/hamlet/county for the city part', () => {
  assert.equal(shortLocationName({ address: { town: 'Mount Horeb', state: 'Wisconsin' } }), 'Mount Horeb, WI');
  assert.equal(shortLocationName({ address: { village: 'Cross Plains', state: 'Wisconsin' } }), 'Cross Plains, WI');
  assert.equal(shortLocationName({ address: { county: 'Dane County', state: 'Wisconsin' } }), 'Dane County, WI');
});

test('shortLocationName: ZIP result (postcode + city) still yields City, ST', () => {
  assert.equal(
    shortLocationName({ address: { postcode: '53703', city: 'Madison', state: 'Wisconsin' } }),
    'Madison, WI'
  );
});

test('shortLocationName: unknown state name passes through as-is', () => {
  assert.equal(shortLocationName({ address: { city: 'Springfield', state: 'Atlantis' } }), 'Springfield, Atlantis');
});

test('shortLocationName: no address → first two display_name segments', () => {
  assert.equal(
    shortLocationName({ display_name: 'Madison, Dane County, Wisconsin, United States' }),
    'Madison, Dane County'
  );
});

test('shortLocationName: nothing usable → empty string', () => {
  assert.equal(shortLocationName({}), '');
  assert.equal(shortLocationName(null), '');
});

test('parseNominatimResults: name is the short "City, ST"', () => {
  const data = [{
    lat: '43.07', lon: '-89.38',
    display_name: 'Madison, Dane County, Wisconsin, United States',
    address: { city: 'Madison', state: 'Wisconsin' },
  }];
  assert.deepEqual(parseNominatimResults(data), [{ name: 'Madison, WI', lat: 43.07, lon: -89.38 }]);
});
