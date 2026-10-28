# Degradatiemethode aangepast n.a.v. e-mail "Re_ Feedback over tools" (28 oktober)

De keuze hieronder volgt uit de e-mail **"Re_ Feedback over tools"**, ontvangen op 28 oktober.

## Wat is er veranderd

**Voorheen**
- Degradatie stond als `degradatie_1000h` (% extra verbruik per 1000 bedrijfsuren), vermenigvuldigd met de stacklevensduur.
- Starts en lastwisselingen telden als extra *equivalente bedrijfsuren* (`eq_uur_warme_start`, `eq_uur_koude_start`, `eq_uur_per_lastcyclus`). Daardoor sleten stacks sneller en kwam de stackwissel eerder.

**Nu**
- Starts en lastwisselingen tellen niet meer als extra bedrijfsuren. De drie `eq_uur_*`-aannames zijn verwijderd. De slijtage voor stackwissels en stackkosten volgt nu alleen uit de echte bedrijfsuren.
- Degradatie werkt als een **afname van de waterstofproductie bij dezelfde vermogensinput**. Het energieverbruik per kg stijgt.
- Eenvoudige benadering: het energieverbruik neemt **lineair met 1 % per jaar** toe, **tien jaar lang** (`degradatie_jaar = 0,01`, `degradatie_jaren = 10`). Het model rekent met het gemiddelde over die periode: `degradatie_jaar × degradatie_jaren / 2` = 5 % meerverbruik per kg.
- Fabrikanten geven vaak **0,8–1,0 % degradatie per jaar** op. Dit staat ook in de uitleg bij het invoerveld.

## Waar

- `src/opsplitsing/python/opsplitsing.py`: aannames, `degradation()`, `stack_kg_h()`, `simulate()`. `MODEL_VERSION` is verhoogd naar 13, zodat oude caches vervallen.
- `src/electrolyser-kernel.mjs`, `src/electrolyser-setup.mjs`: de JavaScript-port en de invoervelden.
- `src/opsplitsing/opsplitsing.js`, `src/opsplitsing/report-moments.js`: de samenvatting en de rekenuitleg.
- Referentiefixtures en de hash in `PROVENANCE.json` zijn opnieuw uit het Python-model gemaakt. `worker/index.js` is opnieuw samengesteld.

## Effect (2025, standaard-PEM, verdelen)

| Modules | Waterstof voorheen | Waterstof nu | LCOH voorheen | LCOH nu |
|---|---|---|---|---|
| 1 × 44 MW | 2.960,4 t | 2.980,8 t | 8,13 €/kg | 8,03 €/kg |
| 2 × 22 MW | 3.072,0 t | 3.097,8 t | 8,09 €/kg | 7,97 €/kg |

De gemiddelde degradatie gaat van 5,7 % (0,19 %/1000 h × 60.000 h / 2) naar 5 %. Bovendien leiden starts niet meer tot eerdere stackwissels. Het voordeel van opsplitsen in LCOH stijgt van −0,048 naar −0,064 €/kg.
