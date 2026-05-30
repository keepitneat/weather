/* ─── Just the Weather ─────────────────────────────────────────────
 * Vanilla JS PWA. Fetches NWS forecast for the user's location
 * (or NYC if geolocation denied/unavailable).
 * No dependencies, no tracking, no nonsense.
 * ──────────────────────────────────────────────────────────────── */

import { iconFor } from './icons.js';

const NWS_POINTS = (lat, lon) =>
  `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`;

const FALLBACK = {
  // NYC gridpoint (OKX/34,44 — Manhattan area) + KNYC observation station
  // (Central Park). Used when geolocation is unavailable, denied, or fails
  // the NWS lookup (e.g., user outside the US).
  forecastUrl: 'https://api.weather.gov/gridpoints/OKX/34,44/forecast',
  hourlyUrl: 'https://api.weather.gov/gridpoints/OKX/34,44/forecast/hourly',
  observationUrl: 'https://api.weather.gov/stations/KNYC/observations/latest',
  locationName: 'New York, NY',
  stationName: 'Central Park, NY',
};

const STORAGE_KEYS = {
  theme: 'theme',
  forecastUrl: 'forecast-url',
  hourlyUrl: 'forecast-hourly-url',
  observationUrl: 'observation-url',
  locationName: 'location-name',
  stationName: 'station-name',
  forecast: 'forecast-cache',
  hourly: 'forecast-hourly-cache',
  observation: 'observation-cache',
  fetchedAt: 'forecast-fetched-at',
};

// Observations older than this fall back to the first hourly forecast period.
const STALE_OBSERVATION_MS = 90 * 60 * 1000;

const THEME_STATES = ['system', 'light', 'dark'];
const THEME_ICONS = { system: '⚙', light: '☀', dark: '☾' };

const $current = document.getElementById('current');
const $todayList = document.getElementById('today-list');
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
  const cachedObservation = localStorage.getItem(STORAGE_KEYS.observationUrl);
  const cachedName = localStorage.getItem(STORAGE_KEYS.locationName);
  const cachedStationName = localStorage.getItem(STORAGE_KEYS.stationName);
  // observationUrl and stationName are optional — null on upgrade from
  // earlier versions, or when the nearest-station lookup failed.
  if (cachedForecast && cachedHourly && cachedName) {
    return {
      forecastUrl: cachedForecast,
      hourlyUrl: cachedHourly,
      observationUrl: cachedObservation || null,
      locationName: cachedName,
      stationName: cachedStationName || null,
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
    const stationsUrl = points.properties.observationStations;
    const loc = points.properties.relativeLocation.properties;
    // relativeLocation names the populated place nearest the gridpoint
    // CENTER, not the user. Used as a fallback display name when no station
    // is resolved.
    const locationName = `${loc.city}, ${loc.state}`;

    // Resolve the nearest observation station for current-conditions data
    // AND for the display name. If this fails, we degrade gracefully —
    // current conditions fall back to the first hourly forecast period,
    // and the display name falls back to locationName.
    let observationUrl = null;
    let stationName = null;
    try {
      const stationsRes = await fetch(stationsUrl, {
        headers: { 'Accept': 'application/geo+json' },
      });
      if (stationsRes.ok) {
        const stations = await stationsRes.json();
        const station = stations.features?.[0]?.properties;
        if (station?.stationIdentifier) {
          observationUrl = `https://api.weather.gov/stations/${station.stationIdentifier}/observations/latest`;
          stationName = station.name || station.stationIdentifier;
        }
      }
    } catch (stationErr) {
      console.warn('Station resolution failed; observations will fall back to hourly:', stationErr);
    }

    localStorage.setItem(STORAGE_KEYS.forecastUrl, forecastUrl);
    localStorage.setItem(STORAGE_KEYS.hourlyUrl, hourlyUrl);
    if (observationUrl) {
      localStorage.setItem(STORAGE_KEYS.observationUrl, observationUrl);
    }
    if (stationName) {
      localStorage.setItem(STORAGE_KEYS.stationName, stationName);
    }
    localStorage.setItem(STORAGE_KEYS.locationName, locationName);

    return { forecastUrl, hourlyUrl, observationUrl, locationName, stationName };
  } catch (err) {
    console.warn('Location resolution failed; using fallback:', err);
    return FALLBACK;
  }
}

// ─── Forecast fetch + render ──────────────────────────────────────

