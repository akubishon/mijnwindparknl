# Plan: Projectstudio (interne tool)

Status: plan, nog niet gebouwd. Datum: 25 november 2026.

## Doel

Een tweede ingang naast de openbare site: **`intern.mijnwindpark.nl`**, helemaal achter het sitewachtwoord. Daar doorloop je dezelfde keten als bij de huidige case Bolsward (Windpark Fryslân + Windpark Beabuorren), maar je kiest alles zelf, vanaf het begin:

1. waar de elektrolyser komt (kaart);
2. welk model uit de Waterstofatlas-catalogus en hoeveel modules;
3. welke windparken leveren en met welk aandeel;
4. welke KNMI-meetpunten de wind leveren: de tool stelt ze voor, jij kiest;
5. het beschikbare vermogen over de windjaren 2022–2025;
6. doorrekenen met Vergelijken en Opsplitsen;
7. bewaren, delen en het resultaat naar de Waterstofatlas sturen.

## Besluiten

| Onderwerp | Besluit |
|---|---|
| Ingang | Eigen subdomein `intern.mijnwindpark.nl` (lokaal `intern.localhost:8787`), in dezelfde worker als de rest. De hele host staat achter het sitewachtwoord; geen openbare pagina's, geen indexering. |
| KNMI-meetpunten | De tool **stelt voor**, de gebruiker **kiest**. Eén of meer stations per park; bij meer stations het gemiddelde per tien minuten, en alleen momenten waarop alle gekozen stations meten (zoals de huidige methode met Houtribdijk + Stavoren). Zo kan elk traject net zo nauwkeurig worden opgezet als het eerste. |
| Windjaren | 2022, 2023, 2024 en 2025, net als `/opsplitsing`. |
| Huidige case | “Bolsward” = Fryslân 10 % (tot 38,3 MW) + Beabuorren 100 % (10,4 MW), stations Houtribdijk + Stavoren, hoogtevertaling WINS50. Komt als vaste startinstelling in de studio en is de controle op de veralgemening. |
| Aantal | Aanname (nog te bevestigen): één elektrolyserlocatie per project, met n modules van een gekozen model. Meerdere opstellingen naast elkaar om te vergelijken kan, zoals nu in Samenstellen. |

## Gebruikersstroom

### 1. Locatie

- Kaart met dezelfde basis als de Atlas: MapLibre, PDOK-achtergrond, adres zoeken via de Locatieserver, percelen vanaf zoom 16.
- Klik zet de elektrolyser neer; de marker is te verslepen. De keuze staat in het adres (`?p=<lat>,<lon>`) en in het project.

### 2. Elektrolyser

- Model kiezen uit `/api/atlas/catalogue` (live Waterstofatlas, met de R2-kopie als terugval), gefilterd zoals de Catalogus.
- Aantal modules invullen, of een doelvermogen waarbij de tool aanvult met `fillToTarget` (`src/electrolyser-setup.mjs`).
- Optioneel meer opstellingen voor de vergelijking (maximaal `MAX_SETUPS`).

### 3. Windparken

- De tool toont de windparken rond de locatie uit `src/atlas/windparken.geojson` (standaard binnen 30 km, dichtstbijzijnde eerst).
- Per park: aandeel voor de elektrolyser (0–100 %), aantal turbines, turbinevermogen, ashoogte, zogverlies en turbinecurve. Alles is aan te passen; waarden die niet uit een bron komen, zijn gemarkeerd als **aanname**.
- Fryslân en Beabuorren houden hun eigen curve, ashoogte (115 m en 60 m) en WINS50-hoogtevertaling. Andere parken krijgen standaardwaarden (zie *Parkmodel*).

### 4. KNMI-meetpunten (voorstel, daarna zelf kiezen)

- Per park een gesorteerde lijst stations met 10-minutendata: afstand tot het park, dekking per windjaar 2022–2025 en gemiddelde wind.
- **Voorstel van de tool:**
  - het dichtstbijzijnde station binnen 25 km met minstens 90 % dekking in elk windjaar;
  - als er twee zulke stations zijn, als alternatief het gemiddelde van die twee, zoals bij de huidige case. De tool laat zien hoeveel momenten dan wegvallen omdat niet beide stations meten.
