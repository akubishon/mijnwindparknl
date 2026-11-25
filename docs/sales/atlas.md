# Verkoopplan Atlas → Waterstofscan

*Opgesteld op 25 november 2026. Hoort bij [`waterstofscan.md`](waterstofscan.md); de prijzen, berichten en de lijst ‘Voor livegang’ uit dat plan blijven gelden. Wat hier als hypothese staat, is nog niet met klanten getoetst.*

## 1. Kern in vijf regels

1. **De Atlas verkoopt zelf niets. Hij is de gratis voordeur van de Waterstofscan.** Iemand kiest op atlas.mijnwindpark.nl een perceel en de windparken eromheen. Dat is precies de invoer waarmee een scan begint. Dat moment zetten we om in een gesprek.
2. **Nu lekt de trechter.** De knop ‘Vraag een Waterstofscan aan’ opent `/waterstofscan` zonder perceel, parken of vermogen. Het intakeformulier (`src/leads.mjs`) bewaart geen bron en geen locatie. We zien dus niet welke aanvragen uit de Atlas komen, en de bezoeker moet zijn locatie opnieuw uitleggen.
3. **De markt is klein maar heeft nu geld en deadlines.** Er komen twee kansen aan: OWE 3 (€ 780 mln, opening verwacht vanaf Q4 2026, aanvraagvenster van twee weken) en de regeling voor lokale waterstofhubs (€ 125 mln, verwacht in Q1 2027, 2,5–25 MW). Die hubschaal past bijna precies bij elektrolyse naast een windpark op land.
4. **Spreid over drie doelgroepen,** zodat de omzet niet aan één subsidieronde hangt: OWE-dossiers (nu), hubprojecten (Q1 2027) en eigenaren van windparken op land met netcongestie. Die laatste groep kan sinds de Energiewet (1 januari 2026) een aansluiting delen met een elektrolyser.
5. **Doel:** in 90 dagen 3 betaalde Waterstofscans, waarvan ten minste 1 via de Atlas. In zes weken 1, zoals in het bestaande plan staat.

## 2. De markt in november 2026

