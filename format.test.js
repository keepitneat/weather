/* ─── Formatting helper tests ─────────────────────────────────────
 * Run with: node --test
 * ──────────────────────────────────────────────────────────────── */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { titleCase } from './format.js';

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
