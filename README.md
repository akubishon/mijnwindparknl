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

## Simple electrolyser research

`/onderzoek` guides users through (1) capacity comparison, (2) an optional hydrogen estimate, and (3) a follow-up question about capture, production or average loading. Source: `src/research.tsx`; calculations: `src/electrolysis.mjs`. Research password protection and the existing data endpoints remain in place.

Supply is `(0.1 × Fryslân + Beabuorren) / 1.1`, using the default Stavoren KNMI models. For each valid ten-minute interval, consumed power is capped at the selected electrolyser capacity. Capture is consumed energy / total supply energy after BoP; average loading is consumed energy / (capacity × hours with data). Missing hours are excluded and reported explicitly; no annual extrapolation is made. Users set minimum and maximum operating load as percentages of each nominal capacity (defaults 0% and 100%). Below minimum the electrolyser is off; equality at minimum is allowed; supply above maximum is capped. Limits must satisfy 0 <= minimum <= maximum <= 100 and maximum > 0. Changing them recalculates fetched data immediately, without new API requests. Operating hours and longest operating runs exclude off intervals and break at missing data. Energy not captured is split into supply below minimum and excess above maximum. Nominal full-load hours remain hours at 100% nominal; hours at the operating upper limit are separate. With minimum load, capture need not increase monotonically with nominal size. Follow-up answers use the actual comparison results, including the highest-production size when a hydrogen target is unattainable. Startup time and storage are not modeled.

Hydrogen is optional: `energyMWh × 1000 / kWhPerKg`. The user-entered consumption must exclude BoP because it has already been removed from supply. The value 50 is an explicitly selected example, not a device guarantee. CSV exports contain capture and loading as percentages, operating limits in percent and MW, operating hours, energy lost at each limit, period/data coverage and assumptions, and hydrogen only when a valid consumption scenario is active. CSV uses a UTF-8 BOM, semicolons and decimal commas for Dutch Excel. Results are not persisted across page reloads.

## Website house style

The approved Witteveen+Bos-inspired style is standard across all four pages: `/`, `/beabuorren`, `/elektrolyser`, `/onderzoek`. Former `/proefstijl` links redirect to the corresponding standard pages. No trial banner remains. Data, calculations and runtime configuration are unchanged.

`src/brand-style.css` supplies the house style via `body.brand-style`, set in the generated HTML to avoid a flash of the previous style. Colours and layout follow the supplied brandbook (2026 v2.1): dark blue `#0C2340`, bright blue `#00A6DE` accents, soft blue `#C3E4F2`, warm gray `#EFECE6` and white. TASA Orbiter, single rounded corners and thin navy outlines are used throughout. The licensed font is served locally at `/assets/tasa-orbiter.ttf`; its SIL OFL license is in `src/assets/TASA-Orbiter-OFL.txt`. The Windparken identity remains in place.

Reverting the commit `Make approved brandbook style standard across the website` restores the original pages and separate trial routes; recompose/build/deploy afterwards.

## Whole-site password protection

Every page, asset and API request is gated server-side. Without authentication, visitors receive only the text Wachtwoord and a password field in default browser styling (Enter submits, no button or explanatory copy); APIs return 401 before fetching upstream data. The password is `SITE_PASSWORD` when configured, otherwise the existing secret `RESEARCH_PASSWORD`. If neither is configured the site stays locked (503). Set or change secrets directly in Site settings → Environment variables with Secret enabled; never add them to source. Redeploy after changing runtime secrets.

Successful login sets a signed `__Host-site_session` cookie for at most 12 hours, with Secure, HttpOnly, SameSite=Strict and Path=/. Login is same-origin, passwords are compared using fixed-length digests, and wrong guesses are throttled per IP within the Worker instance. Rotating the access password invalidates existing session signatures. Page responses use no-store. A visible logout form clears the browser cookie; it does not revoke copies of a stolen session token before expiry. Research requests obtain their existing short-lived token from the authenticated session, without asking for a second password. No password or token is stored in localStorage or embedded in HTML.
