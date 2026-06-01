/* ─── Weather icons ────────────────────────────────────────────────
 * Monochrome inline SVGs that inherit color via `currentColor`.
 * Add a new icon here, then route to it from iconFor() below.
 * ──────────────────────────────────────────────────────────────── */

const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon" aria-hidden="true"';

export const WEATHER_ICONS = {
  sun: `<svg ${ICON_ATTRS}>
    <circle cx="12" cy="12" r="4"/>
    <line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/>
    <line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/>
    <line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/>
    <line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>
  </svg>`,
  moon: `<svg ${ICON_ATTRS}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`,
  cloudy: `<svg ${ICON_ATTRS}>
    <path d="M6 17a4 4 0 0 1 0-8 6 6 0 0 1 11.5-2 4 4 0 0 1 .5 8H6z"/>
  </svg>`,
  'partly-cloudy-day': `<svg ${ICON_ATTRS}>
    <circle cx="8" cy="8" r="3"/>
    <line x1="8" y1="2" x2="8" y2="3"/><line x1="2" y1="8" x2="3" y2="8"/>
    <line x1="13" y1="8" x2="14" y2="8"/><line x1="4.2" y1="4.2" x2="4.9" y2="4.9"/>
    <line x1="11.1" y1="11.1" x2="11.8" y2="11.8"/><line x1="11.1" y1="4.9" x2="11.8" y2="4.2"/>
    <path d="M10 19a3 3 0 0 1 0-6 4 4 0 0 1 8 0 3 3 0 0 1 0 6h-8z"/>
  </svg>`,
  'partly-cloudy-night': `<svg ${ICON_ATTRS}>
    <path d="M14 8a4 4 0 0 1-4-4 5 5 0 1 0 4 4z"/>
    <path d="M10 20a3 3 0 0 1 0-6 4 4 0 0 1 8 0 3 3 0 0 1 0 6h-8z"/>
  </svg>`,
  rain: `<svg ${ICON_ATTRS}>
    <path d="M6 13a4 4 0 0 1 0-8 6 6 0 0 1 11.5-2 4 4 0 0 1 .5 8H6z"/>
    <line x1="8" y1="17" x2="8" y2="20"/><line x1="12" y1="17" x2="12" y2="21"/>
    <line x1="16" y1="17" x2="16" y2="20"/>
  </svg>`,
  thunderstorm: `<svg ${ICON_ATTRS}>
    <path d="M6 13a4 4 0 0 1 0-8 6 6 0 0 1 11.5-2 4 4 0 0 1 .5 8H6z"/>
    <polyline points="13 16 10 20 13 20 10 23"/>
  </svg>`,
  snow: `<svg ${ICON_ATTRS}>
    <path d="M6 13a4 4 0 0 1 0-8 6 6 0 0 1 11.5-2 4 4 0 0 1 .5 8H6z"/>
    <line x1="8" y1="17" x2="8" y2="17.01"/><line x1="12" y1="18" x2="12" y2="18.01"/>
    <line x1="16" y1="17" x2="16" y2="17.01"/><line x1="10" y1="21" x2="10" y2="21.01"/>
    <line x1="14" y1="21" x2="14" y2="21.01"/>
  </svg>`,
  fog: `<svg ${ICON_ATTRS}>
    <line x1="3" y1="8" x2="21" y2="8"/><line x1="6" y1="12" x2="20" y2="12"/>
    <line x1="3" y1="16" x2="18" y2="16"/><line x1="9" y1="20" x2="20" y2="20"/>
  </svg>`,
};

// Match-keys in priority order. Each entry's words are tested against the
// lowercased condition string; first hit wins, so put specific (precipitation)
// before general (cloud cover). `daySky`/`nightSky` are placeholders resolved
// against `isDaytime` below — they cover both forecast shortForecasts and the
// noisier observation textDescriptions ("A Few Clouds", "Mostly Clear", "Fair").
const ICON_RULES = [
  [['thunder'], 'thunderstorm'],
  [['snow', 'flurr', 'sleet', 'blizzard', 'wintry'], 'snow'],
  [['rain', 'shower', 'drizzle'], 'rain'],
  [['fog', 'haze', 'mist', 'smoke'], 'fog'],
  // Mostly-clear conditions: a little cloud cover over an otherwise clear sky.
  [['partly', 'mostly sunny', 'mostly clear', 'a few clouds', 'isolated clouds', 'scattered clouds'], 'partly'],
  // Genuine cloud cover. "Mostly clear" / "a few clouds" already short-circuited above.
  [['cloud', 'overcast'], 'cloudy'],
];

