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

The Waterstofatlas models are compared under `/elektrolyser` (see the next section); `/onderzoek` now refers there and keeps only the manual-capacity research. `/api/atlas/catalogue` is gated by the website session and reads the deliberately added, read-only Atlas endpoint `/api/integrations/mijnwindpark/catalogue`. Both Sites share a scoped secret `WINDPARK_CATALOG_TOKEN`; it stays server-side. The endpoint merges the live R2 source with live online additions and projects only relevant catalogue fields and provenance. It does not scrape HTML or JavaScript, and it cannot modify records.

## Elektrolysers uit de Waterstofatlas vergelijken

Deze wijziging is in GitHub gemaakt en moet nog naar Sites worden overgezet; `SITES-SOURCE.json` beschrijft nog de laatst gespiegelde Sites-versie.

### Pagina-opbouw

`/elektrolyser` is één ingang met vier subtabbladen, elk met een eigen adres (terug-knop en links werken):

1. **Beschikbaar vermogen** (`/elektrolyser`): de bestaande dagweergave, ongewijzigd in data en berekening. Alleen de subtabbladen staan erboven.
2. **Catalogus** (`/elektrolyser/catalogus`): elektrolysers uit `/api/atlas/catalogue`, te filteren op fabrikant, technologie en zoekterm. Per model: modulevermogen, systeemverbruik, stackverbruik, minimumlast, leveringstype, brontekst en bron, elk met een statuslabel, en een link naar de Waterstofatlas. SANY, LONGi Hydrogen en Sungrow vallen weg, net als in de Atlas (`disabledManufacturers`); voedingen zonder stack (technologie Vermogenselektronica) ook.
3. **Samenstellen** (`/elektrolyser/samenstellen`): tot vier opstellingen (A–D). Per opstelling een model en een geheel aantal modules, met totaalvermogen, opname bij vollast inclusief BoP en alle rekenwaarden met status, regel en brontekst. **Vul aan tot doelvermogen** (standaard 44 MW) kiest het aantal modules zoals `modules()` in `configurations.js`: exact als het past, anders het eerstvolgende aantal erboven, met het aantal eronder als alternatief.
4. **Vergelijken** (`/elektrolyser/vergelijken`): 2 tot 4 complete opstellingen naast elkaar bij dezelfde windreeks en dezelfde algemene aannames, met een tabel, verschillen ten opzichte van een gekozen referentieopstelling, waterstof per windjaar, één grafiek en een CSV.

`/onderzoek` verwijst voor Atlas-modellen naar Samenstellen en Vergelijken; de handmatige capaciteitsvergelijking blijft. `/opsplitsing` blijft de uitgebreide weergave met kosten en LCOH, met de Python-kern. Opstellingen, algemene aannames en doelvermogen worden als gemak in `localStorage` van de browser bewaard; zonder opslag werkt de pagina gewoon.

### Begrippen

- **Module**: de kleinste eenheid die zelfstandig aan en uit kan, met een eigen minimumlast. Een systeem met meerdere stacks telt als één module.
- **Opstelling**: één model × een geheel aantal modules (1–200). Verschillende modellen in één opstelling vallen erbuiten.
- **Vermogensgrens**: het modulevermogen geldt voor het systeem inclusief BoP of alleen voor de stack. `capaciteit_mw` in `opsplitsing.py` is stackvermogen; BoP komt daar bovenop (op vollast × (1 + BoP-vast + BoP-variabel), standaard × 1,10). Daarom is `capaciteit_mw = n × modulevermogen` bij een stackvermogen en `n × modulevermogen ÷ (1 + BoP-vast + BoP-variabel)` bij een systeemvermogen. Zo telt de BoP niet dubbel en draait een systeem van 4,4 MW op vollast ook 4,4 MW. De grens komt uit de brontekst ("systeem", "BoP + stack", "stack") of, als die niets zegt, uit een gelabelde aanname: losse stack of alleen stackverbruik → stack; DC → stack; anders systeem.

