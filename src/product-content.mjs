// Inhoud van de productweergave (de site als platform, voor verkoopgesprekken). Alleen data: de componenten in
// product-landing.tsx en product-view.tsx tonen dit, en tests/product-view.test.mjs controleert links en vertalingen.
// Elke zichtbare tekst is één tekstnode, zodat de vertaallaag (i18n-en.mjs) hem in zijn geheel kan vervangen.
// Velden met de naam href, url, id of status zijn geen zichtbare tekst. Prijzen staan bewust alleen in
// docs/productplan-mijnwindpark.md, niet op de site.

// Pagina's van de site waar de productweergave naar mag linken.
export const SITE_ROUTES = ['/', '/fryslan', '/beabuorren', '/elektrolyser', '/elektrolyser/catalogus', '/elektrolyser/samenstellen', '/elektrolyser/vergelijken', '/opsplitsing', '/onderzoek'];
// Ankers op de productpagina zelf.
export const ANCHORS = ['#demo', '#doelgroepen', '#democase', '#stroom', '#volgende-stap'];

export const STATUS = {
  live: 'Nu te demonstreren',
  next: 'Volgende stap',
  roadmap: 'Op de roadmap',
};

export const hero = {
  eyebrow: 'PRODUCTWEERGAVE · MIJNWINDPARK.NL ALS PLATFORM',
  titleStart: 'Van windmeting naar',
  // Zacht afbreekstreepje: op een telefoon past het lange woord anders niet in de kop.
  titleEnd: 'investerings­besluit.',
  lead: 'Eén rekenplatform voor de energietransitie: wat levert een wind- of zonnepark per tien minuten, wat kan een flexibele afnemer daarmee achter een begrensde aansluiting, en wat kost dat? Op echte meetjaren, met conclusies die rekening houden met onzekerheid, en narekenbaar tot in Excel.',
  primary: {label: 'Volg de demo-route', href: '#demo'},
  secondary: {label: 'Voor wie is het?', href: '#doelgroepen'},
  note: 'Alle schermen en cijfers op deze site zijn echt. De demo-case is 10 % van Windpark Fryslân plus Windpark Beabuorren, samen tot 48,7 MW, voor een elektrolyser van 44 MW.',
};

// Teksten van het live-paneel; de waarden komen uit de bestaande API's van de site.
export const proof = {
  title: 'LIVE UIT HET PLATFORM',
  liveNow: 'Windpark Fryslân levert nu',
  liveLast: 'Laatste meting Windpark Fryslân',
  years: 'Gemeten uurproductie',
  yearsNote: 'jaren in het archief',
  catalogue: 'Elektrolysers in de catalogus',
  catalogueNote: '{0} fabrikanten · uit de Waterstofatlas',
  forecast: 'Laatste opgeslagen HARMONIE-run',
  forecastNote: 'elk uur verwerkt en bewaard',
  windYears: 'Rekenen op echte jaren',
  windYearsValue: '4 windjaren',
  windYearsNote: 'per tien minuten, 2022–2025',
  stations: 'KNMI-stations',
  stationsValue: '77',
  stationsNote: 'wind per tien minuten, open data',
  loading: 'laden…',
  unavailable: 'nu niet beschikbaar',
};

