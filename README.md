# Fryslân production explorer

Browse recorded days at Windpark Fryslân, view hourly energy in MWh, inspect exact kWh readings, and download CSV files. The live view checks the latest power reading every second and plots distinct source timestamps, with observed cadence and reading age.

## Run locally

Requires Node.js 22+ and `unzip`. Keep `WP Fryslân.apk` in the parent directory, then run:

```sh
node scripts/dev.mjs
```

Open `http://localhost:8787`. The committed standalone worker includes the browser bundle, so no dependency installation is needed to run it. Local development reads the public client's configuration from the APK into memory. Alternatively supply `WPF_PUBLIC_CLIENT_KEY` and `WPF_FIREBASE_API_KEY` as environment variables. The server binds to loopback.

## Edit and build

Install dependencies on a filesystem that supports symlinks (Android shared storage does not):

```sh
npm install
npm run compose
npm test
npm run build
```

Edit `src/explorer.tsx` and `src/styles.css` for the UI, `src/wpf.mjs` for upstream authentication and caching, and `src/worker-template.mjs` for API routes. `compose` embeds the browser bundle, CSS, and data client into `worker/index.js`; the Sites build packages that file. Recompose after source changes.

## Runtime configuration

Hosted configuration uses Sites secrets named `WPF_PUBLIC_CLIENT_KEY` and `WPF_FIREBASE_API_KEY`. Firebase session tokens stay server-side and are cached in memory for up to 50 minutes. No credential is sent to the browser, embedded in the bundle, or stored in the hosting manifest. The hosted Site is owner-private.

## Data behavior

The calendar discovers years and recorded days through shallow Firebase reads. Dates use Europe/Amsterdam; requests use unpadded month/day references. The hourly series is shown exactly as returned, without inventing missing values. kWh is converted to MWh for display; live kW is converted to MW. Returned zeros may include unfinished hours, and daylight-saving days depend on the archive's own hour indexing.

Only the newest live snapshot is confirmed. During a short check, source timestamps changed by 10 seconds. Polling every second does not establish one-second source resolution. The live chart keeps the latest 900 distinct timestamped readings in browser memory while observing, pauses checks when hidden, and clears on refresh. The median interval measures the observed updates, which can include gaps. Historical second-by-second production is not available through the endpoints confirmed so far.

## Verification

Worker tests cover request validation, authentication, calendar filtering, hourly normalization, caching, live field projection, missing data, and upstream failures. Real API checks verified history years, recorded days, daily readings, and live snapshots. Browser interaction QA is unavailable on this host. See `../docs/graph-access.md` and `../analysis/live-cadence.json` for reverse-engineering evidence.