### Statussen en regels

Elk rekenveld heeft één status: **bron** (letterlijk uit de datasheet via de Atlas), **afgeleid** (vaste regel, die erbij staat; rust de regel op een aanname, dan staat er “afgeleid · aanname”), **standaard technologie** (`TECHNOLOGIES` in `opsplitsing.py`, met de bron uit `source()`: EU LCOH-tool, mijnwindpark.nl of plaatshouder) of **eigen invoer**. Een veld dat in de bron staat maar niet eenduidig is, heet **open** en levert geen resultaat tot je een keuze maakt.

- Modulevermogen volgt `modulePower()` uit `datasheetextract/configurations.js`, met de vaste uitzonderingen voor Oort, Hydrogenera en Plug (status afgeleid, met de regel). Een bereik zoals “0,3–1 MW” wordt nooit stilzwijgend één getal: je kiest een van de grenzen (eigen invoer). Bovengrenzen (“tot”, “≤”, “<”) en waarden met marge (“±”) blijven open.
- Systeemverbruik: één waarde aan het begin van de brontekst is bron; “≈” of “berekend” is afgeleid (rekenwerk van de Atlas). Bij alleen stackverbruik of een losse stack is er geen resultaat zonder expliciete BoP-aanname (vinkje); daarna is systeemverbruik = stackverbruik × (1 + BoP-vast + BoP-variabel), gelabeld als aanname. Een systeemverbruik in kWh/kg bevat de BoP al; het windaanbod is bruto en de BoP wordt niet nog eens afgetrokken.
- Minimumlast: alleen een expliciet elektrische basis (“elektrische last”, “stacklast”, “vermogensbereik”) is bron. Zonder vermelde basis is het een afgeleide aanname (gelezen als elektrisch percentage). Een minimumlast in waterstofproductie, Nm³/h of stroomsterkte, meerdere waarden of een tijdelijke ondergrens blijft open; als elektrisch percentage gebruiken kan alleen met een knop die er “(aanname)” bij zet. Ontbreekt de minimumlast, dan geldt de technologiestandaard (plaatshouder).
- AC/DC staat als bron als de tekst het noemt; anders is het een aanname die past bij de vermogensgrens.
- Deellast: standaard het `deellastvoordeel` van de technologie, als aanname. Levert de endpoint een deellastcurve, dan wordt die omgerekend (kWh/Nm³ × 11,12 Nm³/kg bij 0 °C en 1,013 bar) en is het deellastvoordeel de waarde (0–30 %, stap 0,1 %) waarbij de verhouding deellast/vollast van het model het best bij de curve past. De restafwijking staat erbij; valt de curve buiten wat het model kan volgen, dan staat dat er ook bij.
- Technologie: PEM en alkalisch gebruiken hun standaard; drukalkalisch rekent met alkaline (afgeleide aanname); voor AEM, SOEC en andere technologieën kies je zelf een rekenprofiel.
- Opstarttijden uit de Atlas worden getoond maar niet gebruikt: opstarttijden zijn algemene aannames.

“Rust op X bronwaarden en Y aannames” telt de veertien rekenvelden van het model: bron en afgeleid zonder aanname tellen als bronwaarde, de rest als aanname.

### Berekening

De vergelijking gebruikt `src/electrolyser-kernel.mjs`, een JavaScript-versie van `simulate()` en `simulate_with_replacements()` uit `opsplitsing.py` (MODEL_VERSION 10). De Python-kern kost 1–3 s per opstelling en windjaar; in de browser met Pyodide duurt een vergelijking van vier opstellingen over vier jaar daardoor al gauw een minuut. De JavaScript-versie doet hetzelfde in enkele seconden, in een aparte worker (`/assets/elektrolyser-rekenkern.js`) met voortgang. De port volgt de Python-bewerkingsvolgorde, inclusief `sum()` met compensatie, `round(x, 2)`, `random.Random` (MT19937) en Europe/Amsterdam-wandkloktijd voor onderhoud. Tests tonen gelijke uitkomsten (verschil 0 in alle referentiegevallen; toegestaan 1e-9 relatief).

