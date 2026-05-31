/* ─── Just the Weather ─────────────────────────────────────────────
 * Vanilla JS PWA. Fetches NWS forecast for the user's location
 * (or NYC if geolocation denied/unavailable).
 * No dependencies, no tracking, no nonsense.
 * ──────────────────────────────────────────────────────────────── */

import { iconFor, alertIconFor } from './icons.js';
import { normalizeAlerts, formatExpiry, formatExpiryExact } from './alerts.js';

const NWS_ALERTS = (lat, lon) =>
  `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;

const NWS_POINTS = (lat, lon) =>
  `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`;

// NYC fallback for geolocation denied/unavailable or NWS lookup failure.
const FALLBACK = {
  forecastUrl: 'https://api.weather.gov/gridpoints/OKX/34,44/forecast',
  hourlyUrl: 'https://api.weather.gov/gridpoints/OKX/34,44/forecast/hourly',
  observationUrl: 'https://api.weather.gov/stations/KNYC/observations/latest',
  alertsUrl: NWS_ALERTS(40.7829, -73.9654), // Central Park
  locationName: 'New York, NY',
  stationName: 'Central Park, NY',
};

const STORAGE_KEYS = {
  theme: 'theme',
  forecastUrl: 'forecast-url',
  hourlyUrl: 'forecast-hourly-url',
  observationUrl: 'observation-url',
  alertsUrl: 'alerts-url',
  locationName: 'location-name',
  stationName: 'station-name',
  forecast: 'forecast-cache',
  hourly: 'forecast-hourly-cache',
  observation: 'observation-cache',
  alerts: 'alerts-cache',
  fetchedAt: 'forecast-fetched-at',
};

// Tighter than 2hr throws away real readings for forecasts that are often
// less accurate at the current hour.
const STALE_OBSERVATION_MS = 2 * 60 * 60 * 1000;

// Map NWS severity → CSS class suffix (lowercased). Anything unrecognized
// (incl. "Unknown") gets the neutral .alert--unknown treatment.
const ALERT_SEVERITY_CLASS = {
  Extreme: 'extreme',
  Severe: 'severe',
  Moderate: 'moderate',
  Minor: 'minor',
};

const THEME_STATES = ['system', 'light', 'dark'];
const THEME_ICONS = { system: '⚙', light: '☀', dark: '☾' };

const $alerts = document.getElementById('alerts');
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
  let cachedObservation = localStorage.getItem(STORAGE_KEYS.observationUrl);
  const cachedAlerts = localStorage.getItem(STORAGE_KEYS.alertsUrl);
  const cachedName = localStorage.getItem(STORAGE_KEYS.locationName);
  let cachedStationName = localStorage.getItem(STORAGE_KEYS.stationName);
  if (cachedForecast && cachedHourly && cachedName) {
    // observationUrl may be null on upgrade — backfill from cached forecast URL.
    if (!cachedObservation) {
      const resolved = await resolveStationFromForecastUrl(cachedForecast);
      if (resolved) {
        cachedObservation = resolved.observationUrl;
        cachedStationName = resolved.stationName;
        localStorage.setItem(STORAGE_KEYS.observationUrl, cachedObservation);
        localStorage.setItem(STORAGE_KEYS.stationName, cachedStationName);
      }
    }
    return {
      forecastUrl: cachedForecast,
      hourlyUrl: cachedHourly,
      observationUrl: cachedObservation || null,
      alertsUrl: cachedAlerts || null,
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
    // Alerts are queried by the user's actual point, not the gridpoint center —
    // alert polygons are often finer-grained than a forecast grid cell.
    const alertsUrl = NWS_ALERTS(latitude, longitude);
    const loc = points.properties.relativeLocation.properties;
    // relativeLocation = nearest populated place to the gridpoint CENTER, not the user.
    const locationName = `${loc.city}, ${loc.state}`;

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
    localStorage.setItem(STORAGE_KEYS.alertsUrl, alertsUrl);
    if (stationName) {
      localStorage.setItem(STORAGE_KEYS.stationName, stationName);
    }
    localStorage.setItem(STORAGE_KEYS.locationName, locationName);

    return { forecastUrl, hourlyUrl, observationUrl, alertsUrl, locationName, stationName };
  } catch (err) {
    console.warn('Location resolution failed; using fallback:', err);
    return FALLBACK;
  }
}

async function resolveStationFromForecastUrl(forecastUrl) {
  try {
    const stationsUrl = forecastUrl.replace(/\/forecast$/, '/stations');
    if (stationsUrl === forecastUrl) return null;
    const res = await fetch(stationsUrl, {
      headers: { 'Accept': 'application/geo+json' },
    });
    if (!res.ok) return null;
    const stations = await res.json();
    const station = stations.features?.[0]?.properties;
    if (!station?.stationIdentifier) return null;
    return {
      observationUrl: `https://api.weather.gov/stations/${station.stationIdentifier}/observations/latest`,
      stationName: station.name || station.stationIdentifier,
    };
  } catch (err) {
    console.warn('Backfill station resolution failed:', err);
    return null;
  }
}

