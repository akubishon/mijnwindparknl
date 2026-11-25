# Plan: Projectstudio (interne tool)

Status: plan, nog niet gebouwd. Bijgewerkt op 25 november 2026 na drie vragenrondes.

## Doel

Een tweede ingang naast de openbare site: **Projectstudio** op **`intern.mijnwindpark.nl`**, helemaal achter het sitewachtwoord en alleen voor ons team. Daar doorloop je dezelfde keten als bij de huidige case Bolsward (Windpark Fryslân + Windpark Beabuorren), maar je kiest alles zelf, vanaf het begin:

1. **Locatie**: waar de elektrolyser komt (kaart).
2. **Elektrolyser**: een model uit de catalogus van waterstofatlas.nl en hoeveel units je neerzet, in een of meer varianten.
3. **Windparken**: welke bestaande parken leveren en hoeveel MW de elektrolyser van elk park mag pakken.
4. **KNMI-meetpunten**: de tool stelt ze voor, jij kiest.
5. **Beschikbaar vermogen** over de windjaren 2022–2025.
6. **Vergelijken**: waterstof, starts, LCOH, meerprijs, robuustheid en de knop naar de Waterstofatlas.
7. **Windparkpagina's** per gekozen park: daggrafiek, stationsvergelijking en HARMONIE-voorspelling.
8. **Bewaren en delen**: projecten gedeeld in R2.

## Besluiten

| Onderwerp | Besluit |
|---|---|
| Naam en ingang | **Projectstudio**, eigen subdomein `intern.mijnwindpark.nl` (lokaal `intern.localhost:8787`), in dezelfde worker. De hele host staat achter het sitewachtwoord; geen openbare pagina's, `noindex`. |
| Gebruikers | Alleen ons team. Kostprijs, aannames en technische details zijn overal zichtbaar. |
| Taal | Alleen Nederlands (geen taalknop, geen Engelse vertalingen). |
| Elektrolyser | De **hele catalogus** van waterstofatlas.nl (`/api/atlas/catalogue`), met filters in de tool. Een variant is **één model × n units**. Meerdere varianten naast elkaar vergelijken, zoals Samenstellen en Vergelijken nu. Geen mix van modellen in één installatie. |
| Vermogen per windpark | De gebruiker vult in hoeveel **MW** de elektrolyser van het park mag pakken. Dat is een **deel van het park**: aandeel = MW ÷ parkvermogen, op elk moment hetzelfde percentage van de productie (Bolsward: Fryslân 10 % = 38,3 van 382,7 MW, Beabuorren 100 % = 10,4 MW). Geen aftopping. |
| Windparken | Alleen **bestaande parken** van de kaart (`windparken.geojson`, OpenStreetMap). **Geen afstandsgrens**: elk park in Nederland is te kiezen; de afstand tot de elektrolyser staat erbij als informatie, en het voorstel begint bij de dichtstbijzijnde parken. |
| KNMI-meetpunten | De tool **stelt voor**, de gebruiker **kiest** één of meer stations per park. Bij meer stations het gemiddelde per tien minuten, alleen op momenten dat alle gekozen stations meten, zoals Houtribdijk + Stavoren bij Bolsward. |
| Windjaren | 2022, 2023, 2024 en 2025. |
| Ashoogte | Fryslân en Beabuorren houden WINS50. Andere parken krijgen eerst de bestaande seizoens-α (geijkt op Fryslân), duidelijk gemarkeerd als **aanname**. WINS50 voor elk park volgt in fase 2. |
| Turbinecurve | Andere parken krijgen een **standaardcurve**: de genormaliseerde SWT-DD-130-curve van Fryslân, geschaald naar het turbinevermogen. Ashoogte en zogverlies zijn aan te passen. |
| Windparkpagina's | Per gekozen park: **daggrafiek van het model**, **stationsvergelijking** en **HARMONIE-voorspelling**. Gemeten productie blijft alleen op de bestaande Fryslân-pagina. |
| Opsplitsen | **Niet** in de Projectstudio. `/opsplitsing` blijft alleen voor Bolsward op mijnwindpark.nl. |
| Opslag | Projecten **gedeeld in R2**: iedereen met het wachtwoord ziet de projectenlijst en kan een project via een link openen. |
| Bolsward | Startinstelling “Bolsward”: Fryslân 10 %, Beabuorren 100 %, stations Houtribdijk + Stavoren, WINS50. De elektrolyser heeft nog geen vaste plek; de startinstelling zet hem in Bolsward (centrum, ongeveer 53,066° N 5,531° E) en de gebruiker kan hem verplaatsen. Deze startinstelling is ook de controle op de veralgemening. |

