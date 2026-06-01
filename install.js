/* ─── PWA install affordance (pure logic) ──────────────────────────
 * Platform detection + the install-state machine. No DOM, no events —
 * app.js owns the beforeinstallprompt capture, the .prompt() call, and
 * the menu wiring; this module just decides WHAT the UI should show.
 *
 * Gotchas this logic encodes: only Safari can add a PWA on iOS (Chrome/
 * Firefox on iOS are WebKit but have no install path), and an already-
 * installed (standalone) app has nothing to offer.
 * ──────────────────────────────────────────────────────────────── */

// iOS Safari only — iOS Chrome (CriOS) and Firefox (FxiOS) are WebKit but
// can't add to the home screen, so they're explicitly excluded.
export function isIosSafari(userAgent) {
  const ua = userAgent || '';
  const isIos = /iPhone|iPad|iPod/.test(ua);
  if (!isIos) return false;
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return !isOtherIosBrowser;
}

// Already installed: Chromium/desktop report it via the standalone display
// mode; iOS Safari reports it via the legacy navigator.standalone flag.
export function isStandalone({ displayModeStandalone = false, navigatorStandalone = false } = {}) {
  return Boolean(displayModeStandalone || navigatorStandalone);
}

// What the settings menu should render, given the detected platform + whether
// a beforeinstallprompt event has been stashed:
//   'none'             — no affordance (installed, or an unsupported browser
//                        that hasn't fired beforeinstallprompt)
//   'ios-instructions' — manual Share → Add to Home Screen steps
//   'install-button'   — a button that triggers the stashed prompt
export function installAffordance({ standalone, iosSafari, promptAvailable }) {
  if (standalone) return 'none';
  if (promptAvailable) return 'install-button';
  if (iosSafari) return 'ios-instructions';
  return 'none';
}
