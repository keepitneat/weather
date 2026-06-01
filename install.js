/* ─── PWA install affordance (pure logic) ──────────────────────────
 * Platform detection + the install-state machine. No DOM, no events —
 * app.js owns the beforeinstallprompt capture, the .prompt() call, and
 * the menu wiring; this module just decides WHAT the UI should show.
 *
 * Gotchas this logic encodes: only Safari can add a PWA on iOS (Chrome/
 * Firefox on iOS are WebKit but have no install path); Chrome/Edge/Chromium
 * carry "Safari" in their macOS UA so they must be excluded from the Safari
 * branch; and an already-installed (standalone) app has nothing to offer.
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

// Firefox on Android can install a PWA from its ⋮ menu. iOS Firefox (FxiOS)
// can't, and Chromium Android uses beforeinstallprompt instead — both excluded.
export function isFirefoxAndroid(userAgent) {
  const ua = userAgent || '';
  return /Android/.test(ua) && /Firefox/.test(ua);
}

// Safari on macOS (Sonoma+) installs via File → Add to Dock. Chrome, Edge, and
// other Chromium browsers also carry "Safari" in their UA, so exclude them.
export function isMacosSafari(userAgent) {
  const ua = userAgent || '';
  if (!/Macintosh/.test(ua) || !/Safari/.test(ua)) return false;
  return !/Chrome|Chromium|Edg/.test(ua);
}

// Already installed: Chromium/desktop report it via the standalone display
// mode; iOS Safari reports it via the legacy navigator.standalone flag.
export function isStandalone({ displayModeStandalone = false, navigatorStandalone = false } = {}) {
  return Boolean(displayModeStandalone || navigatorStandalone);
}

// What the settings menu should render, given the detected platform + whether
// a beforeinstallprompt event has been stashed. Priority order matters:
//   'none'                          — installed, or a browser with no install path
//   'install-button'                — Chromium stashed a prompt; one tap installs
//   'ios-instructions'              — Share → Add to Home Screen
//   'firefox-android-instructions'  — ⋮ menu → Install
//   'macos-safari-instructions'     — File → Add to Dock
// A stashed prompt is the only actionable signal, so it wins over the manual
// branches; the manual branches are mutually exclusive in any real UA.
export function installAffordance({
  standalone,
  iosSafari,
  firefoxAndroid,
  macosSafari,
  promptAvailable,
}) {
  if (standalone) return 'none';
  if (promptAvailable) return 'install-button';
  if (iosSafari) return 'ios-instructions';
  if (firefoxAndroid) return 'firefox-android-instructions';
  if (macosSafari) return 'macos-safari-instructions';
  return 'none';
}