async function fetchForecast({ forecastUrl, hourlyUrl, observationUrl, locationName, stationName }) {
  try {
    // Observation fetch is best-effort — if it fails, we still render
    // forecast with the first hourly period as current conditions.
    const fetchOpts = { headers: { 'Accept': 'application/geo+json' } };
    const observationPromise = observationUrl
      ? fetch(observationUrl, fetchOpts).then((res) => (res.ok ? res.json() : null)).catch(() => null)
      : Promise.resolve(null);

    const [forecastRes, hourlyRes, observationData] = await Promise.all([
      fetch(forecastUrl, fetchOpts),
      fetch(hourlyUrl, fetchOpts),
      observationPromise,
    ]);
    if (!forecastRes.ok) throw new Error(`Forecast HTTP ${forecastRes.status}`);
    if (!hourlyRes.ok) throw new Error(`Hourly HTTP ${hourlyRes.status}`);
    const forecastData = await forecastRes.json();
    const hourlyData = await hourlyRes.json();
    const periods = forecastData.properties.periods;
    const hourlyPeriods = hourlyData.properties.periods;
    const observation = observationData?.properties ?? null;

    localStorage.setItem(STORAGE_KEYS.forecast, JSON.stringify(periods));
    localStorage.setItem(STORAGE_KEYS.hourly, JSON.stringify(hourlyPeriods));
    if (observation) {
      localStorage.setItem(STORAGE_KEYS.observation, JSON.stringify(observation));
    }
    localStorage.setItem(STORAGE_KEYS.fetchedAt, new Date().toISOString());

    render({ periods, hourlyPeriods, observation, locationName, stationName, fromCache: false });
  } catch (err) {
    console.warn('Live fetch failed; trying cache:', err);
    const cachedForecast = localStorage.getItem(STORAGE_KEYS.forecast);
    const cachedHourly = localStorage.getItem(STORAGE_KEYS.hourly);
    const cachedObservation = localStorage.getItem(STORAGE_KEYS.observation);
    if (cachedForecast && cachedHourly) {
      render({
        periods: JSON.parse(cachedForecast),
        hourlyPeriods: JSON.parse(cachedHourly),
        observation: cachedObservation ? JSON.parse(cachedObservation) : null,
        locationName,
        stationName,
        fromCache: true,
      });
    } else {
      renderError();
    }
  }
}

