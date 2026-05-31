/* ─── Just the Weather — alerts logic tests ───────────────────────
 * Run with: node --test
 * Pure-logic tests only (no DOM) — the alert view-model + sort + format
 * helpers in alerts.js. DOM rendering (renderAlerts) lives in app.js and
 * is verified manually, matching how the rest of the render layer is tested.
 * ──────────────────────────────────────────────────────────────── */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  severityRank,
  isLoudAlert,
  formatExpiry,
  normalizeAlerts,
  ALERT_SEVERITIES,
} from './alerts.js';

// Build a minimal NWS-shaped GeoJSON feature.
function feature(props) {
  return { id: props.id ?? 'urn:test', properties: props };
}
function geojson(...featureProps) {
  return { features: featureProps.map(feature) };
}

// ─── severityRank ────────────────────────────────────────────────

test('severityRank: Extreme is most severe (lowest rank)', () => {
  assert.ok(severityRank('Extreme') < severityRank('Severe'));
  assert.ok(severityRank('Severe') < severityRank('Moderate'));
  assert.ok(severityRank('Moderate') < severityRank('Minor'));
  assert.ok(severityRank('Minor') < severityRank('Unknown'));
});

test('severityRank: unrecognized / missing severity sorts last', () => {
  assert.ok(severityRank('Bogus') >= severityRank('Unknown'));
  assert.ok(severityRank(null) >= severityRank('Unknown'));
  assert.ok(severityRank(undefined) >= severityRank('Unknown'));
});

test('ALERT_SEVERITIES lists the four NWS levels in order', () => {
  assert.deepEqual(ALERT_SEVERITIES, ['Extreme', 'Severe', 'Moderate', 'Minor']);
});

// ─── isLoudAlert ─────────────────────────────────────────────────

test('isLoudAlert: tornado warning is loud regardless of severity casing', () => {
  assert.equal(isLoudAlert('Tornado Warning', 'Extreme'), true);
  assert.equal(isLoudAlert('tornado warning', 'Severe'), true);
});

test('isLoudAlert: severe thunderstorm warning is loud', () => {
  assert.equal(isLoudAlert('Severe Thunderstorm Warning', 'Severe'), true);
});

test('isLoudAlert: a watch (not a warning) is not loud', () => {
  assert.equal(isLoudAlert('Tornado Watch', 'Severe'), false);
});

test('isLoudAlert: an Extreme-severity alert is loud even if not tornado/tstorm', () => {
  assert.equal(isLoudAlert('Flash Flood Warning', 'Extreme'), true);
});

test('isLoudAlert: an ordinary advisory is not loud', () => {
  assert.equal(isLoudAlert('Frost Advisory', 'Minor'), false);
});

// ─── formatExpiry ────────────────────────────────────────────────

test('formatExpiry: future expiry reads "expires in ..."', () => {
  const now = new Date('2026-05-30T12:00:00Z').getTime();
  const iso = '2026-05-30T13:30:00Z'; // 90 min out
  assert.equal(formatExpiry(iso, now), 'expires in 1 hr');
});

test('formatExpiry: under an hour reads in minutes', () => {
  const now = new Date('2026-05-30T12:00:00Z').getTime();
  const iso = '2026-05-30T12:45:00Z';
  assert.equal(formatExpiry(iso, now), 'expires in 45 min');
});

test('formatExpiry: past expiry reads "expired"', () => {
  const now = new Date('2026-05-30T12:00:00Z').getTime();
  const iso = '2026-05-30T11:00:00Z';
  assert.equal(formatExpiry(iso, now), 'expired');
});

test('formatExpiry: missing timestamp is handled gracefully', () => {
  const now = Date.now();
  assert.equal(formatExpiry(null, now), 'no expiry given');
  assert.equal(formatExpiry(undefined, now), 'no expiry given');
});

// ─── normalizeAlerts ─────────────────────────────────────────────

test('normalizeAlerts: empty / missing input yields empty array', () => {
  assert.deepEqual(normalizeAlerts(null), []);
  assert.deepEqual(normalizeAlerts({}), []);
  assert.deepEqual(normalizeAlerts({ features: [] }), []);
});

test('normalizeAlerts: extracts the fields we render', () => {
  const data = geojson({
    id: 'urn:a',
    event: 'Tornado Warning',
    severity: 'Extreme',
    headline: 'Tornado Warning until 6 PM',
    description: 'A tornado was spotted near...',
    expires: '2026-05-30T18:00:00Z',
  });
  const [alert] = normalizeAlerts(data);
  assert.equal(alert.id, 'urn:a');
  assert.equal(alert.event, 'Tornado Warning');
  assert.equal(alert.severity, 'Extreme');
  assert.equal(alert.headline, 'Tornado Warning until 6 PM');
  assert.equal(alert.description, 'A tornado was spotted near...');
  assert.equal(alert.expires, '2026-05-30T18:00:00Z');
  assert.equal(alert.loud, true);
});

test('normalizeAlerts: falls back to ends when expires is absent', () => {
  const data = geojson({
    id: 'urn:b',
    event: 'Flood Warning',
    severity: 'Moderate',
    ends: '2026-05-30T20:00:00Z',
  });
  const [alert] = normalizeAlerts(data);
  assert.equal(alert.expires, '2026-05-30T20:00:00Z');
});

test('normalizeAlerts: sorts most severe first', () => {
  const data = geojson(
    { id: 'minor', event: 'Frost Advisory', severity: 'Minor' },
    { id: 'extreme', event: 'Tornado Warning', severity: 'Extreme' },
    { id: 'moderate', event: 'Flood Warning', severity: 'Moderate' },
    { id: 'severe', event: 'Severe Thunderstorm Warning', severity: 'Severe' },
  );
  const ids = normalizeAlerts(data).map((a) => a.id);
  assert.deepEqual(ids, ['extreme', 'severe', 'moderate', 'minor']);
});

test('normalizeAlerts: stable for equal severity (preserves API order)', () => {
  const data = geojson(
    { id: 'first', event: 'Flood Warning', severity: 'Moderate' },
    { id: 'second', event: 'Flood Advisory', severity: 'Moderate' },
  );
  const ids = normalizeAlerts(data).map((a) => a.id);
  assert.deepEqual(ids, ['first', 'second']);
});

test('normalizeAlerts: missing event/headline degrade to safe defaults', () => {
  const data = geojson({ id: 'urn:c', severity: 'Minor' });
  const [alert] = normalizeAlerts(data);
  assert.equal(alert.event, 'Weather Alert');
  assert.equal(alert.headline, '');
  assert.equal(alert.description, '');
});
