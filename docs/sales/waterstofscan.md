# Verkoopplan: de Waterstofscan

*23 november 2026. Eén product, één doelgroep, één pagina. Eerst geld verdienen, daarna verbreden.*

## 1. Wat we verkopen (en wat niet)

**De Waterstofscan: de waterstofopbrengstberekening voor een OWE-aanvraag, doorgerekend op echte wind.**

| Pakket | Prijs (excl. btw) | Levertijd | Inhoud |
|---|---|---|---|
| Opbrengstberekening | € 7.500 | 2 weken | Aanbodprofiel van het park op vier windjaren, opbrengst per kalenderjaar, rendement, beschikbaarheid en degradatie, één elektrolyser in max. drie configuraties, rapport + Excel |
| Opbrengst + keuze | € 14.500 | 3 weken | Plus tot zes elektrolysers vergeleken, dimensionering, LCOH met gevoeligheid, open vragen per leverancier, bespreking |

**Waarom dit product:**
- RVO **eist** in de haalbaarheidsstudie van elke OWE-aanvraag een waterstofopbrengstberekening met zes onderdelen: hernieuwbare waterstof, opbrengst per kalenderjaar, rendement, beschikbaarheid van de installatie, beschikbaarheid van duurzame stroom en degradatie. Ontbreekt er één, dan is de aanvraag onvolledig (RVO, Handleiding haalbaarheidsstudie OWE 2024, hoofdstuk 1–2).
- Onze rekenkern levert precies die zes, vandaag al, met rapport en Excel met formules. Er hoeft niets nieuws gebouwd te worden om te leveren.
- Er komt geld vrij: voor **OWE 3** is € 780 mln gereserveerd, en de regeling voor kleinschalige **waterstofhubs** (€ 125 mln) gaat daarna naar verwachting in Q1 2027 open (beslisnota *Voortgang waterstofbeleid*, 17 juni 2026, nagelezen). In OWE-ronde 2 werd € 3,2 mld aangevraagd en ruim € 0,7 mld toegekend: **veel afgewezen aanvragers die opnieuw gaan aanvragen**.

**Bewust niet (nog):** ledenportalen, regionale dashboards, batterijen, zon. Die staan in [`../productplan-mijnwindpark.md`](../productplan-mijnwindpark.md) en komen pas als de scan loopt.

**Wat de klant zelf (of zijn subsidieadviseur) doet:** investeringsbegroting, mijlpalen, afzet en financiering. Dat maakt ons de ideale partner van subsidieadviseurs in plaats van hun concurrent.

## 2. Wat er op de site staat

- **`mijnwindpark.nl/waterstofscan`** — openbaar, zonder wachtwoord, vindbaar voor zoekmachines. Aanbod, RVO-eisen ↔ wat we leveren, prijzen, timing, FAQ en aanvraagformulier.
- **`mijnwindpark.nl/`** — bezoekers zonder login worden naar de scan gestuurd. Het team logt in via **`/inloggen`**.
- **`/leads`** (achter login) — alle aanvragen, nieuwste eerst, met CSV. **Kijk hier elke werkdag.** Er gaat geen e-mail uit bij een nieuwe aanvraag.
- De interne Productweergave verwijst naar de scan als "wat we nu verkopen"; de demo-route blijft voor gesprekken.

Prijzen en teksten pas je aan in `src/scan-page.mjs` (object `SCAN` en de lijsten eronder).

## 3. Wie we benaderen

Volgorde = verwachte snelheid tot omzet.

### A. Subsidieadviseurs die OWE-aanvragen schrijven (kanaal, hoogste prioriteit)
Zij hebben de klanten en de deadline; wij leveren het rekenhoofdstuk. Eén partner = meerdere scans per ronde.
- Gespecialiseerde subsidieadviesbureaus met een OWE-dienst (bijvoorbeeld PNO Innovation en Hezelburcht, die beide publiek over OWE publiceren).
- Aanbod: vaste partnerprijs (bijvoorbeeld 15 % korting of een doorverwijsvergoeding), levering onder hun regie, wij leveren rapport + Excel in hun format.

### B. Ontwikkelaars van kleinschalige waterstofhubs (regeling Q1 2027)
Lokaal produceren en gebruiken, niet aan de backbone vóór 2032, niet vooral mobiliteit. Vaak gemeenten, regionale ontwikkelmaatschappijen, bedrijventerreinen en industriële clusters buiten de grote havens.
- Vindplaatsen: RVO-webinars en -pagina's over waterstofhubs, de *Stappenplan naar regionale waterstofhubs* (RVO en New Energy Coalition, aug. 2025), provinciale waterstofprogramma's, regionale ontwikkelmaatschappijen.
- Let op: gemeenten en provincies zijn vaak initiatiefnemer maar niet altijd de aanvrager; vraag wie de aanvraag indient.

### C. Partijen die al OWE-subsidie hebben (vervolgopdracht: keuze en onderhandeling)
Zij moeten nu een leverancier kiezen en onderhandelen; het pakket *Opbrengst + keuze* (vergelijking, maximale meerprijs, open vragen) past daar. Publiek bekend via de Rijksoverheid:

| Ronde | Partij (locatie) |
|---|---|
| OWE 2025 | H2Eron (Delfzijl) · Circul8 Waterstof Fabriek (Lelystad) · Eurus Energy Europe (Veendam) · Air Liquide Industrie (Rotterdam) · Uniper Hydrogen Netherlands (Rotterdam) · FR Energyhubs (Steenwijk) · Westfalen Waterstof (Zutphen) · Essent Hydrogen (Deventer) · Den Tol Duurzaam (Gendringen) · Vattenfall (Eemshaven) · Statkraft Renewables Benelux (Den Helder) |
| OWE 2024 | H2 Hollandia (Nieuw-Buinen) · Hysolar (Nieuwegein) · Groengas asset (Amsterdam, Groningen) · RWE Eemshydrogen (Eemshaven) · Van Kessel Olie (Oude Tonge) · VoltH2 (Delfzijl) |

