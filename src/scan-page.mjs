// Openbare verkooppagina /waterstofscan: het ene product dat we verkopen, zonder wachtwoord te bekijken,
// met een aanvraagformulier. Server-side HTML zonder scripts; de worker serveert hem vóór de sitepoort.
// De inhoud staat in SCAN en de lijsten eronder; prijzen en teksten pas je hier aan. Zie docs/sales/waterstofscan.md.
// Kop, menu en voettekst zijn gedeeld met de startpagina en de Atlas (src/public-site.mjs).
// Let op: scripts/compose-worker.mjs plakt dit bestand in de worker en haalt daarbij elke importregel en elk
// 'export'-woord met spatie weg; gebruik dat woord met een spatie erachter dus nergens in teksten.
import {PUBLIC_STYLE, publicFooter, publicHeader, publicLinks} from './public-site.mjs';

export const SCAN_PATH = '/waterstofscan';

export const SCAN = {
  headline: 'Technische opbrengstanalyse voor de voorbereiding van je OWE-aanvraag',
  title: 'Waterstofscan · opbrengstanalyse voor OWE-aanvragen · mijnwindpark.nl',
  description: 'Voor ontwikkelaars van elektrolyseprojecten op Nederlandse wind op land en hun subsidieadviseurs: de verwachte waterstofproductie per kalenderjaar, onderbouwd in een rekenrapport en een narekenbare Excel.',
  // Wie levert en factureert. Zolang dit null is, toont de pagina geen bedrijfsgegevens. Vul vóór livegang in, bijvoorbeeld:
  // {naam: 'Bedrijf B.V.', kvk: '12345678', adres: 'Straat 1, 1234 AB Plaats', email: 'scan@voorbeeld.nl', telefoon: '+31 …'}
  provider: null,
  // Conceptfase: niet indexeren (noindex op de pagina, robots.txt sluit alles af). Zet op true zodra de site geen concept meer is.
  indexable: false,
  packages: [
    {id: 'opbrengst', name: 'Opbrengstberekening', price: '€ 12.000', fit: 'Je hebt een voorkeursmodel en hebt de opbrengstberekening voor je dossier nodig.', items: [
      'Aanbodprofiel van je windpark per tien minuten, op historische windjaren',
      'Verwachte waterstofproductie per kalenderjaar van de exploitatieperiode',
      'Onderbouwing van omzettingsrendement, beschikbaarheid en degradatie',
      'Eén elektrolyser in maximaal drie configuraties',
      'Rekenrapport en Excel met formules',
    ]},
    {id: 'keuze', name: 'Opbrengst + leverancierskeuze', price: '€ 22.000', fit: 'Je shortlist staat nog open en je wilt onderbouwd kiezen vóór je offertes opvraagt.', featured: true, items: [
      'Alles uit de Opbrengstberekening',
      'Maximaal zes elektrolysers vergeleken op dezelfde stroominvoer',
      'Dimensionering van vermogen en aantal modules',
      'Kostprijs per kilo, met het effect van de belangrijkste kostenaannames',
      'Open vragen per leverancier, voor je offerteaanvraag',
      'Bespreking van de vergelijking',
    ]},
  ],
};