Een opstelling wordt `Aannames(capaciteit_mw, minimumlast, systeemverbruik_vol, deellastvoordeel, BoP, …)` met n modules. De standaardbesturing is `verdelen`; `bijschakelen` en `samen` zijn te kiezen. Algemene aannames zijn voor alle opstellingen gelijk: besturing, minimale aan- en uit-tijd, startvertraging, opstarttijden, koud na, warmhouden, onderhoud, storingen, hersteltijd en stilstand per stackwissel. Standaard zijn dat de waarden van `Aannames()` (PEM/EU-tool, deels plaatshouders). Storingen volgen in elke opstelling dezelfde vaste trekking per module en jaar (zaad jaar × 100 + modulenummer); meer modules betekent meer, kleinere storingen.

Windaanbod: de jaarreeksen 2022–2025 van `/opsplitsing` (bruto toegewezen aanbod, 10 % Fryslân + Beabuorren), te kiezen per jaar. Meetgaten zitten niet in de reeks en tellen nooit als nul; ontbrekende of ongeldige waarden worden weggelaten. Zoals in `/opsplitsing` wordt elk jaar naar 8.760 uur omgerekend; de datadekking per jaar staat in de tabel en de CSV. Uitkomsten staan per windjaar en als gemiddelde; de spreiding tussen jaren is geen betrouwbaarheidsinterval. Uitkomsten worden per invoerhash gecachet (canonieke JSON van rekenkernversie, windjaar, modules, besturing en alle aannames).

### Uitkomsten per opstelling

- Totaal nominaal vermogen = n × modulevermogen (op de vermogensgrens van de bron); opname bij vollast incl. BoP = n × stackvermogen × (1 + BoP).
- Waterstof (kg per jaar), opgenomen stroom inclusief BoP (MWh per jaar) en stand-by (warmhouden).
- Deel van het windaanbod benut = opgenomen ÷ aanbod.
- Gemiddelde belasting = opgenomen ÷ (opname bij vollast incl. BoP × uren met data). Dezelfde grens als de opgenomen stroom, dus hooguit 100 %.
- Resterende windenergie = aanbod − opgenomen, gesplitst in **onder minimumlast** (niets draait en het aanbod ligt onder de minimumlast van één module; bij `samen` van alle modules samen), **boven maximum** (aanbod boven de opname bij vollast van alle modules) en **overig** (onderhoud, storingen, startvertraging, minimale uit-tijd).
- Werkelijk stroomverbruik = (opgenomen + stand-by) × 1000 ÷ kg, naast de nominale rekenwaarde.
- Draaiuren per module, uren met productie, starts per module en datadekking.

De vergelijking waarschuwt als het nominale vermogen meer dan 5 % van de referentie afwijkt, of als de opname bij vollast meer dan 5 % verschilt door een andere vermogensgrens, en biedt dan “Vul alle opstellingen aan tot doelvermogen”. Er is geen oordeel “beste” en geen financieel advies. De grafiek toont per aanbodklasse (0–2,5 … 45+ MW) welk deel van de windenergie elke opstelling opneemt, met het aandeel van het jaaraanbod per klasse.

Met `samen` zijn 10 × 4,4 MW en 2 × 22 MW alleen gelijk als ook beschikbaarheid en de minimale aan-tijd gelijk zijn: storingen en onderhoud gelden per module, en de minimale aan-tijd houdt net gestarte modules aan (zoveel als er bij het aanbod op minimumlast passen). Met de standaardaannames is het verschil in windjaar 2025 ongeveer 0,7 %.

### CSV

