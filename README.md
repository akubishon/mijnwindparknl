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

Research now includes an explicit technical A/B comparison: the selected nominal capacity versus any larger investigated size, under identical operating percentages and data coverage. It reports the change in consumed electricity, optional hydrogen (same explicit kWh/kg assumption), operating hours, captured-supply percentage points and remaining unused energy. Marginal energy per added MW is shown when production increases. A curve shows consumed electricity versus nominal size, including plateaus or declines caused by scaled minimum load. Zero baseline production has no invented relative percentage. Conclusions make no financial or automatic good/bad recommendation.

The research main view is now centred on “Wat verandert als je groter gaat?”: one selected size versus a suggested size at least 5 MW larger (or the next available size near the upper end), with a manual override. A plain-language summary compares percentage growth in device capacity and consumed electricity, and prominently shows MWh per added MW for the selected period. Optional hydrogen is shown only with an explicit valid kWh/kg assumption. A marginal-yield chart compares five-MW extensions between the available round sizes, plus the explicitly labelled shorter final extension to 44.25 MW; every value is normalised by the actual capacity difference. Negative yields and incomplete data stay visible. Detailed comparison tables, operating statistics, total-yield graphs and full-load terminology are behind technical details. Fetching, password protection and calculation assumptions remain unchanged.

## Official Waterstofatlas integration

Research defaults to two real-model configurations from Waterstofatlas. `/api/atlas/catalogue` is gated by the website session and reads the deliberately added, read-only Atlas endpoint `/api/integrations/mijnwindpark/catalogue`. Both Sites share a scoped secret `WINDPARK_CATALOG_TOKEN`; it stays server-side. The endpoint merges the live R2 source with live online additions and projects only relevant catalogue fields and provenance. It does not scrape HTML or JavaScript, and it cannot modify records.

Each configuration chooses a catalogue model, integer module count and explicit system-power, system-kWh/kg and operating-percent assumptions. Unambiguous leading source values can be prefilled; ranges, bounds, stack-only consumption and minimum-load percentages expressed on a hydrogen-production basis are not silently turned into electrical point values. Raw specifications and source/addition provenance stay accessible. Users may edit scenario values or reapply current source values. Calculations restore gross allocated wind supply `(0.1 × Fryslân + Beabuorren)` from the existing after-BoP intervals by multiplying by 1.1, then use system energy per kg without a second generic BoP deduction. Constant part-load consumption is an assumption; startup, degradation and efficiency curves are not modelled. Unknown intervals do not count as zero production. The previous manual-capacity research remains as a secondary mode.

## KNMI ten-minute point display

Both park pages display each original KNMI ten-minute observation. The source hourly overview is shown first, followed by the ten-minute chart and model settings, with the daily-production summary at the bottom. The chart shows only modelled allocated power (MW), with per-point selection, a full point table and Dutch-format CSV. The wind-speed selector and wind-speed columns have been removed from this display and its CSV. Source timestamps are exposed separately from the existing ten-minute interval bounds: the KNMI timestamp equals the end of the corresponding mean interval. No interpolated minute values or hourly averages are used in this point chart. Missing readings and non-adjacent timestamps break chart lines; zero remains a real value. Local timestamps include the UTC offset to distinguish repeated daylight-saving hours. The original Fryslân measured hourly production remains in a separate section and is never presented as ten-minute measured production. Model settings remain available independently of that hourly archive. Existing research and electrolyser interval calculations are unchanged.

The source-hourly chart and the ten-minute model now share the same chart bounds, power ceiling and fixed Dutch 00:00–24:00 clock axis. Partial-day KNMI data is not stretched to the right edge. Ten-minute values are shown as individual dots without connecting lines. Both charts fit the same panel width; the hourly-source chart no longer overlays a second hourly KNMI line. At the winter-time transition, repeated local-clock points share the same x-coordinate (consistent with the source hourly archive); per-point UTC offsets and the full point table retain the distinct source timestamps.

