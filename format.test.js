/* ─── Formatting helper tests ─────────────────────────────────────
 * Run with: node --test
 * ──────────────────────────────────────────────────────────────── */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { titleCase, shortStationName } from './format.js';

test('titleCase: title-cases human-readable names', () => {
  assert.equal(titleCase('MADISON DANE CO REGIONAL AIRPORT'), 'Madison Dane Co Regional Airport');
  assert.equal(titleCase('central park'), 'Central Park');
});

test('titleCase: leaves short ICAO-style station IDs untouched', () => {
  // "KMSN" must not become "Kmsn" — these read as acronyms, not words.
  assert.equal(titleCase('KMSN'), 'KMSN');
  assert.equal(titleCase('KORD'), 'KORD');
  assert.equal(titleCase('K3LF'), 'K3LF');
  assert.equal(titleCase('KNYC'), 'KNYC');
});

test('titleCase: does not treat ordinary short words as IDs', () => {
  // Lowercase / mixed-case short strings are real words, not ICAO IDs.
  assert.equal(titleCase('park'), 'Park');
  assert.equal(titleCase('Park'), 'Park');
});

test('titleCase: handles empty / nullish input safely', () => {
  assert.equal(titleCase(''), '');
  assert.equal(titleCase(null), '');
  assert.equal(titleCase(undefined), '');
});

test('shortStationName: empty / nullish → empty string', () => {
  assert.equal(shortStationName(''), '');
  assert.equal(shortStationName(null), '');
  assert.equal(shortStationName(undefined), '');
});

test('shortStationName: takes the first comma-segment, trimmed', () => {
  assert.equal(shortStationName('Truax Field, Dane County, WI'), 'Truax Field');
  assert.equal(shortStationName('  Central Park , NY '), 'Central Park');
});

test('shortStationName: caps a long single segment at 28 chars with an ellipsis', () => {
  assert.equal(shortStationName('Madison Dane County Regional-Truax Field'), 'Madison Dane County Regiona…');
  assert.equal(shortStationName('b'.repeat(28)), 'b'.repeat(28)); // exactly 28 kept whole
  assert.equal(shortStationName('b'.repeat(29)), `${'b'.repeat(27)}…`);
});
