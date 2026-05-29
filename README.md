# Just the Weather

A no-frills weather PWA for Madison, WI. Part of the [Keep It Neat](https://keepitneat.app) series.

## What it is

Current conditions and a 7-day forecast. Pulled from the [NWS API](https://www.weather.gov/documentation/services-web-api).

That's the whole app.

## What it isn't

- It doesn't have ads.
- It doesn't track you. No analytics, no telemetry, no third-party scripts.
- It doesn't ask you to make an account.
- It doesn't ping you with notifications you didn't ask for.
- It doesn't ship 2MB of JavaScript so it can show you a number.
- It doesn't try to sell you a premium tier with "AccuPredict™" or whatever.

## How it works

Plain HTML, CSS, and JavaScript. No build step. No framework. No npm.

```
weather/
├── index.html
├── styles.css
├── app.js
├── manifest.json
├── service-worker.js
└── icons/
```

When the app loads, it fetches the NWS forecast for Madison's grid point and renders. The service worker caches the static files so it installs as a PWA and works offline. The last fetched forecast is kept in `localStorage` and shown if a future fetch fails.

## Run it locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Service workers don't register from `file://`, so you need an HTTP server even locally.

## License

[MIT](./LICENSE). See [`github.com/keepitneat`](https://github.com/keepitneat) for the other apps in the series.