The park pages now combine both series in one chart: pale hourly bars and dark KNMI ten-minute model dots. Both share the allocated park fraction, fixed Dutch day axis and power ceiling. For Fryslân the bars are measured archive energy converted to mean MW; for Beabuorren both series are modelled. Each series loads independently, with its own error/empty state, click/keyboard selection, table and CSV. There is no second model line or duplicate chart. Daily totals remain below the chart and model settings.

Combined charts now offer MW, MWh and kWh display modes. The preference is retained locally across dates and page navigation (only the unit, no credentials). Hour bars use their allocated source energy; ten-minute dots use model MW × actual interval duration in hours. kWh is MWh × 1000. Energy per ten-minute interval is therefore one sixth of one hour at the same power; the chart explains this duration difference. Both series determine the y-axis maximum, rounded up to a multiple of ten plus one further ten-unit margin in the active unit. Tooltips, point tables and both CSV exports follow the selected display unit while exports retain fixed base-unit columns. Research/production calculations are unchanged.

Display refinement: the `kWh` option now means **kWh (×1,000)**, with values expressed in thousands of kWh (numerically equal to MWh). For example 235 represents 235,000 kWh; its axis maximum is 240. Only this mode auto-scales, to the first higher ten. MW and MWh stay fixed at 45 in their respective units. The plot is clipped to those requested limits. MW retains ten-minute dots; both energy modes compare full-width source-hour bars with a KNMI-hour points-and-line series, without ten-minute dots. Adjacent KNMI points are connected; missing intervals break the line. MW uses the same points-and-line styling for its ten-minute series. KNMI hourly electrical energy is summed from the six original ten-minute power intervals; incomplete hours remain absent. At winter time, the repeated clock hour requires twelve valid intervals, sums their two-hour energy and computes the average power over two hours. Exports distinguish source and KNMI series and label the selected unit explicitly.

Iframe embedding is permitted: responses omit X-Frame-Options and CSP frame-ancestors restrictions. The existing password gate remains required.


## Elektrolyser opsplitsen

`/opsplitsing` (ook `/elektrolyser/opsplitsen`) bevat de pagina uit `akubishon/windprofiel`, commit `0c3cba2` (21 oktober 2026). De oorspronkelijke Python-bestanden staan ongewijzigd in `src/opsplitsing/python/`; herkomst en hashes staan in `src/opsplitsing/PROVENANCE.json`.

De site draait als JavaScript Worker en kan geen Python-processen starten. Daarom voert een aparte browserworker het oorspronkelijke model uit met Pyodide 0.29.3, geladen van de vaste versie op jsDelivr. De browseradapter vervangt uitsluitend multiprocessing door seriële uitvoering, en KNMI-verzoeken door de meegeleverde jaarreeksen 2022–2025. Deze zijn met de oorspronkelijke `supply_year` opgehaald en berekend. Minimumlast, technologieën, kosten, storingen, drie besturingen, dagvoorbeelden, gevoeligheidsanalyse, omslagkaart en CSV-export gebruiken de oorspronkelijke code. Grote analyses kunnen enkele minuten duren; de pagina moet openblijven. De vier historische windjaren zijn een momentopname en worden niet automatisch uitgebreid.

Opgeslagen scenario’s worden op dit apparaat in localStorage bewaard, met een knop op de pagina. Er stonden geen scenario-JSON-bestanden in de bronrepository. De CLI-versie voor bulkberekeningen blijft beschikbaar als `src/opsplitsing/python/scenarios.py`. Alle nieuwe pagina’s en brongegevens vallen onder de bestaande sitewachtwoordcontrole.

Controleren: `node scripts/test-python-browser.mjs` vergelijkt de browser-Python-uitkomsten exact met een native Python-referentie voor 2025 en modules 1 en 2, en controleert het dagvoorbeeld. `npm run compose`, `npm test` en `npm run build` controleren routes, toegangscontrole, jaarreeksen en het publicatiebestand. De testfixture staat in `tests/fixtures/opsplitsing-2025-native.json`.
