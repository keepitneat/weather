/* ─── PWA install affordance (pure logic) ──────────────────────────
 * Platform detection + the install-state machine. No DOM, no events —
 * app.js owns the prompt capture and menu wiring; this decides what to show.
 * ──────────────────────────────────────────────────────────────── */

// iOS Safari only — iOS Chrome (CriOS) / Firefox (FxiOS) are WebKit but can't
// add to the home screen. Modern iPadOS Safari reports a Macintosh UA with no
// iPad token, so a touch-capable Macintosh is treated as iPadOS (heuristic).
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

// Safari on macOS (Sonoma+) installs via File → Add to Dock. Chrome/Edge/other
// Chromium also carry "Safari" in their UA, so they're excluded (a denylist —
// an odd Chromium fork stripping the Chrome token could slip through).
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

// What the settings menu should render. A stashed prompt wins over the manual
// branches (it's the only actionable signal); the manual branches are mutually
// exclusive in any real UA.
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
