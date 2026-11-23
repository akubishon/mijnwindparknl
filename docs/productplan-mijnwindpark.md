# Productplan mijnwindpark.nl (hypothetisch)

*Versie 1 · 23 november 2026 · status: denkoefening, nog niet gevalideerd met klanten.*

Dit plan beantwoordt één vraag: **hoe wordt mijnwindpark.nl van een site voor één specifiek project een product dat we in de energietransitiemarkt kunnen verkopen?** Het is bewust hypothetisch. Alle prijzen, aantallen klanten en omzetten zijn aannames om te toetsen, geen voorspellingen. Marktcijfers hebben een bron en een peildatum; controleer ze opnieuw voordat ze extern worden gebruikt.

Het plan voor de Waterstofatlas staat apart in [`productplan-waterstofatlas.md`](productplan-waterstofatlas.md). De knop **Productweergave** op de site (zie §12) is de verkoopversie van dit plan.

---

## 1. Samenvatting in tien regels

1. mijnwindpark.nl is nu een beslisinstrument voor één project: 10 % van Windpark Fryslân plus Windpark Beabuorren (tot 48,7 MW) voedt een elektrolyser van 44 MW.
2. Onder die specifieke laag zit iets generieks: **een rekenplatform dat per tien minuten doorrekent wat een duurzame bron levert, wat een flexibele afnemer daarvan kan benutten achter een begrensde aansluiting, en wat dat kost** — op echte meetjaren, met conclusies die rekening houden met onzekerheid, narekenbaar tot in Excel.
3. Dat is precies het centrale probleem van de Nederlandse energietransitie in 2026: netcongestie, energiehubs, cable pooling onder de Energiewet, waterstof en participatie.
4. De site wordt een product door langs vijf assen te generaliseren: **bron** (wind → wind, zon, net), **locatie** (twee parken → elk punt in Nederland), **afnemer** (elektrolyser → batterij, e-boiler, laadplein), **aansluiting** (vast → groepscontract, non-firm) en **economie** (€/kg → €/kg, €/MWh, € per lid).
5. Kansrijkste eerste klanten: **ontwikkelaars van waterstof- en flexprojecten** en **energiehub-initiatieven**, bediend met een vaste-prijs **haalbaarheidsscan** die via de eigen adviespraktijk wordt geleverd. Voor energiehubs vergoedt de EHUB-subsidie tot 1 mei 2027 een groot deel van zo'n scan of studie.
6. Grootste groeimarkt: energiehubs en bedrijven op de wachtlijst voor netcapaciteit; daarvoor is een batterij- en e-boilerkern nodig.
7. Volumeproduct met merkfit: een **park- en ledenportaal** voor energiecoöperaties en parkeigenaren ("mijn windpark").
8. **Grootste blokkade:** de gemeten productie van Windpark Fryslân komt uit de backend van de publieke park-app. Dat is niet bruikbaar voor een commercieel product zonder toestemming. Het product moet draaien op **klantdata plus publieke modellen**.
9. **Verborgen troef:** sinds januari 2026 wordt elke HARMONIE-run bewaard. Dat archief maakt "rekenen met de voorspelling zoals die toen was" mogelijk; concurrenten rekenen vaak met perfecte kennis van de wind.
10. Eerste stap: tien tot vijftien klantgesprekken en drie pilotscans in de komende drie maanden, met de Productweergave als demo.

---

## 2. Wat we nu hebben

### 2.1 Functies

| Onderdeel | Wat het doet | Productwaarde |
|---|---|---|
| Startpagina | Stroomschema van wind naar waterstof, zuurstof en warmte | Uitleg van een project in één beeld |
| Parkpagina's Fryslân en Beabuorren | Gemeten uurproductie, KNMI-tienminutenmodel, HARMONIE-verwachting naast werkelijkheid, actueel vermogen (circa elke 10 s), stationsvergelijking, CSV/PNG | Transparantie en vertrouwen: het model wordt dagelijks getoetst aan de meting |
| Elektrolyser · Catalogus | 64 elektrolysers van 26 fabrikanten uit de Waterstofatlas, elk gegeven met status (bron, afgeleid, aanname, open) | Leverancierskeuze op feiten |
| Elektrolyser · Samenstellen | Tot 120 opstellingen (model × aantal modules), aangevuld tot het doelvermogen | Van shortlist naar rekenbare opties |
| Elektrolyser · Vergelijken | Waterstof, benutting, starts, LCOH en maximale meerprijs per opstelling op vier windjaren; conclusie met robuustheidstoets | Onderbouwde keuze en onderhandelingsruimte |
| Opsplitsen | Eén grote of meerdere kleine modules; originele Python-kern in de browser; gevoeligheid, omslagkaart, rekenrapport, Excel met echte formules | Een besluit dat financiers kunnen narekenen |
| Koppeling Waterstofatlas | Shortlist in, resultaat terug naar de Arena | Keten van datasheet tot besluit |
| Engels | Volledige vertaallaag | Internationale klanten en leveranciers |

