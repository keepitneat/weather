// NWS `severity` enum, most-severe first.
export const ALERT_SEVERITIES = ['Extreme', 'Severe', 'Moderate', 'Minor'];

// Lower rank = more severe = sorts first.
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

// The precise local "expires at" behind the coarse relative label — shown on hover (title) and tap-to-reveal.
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

// NWS hard-wraps `description` at ~70 cols with single \n. Collapse those cosmetic
// single newlines to spaces, but KEEP blank-line (\n\n) paragraph breaks AND the
// single \n before a bullet/sub-item line (* / -), so the WHAT/WHERE/WHEN sections
// and dash sub-items stay on their own lines.
export function reflowAlertText(text) {
  if (!text) return '';
  const PARA = ''; // sentinel: meaningful paragraph break
  const LINE = ''; // sentinel: meaningful bullet/sub-item break
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, PARA) // protect paragraph breaks
    .replace(/\n(?=\s*[*-]\s)/g, LINE) // protect break before a * / - bullet line
    .replace(/\n/g, ' ') // collapse remaining single newlines
    .replace(new RegExp(PARA, 'g'), '\n\n')
    .replace(new RegExp(LINE, 'g'), '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n') // trim spaces around the kept breaks
    .trim();
}

// Content-stable fallback id for alerts NWS doesn't tag. A positional
// `alert-${index}` would make the seen-id dedup track array position, not
// identity; hashing the identifying fields keeps the id tied to content.
function stableAlertId(p) {
  const basis = [p.event, p.expires || p.ends, p.areaDesc, p.headline]
    .map((v) => v || '')
    .join('\u0000');
  // djb2 — small, dependency-free, and good enough for an identity key.
  let hash = 5381;
  for (let i = 0; i < basis.length; i++) {
    hash = ((hash << 5) + hash + basis.charCodeAt(i)) | 0;
  }
  return `alert-${(hash >>> 0).toString(36)}`;
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
    // First http(s) candidate becomes the "view full alert" link.
    const url =
      [f?.id, p['@id']].find(
        (u) => typeof u === 'string' && /^https?:\/\//.test(u),
      ) ?? null;
    return {
      // `f.id` is the canonical URN; fall back to properties.id, then a
      // content-stable hash (never positional — see stableAlertId).
      id: f?.id ?? p.id ?? stableAlertId(p),
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
