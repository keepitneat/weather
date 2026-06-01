/* ─── Alert icon routing tests ────────────────────────────────────
 * Run with: node --test
 * Covers alertIconFor()'s event-name → icon mapping (the keyword router,
 * not the SVG markup itself). The weather iconFor() router predates tests.
 * ──────────────────────────────────────────────────────────────── */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ALERT_ICONS, alertIconFor } from './icons.js';

test('alertIconFor: routes the headline event types', () => {
  assert.equal(alertIconFor('Tornado Warning'), ALERT_ICONS.tornado);
  assert.equal(alertIconFor('Severe Thunderstorm Warning'), ALERT_ICONS.thunderstorm);
  assert.equal(alertIconFor('Flood Watch'), ALERT_ICONS.flood);
  assert.equal(alertIconFor('Flash Flood Warning'), ALERT_ICONS.flood);
  assert.equal(alertIconFor('Heat Advisory'), ALERT_ICONS.heat);
  assert.equal(alertIconFor('High Wind Warning'), ALERT_ICONS.wind);
  assert.equal(alertIconFor('Winter Storm Warning'), ALERT_ICONS.winter);
  assert.equal(alertIconFor('Red Flag Warning'), ALERT_ICONS.fire);
  assert.equal(alertIconFor('Dense Fog Advisory'), ALERT_ICONS.fog);
});

test('alertIconFor: case-insensitive', () => {
  assert.equal(alertIconFor('tornado warning'), ALERT_ICONS.tornado);
});

test('alertIconFor: cold events route to the winter icon, not wind', () => {
  // "Wind Chill" contains "wind" but is a cold event — winter wins by order.
  assert.equal(alertIconFor('Wind Chill Advisory'), ALERT_ICONS.winter);
});

test('alertIconFor: unrecognized / missing events fall back to the warning triangle', () => {
  assert.equal(alertIconFor('Civil Emergency Message'), ALERT_ICONS.warning);
  assert.equal(alertIconFor(''), ALERT_ICONS.warning);
  assert.equal(alertIconFor(null), ALERT_ICONS.warning);
  assert.equal(alertIconFor(undefined), ALERT_ICONS.warning);
});
