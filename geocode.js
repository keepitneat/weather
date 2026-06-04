/* ─── Geocoding (city / ZIP → lat/lon) ─────────────────────────────
 * Turns a free-text US location into coordinates via the US Census
 * Geocoder — free, no API key, US-only, which fits an NWS-backed app.
 *
 * Gotchas: the Census onelineaddress matcher is tuned for street
 * addresses, so bare city names sometimes return zero matches (a full
 * "City, ST" does best, and a 5-digit ZIP resolves reliably). It's
 * US-only by design — outside the US it returns nothing, which is fine
 * here since NWS is US-only too.
 *
 * Network is injected (fetchImpl) so the orchestration is unit-testable
 * without real requests; the parsing/URL helpers are pure.
 * ──────────────────────────────────────────────────────────────── */

const CENSUS_ENDPOINT =
  'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

// Current-vintage public benchmark — the stable "use today's data" alias.
const CENSUS_BENCHMARK = 'Public_AR_Current';

// 5 digits, or ZIP+4. Used only to special-case the UI hint; the Census
// endpoint accepts either a ZIP or a "City, ST" through the same address param.
export function looksLikeZip(query) {
  return /^\d{5}(-\d{4})?$/.test((query || '').trim());
}

export function buildCensusUrl(query) {
  const url = new URL(CENSUS_ENDPOINT);
  url.searchParams.set('address', query);
  url.searchParams.set('benchmark', CENSUS_BENCHMARK);
  url.searchParams.set('format', 'json');
  return url.toString();
}

// Census coordinates are {x: lon, y: lat}. Drop any match without a usable
// numeric pair so callers always get coordinates they can hand to NWS_POINTS.
export function parseCensusMatches(data) {
  const matches = data?.result?.addressMatches;
  if (!Array.isArray(matches)) return [];
  return matches
    .map((m) => ({
      name: m?.matchedAddress ?? '',
      lat: m?.coordinates?.y,
      lon: m?.coordinates?.x,
    }))
    .filter((m) => typeof m.lat === 'number' && typeof m.lon === 'number');
}

// Geocode a query to an ordered list of {name, lat, lon} candidates.
// Resolves to [] when the address is valid but matches nothing; throws on
// an empty query or a transport/HTTP failure.
export async function geocode(query, { fetchImpl = fetch } = {}) {
  const trimmed = (query || '').trim();
  if (!trimmed) throw new Error('Search is empty.');

  const res = await fetchImpl(buildCensusUrl(trimmed), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Geocoder HTTP ${res.status}`);

  const data = await res.json();
  return parseCensusMatches(data);
}