// Marktcijfers: alleen cijfers die op 23 november 2026 in de bron zelf zijn nagelezen.
export const why = {
  eyebrow: 'WAAROM NU',
  title: 'Het net zit vol. Flexibiliteit is de uitweg, als je haar goed dimensioneert.',
  intro: 'Wie duurzame stroom wil gebruiken, moet steeds vaker rekenen aan flexibele vraag achter een begrensde aansluiting. Dat is precies wat dit platform doet.',
  facts: [
    {figure: 'ruim 15.000', text: 'aanvragen van grootverbruikers in de wachtrij voor netcapaciteit', implication: 'Wie flexibel afneemt, kan eerder verder, mits de flex past.', source: 'Kamerbrief netcongestie, 2 april 2026 (stand eind 2025)', url: 'https://zoek.officielebekendmakingen.nl/kst-29023-640.html'},
    {figure: 'bijna 400', text: 'initiatieven voor energiehubs, waarvan enkele tientallen actief of in realisatie', implication: 'Elke hub moet laten zien dat aanbod, opslag en vraag op één aansluiting passen.', source: 'RVO, december 2025', url: 'https://www.rvo.nl/onderwerpen/energiehubs/hoe-ver-zijn-energiehubs-nederland'},
    {figure: '€ 3,2 mld', text: 'aangevraagd voor waterstofsubsidie (OWE); ruim € 700 mln toegekend aan 11 bedrijven', implication: 'Subsidiegevers en financiers kiezen scherp: de businesscase moet robuust zijn.', source: 'Rijksoverheid, 18 juli 2025', url: 'https://www.rijksoverheid.nl/onderwerpen/duurzame-energie/nieuws/2025/07/18/11-projecten-krijgen-subsidie-voor-productie-van-duurzame-waterstof'},
    {figure: '696', text: 'energiecoöperaties, samen goed voor stroom voor een half miljoen huishoudens', implication: 'Leden en omwonenden willen zien wat hun park doet.', source: 'HIER, Lokale Energie Monitor 2025', url: 'https://www.hier.nu/system/files/inline/Persbericht%20-%20Lokale%20Energie%20Monitor%202025_0.pdf'},
  ],
  law: 'Sinds 1 januari 2026 geldt de Energiewet: cable pooling is niet langer beperkt tot wind- en zonneparken. En onderzoek naar een energiehub kan subsidie krijgen via de EHUB-regeling van RVO (aanvragen tot 1 mei 2027, zolang er budget is).',
  sourceLabel: 'Bron',
};

export const platform = {
  eyebrow: 'HET PLATFORM',
  title: 'Drie lagen, één rekenketen',
  intro: 'De keten die de demo-case doorrekent, werkt voor elk project: data erin, rekenkernen ertussen en per doelgroep een toepassing erbovenop.',
  layers: [
    {title: 'Data', items: [
      {text: 'Gemeten productie per uur en live per tien seconden', status: 'live'},
      {text: 'KNMI-wind per tien minuten op 77 stations', status: 'live'},
      {text: 'WINS50-hoogtevertaling naar ashoogte', status: 'live'},
      {text: 'HARMONIE-verwachtingen, elk uur gearchiveerd', status: 'live'},
      {text: 'Elektrolysercatalogus uit de Waterstofatlas', status: 'live'},
      {text: 'Eigen meetdata van de klant', status: 'next'},
      {text: 'Zon, netprijzen en regionale data', status: 'roadmap'},
    ]},
    {title: 'Rekenkernen', items: [
      {text: 'Wind naar vermogen per tien minuten, per park', status: 'live'},
      {text: 'Inzet van modules: minimumlast, starts, stand-by en storingen', status: 'live'},
      {text: 'Kosten en LCOH, met maximale meerprijs per leverancier', status: 'live'},
      {text: 'Robuustheidstoets: elke kostenpost ±25 %', status: 'live'},
      {text: 'Rekenrapport en Excel met echte formules', status: 'live'},
      {text: 'Elk park en elke locatie op coördinaten', status: 'next'},
      {text: 'Batterij, e-boiler, laadplein en netaansluiting met tijdsblokken', status: 'roadmap'},
    ]},
    {title: 'Toepassingen', items: [
      {text: 'Haalbaarheid en dimensionering', status: 'live'},
      {text: 'Leverancierskeuze', status: 'live'},
      {text: 'Park- en ledenportaal', status: 'next'},
      {text: 'Prestatie- en verwachtingsmonitor', status: 'next'},
      {text: 'Regionale energiemonitor', status: 'roadmap'},
    ]},
  ],
};