### 2.2 Data

| Bron | Inhoud | Resolutie en omvang | Herkomst | Commercieel bruikbaar? |
|---|---|---|---|---|
| Productie Windpark Fryslân | Uurproductie en dagtotalen 2021–nu; actueel vermogen, wind en richting | uur; circa 10 s | Backend van de publieke park-app (sleutels uit de app) | **Nee, niet zonder toestemming.** Zie §9 |
| KNMI-waarnemingen | Wind per tien minuten, 77 stations | 10 min | KNMI EDR (open data) | Ja, met bronvermelding (licentie per dataset controleren) |
| WINS50 | Hoogtevertaling per parklocatie en maand | maand | KNMI-heranalyse | Ja (licentie controleren) |
| HARMONIE P1/P2b | Windverwachting op het roosterpunt, omgerekend naar parkvermogen; **elk uur opgeslagen sinds januari 2026** | uur, 48+ uur vooruit | KNMI Open Data | Ja; het opgebouwde archief is eigen waarde |
| Jaarreeksen 2022–2025 | Aanbod per tien minuten, stationswind, parkproductie | 10 min, circa 52.000 waarden per jaar | Afgeleid uit KNMI en curves | Ja; het geschaalde profiel leunt op productiedata |
| Turbinecurves | Siemens Gamesa SWT-DD-130 4,3 MW (gedigitaliseerd), curve Beabuorren | — | Fabrikantdocumentatie | Controleren; voor het product een bibliotheek met open curves |
| Elektrolysercatalogus | 64 modellen in mijnwindpark (95 modellen en configuraties in de Atlas) | — | Waterstofatlas | Feitelijke waarden ja; datasheet-PDF's niet herverspreiden zonder toestemming |
| Kostenmodel | LCOH volgens de EU-methode, robuustheidstoets | — | Port van de EU LCOH-tool | Methode ja; licentie van de tool zelf controleren |

### 2.3 Rekenkernen (eigen intellectueel eigendom)

- **Wind → vermogen:** station → ashoogte (WINS50) → turbinecurve → zogverlies → park, per tien minuten.
- **Verwachtingsketen:** HARMONIE-bestanden (GRIB) elk uur verwerkt in een Cloudflare Worker en bewaard in R2.
- **Inzetsimulatie:** modules met minimumlast, opstarttijden, warm/koud, stand-by (ook met voorspelling), onderhoud, storingen, degradatie en stackwissels; drie besturingen. JavaScript-port met verschil 0 ten opzichte van het Python-origineel.
- **Economie:** CAPEX, OPEX, stroomkosten, stackvervanging, LCOH; **maximale meerprijs** per leverancier; **robuustheid** (elke kostenpost ±25 %).
- **Herkomstsysteem:** elke waarde heeft een status: bron, afgeleid, aanname, eigen invoer of open.
- **Rapportage:** rekenrapport, Excel met echte formules, CSV en JSON.

### 2.4 Wat ons onderscheidt

1. **Echte jaren in plaats van een gemiddeld jaar:** vier windjaren per tien minuten, plus gemeten productie.
2. **Narekenbaar:** herkomst per waarde en Excel met formules. Dat is wat subsidieverleners en financiers vragen.
3. **Eerlijke conclusies:** binnen de modelonzekerheid wordt geen winnaar gekroond.
4. **Leveranciersneutraal:** alle modellen op dezelfde wind en aannames.
5. **Snel en goedkoop te leveren:** tot 120 opstellingen over vier windjaren in seconden, in de browser; serverless hosting voor een paar tientjes per maand.
6. **Verwachtingsarchief:** wat de verwachting zei, naast wat er gebeurde.
7. **Nederlands:** KNMI, WINS50, Nederlandse regels en begrippen, tweetalig.

---

## 3. Wat is het product eigenlijk?

**Positionering (concept):**
> Voor ontwikkelaars en eigenaren van duurzame energieprojecten die moeten beslissen over flexibele afnemers achter een begrensde aansluiting, is mijnwindpark.nl het rekenplatform dat aanbod, apparatuur en kosten per tien minuten doorrekent op echte meetjaren. Anders dan spreadsheets met een gemiddeld jaar of generieke simulatiesoftware combineert het gemeten productie, open KNMI-data, een leveranciersneutrale catalogus en conclusies die rekening houden met onzekerheid, volledig na te rekenen in Excel.

Het huidige project is een **energiehub in het klein**: twee bronnen, één gedeelde aansluiting (48,7 MW), één flexibele afnemer (44 MW + BoP) en vier soorten afnemers (tankstation, backbone, industrie, warmtenet). Wie dat kan doorrekenen, kan elke hub doorrekenen, mits het platform langs vijf assen generaliseert:

