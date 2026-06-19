import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  severityRank,
  isLoudAlert,
  formatExpiry,
  formatExpiryExact,
  normalizeAlerts,
  reflowAlertText,
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

// ─── formatExpiryExact ───────────────────────────────────────────

test('formatExpiryExact: empty / invalid timestamps yield empty string', () => {
  assert.equal(formatExpiryExact(null), '');
  assert.equal(formatExpiryExact(undefined), '');
  assert.equal(formatExpiryExact('not-a-date'), '');
});

test('formatExpiryExact: a valid timestamp renders a non-empty local string', () => {
  // Locale/TZ-dependent output, so we only assert it produced something.
  assert.ok(formatExpiryExact('2026-05-30T18:00:00Z').length > 0);
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

test('normalizeAlerts: captures an http(s) url for the "full alert" link', () => {
  const url = 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.abc.001.1';
  const [alert] = normalizeAlerts(geojson({ id: url, event: 'Tornado Warning' }));
  assert.equal(alert.url, url);
});

test('normalizeAlerts: falls back to properties.@id when feature id is not a url', () => {
  const url = 'https://api.weather.gov/alerts/urn:oid:xyz';
  const data = { features: [{ id: 'urn:oid:xyz', properties: { '@id': url } }] };
  const [alert] = normalizeAlerts(data);
  assert.equal(alert.url, url);
});

test('normalizeAlerts: url is null when there is no http(s) candidate', () => {
  const [alert] = normalizeAlerts(geojson({ id: 'sim-tornado', event: 'Tornado Warning' }));
  assert.equal(alert.url, null);
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

test('normalizeAlerts: when NWS omits an id, derives a content-stable id (not positional)', () => {
  // No feature id and no properties.id — the fallback must not be index-based.
  const props = {
    event: 'Tornado Warning',
    expires: '2026-05-30T18:00:00Z',
    areaDesc: 'Dane County',
    headline: 'Tornado Warning until 6 PM',
  };
  const data = { features: [{ properties: props }] };
  const [alert] = normalizeAlerts(data);
  assert.equal(typeof alert.id, 'string');
  assert.ok(alert.id.length > 0);
  // Stable across calls: identical content yields the same id.
  const [again] = normalizeAlerts({ features: [{ properties: { ...props } }] });
  assert.equal(alert.id, again.id);
});

test('normalizeAlerts: different alert content yields different stable ids', () => {
  const a = { features: [{ properties: { event: 'Tornado Warning', expires: '2026-05-30T18:00:00Z', areaDesc: 'Dane County' } }] };
  const b = { features: [{ properties: { event: 'Flood Warning', expires: '2026-05-30T18:00:00Z', areaDesc: 'Dane County' } }] };
  const [alertA] = normalizeAlerts(a);
  const [alertB] = normalizeAlerts(b);
  assert.notEqual(alertA.id, alertB.id);
});

// ─── reflowAlertText ─────────────────────────────────────────────

test('reflowAlertText: collapses a single mid-sentence newline to a space', () => {
  assert.equal(reflowAlertText('east central\nWisconsin'), 'east central Wisconsin');
});

test('reflowAlertText: preserves a blank-line paragraph break', () => {
  assert.equal(reflowAlertText('A.\n\nB.'), 'A.\n\nB.');
});

test('reflowAlertText: collapses 3+ newlines to a single paragraph break', () => {
  assert.equal(reflowAlertText('A.\n\n\nB.'), 'A.\n\nB.');
});

test('reflowAlertText: normalizes CRLF', () => {
  assert.equal(reflowAlertText('a\r\nb'), 'a b');
});

test('reflowAlertText: empty / undefined yield empty string', () => {
  assert.equal(reflowAlertText(''), '');
  assert.equal(reflowAlertText(undefined), '');
  assert.equal(reflowAlertText(null), '');
});

test('reflowAlertText: keeps * bullet lines on their own line', () => {
  assert.equal(
    reflowAlertText('intro text\n* WHAT...rain\n* WHERE...here'),
    'intro text\n* WHAT...rain\n* WHERE...here',
  );
});

test('reflowAlertText: keeps a - sub-item line on its own line', () => {
  assert.equal(
    reflowAlertText('this\nevening.\n- http://x'),
    'this evening.\n- http://x',
  );
});

test('reflowAlertText: still reflows the wrapped sentence inside a bullet', () => {
  assert.equal(
    reflowAlertText('* WHAT...Heavy rain expected across\neast central Wisconsin'),
    '* WHAT...Heavy rain expected across east central Wisconsin',
  );
});

test('reflowAlertText: tidies doubled spaces to one', () => {
  assert.equal(reflowAlertText('a  b'), 'a b');
});

test('normalizeAlerts: stable fallback id is independent of position', () => {
  // Same alert content at different indices must keep the same id, so the
  // seen-id dedup tracks identity rather than array position.
  const tornado = { event: 'Tornado Warning', severity: 'Extreme', expires: '2026-05-30T18:00:00Z', areaDesc: 'Dane County' };
  const flood = { event: 'Flood Warning', severity: 'Minor', expires: '2026-05-30T20:00:00Z', areaDesc: 'Rock County' };
  const first = normalizeAlerts({ features: [{ properties: tornado }, { properties: flood }] });
  const second = normalizeAlerts({ features: [{ properties: flood }, { properties: tornado }] });
  const floodFirst = first.find((a) => a.event === 'Flood Warning');
  const floodSecond = second.find((a) => a.event === 'Flood Warning');
  assert.equal(floodFirst.id, floodSecond.id);
});
