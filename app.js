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
  locationName: 'New York, NY',
};

const STORAGE_KEYS = {
  theme: 'theme',
  forecastUrl: 'forecast-url',
  locationName: 'location-name',
  forecast: 'forecast-cache',
  fetchedAt: 'forecast-fetched-at',
};

const THEME_STATES = ['system', 'light', 'dark'];
const THEME_ICONS = { system: '⚙', light: '☀', dark: '☾' };

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
      maximumAge: 60 * 60 * 1000, // accept positions up to 1hr old
    });
  });
}

async function resolveLocation() {
  // 1. Use cached forecast URL if we have one (gridpoints are stable).
  const cachedUrl = localStorage.getItem(STORAGE_KEYS.forecastUrl);
  const cachedName = localStorage.getItem(STORAGE_KEYS.locationName);
  if (cachedUrl && cachedName) {
    return { forecastUrl: cachedUrl, locationName: cachedName };
  }

  // 2. Try the Geolocation API.
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
    const loc = points.properties.relativeLocation.properties;
    const locationName = `${loc.city}, ${loc.state}`;

    // Cache so we don't re-prompt + re-fetch the gridpoint next time.
    localStorage.setItem(STORAGE_KEYS.forecastUrl, forecastUrl);
    localStorage.setItem(STORAGE_KEYS.locationName, locationName);

    return { forecastUrl, locationName };
  } catch (err) {
    // Permission denied, timeout, outside US, etc. — fall back gracefully.
    console.warn('Location resolution failed; using fallback:', err);
    return FALLBACK;
  }
}

// ─── Forecast fetch + render ──────────────────────────────────────

async function fetchForecast(forecastUrl, locationName) {
  try {
    const res = await fetch(forecastUrl, {
      headers: { 'Accept': 'application/geo+json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const periods = data.properties.periods;

    localStorage.setItem(STORAGE_KEYS.forecast, JSON.stringify(periods));
    localStorage.setItem(STORAGE_KEYS.fetchedAt, new Date().toISOString());

    render(periods, locationName, { fromCache: false });
  } catch (err) {
    console.warn('Live fetch failed; trying cache:', err);
    const cached = localStorage.getItem(STORAGE_KEYS.forecast);
    if (cached) {
      render(JSON.parse(cached), locationName, { fromCache: true });
    } else {
      renderError();
    }
  }
}

function render(periods, locationName, { fromCache }) {
  const current = periods[0];
  $current.innerHTML = `
    <div class="location">
      <span>${escapeHtml(locationName)}</span>
      <button class="update-location" type="button">update</button>
    </div>
    <div class="temp">${current.temperature}°${current.temperatureUnit}</div>
    <div class="condition">${escapeHtml(current.shortForecast)} — ${escapeHtml(current.name)}</div>
  `;

  const days = periods.filter((p) => p.isDaytime).slice(0, 7);
  $forecastList.innerHTML = days
    .map(
      (day) => `
    <li>
      <span class="day">${escapeHtml(day.name)}</span>
      <span class="condition">${escapeHtml(day.shortForecast)}</span>
      <span class="temp">${day.temperature}°</span>
    </li>
  `
    )
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
  localStorage.removeItem(STORAGE_KEYS.locationName);
  $current.innerHTML = `<p class="loading">Updating location…</p>`;
  $forecastList.innerHTML = '';
  $status.hidden = true;
  const { forecastUrl, locationName } = await resolveLocation();
  await fetchForecast(forecastUrl, locationName);
}

// Event delegation — the button is re-rendered inside #current each fetch.
$current.addEventListener('click', (event) => {
  if (event.target.closest('.update-location')) {
    updateLocation();
  }
});

// ─── Boot ─────────────────────────────────────────────────────────

(async () => {
  const { forecastUrl, locationName } = await resolveLocation();
  fetchForecast(forecastUrl, locationName);
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch((err) => {
    console.warn('Service worker registration failed:', err);
  });
}
