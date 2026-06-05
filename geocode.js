/* ─── Geocoding (city / ZIP → lat/lon) ─────────────────────────────
 * Turns a free-text US location into coordinates via Nominatim
 * (OpenStreetMap) — free, no API key, and (unlike the US Census
 * Geocoder this replaced) it both serves CORS headers and resolves
 * plain city names and bare ZIPs, which is all this box ever sends.
 *
 * Gotchas / constraints we design around:
 *  - Usage policy caps ~1 req/sec and bans abusers. The UI is
 *    submit-based (no as-you-type autocomplete), so one fetch per user
 *    action stays well under the cap. `limit=1` keeps the payload small.
 *  - A real User-Agent is requested by the policy, but browsers FORBID
 *    setting that header — Nominatim accepts the Referer a browser sends
 *    instead, so we set no UA here (a manual UA header would just throw).
 *  - `countrycodes=us` matches the NWS-backed app's US-only scope.
 *  - lat/lon come back as STRINGS — the parser coerces to numbers.
 *
 * Network is injected (fetchImpl) so the orchestration is unit-testable
 * without real requests; the parsing/URL helpers are pure.
 * ──────────────────────────────────────────────────────────────── */

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

// Full US state/territory name → USPS abbreviation, for short "City, ST" labels.
const US_STATE_ABBR = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL',
  Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA',
  Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI',
  Wyoming: 'WY', 'Puerto Rico': 'PR', Guam: 'GU', 'U.S. Virgin Islands': 'VI',
};

// A short "City, ST" label from a Nominatim result. Prefers the structured
// `address` (we request addressdetails=1); falls back to the first two
// display_name segments, then to whatever single part exists.
export function shortLocationName(result) {
  const addr = (result && result.address) || {};
  const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county || '';
  const state = addr.state ? (US_STATE_ABBR[addr.state] || addr.state) : '';
  if (city && state) return `${city}, ${state}`;
  if (city) return city;

  const display = (result && result.display_name) || '';
  if (display) return display.split(',').slice(0, 2).map((s) => s.trim()).join(', ');
  return '';
}

// 5 digits, or ZIP+4. Used only to special-case the UI's not-found hint;
// Nominatim resolves a ZIP or a "City, ST" through the same `q` param.
export function looksLikeZip(query) {
  return /^\d{5}(-\d{4})?$/.test((query || '').trim());
}

export function buildGeocodeUrl(query) {
  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('addressdetails', '1');
  return url.toString();
}

// Nominatim returns an array of results with string lat/lon and a
// display_name. Coerce coords to numbers and drop any result without a
// usable numeric pair so callers always get coordinates for NWS_POINTS.
export function parseNominatimResults(data) {
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => ({
      name: shortLocationName(m),
      lat: Number(m?.lat),
      lon: Number(m?.lon),
    }))
    .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon));
}

// Geocode a query to an ordered list of {name, lat, lon} candidates.
// Resolves to [] when the query is valid but matches nothing; throws on
// an empty query or a transport/HTTP failure.
export async function geocode(query, { fetchImpl = fetch } = {}) {
  const trimmed = (query || '').trim();
  if (!trimmed) throw new Error('Search is empty.');

  const res = await fetchImpl(buildGeocodeUrl(trimmed), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Geocoder HTTP ${res.status}`);

  const data = await res.json();
  return parseNominatimResults(data);
}
