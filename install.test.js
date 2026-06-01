import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isIosSafari, isStandalone, installAffordance } from './install.js';

// ─── isIosSafari ─────────────────────────────────────────────────

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
// iOS Chrome / Firefox use WebKit under the hood but can't add PWAs — only
// Safari can — so they must NOT count as iOS Safari.
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1';
const IPHONE_FIREFOX =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/125.0 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

test('isIosSafari: true for iPhone and iPad Safari', () => {
  assert.equal(isIosSafari(IPHONE_SAFARI), true);
  assert.equal(isIosSafari(IPAD_SAFARI), true);
});

test('isIosSafari: false for iOS Chrome and iOS Firefox (no PWA install there)', () => {
  assert.equal(isIosSafari(IPHONE_CHROME), false);
  assert.equal(isIosSafari(IPHONE_FIREFOX), false);
});

test('isIosSafari: false for desktop / Android / Mac Safari', () => {
  assert.equal(isIosSafari(DESKTOP_CHROME), false);
  assert.equal(isIosSafari(ANDROID_CHROME), false);
  assert.equal(isIosSafari(MAC_SAFARI), false);
});

test('isIosSafari: false for missing / empty UA', () => {
  assert.equal(isIosSafari(undefined), false);
  assert.equal(isIosSafari(''), false);
});

// ─── isStandalone ────────────────────────────────────────────────

test('isStandalone: true when display-mode: standalone matches', () => {
  assert.equal(isStandalone({ displayModeStandalone: true, navigatorStandalone: false }), true);
});

test('isStandalone: true when iOS navigator.standalone is set', () => {
  assert.equal(isStandalone({ displayModeStandalone: false, navigatorStandalone: true }), true);
});

test('isStandalone: false in a normal browser tab', () => {
  assert.equal(isStandalone({ displayModeStandalone: false, navigatorStandalone: false }), false);
  assert.equal(isStandalone({}), false);
});

// ─── installAffordance (the state machine) ───────────────────────

test('installAffordance: installed → none (nothing to do)', () => {
  assert.equal(
    installAffordance({ standalone: true, iosSafari: true, promptAvailable: false }),
    'none'
  );
  assert.equal(
    installAffordance({ standalone: true, iosSafari: false, promptAvailable: true }),
    'none'
  );
});

test('installAffordance: iOS Safari (not installed) → ios-instructions', () => {
  assert.equal(
    installAffordance({ standalone: false, iosSafari: true, promptAvailable: false }),
    'ios-instructions'
  );
});

test('installAffordance: Chromium with a stashed prompt → install-button', () => {
  assert.equal(
    installAffordance({ standalone: false, iosSafari: false, promptAvailable: true }),
    'install-button'
  );
});

test('installAffordance: Chromium before the prompt fires → none', () => {
  assert.equal(
    installAffordance({ standalone: false, iosSafari: false, promptAvailable: false }),
    'none'
  );
});

test('installAffordance: install button wins over iOS branch if both somehow true', () => {
  // A real UA is never both, but the prompt is the stronger, actionable signal.
  assert.equal(
    installAffordance({ standalone: false, iosSafari: true, promptAvailable: true }),
    'install-button'
  );
});