## Gebruikersstroom

### 0. Projecten

- De startpagina van `intern.mijnwindpark.nl` toont de projectenlijst (naam, locatie, laatst gewijzigd), de knop **Nieuw project** en de startinstelling **Bolsward**.

### 1. Locatie

- Kaart met dezelfde basis als de Atlas: MapLibre, PDOK-achtergrond, adres zoeken via de Locatieserver, percelen vanaf zoom 16.
- Klik zet de elektrolyser neer; de marker is te verslepen.

### 2. Elektrolyser (varianten)

- De hele catalogus van waterstofatlas.nl, gefilterd zoals de Catalogus (uitgeschakelde fabrikanten weg), met filters op technologie, fabrikant en modulevermogen.
- Per variant: één model en het aantal units. Of een doelvermogen, waarbij de tool aanvult met `fillToTarget` (`src/electrolyser-setup.mjs`).
- Varianten toevoegen, verwijderen en een referentie kiezen, zoals in Samenstellen (maximaal `MAX_SETUPS`).

### 3. Windparken en vermogen

- Lijst van parken, dichtstbijzijnde eerst, plus zoeken op naam, plaats of gemeente door heel Nederland. Op de kaart zijn alle parken aan te klikken.
- Per gekozen park:
  - **MW voor de elektrolyser** (0 tot het parkvermogen). De tool toont het bijbehorende percentage van de productie.
  - Aantal turbines, turbinevermogen, ashoogte en zogverlies, voorgevuld en aan te passen. Waarden zonder bron zijn gemarkeerd als **aanname**, OSM-waarden als **bron OSM**.
- Kiest de gebruiker het OSM-park dat Fryslân of Beabuorren is (parkmidden binnen 2 km van het bekende midden), dan gebruikt de tool het bekende parkmodel met eigen curve, ashoogte en WINS50.

### 4. KNMI-meetpunten (voorstel, daarna zelf kiezen)

- Per park een gesorteerde lijst stations met 10-minutendata: afstand tot het park, dekking per windjaar 2022–2025 en gemiddelde wind.
- **Voorstel van de tool:**
  - het dichtstbijzijnde station met minstens 90 % dekking in elk windjaar;
  - als het op één na dichtstbijzijnde zulke station ook binnen 25 km ligt, als alternatief het gemiddelde van die twee, zoals bij Bolsward. De tool laat zien hoeveel momenten dan wegvallen omdat niet beide stations meten.
- De gebruiker vinkt één of meer stations aan. De knop **Gebruik voor alle parken** neemt de keuze over voor de andere parken.
- De studio waarschuwt bij een station verder dan 25 km van het park, bij dekking onder 90 % en bij een station op zee voor een park op land.

### 5. Beschikbaar vermogen

- Aanbod per tien minuten per windjaar: de som over de parken van aandeel × parkvermogen.
- Toont vollasturen per jaar, de duurkromme, de dekking (momenten met data) en het stroomschema: het aanbod tegenover stack + BoP per variant, zoals op de startpagina van mijnwindpark.nl.

### 6. Vergelijken

- De bestaande Vergelijken-weergave (`src/electrolyser-hub.tsx`) in projectmodus: waterstof, benutting, starts, LCOH, maximale meerprijs en robuustheid. Daarvoor gebruikt de tool de bestaande rekenkern (`src/electrolyser-kernel.mjs`) en de bestaande kostenport (`src/electrolyser-economics.mjs`).
- In plaats van de meegeleverde jaarreeksen rekent hij met het aanbod uit stap 5.
- In projectmodus is er één windprofiel: “gekozen stations”. De andere profielen (*oud dagprofiel*, *hoogste station*, *geschaald naar gemeten dagproductie*) horen bij Bolsward en zijn alleen in die startinstelling te kiezen.
- **Resultaat naar Waterstofatlas ↗** en de CSV werken zoals nu. Locatie, parken, MW per park en stations staan bij de aannames.

### 7. Windparkpagina's

Voor elk park in het project een pagina `intern.mijnwindpark.nl/project/<id>/park/<parkId>` met de bestaande grafiekonderdelen:

- **Daggrafiek van het model**: per dag het gemodelleerde parkvermogen uit de gekozen KNMI-stations. Elke dag is te kiezen, ook vandaag (live KNMI EDR, zoals `/api/wind` nu), met uurenergie en CSV.
- **Stationsvergelijking**: de wind van de gekozen stations naast elkaar, met de verschilband (`station-comparison.tsx`).
- **HARMONIE-voorspelling** op de parklocatie (`harmonie-overlay.tsx`). De uurlijkse taak haalt naast Fryslân en Beabuorren ook de roosterpunten op van alle parken in bewaarde projecten (maximaal 50). De voorspelling is er vanaf het moment dat het park in een bewaard project staat; recente runs zijn op aanvraag uit het KNMI-archief te halen, zoals nu.

### 8. Bewaren en delen

- Project in R2: `studio/v1/projects/<id>.json`, met de configuratie en zonder aanbodreeks (die wordt uit de configuratie opnieuw berekend).
- Deelbare link `intern.mijnwindpark.nl/project/<id>`; alleen te openen met het wachtwoord.
- Wijzigen overschrijft het project. Een kopie maken kan met **Kopie maken**.

## Parkmodel en hoogtevertaling

| Onderdeel | Fryslân / Beabuorren | Andere parken (standaard, aanname) |
|---|---|---|
| Turbines, vermogen | uit `application.py` (`PARKS`): 89 × 4,3 MW / 8 × 1,3 MW | uit `windparken.geojson` (`turbines`, `mw`); turbinevermogen = mw ÷ turbines |
| Turbinecurve | eigen curve (`fryslan.json`, Beabuorren-curve in `knmi.mjs`) | genormaliseerde SWT-DD-130-curve van Fryslân, geschaald naar het turbinevermogen |
| Ashoogte | 115 m / 60 m | < 2 MW: 80 m · 2–4 MW: 100 m · > 4 MW: 120 m (aan te passen) |
| Hoogtevertaling | WINS50-maandfactor uit `ashoogte.json` (ook per stationscombinatie, via `monthFactors`) | seizoens-α 0,115 ± 0,065 (de bestaande `hoogte=alpha`-route); fase 2: WINS50 |
| Zogverlies | 5 % / 2 % | 5 % |

## Afspraken tussen de onderdelen (contracten)

Deze afspraken liggen vast vóór de agents starten, zodat ze tegelijk kunnen werken.

### C1. Winddata per station (R2)

- `studio/v1/wind10/index.json`:
  `{jaren: [2022, 2023, 2024, 2025], bron: "KNMI EDR 10-minute-in-situ-meteorological-observations", stations: [{id, naam, lat, lon, dekking: {"2022": 0.98, …}, gemiddeld_ms}]}`
- `studio/v1/wind10/<stationId>/<jaar>.json`:
  `{station, naam, jaar, start, stap_s: 600, eenheid: "0,01 m/s", ontbrekend: 65535, n, data}`
  - `data`: base64 van een Uint16Array (little-endian), `ff` op 10 m in 0,01 m/s, één waarde per tien minuten.
  - De tijdas is dezelfde als die van de meegeleverde jaarreeksen in `src/opsplitsing/data/20xx.json`: de KNMI-tijdstempels over het Nederlandse kalenderjaar, met dezelfde verschuiving van −5 minuten als `knmi.py` en `modelHours` (de eerste waarde van 2025 is 2024-12-31T23:05Z). `start` is het eerste tijdstip van die as.
- API (achter het wachtwoord, alleen op `intern.`):
  - `GET /api/studio/stations`: de index.
  - `GET /api/studio/wind10/<stationId>/<jaar>`: het bestand uit R2. Staat het er nog niet, dan haalt de worker het eenmalig op bij KNMI EDR (`KNMI_EDR_API_KEY`), bewaart het en geeft het terug.
- Script `node scripts/studio-data.mjs wind10 [--upload]` haalt alle stations vooraf op.

### C2. Park en aanbod (`src/studio/park-model.mjs`, `src/studio/supply.mjs`; browser en worker)

```js
// park: {id: 'fryslan' | 'beabuorren' | 'osm:<lat4>,<lon4>', naam, lat, lon, turbines, rated_kw, hub_height_m, wake_pct,
//        curve: 'fryslan' | 'beabuorren' | 'standaard', hoogte: 'wins50' | 'alpha', aandeel /* 0..1 */, stations: [stationId, …],
//        herkomst: {turbines: 'osm' | 'aanname' | 'bron', …}}
parkPowerModel(park, day) // → v10 (m/s, gemiddelde van de gekozen stations) → MW van het hele park
buildSupply({jaar, parks, wind /* {stationId: Float64Array in m/s, NaN = ontbrekend} */, t /* tijdas uit C1 */})
// → {jaar, methode: 'studio', t, mw, v10: {parkId: [...]}, bron, stations: {stationId: [...]}, park_mw: {parkId: [...]}}
```

