// Openbare verkooppagina /waterstofscan: het ene product dat we verkopen, zonder wachtwoord te bekijken,
// met een aanvraagformulier. Server-side HTML zonder scripts; de worker serveert hem vóór de sitepoort.
// De inhoud staat in SCAN; prijzen en teksten pas je hier aan. Zie docs/sales/waterstofscan.md.
export const SCAN_PATH = '/waterstofscan';

export const SCAN = {
  title: 'Waterstofscan · opbrengstberekening voor je OWE-aanvraag · mijnwindpark.nl',
  description: 'De waterstofopbrengst van je elektrolyseproject, per tien minuten doorgerekend op vier echte windjaren. Rapport en Excel met formules voor je OWE-aanvraag. Vaste prijs.',
  packages: [
    {id: 'opbrengst', name: 'Opbrengstberekening', price: '€ 7.500', weeks: '2 weken', items: [
      'Aanbodprofiel van je windpark per tien minuten, vier windjaren',
      'Waterstofopbrengst per kalenderjaar en gemiddeld',
      'Rendement, beschikbaarheid en degradatie onderbouwd',
      'Eén elektrolyser in maximaal drie configuraties',
      'Rekenrapport en Excel met formules',
    ]},
    {id: 'keuze', name: 'Opbrengst + keuze', price: '€ 14.500', weeks: '3 weken', featured: true, items: [
      'Alles uit de Opbrengstberekening',
      'Tot zes elektrolysers op dezelfde wind vergeleken',
      'Aantal modules en vermogen gedimensioneerd',
      'Kostprijs per kg met gevoeligheid (elke kostenpost ±25 %)',
      'Open vragen per leverancier en een bespreking van anderhalf uur',
    ]},
  ],
};

const SCAN_ROWS = [
  ['De verwachte hoeveelheid volledig hernieuwbare waterstof', 'Kilo’s per jaar, alleen uit het aanbod van je park (directe lijn); netstroom apart.'],
  ['De opbrengst per kalenderjaar', 'Per windjaar 2022–2025 en het gemiddelde, omgerekend naar een volledig jaar.'],
  ['Het energetische omzettingsrendement', 'Systeemverbruik in kWh/kg per model, met deellast en randvoorzieningen.'],
  ['De beschikbaarheid van de installatie', 'Onderhoud, storingen en stackwissels, per module gesimuleerd.'],
  ['De beschikbaarheid van duurzame elektriciteit', 'Het aanbod van je park per tien minuten, uit KNMI-wind en de turbinecurve, of uit je eigen meetdata.'],
  ['De verwachte degradatie van de elektrolysers', 'Meerverbruik per kilo over de looptijd, met de aanname erbij.'],
];
const SCAN_DELIVER = [
  ['Opbrengst per windjaar', 'Kilo’s waterstof, vollasturen en hoeveel van het aanbod je benut, per jaar en gemiddeld.'],
  ['Dimensionering', 'Vermogen en aantal modules, en wat er blijft liggen onder de minimumlast en boven het maximum.'],
  ['Leverancierskeuze', 'Elektrolysers uit een leveranciersneutrale catalogus van 64 modellen, met per gegeven of het uit de datasheet komt of een aanname is.'],
  ['Kostprijs en gevoeligheid', 'Kostprijs per kilo (LCOH) en welke aanname de uitkomst het sterkst verschuift.'],
  ['Rapport en Excel', 'Een rekenrapport en een Excel waarin elke berekening een echte formule is: na te rekenen door RVO, bank of adviseur.'],
  ['Vragen voor leveranciers', 'Wat in de datasheets nog onduidelijk is, als concrete vragen per leverancier.'],
];
const SCAN_STEPS = [
  ['Intake', 'Een half uur: locatie, windpark, je aandeel of contractvermogen, doelvermogen en de technologie die je overweegt.'],
  ['Aanbod', 'We bouwen het tienminutenprofiel van je park op vier echte windjaren, en ijken het op je meetdata als je die hebt.'],
  ['Doorrekenen', 'Alle opties op dezelfde wind en dezelfde aannames: waterstof, starts, benutting en kosten.'],
  ['Oplevering', 'Rapport, Excel en een bespreking. Je voegt de berekening toe aan je haalbaarheidsstudie.'],
];
const SCAN_FAQ = [
  ['Is dit een complete haalbaarheidsstudie?', 'Nee. We leveren de waterstofopbrengstberekening en de onderbouwing van vermogen, rendement en kostprijs. De investeringsbegroting, mijlpalen, afzet en financiering maak je zelf of met je adviseur; onze cijfers sluiten daarop aan.'],
  ['Werkt het voor mijn locatie?', 'Voor windparken op land in Nederland: ja. We gebruiken de KNMI-stations in de buurt, de ashoogte en de turbinecurve van je park. Meetdata van je park maken het nauwkeuriger. Zon of wind op zee? Vraag ernaar: dat rekenen we nu nog niet standaard.'],
  ['Welke elektrolysers kunnen jullie doorrekenen?', '64 modellen van 26 fabrikanten (PEM, alkalisch, drukalkalisch, AEM, SOEC en meer). Heb je al een offerte, dan rekenen we die mee.'],
  ['Wat moet ik aanleveren?', 'De locatie, het windpark en de turbines, je aandeel of contractvermogen, het gewenste vermogen en, als je die hebt, meetdata en offertes.'],
  ['Is de uitkomst een garantie?', 'Nee. Het is een berekening met benoemde aannames, geen garantie of financieel advies. Elke aanname staat in het rapport, zodat je haar kunt vervangen.'],
];
export const SCAN_PLANS = [['opbrengst', 'Opbrengstberekening'], ['keuze', 'Opbrengst + keuze'], ['onbekend', 'Weet ik nog niet']];
export const SCAN_ROUNDS = [['owe', 'Een OWE-ronde'], ['hubs', 'De regeling voor waterstofhubs'], ['anders', 'Anders of nog niet bekend']];

const scanEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const SCAN_STYLE = `
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#EFECE6;color:#0C2340;font-family:'TASA Orbiter','Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.6}
a{color:inherit}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #00A6DE;outline-offset:3px}
.wrap{max-width:1160px;margin:0 auto;padding:0 20px}
header{background:#0C2340;color:#fff;border-radius:0 0 32px 0}header .wrap{display:flex;justify-content:space-between;align-items:center;min-height:76px;gap:16px}
.brand{font-size:24px;font-weight:700;letter-spacing:-.6px;text-decoration:none}.brand span{color:#7ad0ed}header nav{display:flex;gap:18px;align-items:center;font-size:14px}header nav a{text-decoration:none}header nav a:hover{text-decoration:underline}
.hero{background:#C3E4F2;border-radius:0 48px 0 0;margin:28px 0 0;padding:44px 40px}
.eyebrow{display:inline-block;border-left:4px solid #00A6DE;padding-left:10px;font-size:12px;font-weight:700;letter-spacing:1.2px}
h1{font-size:clamp(34px,5vw,60px);line-height:1.05;letter-spacing:-1.5px;font-weight:500;margin:18px 0 18px;max-width:900px}
.lead{font-size:18px;max-width:760px;margin:0 0 26px}
.cta{display:flex;flex-wrap:wrap;gap:14px 22px;align-items:center}
.button{display:inline-flex;align-items:center;gap:10px;min-height:50px;padding:12px 22px;background:#0C2340;color:#fff;border:1px solid #0C2340;border-radius:0 14px 0 0;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}.button:hover{background:#193a5d}
.link{font-weight:600;border-bottom:1px solid #0C2340;text-decoration:none;padding-bottom:3px}
.facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:34px 0 0;padding:0;list-style:none}.facts li{background:#fff;border:1px solid #0C2340;border-radius:0 18px 0 0;padding:14px 16px;font-size:14px}.facts strong{display:block;font-size:22px;font-weight:500;letter-spacing:-.4px}
section{margin:64px 0 0;scroll-margin-top:16px}h2{font-size:clamp(26px,3.4vw,38px);line-height:1.15;font-weight:500;letter-spacing:-.8px;margin:6px 0 12px;max-width:820px}.intro{max-width:760px;color:#465970;margin:0 0 22px}
.label{font-size:12px;font-weight:700;letter-spacing:1.2px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #a7b4bf}th,td{text-align:left;vertical-align:top;padding:14px 18px;border-top:1px solid #e1e6ea}th{background:#C3E4F2;font-size:12px;letter-spacing:.6px;text-transform:uppercase;border-bottom:1px solid #0C2340}td:first-child{font-weight:600;width:42%}
.note{font-size:13px;color:#465970;margin:10px 0 0}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.card{background:#fff;border:1px solid #a7b4bf;border-radius:0 24px 0 0;padding:20px 22px}.card h3{margin:0 0 6px;font-size:19px;font-weight:600}.card p{margin:0;color:#465970;font-size:15px}
.steps{counter-reset:s;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;list-style:none;margin:0;padding:0}.steps li{border-top:3px solid #00A6DE;padding-top:12px}.steps li::before{counter-increment:s;content:counter(s);display:inline-grid;place-items:center;width:32px;height:32px;background:#0C2340;color:#fff;font-weight:700;border-radius:0 9px 0 0;margin-bottom:8px}.steps h3{margin:0 0 4px;font-size:18px}.steps p{margin:0;font-size:15px;color:#465970}
.plans{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;max-width:900px}.plan{background:#fff;border:1px solid #0C2340;border-radius:0 28px 0 0;padding:26px}.plan.featured{background:#0C2340;color:#fff}.plan h3{margin:0;font-size:22px;font-weight:500}.price{font-size:38px;font-weight:500;letter-spacing:-1px;margin:8px 0 0}.price small{font-size:14px;letter-spacing:0;font-weight:400}.plan .meta{font-size:14px;opacity:.8;margin:0 0 14px}.plan ul{margin:0 0 20px;padding-left:18px}.plan li{margin:4px 0;font-size:15px}.plan.featured .button{background:#00A6DE;border-color:#00A6DE;color:#0C2340}
.when{background:#0C2340;color:#fff;border-radius:0 32px 0 0;padding:28px 30px}.when h2{color:#fff}.when p{margin:0 0 10px;color:#d2e2ec;max-width:820px}.when a{color:#7ad0ed}
details{background:#fff;border:1px solid #a7b4bf;border-radius:0 16px 0 0;padding:14px 18px;margin:0 0 10px}summary{cursor:pointer;font-weight:600}details p{margin:10px 0 0;color:#465970}
form{background:#fff;border:1px solid #0C2340;border-radius:0 28px 0 0;padding:28px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 20px;max-width:900px}
label{display:block;font-size:14px;font-weight:600}input,select,textarea{display:block;width:100%;margin-top:6px;padding:11px 12px;border:1px solid #788b9f;border-radius:0 8px 0 0;background:#fff;color:#0C2340;font:inherit;font-size:16px}textarea{min-height:110px;resize:vertical}
.full{grid-column:1/-1}.check{display:flex;gap:10px;align-items:flex-start;font-weight:400}.check input{width:auto;margin-top:5px}
.trap{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.ok,.error{grid-column:1/-1;margin:0;padding:12px 14px;border-left:4px solid}.ok{border-color:#4E7A3A;background:#eef5e9}.error{border-color:#a32c22;background:#fff3f0;color:#84251e}
.thanks{background:#fff;border:1px solid #0C2340;border-left:6px solid #4E7A3A;border-radius:0 28px 0 0;padding:26px;max-width:900px}.thanks h3{margin:0 0 6px;font-size:22px;font-weight:500}
footer{margin:64px 0 0;border-top:1px solid #0C2340;padding:22px 0 34px;font-size:13px;color:#465970}footer .wrap{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media(max-width:900px){.facts{grid-template-columns:repeat(2,minmax(0,1fr))}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.steps{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){.facts strong{font-size:18px;overflow-wrap:anywhere}.hero{padding:28px 22px;border-radius:0 32px 0 0}.lead{font-size:16px}.grid,.plans,form,.steps{grid-template-columns:1fr}form{padding:20px}table,tbody,tr,td{display:block;width:100%}thead{display:none}tr{border-top:1px solid #0C2340}td{border:0;padding:8px 16px}td:first-child{width:100%;padding-top:14px}header nav a:first-child{display:none}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`;

