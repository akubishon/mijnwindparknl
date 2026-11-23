# Productplan Waterstofatlas (hypothetisch)

*Versie 1 · 23 november 2026 · status: denkoefening, nog niet gevalideerd met klanten.*

Dit plan hoort bij [`productplan-mijnwindpark.md`](productplan-mijnwindpark.md). Het staat in deze repository omdat beide producten samen worden gepland; de code van de Atlas staat elders (de site waterstofatlas.nl en `akubishon/datasheetextract`). Er is in dit plan niets aan de Atlas zelf veranderd. Prijzen en aantallen zijn hypotheses om te toetsen.

---

## 1. Samenvatting

1. De Waterstofatlas is een **leveranciersneutrale catalogus van elektrolysers** (95 modellen en configuraties van 30 fabrikanten; na de centrale uitsluiting van vier fabrikanten 64 modellen van 26) met een **beslisroute**: Verkennen → Eisen (knock-out) → Shortlist → Arena (multicriteria-analyse met duels) → Dashboard (besluit en open vragen aan fabrikanten).
2. Het unieke zit niet in de lijst, maar in **hoe de gegevens zijn behandeld**: elke waarde heeft een herkomst (bron, afgeleid, aanname, open), onzekerheid blijft zichtbaar (oranje, "controleren"), per eis staat hoeveel modellen het gegeven hebben, en wat onduidelijk is wordt een **concrete vraag aan de fabrikant**.
3. Het probleem dat het oplost is echt: datasheets van elektrolysers zijn onvergelijkbaar (stack of systeem, AC of DC, begin of eind van de levensduur, kWh/kg of kWh/Nm³, minimumlast op stroom, vermogen of waterstof). Iedere ontwikkelaar en elk adviesbureau doet dat uitzoekwerk nu opnieuw.
4. **Groot denken:** het patroon *datasheet → genormaliseerde data met herkomst → eisen → shortlist → afweging → open vragen* werkt voor élke apparaatcategorie in de energietransitie: batterijen, e-boilers, gelijkrichters, compressoren, brandstofcellen, laadpunten. De Atlas kan het **keuzeplatform voor energietransitie-apparatuur** worden, met waterstof als eerste categorie.
5. **Tweezijdig:** kopers genereren vragen, fabrikanten beantwoorden ze, de data wordt beter voor iedereen. Dat vliegwiel is de kern van de businesscase.
6. **Samen met mijnwindpark:** de Atlas zegt *welke* apparaten in aanmerking komen; mijnwindpark rekent uit *hoe ze presteren en wat ze kosten* op echte wind. Samen: **van datasheet tot investeringsbesluit**. De koppeling bestaat al (shortlist heen, windresultaat terug naar de Arena).
7. Kansrijkste eerste klanten: **ontwikkelaars en hun technische adviseurs** in de fase van technologiekeuze en marktconsultatie, en **fabrikanten** die hun gegevens correct willen laten zien.
8. Grootste risico's: juistheid en aansprakelijkheid van data, auteursrecht op datasheets, neutraliteit zodra fabrikanten betalen, en de afgekoelde waterstofmarkt. Antwoord: correctieproces, links in plaats van kopieën, harde regel "betalen kan nooit de rangorde beïnvloeden", en snel een tweede categorie toevoegen.

---

## 2. Wat de Atlas nu is

