/* ─── Location menu / chip markup builder tests ───────────────────
 * Run with: node --test
 * Covers the PURE string-builders extracted from app.js: chipMarkup,
 * menuMarkup, searchMarkup. These are data-in → HTML-string-out, with
 * no DOM access, so they run straight in Node. The DOM wiring (open/
 * close/focus, delegated listeners, the switch/save/remove handlers)
 * stays in app.js and is not covered here.
 * ──────────────────────────────────────────────────────────────── */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { UI_ICONS } from './icons.js';
import { chipMarkup, menuMarkup, searchMarkup } from './location-menu.js';

test('menuMarkup: home/current-location item is present and active when no favorite is selected', () => {
  const html = menuMarkup({ favorites: [], activeFavoriteId: null, canSave: false });
  assert.match(html, /data-home="true"/);
  assert.match(html, /Current location/);
  // active marker on the home item
  assert.match(html, /loc-item--active/);
  assert.match(html, /class="check"[^>]*>✓</);
  // search item + separator present
  assert.match(html, /data-search="true"/);
  assert.match(html, /Search a place…/);
  assert.match(html, /loc-menu-sep/);
  // no save item when canSave is false
  assert.doesNotMatch(html, /data-save/);
});

test('menuMarkup: includes the Save item only when canSave is true', () => {
  const html = menuMarkup({ favorites: [], activeFavoriteId: null, canSave: true });
  assert.match(html, /data-save="true"/);
  assert.match(html, /Save this location/);
});

test('menuMarkup: renders each favorite with a select button and a remove button', () => {
  const favorites = [
    { id: 'a', label: 'Mom' },
    { id: 'b', label: 'Work' },
  ];
  const html = menuMarkup({ favorites, activeFavoriteId: 'a', canSave: false });

  // both favorites render
  assert.match(html, /data-favorite-id="a"/);
  assert.match(html, /data-favorite-id="b"/);
  assert.match(html, />Mom</);
  assert.match(html, />Work</);

  // each has a remove button with an aria-label including the label
  assert.match(html, /data-remove-id="a"[^>]*aria-label="Remove Mom"/);
  assert.match(html, /data-remove-id="b"[^>]*aria-label="Remove Work"/);

  // the active favorite (a) carries the active class on its select button
  assert.match(html, /class="loc-item loc-item--active" type="button" data-favorite-id="a"/);
  // the non-active favorite (b) does not
  assert.match(html, /class="loc-item" type="button" data-favorite-id="b"/);

  // home is NOT active when a favorite is selected
  assert.match(html, /class="loc-item" type="button" data-home="true"/);
  assert.doesNotMatch(html, /loc-item--active" type="button" data-home/);
});

test('menuMarkup: escapes favorite labels (XSS safety)', () => {
  const favorites = [{ id: 'x', label: '<img src=x onerror=alert(1)>' }];
  const html = menuMarkup({ favorites, activeFavoriteId: null, canSave: false });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test('chipMarkup: current location shows the pin icon, escaped name, and caret', () => {
  const html = chipMarkup({ isCurrent: true, name: 'Madison, WI' });
  assert.match(html, /loc-chip/);
  assert.ok(html.includes(UI_ICONS.pin), 'should include the pin SVG');
  assert.ok(!html.includes(UI_ICONS.star), 'should not include the star SVG');
  assert.match(html, /Madison, WI/);
  assert.match(html, /class="caret"[^>]*>▾</);
  assert.match(html, /aria-haspopup="true"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="location-menu"/);
});

test('chipMarkup: a saved favorite shows the star icon (not the pin)', () => {
  const html = chipMarkup({ isCurrent: false, name: 'Mom' });
  assert.ok(html.includes(UI_ICONS.star), 'should include the star SVG');
  assert.ok(!html.includes(UI_ICONS.pin), 'should not include the pin SVG');
});

test('chipMarkup: escapes the location name (XSS safety)', () => {
  const html = chipMarkup({ isCurrent: true, name: '<img src=x onerror=alert(1)>' });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test('searchMarkup: renders the input, Go button, hint, and error element', () => {
  const html = searchMarkup();
  assert.match(html, /id="loc-menu-input"/);
  assert.match(html, /id="loc-menu-go"/);
  assert.match(html, /loc-menu-hint/);
  assert.match(html, /id="loc-menu-error"/);
});