| As | Nu | Productversie | Moeite |
|---|---|---|---|
| Bron | Wind (twee parken) | Wind, zon, netafname met prijs | Middel (zon: KNMI-straling → PV) |
| Locatie | Fryslân en Beabuorren, vast in de code | Elk punt in Nederland op coördinaten; dichtstbijzijnde stations, WINS50-factor en curve automatisch | Middel |
| Afnemer | Elektrolyser | Elektrolyser, batterij, e-boiler met warmtebuffer, laadplein, warmtepomp | Groot (nieuwe kernen) |
| Aansluiting | Vast plafond van 48,7 MW | Gecontracteerd vermogen, groepstransportovereenkomst, non-firm tijdsblokken, cable pooling | Middel |
| Economie | €/kg waterstof | €/kg, €/MWh, NPV, besparing op netkosten, € per lid | Klein tot middel |

Drie soorten waarde die we kunnen verkopen:

1. **Beslissingswaarde** (haalbaarheid, dimensionering, leverancierskeuze): hoge prijs, laag volume, eenmalig per project.
2. **Operationele en transparantiewaarde** (portaal, monitor, verwachting): lage prijs, hoog volume, terugkerend.
3. **Datawaarde** (tienminutenprofielen, verwachtingsarchief, catalogus): licenties en API.

---

## 4. Marktkaart: wie heeft welke vraag?

### 4.1 Waarom nu (marktcijfers)

Gecontroleerd = de cijfers zijn in de bron zelf nagelezen op 23 november 2026.

| Ontwikkeling | Cijfer | Bron, peildatum | Gecontroleerd |
|---|---|---|---|
| Netcongestie | Ruim 15.000 aanvragen van afnemers in de wachtrij voor grootverbruikers | Kamerbrief voortgang netcongestie, 2 april 2026 (Kamerstuk 29 023, nr. 640), stand 31 december 2025 | ja |
| Energiehubs | Bijna 400 initiatieven voor energiehubs; enkele tientallen actief of in realisatie | RVO, pagina gecontroleerd op 19 december 2025 | ja |
| Groepscontract | De groepstransportovereenkomst (één transportcontract voor een groep bedrijven) wordt via de netcode van de ACM geregeld | ACM | nee |
| Studiegeld voor hubs | Subsidie Onderzoek Energiehubs (EHUB), € 9,6 mln, aanvragen van 1 oktober 2026 tot 1 mei 2027 (wie het eerst komt). *Scan*: tot € 5.000 (tot 5 bedrijven) of € 8.500 (6 of meer). *Studie*: 70 % van de kosten (€ 25.000–42.000) voor een nieuwe hub, 40 % voor uitbreiding. Minstens 3 bedrijven met een grote aansluiting; procesbegeleiding telt niet mee; gemeenten en provincies krijgen geen subsidie | RVO, pagina's gecontroleerd 8 september en 12 november 2026 | ja |
| Energiewet | In werking sinds 1 januari 2026; cable pooling niet langer beperkt tot wind- en zonneparken (minimaal 100 kVA, hooguit vier installaties, op land) | ACM (februari 2026); Dirkzwager (november 2026) | ja |
| Waterstof | OWE: ruim € 700 mln toegekend aan 11 bedrijven, circa 602 MW elektrolyse, bij € 3,2 mld aangevraagd | Rijksoverheid, 18 juli 2025 | ja |
| Participatie | 696 energiecoöperaties leveren stroom voor een half miljoen huishoudens; ruim 143.000 leden. In 2025 kwamen er geen nieuwe coöperatieve windprojecten bij; coöperaties met zonprojecten staan financieel onder druk (negatieve prijzen, hogere kosten) | HIER, Lokale Energie Monitor 2025 (gepresenteerd 20 maart 2026) | ja |
| Open regionale data | Nationaal Energie Dashboard (NED): wind en zon per provincie, per 10–15 minuten, via API met sleutel | ned.nl | nee |

Drie conclusies. Ten eerste is het aantal partijen dat **moet** rekenen aan "flexibele vraag op variabel aanbod achter een begrensde aansluiting" groot en groeit het. Ten tweede wordt een deel van hun haalbaarheidsonderzoek gesubsidieerd: **de EHUB-regeling vergoedt tot 1 mei 2027 precies het soort scan en studie dat wij kunnen leveren** (scan tot € 8.500, studie 70 % tot € 42.000). Onze klant hoeft dus niet alles zelf te betalen, en er is een deadline die tot actie dwingt. Ten derde hebben coöperaties weinig budget en komen er nauwelijks nieuwe coöperatieve windparken bij: het ledenportaal is een volumeproduct voor bestaande parken, met een lage prijs.

### 4.2 Segmenten

Score 1–5 (5 = gunstig). *Fit nu* = hoeveel van wat het segment nodig heeft al op de site staat.