- De gebruiker vinkt één of meer stations aan. De knop “Gebruik voor alle parken” neemt de keuze over voor de andere parken.
- De studio waarschuwt bij een station verder dan 25 km, bij dekking onder 90 % en bij een station op zee of aan de kust voor een park in het binnenland.

### 5. Beschikbaar vermogen

- Aanbod per tien minuten per windjaar: som over de parken van `aandeel × parkvermogen`.
- Toont vollasturen per jaar, de duurkromme, de dekking (momenten met data) en het maximum ten opzichte van het elektrolyservermogen, zoals het stroomschema van de huidige case (aanbod tegenover stack + BoP).

### 6. Doorrekenen

- **Vergelijken**: waterstof, benutting, starts, LCOH, maximale meerprijs en robuustheid, met de bestaande rekenkern (`src/electrolyser-kernel.mjs`) en de bestaande kostenport (`src/electrolyser-economics.mjs`).
- **Opsplitsen**: het Python-model in Pyodide, met gevoeligheid, omslagkaart, rekenrapport en Excel.
- Beide pagina's worden op `intern.mijnwindpark.nl` in projectmodus geserveerd (`/vergelijken?project=<id>`, `/opsplitsen?project=<id>`). In plaats van de meegeleverde jaarreeksen lezen ze het aanbod van het project.
- Windprofielen: in projectmodus is er één profiel, “gekozen stations”. *Geschaald naar gemeten dagproductie* is er alleen als Fryslân in het project zit; *oud dagprofiel* en *hoogste station* horen bij de huidige case en zijn er alleen in die startinstelling.

### 7. Bewaren en delen

- Project in R2: `studio/v1/projects/<id>.json` (configuratie, geen aanbodreeks: die wordt uit de configuratie opnieuw berekend).
- Deelbare link `intern.mijnwindpark.nl/?project=<id>`; alleen te openen met het wachtwoord.
- “Resultaat naar Waterstofatlas ↗” en de CSV werken zoals in Vergelijken, met locatie, parken en stations erbij in de aannames.

## Parkmodel en hoogtevertaling

| Onderdeel | Fryslân / Beabuorren | Andere parken (standaard, aanname) |
|---|---|---|
| Turbines, vermogen | uit `application.py` (`PARKS`) | uit `windparken.geojson` (`turbines`, `mw`); turbinevermogen = mw ÷ turbines |
| Turbinecurve | eigen curve (`fryslan.json`, Beabuorren-curve in `knmi.mjs`) | genormaliseerde SWT-DD-130-curve van Fryslân, geschaald naar het turbinevermogen |
| Ashoogte | 115 m / 60 m | < 2 MW: 80 m · 2–4 MW: 100 m · > 4 MW: 120 m (aan te passen) |
| Hoogtevertaling | WINS50-maandfactor uit `ashoogte.json` (ook per stationscombinatie) | seizoens-α 0,115 ± 0,065 (de bestaande `hoogte=alpha`-route), duidelijk als aanname |
| Zogverlies | 5 % / 2 % | 5 % |
| Gemeten productie | Fryslân wel, Beabuorren niet | niet |

Later, buiten deze versie: een WINS50-raster voor heel Nederland, zodat elk park een gemeten hoogtevertaling krijgt.

## Afspraken tussen de onderdelen (contracten)

Deze afspraken liggen vast vóór de agents starten, zodat ze tegelijk kunnen werken.

### C1. Winddata per station (R2)

- `studio/v1/wind10/index.json`:
  `{jaren: [2022, 2023, 2024, 2025], bron: "KNMI EDR 10-minute-in-situ-meteorological-observations", stations: [{id, naam, lat, lon, dekking: {"2022": 0.98, …}, gemiddeld_ms}]}`
