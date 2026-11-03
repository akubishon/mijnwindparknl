# Opsplitsing in Excel

`Opsplitsing.xlsm` is de berekening van [/opsplitsing](../src/opsplitsing/opsplitsing.html) als Excel-werkmap met VBA-macro's: één
elektrolyser van 44 MW of meerdere kleine modules, gesimuleerd per tien minuten op de windjaren 2022–2025. Het rekenmodel is
`src/opsplitsing/python/opsplitsing.py` (modelversie 18), naar VBA overgezet in [`vba/`](vba/).

Downloaden: op de site via de link bovenaan [/opsplitsing](https://mijnwindpark.nl/opsplitsing), of direct
`https://mijnwindpark.nl/opsplitsing/Opsplitsing.xlsm` (achter de site-login). Het bestand is te groot om in `worker/index.js` op te nemen;
Cloudflare serveert het als Workers Static Asset (`[assets]` in `wrangler.toml`, map `excel/`). Met `run_worker_first` loopt elk
verzoek eerst door de worker, dus de login geldt en alleen deze route bereikt de bestanden.

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
