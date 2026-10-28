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