- `studio/v1/wind10/<stationId>/<jaar>.json`:
  `{station, naam, jaar, start, stap_s: 600, eenheid: "0,01 m/s", ontbrekend: 65535, n, data}`
  - `data`: base64 van een Uint16Array (little-endian), `ff` op 10 m in 0,01 m/s, één waarde per tien minuten.
  - De tijdas is dezelfde als die van de meegeleverde jaarreeksen in `src/opsplitsing/data/20xx.json`: de KNMI-tijdstempels over het Nederlandse kalenderjaar, met dezelfde verschuiving als `knmi.py`. `start` is het eerste tijdstip van die as.
- API (achter het wachtwoord, alleen op `intern.`):
  - `GET /api/studio/stations?lat=<lat>&lon=<lon>`: stations met afstand, dekking en het voorstel (C3).
  - `GET /api/studio/wind10/<stationId>/<jaar>`: het bestand uit R2. Staat het er nog niet, dan haalt de worker het eenmalig op bij KNMI EDR (`KNMI_EDR_API_KEY`), bewaart het en geeft het terug.
- Script `node scripts/studio-data.mjs wind10 [--upload]` haalt alle stations vooraf op.

### C2. Aanbod samenstellen (`src/studio/supply.mjs`, zowel browser als worker)

```js
// park: {id, naam, lat, lon, turbines, rated_kw, hub_height_m, wake_pct, curve: 'fryslan'|'beabuorren'|'generiek',
//        hoogte: 'wins50'|'alpha', wins50Park: 'fryslan'|'beabuorren'|null, aandeel: 0..1, stations: [stationId, …]}
buildSupply({jaar, parks, wind /* {stationId: Float64Array in m/s, null = ontbrekend} */, t /* tijdas uit C1 */})
// → {jaar, methode: 'studio', t, mw, v10: {parkId: [...]}, bron, stations: {stationId: [...]}, park_mw: {parkId: [...]}}
```

- De uitvoer heeft dezelfde vorm als `src/opsplitsing/data/20xx.json`, zodat de rekenkern en Pyodide hem zonder aanpassing kunnen lezen.
- Alleen momenten waarop elk gekozen station van elk park meet, komen in `t` (zoals de bundel).
- Afronding zoals de bundel (`round4`).

### C3. Stationsvoorstel (`src/studio/stations.mjs`)

`suggestStations({lat, lon}, index)` → `{lijst: [{id, naam, km, dekking, gemiddeld_ms}], voorstel: {enkel: [id], paar: [id, id] | null}}` met de regels uit stap 4.

### C4. Project (`studio/v1/projects/<id>.json`)

`{versie: 1, id, naam, gemaakt, gewijzigd, locatie: {lat, lon}, opstellingen: [{modelId, modules}], parken: [park uit C2], jaren: [2022, 2023, 2024, 2025], algemeen: {…zoals defaultGeneral()}}`. `id`: 12 tekens base32. De startinstelling `bolsward` is een vast project in de code en wordt niet in R2 opgeslagen.

## Werkverdeling (agents)

Elke agent werkt in eigen bestanden. Gedeelde bestanden (`scripts/compose-worker.mjs`, `src/worker-template.mjs`, `wrangler.toml`, `README.md`) doet alleen de integrator.

