/* ─── Alert icon routing tests ────────────────────────────────────
 * Run with: node --test
 * Covers alertIconFor()'s event-name → icon mapping (the keyword router,
 * not the SVG markup itself). The weather iconFor() router predates tests.
 * ──────────────────────────────────────────────────────────────── */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WEATHER_ICONS, iconFor, ALERT_ICONS, alertIconFor } from './icons.js';

test('iconFor: forecast strings route to the expected icon', () => {
  assert.equal(iconFor('Severe Thunderstorm', true), WEATHER_ICONS.thunderstorm);
  assert.equal(iconFor('Light Rain', true), WEATHER_ICONS.rain);
  assert.equal(iconFor('Rain Showers', true), WEATHER_ICONS.rain);
  assert.equal(iconFor('Heavy Snow', true), WEATHER_ICONS.snow);
  assert.equal(iconFor('Patchy Fog', true), WEATHER_ICONS.fog);
  assert.equal(iconFor('Sunny', true), WEATHER_ICONS.sun);
  assert.equal(iconFor('Clear', false), WEATHER_ICONS.moon);
});

test('iconFor: observation textDescription values route sensibly', () => {
  // NWS observation strings differ from forecast shortForecasts — these are
  // the ones that were slipping through to the wrong icon.
  assert.equal(iconFor('Fair', true), WEATHER_ICONS.sun);
  assert.equal(iconFor('Fair', false), WEATHER_ICONS.moon);
  assert.equal(iconFor('A Few Clouds', true), WEATHER_ICONS['partly-cloudy-day']);
  assert.equal(iconFor('A Few Clouds', false), WEATHER_ICONS['partly-cloudy-night']);
  assert.equal(iconFor('Mostly Clear', false), WEATHER_ICONS['partly-cloudy-night']);
  assert.equal(iconFor('Partly Cloudy', true), WEATHER_ICONS['partly-cloudy-day']);
  assert.equal(iconFor('Mostly Cloudy', true), WEATHER_ICONS.cloudy);
  assert.equal(iconFor('Mostly Cloudy and Breezy', true), WEATHER_ICONS.cloudy);
  assert.equal(iconFor('Overcast', true), WEATHER_ICONS.cloudy);
  assert.equal(iconFor('Haze', true), WEATHER_ICONS.fog);
});

test('iconFor: missing / unrecognized forecast falls back to sun or moon', () => {
  assert.equal(iconFor('', true), WEATHER_ICONS.sun);
  assert.equal(iconFor(null, false), WEATHER_ICONS.moon);
});

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
