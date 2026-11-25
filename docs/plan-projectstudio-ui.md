# Plan: Projectstudio mooier maken (interface)

Status: plan, nog niet gebouwd. Opgesteld op 25 november 2026. Hoort bij `docs/plan-projectstudio.md`; de aanpak en de rekenkern blijven precies zoals daar staat. Dit plan gaat **alleen over de interface**.

## Wat er nu mis is

De studio werkt, maar voelt als een formulier met tabellen:

1. **Niet in de huisstijl.** De studio heeft een eigen grijze achtergrond (`#f4f6f9`), afgeronde hoeken van 8 px en een groene `status-bron`-chip. De hoofdsite gebruikt papier (`#EFECE6`), navy (`#0C2340`), cyaan (`#00A6DE`), lichtblauw (`#C3E4F2`) en de schuine hoek rechtsboven (`border-radius: 0 X 0 0`). De studio lijkt daardoor een andere site.
2. **Geen kop.** Alleen de tekst “Projectstudio” met een streep; geen navy topbalk zoals op mijnwindpark.nl.
3. **Stappen zonder status.** De zes tabs laten niet zien wat af is, wat ontbreekt of waar een waarschuwing staat. Je weet pas bij stap 5 dat een park nog geen station heeft.
4. **Geen overzicht.** Nergens staat in één oogopslag: locatie, toegewezen MW, aantal varianten, stations, klaar of niet.
5. **Alles is een tabel of een grijze noot.** Belangrijke getallen (MWh, vollasturen, toegewezen MW) staan klein in tabelcellen. Uitleg staat overal in `wind-note`, ook waar niemand hem nodig heeft.
6. **Kaart klein en kaal.** Parken zijn gelijke stipjes, geen namen, geen lijn naar de elektrolyser, geen stations op de kaart.
7. **Grafieken minimaal.** Handgetekende SVG zonder rasterlijnen, tooltip of eenheden op de as; kleuren hard in de code.
8. **Weinig terugkoppeling.** “Laden…” als platte tekst, geen lege toestanden, bewaren alleen als tekst naast de knop.

## Richting

**Een werkbank in de huisstijl van mijnwindpark.nl.** Rustig, veel ruimte, grote getallen, de kaart als middelpunt. Niet speels: het is een rekentool voor ons team, dus helderheid boven versiering.

- Dezelfde kleuren, letter (TASA Orbiter) en schuine hoek als de hoofdsite, via `brand-style.css`. Geen nieuwe huisstijl.
- Eén vaste opbouw voor elk scherm in de editor: **stappenrail links, werkvlak midden, projectoverzicht rechts**.
- Elk scherm begint met wat je moet doen en eindigt met **Volgende stap →**.
- Getallen die ertoe doen worden **tegels** (zoals `metric` op de hoofdsite); details en aannames gaan in uitklapbare blokken.
- Iconen uit `lucide-react` (zit al in het project).

## Opbouw

### Topbalk

Navy balk zoals op mijnwindpark.nl (hoogte 72 px in plaats van 100, het is een werkomgeving), met:

- links het merkteken en **Projectstudio**, daarnaast het label *intern*;
- in het midden, in de editor: de projectnaam (klik om te wijzigen) en een bewaarstatus (`Bewaard · 14:32` / `Niet bewaard` met stip);
- rechts: **Bewaren**, menu (Kopie maken, Link kopiëren, Naar projecten) en Uitloggen.

### Editor: drie kolommen

| Kolom | Breedte | Inhoud |
|---|---|---|
| Stappenrail | 240 px | De zes stappen, elk met nummer, naam, één regel samenvatting (“Bolsward”, “2 varianten”, “48,7 MW uit 2 parken”) en een status: **klaar** (vinkje, navy), **open** (lege cirkel), **let op** (amber driehoek, met aantal waarschuwingen). |
| Werkvlak | flexibel | De stap zelf. |
| Projectoverzicht | 300 px, plakt bij scrollen | Minikaart met elektrolyser en parken; tegels *toegewezen MW*, *varianten*, *stations*; zodra het aanbod berekend is ook *aanbod 2025 (MWh)* en *vollasturen*; daaronder de lijst open punten met een link naar de stap. |

