import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newAlerts,
  pruneSeenIds,
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

// ─── pruneSeenIds (persistence shape) ────────────────────────────

test('pruneSeenIds: seeds the store with the current ids', () => {
  const pruned = pruneSeenIds([alert('a'), alert('b')]);
  assert.deepEqual([...pruned].sort(), ['a', 'b']);
});

test('pruneSeenIds: keeps only ids still active so the store does not grow forever', () => {
  // Only the active alerts' ids survive — re-firing is fine if a dropped
  // alert ever returns, and we avoid an unbounded store.
  const pruned = pruneSeenIds([alert('a'), alert('b')]);
  assert.deepEqual([...pruned].sort(), ['a', 'b']);
});

test('pruneSeenIds: ignores alerts without an id', () => {
  const pruned = pruneSeenIds([alert('a'), { event: 'no id' }]);
  assert.deepEqual([...pruned], ['a']);
});

// ─── exported storage keys ───────────────────────────────────────

test('storage keys are namespaced strings', () => {
  assert.equal(typeof NOTIFY_PREF_KEY, 'string');
  assert.equal(typeof SEEN_IDS_KEY, 'string');
  assert.notEqual(NOTIFY_PREF_KEY, SEEN_IDS_KEY);
});
