/* ─── Just the Weather ─────────────────────────────────────────────
 * Vanilla JS PWA. Fetches NWS forecast for Madison, WI.
 * No dependencies, no tracking, no nonsense.
 * ──────────────────────────────────────────────────────────────── */

const NWS_FORECAST_URL = 'https://api.weather.gov/gridpoints/MKX/33,68/forecast';

const STORAGE_KEYS = {
  theme: 'theme',
  forecast: 'forecast-cache',
  fetchedAt: 'forecast-fetched-at',
};

const THEME_STATES = ['system', 'light', 'dark'];
const THEME_ICONS = { system: '⚙', light: '☀', dark: '☾' };

// DOM refs (assigned after DOMContentLoaded since script is deferred but still safest)
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

// ─── Forecast fetch + render ──────────────────────────────────────

async function fetchForecast() {
  try {
    const res = await fetch(NWS_FORECAST_URL, {
      headers: { 'Accept': 'application/geo+json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const periods = data.properties.periods;

    // Cache for offline fallback
    localStorage.setItem(STORAGE_KEYS.forecast, JSON.stringify(periods));
    localStorage.setItem(STORAGE_KEYS.fetchedAt, new Date().toISOString());

    render(periods, { fromCache: false });
  } catch (err) {
    console.warn('Live fetch failed; trying cache:', err);
    const cached = localStorage.getItem(STORAGE_KEYS.forecast);
    if (cached) {
      render(JSON.parse(cached), { fromCache: true });
    } else {
      renderError();
    }
  }
}

function render(periods, { fromCache }) {
  // Current = the first (most current) period
  const current = periods[0];
  $current.innerHTML = `
    <div class="location">Madison, WI</div>
    <div class="temp">${current.temperature}°${current.temperatureUnit}</div>
    <div class="condition">${escapeHtml(current.shortForecast)} — ${escapeHtml(current.name)}</div>
  `;

  // 7-day forecast: filter to daytime periods and take the next 7
  const days = periods.filter(p => p.isDaytime).slice(0, 7);
  $forecastList.innerHTML = days.map(day => `
    <li>
      <span class="day">${escapeHtml(day.name)}</span>
      <span class="condition">${escapeHtml(day.shortForecast)}</span>
      <span class="temp">${day.temperature}°</span>
    </li>
  `).join('');

  // Status line
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
  // Defensive against any weird strings from the API ending up in innerHTML
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Boot ─────────────────────────────────────────────────────────

fetchForecast();

// Register the service worker (enables install + offline fallback)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(err => {
    console.warn('Service worker registration failed:', err);
  });
}