| # | Segment | Hun vraag | Pijn | Betaalt | Fit nu | Snelheid | Totaal |
|---|---|---|---|---|---|---|---|
| 1 | **Waterstof- en Power-to-X-ontwikkelaars** | Welke elektrolyser, hoe groot, hoeveel modules, welke kostprijs? | 4 | 5 | 5 | 3 | **17** |
| 2 | **Energiehubs en bedrijven met netcongestie** | Hoeveel flexibele vraag en opslag past achter deze (gedeelde) aansluiting? | 5 | 4 | 2 | 3 | **14** |
| 3 | **Coöperaties en parkeigenaren** | Wat levert ons park, wat komt eraan, wat betekent het per lid? | 3 | 2 | 4 | 4 | **13** |
| 4 | **Gemeenten, provincies, RES-regio's** | Hoeveel duurzame stroom wekken we op, en hoe leggen we dat uit? | 3 | 3 | 3 | 1 | **10** |
| 5 | **Financiers en subsidieverleners** | Houdt de businesscase stand bij tegenvallers? | 4 | 4 | 4 | 2 | **14** |
| 6 | **Leveranciers (OEM's)** | Hoe presteert ons product op echte wind? | 3 | 3 | 4 | 3 | **13** |
| 7 | **Ingenieurs- en adviesbureaus** | Kunnen studies sneller, goedkoper en narekenbaar? | 4 | 4 | 5 | 5 | **18** |
| 8 | Netbeheerders, aggregators, handelaren | Hoe voorspelbaar is lokaal aanbod? | 3 | 3 | 2 | 1 | 9 |
| 9 | Onderwijs | Lesmateriaal met echte data | 2 | 1 | 4 | 3 | 10 |

**Toelichting per segment**

1. **Waterstof- en Power-to-X-ontwikkelaars** (industrie, havens, energiebedrijven, windparkeigenaren die curtailment willen benutten, waterstofhubs, mobiliteit).
   - *Pijn:* dimensioneren op variabel aanbod; technologie- en leverancierskeuze; businesscase voor OWE, IPCEI, Europese Waterstofbank en banken; straks aantonen dat waterstof hernieuwbaar is (RFNBO, uurcorrelatie vanaf 2030).
   - *Wat we leveren:* bijna alles bestaat al: aanbod, catalogus, samenstellen, vergelijken, opsplitsen, rapport en Excel.
   - *Ontbreekt:* eigen locatie en park, zon, netafname met prijs, waterstofbuffer en afnameprofiel, RFNBO-toets.
   - *Kanttekening:* de waterstofmarkt is afgekoeld; minder projecten, maar strengere selectie. Robuuste businesscases worden daardoor juist belangrijker.

2. **Energiehubs en bedrijven met netcongestie** (bedrijventerreinen, glastuinbouw, logistiek met laadpleinen, industrie met e-boilers, ontwikkelaars van cable pooling met batterijen).
   - *Pijn:* welke flex past op welke aansluiting; hoeveel kan worden gedeeld; wie mag wanneer (groepscontract); businesscase onder congestie.
   - *Wat we leveren:* het aanbodmodel en de logica "afnemer onder een plafond, met minimumlast en starts" bestaan.
   - *Ontbreekt:* batterijkern, e-boiler met warmtebuffer, meerdere afnemers op één aansluiting, prijzen (day-ahead, onbalans), zon.
   - *Waarom aantrekkelijk:* grootste en snelst groeiende markt; studies deels gesubsidieerd (EHUB).

3. **Coöperaties en parkeigenaren met participatie.**
   - *Pijn:* leden en omwonenden willen zien wat "hun" park doet; jaarverslag; draagvlak voor het volgende project; uitleg bij stilstand of curtailment.
   - *Wat we leveren:* dagoverzicht, actueel vermogen, verwachting naast werkelijkheid, exports, inbedden in een iframe is al toegestaan.
   - *Ontbreekt:* meerdere parken en klanten (multi-tenant), eigen huisstijl, aandeel per lid ("jouw certificaten = zoveel kWh"), datakoppeling met de meetdata van het park, publieke modus zonder wachtwoord.
   - *Merkfit:* de naam *mijn windpark* past hier het best.

4. **Gemeenten, provincies, RES-regio's.**
   - *Pijn:* monitoring van RES-doelen, communicatie naar raad en inwoners, omgevingsfondsen.
   - *Ontbreekt:* regionale data (NED), publieke modus, aantoonbare toegankelijkheid (WCAG 2.1 AA is bij overheden een eis).
   - *Let op:* lange verkoopcyclus en aanbestedingsregels.

5. **Financiers en subsidieverleners** (banken, Invest-NL, regionale ontwikkelingsmaatschappijen, provinciale energiefondsen, RVO).
   - *Pijn:* snel en vergelijkbaar beoordelen van businesscases.
   - *Wat we leveren:* conclusie binnen de modelonzekerheid, herkomst per waarde, Excel met formules.
   - *Strategische kans:* als een subsidieverlener of fonds ons rekenmodel voorschrijft of aanbeveelt, rekent elke aanvrager ermee. Dat is een standaard zetten, geen losse verkoop.

6. **Leveranciers (elektrolyser- en batterij-OEM's).**
   - *Pijn:* aantonen hoe hun product presteert op variabel aanbod (minimumlast, opstarttijd); zichtbaarheid in Nederlandse projecten.
   - *Aanbod:* geverifieerde prestatiebladen op referentiewindjaren. **Nooit betalen voor rangorde;** neutraliteit is ons kapitaal.

7. **Ingenieurs- en adviesbureaus, te beginnen bij de eigen adviespraktijk.**
   - *Pijn:* haalbaarheidsstudies kosten veel uren en zijn moeilijk vergelijkbaar.
   - *Aanbod:* het platform als versneller van de eigen studies (productized consulting). Iedere studie is meteen een referentie en levert een nieuwe locatie of park voor het platform op.
   - *Let op:* andere adviesbureaus zijn ook concurrent. Licenties aan derden alleen bewust (kleinere bureaus, white label).

8. **Netbeheerders, aggregators en handelaren:** hebben eigen geavanceerde tools; eerder partner of verwijzer dan klant. Kans: kleine aggregators met veel kleine parken.

9. **Onderwijs** (hogescholen met waterstof- en energieprogramma's, mbo): weinig omzet, wel naamsbekendheid en toekomstige gebruikers. Eventueel gratis educatielicentie.

### 4.3 Alternatieven en concurrentie (te verifiëren)

| Alternatief | Sterk | Zwak ten opzichte van ons |
|---|---|---|
| Spreadsheets bij adviesbureaus (status quo) | Vertrouwd, flexibel | Gemiddeld jaar, geen tienminutenresolutie, niet herhaalbaar, herkomst onduidelijk |
| Generieke simulatiesoftware (bijvoorbeeld HOMER, PLEXOS) | Breed, gevestigd | Duur, steile leercurve, niet Nederlands, geen gemeten Nederlandse data of catalogus |
| Regionale scenariomodellen (bijvoorbeeld het Energietransitiemodel) | Sterk voor beleid en regio | Geen projectdimensionering of apparatuurkeuze |
| Verwachtings- en monitoringdiensten (bijvoorbeeld Whiffle, Dexter Energy, Power Factors, OEM-portalen) | Nauwkeurig, operationeel | Geen afnemer- en investeringsvraag; duur voor kleine parken |
| Start-ups met energiehubsoftware | Operationeel beheer van hubs | Minder diep in dimensionering en apparatuur |

Onze plek: **tussen het eerste idee en de investeringsbeslissing**, waar nu vooral spreadsheets en uren zitten.

---

## 5. Wat we kunnen opleveren (productvormen)

| Product | Inhoud | Voor | Bestaat nu | Prijshypothese |
|---|---|---|---|---|
| **A. Haalbaarheidsscan Wind-naar-X** | In 2–4 weken: aanbodprofiel op locatie (vier windjaren), dimensionering van de afnemer, shortlist uit de Waterstofatlas, kostprijs en robuustheid, rekenrapport en Excel | Seg. 1, 2, 5, 7 | ±80 % voor waterstof; per scan handwerk voor nieuwe parken | € 9.500 (basis) tot € 24.500 (met leveranciersvergelijking en workshop) |
| **A2. Energiehub-scan en -studie** (EHUB-vorm) | Scan: gezamenlijk verbruik, aanbod en minstens drie maatregelpakketten. Studie: technisch ontwerp en dimensionering van opslag en flex | Seg. 2 | Aanbod en flex-logica ja; batterij, e-boiler, meerdere afnemers nee | Scan € 7.500–12.000 (EHUB dekt € 5.000–8.500); studie € 35.000–60.000 (EHUB dekt 70 %, tot € 42.000) |
| **B. Projectstudio** (abonnement) | Zelf rekenen: eigen projecten, parken, opstellingen en scenario's in de cloud, delen met het team, exports | Seg. 1, 6, 7 | Rekenen ja; accounts, cloudopslag en eigen parken nee | € 12.000–30.000 per organisatie per jaar; projectlicentie € 4.000–8.000 |
| **C. Park- en ledenportaal** (white label) | Dagoverzicht, live, verwachting, jaaroverzicht, aandeel per lid, widget voor de eigen site, eigen domein en huisstijl | Seg. 3, 4 | Voor één park ja; multi-tenant nee | € 2.400–6.000 per park per jaar + € 1.500 inrichting |
| **D. Prestatie- en verwachtingsmonitor** | Verwacht tegenover werkelijk per dag, melding bij afwijking (storing, curtailment), maandrapport, verwachting 48 uur vooruit | Seg. 3, 8 | Bouwstenen ja; kalibratie per park en meldingen nee | € 1.800–4.800 per park per jaar |
| **E. Regionale energiemonitor** | Publieke dashboards per gemeente, provincie of RES-regio met NED-data en parken | Seg. 4 | Visualisatie ja; regionale data nee | € 12.000–30.000 per regio per jaar |
| **F. Data en rekenkern** | Tienminutenreeksen voor elke locatie, verwachtingsarchief, rekenkern als API of licentie | Seg. 5, 7, 8 | Kern ja; API nee | € 25.000–100.000 per jaar |

Volgorde van introductie: **A → B → C → D → E/F.** A financiert de rest en dwingt de generalisatie af die B en C nodig hebben.

---

## 6. Keuze: waar beginnen we?

**Strandkop (eerste 6 maanden): haalbaarheidsscans voor waterstof- en flexprojecten op wind**, verkocht aan ontwikkelaars en energiehub-initiatieven, geleverd via de eigen adviespraktijk met het platform.

Waarom:
- de hoogste fit nu (±80 %) en de hoogste prijs per deal;
- een bestaande demo-case laat alles zien;
- klanten kunnen de scan deels met subsidie betalen (EHUB, provinciale programma's, OWE-voorbereiding);
- elke scan voegt een park of locatie toe en dwingt de generalisatie af die de andere producten nodig hebben;
- productized consulting verdient vanaf de eerste opdracht, zonder eerst een volledige SaaS te bouwen.

**Groeimarkt (direct starten met scans, kern vanaf maand 3): energiehubs en netcongestie.** De EHUB-scan (tot € 8.500 subsidie) kan al met het huidige aanbodmodel plus spreadsheetwerk voor batterij en e-boiler; de batterij- en e-boilerkern volgt in fase 2 en maakt de studies schaalbaar. Het aanvraagvenster sluit op 1 mei 2027: wie nu hubs benadert, verkoopt met een deadline.

**Volumelijn (vanaf maand 6): park- en ledenportaal** voor coöperaties, zodra parken als configuratie bestaan.

**Strategisch spoor (doorlopend): financiers en subsidieverleners** benaderen om het rekenmodel als (aanbevolen) standaard te positioneren.

---

## 7. Wat moet er gebouwd worden (roadmap)

### Fase 0 · Nu (0–1 maand)
- [x] **Productweergave** op de site als demo voor salesgesprekken (§12).
- [ ] Datarechten regelen: toestemming van Windpark Fryslân vragen, of in demo's labelen als demo-case; licenties van KNMI-datasets, WINS50, turbinecurves en de EU LCOH-tool vastleggen.
- [ ] Toestemming van de huidige opdrachtgever om het project als referentie te noemen.
- [ ] Tien tot vijftien discovery-gesprekken (§10).
- [ ] Pilotaanbod: drie scans tegen introductieprijs in ruil voor referentie en feedback.

### Fase 1 · Elk park, elke locatie (1–3 maanden)
- Park als configuratie in plaats van code: coördinaten, ashoogte, turbinetype, aantal turbines, aandeel. Nu zitten `fryslan` en `beabuorren` vast in `modelOptions()`, de curves en de WINS50-tabel.
- WINS50-factor voor elke locatie (de methode staat in de windprofiel-repository) en automatisch de dichtstbijzijnde KNMI-stations.
- Turbinecurvebibliotheek met open curves.
- Eigen productie uploaden (CSV) voor kalibratie en als gemeten laag.
- Projectconfiguratie: 44 MW, 48,7 MW, 10 %, BoP en afnemers uit één projectbestand in plaats van vaste teksten.
- Rapport en Excel met naam en logo van de klant.

### Fase 2 · Elke flexibele afnemer (3–6 maanden)
- Batterijkern (laden, ontladen, rendement, laadtoestand, cycli) en e-boiler met warmtebuffer; laadpleinprofiel.
- Netaansluiting: gecontracteerd vermogen, non-firm tijdsblokken, meerdere deelnemers (groepscontract).
- Prijzen: day-ahead en onbalans; netkosten.
- Zon: KNMI-straling naar PV-opbrengst.
- Waterstofbuffer, afnameprofiel (bijvoorbeeld tankstation) en RFNBO-indicatie (uurcorrelatie).

### Fase 3 · Platform (6–12 maanden)
- Accounts, organisaties en rollen in plaats van één gedeeld wachtwoord; zakelijke inlog (SSO) voor grotere klanten; scheiding per klant.
- Projecten in de cloud (nu `localStorage`), audittrail, versies.
- Multi-tenant portaal met eigen domein en huisstijl, widgets, publieke modus; WCAG 2.1 AA-toets.
- Connectoren: CSV/SFTP, meetbedrijven, NED, ENTSO-E (eenheden vanaf 100 MW).
- Monitor met meldingen en maandrapport; API en licenties.

Grove inspanning: fase 1 één ontwikkelaar 2–3 maanden; fase 2 één tot twee ontwikkelaars 3 maanden plus domeinexpert; fase 3 twee ontwikkelaars 6 maanden plus product en sales. Hosting blijft goedkoop (Workers + R2).

---

## 8. Verdienmodel (illustratief)

| | Jaar 1 (pilots) | Jaar 2 | Jaar 3 |
|---|---|---|---|
| A. Scans | 6 × € 12.000 = € 72.000 | 15 × € 15.000 = € 225.000 | 25 × € 15.000 = € 375.000 |
| B. Projectstudio | 2 × € 15.000 = € 30.000 | 8 × € 20.000 = € 160.000 | 15 × € 22.000 = € 330.000 |
| C. Portaal | 3 × € 3.000 = € 9.000 | 25 × € 4.000 = € 100.000 | 80 × € 4.500 = € 360.000 |
| D/E. Monitor en regio | – | 2 × € 20.000 = € 40.000 | 6 × € 20.000 = € 120.000 |
| F. Data en licenties | – | – | 2 × € 60.000 = € 120.000 |
| **Totaal** | **≈ € 110.000** | **≈ € 525.000** | **≈ € 1,3 mln** |

Alles hierin is een hypothese. De belangrijkste aanname is de conversie van gesprekken naar scans. De kosten zitten in ontwikkeling, sales en ondersteuning; hosting en open data zijn verwaarloosbaar. Betaalde marktdata (bijvoorbeeld beursprijzen) kunnen een kostenpost worden.

---

## 9. Data en rechten: de eerste blokkade

1. **Productie Windpark Fryslân.** De site leest de backend van de publieke park-app met sleutels uit de app. Voor intern gebruik is dat een grijs gebied; voor een commercieel product is het niet verantwoord. Opties: (a) toestemming of een data-afspraak met Windpark Fryslân; (b) voor parken vanaf 100 MW de publieke ENTSO-E-gegevens per productie-eenheid gebruiken (beschikbaarheid per park controleren); (c) in het product altijd **klantdata plus het KNMI-model**. In de Productweergave heet het daarom een *demo-case*.
2. **KNMI, WINS50 en HARMONIE:** open data met bronvermelding; licentie per dataset vastleggen.
3. **Turbinecurves:** gedigitaliseerd uit fabrikantdocumentatie; voor het product een bibliotheek met open curves of curves die de klant aanlevert.
4. **Datasheets:** feitelijke waarden mogen we gebruiken; de PDF's zelf alleen linken of met toestemming tonen.
5. **Klantdata en persoonsgegevens:** verwerkersovereenkomst; in het ledenportaal (aandeel per lid) geldt de AVG.
6. **Referentieproject:** de huidige opdrachtgever moet instemmen met het noemen van het project.

---

## 10. Validatie: hypotheses en experimenten

| # | Hypothese | Test | Geslaagd als | Termijn |
|---|---|---|---|---|
| H1 | Ontwikkelaars betalen € 10–20k voor een scan van 2–4 weken | 10 gesprekken; aanbod aan 5 warme leads | ≥ 2 opdrachten | 8 weken |
| H2 | Energiehubs zien flex-dimensionering als top-3-probleem en kunnen EHUB-subsidie inzetten | 8 gesprekken met hub-coördinatoren en provinciale programma's | ≥ 3 bevestigen, ≥ 1 pilot | 10 weken |
| H3 | Coöperaties willen een ledenportaal voor € 2–5k per jaar | 10 gesprekken via de koepel; wachtlijstpagina | ≥ 3 intentieverklaringen | 12 weken |
| H4 | Financiers waarderen herkomstlabels en robuustheid | 3 gesprekken (bank, ROM, subsidieverlener) | 1 pilot-review | 12 weken |
| H5 | Leveranciers betalen voor geverifieerde prestatiedata zonder rangorde te kopen | 5 OEM-gesprekken | 2 betaalde verificaties | 16 weken |

**Stopregels:** haalt H1 het niet na 15 gesprekken, dan eerst de prijs of de vorm aanpassen (bijvoorbeeld licentie aan adviesbureaus) voordat er in fase 2 wordt geïnvesteerd. Bevestigt H2 niet, dan de batterij- en e-boilerkern uitstellen.

Vragen voor elk gesprek:
1. Welke beslissing moet je het komende jaar nemen, en waarmee reken je nu?
2. Wat kostte de laatste studie en hoe lang duurde het?
3. Wie moet de uitkomst geloven (directie, bank, subsidieverlener, leden)?
4. Welke data heb je zelf (meetdata, aansluitwaarde, verbruiksprofiel)?
5. Wat zou je ervan weerhouden een tool te gebruiken in plaats van een adviseur?

---

## 11. Go-to-market

- **Kanaal 1: de eigen adviespraktijk.** Bestaande relaties in waterstof, energiehubs en netcongestie; de scan als vast product in offertes.
- **Kanaal 2: programma's en koepels.** RVO (energiehubs, waterstof), provinciale stimuleringsprogramma's, de koepel van energiecoöperaties, brancheorganisaties voor waterstof.
- **Kanaal 3: netbeheerders als verwijzer.** Zij willen dat klanten op de wachtlijst hun flex goed dimensioneren.
- **Kanaal 4: inhoud.** Een publieke, gratis variant (bijvoorbeeld "hoeveel waait het nu op jouw locatie" of de regionale monitor) als bron van leads; korte analyses met de eigen data (verwachting tegenover werkelijkheid).
- **Demo:** de Productweergave met de demo-route (§12).
- **Pilotaanbod:** drie scans tegen introductieprijs in ruil voor referentie, feedback en toestemming om geanonimiseerde uitkomsten te gebruiken.

**Naam:** *mijn windpark* past bij het ledenportaal, minder bij zakelijke studies. Overweeg één platformnaam met mijnwindpark.nl als productlijn voor coöperaties. Beslis dat na de eerste gesprekken.

---

## 12. Productweergave op de site (gebouwd)

De knop **Productweergave** rechtsboven (naast *English* en *Uitloggen*) zet de hele site in verkoopstand. De keuze blijft bewaard in een cookie (`mwp_view`), net als de taalkeuze. Een link met `?weergave=product` opent de site direct zo, ook na het inloggen; `?weergave=project` zet hem terug.

In productweergave:
- **Startpagina** wordt een productpagina: live bewijs uit de echte API's (actueel vermogen, jaren met meetdata, modellen in de catalogus, laatste opgeslagen HARMONIE-run), het probleem met marktcijfers, het platform in drie lagen, zes doelgroepen met hun vraag en wat we leveren, vier productvormen, wat ons onderscheidt, een demo-route met gespreksvragen, "van demo-case naar jouw project" en de demo-case zelf (het bestaande stroomschema).
- **Elke andere pagina** krijgt bovenaan een productnotitie: wat je hier ziet, waarom het telt, voor wie, en een vraag voor het gesprek.
- Alles is ook in het Engels beschikbaar.

De productweergave noemt geen prijzen; die staan alleen in dit plan. Let op: iedereen met het sitewachtwoord ziet de knop, ook de huidige opdrachtgever. Wil je dat niet, dan kan de knop achter een aparte instelling.

---

## 13. Volgende stappen (30/60/90 dagen)

**30 dagen**
- Productweergave intern doorlopen en aanscherpen met twee collega's uit sales en advies.
- Datarechten: gesprek met Windpark Fryslân en de huidige opdrachtgever.
- Gesprekkenlijst maken (5 waterstof, 5 energiehubs, 3 coöperaties, 2 financiers) en de eerste vijf voeren.

**60 dagen**
- Scan als product beschrijven (inhoud, doorlooptijd, prijs, voorwaarden, disclaimer).
- Fase 1 starten: park als configuratie, WINS50 voor elke locatie, CSV-upload.
- Eerste pilotscan in uitvoering.

**90 dagen**
- Twee pilotscans afgerond, één referentie.
- Besluit over fase 2 (batterij en e-boiler) op basis van H2.
- Besluit over naam en het moment voor het ledenportaal.

---

## Bronnen (marktcijfers, november 2026)

- Netcongestie, wachtrij grootverbruikers: Kamerbrief van 2 april 2026, Kamerstuk 29 023, nr. 640 — [officielebekendmakingen.nl](https://zoek.officielebekendmakingen.nl/kst-29023-640.html)
- Energiehubs: RVO, *Hoe ver zijn we met energiehubs in Nederland?* — [rvo.nl](https://www.rvo.nl/onderwerpen/energiehubs/hoe-ver-zijn-energiehubs-nederland); subsidie EHUB — [nieuwsbericht](https://www.rvo.nl/nieuws/nieuwe-subsidie-energiehubs) en [regeling](https://www.rvo.nl/subsidies-financiering/ehub)
- Groepstransportovereenkomst: ACM — [acm.nl](https://www.acm.nl/nl/node/27743)
- Energiewet en cable pooling: ACM *Focus op energie 2026* — [acm.nl](https://www.acm.nl/system/files/documents/focus-op-energie-2026_0.pdf); Dirkzwager — [dirkzwager.nl](https://www.dirkzwager.nl/kennis/artikelen/cable-pooling-onder-de-energiewet-wanneer-deel-je-één-aansluiting)
- OWE ronde 2: Rijksoverheid, 18 juli 2025 — [rijksoverheid.nl](https://www.rijksoverheid.nl/onderwerpen/duurzame-energie/nieuws/2025/07/18/11-projecten-krijgen-subsidie-voor-productie-van-duurzame-waterstof)
- Energiecoöperaties: HIER, Lokale Energie Monitor 2025 — [hier.nu](https://www.hier.nu/system/files/inline/Persbericht%20-%20Lokale%20Energie%20Monitor%202025_0.pdf)
- Nationaal Energie Dashboard, API-datacatalogus — [ned.nl](https://ned.nl/datacatalogus)
