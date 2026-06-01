/* ─── Theme state ──────────────────────────────────────────────────
 * Pure helpers for the three-state theme (system / light / dark). No DOM, no
 * localStorage — callers own persistence + the document attribute.
 *
 * The FOUC inline script in index.html reimplements this rule by hand (it must
 * run before any module loads, so it can't import here). If THEME_STATES
 * changes, update that script too or it silently won't apply the new state.
 * ──────────────────────────────────────────────────────────────── */

export const THEME_STATES = ['system', 'light', 'dark'];

// Coerce any stored/incoming value to a known state. Unknown or stale values
// collapse to 'system' — the safe default that defers to the OS preference.
export function normalizeTheme(value) {
  return THEME_STATES.includes(value) ? value : 'system';
}

// The data-theme attribute value for a state, or null when the attribute
// should be removed entirely (system = no override, defer to @media).
export function themeAttr(state) {
  const normalized = normalizeTheme(state);
  return normalized === 'system' ? null : normalized;
}
