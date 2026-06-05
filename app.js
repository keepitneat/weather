/* ─── Just the Weather ─────────────────────────────────────────────
 * Vanilla JS PWA. Fetches NWS forecast for the user's location (US only).
 * No dependencies, no tracking, no nonsense.
 * ──────────────────────────────────────────────────────────────── */

import { iconFor, alertIconFor, THEME_ICONS } from './icons.js';
import { normalizeAlerts, formatExpiry, formatExpiryExact } from './alerts.js';
import { titleCase } from './format.js';
import { normalizeTheme, themeAttr } from './theme.js';
import {
  isIosSafari,
  isFirefoxAndroid,
  isMacosSafari,
  isStandalone,
  installAffordance,
} from './install.js';
import {
  notificationsSupported,
  isEnabled as notifyEnabled,
  setEnabled as setNotifyEnabled,
  requestPermission as requestNotifyPermission,
  notifyNewAlerts,
  primeSeenIds,
  resetSeenIds,
} from './notifications.js';
import { geocode, looksLikeZip, shortLocationName } from './geocode.js';
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  findFavorite,
  getCurrentFavoriteId,
  setCurrentFavoriteId,
  clearCurrentFavoriteId,
  favoriteToLocation,
} from './favorites.js';

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

// The favorites module is pure over an injected store; localStorage is the
// real one. Bound here so every call site shares one store.
const favStore = localStorage;

// Tighter than 2hr throws away real readings for forecasts that are often less accurate at the current hour.
const STALE_OBSERVATION_MS = 2 * 60 * 60 * 1000;

// Map NWS severity → CSS class suffix (lowercased). Anything unrecognized (incl. "Unknown") gets the neutral .alert--unknown treatment.
const ALERT_SEVERITY_CLASS = {
  Extreme: 'extreme',
  Severe: 'severe',
  Moderate: 'moderate',
  Minor: 'minor',
};

const $alerts = document.getElementById('alerts');
const $current = document.getElementById('current');
const $todayList = document.getElementById('today-list');
const $forecastList = document.getElementById('forecast-list');
const $status = document.getElementById('status');
const $settingsToggle = document.getElementById('settings-toggle');
const $settingsMenu = document.getElementById('settings-menu');
const $themeRadios = $settingsMenu.querySelectorAll('input[name="theme"]');
const $notifyToggle = document.getElementById('notify-toggle');
const $notifyCheckbox = document.getElementById('notify-checkbox');

// ─── Theme control (explicit System / Light / Dark radios) ────────

function getThemeState() {
  return normalizeTheme(localStorage.getItem(STORAGE_KEYS.theme));
}

function applyTheme(state) {
  const attr = themeAttr(state);
  if (attr === null) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem(STORAGE_KEYS.theme);
  } else {
    document.documentElement.setAttribute('data-theme', attr);
    localStorage.setItem(STORAGE_KEYS.theme, attr);
  }
}

function syncThemeRadios(state) {
  $themeRadios.forEach((radio) => {
    radio.checked = radio.value === state;
  });
}

$themeRadios.forEach((radio) => {
  const icon = radio.closest('label').querySelector('.theme-icon');
  if (icon) icon.innerHTML = THEME_ICONS[radio.value] ?? '';
  radio.addEventListener('change', () => {
    if (radio.checked) applyTheme(radio.value);
  });
});

applyTheme(getThemeState());
syncThemeRadios(getThemeState());

// ─── Settings menu (open/close, focus, keyboard) ──────────────────

function openSettings() {
  $settingsMenu.hidden = false;
  $settingsToggle.setAttribute('aria-expanded', 'true');
  // Land focus on the first control so keyboard users go straight in.
  const first = $settingsMenu.querySelector('input:not([disabled])');
  first?.focus();
  document.addEventListener('click', onOutsideClick);
  document.addEventListener('keydown', onMenuKeydown);
}

function closeSettings({ restoreFocus = false } = {}) {
  $settingsMenu.hidden = true;
  $settingsToggle.setAttribute('aria-expanded', 'false');
  document.removeEventListener('click', onOutsideClick);
  document.removeEventListener('keydown', onMenuKeydown);
  if (restoreFocus) $settingsToggle.focus();
}

function settingsOpen() {
  return !$settingsMenu.hidden;
}

function onOutsideClick(event) {
  if (!event.target.closest('.settings')) closeSettings();
}

function onMenuKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSettings({ restoreFocus: true });
    return;
  }
  if (event.key === 'Tab') trapTab(event);
}