Onder 1100 px schuift het overzicht onder het werkvlak en wordt het inklapbaar. Op 390 px wordt de stappenrail een horizontale strook met de nummers bovenaan, en staat er een vaste balk onderin met **← Vorige** · *stap 3 van 6* · **Volgende →**.

De stapstatus komt uit één functie `stepStatus(project, data)` in een nieuw bestand `src/studio/status.mjs`, zodat rail, overzicht en de knop “Bereken aanbod” dezelfde regels gebruiken (en het te testen is).

## Per scherm

### 0. Projecten (startpagina)

- Lichtblauw introblok zoals `.intro` op de hoofdsite: “Projectstudio” als kop, één zin uitleg, knoppen **Nieuw project** en **Bolsward openen**.
- Projecten als **kaarten** in een raster in plaats van een tabel: statische minikaart (PDOK-tegel met stippen), naam, plaats (omgekeerd opzoeken via de Locatieserver bij bewaren, of coördinaten), aantal parken en MW, laatst gewijzigd (“2 uur geleden”).
- Bolsward als eerste kaart met het label *startinstelling*.
- Zoekveld en sortering (laatst gewijzigd / naam) zodra er meer dan acht projecten zijn.
- Lege toestand: illustratie van een turbine (de bestaande `turbine-art`) met “Nog geen projecten. Begin met Bolsward of een nieuw project.”

### 1. Locatie

- Kaart **groot** (minstens 60 % van de schermhoogte), zoekveld zwevend linksboven op de kaart, zoals in de Atlas.
- Elektrolyser als eigen marker (navy, met cyaan rand en icoon), niet de standaard MapLibre-druppel.
- Onder de kaart een kaartje met de gekozen plek: plaatsnaam, coördinaten, en “Dichtstbijzijnde parken: Fryslân 4,2 km, Beabuorren 6,8 km” als voorproefje op stap 2.
- Knop **Gebruik deze locatie →** gaat door naar stap 2.

### 2. Elektrolyser

- Filters als **chips** bovenaan (technologie: PEM / Alkalisch / SOEC; fabrikant als zoekbare lijst; vermogen als schuifje met twee grepen).
- Catalogus als **kaarten** zoals de bestaande `catalogue-card` (fabrikant, model, modulevermogen, technologie), met de knop **Kies voor variant A/B/…**. Lijst met virtuele scroll of “meer laden” bij veel modellen.
- Varianten als **naast elkaar staande kaarten** (A, B, C) met: model, aantal units met − / + knoppen, nominaal en opname bij vollast als groot getal, status *klaar* of *open punten* (als `status-chip`), en de referentie als ster in de kop.
- Open punten in een amber blok met de knop **Vul aan met voorzichtige aannames**.

### 3. Windparken en vermogen

- Kaart en lijst **naast elkaar** (kaart 60 %, lijst 40 %; op 390 px onder elkaar).
- Op de kaart:
  - parken als cirkels **geschaald naar MW**, naam zichtbaar vanaf zoom 10;
  - gekozen parken in amber met een **lijn naar de elektrolyser** en de afstand als label;
  - hover toont naam, MW, turbines; klik voegt toe of verwijdert.
- Lijst: zoekveld, daarna parken als compacte rijen (naam, plaats, MW, km, knop **+**). Gekozen parken bovenaan.
- Gekozen park als **kaart**:
  - kop met naam, *bekend parkmodel* of *standaardmodel*, afstand;
  - **schuifje plus invoerveld** voor “MW voor de elektrolyser”, met een balk die het aandeel van het park laat zien (“38,3 van 382,7 MW · 10 %”);
  - turbines, turbinevermogen, ashoogte en zogverlies in een uitklapblok *Parkgegevens*, met de chips *bron OSM* / *aanname* / *eigen invoer*;
  - link **Windparkpagina →** en een prullenbak-icoon.
- Totaal onderaan: “Toegewezen: 48,7 MW uit 2 parken”.

### 4. KNMI-stations