UTF-8 met BOM, puntkomma's en decimale komma's. Eén regel per opstelling per windjaar plus het gemiddelde. `bron.*`: catalogusversie, bijwerkdatum, versie van de aanvullingen, model en letterlijke bronteksten. `aanname.*`: elke rekenwaarde met `.status` (bron, afgeleid, afgeleid (aanname), standaard technologie, eigen invoer) en `.regel`, plus besturing, algemene aannames, windreeks en storingstrekking. `uitkomst.*`: windjaar, “rust op”, alle uitkomsten hierboven, uren met data, invoerhash en rekenkernversie.

### Ontbrekende velden in de Atlas-endpoint

De catalogus-endpoint (`/api/integrations/mijnwindpark/catalogue`, buiten deze repository) levert nu `power`, `systemEnergy`, `stackEnergy`, `minimum`, `production`, `hotStart`, `coldStart` en `source`. Voor deze pagina zijn nodig, en worden niet op een andere manier uit de Atlas-website gelezen:

- `scope` (leveringsomvang → leveringstype Systeem / Losse stack / Procesmodule / Projectafhankelijk / Niet gespecificeerd);
- `stacks` (aantal stacks per module);
- `partload` (deellastcurve);
- een directe link per model (`url`), nu wordt naar de Atlas-startpagina gelinkt;
- `category` (elektrolyser of voeding), nu wordt op technologie gefilterd;
- de elektriciteitsbasis (AC/DC) en levensfase (BOL/EOL) als aparte velden, nu gelezen uit de tekst.

De code gebruikt `scope`, `stacks`, `partload` en `url` zodra de endpoint ze levert; de catalogus meldt welke ontbreken.

### Voorstellen voor `akubishon/windprofiel` (niet hier gewijzigd)

- `simulate()` zou de resterende windenergie per oorzaak (onder minimumlast, boven maximum, beschikbaarheid) en het aantal starts per aanbodklasse kunnen teruggeven; nu rekent deze site die naast de ongewijzigde beslissingen uit.
- Een deellastcurve per lastband (systeemverbruik in kWh/kg) als alternatief voor één `deellastvoordeel`. De curve van H₂ Energy 1 MW PEM laat meer verlies bij deellast zien dan BoP-vast en Faradayverlies verklaren; met `deellastvoordeel ≥ 0` valt de pasvorm op de grens.
- Bij `samen` houdt de minimale aan-tijd net gestarte modules afzonderlijk aan; als `samen` echt één installatie moet zijn, zou dat per opstelling moeten gelden.

### Controleren

`npm test` bevat `tests/electrolyser-compare.test.mjs` en `tests/electrolyser-routes.test.mjs`: hashes van de Python-bestanden, gelijkheid van de JavaScript-kern met `tests/fixtures/elektrolyser-kern-python.json` (native CPython, opnieuw te maken met `python3 -I scripts/kernel-reference.py > tests/fixtures/elektrolyser-kern-python.json`) en met de bestaande `/opsplitsing`-fixture, de acceptatiepunten (10 × 4,4 tegen 2 × 22 MW, BoP-aanname, minimumlast in waterstofproductie en vermogensbereiken, meetgaten en datadekking), CSV, cachesleutel, routes achter de login en de CSP. `node scripts/test-python-browser.mjs` vergelijkt daarnaast de JavaScript-kern live met de Python-kern in Pyodide voor `verdelen`, `samen` en `bijschakelen`. De testcatalogus `tests/fixtures/atlas-catalogue.json` bevat Atlas-waarden van twaalf modellen en één testmodel.

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

De opsplitsingspresentatie houdt marginale kosten en gemiddelde kostprijs naast elkaar zichtbaar. Elke stap vergelijkt de volgende gekozen configuratie bij hetzelfde totaalvermogen. De compacte tabel toont LCOH op drie decimalen, het verschil met de vorige configuratie in cent/kg en het verschil met de laagste doorgerekende kostprijs. De open stappentabel behoudt productieverschillen, uren, jaarkosten en LCOH vóór/na; geen of negatieve extra productie wordt niet als een geldige prijs van extra kilo's voorgesteld. Negatieve kosten en productieverschillen blijven zichtbaar. De markering ‘laagste berekend’ geldt uitsluitend binnen de getoonde instellingen.

