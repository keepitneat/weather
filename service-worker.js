/* ─── Just the Weather — Service Worker ──────────────────────────
 * Caches the app shell so the app installs as a PWA + works offline.
 * The NWS API call passes through to the network; app.js handles
 * the forecast-data cache via localStorage.
 *
 * To force clients to pick up changes: bump CACHE_VERSION below
 * and redeploy. Old caches get cleaned up automatically on activate.
 * ──────────────────────────────────────────────────────────────── */

const CACHE_VERSION = 'v11';
const CACHE_NAME = `just-the-weather-${CACHE_VERSION}`;

const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/alerts.js',
  '/icons.js',
  '/format.js',
  '/notifications.js',
  '/theme.js',
  '/install.js',
  '/geocode.js',
  '/favorites.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon.svg',
];

// ─── Install: precache the app shell ─────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Activate this SW as soon as it's installed (don't wait for old tabs to close).
  self.skipWaiting();
});

// ─── Activate: delete old cache versions ─────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('just-the-weather-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  // Take control of all open clients immediately.
  self.clients.claim();
});

// ─── Fetch: cache-first for same-origin, pass-through for the API ──

self.addEventListener('fetch', (event) => {
  // Only handle GET requests — let POST/PUT/DELETE pass through.
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Cross-origin requests (the NWS API) go straight to the network.
  // app.js handles forecast caching via localStorage.
  if (url.origin !== self.location.origin) return;

  // Same-origin: cache-first, falling back to network.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