- Per park een kaart met links een **kleine kaart**: het park, de stations als driehoeken, een cirkel van 25 km, gekozen stations gevuld.
- Rechts het **voorstel als twee keuzekaarten**: *Eén station* (Stavoren, 9 km) en *Gemiddelde van twee* (Houtribdijk + Stavoren, “−3,1 % momenten”). Eén klik kiest.
- Daaronder de volledige lijst, met per station de dekking als **kleine balk** (navy gevuld, amber onder 90 %) in plaats van percentages in cellen, de gemiddelde wind, en het label *zee*.
- Waarschuwingen als amber blok bovenaan de parkkaart, niet als lijst eronder.
- **Gebruik voor alle parken** als duidelijke knop in de kop.

### 5. Beschikbaar vermogen

- Rekenen met een **voortgangsbalk** (“Winddata laden: 3 van 4 station-jaren”) in plaats van tekst in de knop. Start vanzelf als alle eerdere stappen klaar zijn.
- Bovenaan vier **tegels**: aanbod 2025 (GWh), vollasturen, dekking, hoogste vermogen.
- **Duurkromme** opnieuw: rasterlijnen, as in MW en %, gevulde vlakte onder de lijn, per variant een stippellijn met label, en een tooltip die bij hover zegt “30 % van de tijd minstens 21,4 MW”.
- Nieuw: **warmtekaart** van het aanbod over het jaar (dag op de x-as, uur op de y-as, kleur = MW, lichtblauw naar navy). Laat in één beeld zien wanneer er wind is en hoe vaak het stil is.
- Nieuw: **maandstaafjes** met aanbod per maand, gestapeld per park.
- De tabel per park blijft, maar in een uitklapblok *Cijfers per park*.

### 6. Vergelijken

- De bestaande `CompareTab` blijft; die heeft al de huisstijl van de hoofdsite. Alleen de omlijsting wordt gelijk aan de andere stappen (kop, korte uitleg, overzicht rechts).
- In het overzicht rechts komen na het rekenen de kerncijfers van de referentievariant (waterstof per jaar, benutting).

### 7. Windparkpagina

- Kop zoals een parkpagina op de hoofdsite: lichtblauw blok met naam, “89 × 4,3 MW · 115 m · 10 % naar de elektrolyser”, en een kleine kaart.
- **Dagkiezer** met ‹ vandaag › knoppen en een datumveld, in plaats van alleen een datumveld.
- Tegels: dagenergie, gemiddeld vermogen, hoogste vermogen, ontbrekende minuten.
- Daggrafiek, stationsvergelijking en HARMONIE als **drie tabs** in één paneel, met de gedeelde grafiekstijl (zie hieronder). HARMONIE krijgt de run en de ouderdom als chip.
- Uurtabel in een uitklapblok, CSV als knop met download-icoon.

## Gedeelde onderdelen

Nieuwe bestanden in `src/studio/ui/`:

| Onderdeel | Doel |
|---|---|
| `tokens.css` | Kleuren, ruimtes en hoeken als CSS-variabelen, gelijk aan `brand-style.css`; vervangt de losse waarden in `studio.css`. Geen groen; amber `#F5A800` alleen voor *let op* en gekozen parken. |
| `StepRail.tsx` | Stappenrail met status, ook de mobiele strook en de onderbalk. |
| `Overview.tsx` | Projectoverzicht rechts. |
| `Tile.tsx` | Kerngetal met label, eenheid en optionele toelichting. |
| `Card.tsx`, `Notice.tsx` | Kaart en meldingsblok (info, let op, fout) met de schuine hoek. |
| `NumberField.tsx` | Getalinvoer met komma, − / +, eenheid en grenzen; vervangt de vele losse `onChange`-regels. |
| `Slider.tsx` | Schuifje gekoppeld aan een `NumberField` (MW per park, vermogensfilter). |
| `Chart.tsx` | Gedeelde grafiekbasis: assen, rasterlijnen, legenda, tooltip, kleuren uit de tokens. DurationChart, DayChart en de nieuwe warmtekaart en maandstaafjes bouwen hierop. |
| `Skeleton.tsx`, `Empty.tsx` | Laadtoestand en lege toestand. |
| `Toast.tsx` | Korte melding rechtsonder (“Project bewaard”, “Link gekopieerd”). |

Grafiekkleuren: navy voor de hoofdlijn, cyaan voor de tweede reeks, amber voor varianten en drempels, lichtblauw voor vlakken. Per reeks hoogstens vier kleuren; daarna patroon of label.