- `aandeel` is de bron van waarheid. De interface rekent MW om naar `aandeel` en terug; de startinstelling Bolsward zet precies 0,1 en 1,0.
- De uitvoer heeft dezelfde vorm als `src/opsplitsing/data/20xx.json` en de Vergelijken-bundel (`/opsplitsing-assets/bundle.json`), zodat de rekenkern hem zonder aanpassing kan lezen.
- Alleen momenten waarop elk gekozen station van elk park meet, komen in `t` (zoals de bundel). Afronding zoals de bundel.
- `parkPowerModel` wordt ook gebruikt voor de daggrafiek (C5), zodat dag en jaar met hetzelfde model rekenen.

### C3. Stationsvoorstel (`src/studio/stations.mjs`)

`suggestStations({lat, lon}, index)` → `{lijst: [{id, naam, km, dekking, gemiddeld_ms, zee}], voorstel: {enkel: [id], paar: [id, id] | null}, waarschuwingen: [...]}` met de regels uit stap 4.

### C4. Project (`studio/v1/projects/<id>.json`)

`{versie: 1, id, naam, gemaakt, gewijzigd, locatie: {lat, lon}, varianten: [{id, modelId, modules}], referentie, parken: [park uit C2], jaren: [2022, 2023, 2024, 2025], algemeen: {…zoals defaultGeneral()}}`

- `id`: 12 tekens base32.
- `studio/v1/projects/index.json` houdt de lijst bij (id, naam, locatie, gewijzigd) voor de startpagina.
- De startinstelling `bolsward` is een vast project in de code en wordt niet in R2 opgeslagen; **Kopie maken** zet een eigen versie in R2.

### C5. Parkdag en HARMONIE

- `GET /api/studio/park-dag?project=<id>&park=<parkId>&dag=<JJJJ-MM-DD>[&vergelijking=1]`: hetzelfde antwoord als `/api/wind` nu, maar gerekend met `parkPowerModel` en de gekozen stations. De bestaande grafiekonderdelen kunnen het zonder aanpassing tonen.
- HARMONIE: `src/harmonie.mjs` krijgt een lijst extra punten (`{id, latitude, longitude}`). De bestaande snapshots voor Fryslân en Beabuorren blijven ongewijzigd (zelfde sleutels, zelfde inhoud). De extra punten gaan naar `studio/v1/harmonie/{model}/{run}.json`.
- `GET /api/studio/harmonie?park=<parkId>&run=<run>` geeft hetzelfde antwoord als `/api/harmonie`, maar voor dat punt.

## Werkverdeling (agents)

Elke agent werkt in eigen bestanden. Gedeelde bestanden (`scripts/compose-worker.mjs`, `src/worker-template.mjs`, `wrangler.toml`, `README.md`, de uurlijkse taak) doet alleen de integrator.