export const segments = {
  eyebrow: 'VOOR WIE',
  title: 'Zes doelgroepen, één platform',
  intro: 'Per doelgroep: hun vraag, wat we leveren en welk scherm het laat zien.',
  deliverLabel: 'Wat we leveren',
  demoLabel: 'Laat zien',
  items: [
    {id: 'waterstof', tag: 'WATERSTOF & POWER-TO-X', title: 'Ontwikkelaars van waterstof- en Power-to-X-projecten',
      question: '“Welke elektrolyser, hoe groot en in hoeveel modules, en wat kost een kilo waterstof op onze wind?”',
      deliver: ['Dimensionering op vier echte windjaren', 'Tot 120 opstellingen uit de Waterstofatlas naast elkaar', 'Waterstof, starts, benutting en kostprijs per model', 'Maximale meerprijs per leverancier als onderhandelingsruimte', 'Rekenrapport en Excel voor subsidie- en investeringsaanvragen'],
      demo: [{label: 'Vergelijken', href: '/elektrolyser/vergelijken'}, {label: 'Opsplitsen', href: '/opsplitsing'}], status: 'live'},
    {id: 'energiehubs', tag: 'NETCONGESTIE & ENERGIEHUBS', title: 'Energiehubs en bedrijven op de wachtlijst',
      question: '“Hoeveel flexibele vraag en opslag past achter ons park of onze gedeelde aansluiting?”',
      deliver: ['Aanbod per tien minuten op de locatie', 'Benutting van een begrensde aansluiting: wat past en wat blijft liggen', 'Dimensionering van flexibele afnemers met minimumlast en starts', 'Onderbouwing voor een groepscontract of cable pooling'],
      demo: [{label: 'Opsplitsen', href: '/opsplitsing'}, {label: 'Windpark Fryslân', href: '/fryslan'}], status: 'next', statusNote: 'Uitbreiding: batterij, e-boiler en netaansluiting'},
    {id: 'participatie', tag: 'PARTICIPATIE', title: 'Energiecoöperaties en parkeigenaren',
      question: '“Wat levert ons park vandaag, wat komt eraan, en wat betekent dat voor onze leden?”',
      deliver: ['Dagoverzicht met gemeten productie', 'Actueel vermogen, iedere tien seconden', 'De verwachting van gisteren naast de productie van vandaag', 'Exports voor jaarverslag en ledenbrief', 'In te bedden op de eigen website'],
      demo: [{label: 'Windpark Fryslân', href: '/fryslan'}, {label: 'Windpark Beabuorren', href: '/beabuorren'}], status: 'live', statusNote: 'Eigen park koppelen is de volgende stap'},
    {id: 'overheid', tag: 'OVERHEID', title: 'Gemeenten, provincies en RES-regio’s',
      question: '“Hoeveel duurzame stroom wekken onze parken op, en hoe leggen we dat uit aan inwoners en raad?”',
      deliver: ['Publieke dashboards per park of regio', 'De energiestroom van bron tot afnemer in één beeld', 'Verwachting en werkelijkheid op basis van open data'],
      demo: [{label: 'Demo-case', href: '#democase'}, {label: 'Windpark Beabuorren', href: '/beabuorren'}], status: 'roadmap', statusNote: 'Uitbreiding: regionale data en publieke pagina’s'},
    {id: 'financiers', tag: 'BESLUITVORMING', title: 'Financiers en subsidieverleners',
      question: '“Houdt deze businesscase stand als prijzen, kosten of de wind tegenvallen?”',
      deliver: ['Conclusie binnen de modelonzekerheid: elke kostenpost ±25 %','Herkomst per waarde: bron, afgeleid of aanname', 'Excel met echte formules, volledig na te rekenen', 'Vier windjaren in plaats van één gemiddeld jaar'],
      demo: [{label: 'Opsplitsen', href: '/opsplitsing'}, {label: 'Vergelijken', href: '/elektrolyser/vergelijken'}], status: 'live'},
    {id: 'ketenpartners', tag: 'KETENPARTNERS', title: 'Leveranciers en adviesbureaus',
      question: '“Hoe presteert ons product op echte wind, en kunnen studies sneller en controleerbaar?”',
      deliver: ['Prestatie per model op dezelfde wind en aannames', 'Datasheetgegevens met status via de Waterstofatlas', 'Rekenkern als licentie of white label', 'Standaardrapportage voor haalbaarheidsstudies'],
      demo: [{label: 'Catalogus', href: '/elektrolyser/catalogus'}, {label: 'Samenstellen', href: '/elektrolyser/samenstellen'}], status: 'live'},
  ],
};

