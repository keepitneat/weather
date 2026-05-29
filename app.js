/* ─── Just the Weather ─────────────────────────────────────────────
 * Vanilla JS PWA. Fetches NWS forecast for the user's location
 * (or NYC if geolocation denied/unavailable).
 * No dependencies, no tracking, no nonsense.
 * ──────────────────────────────────────────────────────────────── */

const NWS_POINTS = (lat, lon) =>
  `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`;

const FALLBACK = {
  // NYC gridpoint (OKX/34,44 — Manhattan area). Used when geolocation is
  // unavailable, denied, or fails the NWS lookup (e.g., user outside the US).
  forecastUrl: 'https://api.weather.gov/gridpoints/OKX/34,44/forecast',
  hourlyUrl: 'https://api.weather.gov/gridpoints/OKX/34,44/forecast/hourly',
  locationName: 'New York, NY',
};

const STORAGE_KEYS = {
  theme: 'theme',
  forecastUrl: 'forecast-url',
  hourlyUrl: 'forecast-hourly-url',
  locationName: 'location-name',
  forecast: 'forecast-cache',
  hourly: 'forecast-hourly-cache',
  fetchedAt: 'forecast-fetched-at',
};

const THEME_STATES = ['system', 'light', 'dark'];
const THEME_ICONS = { system: '⚙', light: '☀', dark: '☾' };

// ─── Weather icons (inline SVG, monochrome, uses currentColor) ────

const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon" aria-hidden="true"';

const WEATHER_ICONS = {
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

function iconFor(shortForecast, isDaytime) {
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

const $current = document.getElementById('current');
const $forecastList = document.getElementById('forecast-list');
const $status = document.getElementById('status');
const $themeToggle = document.getElementById('theme-toggle');
const $themeIcon = document.getElementById('theme-icon');

// ─── Theme toggle ─────────────────────────────────────────────────

function getThemeState() {
  return localStorage.getItem(STORAGE_KEYS.theme) || 'system';
}

function applyTheme(state) {
  if (state === 'system') {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem(STORAGE_KEYS.theme);
  } else {
    document.documentElement.setAttribute('data-theme', state);
    localStorage.setItem(STORAGE_KEYS.theme, state);
  }
  $themeIcon.textContent = THEME_ICONS[state];
  $themeToggle.setAttribute('aria-label', `Theme: ${state}. Click to cycle.`);
}

function cycleTheme() {
  const current = getThemeState();
  const next = THEME_STATES[(THEME_STATES.indexOf(current) + 1) % THEME_STATES.length];
  applyTheme(next);
}

$themeToggle.addEventListener('click', cycleTheme);
applyTheme(getThemeState());

// ─── Location resolution ─────────────────────────────────────────

async function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 10000,
      maximumAge: 60 * 60 * 1000,
    });
  });
}

async function resolveLocation() {
  const cachedForecast = localStorage.getItem(STORAGE_KEYS.forecastUrl);
  const cachedHourly = localStorage.getItem(STORAGE_KEYS.hourlyUrl);
  const cachedName = localStorage.getItem(STORAGE_KEYS.locationName);
  if (cachedForecast && cachedHourly && cachedName) {
    return {
      forecastUrl: cachedForecast,
      hourlyUrl: cachedHourly,
      locationName: cachedName,
    };
  }

  if (!('geolocation' in navigator)) {
    return FALLBACK;
  }

  try {
    const position = await getBrowserPosition();
    const { latitude, longitude } = position.coords;

    const res = await fetch(NWS_POINTS(latitude, longitude), {
      headers: { 'Accept': 'application/geo+json' },
    });
    if (!res.ok) throw new Error(`Points API HTTP ${res.status}`);
    const points = await res.json();

    const forecastUrl = points.properties.forecast;
    const hourlyUrl = points.properties.forecastHourly;
    const loc = points.properties.relativeLocation.properties;
    const locationName = `${loc.city}, ${loc.state}`;

    localStorage.setItem(STORAGE_KEYS.forecastUrl, forecastUrl);
    localStorage.setItem(STORAGE_KEYS.hourlyUrl, hourlyUrl);
    localStorage.setItem(STORAGE_KEYS.locationName, locationName);

    return { forecastUrl, hourlyUrl, locationName };
  } catch (err) {
    console.warn('Location resolution failed; using fallback:', err);
    return FALLBACK;
  }
}

// ─── Forecast fetch + render ──────────────────────────────────────

