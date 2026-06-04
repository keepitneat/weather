/* ─── Geocoding tests ─────────────────────────────────────────────
 * Run with: node --test
 * Pure parsing/URL logic plus the thin geocode() orchestration with an
 * injected fetch — no real network calls.
 * ──────────────────────────────────────────────────────────────── */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  looksLikeZip,
  buildCensusUrl,
  parseCensusMatches,
  geocode,
} from './geocode.js';

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

// ─── buildCensusUrl ──────────────────────────────────────────────

test('buildCensusUrl: targets the Census onelineaddress endpoint', () => {
  const url = new URL(buildCensusUrl('Madison, WI'));
  assert.equal(url.hostname, 'geocoding.geo.census.gov');
  assert.ok(url.pathname.endsWith('/geocoder/locations/onelineaddress'));
});

test('buildCensusUrl: requests JSON against the current public benchmark', () => {
  const url = new URL(buildCensusUrl('Madison, WI'));
  assert.equal(url.searchParams.get('format'), 'json');
  assert.equal(url.searchParams.get('benchmark'), 'Public_AR_Current');
});

test('buildCensusUrl: encodes the address query verbatim', () => {
  const url = new URL(buildCensusUrl('Madison, WI'));
  assert.equal(url.searchParams.get('address'), 'Madison, WI');
});

// ─── parseCensusMatches ──────────────────────────────────────────

function censusResponse(...matches) {
  return { result: { addressMatches: matches } };
}

function censusMatch({ address, lon, lat }) {
  return { matchedAddress: address, coordinates: { x: lon, y: lat } };
}

test('parseCensusMatches: maps matches to {name, lat, lon}', () => {
  const data = censusResponse(
    censusMatch({ address: 'MADISON, WI', lon: -89.4012, lat: 43.0731 }),
  );
  const results = parseCensusMatches(data);
  assert.deepEqual(results, [
    { name: 'MADISON, WI', lat: 43.0731, lon: -89.4012 },
  ]);
});

test('parseCensusMatches: preserves order for multiple matches', () => {
  const data = censusResponse(
    censusMatch({ address: 'A', lon: -1, lat: 1 }),
    censusMatch({ address: 'B', lon: -2, lat: 2 }),
  );
  const names = parseCensusMatches(data).map((m) => m.name);
  assert.deepEqual(names, ['A', 'B']);
});

test('parseCensusMatches: empty / missing input yields empty array', () => {
  assert.deepEqual(parseCensusMatches(null), []);
  assert.deepEqual(parseCensusMatches({}), []);
  assert.deepEqual(parseCensusMatches({ result: {} }), []);
  assert.deepEqual(parseCensusMatches(censusResponse()), []);
});

test('parseCensusMatches: drops matches missing usable coordinates', () => {
  const data = {
    result: {
      addressMatches: [
        { matchedAddress: 'No coords' },
        { matchedAddress: 'Bad coords', coordinates: { x: null, y: 1 } },
        censusMatch({ address: 'Good', lon: -3, lat: 3 }),
      ],
    },
  };
  const results = parseCensusMatches(data);
  assert.deepEqual(results, [{ name: 'Good', lat: 3, lon: -3 }]);
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
  const fetchImpl = fakeFetch(censusResponse());
  await assert.rejects(() => geocode('   ', { fetchImpl }), /empty/i);
  assert.equal(fetchImpl.calls.length, 0);
});

test('geocode: returns parsed matches from the Census response', async () => {
  const fetchImpl = fakeFetch(
    censusResponse(censusMatch({ address: 'MADISON, WI', lon: -89.4, lat: 43.07 })),
  );
  const results = await geocode('Madison, WI', { fetchImpl });
  assert.deepEqual(results, [{ name: 'MADISON, WI', lat: 43.07, lon: -89.4 }]);
  assert.equal(fetchImpl.calls.length, 1);
});

test('geocode: a non-ok response throws', async () => {
  const fetchImpl = fakeFetch(null, { ok: false, status: 503 });
  await assert.rejects(() => geocode('Madison, WI', { fetchImpl }), /503/);
});

test('geocode: a successful response with zero matches resolves to []', async () => {
  const fetchImpl = fakeFetch(censusResponse());
  const results = await geocode('Nowheresville, ZZ', { fetchImpl });
  assert.deepEqual(results, []);
});

test('geocode: trims the query before sending it', async () => {
  const fetchImpl = fakeFetch(censusResponse());
  await geocode('  Madison, WI  ', { fetchImpl });
  const sent = new URL(fetchImpl.calls[0]);
  assert.equal(sent.searchParams.get('address'), 'Madison, WI');
});