export const offerings = {
  eyebrow: 'WAT WE OPLEVEREN',
  title: 'Vier manieren om het platform af te nemen',
  forLabel: 'Voor',
  formLabel: 'Vorm',
  items: [
    {title: 'Haalbaarheidsscan', text: 'In enkele weken: aanbod op jouw locatie, dimensionering, leverancierskeuze en kostprijs, met rekenrapport en Excel.', for: 'Ontwikkelaars, energiehubs en adviseurs', form: 'Vaste prijs per project'},
    {title: 'Projectstudio', text: 'Zelf rekenen met eigen parken, opstellingen en aannames, en scenario’s delen met je team.', for: 'Ontwikkelaars, adviesbureaus en leveranciers', form: 'Abonnement per organisatie'},
    {title: 'Park- en ledenportaal', text: 'Productie, live vermogen en verwachting van je eigen park, in je eigen huisstijl en op je eigen website.', for: 'Coöperaties, parkeigenaren en gemeenten', form: 'Abonnement per park'},
    {title: 'Data en rekenkern', text: 'Tienminutenreeksen, het verwachtingsarchief en de rekenkern via API of licentie.', for: 'Adviesbureaus, financiers en netpartijen', form: 'Licentie'},
  ],
};

export const strengths = {
  eyebrow: 'WAAROM DIT PLATFORM',
  title: 'Wat het anders maakt',
  items: [
    {title: 'Echte jaren, geen gemiddeld jaar', text: 'Vier windjaren per tien minuten, gemeten productie en een archief van weersverwachtingen.'},
    {title: 'Narekenbaar', text: 'Elke waarde heeft een status: bron, afgeleid of aanname. Rapport en Excel met echte formules.'},
    {title: 'Eerlijke conclusies', text: 'Binnen de modelonzekerheid kronen we geen winnaar; we laten zien welke aanname de doorslag geeft.'},
    {title: 'Leveranciersneutraal', text: 'Alle modellen op dezelfde wind en dezelfde aannames.'},
    {title: 'Rekenen met de verwachting van toen', text: 'Sinds januari 2026 bewaren we elke HARMONIE-run, zodat inzet en stand-by getoetst worden met wat er destijds bekend was.'},
    {title: 'Snel', text: 'Tot 120 opstellingen over vier windjaren in seconden, in de browser.'},
  ],
};