De uitkomst toont haar eigen aannames, windjaren en het gebruik van één vaste storingstrekking per module en jaar. Jaarspreiding is geen betrouwbaarheidsinterval. CSV exporteert alle oorspronkelijke rijvelden plus ongeronde stapverschillen en aannames (kommadecimalen, puntkomma's); contextkolommen hebben de prefix `berekening.`, stapvelden `stap.` en aannames `aanname.`. Aannames staan in oorspronkelijke rekeneenheden. JSON bewaart de volledige uitkomst en veldmetadata. Vervolgdiagrammen, de dagweergave en opgeslagen scenario's gebruiken dezelfde resultaataannames, ook nadat het formulier is aangepast. Een melding maakt zichtbaar wanneer invoer en getoonde uitkomst verschillen. De Pythonberekeningen, historische reeksen en aannames zijn niet gewijzigd. `tests/opsplitsing-presentation.test.mjs` controleert de omkering in 2022 (4/5/6 modules), ontbrekende en negatieve verschillen, verzoek-snapshots en exportbehoud.


## Stavoren + Houtribdijk comparison

The park-day charts and `/elektrolyser` have independent **KNMI-combinatie** and **Verschilband** checkboxes, both initially off. The comparison aligns original ten-minute intervals in UTC, chooses the higher valid wind-speed observation and only then applies the active park model. It does not choose the maximum model power: above turbine cut-out, higher wind can yield less power. Each station retains a thin curve; the combination is a thicker navy curve. The translucent band follows the higher displayed station value and splits exactly at crossings. No band is drawn without two comparable observations. Hour-energy views aggregate each series independently and omit incomplete hours. Repeated winter-clock hours retain all distinct UTC intervals.

`/api/wind?comparison=1` returns both station profiles, the combination, wind-selection provenance and explicit fallback/missing slots. A failed station request may fall back to the other station without exposing upstream errors. The electrolyser endpoint supports the same parameter; each park is modelled from the highest wind first, before allocation and BoP. Turning on only the band leaves numerical results unchanged. Turning on the combination changes the model statistics, daily figures and totals, visibly labelled as a KNMI calculation. Switching it off restores the original source/model figures. Measured source bars remain a labelled reference in the park chart. Live measured production and capacity-research charts do not have comparable station series. The separate imported opsplitsing model remains unchanged.

Combination totals sum available original ten-minute energy, including available intervals of incomplete hours. Coverage and single-station fallback are reported; missing slots are never zeros. The highest-hour metric uses complete hours only. Point and hourly CSVs retain the existing source/base columns and append station models, combination, difference, highest-wind station, fallback and active-mode information. The electrolyser also has a comparison CSV. Exports are UTF-8 BOM, semicolon-separated and use decimal commas.

Verification: `npm test` covers the existing Worker behavior plus wind-before-power selection, cut-out, exact interval alignment, zero readings, fallback, missing slots, coverage, day-length changes, hourly aggregation and crossing geometry. Browser checks on desktop and a 390-pixel viewport cover both switches, restored totals, three display units, comparison details, CSV downloads and all three affected pages.


De daganalyse gebruikt een samenhangende werkruimte: daggrafiek, tijdschuif en productie per configuratie links; zes compacte rekenstappen rechts. De kernwaarden blijven zichtbaar, formules zijn per stap uit te klappen en ‘Alle rekenstappen tonen’ opent alles. De keuze blijft behouden bij wisselen van tijdstip. Vorige/volgende bedient één tienminutenstap. Brede schermen tonen maximaal twee grote resultaatgrafieken per rij; gewone tekst en tabellen zijn groter gezet. Op kleine schermen stapelen de onderdelen en scrolt alleen de daggrafiek horizontaal.