## Kleine verbeteringen die veel doen

- **Waarschuwen bij weggaan** met niet bewaarde wijzigingen (`beforeunload`) en **Ctrl/Cmd+S** om te bewaren.
- **Link kopiëren** als knop met toast in plaats van de volledige URL als tekst.
- Stap in de URL (`/project/<id>?stap=3`), zodat je een link naar een stap kunt delen en terug kunt met de browserknop.
- Uitleg die nu in `wind-note` staat: de eerste zin blijft, de rest gaat achter een **ⓘ**-knop of in een uitklapblok *Hoe rekent de studio dit?*.
- Getallen in tabellen rechts uitgelijnd met `font-variant-numeric: tabular-nums`.
- Zichtbare focus en toetsenbordbediening op kaart-lijsten en schuifjes; kleur nooit als enige signaal (status altijd ook met icoon en tekst).

## Wat niet verandert

- De rekenkern, het parkmodel, `buildSupply`, de stationsregels en alle API's.
- De vorm van een project in R2 (C4). Alleen de stap in de URL is nieuw en wordt niet bewaard.
- `CompareTab` en de rest van mijnwindpark.nl; `brand-style.css` wordt gelezen, niet gewijzigd.
- Alleen Nederlands, alles achter het wachtwoord, `noindex`.

## Volgorde

| Fase | Inhoud | Klaar als |
|---|---|---|
| **1. Basis** | `tokens.css`, topbalk, drie kolommen, `StepRail` met `stepStatus`, `Overview`, `Card`, `Tile`, `Notice`, `NumberField`; `studio.css` opgeschoond | Alle schermen staan in de nieuwe opbouw en huisstijl; Bolsward laadt en rekent gelijk aan nu |
| **2. Schermen** | Projectkaarten, grote kaart met eigen marker, parken geschaald met lijnen, parkkaarten met schuifje, stationskaarten met minikaart en dekkingsbalken, variantkaarten | Hele stroom op desktop en 390 px zonder tabellen als hoofdvorm |
| **3. Grafieken** | `Chart.tsx`, nieuwe duurkromme met tooltip, warmtekaart, maandstaafjes, windparkpagina met tabs en dagkiezer | Grafieken met assen, eenheden en tooltip; leesbaar op 390 px |
| **4. Afwerking** | Toasts, skeletons, lege toestanden, sneltoets, waarschuwing bij weggaan, stap in de URL | Geen platte “Laden…”-teksten meer |

Elke fase is los te mergen. Fase 1 is het grootste verschil in uitstraling.

## Controles

1. **Getallen ongewijzigd**: met Bolsward geven aanbod, Vergelijken en parkdag dezelfde uitkomst als vóór de wijziging (bestaande tests, plus een vergelijking van de getoonde tegels met de oude tabelwaarden).
2. **`stepStatus`** heeft eigen tests in `tests/studio-status.test.mjs`: leeg project, Bolsward, park zonder station, station met lage dekking.
3. **Schermafbeeldingen** met Playwright van elk scherm op 1440 px en 390 px, vóór en na, toegevoegd aan de PR.
4. **Toegankelijkheid**: toetsenbord door de hele stroom; contrast van tekst minstens 4,5:1 (navy op papier en lichtblauw haalt dat).
5. `npm test` en `npm run build` groen; de bundelgrootte van `studio.js` groeit hoogstens 15 % (geen nieuwe grafiekbibliotheek, alleen eigen SVG).

## Open punten

- **Plaatsnaam bij projecten**: omgekeerd zoeken via de PDOK Locatieserver bij bewaren. Voorstel: als extra veld `plaats` in het project; oude projecten tonen coördinaten tot ze opnieuw bewaard worden.
- **Minikaart op projectkaarten**: een echte MapLibre-kaart per project is zwaar. Voorstel: één statische PDOK-tegel met de stippen als SVG eroverheen.
- **Warmtekaart**: 52 560 tienminutenwaarden in één SVG is te veel. Voorstel: per uur middelen (8 760 cellen) en tekenen op een `<canvas>`.
- **Donkere modus**: de hoofdsite heeft er geen. Voorstel: niet in deze ronde.
