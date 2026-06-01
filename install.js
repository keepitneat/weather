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
// Modern iPadOS Safari reports a Macintosh UA with no iPad token; a touch-capable
// Macintosh is treated as iPadOS. Heuristic, not bulletproof: a touch-capable Mac
// could in theory report touch points and route here too.
export function isIosSafari(userAgent, isTouchDevice = false) {
  const ua = userAgent || '';
  const isLegacyIos = /iPhone|iPad|iPod/.test(ua);
  const isMaskedIpad = /Macintosh/.test(ua) && isTouchDevice;
  if (!isLegacyIos && !isMaskedIpad) return false;
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS/.test(ua);
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
// Two known false-positive surfaces: a touch-capable Macintosh is iPadOS (routed
// to the iOS branch, excluded here), and the Chromium exclusion is a denylist —
// an odd Chromium fork or a macOS in-app webview that strips the Chrome token
// would slip through to the Add-to-Dock steps it can't honor.
export function isMacosSafari(userAgent, isTouchDevice = false) {
  const ua = userAgent || '';
  if (!/Macintosh/.test(ua) || !/Safari/.test(ua)) return false;
  if (isTouchDevice) return false;
  return !/Chrome|Chromium|Edg/.test(ua);
}

// Already installed: Chromium/desktop report it via the standalone display
// mode; iOS Safari reports it via the legacy navigator.standalone flag.
export function isStandalone({ displayModeStandalone = false, navigatorStandalone = false } = {}) {
  return Boolean(displayModeStandalone || navigatorStandalone);
}

// What the settings menu should render, given the detected platform + whether
// a beforeinstallprompt event has been stashed. A stashed prompt wins over the
// manual branches because it's the only actionable signal; the manual branches
// are mutually exclusive in any real UA.
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
