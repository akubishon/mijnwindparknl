# Maximum aantal modules verlaagd naar 12 (n.a.v. e-mail "Re_ Feedback over tools", 28 oktober)

## Aanleiding

In de e-mail "Re_ Feedback over tools" (ontvangen op 28 oktober) is aangegeven dat het
bereik van 1 tot 16 gelijke modules in de berekeningen te hoog lijkt. Meer modules vragen
extra ruimte en maken de installatie lastiger. Voor modules van 5 MW is het maximum daarom
op 12 modules gezet.

## Wijziging

- `src/opsplitsing/python/opsplitsing.py`
  - `MODULE_COUNTS` (keuzelijst op de pagina): `16` vervangen door `12`
    → `[1, 2, 3, 4, 5, 6, 8, 10, 11, 12]`.
  - `MAX_MODULES` (bovengrens voor scenario's, aanvragen en de gevoeligheidsanalyse):
    van `64` naar `12`. Aanvragen met meer modules worden nu geweigerd.
- `src/opsplitsing/python/scenarios.py`: standaardbereik van de scenario-CLI van `1-16`
  naar `1-12`, inclusief help- en foutteksten.
- `src/opsplitsing/PROVENANCE.json` en `worker/index.js`: hashes bijgewerkt en worker
  opnieuw samengesteld (`npm run compose`).

## Aandachtspunt: modulegrootte

De grens van 12 is gekozen voor modules van circa 5 MW. Verandert de modulegrootte
(bijvoorbeeld kleinere containerunits), dan moet het maximum opnieuw worden beoordeeld:
het gaat in de praktijk om ruimte en complexiteit per installatie, niet om het getal zelf.
De grens staat op één plek (`MAX_MODULES`) en is daar eenvoudig aan te passen.

## Tests

`npm test`: 114 tests, alle geslaagd.