// De demo-route: de volgorde waarin je de site in een gesprek laat zien.
export const demo = {
  eyebrow: 'DEMO-ROUTE',
  title: 'Zo laat je het zien in twintig minuten',
  intro: 'Volg de stappen. In de productweergave staat bovenaan elk scherm een korte notitie met wat je ziet, waarom het telt en een vraag voor het gesprek.',
  askLabel: 'Vraag voor het gesprek',
  openLabel: 'Open dit scherm',
  steps: [
    {title: 'Het project in één beeld', href: '#democase', text: 'Het stroomschema: twee windparken, een elektrolyser van 44 MW, en waterstof, zuurstof en warmte voor vijf afnemers.', ask: 'Hoe ziet het stroomschema van jouw project eruit?'},
    {title: 'Meting, model en verwachting', href: '/fryslan', text: 'Gemeten productie, het KNMI-tienminutenmodel en de verwachting van gisteravond in één grafiek.', ask: 'Hoe weet jij nu of je park presteert zoals verwacht?'},
    {title: 'Een park zonder meetdata', href: '/beabuorren', text: 'Beabuorren volgt volledig uit KNMI-wind en de turbinecurve. Zo werkt het ook voor parken die nog gebouwd moeten worden.', ask: 'Welke locaties wil je doorrekenen?'},
    {title: 'Leverancierskeuze op feiten', href: '/elektrolyser/catalogus', text: 'Elektrolysers uit de Waterstofatlas, elk gegeven met een status: bron, afgeleid, aanname of open.', ask: 'Welke leveranciers heb je nu in beeld, en op basis waarvan?'},
    {title: 'Vergelijken met een conclusie', href: '/elektrolyser/vergelijken', text: 'Opstellingen op dezelfde wind: waterstof, starts, kostprijs en een conclusie die onzekerheid meeneemt.', ask: 'Wie moet de uitkomst geloven: directie, bank of subsidieverlener?'},
    {title: 'Narekenbaar tot in Excel', href: '/opsplitsing', text: 'Eén grote of meerdere kleine modules, met gevoeligheid, omslagkaart, rekenrapport en Excel met formules.', ask: 'Wat zou een haalbaarheidsscan op jouw locatie je opleveren?'},
  ],
};

export const generalise = {
  eyebrow: 'VAN DEMO-CASE NAAR JOUW PROJECT',
  title: 'Wat in de demo vastligt, wordt in jouw project een keuze',
  nowLabel: 'In de demo-case',
  nextLabel: 'Voor jouw project',
  statusLabel: 'Status',
  rows: [
    {now: 'Twee windparken in Friesland', next: 'Elk wind- of zonnepark in Nederland, op coördinaten', status: 'next'},
    {now: '10 % van Fryslân en heel Beabuorren, tot 48,7 MW', next: 'Jouw aandeel, contract of aansluitwaarde', status: 'next'},
    {now: 'Een elektrolyser van 44 MW', next: 'Elektrolyser, batterij, e-boiler of laadplein', status: 'roadmap'},
    {now: 'Gemeten productie van het park', next: 'Jouw meetdata, of alleen het KNMI-model', status: 'next'},
    {now: 'Kostprijs per kilo waterstof', next: 'Kostprijs per kilo, per MWh of per lid', status: 'next'},
    {now: 'Vier windjaren, 2022–2025', next: 'Dezelfde jaren op jouw locatie, plus de verwachting van vandaag', status: 'next'},
  ],
};

export const democase = {
  eyebrow: 'DE DEMO-CASE',
  intro: 'Twee windparken, één elektrolyser, vijf afnemers: dit is het project waarvoor het platform is gebouwd. Elk getal op de site komt uit deze keten.',
};

export const closing = {
  eyebrow: 'VOLGENDE STAP',
  title: 'Een haalbaarheidsscan op jouw locatie',
  text: 'Neem je locatie, aansluitwaarde en afnemer mee. In het gesprek laten we zien wat het platform ervan maakt; daarna rekenen we het door op jouw data.',
  back: 'Terug naar de demo-route',
  project: 'Naar de projectweergave',
  footer: 'Productweergave · demo-case met echte data',
};