const SCAN_FACTS = [
  ['Vaste prijs', `vanaf ${SCAN.packages[0].price} excl. btw per projectlocatie`],
  ['Per tien minuten', 'gerekend op historische windjaren'],
  ['Narekenbaar', 'Excel met formules en een bron per aanname'],
  ['Leveranciersneutraal', 'modellen van verschillende fabrikanten op dezelfde stroominvoer'],
];
const SCAN_STAKES = [
  ['Je subsidieplafond', 'Het maximale exploitatiesubsidiebedrag is de geraamde productie over de subsidieperiode, maal het verschil tussen je productieprijs en de ondergrens van het correctiebedrag.'],
  ['De toets van € 9 per kilo', 'Het aangevraagde subsidiebedrag per kilo mag niet hoger zijn dan € 9. De investeringssubsidie wordt daarvoor over je geraamde kilo’s verdeeld: minder kilo’s geeft een hoger bedrag per kilo.'],
  ['Je jaarlijkse norm', 'Per kalenderjaar ontvang je exploitatiesubsidie tot hooguit de gemiddelde jaarproductie uit je aanvraag. Een tekort schuift door naar volgende jaren, een overschot tot hooguit 25 %.'],
];
const SCAN_REQUIREMENTS = [
  ['Verwachte productie volledig en niet-volledig hernieuwbare waterstof', 'Bij een directe lijn rekenen we uitsluitend met het aanbod van het gekoppelde park. Bij een netaansluiting met PPA leveren we het aanbod- en afnameprofiel per tien minuten als basis voor je onderbouwing. De toets aan de gedelegeerde verordeningen leg je vast met je adviseur.'],
  ['Opbrengst per kalenderjaar', 'Verwachte productie per kalenderjaar van de exploitatieperiode, opgebouwd uit historische windjaren en de degradatie van de stacks. Desgewenst ook voor de jaren daarna, als de installatie langer meegaat.'],
  ['Energetisch omzettingsrendement', 'Systeemverbruik in kWh per kilo aan het begin van de levensduur, bij vollast en deellast en inclusief randvoorzieningen, met per waarde de bron: datasheet of benoemde aanname.'],
  ['Beschikbaarheid van de installatie', 'Gepland onderhoud, storingen en stilstand bij stackwissels, per module gerekend en uitgedrukt in uren per jaar.'],
  ['Beschikbaarheid van duurzame elektriciteit', 'Het aanbod van je windpark per tien minuten uit KNMI-windmetingen en de vermogenscurve van je turbines, en welk deel de elektrolyser kan opnemen: wat onder de minimumlast valt en wat boven het maximum.'],
  ['Verwachte degradatie', 'Meerverbruik per kilo door veroudering van de stacks en vervanging na de opgegeven levensduur, met de aanname erbij.'],
];
const SCAN_DELIVERABLES = [
  ['Rekenrapport', 'Om toe te voegen aan je haalbaarheidsstudie.', [
    'Samenvatting met de jaartabel',
    'Uitgangspunten: locatie, windpark, aansluiting en elektrolyser',
    'Windaanbod en benutting door de elektrolyser',
    'Rendement, beschikbaarheid en degradatie',
    'Productie per kalenderjaar en de spreiding tussen windjaren',
    'Gevoeligheden, bronnen en aannames',
  ]],
  ['Excel met formules', 'Voor je adviseur, beoordelaar of financier.', [
    'Elke uitkomst is een formule die naar de invoer verwijst',
    'Per invoerwaarde de status: datasheet, afgeleid of aanname',
    'Een aanname vervangen toont direct het effect',
    'Controleblad dat aansluit op de cijfers in het rapport',
  ]],
];
const SCAN_STEPS = [
  ['Kennismaking', 'Een vrijblijvend gesprek over je project, je stroomaansluiting en de deadline van je aanvraag.'],
  ['Offerte', 'We leggen pakket, scope, benodigde gegevens en opleverdatum schriftelijk vast.'],
  ['Doorrekenen', 'We bouwen het aanbodprofiel van je park en rekenen de elektrolyser per tien minuten door, met elke aanname benoemd.'],
  ['Oplevering', 'Je ontvangt rapport en Excel, met een toelichting voor jou of je subsidieadviseur.'],
];
const SCAN_INPUTS = [
  'Locatie van de elektrolyser en van het windpark waarvan je stroom betrekt',
  'Turbinetype, aantal, ashoogte en de vermogenscurve of het datasheet',
  'Je aandeel in het park: directe lijn, contractvermogen of PPA-volume',
  'Het beoogde elektrolysevermogen en de modellen of offertes die in beeld zijn',
  'De beoogde start en looptijd van de exploitatie',
  'Als je die hebt: productiedata van het park en de transportindicatie',
];
const SCAN_METHOD = [
  'Windmetingen van KNMI-stations bij je park, per tien minuten, vertaald naar ashoogte.',
  'De vermogenscurve van je turbines en jouw aandeel in het park of het contractvolume.',
  'Per module: minimumlast, deellast, opstarten, stand-by, onderhoud, storingen en stackwissels.',
  'Meerdere historische windjaren, zodat je de spreiding tussen goede en slechte jaren ziet.',
  'Per waarde de status: uit een datasheet, afgeleid met een vaste regel, of een benoemde aanname.',
];
const SCAN_SCOPE = [
  'De haalbaarheidsstudie zelf: investeringsbegroting, mijlpalen, financiering, afzet en exploitatieberekening.',
  'De formele toets aan de RFNBO-regels en de certificering van je waterstof.',
  'Een P50/P90-windstudie voor financiers. De spreiding tussen windjaren is geen betrouwbaarheidsinterval.',
  'Garanties of financieel advies. De uitkomst is een berekening met benoemde aannames.',
];
const SCAN_FAQ = [
  ['Wie stelt mijn haalbaarheidsstudie op?', 'Jij of je subsidieadviseur. De studie bevat ook de investeringsbegroting, mijlpalen, financiering, afzet en de exploitatieberekening. De Waterstofscan levert de technische onderbouwing van de opbrengstberekening, in een vorm die je adviseur kan overnemen.'],
  ['Kan ik de cijfers overnemen in het RVO-model?', 'De jaartabel volgt wat RVO vraagt: de verwachte kilo’s per kalenderjaar over de exploitatieperiode, met rendement, beschikbaarheid en degradatie als aparte onderbouwing. Het invullen van het RVO-model en de keuze van je productieprijs blijven bij jou of je adviseur.'],
  ['Hoe gaan jullie om met volledig en niet-volledig hernieuwbare waterstof?', 'Bij een directe lijn rekenen we alleen met het aanbod van het gekoppelde park. Bij een netaansluiting met PPA leveren we het profiel per tien minuten waarmee je gelijktijdigheid en volume kunt onderbouwen. De toets aan de gedelegeerde verordeningen en de certificering doe je met je adviseur en een certificerende instantie.'],
  ['Leveren jullie een P90?', 'Nee. We tonen de uitkomst per historisch windjaar, de spreiding daartussen en het effect van de belangrijkste aannames. Vraagt je financier om een P90-windstudie, bespreek dan in de kennismaking hoe die aansluit op de analyse.'],
  ['Welke elektrolysers kunnen jullie doorrekenen?', 'Modellen uit een leveranciersneutrale catalogus van datasheetgegevens, van PEM tot alkalisch, en het model uit je offerte. Ontbreekt een waarde in de datasheet, dan rekenen we met een benoemde aanname en nemen we die op als vraag aan de leverancier.'],
  ['Past dit ook bij zon of een waterstofhub?', 'De scan is gericht op elektrolyse met stroom uit Nederlandse wind op land. Werk je met zon, een combinatie of aan een lokale waterstofhub, dan bekijken we in de kennismaking of en hoe we je situatie kunnen doorrekenen.'],
  ['Is de uitkomst een garantie?', 'Nee. Het is een berekening met benoemde aannames, geen garantie of financieel advies. Omdat elke aanname in het rapport en de Excel staat, kun je haar vervangen door je eigen waarde.'],
];
const SCAN_NEXT = [
  'We reageren per e-mail en plannen een kennismaking.',
  'We bespreken je project, je gegevens en je deadline.',
  'Je ontvangt een offerte met scope en opleverdatum.',
];
const SCAN_PLANS = [['onbekend', 'Weet ik nog niet'], ...SCAN.packages.map(({id, name}) => [id, name])];
const SCAN_SOURCES = {
  handleiding: 'https://www.rvo.nl/sites/default/files/2024-08/Handleiding_haalbaarheidsstudie_OWE_2024_0.pdf',
  owe: 'https://www.rvo.nl/subsidies-financiering/owe',
  owe3: 'https://www.internetconsultatie.nl/owe3/b1',
};

const scanEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const SCAN_STYLE = `
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#EFECE6;color:#0C2340;font-family:'TASA Orbiter','Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.6}
a{color:inherit}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #00A6DE;outline-offset:3px}
.wrap{max-width:1160px;margin:0 auto;padding:0 20px}
.hero{background:#C3E4F2;border-radius:0 48px 0 0;margin:28px 0 0;padding:44px 40px 36px}
.eyebrow{display:inline-block;border-left:4px solid #00A6DE;padding-left:10px;font-size:13px;font-weight:700;letter-spacing:1.2px}
h1{font-size:clamp(32px,5vw,56px);line-height:1.08;letter-spacing:-1.3px;font-weight:500;margin:16px 0 18px;max-width:880px;overflow-wrap:break-word}.nowrap{white-space:nowrap}
.lead{font-size:18px;max-width:780px;margin:0 0 26px}
.cta{display:flex;flex-wrap:wrap;gap:14px 22px;align-items:center}
.button{display:inline-flex;align-items:center;gap:10px;min-height:50px;padding:12px 22px;background:#0C2340;color:#fff;border:1px solid #0C2340;border-radius:0 14px 0 0;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}.button:hover{background:#193a5d}
.link{font-weight:600;border-bottom:1px solid #0C2340;text-decoration:none;padding-bottom:3px}
.facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:34px 0 0}.facts div{background:#fff;border:1px solid #0C2340;border-radius:0 18px 0 0;padding:14px 16px}.facts dt{font-weight:700}.facts dd{margin:2px 0 0;font-size:14px;color:#465970}
section{margin:64px 0 0;scroll-margin-top:16px}#prijzen{margin-top:48px}
h2{font-size:clamp(26px,3.4vw,38px);line-height:1.15;font-weight:500;letter-spacing:-.8px;margin:0 0 12px;max-width:860px}h3{line-height:1.3}
.intro{max-width:780px;color:#465970;margin:0 0 24px}
.note{font-size:13px;color:#465970;margin:12px 0 0;max-width:860px}
.plans{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.plan{display:flex;flex-direction:column;align-items:flex-start;background:#fff;border:1px solid #0C2340;border-radius:0 28px 0 0;padding:26px}.plan.featured{background:#0C2340;color:#fff}.plan h3{margin:0;font-size:22px;font-weight:600}.price{font-size:38px;font-weight:500;letter-spacing:-1px;margin:4px 0 8px}.price small{font-size:14px;letter-spacing:0;font-weight:400}.plan .fit{margin:0 0 12px}.plan ul{margin:0 0 22px;padding-left:20px}.plan li{margin:4px 0}.plan .button{margin-top:auto}.plan.featured .button{background:#00A6DE;border-color:#00A6DE;color:#0C2340}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.card{background:#fff;border:1px solid #a7b4bf;border-top:4px solid #00A6DE;border-radius:0 22px 0 0;padding:20px 22px}.card h3{margin:0 0 6px;font-size:19px;font-weight:600}.card p{margin:0;color:#465970}
.conclusion{font-weight:600;max-width:860px;margin:20px 0 0}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #a7b4bf}th,td{text-align:left;vertical-align:top;padding:14px 18px;border-top:1px solid #e1e6ea}thead th{background:#C3E4F2;font-size:13px;letter-spacing:.6px;text-transform:uppercase;border-bottom:1px solid #0C2340}tbody th{font-weight:600;width:36%}td{color:#334a63}
.split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.panel{background:#fff;border:1px solid #a7b4bf;border-radius:0 24px 0 0;padding:24px 26px}.panel h3{margin:0 0 4px;font-size:20px;font-weight:600}.panel .sub{margin:0 0 12px;color:#465970}.panel ul{margin:0;padding-left:20px}.panel li{margin:6px 0}
.panel.dark{background:#0C2340;color:#fff;border-color:#0C2340}.panel.dark .sub{color:#d2e2ec}
.steps{counter-reset:s;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;list-style:none;margin:0 0 26px;padding:0}.steps li{border-top:3px solid #00A6DE;padding-top:12px}.steps li::before{counter-increment:s;content:counter(s);display:inline-grid;place-items:center;width:30px;height:30px;background:#0C2340;color:#fff;font-weight:700;border-radius:0 9px 0 0;margin-bottom:8px}.steps h3{margin:0 0 4px;font-size:18px}.steps p{margin:0;color:#465970}
.when{background:#0C2340;color:#fff;border-radius:0 32px 0 0;padding:30px 32px}.when h2{color:#fff}.when p{margin:0 0 10px;color:#d2e2ec;max-width:820px}.when a{color:#7ad0ed}.when .note{color:#b5c8d6;margin:0}
details{background:#fff;border:1px solid #a7b4bf;border-radius:0 16px 0 0;padding:14px 18px;margin:0 0 10px}summary{cursor:pointer;font-weight:600}details p{margin:10px 0 0;color:#465970;max-width:860px}
.contact{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:24px;align-items:start}
form{background:#fff;border:1px solid #0C2340;border-radius:0 28px 0 0;padding:28px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 20px}
label{display:block;font-size:14px;font-weight:600}input,select,textarea{display:block;width:100%;margin-top:6px;padding:11px 12px;border:1px solid #788b9f;border-radius:0 8px 0 0;background:#fff;color:#0C2340;font:inherit;font-size:16px}textarea{min-height:110px;resize:vertical}
.full{grid-column:1/-1}.check{display:flex;gap:10px;align-items:flex-start;font-weight:400}.check input{width:auto;margin-top:5px}
.trap{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.error{grid-column:1/-1;margin:0;padding:12px 14px;border-left:4px solid #a32c22;background:#fff3f0;color:#84251e}
.thanks{background:#fff;border:1px solid #0C2340;border-left:6px solid #4E7A3A;border-radius:0 28px 0 0;padding:26px}.thanks h3{margin:0 0 6px;font-size:22px;font-weight:500}.thanks p{margin:0}
.next{background:#C3E4F2;border-radius:0 24px 0 0;padding:22px 24px}.next h3{margin:0 0 8px;font-size:18px}.next ol{margin:0;padding-left:20px}.next li{margin:6px 0}.next p{margin:12px 0 0;font-size:14px}
.onpage{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:18px 0 0;padding:6px 8px;background:#fff;border:1px solid #a7b4bf;border-radius:0 16px 0 0;font-size:14px}.onpage span{padding:0 8px 0 6px;font-weight:700}.onpage a{padding:5px 10px;text-decoration:none;border-radius:0 8px 0 0}.onpage a:hover{background:#C3E4F2}
.tip{margin:14px 0 0;padding:10px 14px;background:#C3E4F2;border-left:4px solid #00A6DE}.tip a{font-weight:600}
@media(min-width:961px){.onpage{position:sticky;top:0;z-index:3;box-shadow:0 6px 14px rgba(12,35,64,.08)}section{scroll-margin-top:72px}}
@media(max-width:960px){.facts{grid-template-columns:repeat(2,minmax(0,1fr))}.steps{grid-template-columns:repeat(2,minmax(0,1fr))}.cards{grid-template-columns:1fr}.contact{grid-template-columns:1fr}}
@media(max-width:640px){.onpage{flex-wrap:nowrap;overflow-x:auto;white-space:nowrap}.hero{padding:28px 22px;border-radius:0 32px 0 0}.lead{font-size:16px}.facts,.plans,.split,.steps,form{grid-template-columns:1fr}.plan,.panel,form,.when{padding:20px}.plan h3{overflow-wrap:break-word;max-width:100%}
table,tbody,tr,th,td{display:block;width:100%}thead{display:none}tr{border-top:1px solid #0C2340}tbody th{width:100%;border:0;padding:14px 16px 2px}td{border:0;padding:4px 16px 14px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`;

