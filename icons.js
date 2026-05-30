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

// Pick an icon from a shortForecast string ("Mostly Sunny", "Light Rain", etc.).
// `isDaytime` controls sun vs. moon for clear/partly-clear conditions.
export function iconFor(shortForecast, isDaytime) {
  const c = (shortForecast || '').toLowerCase();
  if (c.includes('thunder')) return WEATHER_ICONS.thunderstorm;
  if (c.includes('snow') || c.includes('flurr') || c.includes('sleet') || c.includes('blizzard')) return WEATHER_ICONS.snow;
  if (c.includes('rain') || c.includes('shower') || c.includes('drizzle')) return WEATHER_ICONS.rain;
  if (c.includes('fog') || c.includes('haze') || c.includes('mist') || c.includes('smoke')) return WEATHER_ICONS.fog;
  // Partly anything (partly sunny / partly cloudy / mostly sunny w/ clouds)
  if (c.includes('partly') || c.includes('mostly sunny')) {
    return isDaytime ? WEATHER_ICONS['partly-cloudy-day'] : WEATHER_ICONS['partly-cloudy-night'];
  }
  if (c.includes('cloud') || c.includes('overcast')) return WEATHER_ICONS.cloudy;
  // Clear, sunny, fair, or anything unrecognized — fall back to sun/moon
  return isDaytime ? WEATHER_ICONS.sun : WEATHER_ICONS.moon;
}
