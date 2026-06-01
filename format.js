/* ─── Formatting helpers ───────────────────────────────────────────
 * Pure string formatting, no DOM or storage. Kept separate so it's
 * unit-testable (app.js can't be imported in Node — it touches the DOM).
 * ──────────────────────────────────────────────────────────────── */

// Title-case a human-readable name, but leave ICAO-style station IDs alone.
// `station.name || station.stationIdentifier` feeds IDs like "KMSN" through
// here; title-casing turns them into "Kmsn" (reads as a misspelling), so guard
// short all-caps alphanumeric strings — they're acronyms, not words.
export function titleCase(str) {
  if (!str) return '';
  if (str.length <= 4 && /^[A-Z0-9]+$/.test(str)) return str;
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