function render({ periods, hourlyPeriods, observation, locationName, stationName, fromCache }) {
  const conditions = currentConditions(observation, hourlyPeriods);
  const observedLine = conditions.fromObservation
    ? `Observed ${formatRelative(conditions.observedAt)}`
    : 'Latest forecast (no station data)';
  const displayName = stationName || locationName;
  $current.innerHTML = `
    <div class="location">
      <span>${escapeHtml(displayName)}</span>
      <button class="update-location" type="button">update</button>
    </div>
    <div class="temp">${conditions.tempF}°F</div>
    <div class="condition">${iconFor(conditions.shortForecast, conditions.isDaytime)} ${escapeHtml(conditions.shortForecast)}</div>
    <div class="observed-at">${observedLine}</div>
  `;

  // Cards model: each card is bound to a calendar day (midnight-to-midnight),
  // not to NWS's day/night period split. Today and Tonight are the two halves
  // of TODAY's calendar day; the 7-day cards each span their own full
  // calendar day. Each NWS period contributes its summary; hourly is filtered
  // by the card's calendar-day window.
  const now = Date.now();
  const { start: todayStart, end: todayEnd } = calendarDayBounds(new Date(now));

  const todayPeriod = periods.find((p) => {
    if (!p.isDaytime) return false;
    const t = new Date(p.startTime).getTime();
    return t >= todayStart && t < todayEnd;
  });
  const tonightPeriod = periods.find((p) => {
    if (p.isDaytime) return false;
    const t = new Date(p.startTime).getTime();
    return t >= todayStart && t < todayEnd;
  });
  const futureDaytime = periods.filter((p) => {
    if (!p.isDaytime) return false;
    const t = new Date(p.startTime).getTime();
    return t >= todayEnd;
  }).slice(0, 6);

  const todayCards = [];
  if (todayPeriod) {
    todayCards.push(periodCard(todayPeriod, hourlyPeriods, {
      open: false,
      hourlyStart: todayStart,
      hourlyEnd: new Date(todayPeriod.endTime).getTime(),
    }));
  }
  if (tonightPeriod) {
    todayCards.push(periodCard(tonightPeriod, hourlyPeriods, {
      open: false,
      hourlyStart: new Date(tonightPeriod.startTime).getTime(),
      hourlyEnd: todayEnd,
    }));
  }
  $todayList.innerHTML = todayCards.join('');

  const forecastCards = futureDaytime.map((dayPeriod) => {
    const { start, end } = calendarDayBounds(new Date(dayPeriod.startTime));
    return periodCard(dayPeriod, hourlyPeriods, {
      open: false,
      hourlyStart: start,
      hourlyEnd: end,
    });
  });
  $forecastList.innerHTML = forecastCards.join('');

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

// Render one period as a clickable card. `hourlyStart`/`hourlyEnd` define
// the calendar-day window the card spans (caller's choice — Today and
// Tonight share today's window split at sunset; 7-day cards each get a
// full midnight-to-midnight window). `filterStart` is clamped to `now`
// so we don't show hours that already passed.
function periodCard(period, hourlyPeriods, { open, hourlyStart, hourlyEnd }) {
  const filterStart = Math.max(hourlyStart, Date.now());
  const hoursForPeriod = hourlyPeriods.filter((h) => {
    const t = new Date(h.startTime).getTime();
    return t >= filterStart && t < hourlyEnd;
  });
  return `
    <li>
      <details${open ? ' open' : ''}>
        <summary>
          <span class="day">${escapeHtml(period.name)}</span>
          <span class="condition">${iconFor(period.shortForecast, period.isDaytime)} ${escapeHtml(period.shortForecast)}</span>
          <span class="temp">${period.temperature}°</span>
        </summary>
        <ol class="hourly">
          ${hoursForPeriod.length === 0
            ? '<li class="hourly-empty">No hourly data available.</li>'
            : hoursForPeriod.map(renderHour).join('')}
        </ol>
      </details>
    </li>
  `;
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
  $todayList.innerHTML = '';
  $forecastList.innerHTML = '';
  $status.hidden = true;
}

// ─── Helpers ──────────────────────────────────────────────────────

function cToF(c) {
  return Math.round((c * 9) / 5 + 32);
}

// Calendar-day bounds for the given Date (local time): start = 00:00 of that
// day, end = 00:00 of the next day. Uses setDate(+1) to stay DST-safe.
function calendarDayBounds(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

// Build the "current conditions" object from the observation API when
// possible, falling back to the first hourly forecast period when the
// station hasn't reported a usable value (null temp or stale > 90 min).
function currentConditions(observation, hourlyPeriods) {
  const hour = hourlyPeriods[0];
  const tempC = observation?.temperature?.value;
  const observedAt = observation?.timestamp;
  if (tempC != null && observedAt) {
    const age = Date.now() - new Date(observedAt).getTime();
    if (age <= STALE_OBSERVATION_MS) {
      return {
        tempF: cToF(tempC),
        shortForecast: observation.textDescription || hour.shortForecast,
        isDaytime: hour.isDaytime,
        observedAt,
        fromObservation: true,
      };
    }
    console.debug(`Observation ${Math.round(age / 60000)} min old (stale > ${STALE_OBSERVATION_MS / 60000}); falling back to hourly.`);
  } else if (observation) {
    console.debug('Observation present but missing temp or timestamp; falling back to hourly.', { tempC, observedAt });
  }
  return {
    tempF: hour.temperature,
    shortForecast: hour.shortForecast,
    isDaytime: hour.isDaytime,
    observedAt: null,
    fromObservation: false,
  };
}

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
  localStorage.removeItem(STORAGE_KEYS.observationUrl);
  localStorage.removeItem(STORAGE_KEYS.locationName);
  localStorage.removeItem(STORAGE_KEYS.stationName);
  $current.innerHTML = `<p class="loading">Updating location…</p>`;
  $todayList.innerHTML = '';
  $forecastList.innerHTML = '';
  $status.hidden = true;
  const location = await resolveLocation();
  await fetchForecast(location);
}

$current.addEventListener('click', (event) => {
  if (event.target.closest('.update-location')) {
    updateLocation();
  }
});

// ─── Boot ─────────────────────────────────────────────────────────

(async () => {
  const location = await resolveLocation();
  fetchForecast(location);
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch((err) => {
    console.warn('Service worker registration failed:', err);
  });
}