| Ontwikkeling | Wat het voor ons betekent | Bron |
|---|---|---|
| De waterstofmarkt is afgekoeld. Van de zeven IPCEI-projecten uit 2022 zijn er vier gestopt (550 MW) en is er nog nul MW in bedrijf. In het Nationaal Plan Energiesysteem 2026 is de rol van groene waterstof vóór 2040 omlaag bijgesteld. | Kopers zijn kritisch en een investeringsbesluit komt langzamer. Een onderbouwde, narekenbare productieraming is meer waard dan een optimistische. Dat is ons verhaal. Verwacht wel weinig volume. | [Dagelijkse Standaard (opiniërend; cijfers uit Kamerbrief)](https://www.dagelijksestandaard.nl/politiek/van-veldhoven-d66-waterstof-subsidie-ipcei-1150-megawatt-nul-operationeel-vier-projecten-gestopt) · [NLHydrogen over NPE 2026](https://nlhydrogen.nl/nationaal-plan-energiesysteem-2026/) |
| OWE 3: € 780 mln, naar verwachting circa 250 MW elektrolysevermogen. Het aanvraagvenster opent zes weken na publicatie in de Staatscourant en staat dan twee weken open. Op 25 november 2026 was er nog geen definitieve publicatie gevonden. Er is ook politieke druk om de ronde te schrappen. | Bij 250 MW gaat het om een beperkt aantal dossiers, hooguit enkele tientallen, en lang niet allemaal met wind op land. Wie pas na publicatie begint, komt in tijdnood. **Benader nu**, vóór de publicatie. | [Toelichting OWE 3](https://www.internetconsultatie.nl/owe3/document/15584) · [RVO OWE](https://www.rvo.nl/subsidies-financiering/owe) · [PNO over OWE 2026](https://www.pnoinnovation.com/nl/insights/owe-2026-aangekondigd-nieuwe-ronde-verwacht-voor-hernieuwbare-waterstofprojecten-in-nederland/) |
| Waterstofhubs: een variant op de OWE voor elektrolysers van 2,5 tot 25 MW, € 125 mln, openstelling verwacht in Q1 2027. Hubs die vooral op mobiliteit gericht zijn, komen niet in aanmerking. RVO raadt aan om vóór de aanvraag naar de netcapaciteit te kijken. | **Dit is de beste fit voor de Atlas.** Lokale partijen kiezen een locatie, kijken welk windpark in de buurt ligt en vragen een onderbouwde raming. Deze groep is groter, minder ervaren en heeft minder eigen rekenkracht dan de OWE-spelers. | [RVO interessepeiling hubs](https://www.rvo.nl/onderwerpen/energiehubs/waterstofhubs/interessepeiling-subsidie-waterstofhubs) · [RVO Stappenplan regionale hubs](https://www.rvo.nl/sites/default/files/2025-10/Stappenplan-naar-regionale-waterstofhubs.pdf) |
| Netcongestie en cable pooling: sinds 1 januari 2026 mogen meer soorten installaties een aansluiting delen, bijvoorbeeld een windpark met een elektrolyser en een industriële afnemer. Windparken leveren minder door congestie. | Een **nieuwe vraag die buiten de subsidie om bestaat**: wat levert een elektrolyser achter de aansluiting van ons park op? Het tienminutenprofiel van mijnwindpark beantwoordt precies die vraag. | [RVO cable pooling](https://www.rvo.nl/onderwerpen/netcongestie/cable-pooling) · [Dirkzwager over cable pooling onder de Energiewet](https://www.dirkzwager.nl/kennis/artikelen/cable-pooling-onder-de-energiewet-wanneer-deel-je-één-aansluiting) · [ACM netcongestiemaatregelen (11 nov 2026)](https://www.acm.nl/system/files/documents/overzicht-netcongestiemaatregelen-update-11-november-2026.pdf) |
| Concurrentie: er is geen openbare kaart gevonden die perceel, windpark en waterstofkostprijs combineert. Wel zijn er rekentools (TNO RHyCEET), het locatieonderzoek van VAWOZ voor grootschalige elektrolyse en ramingen van leveranciers en ingenieursbureaus. | De Atlas is zichtbaar anders. Het echte alternatief voor de koper is de raming van de leverancier of het ingenieursbureau, niet een andere kaart. De bezwaren in `waterstofscan.md` § 2 blijven dus leidend. | [TNO-rapport LCOH](https://zoek.officielebekendmakingen.nl/blg-1145411.pdf) · [RVO VAWOZ](https://www.rvo.nl/onderwerpen/bureau-energieprojecten/lopende-projecten/programma-vawoz/veelgestelde-vragen) |

**Conclusie:** reken niet op volume uit één regeling. Een realistische markt voor scans van € 12.000–22.000 telt in Nederland enkele tientallen dossiers per jaar. Daarom moet de Atlas (a) die dossiers vroeg vinden en (b) een tweede markt openen die niet aan een subsidieronde vastzit: windparken met congestie.

Controleer data en voorwaarden van OWE 3 en de hubregeling opnieuw vóór je ze in een bericht of offerte noemt.

## 3. Hoe Atlas en Waterstofscan één aanbod worden

| Stap | Wat de bezoeker doet | Wat hij krijgt | Wat wij krijgen |
|---|---|---|---|
| 1. Kaart (gratis, anoniem) | Kiest een perceel en de windparken in de buurt | Windparken, afstand, KNMI-station en gemiddelde wind | Een event in de statistieken |
| 2. Locatieprofiel (gratis, met e-mail) | Vraagt een profiel van deze locatie aan | Een A4 met perceel, gekozen parken, vermogen en windaanbod 2025, met een **relatieve klasse voor het windaanbod**; geen kostprijs (zie § 4.2) | Een lead met locatie, vermogen en bron = Atlas |
| 3. Gesprek (20 min.) | Bespreekt het project | Advies over welk pakket past en welke gegevens nodig zijn | Kwalificatie: OWE, hub of congestie, beslisser en deadline |
| 4. Waterstofscan (€ 12.000 / € 22.000) | Bestelt | Vier windjaren, tienminutenprofiel, per elektrolyser, rapport en Excel | Omzet |

**Verkoopzin:** *‘De Atlas laat zien óf een locatie kansrijk is. De Waterstofscan rekent uit hoeveel waterstof ze oplevert, met vier windjaren, per tien minuten en per elektrolyser, in de vorm die RVO vraagt.’*

Het verschil moet eerlijk blijven. De Atlas rekent met één windjaar (KNMI 2025, uurwaarden die naar tien minuten zijn herhaald), een vaste turbinecurve en standaardmodules van 5 MW. Hij is dus **indicatief**. Zo zeggen we het ook: dat beschermt de geloofwaardigheid van de scan.

## 4. Wat er in de Atlas moet veranderen (op volgorde)

*Stand 25 november 2026: alles uit § 4.1–4.3 is gebouwd (zie README, sectie Atlas). Daarnaast is de openbare site één geheel geworden: één menu op mijnwindpark.nl en de Atlas (Kaart, Windparken, Waterstofscan, Bespreek je project), een startpagina `/welkom` die de drie keuzes uitlegt, een uitleg met legenda op de kaart en een windparkenlijst met zoeken en per provincie (README, sectie Openbare site). Nog te doen buiten de code: de OSM-gegevens van de windparkpagina's steekproefsgewijs controleren, indexeren aanzetten zodra de site geen concept meer is (`ATLAS_INDEXABLE` en `SCAN.indexable` op `true`; tot die tijd staat het uit), en de congestiedoelgroep valideren met vijf gesprekken.*

### 4.1 Trechter dichten (week 1, klein werk)
1. **Context meegeven.** De knop in het paneel gaat naar `https://mijnwindpark.nl/waterstofscan?bron=atlas&perceel=<aanduiding>&parken=<namen>&mw=<totaal>#aanvraag`. Het formulier vult de toelichting vooraf in, bijvoorbeeld ‘Locatie: perceel …, windparken …, … MW’.
2. **Bron bewaren.** Voeg in `LEAD_FIELDS` het veld `bron` toe (kort, uit een vaste lijst: `atlas`, `direct`, `linkedin`, `adviseur`) en toon het op `/leads` en in de CSV. Zonder bron kun je de Atlas niet beoordelen.
3. **Tellen zonder cookies.** Gebruik Cloudflare Web Analytics of tellers in de worker voor vier momenten: kaart geopend, perceel gekozen, park gekozen en CTA geklikt. Pas de CSP daarop aan. Bewaar geen persoonsgegevens.
4. **Deelbare link.** Zet perceel en gekozen parken in de URL. Adviseurs sturen hun klant dan een kaart in plaats van een uitleg. Elke gedeelde link is gratis bereik.

### 4.2 Iets van waarde geven vóór het formulier (week 2–4)
**Besluit (25 november 2026): de Atlas toont geen LCOH en geen €/kg,** ook geen klasse of bandbreedte voor de kostprijs. De kostenaannames zijn nog niet vastgesteld, en zolang de site een concept is, staat er geen bedrijf achter zo'n getal. De berekening achter het wachtwoord blijft alleen voor intern gebruik.

Wel kan de Atlas laten zien hoe het **windaanbod** zich verhoudt tot andere locaties, bijvoorbeeld ‘windaanbod bij deze parken: hoger dan 70 % van de te kiezen locaties’. Dat getal komt rechtstreeks uit KNMI-metingen en hangt niet af van kostenaannames. Vraag daarbij een e-mailadres voor het locatieprofiel. De productie en de kostprijs komen pas in de scan.

Zolang er geen echt bedrijf is, staat bovenaan de Atlas en `/waterstofscan` een balk ‘Conceptwebsite’. Stuur in die fase geen prijsofferte namens een bedrijf; gebruik de gesprekken om te valideren.

### 4.3 Laag per doelgroep (maand 2–3)
- **Hubfilter:** standaard tussen 2,5 en 25 MW elektrolysevermogen, met de voorwaarden van de hubregeling als checklist in het paneel zodra die definitief zijn.
- **Netcongestie:** een link naar of laag van de capaciteitskaart van de netbeheerders. Rood gebied naast een blauw windpark is de kaart van de congestiedoelgroep (§ 5).
- **Omgekeerde route:** klik op een windpark en zie welke percelen en bedrijventerreinen binnen een paar kilometer liggen. Dat is de ingang voor eigenaren en coöperaties.
- **Een pagina per windpark** (‘Waterstof bij windpark X’), server-side en vindbaar. De Atlas kent 720 windparken uit OpenStreetMap. Dat levert vindbaarheid op zoektermen die ontwikkelaars en gemeenten echt gebruiken. Laat de MW-gegevens van OSM eerst steekproefsgewijs controleren.

## 5. Doelgroepen en aanpak

| Doelgroep | Waarom nu | Ingang via de Atlas | Pakket | Volume (hypothese) |
|---|---|---|---|---|
| **OWE 3-dossiers** (adviseurs en ontwikkelaars, zie `waterstofscan.md` § 3) | Er is een venster van twee weken na publicatie. De raming bepaalt het subsidieplafond en de toets van € 9 per kilo. | Stuur in het eerste bericht een **kaart van hun eigen locatie** mee (deelbare link) | Opbrengstberekening € 12.000; bij een open shortlist € 22.000 | 1–3 opdrachten |
| **Waterstofhubs** (ROM’s, provinciale waterstofprogramma’s, bedrijventerreinen, gemeenten, lokale ontwikkelaars) | Verwachte opening in Q1 2027; 2,5–25 MW; RVO wijst zelf op netcapaciteit en locatie | Een sessie per provincie: ‘Welke locaties in uw regio liggen naast wind op land?’, met de Atlas live op het scherm | Opbrengstberekening € 12.000 | 2–4 opdrachten in H1 2027 |
| **Windparkeigenaren en energiecoöperaties met congestie** | De Energiewet verruimt cable pooling; ze verliezen nu productie door beperkingen | Omgekeerde route (park → percelen) en het eigen parkprofiel | Opbrengstberekening € 12.000. De vraag is ‘wat neemt een elektrolyser af achter onze aansluiting?’. **Eerst valideren** met 5 gesprekken voor je de pagina aanpast. | Onbekend; valideren |
| **Subsidieadviseurs als doorverwijzer** (PNO, Hezelburcht en kleinere bureaus) | Zij hebben de dossiers al | Een eigen Atlas-link per bureau (`?bron=adviseur-x`) die ze in klantgesprekken gebruiken | Doorbelasten aan hun klant | Hefboom op alle groepen hierboven |

**Niet doen:** elektrolyserleveranciers laten betalen voor zichtbaarheid. Dat botst met de neutraliteitsregels in `productplan-waterstofatlas.md` § 4 en maakt de scan als onafhankelijke toets ongeloofwaardig.

## 6. Kanalen en berichten

- **Persoonlijk met kaart.** Het berichtenrecept uit `waterstofscan.md` § 4, met één toevoeging: een deelbare Atlas-link naar de eigen locatie van de ontvanger. Een kaart van hun eigen perceel en de parken eromheen valt meer op dan een productlink.
  > *‘Ik heb uw locatie in [plaats] op de kaart gezet met de windparken eromheen: [link]. Voor de OWE-aanvraag bepaalt de productieraming uw subsidieplafond. Zullen we twintig minuten kijken hoe we die voor dit project onderbouwen?’*
- **LinkedIn, twee keer per maand,** met één kaart per bericht. Bijvoorbeeld: ‘Tien bedrijventerreinen naast windparken op land die binnen de hubregeling vallen’, of ‘Waarom twee windparken op 20 km meer waterstof geven dan één park van dezelfde grootte’ (het effect van spreiding, dat de Atlas al optelt per KNMI-station). Elk bericht linkt naar de Atlas, niet naar de prijs.
- **Regiosessies** met provinciale waterstofprogramma’s, ROM’s en de kennissessies van het Nationaal Waterstof Programma. Bied een gratis sessie van 45 minuten aan met de Atlas live op het scherm.
- **Vindbaarheid:** de pagina’s per windpark (§ 4.3) en de bestaande `/waterstofscan`. Indexeren staat uit zolang de site een concept is; zet het daarna aan.

## 7. Ritme en doelen

| Periode | Product | Verkoop | Doel |
|---|---|---|---|
| Week 1–2 | Context in de CTA, veld `bron`, telling en deelbare link (§ 4.1). Daarnaast de blokkades uit `waterstofscan.md` § 6: `SCAN.provider` invullen, voorbeeldrapport, NDA-besluit. | Twintig OWE-berichten, elk met een kaart van de eigen locatie | 4 gesprekken |
| Week 3–6 | Locatieprofiel met e-mail en relatieve klasse (§ 4.2) | Offertes aan gekwalificeerde OWE-dossiers. Vijf validatiegesprekken met windparkeigenaren en coöperaties over congestie. | **1 betaalde scan** |
| Week 7–12 | Hubfilter, netcongestie, omgekeerde route en pagina’s per windpark (§ 4.3) | Regiosessies in drie provincies. Twee adviesbureaus met een eigen Atlas-link. | **3 betaalde scans** in totaal, ≥ 1 via de Atlas; pijplijn voor de hubregeling |

**Wekelijks meten:** kaartbezoeken → percelen gekozen → parken gekozen → CTA-klikken → locatieprofielen → gesprekken → offertes → opdrachten, steeds per bron. Kijk na 200 gekozen percelen naar de conversie. Is die onder 2 % naar een locatieprofiel, pas dan de waarde in § 4.2 aan voordat je meer verkeer koopt.

## 8. Risico’s

| Risico | Maatregel |
|---|---|
| OWE 3 wordt uitgesteld of geschrapt | De hubregeling en de congestiedoelgroep staan los van OWE 3. Leg geen omzet vast op één regeling. |
| De Atlas wordt gelezen als harde raming | Laat ‘indicatief, één windjaar’ zichtbaar staan. Toon geen LCOH of €/kg (zie § 4.2). Verwijs voor cijfers die in een dossier komen naar de scan. |
| De site lijkt een bestaand bedrijf terwijl het een concept is | Laat de balk ‘Conceptwebsite’ staan tot `SCAN.provider` is ingevuld en er echt geleverd en gefactureerd kan worden. |
| OSM-gegevens kloppen niet (vermogen, gesloten parken) | Steekproef voor de pagina’s per windpark live gaan. Maak een meldknop ‘klopt dit park niet?’. |
| De verborgen LCOH-berekening gebruikt het sitewachtwoord | Deel dat wachtwoord niet buiten het team: wie het heeft, kan de hele site openen. |
| Te weinig volume voor de vaste prijzen | Evalueer na twintig gekwalificeerde gesprekken, zoals in `waterstofscan.md` § 5. Pas eerst doelgroep en bewijs aan, niet de prijs. |

## 9. Eerste vijf acties

1. Neem de context mee in de CTA en voeg het veld `bron` toe aan het formulier en aan `/leads` (§ 4.1, punt 1–2).
2. Vul `SCAN.provider` in en maak één gecontroleerd voorbeeldrapport (`waterstofscan.md` § 6). Zonder afzender verkoopt ook de Atlas niets.
3. Zet voor de tien OWE-prospects uit `waterstofscan.md` § 3 een deelbare kaart klaar en verstuur de berichten.
4. Plan vijf gesprekken met eigenaren van windparken op land en coöperaties in congestiegebied om de derde doelgroep te toetsen.
5. Kies samen met één provinciaal waterstofprogramma een datum voor een regiosessie vóór de opening van de hubregeling.