function scanOptions(list, chosen) { return list.map(([value, label]) => `<option value="${value}"${value === chosen ? ' selected' : ''}>${scanEsc(label)}</option>`).join(''); }

// sent: aanvraag ontvangen; errors: lijst met meldingen; values: eerder ingevulde waarden; font: base64 van TASA Orbiter.
export function scanPage({sent = false, errors = [], values = {}, font = ''} = {}) {
  const v = values;
  const form = sent
    ? `<div class="thanks" role="status"><h3>Bedankt, je aanvraag is binnen.</h3><p>We nemen snel contact met je op voor de intake. Heb je meetdata of offertes, houd die dan bij de hand.</p></div>`
    : `<form method="post" action="${SCAN_PATH}#aanvraag" novalidate>
${errors.length ? `<p class="error" role="alert">${errors.map(scanEsc).join(' ')}</p>` : ''}
<label>Naam *<input name="naam" required maxlength="120" autocomplete="name" value="${scanEsc(v.naam)}"></label>
<label>Organisatie *<input name="organisatie" required maxlength="160" autocomplete="organization" value="${scanEsc(v.organisatie)}"></label>
<label>E-mail *<input name="email" type="email" required maxlength="200" autocomplete="email" value="${scanEsc(v.email)}"></label>
<label>Telefoon<input name="telefoon" type="tel" maxlength="40" autocomplete="tel" value="${scanEsc(v.telefoon)}"></label>
<label>Pakket<select name="pakket">${scanOptions(SCAN_PLANS, v.pakket || 'onbekend')}</select></label>
<label>Voor welke aanvraag?<select name="ronde">${scanOptions(SCAN_ROUNDS, v.ronde || 'anders')}</select></label>
<label>Locatie of windpark<input name="locatie" maxlength="200" value="${scanEsc(v.locatie)}"></label>
<label>Gewenst elektrolysevermogen (MW)<input name="vermogen" inputmode="decimal" maxlength="20" value="${scanEsc(v.vermogen)}"></label>
<label class="full">Toelichting<textarea name="toelichting" maxlength="2000">${scanEsc(v.toelichting)}</textarea></label>
<div class="trap" aria-hidden="true"><label>Laat dit veld leeg<input name="website" tabindex="-1" autocomplete="off"></label></div>
<label class="full check"><input type="checkbox" name="toestemming" value="ja" required${v.toestemming ? ' checked' : ''}><span>Je mag mijn gegevens gebruiken om contact met me op te nemen over de waterstofscan. Ze worden nergens anders voor gebruikt en na hooguit twaalf maanden verwijderd. *</span></label>
<div class="full"><button class="button" type="submit">Verstuur aanvraag</button></div>
</form>`;
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${scanEsc(SCAN.title)}</title><meta name="description" content="${scanEsc(SCAN.description)}">
<meta property="og:title" content="Waterstofscan · opbrengstberekening voor je OWE-aanvraag"><meta property="og:description" content="${scanEsc(SCAN.description)}"><meta property="og:type" content="website">
<link rel="icon" href="/favicon.svg"><style>${font ? `@font-face{font-family:'TASA Orbiter';src:url(data:font/ttf;base64,${font}) format('truetype');font-weight:400 800;font-display:swap}` : ''}${SCAN_STYLE}</style></head><body>
<header><div class="wrap"><a class="brand" href="${SCAN_PATH}">mijnwindpark<span>.nl</span></a><nav aria-label="Pagina"><a href="#oplevering">Wat je krijgt</a><a href="#prijzen">Prijzen</a><a href="/inloggen">Inloggen</a></nav></div></header>
<main class="wrap" id="inhoud">
<div class="hero"><span class="eyebrow">WATERSTOFSCAN · VOOR OWE-AANVRAGEN EN WATERSTOFHUBS</span>
<h1>De waterstofopbrengst van je project, doorgerekend op echte wind.</h1>
<p class="lead">Voor een OWE-aanvraag moet je onderbouwen hoeveel hernieuwbare waterstof je installatie per jaar maakt: met rendement, beschikbaarheid, het aanbod van je park en degradatie. Wij rekenen dat per tien minuten door op vier echte windjaren, voor de elektrolysers die je overweegt. Je krijgt een rapport en een Excel met formules.</p>
<div class="cta"><a class="button" href="#aanvraag">Vraag een scan aan →</a><a class="link" href="#prijzen">Bekijk de prijzen</a></div>
<ul class="facts"><li><strong>4 windjaren</strong>per tien minuten, 2022–2025</li><li><strong>64 elektrolysers</strong>van 26 fabrikanten</li><li><strong>Excel</strong>met echte formules</li><li><strong>Vaste prijs</strong>klaar in 2 tot 3 weken</li></ul></div>

<section aria-labelledby="rvo-title"><span class="label">WAT RVO VRAAGT</span><h2 id="rvo-title">Alle zes onderdelen van de waterstofopbrengstberekening</h2>
<p class="intro">De haalbaarheidsstudie bij een OWE-aanvraag moet een opbrengstberekening bevatten. Ontbreekt een verplicht onderdeel, dan is je aanvraag niet volledig. Dit leveren wij per onderdeel.</p>
<table><thead><tr><th scope="col">RVO vraagt</th><th scope="col">Wij leveren</th></tr></thead><tbody>${SCAN_ROWS.map(([a, b]) => `<tr><td>${scanEsc(a)}</td><td>${scanEsc(b)}</td></tr>`).join('')}</tbody></table>
<p class="note">Bron: RVO, Handleiding haalbaarheidsstudie OWE 2024, hoofdstuk 2. Controleer de handleiding van de ronde waarin je aanvraagt.</p></section>

<section id="oplevering" aria-labelledby="deliver-title"><span class="label">WAT JE KRIJGT</span><h2 id="deliver-title">Een berekening die RVO, je bank en je adviseur kunnen narekenen</h2>
<div class="grid">${SCAN_DELIVER.map(([a, b]) => `<div class="card"><h3>${scanEsc(a)}</h3><p>${scanEsc(b)}</p></div>`).join('')}</div></section>

<section aria-labelledby="how-title"><span class="label">HOE HET WERKT</span><h2 id="how-title">In vier stappen van locatie naar opbrengst</h2>
<ol class="steps">${SCAN_STEPS.map(([a, b]) => `<li><h3>${scanEsc(a)}</h3><p>${scanEsc(b)}</p></li>`).join('')}</ol></section>

<section id="prijzen" aria-labelledby="price-title"><span class="label">PRIJZEN</span><h2 id="price-title">Twee pakketten, vaste prijs</h2>
<p class="intro">Prijzen zijn exclusief btw. Meerdere locaties of parken? Dan spreken we vooraf een vaste prijs op maat af.</p>
<div class="plans">${SCAN.packages.map(p => `<div class="plan${p.featured ? ' featured' : ''}"><h3>${scanEsc(p.name)}</h3><p class="price">${scanEsc(p.price)} <small>excl. btw</small></p><p class="meta">Oplevering binnen ${scanEsc(p.weeks)} na de intake</p><ul>${p.items.map(i => `<li>${scanEsc(i)}</li>`).join('')}</ul><a class="button" href="#aanvraag">Kies ${scanEsc(p.name)}</a></div>`).join('')}</div></section>

<section class="when" aria-labelledby="when-title"><span class="label">WANNEER</span><h2 id="when-title">Begin vóór de volgende aanvraagronde</h2>
<p>Het kabinet bereidt een derde OWE-ronde voor, met 780 miljoen euro gereserveerd. Daarna volgt de regeling voor kleinschalige, lokale waterstofhubs (125 miljoen euro), naar verwachting in het eerste kwartaal van 2027. Zo staat het in de voortgangsbrief waterstofbeleid van juni 2026. Een onderbouwde opbrengstberekening maak je niet in de laatste week.</p>
<p>Data kunnen verschuiven: kijk voor de actuele stand op <a href="https://www.rvo.nl/subsidies-financiering/owe" rel="noopener noreferrer">rvo.nl</a>.</p></section>

<section aria-labelledby="faq-title"><span class="label">VRAGEN</span><h2 id="faq-title">Veelgestelde vragen</h2>${SCAN_FAQ.map(([q, a]) => `<details><summary>${scanEsc(q)}</summary><p>${scanEsc(a)}</p></details>`).join('')}</section>

<section id="aanvraag" aria-labelledby="form-title"><span class="label">AANVRAGEN</span><h2 id="form-title">Vraag een waterstofscan aan</h2>
<p class="intro">Vul in wat je al weet; de rest bespreken we in de intake. Velden met * zijn verplicht.</p>${form}</section>
</main>
<footer><div class="wrap"><span>mijnwindpark.nl · Waterstofscan</span><span>Berekeningen met benoemde aannames, geen garantie of financieel advies.</span><a href="/inloggen">Inloggen</a></div></footer>
</body></html>`;
}
