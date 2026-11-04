# Opsplitsing in Excel

`Opsplitsing.xlsm` is de berekening van [/opsplitsing](../src/opsplitsing/opsplitsing.html) als Excel-werkmap met VBA-macro's: één
elektrolyser van 44 MW of meerdere kleine modules, gesimuleerd per tien minuten op de windjaren 2022–2025. Het rekenmodel is
`src/opsplitsing/python/opsplitsing.py` (modelversie 18), naar VBA overgezet in [`vba/`](vba/).

## Gebruik

1. Open `Opsplitsing.xlsm` in Excel (Windows of Mac) en kies **Inhoud inschakelen** / **Macro's inschakelen**. Een gedownload
   bestand moet je mogelijk eerst deblokkeren: rechtsklik → Eigenschappen → *Blokkering opheffen*.
2. Kies op het werkblad **Invoer** de technologie en klik **Technologie laden**. Pas daarna de gele cellen aan: besturing, stand-by,
   windparken, windjaren, moduleaantallen en de aannames in de kolom *Waarde* (in getoonde eenheden, dus minimumlast 25 = 25 %).
3. Klik een knop:

| Knop | Macro | Werkblad |
| --- | --- | --- |
| Bereken | `Bereken` | **Resultaten**: per moduleaantal waterstof, bedrijfsuren, starts, kosten, LCOH, omslagpunten, uitsplitsing van het verschil met 1 module, uitkomst per windjaar, aanbod en een voorbeelddag |
| Gevoeligheid | `BerekenGevoeligheid` | **Gevoeligheid**: het voordeel van N modules (Invoer!C10) tegen 1 module als elke aanname 25 % verandert |
| Omslagkaart | `BerekenOmslagkaart` | **Omslagkaart**: goedkoopste aantal modules bij minimumlast 20–50 % en vaste kosten 0–2 M€ per module |
| Dagverloop | `BerekenDagverloop` | **Dagverloop**: elke tien minuten van één dag (Invoer!C11, leeg = de voorbeelddag) per moduleaantal, met de reden waarom er niet meer modules draaien |
| Alles berekenen | `BerekenAlles` | de vier hierboven |
| Technologie laden | `TechnologieLaden` | zet de standaardwaarden van PEM, Alkaline of Alkaline met hoge minimumlast in *Waarde* |
| Geheugen legen | `CacheLegen` | vergeet bewaarde simulaties |

Simulaties blijven bewaard zolang de werkmap open is. Wie alleen een kostenaanname wijzigt (stroomprijs, rente, offerte, ...), rekent
daarna vrijwel zonder wachttijd; bedrijfsvoering en rendement vragen een nieuwe simulatie. Eén simulatie is één windjaar met één
moduleaantal (ongeveer 52.000 tijdstappen); de standaardinstelling (4 jaren × 10 aantallen) is 40 simulaties.

## Wat er wel en niet in zit

Gelijk aan de website:

- besturingen *verdelen*, *bijschakelen* en *samen*; stand-by *vast* en *voorspelling* (met dezelfde, vaste voorspelfout per uur);
- alle aannames met dezelfde grenzen, bron en uitleg; de technologieën PEM, Alkaline en Alkaline met hoge minimumlast;
- windparken *beide*, alleen Windpark Fryslân of alleen Windpark Beabuorren;
- stackwissels, gepland onderhoud, storingen als vaste beschikbaarheidsafslag, degradatie, subsidies en opbrengsten;
- break-even-CAPEX, omslagpunt van de vaste kosten, uitsplitsing van het verschil, marginale kosten, voorbeelddag, gevoeligheid,
  omslagkaart en dagverloop.

Niet in de werkmap: de oude windprofielen (*Oud dagprofiel: Houtribdijk*, *Oude opsplitsing: hoogste station*, *Geschaald naar
gemeten dagproductie*), de gemeten productie van Windpark Fryslân, de windstappen per park in het dagverloop (KNMI-wind, hoogtevertaling,
turbinevermogen), opgeslagen scenario's en de koppeling met de Waterstofatlas. Het aanbod is steeds het standaardprofiel
(productie-onafhankelijk), vooraf berekend uit `src/opsplitsing/data/<jaar>.json`.

## Bijwerken

