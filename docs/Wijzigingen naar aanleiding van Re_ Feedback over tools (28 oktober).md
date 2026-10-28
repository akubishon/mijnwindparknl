# Wijzigingen naar aanleiding van e-mail "Re_ Feedback over tools" (ontvangen 28 oktober)

Dit bestand legt de wijzigingen uit die voortkomen uit de e-mail **"Re_ Feedback over tools"**, ontvangen op **28 oktober 2026**. Elke keuze hieronder volgt uit die e-mail.

## Taak 1: minimumlast van de elektrolysers

**Bron van de keuze:** e-mail "Re_ Feedback over tools" (28 oktober).

### Wat is veranderd

| Technologie | Oud | Nieuw |
|---|---|---|
| PEM (standaard) | 10 % | **25 %** |
| Alkaline | 20 % | **30 %** |
| Alkaline, hoge minimumlast (scenario) | 40 % | 40 % (ongewijzigd) |

- `src/opsplitsing/python/opsplitsing.py`: standaard `minimumlast` in `Aannames` en de alkaline-waarde in `TECHNOLOGIES`. `MODEL_VERSION` is opgehoogd van 12 naar 13, zodat oude, opgeslagen resultaten vervallen.
- `src/opsplitsing/browser-runtime.py`: de modelversie voor de browser is opgehoogd van 13 naar 14 (cache).
- `src/opsplitsing/PROVENANCE.json`: de bronhash van `opsplitsing.py` is bijgewerkt.
- `worker/index.js`: opnieuw samengesteld met `npm run compose`.

### Waarom
De oude waarden (PEM 10 %, alkaline 20 %) waren plaatshouders en te optimistisch voor één module. Een enkele PEM-module komt in de praktijk niet onder ongeveer 25–30 % last. Alkaline zit op een vergelijkbaar niveau. 25 % ligt aan de onderkant van die bandbreedte. Voor alkaline is 30 % gekozen, aan de bovenkant, omdat gasvermenging bij lage last daar meestal de grens zet.

### Eén unit tegenover meerdere parallelle units
De minimumlast geldt **per module**. Het model simuleert elke module apart. Bij N parallelle modules daalt de minimumlast van het hele systeem daardoor vanzelf naar ongeveer 1/N van die waarde. Voorbeeld voor PEM bij 44 MW:

- 1 × 44 MW: produceert pas vanaf ongeveer 11 MW (+ BoP).
- 4 × 11 MW: de eerste module draait al vanaf ongeveer 2,75 MW (+ BoP).

Er komt daarom geen aparte parameter voor parallelle units. Het onderscheid ontstaat in de simulatie. De waarde blijft per run aanpasbaar in het formulier (veld "Minimumlast").

### Gevolg
Bij weinig wind draaien minder modules en zijn er minder productie-uren, vooral met één module. Daardoor is opsplitsen in meerdere modules gunstiger dan in de vorige versie.

### Tests
`npm test`: 114 tests, alle 114 geslaagd.

## Taak 2: vaste kosten per extra module als onzekere aanname

**Bron van de keuze:** e-mail "Re_ Feedback over tools" (28 oktober).

### Wat is veranderd
- `src/opsplitsing/python/opsplitsing.py`: `vaste_kosten_module_meur` (standaard 1 M€) heeft nu als herkomst **"onzekere aanname"** (nieuwe set `UNCERTAIN`) in plaats van "plaatshouder". De uitleg in het formulier vermeldt dat het geen gevalideerde prijs is. De omslagkaart loopt nu van 0 tot **2 M€** (was tot 1,5 M€). Zo valt de hele bandbreedte van de scenario's (0,3–2 M€) binnen de gevoeligheidsanalyse.
- `src/opsplitsing/opsplitsing.js`: bij "Nu aangenomen: … M€" in de kopregel staat nu dat dit een onzekere aanname is, die je toetst aan het omslagpunt en de omslagkaart.
- `src/opsplitsing/report-ui.js`: de bronnentekst van het rekenrapport zegt hetzelfde. Er staat niet meer "voorlopig".
- `src/opsplitsing/report-model.js`: als deze aanname wordt gebruikt, komt er een aparte regel bij "Grenzen van deze uitkomst".
- `src/opsplitsing/PROVENANCE.json` (bronhash) en `worker/index.js` (`npm run compose`) zijn bijgewerkt.

### Waarom
De vaste kosten per module (gelijkrichter, transformator, besturing, leidingwerk) hangen af van de modulegrootte. Er zijn geen losse PCU-prijzen beschikbaar. De 1 M€ is daarom geen bronwaarde. Het model presenteert deze waarde niet als prijs, maar toont hoe de uitkomst ervan afhangt:
- **Omslagpunt** per aantal modules: de hoogste vaste kosten waarbij opsplitsen nog niet duurder per kilo is.
- **Omslagkaart**: het goedkoopste aantal modules per combinatie van minimumlast (10–50 %) en vaste kosten (0–2 M€).
- **Gevoeligheid ±25 %** en de scenario's "vaste kosten 0,5 M€" en "vaste kosten 2 M€".

Een conclusie over opsplitsen is alleen robuust als die over deze bandbreedte gelijk blijft.

### Tests
`npm test`: 114 tests, alle 114 geslaagd.

## Correctie: minimumlast in omslagkaart en scenario's

De standaardwaarden (PEM 25 %, alkaline 30 % per module) stonden al goed in `opsplitsing.py` en `electrolyser-kernel.mjs`. Maar de omslagkaart rekende nog met 10–50 % en het gevoeligheidsscenario met "minimumlast 10 %". Die lagen buiten de bandbreedte van 25–30 % voor één module.

- Omslagkaart: minimumlast 20, 25, 30, 40 en 50 %.
- Scenario "minimumlast 10 %" vervangen door "minimumlast 30 %" (bovenkant van de bandbreedte voor PEM). "40 %" blijft staan.
- In de veldtoelichting en op de pagina staat nu expliciet: de waarde geldt per module. Bij N parallelle modules daalt de ondergrens van het systeem naar ongeveer 1/N (1 × 44 MW: ca. 11 MW; 4 × 11 MW: ca. 2,75 MW).
- `MODEL_VERSION` 14 → 15, browser-modelversie 15 → 16, bronhash in `PROVENANCE.json` bijgewerkt, `worker/index.js` opnieuw samengesteld.

`npm test`: 114 tests, alle 114 geslaagd.