// ─── Forecast fetch + render ──────────────────────────────────────

async function fetchForecast({ forecastUrl, hourlyUrl, observationUrl, alertsUrl, locationName, stationName }) {
  try {
    // Observation + alerts fetches are best-effort — if either fails, we
    // still render the forecast. A failed alerts fetch must NOT blank out
    // a previously-cached alert, so we keep the cache on failure.
    const fetchOpts = { headers: { 'Accept': 'application/geo+json' } };
    const observationPromise = observationUrl
      ? fetch(observationUrl, fetchOpts).then((res) => (res.ok ? res.json() : null)).catch(() => null)
      : Promise.resolve(null);
    const alertsPromise = alertsUrl
      ? fetch(alertsUrl, fetchOpts).then((res) => (res.ok ? res.json() : null)).catch(() => null)
      : Promise.resolve(null);

    const [forecastRes, hourlyRes, observationData, alertsData] = await Promise.all([
      fetch(forecastUrl, fetchOpts),
      fetch(hourlyUrl, fetchOpts),
      observationPromise,
      alertsPromise,
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
    // Cache alerts alongside the forecast so they show offline. A null/empty
    // live response (genuinely no active alerts) clears the cache; a fetch
    // FAILURE (alertsData === null) leaves the cache untouched.
    let alerts;
    if (alertsData !== null) {
      alerts = normalizeAlerts(alertsData);
      localStorage.setItem(STORAGE_KEYS.alerts, JSON.stringify(alerts));
    } else {
      const cachedAlerts = localStorage.getItem(STORAGE_KEYS.alerts);
      alerts = cachedAlerts ? JSON.parse(cachedAlerts) : [];
    }
    localStorage.setItem(STORAGE_KEYS.fetchedAt, new Date().toISOString());

    render({ periods, hourlyPeriods, observation, alerts, locationName, stationName, fromCache: false });
  } catch (err) {
    console.warn('Live fetch failed; trying cache:', err);
    const cachedForecast = localStorage.getItem(STORAGE_KEYS.forecast);
    const cachedHourly = localStorage.getItem(STORAGE_KEYS.hourly);
    const cachedObservation = localStorage.getItem(STORAGE_KEYS.observation);
    const cachedAlerts = localStorage.getItem(STORAGE_KEYS.alerts);
    if (cachedForecast && cachedHourly) {
      render({
        periods: JSON.parse(cachedForecast),
        hourlyPeriods: JSON.parse(cachedHourly),
        observation: cachedObservation ? JSON.parse(cachedObservation) : null,
        alerts: cachedAlerts ? JSON.parse(cachedAlerts) : [],
        locationName,
        stationName,
        fromCache: true,
      });
    } else {
      renderError();
    }
  }
}

function render({ periods, hourlyPeriods, observation, alerts, locationName, stationName, fromCache }) {
  renderAlerts(alerts || [], fromCache);

  const conditions = currentConditions(observation, hourlyPeriods);
  // City as headline; station name (often ALL-CAPS airport jargon) goes in the observed-at line as provenance.
  let observedLine;
  if (conditions.fromObservation) {
    const stationLabel = stationName ? ` at ${titleCase(stationName)}` : '';
    observedLine = `Observed ${formatRelative(conditions.observedAt)}${stationLabel}`;
  } else {
    observedLine = 'Latest forecast (no station data)';
  }
  $current.innerHTML = `
    <div class="location">
      <span>${escapeHtml(locationName)}</span>
      <button class="update-location" type="button">update</button>
    </div>
    <div class="temp">${conditions.tempF}°F</div>
    <div class="condition">${iconFor(conditions.shortForecast, conditions.isDaytime)} ${escapeHtml(conditions.shortForecast)}</div>
    <div class="observed-at">${observedLine}</div>
  `;

  const now = Date.now();
  const { currentPeriod, todayPeriods, futureDaytime, todayEnd } =
    selectPeriods(periods, now);

  $todayList.innerHTML = currentPeriod
    ? currentDayCard(currentPeriod, todayPeriods, hourlyPeriods, now, todayEnd)
    : '';

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

// ─── Alerts render ────────────────────────────────────────────────

function renderAlerts(alerts, fromCache) {
  if (!alerts || alerts.length === 0) {
    $alerts.hidden = true;
    $alerts.innerHTML = '';
    return;
  }

  const staleNote = fromCache
    ? '<p class="alert-stale">Showing cached alerts — may be out of date.</p>'
    : '';

  $alerts.innerHTML = staleNote + alerts.map(alertBanner).join('');
  $alerts.hidden = false;
}

function alertBanner(alert) {
  const severity = ALERT_SEVERITY_CLASS[alert.severity] || 'unknown';
  const loud = alert.loud ? ' alert--loud' : '';
  // The whole banner is a collapsible <details>, same pattern as the forecast
  // cards. Collapsed it shows just the event + expiry; expanded adds the
  // headline, full description, and a link to the source alert. Loud alerts
  // (tornado / severe-tstorm warnings, anything Extreme) default open so the
  // life-safety text is visible without a click.
  const open = alert.loud ? ' open' : '';

  const headline = alert.headline && alert.headline !== alert.event
    ? `<p class="alert-headline">${escapeHtml(alert.headline)}</p>`
    : '';
  const description = alert.description
    ? `<p class="alert-description">${escapeHtml(alert.description)}</p>`
    : '';
  const link = alert.url
    ? `<a class="alert-link" href="${escapeHtml(alert.url)}" target="_blank" rel="noopener noreferrer">View full alert ↗</a>`
    : '';
  const body = headline + description + link
    ? `<div class="alert-body">${headline}${description}${link}</div>`
    : '';

  return `
    <details class="alert alert--${severity}${loud}"${open}>
      <summary class="alert-head">
        <span class="alert-icon">${alertIconFor(alert.event)}</span>
        <span class="alert-event">${escapeHtml(alert.event)}</span>
        ${expiryChip(alert)}
      </summary>
      ${body}
    </details>
  `;
}

// The expiry chip. With an absolute time it's tap-to-reveal (and shows it on
// hover via title); a delegated handler on #alerts swaps the text and stops
// the click from toggling the card. No exact time → a plain span.
function expiryChip(alert) {
  const relative = formatExpiry(alert.expires);
  const exact = formatExpiryExact(alert.expires);
  if (!exact) return `<span class="alert-expiry">${escapeHtml(relative)}</span>`;
  return `<span class="alert-expiry alert-expiry--toggle" title="${escapeHtml(exact)}"
       data-relative="${escapeHtml(relative)}" data-exact="${escapeHtml(exact)}"
       role="button" tabindex="0"
       aria-label="Expiry: ${escapeHtml(relative)}. Activate to show exact time."
     >${escapeHtml(relative)}</span>`;
}

// The expiry chip is a tap-to-reveal toggle living inside the <summary>. Without
// this, a tap would just open/close the card (the summary's default action). We
// intercept the click, swap relative ↔ exact, and preventDefault so the card
// stays put. Delegated on #alerts so it survives every re-render.
$alerts.addEventListener('click', (event) => {
  const chip = event.target.closest('.alert-expiry--toggle');
  if (!chip) return;
  event.preventDefault();
  const showingExact = chip.dataset.showing === 'exact';
  chip.textContent = showingExact ? chip.dataset.relative : chip.dataset.exact;
  chip.dataset.showing = showingExact ? 'relative' : 'exact';
});

// Keyboard parity: Enter/Space on the focused expiry chip toggles it too,
// without bubbling up to toggle the <summary>.
$alerts.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const chip = event.target.closest('.alert-expiry--toggle');
  if (!chip) return;
  event.preventDefault();
  chip.click();
});

function currentDayCard(currentPeriod, todayPeriods, hourlyPeriods, now, todayEnd) {
  const summaryRows = todayPeriods.map((p) => {
    // First hourly forecast temp in this period — period.temperature is the
    // overnight low for nighttime, which misleads when tonight is just starting.
    const periodStart = new Date(p.startTime).getTime();
    const periodEnd = new Date(p.endTime).getTime();
    const lowerBound = Math.max(periodStart, now);
    const firstHourly = hourlyPeriods.find((h) => {
      const t = new Date(h.startTime).getTime();
      return t >= lowerBound && t < periodEnd;
    });
    const temp = firstHourly ? firstHourly.temperature : p.temperature;
    return `
      <div class="day-summary-row">
        <span class="condition">${iconFor(p.shortForecast, p.isDaytime)} ${escapeHtml(p.name)}: ${escapeHtml(p.shortForecast)}</span>
        <span class="temp">${temp}°</span>
      </div>
    `;
  }).join('');
  const hourStart = new Date(now);
  hourStart.setMinutes(0, 0, 0);
  const hourLowerBound = hourStart.getTime();
  const hoursForDay = hourlyPeriods.filter((h) => {
    const t = new Date(h.startTime).getTime();
    return t >= hourLowerBound && t < todayEnd;
  });
  return `
    <li class="current-day">
      <details>
        <summary>
          <div class="day-summary">
            ${summaryRows}
          </div>
        </summary>
        <ol class="hourly">
          ${hoursForDay.length === 0
            ? '<li class="hourly-empty">No hourly data available.</li>'
            : hoursForDay.map(renderHour).join('')}
        </ol>
      </details>
    </li>
  `;
}

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
  $alerts.hidden = true;
  $alerts.innerHTML = '';
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

// setDate(+1) keeps it DST-safe.
function calendarDayBounds(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

function selectPeriods(periods, now) {
  const { end: todayEnd } = calendarDayBounds(new Date(now));
  const todayPeriods = periods.filter((p) => {
    const start = new Date(p.startTime).getTime();
    const end = new Date(p.endTime).getTime();
    return end > now && start < todayEnd;
  });
  const currentPeriod = todayPeriods.find((p) => {
    const start = new Date(p.startTime).getTime();
    const end = new Date(p.endTime).getTime();
    return now >= start && now < end;
  }) || todayPeriods[0] || null;
  const futureDaytime = periods
    .filter((p) => p.isDaytime && new Date(p.startTime).getTime() >= todayEnd)
    .slice(0, 6);
  return { currentPeriod, todayPeriods, futureDaytime, todayEnd };
}

function titleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseObservation(observation) {
  if (!observation) return null;
  const tempC = observation.temperature?.value;
  const observedAt = observation.timestamp;
  if (tempC == null || !observedAt) {
    console.debug('Observation present but missing temp or timestamp.', { tempC, observedAt });
    return null;
  }
  const age = Date.now() - new Date(observedAt).getTime();
  if (age > STALE_OBSERVATION_MS) {
    console.debug(`Observation ${Math.round(age / 60000)} min old (stale > ${STALE_OBSERVATION_MS / 60000}); falling back to hourly.`);
    return null;
  }
  return {
    tempC,
    observedAt,
    shortForecast: observation.textDescription || null,
  };
}

function currentConditions(observation, hourlyPeriods) {
  const hour = hourlyPeriods[0] || null;
  const parsed = parseObservation(observation);
  if (parsed) {
    return {
      tempF: cToF(parsed.tempC),
      shortForecast: parsed.shortForecast || hour?.shortForecast || '—',
      isDaytime: hour?.isDaytime ?? true,
      observedAt: parsed.observedAt,
      fromObservation: true,
    };
  }
  if (!hour) {
    return {
      tempF: '—',
      shortForecast: 'Unavailable',
      isDaytime: true,
      observedAt: null,
      fromObservation: false,
    };
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
  localStorage.removeItem(STORAGE_KEYS.alertsUrl);
  localStorage.removeItem(STORAGE_KEYS.locationName);
  localStorage.removeItem(STORAGE_KEYS.stationName);
  // Drop the cached alerts too — they belonged to the old location.
  localStorage.removeItem(STORAGE_KEYS.alerts);
  $alerts.hidden = true;
  $alerts.innerHTML = '';
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