// Notities bovenaan de andere pagina's in de productweergave.
export const note = {
  eyebrow: 'PRODUCTNOTITIE',
  showsLabel: 'Wat je ziet',
  whyLabel: 'Waarom het telt',
  whoLabel: 'Voor',
  askLabel: 'Vraag voor het gesprek',
  nextLabel: 'Volgende stap in de demo',
  overview: 'Naar de productpagina',
};
export const pageNotes = {
  '/fryslan': {title: 'Meting, model en verwachting naast elkaar', shows: 'Gemeten uurproductie, het KNMI-tienminutenmodel en de HARMONIE-verwachting in één grafiek; het actuele vermogen staat in het tweede tabblad.', why: 'Vertrouwen in de cijfers: het model wordt elke dag getoetst aan de meting.', who: 'Coöperaties, parkeigenaren, gemeenten en financiers', ask: 'Hoe weet jij nu of je park presteert zoals verwacht?'},
  '/beabuorren': {title: 'Een park zonder meetdata', shows: 'De productie volgt volledig uit KNMI-wind, de WINS50-hoogtevertaling en de turbinecurve.', why: 'Zo rekent het platform ook voor parken die geen data delen of nog gebouwd moeten worden.', who: 'Ontwikkelaars, energiehubs en gemeenten', ask: 'Welke locaties wil je doorrekenen?'},
  '/elektrolyser/catalogus': {title: 'Leverancierskeuze op feiten', shows: 'Elektrolysers uit de Waterstofatlas; elk gegeven heeft een status: bron, afgeleid, aanname of open.', why: 'Je ziet meteen wat vaststaat en wat je nog bij de leverancier moet navragen.', who: 'Ontwikkelaars, leveranciers en adviesbureaus', ask: 'Welke leveranciers heb je nu in beeld, en op basis waarvan?'},
  '/elektrolyser/samenstellen': {title: 'Van shortlist naar rekenbare opties', shows: 'Tot 120 opstellingen (model × aantal modules), in één klik aangevuld tot het doelvermogen.', why: 'Elke optie wordt vergelijkbaar, ook als datasheets verschillende grenzen gebruiken.', who: 'Ontwikkelaars en adviesbureaus', ask: 'Hoeveel opties vergelijk je nu, en hoe lang duurt dat?'},
  '/elektrolyser/vergelijken': {title: 'Een keuze die onzekerheid meeneemt', shows: 'Alle opstellingen op dezelfde vier windjaren: waterstof, benutting, starts en kostprijs, met de conclusie bovenaan.', why: 'De maximale meerprijs per model geeft onderhandelingsruimte; de robuustheidstoets voorkomt schijnzekerheid.', who: 'Ontwikkelaars, financiers en leveranciers', ask: 'Wie moet de uitkomst geloven: directie, bank of subsidieverlener?'},
  '/opsplitsing': {title: 'Narekenbaar tot in Excel', shows: 'Eén grote of meerdere kleine modules: de originele rekenkern met gevoeligheid, omslagkaart, rekenrapport en Excel met echte formules.', why: 'Een besluit dat financiers en subsidieverleners zelf kunnen narekenen.', who: 'Ontwikkelaars, financiers en energiehubs', ask: 'Wat zou een haalbaarheidsscan op jouw locatie je opleveren?'},
  '/onderzoek': {title: 'Wat levert elke extra megawatt op?', shows: 'Een handmatige capaciteitsvergelijking: de opbrengst per toegevoegde MW op echte wind.', why: 'Laat zien waar groter bouwen niets meer oplevert.', who: 'Ontwikkelaars en energiehubs', ask: 'Waar ligt voor jou de grens tussen groter bouwen en beter benutten?'},
};
const NOTE_ALIASES = {'/elektrolyser': '/elektrolyser/catalogus', '/elektrolyser/opsplitsen': '/opsplitsing'};
export const notePath = path => {
  const clean = path.length > 1 ? path.replace(/\/$/, '') : path;
  return NOTE_ALIASES[clean] || clean;
};
export const noteFor = path => pageNotes[notePath(path)] || null;

// Volgende stap in de demo-route vanaf een pagina; na de laatste stap terug naar de afsluiting op de productpagina.
export function nextDemoStep(path) {
  const current = notePath(path);
  const pages = demo.steps.filter(step => step.href.startsWith('/'));
  const index = pages.findIndex(step => step.href === current);
  if (index >= 0) return index + 1 < pages.length ? pages[index + 1] : {title: closing.title, href: '/#volgende-stap'};
  // Pagina's buiten de route (Samenstellen, Onderzoek) gaan verder bij Vergelijken.
  return pages.find(step => step.href === '/elektrolyser/vergelijken');
}
