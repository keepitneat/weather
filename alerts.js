/* ─── Just the Weather — alerts logic ─────────────────────────────
 * Pure logic for active NWS weather alerts: severity ranking, the
 * "loud" heuristic (tornado / severe-thunderstorm warnings + anything
 * Extreme), expiry formatting, and normalizing the NWS GeoJSON feed
 * into the small view-model app.js renders.
 *
 * No DOM here — renderAlerts() lives in app.js. Keeping this module
 * DOM-free is what lets node:test exercise it without a browser.
 * ──────────────────────────────────────────────────────────────── */

// NWS `severity` enum, most-severe first. (There's also "Unknown" in the
// schema, but it's not a styled tier — it sorts after Minor.)
export const ALERT_SEVERITIES = ['Extreme', 'Severe', 'Moderate', 'Minor'];

// Lower rank = more severe = sorts first. Unrecognized / missing severity
// (incl. "Unknown") lands past every named tier so it sorts last.
export function severityRank(severity) {
  const i = ALERT_SEVERITIES.indexOf(severity);
  return i === -1 ? ALERT_SEVERITIES.length : i;
}

// "Loud" = the alert gets the can't-miss-it styling.
// Two triggers: (1) a tornado or severe-thunderstorm WARNING (watches/
// advisories don't qualify — they're a heads-up, not an it's-happening),
// or (2) any Extreme-severity alert regardless of event type.
export function isLoudAlert(event, severity) {
  if (severity === 'Extreme') return true;
  const e = (event || '').toLowerCase();
  if (!e.includes('warning')) return false;
  return e.includes('tornado') || e.includes('severe thunderstorm');
}

// Relative expiry for the banner. NWS gives ISO timestamps; we render
// "expires in 45 min" / "expires in 2 hr" and "expired" once it's past.
// Under an hour reads in minutes; an hour or more floors to whole hours
// (so 90 min reads "1 hr" — deliberately coarse, the banner isn't a clock).
export function formatExpiry(iso, now = Date.now()) {
  if (!iso) return 'no expiry given';
  const expires = new Date(iso).getTime();
  if (Number.isNaN(expires)) return 'no expiry given';
  const remainingMs = expires - now;
  if (remainingMs <= 0) return 'expired';
  const minutes = Math.floor(remainingMs / 60000);
  if (minutes < 60) return `expires in ${minutes} min`;
  return `expires in ${Math.floor(minutes / 60)} hr`;
}

// The precise local "expires at" behind the coarse relative label — shown on
// hover (title) and tap-to-reveal. Returns '' when there's no usable
// timestamp; the relative label already says "no expiry given" in that case.
export function formatExpiryExact(iso) {
  if (!iso) return '';
  const expires = new Date(iso);
  if (Number.isNaN(expires.getTime())) return '';
  return expires.toLocaleString([], {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

// Turn the NWS active-alerts GeoJSON into the sorted view-model app.js
// renders. Most severe first; equal severity keeps API order (stable).
export function normalizeAlerts(data) {
  const features = data?.features;
  if (!Array.isArray(features) || features.length === 0) return [];

  const alerts = features.map((f, index) => {
    const p = f?.properties ?? {};
    const event = p.event || 'Weather Alert';
    const severity = p.severity ?? null;
    // First http(s) candidate becomes the "view full alert" link. NWS stamps
    // the canonical URL on both `f.id` and `properties.@id`; null when neither
    // is a real URL (e.g. simulated/local data), so the link just doesn't show.
    const url =
      [f?.id, p['@id']].find(
        (u) => typeof u === 'string' && /^https?:\/\//.test(u),
      ) ?? null;
    return {
      // `f.id` is the canonical URN; fall back to properties.id, then index.
      id: f?.id ?? p.id ?? `alert-${index}`,
      event,
      severity,
      headline: p.headline || '',
      description: p.description || '',
      // `expires` is when the alert text lapses; `ends` is the event end.
      // Prefer expires, fall back to ends.
      expires: p.expires || p.ends || null,
      url,
      loud: isLoudAlert(event, severity),
      _index: index,
    };
  });

  alerts.sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    return bySeverity !== 0 ? bySeverity : a._index - b._index;
  });

  // Drop the sort-only field so the view-model stays clean.
  return alerts.map(({ _index, ...alert }) => alert);
}