Kansrijkst: de kleinere en middelgrote namen zonder eigen grote engineeringafdeling (bijvoorbeeld Circul8, FR Energyhubs, Westfalen Waterstof, Den Tol Duurzaam, Eurus Energy Europe). Grote energiebedrijven en havenprojecten hebben meestal eigen modellen. Hysolar en H2 Hollandia draaien op zon: alleen benaderen als er wind bij komt.

### D. Eigenaren van windparken op land met curtailment of netcongestie
Vraag: "wat levert een elektrolyser achter ons park op?" Vindplaatsen: de koepel van energiecoöperaties, parkbeheerders, de RVO-monitor wind op land. Langere cyclus; pas na A–C.

## 4. Berichten

**E-mail aan een subsidieadviseur**
> Onderwerp: Hoofdstuk 2 van de OWE-haalbaarheidsstudie, kant-en-klaar
>
> Voor elke OWE-aanvraag moet de waterstofopbrengst onderbouwd worden: hernieuwbare waterstof per kalenderjaar, rendement, beschikbaarheid, aanbod van het park en degradatie. Wij rekenen dat per tien minuten door op vier echte windjaren en leveren een rapport en een Excel met formules die RVO kan narekenen. Vaste prijs, twee weken.
> Voor de waterstofhubregeling en de volgende OWE-ronde zoeken we twee adviesbureaus om mee samen te werken. Mag ik u in twintig minuten laten zien hoe het eruitziet? Het aanbod staat op mijnwindpark.nl/waterstofscan.

**LinkedIn aan een projectontwikkelaar (B of D)**
> Werkt u aan een waterstofhub of elektrolyser bij een windpark? Voor de OWE-aanvraag moet de opbrengst per kalenderjaar onderbouwd zijn. Wij rekenen die door op vier echte windjaren, voor de elektrolysers die u overweegt, vaste prijs vanaf € 7.500. Kort kennismaken? mijnwindpark.nl/waterstofscan

**E-mail aan een OWE-ontvanger (C)**
> Gefeliciteerd met de OWE-toekenning. In de leveranciersfase helpt een vergelijking op dezelfde wind: waterstof, starts en kostprijs per model, plus de maximale meerprijs per leverancier als onderhandelingsruimte en de open vragen die u ze nog moet stellen. Zullen we dat voor uw project doen? Vaste prijs € 14.500, drie weken.

## 5. Ritme en doelen

| Week | Actie | Doel |
|---|---|---|
| 1 | Site live zetten (merge naar `main`), `/leads` dagelijks checken, lijst A en C uitwerken tot namen van contactpersonen (LinkedIn) | Live |
| 1–2 | 10 berichten aan subsidieadviseurs, 10 aan partijen uit C | 4 gesprekken |
| 2–4 | Demo met de Productweergave; partnerafspraak met 1–2 adviseurs | 1 partner |
| 3–6 | Eerste betaalde scan, leveren binnen twee weken, referentie vragen | € 7.500–14.500 omzet |
| 6–12 | Rondes B (hubs, vóór Q1 2027-opening): webinars, provinciale programma's | 5 scans in de pijplijn |

**Stopregel:** na 20 gesprekken geen opdracht → prijs of vorm aanpassen (bijvoorbeeld alleen als onderaanneming via adviseurs) voordat er iets nieuws gebouwd wordt.

## 6. Voordat de pagina live gaat

1. **Wie verstuurt de offerte?** De pagina noemt geen bedrijfsnaam, KvK of e-mailadres. Voeg die toe in `src/scan-page.mjs` (header/footer) zodra vaststaat welke organisatie levert.
2. **Privacy:** de pagina belooft gegevens alleen voor contact te gebruiken en na hooguit twaalf maanden te verwijderen. Verwijder oude aanvragen dan ook echt (R2, `leads/v1/`).
3. **Data van het park:** de scan gebruikt KNMI-data en de turbinecurve van het park van de klant, niet de productiedata van Windpark Fryslân. De openbare pagina noemt geen bestaande parken of klanten.
4. **Levercapaciteit:** wie rekent de scans door en schrijft het rapport? Twee weken levertijd belooft de pagina.

## Bronnen
- RVO, Handleiding haalbaarheidsstudie OWE 2024 — https://english.rvo.nl/sites/default/files/2024-08/Handleiding_haalbaarheidsstudie_OWE_2024_0.pdf
- OWE 2025, 11 bedrijven — https://www.rijksoverheid.nl/actueel/nieuws/2025/07/18/11-projecten-krijgen-subsidie-voor-productie-van-duurzame-waterstof
- OWE 2024, 7 projecten — https://www.rijksoverheid.nl/actueel/nieuws/2024/04/29/zeven-projecten-krijgen-subsidie-voor-de-productie-van-volledig-hernieuwbare-waterstof
- Waterstofhubs (interessepeiling, voorwaarden) — https://www.rvo.nl/onderwerpen/energiehubs/waterstofhubs/interessepeiling-subsidie-waterstofhubs
- Beslisnota Voortgang waterstofbeleid, 17 juni 2026 (OWE 3: € 780 mln; waterstofhubregeling € 125 mln, verwacht Q1 2027) — https://www.tweedekamer.nl/downloads/document?id=2026D45659
- Stappenplan regionale waterstofhubs — https://www.rvo.nl/sites/default/files/2025-10/Stappenplan-naar-regionale-waterstofhubs.pdf
