/* ─── Theme state ──────────────────────────────────────────────────
 * Pure helpers for the three-state theme (system / light / dark).
 * No DOM, no localStorage here — callers own persistence + the document
 * attribute.
 *
 * The FOUC inline script in index.html can't import this module (it must run
 * before any module loads), so it reimplements the "is this a real override?"
 * rule by hand (`saved && saved !== 'system'`). That duplication is
 * intentional — there's no build step to generate one from the other. If
 * THEME_STATES ever changes (e.g. a 'dark-dim' value), update the inline
 * script to match, or it silently won't apply the new state.
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