| Onderdeel | Wat het doet | Productwaarde |
|---|---|---|
| Verkennen | 95 modellen en configuraties; filter op technologie, fabrikant, vermogen per unit; per model kernvelden met volledigheid ("9/18 kernvelden"), bedrijfstemperatuur met richtwaarde per technologie | Marktoverzicht in minuten in plaats van weken |
| Eisen | Knock-outcriteria met dekking per eis ("58 van 64 ingevuld"): leveringsomvang, vermogen per unit, uitgangsdruk, minimumlast, aantal modules, temperatuur, TRL, stroomverbruik (AC-systeem), leverbewijs, ramp-up; onduidelijke waarden blijven oranje | Eerlijke voorselectie: wat zeker afvalt, wat nog gecheckt moet worden |
| Shortlist | Naast elkaar, alleen verschillen tonen, schrappen tot 3 à 6 | Overzicht voor het projectteam |
| Arena | Multicriteria-analyse: weging, scorebord, duels tussen twee modellen; windprestatie uit mijnwindpark als criterium | Navolgbare afweging |
| Dashboard | Conclusie, doorgerekend op windpark (waterstof, LCOH, meerprijs), **open vragen aan fabrikanten**, onderbouwing per technologie, eis en fabrikant; afdrukken, HTML | Besluitdocument en volgende actie |
| Aantal units | Per model het aantal modules voor een doelvermogen, met afwijking, ramp-up/down, minimumlast, start-tijden en **Made in EEA** | Van model naar projectschaal |
| Exports en beheer | Excel-kopie, export, beheeromgeving; uitgesloten fabrikanten centraal ingesteld | Werken in bestaande processen |
| Data-pijplijn | `datasheetextract`: datasheets → `data.json` met herkomst; PDF's in opslag; live catalogus voor mijnwindpark via een beveiligde integratie | Schaalbaar naar nieuwe modellen en categorieën |

---

## 3. Wie zijn de klanten?

