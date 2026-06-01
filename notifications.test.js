import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newAlerts,
  mergeSeenIds,
  NOTIFY_PREF_KEY,
  SEEN_IDS_KEY,
} from './notifications.js';

const alert = (id, over = {}) => ({
  id,
  event: 'Tornado Warning',
  headline: 'Take cover now',
  ...over,
});

// ─── newAlerts (the seen-ID diff) ────────────────────────────────

test('newAlerts: everything is new when nothing has been seen', () => {
  const alerts = [alert('a'), alert('b')];
  assert.deepEqual(
    newAlerts(alerts, []).map((a) => a.id),
    ['a', 'b'],
  );
});

test('newAlerts: filters out alerts whose id was already seen', () => {
  const alerts = [alert('a'), alert('b'), alert('c')];
  const seen = ['a', 'c'];
  assert.deepEqual(
    newAlerts(alerts, seen).map((a) => a.id),
    ['b'],
  );
});

test('newAlerts: nothing new when every id has been seen', () => {
  const alerts = [alert('a'), alert('b')];
  assert.deepEqual(newAlerts(alerts, ['a', 'b']), []);
});

test('newAlerts: accepts a Set of seen ids', () => {
  const alerts = [alert('a'), alert('b')];
  assert.deepEqual(
    newAlerts(alerts, new Set(['a'])).map((a) => a.id),
    ['b'],
  );
});

test('newAlerts: empty / missing alert list yields nothing', () => {
  assert.deepEqual(newAlerts([], ['a']), []);
  assert.deepEqual(newAlerts(null, ['a']), []);
  assert.deepEqual(newAlerts(undefined, []), []);
});

test('newAlerts: skips alerts with no id (can\'t de-dupe them safely)', () => {
  const alerts = [alert('a'), { event: 'No id alert' }, alert('b')];
  assert.deepEqual(
    newAlerts(alerts, []).map((a) => a.id),
    ['a', 'b'],
  );
});

// ─── mergeSeenIds (persistence shape) ────────────────────────────

test('mergeSeenIds: seeds an empty store with the current ids', () => {
  const merged = mergeSeenIds([], [alert('a'), alert('b')]);
  assert.deepEqual([...merged].sort(), ['a', 'b']);
});

test('mergeSeenIds: prunes ids no longer active so the store does not grow forever', () => {
  // 'old' is gone from the active set, so it should drop out — re-firing is
  // fine if that same alert ever returns, and we avoid an unbounded store.
  const merged = mergeSeenIds(['old', 'a'], [alert('a'), alert('b')]);
  assert.deepEqual([...merged].sort(), ['a', 'b']);
});

test('mergeSeenIds: ignores alerts without an id', () => {
  const merged = mergeSeenIds([], [alert('a'), { event: 'no id' }]);
  assert.deepEqual([...merged], ['a']);
});

// ─── exported storage keys ───────────────────────────────────────

test('storage keys are namespaced strings', () => {
  assert.equal(typeof NOTIFY_PREF_KEY, 'string');
  assert.equal(typeof SEEN_IDS_KEY, 'string');
  assert.notEqual(NOTIFY_PREF_KEY, SEEN_IDS_KEY);
});