async function fetchForecast(forecastUrl, hourlyUrl, locationName) {
  try {
    const [forecastRes, hourlyRes] = await Promise.all([
      fetch(forecastUrl, { headers: { 'Accept': 'application/geo+json' } }),
      fetch(hourlyUrl, { headers: { 'Accept': 'application/geo+json' } }),
    ]);
    if (!forecastRes.ok) throw new Error(`Forecast HTTP ${forecastRes.status}`);
    if (!hourlyRes.ok) throw new Error(`Hourly HTTP ${hourlyRes.status}`);
    const forecastData = await forecastRes.json();
    const hourlyData = await hourlyRes.json();
    const periods = forecastData.properties.periods;
    const hourlyPeriods = hourlyData.properties.periods;

    localStorage.setItem(STORAGE_KEYS.forecast, JSON.stringify(periods));
    localStorage.setItem(STORAGE_KEYS.hourly, JSON.stringify(hourlyPeriods));
    localStorage.setItem(STORAGE_KEYS.fetchedAt, new Date().toISOString());

    render(periods, hourlyPeriods, locationName, { fromCache: false });
  } catch (err) {
    console.warn('Live fetch failed; trying cache:', err);
    const cachedForecast = localStorage.getItem(STORAGE_KEYS.forecast);
    const cachedHourly = localStorage.getItem(STORAGE_KEYS.hourly);
    if (cachedForecast && cachedHourly) {
      render(
        JSON.parse(cachedForecast),
        JSON.parse(cachedHourly),
        locationName,
        { fromCache: true }
      );
    } else {
      renderError();
    }
  }
}

function render(periods, hourlyPeriods, locationName, { fromCache }) {
  const current = periods[0];
  $current.innerHTML = `
    <div class="location">
      <span>${escapeHtml(locationName)}</span>
      <button class="update-location" type="button">update</button>
    </div>
    <div class="temp">${current.temperature}°${current.temperatureUnit}</div>
    <div class="condition">${iconFor(current.shortForecast, current.isDaytime)} ${escapeHtml(current.shortForecast)} — ${escapeHtml(current.name)}</div>
  `;

  const days = periods.filter((p) => p.isDaytime).slice(0, 7);
  const now = Date.now();
  $forecastList.innerHTML = days
    .map((day) => {
      // Expand from the daytime block (6am-6pm) to the full calendar day
      // so hourly covers morning AND evening. For today, start from "now"
      // so we don't show hours that have already passed.
      const periodStart = new Date(day.startTime);
      const startOfCalendarDay = new Date(
        periodStart.getFullYear(),
        periodStart.getMonth(),
        periodStart.getDate()
      );
      const endOfCalendarDay = new Date(startOfCalendarDay);
      endOfCalendarDay.setDate(endOfCalendarDay.getDate() + 1);
      const filterStart = Math.max(startOfCalendarDay.getTime(), now);

      const hoursForDay = hourlyPeriods.filter((h) => {
        const t = new Date(h.startTime).getTime();
        return t >= filterStart && t < endOfCalendarDay.getTime();
      });
      return `
        <li>
          <details>
            <summary>
              <span class="day">${escapeHtml(day.name)}</span>
              <span class="condition">${iconFor(day.shortForecast, true)} ${escapeHtml(day.shortForecast)}</span>
              <span class="temp">${day.temperature}°</span>
            </summary>
            <ol class="hourly">
              ${hoursForDay.length === 0
                ? '<li class="hourly-empty">No hourly data available for this day.</li>'
                : hoursForDay.map(renderHour).join('')}
            </ol>
          </details>
        </li>
      `;
    })
    .join('');

  const fetchedAt = localStorage.getItem(STORAGE_KEYS.fetchedAt);
  if (fromCache) {
    $status.textContent = `Offline — showing cached data from ${formatRelative(fetchedAt)}.`;
    $status.hidden = false;
  } else if (fetchedAt) {
    const relative = formatRelative(fetchedAt);
    if (relative !== 'just now') {
      $status.textContent = `Updated ${relative}.`;
      $status.hidden = false;
    } else {
      $status.hidden = true;
    }
  }
}

function renderHour(hour) {
  const time = new Date(hour.startTime).toLocaleTimeString(undefined, { hour: 'numeric' });
  return `
    <li>
      <span class="hour">${escapeHtml(time)}</span>
      <span class="condition">${iconFor(hour.shortForecast, hour.isDaytime)} ${escapeHtml(hour.shortForecast)}</span>
      <span class="temp">${hour.temperature}°</span>
    </li>
  `;
}

function renderError() {
  $current.innerHTML = `
    <div class="loading">Couldn't load forecast. Check your connection and refresh.</div>
  `;
  $forecastList.innerHTML = '';
  $status.hidden = true;
}

// ─── Helpers ──────────────────────────────────────────────────────

function formatRelative(iso) {
  if (!iso) return 'unknown time';
  const then = new Date(iso);
  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return then.toLocaleDateString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Manual location refresh ──────────────────────────────────────

async function updateLocation() {
  localStorage.removeItem(STORAGE_KEYS.forecastUrl);
  localStorage.removeItem(STORAGE_KEYS.hourlyUrl);
  localStorage.removeItem(STORAGE_KEYS.locationName);
  $current.innerHTML = `<p class="loading">Updating location…</p>`;
  $forecastList.innerHTML = '';
  $status.hidden = true;
  const { forecastUrl, hourlyUrl, locationName } = await resolveLocation();
  await fetchForecast(forecastUrl, hourlyUrl, locationName);
}

$current.addEventListener('click', (event) => {
  if (event.target.closest('.update-location')) {
    updateLocation();
  }
});

// ─── Boot ─────────────────────────────────────────────────────────

(async () => {
  const { forecastUrl, hourlyUrl, locationName } = await resolveLocation();
  fetchForecast(forecastUrl, hourlyUrl, locationName);
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch((err) => {
    console.warn('Service worker registration failed:', err);
  });
}