| Agent | Taak | Eigen bestanden | Hangt af van | Klaar als |
|---|---|---|---|---|
| **A: Winddata** | C1: 10-minutenwind per station en jaar ophalen, comprimeren en in R2 bewaren; API-handlers; script om alles vooraf op te halen | `src/studio/wind-data.mjs`, `scripts/studio-data.mjs`, `tests/studio-wind-data.test.mjs` | — | Houtribdijk en Stavoren 2022–2025 uit R2 zijn per tijdstip gelijk aan `stations.houtribdijk/stavoren` in de bundel (op de momenten die de bundel heeft); tests groen |
| **B: Parkmodel en aanbod** | C2 en C3: algemeen parkmodel, `buildSupply`, `suggestStations` | `src/studio/supply.mjs`, `src/studio/park-model.mjs`, `src/studio/stations.mjs`, `tests/studio-supply.test.mjs` | — | **Pariteit**: de startinstelling Bolsward met de stationsreeksen uit de bundel geeft voor 2022–2025 exact de `mw` van `src/opsplitsing/data/20xx.json`; test met een generiek park en met ontbrekende data |
| **C: Interface** | Stappen 1–5 en 7: kaart, model en modules, parken, stationskeuze, beschikbaar vermogen, project bewaren en delen; routes op `intern.` | `src/studio/server.mjs`, `src/studio/client.mjs`, `src/studio/page.html`, `src/studio/studio.css`, `tests/studio-routes.test.mjs` | A en B via C1–C4 (mag tegen stubs bouwen) | Hele stroom werkt in de browser op desktop en op 390 px; startinstelling Bolsward laadt; geen pagina of API zonder wachtwoord |
| **D: Doorrekenen** | Stap 6: Vergelijken en Opsplitsen in projectmodus met het aanbod uit C2 | wijzigingen in `src/opsplitsing/*` (o.a. `browser-runtime.py`, `bridge.js`), `src/electrolyser-hub.tsx`, `src/electrolyser-setup.mjs`, `tests/studio-calc.test.mjs` | B | Met de startinstelling Bolsward zijn de uitkomsten van Vergelijken en Opsplitsen gelijk aan die van de huidige pagina's; een project met een ander park rekent zonder fouten; bestaande tests ongewijzigd groen |
| **Integrator** | Contracten vastleggen, host en routes, `compose-worker`, `wrangler.toml` (route `intern.mijnwindpark.nl`), samenvoegen, `npm run build`, README | gedeelde bestanden | A–D | `npm run build` groen, preview werkt, README-sectie *Projectstudio* |

Volgorde: A, B en C starten tegelijk. D start als B de pariteitstest groen heeft. Daarna voegt de integrator alles samen en test de hele keten.

## Controles

1. **Pariteit huidige case** (de belangrijkste): aanbod, Vergelijken en Opsplitsen geven met de startinstelling Bolsward exact dezelfde getallen als nu.
2. **Data**: de reeksen uit KNMI EDR in R2 komen overeen met de bundel voor Houtribdijk en Stavoren.
3. **Toegang**: elke route op `intern.` geeft zonder sessie 401 of het wachtwoordformulier; `X-Robots-Tag: noindex`.
4. **Bestaande site**: `npm test` en `npm run build` blijven groen; `/opsplitsing` en `/elektrolyser` op mijnwindpark.nl veranderen niet.
5. **Browser**: de hele stroom op desktop en op 390 px.

## Buiten deze versie

- HARMONIE-voorspelling op de gekozen locatie (de snapshots bevatten nu alleen Fryslân en Beabuorren).
- WINS50-hoogtevertaling voor elk park in Nederland.
- Meerdere elektrolyserlocaties in één project.
- Gemeten productie van andere parken dan Fryslân.

## Open punten en risico's

- **Locatie Bolsward**: het precieze punt van de elektrolyser voor de startinstelling. Zonder punt nemen we het midden tussen de twee parken; de stations liggen in de startinstelling toch vast.
- **Aantal (punt 3)**: bevestigen dat het om één locatie met n modules gaat.
- **KNMI EDR**: limieten op aantal verzoeken en de sleutel `KNMI_EDR_API_KEY`. Een jaar 10-minutendata vraagt waarschijnlijk meerdere verzoeken per station. Daarom: vooraf ophalen met het script, op aanvraag alleen als terugval.
- **Dekking**: niet elk station meet alle vier de jaren. De studio toont dat en waarschuwt in plaats van stil te vullen.
- **OSM-gegevens**: aantal turbines en vermogen van parken kunnen fout zijn. Ze zijn aan te passen en gemarkeerd als bron OSM.
- **Inloggen**: de sessiecookie `__Host-site_session` geldt per host. Op `intern.` log je dus apart in, met hetzelfde wachtwoord.
- **Rekentijd**: Opsplitsen voor vier jaren duurt in de browser enkele minuten, net als nu.