// Radios are a roving-tabstop group, so only the checked theme radio counts; a
// hidden control (e.g. the install button on platforms without a stashed prompt)
// can't take focus, so it's dropped too. Input order is DOM order, so first/last
// of the result are the trap's wrap points.
function focusableTabStops(elements) {
  return [...elements].filter((el) => !el.hidden && (el.type !== 'radio' || el.checked));
}

// Keep Tab inside the open menu. Query live each time so disabled controls (the
// notify checkbox on cold boot) and the hidden-or-shown install button reflect
// current state. The button selector is what lets the Install button be trapped.
function trapTab(event) {
  const focusable = focusableTabStops(
    $settingsMenu.querySelectorAll('input:not([disabled]), button:not([disabled])')
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

$settingsToggle.addEventListener('click', (event) => {
  // Stop the document listener (added on open) from immediately closing it.
  event.stopPropagation();
  settingsOpen() ? closeSettings() : openSettings();
});

// ─── Alert notifications toggle (opt-in, defaults OFF) ────────────

// Last-rendered alerts, so enabling the toggle can prime the seen-set
// against what's already on screen (no backlog notification dump).
let lastAlerts = [];

// The checkbox stays disabled (in the HTML) until the first render populates
// `lastAlerts` — opting in before then would prime against an empty set, so
// the first live fetch would dump a notification for every active alert.
function enableNotifyToggle() {
  if (notificationsSupported()) $notifyCheckbox.disabled = false;
}

// Hide the toggle entirely where Notifications aren't supported (e.g. an
// iOS Safari tab that isn't an installed PWA) — a dead checkbox is worse
// than no checkbox.
if (notificationsSupported()) {
  $notifyToggle.hidden = false;
  $notifyCheckbox.checked = notifyEnabled();
  $notifyCheckbox.addEventListener('change', async () => {
    if ($notifyCheckbox.checked) {
      // requestPermission can reject (e.g. insecure context) — treat a throw
      // exactly like a non-granted result so the checkbox never gets stuck
      // checked with the pref off.
      let permission = 'denied';
      try {
        permission = await requestNotifyPermission();
      } catch (err) {
        console.warn('Notification permission request failed:', err);
      }
      if (permission !== 'granted') {
        // Denied, dismissed, or thrown — revert the toggle; the OS won't re-prompt.
        $notifyCheckbox.checked = false;
        setNotifyEnabled(false);
        return;
      }
      setNotifyEnabled(true);
      primeSeenIds(lastAlerts);
    } else {
      setNotifyEnabled(false);
    }
  });
}

// ─── Install affordance (platform-aware, lives in settings menu) ──

const $installGroup = document.getElementById('install-group');
const $installButton = document.getElementById('install-button');
const $installIos = document.getElementById('install-ios');
const $installFirefoxAndroid = document.getElementById('install-firefox-android');
const $installMacosSafari = document.getElementById('install-macos-safari');
const $installDismissed = document.getElementById('install-dismissed');

// beforeinstallprompt is Chromium-only and fires once: preventDefault suppresses
// the legacy mini-infobar, and we stash the event so the Install button can
// replay it on a user gesture (it can't be re-fired manually otherwise).
let deferredInstallPrompt = null;

// Set when the user dismisses the OS install dialog. We can't re-prompt without
// a reload, so we keep the group visible with a manual hint instead of vanishing.
let installPromptDismissed = false;

// UA-derived flags are session-constant — compute once. A touch-capable
// Macintosh is iPadOS (see isIosSafari), so thread maxTouchPoints through.
const isTouchDevice = navigator.maxTouchPoints > 1;
const UA_FLAGS = {
  iosSafari: isIosSafari(navigator.userAgent, isTouchDevice),
  firefoxAndroid: isFirefoxAndroid(navigator.userAgent),
  macosSafari: isMacosSafari(navigator.userAgent, isTouchDevice),
};

// standalone + promptAvailable are the reactive inputs; merge them onto the
// session-constant UA flags.
function installContext() {
  return {
    ...UA_FLAGS,
    standalone: isStandalone({
      displayModeStandalone: matchMedia('(display-mode: standalone)').matches,
      navigatorStandalone: navigator.standalone === true,
    }),
    promptAvailable: deferredInstallPrompt !== null,
  };
}

const INSTALL_ELEMENTS = {
  'install-button': $installButton,
  'ios-instructions': $installIos,
  'firefox-android-instructions': $installFirefoxAndroid,
  'macos-safari-instructions': $installMacosSafari,
};

function renderInstallAffordance() {
  const state = installAffordance(installContext());
  for (const [name, el] of Object.entries(INSTALL_ELEMENTS)) {
    el.hidden = name !== state;
  }
  // The dismiss hint rides alongside the Chromium button: once the user has
  // dismissed the prompt the button is gone, but the hint keeps the entry point.
  $installDismissed.hidden = !(installPromptDismissed && state === 'none');
  $installGroup.hidden = state === 'none' && !installPromptDismissed;
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  renderInstallAffordance();
});

// Once installed, drop the affordance for the rest of the session.
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installPromptDismissed = false;
  renderInstallAffordance();
});

$installButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  // A prompt event is single-use; clear it before awaiting so a double-click
  // can't replay a consumed event.
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await prompt.prompt();
  // On 'accepted' the appinstalled listener hides the affordance; on 'dismissed'
  // keep the group visible with a manual hint, since the event can't be re-fired.
  const { outcome } = await prompt.userChoice;
  if (outcome === 'dismissed') installPromptDismissed = true;
  renderInstallAffordance();
});

renderInstallAffordance();

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
  const cachedAlerts = localStorage.getItem(STORAGE_KEYS.alertsUrl);
  const cachedName = localStorage.getItem(STORAGE_KEYS.locationName);
  const cachedStationName = localStorage.getItem(STORAGE_KEYS.stationName);
  if (cachedForecast && cachedHourly && cachedName) {
    // observationUrl may be null on upgrade. Backfill it fire-and-forget so the
    // cached forecast paints without waiting on a station round-trip; the URL
    // lands in storage for next boot. This render goes out with no observation.
    if (!cachedObservation) {
      backfillObservationUrl(cachedForecast);
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
    const resolved = await resolveFromCoords(latitude, longitude);
    persistLocation(resolved);
    return resolved;
  } catch (err) {
    console.warn('Location resolution failed; using fallback:', err);
    return FALLBACK;
  }
}

// Coords → NWS forecast/hourly/observation/alerts URLs + a display name.
// Pure resolution: it does the network work and returns a location object but
// does NOT persist — callers persist only after a fully-successful resolve
// (resolve-then-commit), so a mid-flight failure never strands the user with a
// half-cleared cache. Shared by the geolocation path and the manual search.
// `nameOverride` lets the search use the user's matched address instead of the
// gridpoint's relativeLocation (the nearest place to the grid CENTER, not them).
async function resolveFromCoords(latitude, longitude, nameOverride = null) {
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
  const locationName = nameOverride || `${loc.city}, ${loc.state}`;

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

  // lat/lon ride along so the caller can persist them on a favorite (favorites
  // re-derive their alertsUrl from coords rather than storing it).
  return { lat: latitude, lon: longitude, forecastUrl, hourlyUrl, observationUrl, alertsUrl, locationName, stationName };
}

// Write a resolved location's pointers to storage. Separated from
// resolveFromCoords so the network work can complete into locals before any
// cache is touched (resolve-then-commit). Null URLs/names are skipped so an
// upgrade path that lacks an observation/station doesn't write `null`.
function persistLocation(location) {
  localStorage.setItem(STORAGE_KEYS.forecastUrl, location.forecastUrl);
  localStorage.setItem(STORAGE_KEYS.hourlyUrl, location.hourlyUrl);
  if (location.observationUrl) {
    localStorage.setItem(STORAGE_KEYS.observationUrl, location.observationUrl);
  }
  localStorage.setItem(STORAGE_KEYS.alertsUrl, location.alertsUrl);
  if (location.stationName) {
    localStorage.setItem(STORAGE_KEYS.stationName, location.stationName);
  }
  localStorage.setItem(STORAGE_KEYS.locationName, location.locationName);
}

