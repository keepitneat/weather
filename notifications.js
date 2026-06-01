/* ─── Alert notifications (opt-in) ─────────────────────────────────
 * Fires a browser Notification for each genuinely-new weather alert.
 *
 * v1 is inline-only: notifications fire when the page is open (or the SW
 * is awake). True push-when-closed needs the Push API + a server, which
 * breaks the no-backend principle — out of scope.
 *
 * Gotchas:
 *  - Notifications API needs a secure context (HTTPS); localhost is the
 *    dev exception.
 *  - iOS Safari only delivers notifications to PWAs added to the home
 *    screen — in a regular tab the permission request no-ops.
 * ──────────────────────────────────────────────────────────────── */

export const NOTIFY_PREF_KEY = 'notify-alerts';
export const SEEN_IDS_KEY = 'alerts-seen-ids';

// ─── Pure diff core (unit-tested, no DOM/Notification needed) ──────

// Alerts whose id we haven't recorded yet. Alerts without an id are
// skipped — we can't de-dupe an untagged alert, so notifying on it would
// re-fire on every fetch.
export function newAlerts(alerts, seenIds) {
  if (!Array.isArray(alerts)) return [];
  const seen = seenIds instanceof Set ? seenIds : new Set(seenIds || []);
  return alerts.filter((a) => a?.id && !seen.has(a.id));
}

// The next seen-id set: only ids still in the active list. Pruning
// gone alerts keeps the store bounded; if a pruned alert returns later,
// re-notifying once is the acceptable cost. This is a replace, not a
// merge — the prior set is intentionally discarded.
export function pruneSeenIds(activeAlerts) {
  const ids = (activeAlerts || []).map((a) => a?.id).filter(Boolean);
  return new Set(ids);
}

// ─── localStorage persistence ──────────────────────────────────────

export function isEnabled() {
  return localStorage.getItem(NOTIFY_PREF_KEY) === 'on';
}

export function setEnabled(on) {
  localStorage.setItem(NOTIFY_PREF_KEY, on ? 'on' : 'off');
}

function loadSeenIds() {
  try {
    const raw = localStorage.getItem(SEEN_IDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSeenIds(seenSet) {
  localStorage.setItem(SEEN_IDS_KEY, JSON.stringify([...seenSet]));
}

// ─── Browser glue ──────────────────────────────────────────────────

export function notificationsSupported() {
  return typeof Notification !== 'undefined';
}

// Returns the resulting permission ('granted' | 'denied' | 'default').
// Denial sticks at the browser level, so we never re-prompt — calling
// requestPermission again after a denial just returns 'denied'.
export async function requestPermission() {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

function fire(alert) {
  const n = new Notification(alert.event || 'Weather Alert', {
    body: alert.headline || alert.description || '',
    icon: '/icons/icon-192.png',
    tag: alert.id, // tag collapses repeats of the same alert into one
  });
  // Clicking focuses an open tab if there is one, else opens the app.
  n.onclick = () => {
    window.focus();
    n.close();
  };
}

// Diff the freshly-fetched alerts against what we've already notified,
// fire one notification per new alert, then persist the new seen set.
// No-ops unless the user opted in and granted permission.
export function notifyNewAlerts(alerts) {
  if (!isEnabled() || !notificationsSupported()) return;
  if (Notification.permission !== 'granted') return;

  const fresh = newAlerts(alerts, loadSeenIds());
  fresh.forEach(fire);
  saveSeenIds(pruneSeenIds(alerts));
}

// When the user enables notifications, prime the seen set with the
// currently-active alerts so flipping the toggle doesn't dump a
// backlog notification for every alert already on screen.
export function primeSeenIds(alerts) {
  saveSeenIds(pruneSeenIds(alerts));
}
