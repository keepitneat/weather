/* ─── Theme state ──────────────────────────────────────────────────
 * Pure helpers for the three-state theme (system / light / dark).
 * No DOM, no localStorage here — callers own persistence + the document
 * attribute. Kept separate so the FOUC inline script and app.js agree on
 * what a valid theme value is.
 * ──────────────────────────────────────────────────────────────── */

export const THEME_STATES = ['system', 'light', 'dark'];

// Coerce any stored/incoming value to a known state. Unknown, null, or a
// stale value all collapse to 'system' — the safe default that defers to the
// OS preference.
export function normalizeTheme(value) {
  return THEME_STATES.includes(value) ? value : 'system';
}

// The data-theme attribute value for a state, or null when the attribute
// should be removed entirely (system = no override, defer to @media).
export function themeAttr(state) {
  const normalized = normalizeTheme(state);
  return normalized === 'system' ? null : normalized;
}