De werkmap wordt gebouwd, niet met de hand bewerkt:

```sh
pip install xlsxwriter
python3 scripts/build-opsplitsing-excel.py
```

Dat leest de aannames, technologieën en teksten uit het Python-model (via `src/opsplitsing/browser-runtime.py`), zet het windaanbod
op het verborgen werkblad `Data_Aanbod` en schrijft de VBA-modules uit `excel/vba/*.bas` in `vbaProject.bin` (`scripts/vbaproject.py`,
volgens MS-OVBA; alleen broncode, Excel compileert bij het openen). Wijzig de VBA in de `.bas`-bestanden en bouw opnieuw. Verandert het
Python-model, pas dan de VBA op dezelfde plek aan: de functies volgen `opsplitsing.py` stap voor stap en dragen dezelfde namen
(`Simulate` = `simulate`, `BreakEven` = `break_even`, ...).

Controle tegen het Python-model:

```sh
python3 scripts/test-opsplitsing-excel.py              # vier cases: Bereken en Dagverloop
python3 scripts/test-opsplitsing-excel.py --volledig   # ook Gevoeligheid en Omslagkaart
```

Dat draait de macro's in LibreOffice (headless) en vergelijkt elke uitkomstcel met `dispatch()` uit `browser-runtime.py`, met een
relatieve tolerantie van 10⁻⁹. Vereist LibreOffice met Python-UNO. LibreOffice rekent VBA veel trager dan Excel; reken op enkele
minuten.

Werkt het VBA-project in een Excel-versie niet, importeer de modules dan met de hand: open de VBA-editor (Alt+F11), verwijder de twee
modules en kies *Bestand → Bestand importeren* voor `excel/vba/OpsplitsingModel.bas` en `OpsplitsingWerkblad.bas`. De bestanden zijn
UTF-8; sla ze voor het importeren op als Windows-1252 (ANSI), anders worden é, ë en € onleesbaar.

## Eén moment uit de jaarrun narekenen (op de website)

Op `/opsplitsing` staat na **Bereken** het blok **Eén moment narekenen**. Kies een dag, een begintijd en de moduleaantallen; de knop
*Reken dit moment na in de jaarrun* in *Een dag van dichtbij* doet hetzelfde voor het gekozen moment. Het moment komt uit dezelfde
jaarsimulatie als de uitkomst (`moment_trace` in `opsplitsing.py`), niet uit een aparte dagsimulatie, en is onafgerond.

Per moduleaantal staat elke rekenstap met formule, ingevulde getallen, uitkomst en de waarde uit de simulatie met ✓:
de toestand vóór het moment (aan of uit, aan- en uit-tijd, resterende opstartminuten, slijtage-uren, onderhoud, startvertraging),
hoeveel modules passen en draaien, welke modules dat zijn, de last, de start (warm of koud) met het opstartverlies, de kilo's, de
stroom, het warmhouden en de resterende opstartminuten voor het volgende moment. **Excel met formules** downloadt hetzelfde als
werkmap: de toestand vóór het moment is gele invoer, elke stap een formule, kolom G controleert elke stap tegen de simulatie
(`src/opsplitsing/moment-check.js`, getest in `tests/moment-check.test.mjs`). Bij stand-by *met voorspelling* zijn de besluiten
van de voorspelling (toegestane starts, volgorde, warm gehouden) invoer; de rest blijft formule.

## Eén interval narekenen (los rekenblad)

`Interval-10-minuten.xlsx` (zonder macro's) rekent één tijdstap van tien minuten met gewone Excel-formules na, voor 1, 2, 3 en 4
modules naast elkaar (besturing *verdelen*, standaardwaarden PEM). Vul in de gele cellen het windaanbod en eventueel andere aannames in.
Sectie C toont per moduleaantal stap voor stap het vermogen per module, de minimumlast, hoeveel modules passen, hoeveel er draaien, de
last, het rendement, de waterstof in kg en de benutting. Sectie D laat zien hoe de besturing het aantal draaiende modules kiest. De
narekening gaat uit van modules die al draaien: opstartverlies, minimale aan-/uit-tijd, startvertraging en onderhoud tellen niet mee.

```sh
pip install openpyxl
python3 scripts/build-interval-excel.py
```