// Fire-and-forget: resolve the observation station from a cached forecast URL
// and stash it for the next boot. Intentionally not awaited — a failure just
// means we try again next load.
async function backfillObservationUrl(forecastUrl) {
  const resolved = await resolveStationFromForecastUrl(forecastUrl);
  if (resolved) {
    localStorage.setItem(STORAGE_KEYS.observationUrl, resolved.observationUrl);
    localStorage.setItem(STORAGE_KEYS.stationName, resolved.stationName);
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

// `primeNotifications` marks a deliberate location switch: the seen-set was
// just reset, so we prime it against this location's active alerts (rather than
// firing a notification for each) — the user picked this place; they don't want
// a backlog dump. Later fetches for the same location notify normally.
async function fetchForecast(
  { forecastUrl, hourlyUrl, observationUrl, alertsUrl, locationName, stationName },
  { primeNotifications = false } = {}
) {
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

    render({ periods, hourlyPeriods, observation, alerts, locationName, stationName, fromCache: false, primeNotifications });
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

// Prime or diff-and-notify the alert seen-set for this render, and record the
// alerts so enabling the toggle can prime against what's on screen. On a
// deliberate location switch the seen-set was just reset, so prime against this
// location's active alerts instead of notifying (no backlog dump for a place the
// user just chose). Cached renders were already notified on a prior live fetch.
// Otherwise diff-and-notify on fresh data.
function reconcileAlertNotifications({ alerts, fromCache, primeNotifications }) {
  lastAlerts = alerts;
  if (primeNotifications) {
    primeSeenIds(alerts);
  } else if (!fromCache) {
    notifyNewAlerts(alerts);
  }
  // lastAlerts is now populated — safe to let the user opt in (see above).
  enableNotifyToggle();
}

function render({ periods, hourlyPeriods, observation, alerts, locationName, stationName, fromCache, primeNotifications = false }) {
  const safeAlerts = alerts || [];
  renderAlerts(safeAlerts, fromCache);
  reconcileAlertNotifications({ alerts: safeAlerts, fromCache, primeNotifications });

  const now = Date.now();
  const { currentPeriod, todayPeriods, futureDaytime, todayEnd } =
    selectPeriods(periods, now);

  renderCurrent({ observation, hourlyPeriods, locationName, stationName });
  renderToday({ currentPeriod, todayPeriods, hourlyPeriods, now, todayEnd });
  renderForecast({ futureDaytime, hourlyPeriods });
  renderStatus(fromCache);
  document.body.classList.remove('is-switching'); // new content painted — undim
}

// Trim a long NWS station name to its first comma-segment, capped, so the
// observed line stays one tidy line.
function shortStationName(name) {
  if (!name) return '';
  const first = String(name).split(',')[0].trim();
  return first.length > 28 ? `${first.slice(0, 27).trimEnd()}…` : first;
}

// ─── Location chip icons + displayed-location state ────────────────
// Defined above renderCurrent (which reads displayed* and the SVGs); the rest
// of the favorites/menu code lives further down.

const PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/></svg>';
const STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round" aria-hidden="true"><polygon points="12,3 14.5,8.7 20.7,9.4 16,13.7 17.3,19.8 12,16.7 6.7,19.8 8,13.7 3.3,9.4 9.5,8.7"/></svg>';
const SEARCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
const PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

// The location currently on screen, kept so "Add to favorites" has the resolved
// data (incl. lat/lon) to persist without a re-resolve. null until first render.
let displayedLocation = null;
// id of the favorite being shown, or null for Current location (the home entry).
let displayedFavoriteId = null;

function renderCurrent({ observation, hourlyPeriods, locationName, stationName }) {
  const conditions = currentConditions(observation, hourlyPeriods);
  // City as headline; station name (often ALL-CAPS airport jargon) goes in the observed-at line as provenance.
  let observedLine;
  if (conditions.fromObservation) {
    const stationLabel = stationName ? ` at ${titleCase(shortStationName(stationName))}` : '';
    observedLine = `Observed ${formatRelative(conditions.observedAt)}${stationLabel}`;
  } else {
    observedLine = 'Latest forecast (no station data)';
  }
  $current.innerHTML = `
    <div class="location">
      <button class="loc-chip" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="location-menu">
        ${displayedFavoriteId === null ? PIN_SVG : STAR_SVG}
        <span class="loc-chip-name">${escapeHtml(locationName)}</span>
        <span class="caret" aria-hidden="true">▾</span>
      </button>
      <div class="loc-actions">
        <button class="refresh-location" type="button" aria-label="Refresh" title="Refresh this location">↻</button>
      </div>
      <div id="location-menu" aria-label="Location" hidden></div>
    </div>
    <div aria-live="polite">
      <div class="temp">${conditions.tempF}°F</div>
      <div class="condition">${iconFor(conditions.shortForecast, conditions.isDaytime)} ${escapeHtml(conditions.shortForecast)}</div>
      <div class="observed-at">${observedLine}</div>
    </div>
  `;
}

function renderToday({ currentPeriod, todayPeriods, hourlyPeriods, now, todayEnd }) {
  $todayList.innerHTML = currentPeriod
    ? currentDayCard(currentPeriod, todayPeriods, hourlyPeriods, now, todayEnd)
    : '';
}

function renderForecast({ futureDaytime, hourlyPeriods }) {
  const forecastCards = futureDaytime.map((dayPeriod) => {
    const { start, end } = calendarDayBounds(new Date(dayPeriod.startTime));
    return periodCard(dayPeriod, hourlyPeriods, {
      open: false,
      hourlyStart: start,
      hourlyEnd: end,
    });
  });
  $forecastList.innerHTML = forecastCards.join('');
}

function renderStatus(fromCache) {
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
  // Loud alerts open by default so the life-safety text shows without a click.
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
  const body = headline || description || link
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

function expiryChip(alert) {
  const relative = formatExpiry(alert.expires);
  const exact = formatExpiryExact(alert.expires);
  if (!exact) return `<span class="alert-expiry">${escapeHtml(relative)}</span>`;
  return `<time class="alert-expiry alert-expiry--toggle" datetime="${escapeHtml(alert.expires)}"
       title="${escapeHtml(exact)}" data-relative="${escapeHtml(relative)}" data-exact="${escapeHtml(exact)}"
     >${escapeHtml(relative)}</time>`;
}

// Tap to swap relative ↔ exact text
$alerts.addEventListener('click', (event) => {
  const chip = event.target.closest('.alert-expiry--toggle');
  if (!chip) return;
  event.preventDefault();
  const showingExact = chip.dataset.showing === 'exact';
  chip.textContent = showingExact ? chip.dataset.relative : chip.dataset.exact;
  chip.dataset.showing = showingExact ? 'relative' : 'exact';
});

// Shared disclosure-card shell: an <li> wrapping a <details> whose <summary> is
// `summary` and whose body is the `hours` hourly periods (or an empty-state).
function cardShell({ summary, hours, open = false, liClass = '' }) {
  const liAttr = liClass ? ` class="${liClass}"` : '';
  const body = hours.length === 0
    ? '<li class="hourly-empty">No hourly data available.</li>'
    : hours.map(renderHour).join('');
  return `
    <li${liAttr}>
      <details${open ? ' open' : ''}>
        <summary>${summary}</summary>
        <ol class="hourly">${body}</ol>
      </details>
    </li>
  `;
}

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
  return cardShell({
    liClass: 'current-day',
    summary: `<div class="day-summary">${summaryRows}</div>`,
    hours: hoursForDay,
  });
}

function periodCard(period, hourlyPeriods, { open, hourlyStart, hourlyEnd }) {
  const filterStart = Math.max(hourlyStart, Date.now());
  const hoursForPeriod = hourlyPeriods.filter((h) => {
    const t = new Date(h.startTime).getTime();
    return t >= filterStart && t < hourlyEnd;
  });
  const summary = `
    <span class="day">${escapeHtml(period.name)}</span>
    <span class="condition">${iconFor(period.shortForecast, period.isDaytime)} ${escapeHtml(period.shortForecast)}</span>
    <span class="temp">${period.temperature}°</span>
  `;
  return cardShell({ summary, hours: hoursForPeriod, open });
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
  document.body.classList.remove('is-switching');
  // Nothing on screen, so an empty set is the correct prime (not a backlog
  // dump) — enable opt-in rather than leave the toggle dead for the session.
  lastAlerts = [];
  enableNotifyToggle();
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

// ─── Manual location refresh + search ─────────────────────────────

// Drop EVERY piece of location-scoped state so nothing from the old location
// can leak into the new one: the NWS endpoint pointers, the display/station
// names, and all the data caches (forecast/hourly/observation/alerts). Also
// reset the alert seen-set — it's keyed by alert id, not location, so without
// this the new location's already-active alerts could be diffed against the
// old location's ids and suppressed. Used by both "update" and search, and
// only after a successful resolve (resolve-then-commit).
function clearLocationCache() {
  localStorage.removeItem(STORAGE_KEYS.forecastUrl);
  localStorage.removeItem(STORAGE_KEYS.hourlyUrl);
  localStorage.removeItem(STORAGE_KEYS.observationUrl);
  localStorage.removeItem(STORAGE_KEYS.alertsUrl);
  localStorage.removeItem(STORAGE_KEYS.locationName);
  localStorage.removeItem(STORAGE_KEYS.stationName);
  localStorage.removeItem(STORAGE_KEYS.forecast);
  localStorage.removeItem(STORAGE_KEYS.hourly);
  localStorage.removeItem(STORAGE_KEYS.observation);
  localStorage.removeItem(STORAGE_KEYS.alerts);
  resetSeenIds();
}

function showLocationLoading(message) {
  // If a card is already on screen, dim it in place and let the next render swap
  // the content in — avoids the teardown "flash" when switching or refreshing.
  // Only blank to a loading message on first load, when there's nothing to keep.
  if ($current.querySelector('.loc-chip')) {
    document.body.classList.add('is-switching');
    return;
  }
  $alerts.hidden = true;
  $alerts.innerHTML = '';
  $current.innerHTML = `<p class="loading">${escapeHtml(message)}</p>`;
  $todayList.innerHTML = '';
  $forecastList.innerHTML = '';
  $status.hidden = true;
}

// Re-run geolocation. Resolve-then-commit: do the geolocation + NWS resolve
// into a local FIRST, and only clear the old cache + persist once we have a
// complete new location. If anything throws, the prior cache is intact, so we
// restore the previous view instead of stranding the user on a loading screen
// with a deleted location.
async function updateLocation() {
  // Snapshot what's on screen so a failure can restore it rather than blanking.
  const previousLocation = currentLocationFromCache();
  showLocationLoading('Updating location…');
  try {
    if (!('geolocation' in navigator)) {
      throw new Error('Geolocation is not available.');
    }
    const position = await getBrowserPosition();
    const { latitude, longitude } = position.coords;
    const location = await resolveFromCoords(latitude, longitude);

    clearLocationCache();
    clearCurrentFavoriteId(favStore);
    persistLocation(location);
    setDisplayed(location, null);
    await fetchForecast(location, { primeNotifications: true });
  } catch (err) {
    console.warn('Location update failed; keeping previous location:', err);
    if (previousLocation) {
      await fetchForecast(previousLocation);
    } else {
      const location = await resolveLocation();
      persistLocation(location);
      setDisplayed(location, null);
      await fetchForecast(location);
    }
  }
}

// Refresh whatever's on screen. For a saved favorite, re-fetch its data (reuses
// the cached URLs — no geocode). For Current location, re-run geolocation, since
// "refresh" of a GPS-derived view means re-checking where you are.
function refreshDisplayed() {
  if (displayedFavoriteId === null) {
    updateLocation();
  } else if (displayedLocation) {
    fetchForecast(displayedLocation);
  }
}

// Reconstruct the current location object from the cached pointers, or null if
// nothing is cached. Used to restore the prior view when a location switch fails.
function currentLocationFromCache() {
  const forecastUrl = localStorage.getItem(STORAGE_KEYS.forecastUrl);
  const hourlyUrl = localStorage.getItem(STORAGE_KEYS.hourlyUrl);
  const locationName = localStorage.getItem(STORAGE_KEYS.locationName);
  if (!forecastUrl || !hourlyUrl || !locationName) return null;
  return {
    forecastUrl,
    hourlyUrl,
    observationUrl: localStorage.getItem(STORAGE_KEYS.observationUrl) || null,
    alertsUrl: localStorage.getItem(STORAGE_KEYS.alertsUrl) || null,
    locationName,
    stationName: localStorage.getItem(STORAGE_KEYS.stationName) || null,
  };
}

// Geocode the query, take the top match, resolve to NWS endpoints, render.
// Resolve-then-commit: geocode + NWS resolve run before we touch the cache, so a
// miss or failure leaves the current location intact and is reported via onError.
// Returns true once a switch is committed, false otherwise (the menu caller closes
// the menu only on true).
async function searchLocation(query, { onError = () => {} } = {}) {
  const trimmed = (query || '').trim();
  if (!trimmed) { onError('Enter a city or ZIP code.'); return false; }
  try {
    const matches = await geocode(trimmed);
    if (matches.length === 0) {
      onError(looksLikeZip(trimmed)
        ? 'No US location found for that ZIP code.'
        : 'No match — try "City, ST" (e.g. "Madison, WI") or a ZIP code.');
      return false;
    }
    const { name, lat, lon } = matches[0];
    const location = await resolveFromCoords(lat, lon, name);

    showLocationLoading(`Loading weather for ${name}…`);
    clearLocationCache();
    // If the searched place is already saved, show the FAVORITE's stored data
    // (its custom label/station) rather than the bare geocode name.
    const existing = getFavorites(favStore).find((f) => f.forecastUrl === location.forecastUrl);
    const displayLocation = existing ? favoriteToLocation(existing) : location;
    persistLocation(displayLocation);
    setDisplayed(displayLocation, existing ? existing.id : null);
    await fetchForecast(displayLocation, { primeNotifications: true });
    return true;
  } catch (err) {
    console.warn('Location search failed:', err);
    onError("Couldn't search right now. Check your connection and try again.");
    return false;
  }
}

// ─── Favorites (saved locations + location menu) ───────────────────

// Snapshot what's displayed after every successful fetch so the switcher can
// mark the active entry and "Add to favorites" can save the exact resolved data.
function setDisplayed(location, favoriteId) {
  displayedLocation = location;
  displayedFavoriteId = favoriteId ?? null;
  if (favoriteId) {
    setCurrentFavoriteId(favStore, favoriteId);
  } else {
    clearCurrentFavoriteId(favStore);
  }
  renderLocationMenu();
}

// Flip the chip's leading icon between pin (Current location) and star (a saved
// place) when the displayed entry changes without a full re-render — e.g. right
// after saving the current view as a favorite.
function updateChipIcon() {
  const svg = chipEl()?.querySelector('svg');
  // Assigning outerHTML detaches the old node and inserts fresh markup; the
  // local `svg` ref goes stale here and is intentionally not reused afterward.
  if (svg) svg.outerHTML = displayedFavoriteId === null ? PIN_SVG : STAR_SVG;
}

// A favorite is saveable only when we have its coords (a search/geolocation
// resolve), and only when the shown location isn't already one. Current
// location is never offered as a save (it's the always-present home entry).
function canSaveDisplayed() {
  if (!displayedLocation || displayedFavoriteId) return false;
  if (!Number.isFinite(displayedLocation.lat) || !Number.isFinite(displayedLocation.lon)) return false;
  const already = getFavorites(favStore).some(
    (f) => f.forecastUrl === displayedLocation.forecastUrl
  );
  return !already;
}

// The menu node is rebuilt inside .location on every renderCurrent, so query it
// live (never cache) and delegate all listeners on the stable #current/document.
const menuEl = () => document.getElementById('location-menu');
const chipEl = () => $current.querySelector('.loc-chip');
let menuSearchOpen = false; // menu showing its inline search sub-state

function locationMenuItems() {
  const homeActive = displayedFavoriteId === null;
  const home = `<button class="loc-item${homeActive ? ' loc-item--active' : ''}" type="button" data-home="true">
      ${PIN_SVG}<span>Current location</span>${homeActive ? '<span class="check" aria-hidden="true">✓</span>' : ''}
    </button>`;
  const favs = getFavorites(favStore).map((f) => {
    const active = f.id === displayedFavoriteId;
    return `<div class="loc-item-row" role="none">
        <button class="loc-item${active ? ' loc-item--active' : ''}" type="button" data-favorite-id="${escapeHtml(f.id)}">
          ${STAR_SVG}<span>${escapeHtml(f.label)}</span>
        </button>
        <button class="loc-item-remove" type="button" data-remove-id="${escapeHtml(f.id)}" aria-label="Remove ${escapeHtml(f.label)}">×</button>
      </div>`;
  }).join('');
  const save = canSaveDisplayed()
    ? `<button class="loc-item" type="button" data-save="true">${PLUS_SVG} Save this location</button>`
    : '';
  const search = `<button class="loc-item" type="button" data-search="true">${SEARCH_SVG} Search a place…</button>`;
  return `${home}${favs}<div class="loc-menu-sep"></div>${search}${save}`;
}

function searchSubState() {
  return `<div class="loc-menu-search">
      <input id="loc-menu-input" type="text" placeholder="City, ST or ZIP" autocomplete="off" aria-label="Search location">
      <button id="loc-menu-go" type="button">Go</button>
    </div>
    <div class="loc-menu-hint">City, ST (e.g. "Madison, WI") or a ZIP works best · Esc to cancel</div>
    <div class="loc-menu-error" id="loc-menu-error" hidden></div>`;
}

function renderLocationMenu() {
  const el = menuEl();
  if (el) el.innerHTML = menuSearchOpen ? searchSubState() : locationMenuItems();
}

function openMenu() {
  menuSearchOpen = false;
  renderLocationMenu();
  const el = menuEl();
  if (!el) return;
  el.hidden = false;
  chipEl()?.setAttribute('aria-expanded', 'true');
  el.querySelector('.loc-item, input')?.focus();
}
function closeMenu({ restoreFocus = false } = {}) {
  const el = menuEl();
  if (el) el.hidden = true;
  menuSearchOpen = false;
  const chip = chipEl();
  chip?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) chip?.focus();
}
function menuOpen() { const el = menuEl(); return el && !el.hidden; }
function openMenuSearch() {
  menuSearchOpen = true;
  renderLocationMenu();
  document.getElementById('loc-menu-input')?.focus();
}
async function runMenuSearch() {
  const input = document.getElementById('loc-menu-input');
  if (!input) return;
  const ok = await searchLocation(input.value, {
    onError: (msg) => { const e = document.getElementById('loc-menu-error'); if (e) { e.textContent = msg; e.hidden = false; } },
  });
  if (ok) closeMenu();
}

// Switch to a saved favorite. Reuses the NEAT-58 resolve-then-commit discipline:
// the favorite already holds resolved URLs, so we snapshot the current view,
// clear the stale cache + alert seen-set, persist the favorite's pointers, and
// fetch. A fetch failure inside fetchForecast falls back to that favorite's own
// cache, so there's no half-switched state to unwind here.
async function switchToFavorite(id) {
  const fav = findFavorite(favStore, id);
  if (!fav) return;
  const location = favoriteToLocation(fav);
  showLocationLoading(`Loading weather for ${fav.label}…`);
  clearLocationCache();
  persistLocation(location);
  setDisplayed(location, fav.id);
  await fetchForecast(location, { primeNotifications: true });
}

// Switch back to the geolocation-resolved home. clearLocationCache wipes the
// cached pointers, so resolveLocation re-runs geolocation (or falls back) rather
// than reading the just-cleared cache.
async function switchToCurrentLocation() {
  showLocationLoading('Updating location…');
  clearLocationCache();
  clearCurrentFavoriteId(favStore);
  const location = await resolveLocation();
  persistLocation(location);
  setDisplayed(location, null);
  await fetchForecast(location, { primeNotifications: true });
}

function saveDisplayedAsFavorite() {
  if (!canSaveDisplayed()) return;
  const fav = addFavorite(favStore, displayedLocation);
  // Now that it's saved, the displayed location IS that favorite — flip the
  // pointer so the pill shows active and the add action disappears.
  setDisplayed(displayedLocation, fav.id);
  // The only path that flips the icon WITHOUT an imminent render(): switch
  // paths repaint the chip (icon + name together) via render(), but saving in
  // place doesn't re-fetch, so flip the icon explicitly here.
  updateChipIcon();
}

function removeDisplayedFavorite(id) {
  const wasShowing = id === displayedFavoriteId;
  removeFavorite(favStore, id);
  if (wasShowing) {
    switchToCurrentLocation();
  } else {
    renderLocationMenu();
  }
}

// All click handling delegated on the stable #current section.
$current.addEventListener('click', (event) => {
  if (event.target.closest('.refresh-location')) { refreshDisplayed(); return; }
  if (event.target.closest('.loc-chip')) { menuOpen() ? closeMenu() : openMenu(); return; }

  // menu items (only fire when the click is inside the menu). Stop here so the
  // click never reaches the document outside-click handler — re-rendering the
  // menu detaches event.target, which that handler would misread as "outside".
  if (!event.target.closest('#location-menu')) return;
  event.stopPropagation();
  const remove = event.target.closest('[data-remove-id]');
  if (remove) { removeDisplayedFavorite(remove.dataset.removeId); return; }
  if (event.target.closest('[data-search]')) { openMenuSearch(); return; }
  if (event.target.closest('#loc-menu-go')) { runMenuSearch(); return; }
  if (event.target.closest('[data-save]')) { saveDisplayedAsFavorite(); closeMenu(); return; }
  if (event.target.closest('[data-home]')) { if (displayedFavoriteId !== null) switchToCurrentLocation(); closeMenu(); return; }
  const fav = event.target.closest('[data-favorite-id]');
  if (fav) { if (fav.dataset.favoriteId !== displayedFavoriteId) switchToFavorite(fav.dataset.favoriteId); closeMenu(); }
});

$current.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuOpen()) { event.preventDefault(); menuSearchOpen ? openMenu() : closeMenu({ restoreFocus: true }); return; }
  if (!event.target.closest('#location-menu')) return;
  if (event.key === 'Enter' && event.target.id === 'loc-menu-input') { event.preventDefault(); runMenuSearch(); }
});

document.addEventListener('click', (event) => {
  if (menuOpen() && !event.target.closest('.location')) closeMenu();
});

// ─── Boot ─────────────────────────────────────────────────────────

// On boot, restore the favorite the user last viewed (if it still exists);
// otherwise show Current location. A favorite switch reads cached URLs only —
// no geocode/points round-trip.
(async () => {
  const savedId = getCurrentFavoriteId(favStore);
  const fav = savedId ? findFavorite(favStore, savedId) : null;
  if (fav) {
    const location = favoriteToLocation(fav);
    persistLocation(location);
    setDisplayed(location, fav.id);
    fetchForecast(location);
    return;
  }
  const location = await resolveLocation();
  setDisplayed(location, null);
  fetchForecast(location);
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch((err) => {
    console.warn('Service worker registration failed:', err);
  });
}