| Agent | Taak | Eigen bestanden | Hangt af van | Klaar als |
|---|---|---|---|---|
| **A: Winddata** | C1: 10-minutenwind per station en jaar ophalen, comprimeren en in R2 bewaren; API-handlers; script om alles vooraf op te halen | `src/studio/wind-data.mjs`, `scripts/studio-data.mjs`, `tests/studio-wind-data.test.mjs` | — | Houtribdijk en Stavoren 2022–2025 zijn per tijdstip gelijk aan `stations.houtribdijk/stavoren` in de bundel (op de momenten die de bundel heeft); tests groen |
| **B: Parkmodel en aanbod** | C2 en C3: algemeen parkmodel, `buildSupply`, `suggestStations`, herkenning van Fryslân en Beabuorren in de OSM-lijst | `src/studio/park-model.mjs`, `src/studio/supply.mjs`, `src/studio/stations.mjs`, `tests/studio-supply.test.mjs` | — | **Pariteit**: de startinstelling Bolsward met de stationsreeksen uit de bundel geeft voor 2022–2025 exact de `mw` van `src/opsplitsing/data/20xx.json`; `parkPowerModel` geeft voor Fryslân en Beabuorren hetzelfde als `windPowerModel` in `knmi.mjs`; tests met een standaardpark en met ontbrekende data |
| **C: Projectstudio-interface** | Stappen 0–5 en 8: projectenlijst, kaart, catalogus en varianten, parken met MW, stationskeuze, beschikbaar vermogen; project bewaren, kopiëren en delen (C4); routes op `intern.` | `src/studio/server.mjs`, `src/studio/client.tsx`, `src/studio/*.tsx`, `src/studio/studio.css`, `tests/studio-routes.test.mjs` | A en B via C1–C4 (mag tegen stubs bouwen) | De hele stroom werkt in de browser op desktop en op 390 px; de startinstelling Bolsward laadt; geen pagina of API zonder wachtwoord |
| **D: Vergelijken** | Stap 6: Vergelijken in projectmodus met het aanbod uit C2; windprofielkeuze per modus; CSV en Resultaat naar Waterstofatlas met de projectaannames | wijzigingen in `src/electrolyser-hub.tsx`, `src/electrolyser-setup.mjs`, `src/electrolyser-wind.mjs`, `tests/studio-compare.test.mjs` | B | Met de startinstelling Bolsward is de uitkomst van Vergelijken gelijk aan die op mijnwindpark.nl; een project met een ander park rekent zonder fouten; bestaande tests ongewijzigd groen |
| **E: Windparkpagina's** | Stap 7 en C5: parkdag-API, stationsvergelijking, HARMONIE-punten voor projectparken, de parkpagina | `src/studio/park-day.mjs`, `src/studio/harmonie-points.mjs`, `src/studio/park-page.tsx`, wijzigingen in `src/harmonie.mjs`, `tests/studio-park.test.mjs` | B | Voor Fryslân en Beabuorren geeft de parkdag-API met de startinstelling hetzelfde als `/api/wind`; bestaande HARMONIE-snapshots ongewijzigd; een standaardpark toont daggrafiek, vergelijking en voorspelling |
| **Integrator** | Contracten vastleggen, host en routes, `compose-worker` (aparte bundel voor de studio), `wrangler.toml` (route `intern.mijnwindpark.nl`), HARMONIE-punten in de uurlijkse taak, samenvoegen, `npm run build`, README | gedeelde bestanden | A–E | `npm run build` groen, preview werkt, README-sectie *Projectstudio* |

Volgorde: A, B en C starten tegelijk. D en E starten zodra de pariteitstest van B groen is. Daarna voegt de integrator alles samen en test de hele keten.

## Controles

1. **Pariteit Bolsward** (de belangrijkste): aanbod, Vergelijken en de parkdag geven met de startinstelling exact dezelfde getallen als nu op mijnwindpark.nl.
2. **Data**: de reeksen uit KNMI EDR in R2 komen overeen met de bundel voor Houtribdijk en Stavoren.
3. **Toegang**: elke route op `intern.` geeft zonder sessie 401 of het wachtwoordformulier; elke response heeft `X-Robots-Tag: noindex`.
4. **Bestaande site**: `npm test` en `npm run build` blijven groen; `/elektrolyser`, `/opsplitsing`, de parkpagina's en de HARMONIE-snapshots op mijnwindpark.nl veranderen niet.
5. **Browser**: de hele stroom op desktop en op 390 px.

## Fase 2 (buiten deze versie)

- WINS50-hoogtevertaling voor elk park in Nederland, in plaats van de α-aanname.
- Eventueel: echte turbinecurves om uit te kiezen, eigen of geplande parken, een mix van modellen in één installatie.

Niet gepland: Opsplitsen in de Projectstudio, kabelverlies of kabelkosten, Engelse vertaling.

## Open punten en risico's

- **Plek in Bolsward**: de elektrolyser heeft nog geen vaste plek. De startinstelling gebruikt het centrum van Bolsward; dat verandert de getallen niet, omdat de stations vastliggen.
- **KNMI EDR**: limieten op het aantal verzoeken en de sleutel `KNMI_EDR_API_KEY`. Een jaar 10-minutendata vraagt waarschijnlijk meerdere verzoeken per station. Daarom: vooraf ophalen met het script, op aanvraag alleen als terugval.
- **Dekking**: niet elk station meet alle vier de jaren. De studio toont dat en waarschuwt in plaats van stil te vullen.
- **OSM-gegevens**: aantal turbines en vermogen kunnen fout zijn. Ze zijn aan te passen en gemarkeerd als bron OSM.
- **Park-id's**: de volgorde in `windparken.geojson` verandert als de kaartgegevens opnieuw worden opgehaald. Projecten bewaren daarom de coördinaten (`osm:<lat4>,<lon4>`) en de parkgegevens zelf, niet de volgorde.
- **HARMONIE**: elk extra punt maakt de uurlijkse taak iets zwaarder; daarom maximaal 50 projectparken. Voorspellingen gaan niet verder terug dan het KNMI-archief.
- **Inloggen**: de sessiecookie `__Host-site_session` geldt per host. Op `intern.` log je dus apart in, met hetzelfde wachtwoord.