| # | Segment | Hun vraag | Wat de Atlas levert | Betaalt | Fit nu |
|---|---|---|---|---|---|
| 1 | **Ontwikkelaars van waterstofprojecten** (industrie, havens, energiebedrijven, hubs) | Welke technologie en welke leveranciers zetten we op de shortlist voor de marktconsultatie? | Eisen → shortlist → Arena → open vragen; met mijnwindpark ook prestatie en kostprijs | hoog | hoog |
| 2 | **Technische adviseurs / owner's engineers** | Hoe maken we een verdedigbare, herhaalbare leveranciersbeoordeling? | Herkomst per waarde, dekking per eis, besluitdocument, Excel | hoog | hoog |
| 3 | **Fabrikanten (OEM's)** | Staat ons product er correct in, en wat vragen kopers? | Gegevens claimen en bevestigen, vragen beantwoorden, inzicht in de vraag (geanonimiseerd) | middel | middel (portaal ontbreekt) |
| 4 | **Publieke kopers en subsidieverleners** (havens, gemeenten, provincies, RVO) | Welke leveranciers voldoen, ook aan Europese eisen voor herkomst? | Neutraal marktoverzicht, "Made in EEA", TRL, leverbewijs | middel | middel |
| 5 | **Financiers en due-diligence-adviseurs** | Hoe volwassen en bewezen is de gekozen technologie? | TRL, leverbewijs, onzekerheden, open vragen | middel | middel |
| 6 | **Onderzoek en beleid** (kennisinstellingen, brancheorganisaties) | Hoe ontwikkelen rendement, schaal en minimumlast zich? | Dataset met herkomst, trends | laag–middel | middel |
| 7 | **Onderwijs** | Lesmateriaal over elektrolysetechnologie | Verkennen en uitleg | laag | hoog |

**Uitbreiding naar andere categorieën** (zelfde klanten, grotere markt): batterijsystemen voor netcongestie en energiehubs, e-boilers en industriële warmtepompen, gelijkrichters en vermogenselektronica (de catalogus kent al een categorie zonder stack), waterstofcompressoren en -opslag, brandstofcellen, laadsystemen voor zwaar transport. Elk krijgt dezelfde route en, waar mijnwindpark een rekenkern heeft (batterij, e-boiler in fase 2 van dat plan), dezelfde doorrekening op echte wind.

---

## 4. Wat kunnen we opleveren?

| Product | Inhoud | Voor | Prijshypothese |
|---|---|---|---|
| **A. Atlas Open** (gratis) | Verkennen zonder wachtwoord, per model en fabrikant een pagina met herkomst; uitleg | Iedereen; leadbron | Gratis |
| **B. Atlas Pro** (abonnement) | Eisen, shortlist, Arena en dashboard met opgeslagen projecten, delen met het team, Excel en besluitdocument in eigen huisstijl, **RFI-generator** (open vragen als vragenlijst per fabrikant), meldingen als gegevens van shortlistmodellen veranderen | Ontwikkelaars, adviseurs, financiers | € 3.000–6.000 per gebruiker per jaar; teamlicentie € 12.000–25.000 |
| **C. Leveranciersselectie als dienst** | In 2–3 weken: eisen opstellen met de klant, shortlist, Arena-workshop, RFI versturen en antwoorden verwerken, besluitdocument; gecombineerd met de haalbaarheidsscan van mijnwindpark | Ontwikkelaars, publieke kopers | € 12.000–25.000 per project |
| **D. Leveranciersportaal** | Fabrikant claimt modellen, levert gegevens en datasheets aan, beantwoordt open vragen gestructureerd (status "bevestigd door fabrikant"), ziet geanonimiseerd welke eisen kopers stellen en waar modellen op afvallen | Fabrikanten | € 5.000–15.000 per fabrikant per jaar; nooit invloed op rangorde |
| **E. Data en API** | Genormaliseerde dataset met herkomst en historie, per categorie | Adviesbureaus, onderzoek, financiers | € 10.000–50.000 per jaar |

**Neutraliteitsregels** (vooraf vastleggen en publiceren):
1. Betalen beïnvloedt nooit welke modellen voldoen, de volgorde, de weging of de conclusie.
2. Elke waarde houdt haar herkomst; "aangeleverd door fabrikant" is een eigen status, naast "bron" en "afgeleid".
3. Uitsluiten van fabrikanten is een keuze van de gebruiker per project, met reden (bijvoorbeeld herkomsteisen of uit de markt), niet een centrale instelling.
4. Correcties van fabrikanten worden zichtbaar gelogd.

---

## 5. Waarom de combinatie met mijnwindpark sterk is

| Vraag in een project | Atlas | mijnwindpark |
|---|---|---|
| Welke apparaten komen in aanmerking? | ✓ | |
| Wat is onzeker en wat vraag ik de fabrikant? | ✓ | |
| Hoeveel waterstof, starts en benutting op onze wind? | | ✓ |
| Wat kost een kilo, en hoeveel meer mag een model kosten? | | ✓ |
| Welk model wint, rekening houdend met prestatie en onzekerheid? | ✓ (Arena) | ✓ (robuustheid) |

De keten bestaat al: **Doorrekenen op windpark ↗** in de Atlas en **Resultaat naar Waterstofatlas ↗** in mijnwindpark. In verkoopgesprekken moet dit **één aanbod** zijn: *van datasheet tot investeringsbesluit*, met twee ingangen. De `aannameVelden` die mijnwindpark terugstuurt worden in het dashboard vragen aan fabrikanten; als fabrikanten die beantwoorden (leveranciersportaal), rekent mijnwindpark opnieuw met betere data. Dat is het vliegwiel.

---

## 6. Roadmap

### Fase 0 · Nu (0–1 maand)
- Neutraliteitsregels vastleggen (§4).
- Rechten: datasheets alleen linken of met toestemming tonen; TRL- en leverbewijsbronnen per model vastleggen.
- Correctieproces: een vaste route waarlangs een fabrikant een fout kan melden, met reactietermijn.
- **Productweergave voor de Atlas**, zoals op mijnwindpark: dezelfde knop, een productpagina (probleem, beslisroute, doelgroepen, productvormen, demo-route) en notities per stap. In de Atlas-repository bouwen.

### Fase 1 · Open en Pro (1–3 maanden)
- Verkennen publiek (zonder wachtwoord), met een pagina per model en fabrikant; de beslisroute achter een account.
- Projecten opslaan en delen in plaats van alleen in de browser.
- **RFI-generator**: open vragen per fabrikant als vragenlijst (Word/Excel), met de status per vraag.
- "Made in EEA" en andere herkomsteisen als expliciete eis in Eisen; uitsluiten van fabrikanten per project.
- Gezamenlijke inlog met mijnwindpark.

### Fase 2 · Leveranciersportaal (3–6 maanden)
- Fabrikanten claimen modellen, leveren gegevens aan en beantwoorden vragen; status "bevestigd door fabrikant" en wijzigingslog per model.
- Meldingen aan gebruikers als gegevens van hun shortlist veranderen.
- Geanonimiseerde inzichten voor fabrikanten (welke eisen, waar vallen modellen af).

### Fase 3 · Tweede categorie en Europa (6–12 maanden)
- Tweede categorie: **batterijsystemen** (sluit aan op netcongestie en de batterijkern van mijnwindpark) of **e-boilers**; de extractiepijplijn eerst toetsen op 20 datasheets.
- Engels als eerste taal voor de Europese markt; data-API.

---

## 7. Verdienmodel (illustratief)

| | Jaar 1 | Jaar 2 | Jaar 3 |
|---|---|---|---|
| B. Pro | 5 × € 6.000 = € 30.000 | 20 × € 6.000 = € 120.000 | 40 × € 6.000 = € 240.000 |
| C. Selectie als dienst | 4 × € 15.000 = € 60.000 | 8 × € 18.000 = € 144.000 | 12 × € 18.000 = € 216.000 |
| D. Leveranciersportaal | 3 × € 7.500 = € 22.500 | 8 × € 10.000 = € 80.000 | 15 × € 10.000 = € 150.000 |
| E. Data en API | – | 1 × € 25.000 = € 25.000 | 3 × € 25.000 = € 75.000 |
| **Totaal** | **≈ € 110.000** | **≈ € 370.000** | **≈ € 680.000** |

Met een tweede categorie kan jaar 3 hoger uitvallen; zonder groei van de waterstofmarkt lager. Belangrijkste kosten: data bijhouden (mens en pijplijn), ontwikkeling van portaal en accounts, en sales.

---

## 8. Validatie

| # | Hypothese | Test | Geslaagd als |
|---|---|---|---|
| A1 | Ontwikkelaars en adviseurs betalen voor de beslisroute met RFI-generator | 10 gesprekken; 5 pilotgebruikers 6 weken | ≥ 3 betalende teams |
| A2 | Fabrikanten willen hun gegevens claimen en vragen beantwoorden | 10 fabrikanten benaderen met "uw model heeft N open vragen van kopers" | ≥ 5 reageren, ≥ 2 betalen |
| A3 | Publieke kopers willen een neutraal marktoverzicht met herkomsteisen | 3 gesprekken (haven, provincie, subsidieverlener) | 1 pilot |
| A4 | De pijplijn werkt voor een tweede categorie | 20 datasheets van batterijsystemen extraheren | ≥ 80 % van de kernvelden met bronstatus |

**Kengetallen:** aantal modellen, aandeel velden met status *bron*, actualiteit (dagen sinds laatste controle), shortlists per maand, verstuurde RFI's, antwoorden van fabrikanten, doorstroom naar haalbaarheidsscans.

---

## 9. Risico's en maatregelen

| Risico | Maatregel |
|---|---|
| Fout gegeven leidt tot verkeerde keuze of claim | Herkomst per waarde, disclaimer, correctieproces, "controleren" bij twijfel (bestaat al) |
| Auteursrecht op datasheets | Linken naar de bron, PDF's alleen met toestemming tonen |
| Neutraliteit bij betalende fabrikanten | Neutraliteitsregels publiceren; scheiding tussen verkoop en data-redactie |
| Waterstofmarkt blijft klein | Tweede categorie in fase 3; combineren met mijnwindpark-scans voor energiehubs |
| Data veroudert | Pijplijn plus leveranciersportaal; actualiteit zichtbaar per model |
| Uitsluiting van fabrikanten oogt politiek | Per project instelbaar, met reden; standaard niemand uitsluiten in Atlas Open |

---

## 10. Volgende stappen

1. Neutraliteitsregels en correctieproces opschrijven (1 pagina).
2. Productweergave voor de Atlas bouwen naar het voorbeeld van mijnwindpark.
3. Gesprekken A1–A3 combineren met de gesprekken uit het mijnwindpark-plan: één gesprek, twee producten.
4. RFI-generator als eerste Pro-functie: de open vragen bestaan al in het dashboard, het formaat ontbreekt nog.