// Pick an icon from a condition string ("Mostly Sunny", "Light Rain", "A Few
// Clouds", etc.). `isDaytime` controls sun vs. moon for clear/partly-clear sky.
export function iconFor(shortForecast, isDaytime) {
  const c = (shortForecast || '').toLowerCase();
  for (const [words, key] of ICON_RULES) {
    if (words.some((w) => c.includes(w))) {
      if (key === 'partly') {
        return isDaytime ? WEATHER_ICONS['partly-cloudy-day'] : WEATHER_ICONS['partly-cloudy-night'];
      }
      return WEATHER_ICONS[key];
    }
  }
  // Clear, sunny, fair, or anything unrecognized — fall back to sun/moon.
  return isDaytime ? WEATHER_ICONS.sun : WEATHER_ICONS.moon;
}

/* ─── Alert icons ──────────────────────────────────────────────────
 * Same monochrome / currentColor treatment, keyed off the NWS `event`
 * name. `warning` (the alert triangle) is the catch-all fallback. */
export const ALERT_ICONS = {
  warning: `<svg ${ICON_ATTRS}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`,
  tornado: `<svg ${ICON_ATTRS}>
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="10" x2="18" y2="10"/>
    <line x1="9" y1="14" x2="15" y2="14"/><path d="M12 14c0 3-1 4.5-3 6.5"/>
  </svg>`,
  thunderstorm: `<svg ${ICON_ATTRS}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>
  </svg>`,
  flood: `<svg ${ICON_ATTRS}>
    <path d="M2 7c1.5-2 4.5-2 6 0s4.5 2 6 0 4.5-2 6 0"/>
    <path d="M2 12c1.5-2 4.5-2 6 0s4.5 2 6 0 4.5-2 6 0"/>
    <path d="M2 17c1.5-2 4.5-2 6 0s4.5 2 6 0 4.5-2 6 0"/>
  </svg>`,
  winter: `<svg ${ICON_ATTRS}>
    <line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/><line x1="5.6" y1="18.4" x2="18.4" y2="5.6"/>
  </svg>`,
  heat: `<svg ${ICON_ATTRS}>
    <path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z"/>
  </svg>`,
  wind: `<svg ${ICON_ATTRS}>
    <path d="M9.59 4.59A2 2 0 1 1 11 8H2"/>
    <path d="M12.59 11.59A2 2 0 1 0 14 15H2"/>
    <path d="M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2"/>
  </svg>`,
  fire: `<svg ${ICON_ATTRS}>
    <path d="M12 3C9 7 6 9 6 14a6 6 0 0 0 12 0c0-2-1-3.5-2-5 0 1.5-1 2.5-2 2.5C13 9 13 6 12 3z"/>
  </svg>`,
  fog: WEATHER_ICONS.fog,
};

// Pick an alert icon from the NWS `event` name ("Tornado Warning", "Flood
// Watch", "Heat Advisory", …). Order matters where keywords could overlap;
// anything unrecognized gets the generic warning triangle.
export function alertIconFor(event) {
  const e = (event || '').toLowerCase();
  if (e.includes('tornado')) return ALERT_ICONS.tornado;
  if (e.includes('thunderstorm') || e.includes('lightning')) return ALERT_ICONS.thunderstorm;
  if (e.includes('flood') || e.includes('tsunami') || e.includes('surge')) return ALERT_ICONS.flood;
  if (e.includes('snow') || e.includes('winter') || e.includes('blizzard') || e.includes('ice') || e.includes('freez') || e.includes('frost') || e.includes('cold') || e.includes('chill')) return ALERT_ICONS.winter;
  if (e.includes('heat') || e.includes('hot')) return ALERT_ICONS.heat;
  if (e.includes('fire') || e.includes('red flag') || e.includes('smoke')) return ALERT_ICONS.fire;
  if (e.includes('wind') || e.includes('gale') || e.includes('hurricane') || e.includes('tropical')) return ALERT_ICONS.wind;
  if (e.includes('fog') || e.includes('dust') || e.includes('haze')) return ALERT_ICONS.fog;
  return ALERT_ICONS.warning;
}