function scanOptions(list, chosen) { return list.map(([value, label]) => `<option value="${value}"${value === chosen ? ' selected' : ''}>${scanEsc(label)}</option>`).join(''); }
const scanList = items => items.map(i => `<li>${scanEsc(i)}</li>`).join('');
const scanMail = p => p?.email ? `<a href="mailto:${scanEsc(p.email)}">${scanEsc(p.email)}</a>` : '';
function scanProviderLine(p) {
  if (!p?.naam) return '';
  const parts = [scanEsc(p.naam), p.kvk ? `KvK ${scanEsc(p.kvk)}` : '', scanEsc(p.adres), scanMail(p), scanEsc(p.telefoon)].filter(Boolean);
  return `<p>Uitgevoerd door ${parts.join(' · ')}</p>`;
}

// Wat de lokale navigatie 'Op deze pagina' toont.
const SCAN_SECTIONS = [['prijzen', 'Pakketten'], ['rvo', 'RVO-eisen'], ['oplevering', 'Wat je ontvangt'], ['werkwijze', 'Werkwijze'], ['vragen', 'Vragen'], ['aanvraag', 'Aanvragen']];

export function scanPage({sent = false, errors = [], values = {}, font = '', provider = SCAN.provider, links = publicLinks('https://mijnwindpark.nl' + SCAN_PATH)} = {}) {
  const v = values;
  const form = sent
    ? `<div class="thanks" role="status"><h3>Je bericht is binnen</h3><p>We nemen per e-mail contact met je op om een vrijblijvende kennismaking te plannen. Houd je planning en de gegevens van je windpark en elektrolyser bij de hand.</p></div>`
    : `<form method="post" action="${SCAN_PATH}#aanvraag" novalidate>
${errors.length ? `<p class="error" role="alert">${errors.map(scanEsc).join(' ')}</p>` : ''}
<label>Naam *<input name="naam" required maxlength="120" autocomplete="name" value="${scanEsc(v.naam)}"></label>
<label>Organisatie *<input name="organisatie" required maxlength="160" autocomplete="organization" value="${scanEsc(v.organisatie)}"></label>
<label>Zakelijk e-mailadres *<input name="email" type="email" required maxlength="200" autocomplete="email" value="${scanEsc(v.email)}"></label>
<label>Pakket<select name="pakket">${scanOptions(SCAN_PLANS, v.pakket || 'onbekend')}</select></label>
${v.locatie ? `<p class="full from-atlas"><strong>Locatie uit de Atlas</strong><br>${scanEsc(v.locatie)}${v.vermogen ? ` · ${scanEsc(v.vermogen)} MW windvermogen` : ''}</p>` : ''}
<input type="hidden" name="bron" value="${scanEsc(v.bron || 'direct')}"><input type="hidden" name="locatie" value="${scanEsc(v.locatie)}"><input type="hidden" name="vermogen" value="${scanEsc(v.vermogen)}">
<label class="full">Deadline of toelichting (optioneel)<textarea name="toelichting" maxlength="2000" placeholder="Bijvoorbeeld: de aanvraagronde, het beoogde vermogen of de modellen die in beeld zijn">${scanEsc(v.toelichting)}</textarea></label>
<div class="trap" aria-hidden="true"><label>Laat dit veld leeg<input name="website" tabindex="-1" autocomplete="off"></label></div>
<label class="full check"><input type="checkbox" name="toestemming" value="ja" required${v.toestemming ? ' checked' : ''}><span>Je mag mijn gegevens gebruiken om contact met me op te nemen over dit project. *</span></label>
<div class="full"><button class="button" type="submit">Verstuur bericht</button></div>
</form>`;
  const featured = p => p.featured ? ' featured' : '';
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${scanEsc(SCAN.title)}</title><meta name="description" content="${scanEsc(SCAN.description)}">
<meta property="og:title" content="${scanEsc(SCAN.headline)} · Waterstofscan"><meta property="og:description" content="${scanEsc(SCAN.description)}"><meta property="og:type" content="website">
<link rel="canonical" href="https://mijnwindpark.nl${SCAN_PATH}">
<link rel="icon" href="/favicon.svg"><style>${font ? `@font-face{font-family:'TASA Orbiter';src:url(data:font/ttf;base64,${font}) format('truetype');font-weight:400 800;font-display:swap}` : ''}${SCAN_STYLE}${PUBLIC_STYLE}.from-atlas{margin:0;padding:10px 14px;background:#C3E4F2;border-left:4px solid #00A6DE}</style></head><body>
${publicHeader(links, {current: 'waterstofscan', contactHref: '#aanvraag'})}
<main class="wrap" id="inhoud">
<nav class="onpage" aria-label="Op deze pagina"><span>Op deze pagina</span>${SCAN_SECTIONS.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav>
<div class="hero"><span class="eyebrow">WATERSTOFSCAN · ELEKTROLYSE OP WIND OP LAND</span>
<h1>${scanEsc(SCAN.headline).replace(/(\S+-\S+)/g, '<span class="nowrap">$1</span>')}</h1>
<p class="lead">Voor ontwikkelaars van elektrolyseprojecten op Nederlandse wind op land en de subsidieadviseurs die hun dossier opstellen. Je krijgt de verwachte waterstofproductie per kalenderjaar, met de onderbouwing van rendement, beschikbaarheid en degradatie, in een rekenrapport en een Excel die je adviseur, beoordelaar en financier kunnen narekenen.</p>
<div class="cta"><a class="button" href="#aanvraag">Bespreek je project</a><a class="link" href="#prijzen">Bekijk de pakketten</a></div>
<dl class="facts">${SCAN_FACTS.map(([a, b]) => `<div><dt>${scanEsc(a)}</dt><dd>${scanEsc(b)}</dd></div>`).join('')}</dl></div>

<section id="prijzen" aria-labelledby="price-title"><h2 id="price-title">Twee pakketten, vaste prijs</h2>
<p class="intro">Per projectlocatie, exclusief btw. Scope, benodigde gegevens en opleverdatum leggen we vast in de offerte; de levertijd gaat in zodra je projectgegevens compleet zijn.</p>
<div class="plans">${SCAN.packages.map(p => `<article class="plan${featured(p)}"><h3>${scanEsc(p.name)}</h3><p class="price">${scanEsc(p.price)} <small>excl. btw</small></p><p class="fit">${scanEsc(p.fit)}</p><ul>${scanList(p.items)}</ul><a class="button" href="${SCAN_PATH}?pakket=${p.id}#aanvraag" aria-label="Bespreek dit pakket (${scanEsc(p.name)})">Bespreek dit pakket</a></article>`).join('')}</div></section>

<section id="waarom" aria-labelledby="stakes-title"><h2 id="stakes-title">Waarom je productieraming zwaar weegt</h2>
<p class="intro">In de OWE-regeling is de verwachte productie volledig hernieuwbare waterstof geen bijlage, maar de rekenbasis van je subsidie.</p>
<div class="cards">${SCAN_STAKES.map(([a, b]) => `<div class="card"><h3>${scanEsc(a)}</h3><p>${scanEsc(b)}</p></div>`).join('')}</div>
<p class="conclusion">Een te hoge raming haal je in de praktijk niet; een te lage laat productie zonder subsidie. Daarom willen adviseurs en beoordelaars zien hoe de raming tot stand komt.</p>
<p class="note">Bron: de OWE-regeling en het concept voor de derde ronde (<a href="${SCAN_SOURCES.owe3}" rel="noopener noreferrer">internetconsultatie OWE 3</a>, mei–juni 2026). De definitieve voorwaarden van de volgende ronde kunnen afwijken.</p></section>

<section id="rvo" aria-labelledby="rvo-title"><h2 id="rvo-title">Wat RVO vraagt, en wat je van ons krijgt</h2>
<p class="intro">De haalbaarheidsstudie bij een OWE-aanvraag moet een waterstofopbrengstberekening bevatten. Ontbreekt een verplicht onderdeel, dan is je aanvraag niet volledig. Dit leveren we per onderdeel.</p>
<table><thead><tr><th scope="col">RVO vraagt</th><th scope="col">De Waterstofscan levert</th></tr></thead><tbody>${SCAN_REQUIREMENTS.map(([a, b]) => `<tr><th scope="row">${scanEsc(a)}</th><td>${scanEsc(b)}</td></tr>`).join('')}</tbody></table>
<p class="note">Bron: <a href="${SCAN_SOURCES.handleiding}" rel="noopener noreferrer">RVO, Handleiding haalbaarheidsstudie OWE 2024</a>, hoofdstuk 2. Het concept voor OWE 3 vraagt dezelfde onderdelen. Controleer de handleiding van de ronde waarin je aanvraagt.</p></section>

<section id="oplevering" aria-labelledby="deliver-title"><h2 id="deliver-title">Wat je ontvangt</h2>
<div class="split">${SCAN_DELIVERABLES.map(([a, b, items], i) => `<div class="panel${i ? ' dark' : ''}"><h3>${scanEsc(a)}</h3><p class="sub">${scanEsc(b)}</p><ul>${scanList(items)}</ul></div>`).join('')}</div></section>

<section id="werkwijze" aria-labelledby="how-title"><h2 id="how-title">Werkwijze</h2>
<ol class="steps">${SCAN_STEPS.map(([a, b]) => `<li><h3>${scanEsc(a)}</h3><p>${scanEsc(b)}</p></li>`).join('')}</ol>
<div class="panel"><h3>Wat we van je nodig hebben</h3><p class="sub">Heb je nog niet alles? Dan bespreken we in de kennismaking welke aannames we tijdelijk gebruiken.</p><ul>${scanList(SCAN_INPUTS)}</ul>
<p class="tip">Nog geen locatie gekozen? <a href="${scanEsc(links.href('atlas', '/'))}">Kies op de gratis kaart een perceel</a> en de windparken eromheen; die keuze gaat mee in je aanvraag.</p></div></section>

<section id="methode" aria-labelledby="method-title"><h2 id="method-title">Methode en afbakening</h2>
<div class="split"><div class="panel"><h3>Hoe we rekenen</h3><ul>${scanList(SCAN_METHOD)}</ul></div><div class="panel"><h3>Wat buiten de scan valt</h3><ul>${scanList(SCAN_SCOPE)}</ul></div></div></section>

<section class="when" aria-labelledby="when-title"><h2 id="when-title">Begin vóór de publicatie van de regeling</h2>
<p>Volgens RVO opent de aanvraagperiode van de volgende OWE-ronde zes weken na publicatie van de regeling in de Staatscourant, en staat die dan twee weken open. Wie pas na de publicatie begint, heeft weinig tijd voor de rest van het dossier.</p>
<p class="note">Bekijk de actuele planning op <a href="${SCAN_SOURCES.owe}" rel="noopener noreferrer">rvo.nl/owe</a>.</p></section>

<section id="vragen" aria-labelledby="faq-title"><h2 id="faq-title">Veelgestelde vragen</h2>${SCAN_FAQ.map(([q, a]) => `<details><summary>${scanEsc(q)}</summary><p>${scanEsc(a)}</p></details>`).join('')}</section>

<section id="aanvraag" aria-labelledby="form-title"><h2 id="form-title">Bespreek je project</h2>
${sent ? '' : `<p class="intro">Laat je gegevens achter voor een vrijblijvende kennismaking. Velden met * zijn verplicht.${provider?.email ? ` Liever direct contact? Mail naar ${scanMail(provider)}.` : ''}</p>`}
<div class="contact">${form}<aside class="next" aria-labelledby="next-title"><h3 id="next-title">Wat gebeurt er daarna?</h3><ol>${scanList(SCAN_NEXT)}</ol><p>Je zit nergens aan vast tot je de offerte accepteert.</p></aside></div></section>
</main>
${publicFooter(links, {extra: scanProviderLine(provider), contactHref: '#aanvraag'})}
</body></html>`;
}
