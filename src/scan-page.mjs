// Openbare verkooppagina /waterstofscan: het ene product dat we verkopen, zonder wachtwoord te bekijken,
// met een aanvraagformulier. Server-side HTML zonder scripts; de worker serveert hem vóór de sitepoort.
// De inhoud staat in SCAN; prijzen en teksten pas je hier aan. Zie docs/sales/waterstofscan.md.
export const SCAN_PATH = '/waterstofscan';

export const SCAN = {
  headline: 'Technische opbrengstanalyse voor de voorbereiding van je OWE-aanvraag',
  title: 'Waterstofscan voor OWE-aanvragen · mijnwindpark.nl',
  description: 'Voor elektrolyseprojecten met Nederlandse wind op land. Gebruik het rekenrapport en Excel om de verwachte waterstofopbrengst voor je haalbaarheidsstudie te onderbouwen.',
  packages: [
    {id: 'opbrengst', name: 'Opbrengstberekening', price: '€ 11.999', fit: 'Je hebt een voorkeursmodel en wilt de opbrengst voor je dossier onderbouwen.', items: [
      'Eén elektrolyser in maximaal drie configuraties',
      'Opbrengst per windscenario, met de aannames voor rendement, beschikbaarheid en degradatie',
      'Rekenrapport en Excel met uitgangspunten, resultaten en controleberekeningen',
    ]},
    {id: 'keuze', name: 'Opbrengst + leverancierskeuze', price: '€ 21.999', fit: 'Je shortlist staat nog open en je wilt modellen vergelijken vóór je kiest.', featured: true, items: [
      'Alles uit de Opbrengstberekening',
      'Maximaal zes elektrolysers vergeleken op dezelfde stroominvoer',
      'Dimensionering van het vermogen en aantal modules',
      'Kostprijs per kilo en het effect van andere kostenaannames',
      'Open vragen per leverancier en bespreking van de vergelijking',
    ]},
  ],
};

const SCAN_STEPS = [
  ['Project afstemmen', 'We bespreken je locatie, stroomaansluiting, elektrolyser en deadline. Aan de hand van de beschikbare gegevens bevestigen we wat we kunnen doorrekenen en wanneer.'],
  ['Doorrekenen', 'De rekenkern gebruikt historische windjaren op intervallen van tien minuten. We leggen vast welk stroomprofiel en welke installatiegegevens voor jouw analyse zijn gebruikt.'],
  ['Overdragen', 'Je ontvangt het rapport en Excel met de resultaten en aannames. Jij of je subsidieadviseur gebruikt die cijfers voor de haalbaarheidsstudie.'],
];
const SCAN_FAQ = [
  ['Wie stelt mijn haalbaarheidsstudie op?', 'Jij of je subsidieadviseur stelt de studie op, inclusief de investeringsbegroting, mijlpalen, afzet, financiering en exploitatieberekening. De Waterstofscan levert technische invoer voor de opbrengstberekening.'],
  ['Past mijn stroomaansluiting of waterstofhub?', 'De Waterstofscan is gericht op elektrolyse met wind op land. Werk je aan een lokale waterstofhub of heeft je installatie een netaansluiting, dan bespreken we in de intake welke analyse bij jouw situatie past.'],
  ['Wat heb ik nodig voor de intake?', 'Een locatie, je beoogde stroombron en het gewenste elektrolysevermogen helpen. Heb je al meetgegevens, turbinespecificaties of een leveranciersofferte, meld dat dan in de intake.'],
];
const SCAN_PLANS = [['onbekend', 'Weet ik nog niet'], ...SCAN.packages.map(({id, name}) => [id, name])];

const scanEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const SCAN_STYLE = `
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#EFECE6;color:#0C2340;font-family:'TASA Orbiter','Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.6}
a{color:inherit}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #00A6DE;outline-offset:3px}
.wrap{max-width:1160px;margin:0 auto;padding:0 20px}
header{background:#0C2340;color:#fff;border-radius:0 0 32px 0}header .wrap{display:flex;justify-content:space-between;align-items:center;min-height:76px;gap:16px}
.brand{font-size:24px;font-weight:700;letter-spacing:-.6px;text-decoration:none}.brand span{color:#7ad0ed}header nav{display:flex;gap:18px;align-items:center;font-size:14px}header nav a{text-decoration:none}header nav a:hover{text-decoration:underline}
.hero{background:#C3E4F2;border-radius:0 48px 0 0;margin:28px 0 0;padding:44px 40px}
.eyebrow{display:inline-block;border-left:4px solid #00A6DE;padding-left:10px;font-size:14px;font-weight:700;letter-spacing:1px}
h1{font-size:clamp(32px,5vw,56px);line-height:1.08;letter-spacing:-1.3px;font-weight:500;margin:16px 0 18px;max-width:880px;overflow-wrap:break-word}
.lead{font-size:18px;max-width:760px;margin:0 0 26px}
.cta{display:flex;flex-wrap:wrap;gap:14px 22px;align-items:center}
.button{display:inline-flex;align-items:center;gap:10px;min-height:50px;padding:12px 22px;background:#0C2340;color:#fff;border:1px solid #0C2340;border-radius:0 14px 0 0;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}.button:hover{background:#193a5d}
.link{font-weight:600;border-bottom:1px solid #0C2340;text-decoration:none;padding-bottom:3px}
section{margin:56px 0 0;scroll-margin-top:16px}#prijzen{margin-top:40px}h2{font-size:clamp(26px,3.4vw,38px);line-height:1.15;font-weight:500;letter-spacing:-.8px;margin:0 0 12px;max-width:820px}.intro{max-width:760px;color:#465970;margin:0 0 22px}
.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;list-style:none;margin:0;padding:0}.steps li{border-top:3px solid #00A6DE;padding-top:12px}.steps h3{margin:0 0 4px;font-size:18px}.steps p{margin:0;color:#465970}
.plans{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.plan{display:flex;flex-direction:column;align-items:flex-start;background:#fff;border:1px solid #0C2340;border-radius:0 28px 0 0;padding:26px}.plan.featured{background:#0C2340;color:#fff}.plan h3{margin:0;font-size:22px;font-weight:600}.price{font-size:38px;font-weight:500;letter-spacing:-1px;margin:4px 0 8px}.price small{font-size:14px;letter-spacing:0;font-weight:400}.plan .fit{margin:0 0 12px}.plan ul{margin:0 0 20px;padding-left:20px}.plan li{margin:4px 0}.plan .button{margin-top:auto}.plan.featured .button{background:#00A6DE;border-color:#00A6DE;color:#0C2340}
.requirements{background:#fff;border:1px solid #a7b4bf;border-radius:0 24px 0 0;padding:26px}.requirements p{max-width:780px;margin:0 0 12px}.requirements p:last-child{margin-bottom:0}
details{background:#fff;border:1px solid #a7b4bf;border-radius:0 16px 0 0;padding:14px 18px;margin:0 0 10px}summary{cursor:pointer;font-weight:600}details p{margin:10px 0 0;color:#465970}
form{background:#fff;border:1px solid #0C2340;border-radius:0 28px 0 0;padding:28px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 20px;max-width:900px}
label{display:block;font-size:14px;font-weight:600}input,select,textarea{display:block;width:100%;margin-top:6px;padding:11px 12px;border:1px solid #788b9f;border-radius:0 8px 0 0;background:#fff;color:#0C2340;font:inherit;font-size:16px}textarea{min-height:110px;resize:vertical}
.full{grid-column:1/-1}.check{display:flex;gap:10px;align-items:flex-start;font-weight:400}.check input{width:auto;margin-top:5px}
.trap{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.error{grid-column:1/-1;margin:0;padding:12px 14px;border-left:4px solid #a32c22;background:#fff3f0;color:#84251e}
.thanks{background:#fff;border:1px solid #0C2340;border-left:6px solid #4E7A3A;border-radius:0 28px 0 0;padding:26px;max-width:900px}.thanks h3{margin:0 0 6px;font-size:22px;font-weight:500}
footer{margin:64px 0 0;border-top:1px solid #0C2340;padding:22px 0 34px;font-size:13px;color:#465970}footer .wrap{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media(max-width:640px){.brand{font-size:22px}header .wrap,header nav{gap:12px}header nav a:first-child{display:none}.hero{padding:28px 22px;border-radius:0 32px 0 0}.lead{font-size:16px}.plans,form,.steps{grid-template-columns:1fr}.plan,.requirements,form{padding:20px}.plan h3{overflow-wrap:break-word;max-width:100%}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`;

function scanOptions(list, chosen) { return list.map(([value, label]) => `<option value="${value}"${value === chosen ? ' selected' : ''}>${scanEsc(label)}</option>`).join(''); }

// sent: aanvraag ontvangen; errors: lijst met meldingen; values: eerder ingevulde waarden; font: base64 van TASA Orbiter.
export function scanPage({sent = false, errors = [], values = {}, font = ''} = {}) {
  const v = values;
  const form = sent
    ? `<div class="thanks" role="status"><h3>Je bericht is binnen</h3><p>We nemen per e-mail contact met je op voor een vrijblijvende intake over je project en planning.</p></div>`
    : `<form method="post" action="${SCAN_PATH}#aanvraag" novalidate>
${errors.length ? `<p class="error" role="alert">${errors.map(scanEsc).join(' ')}</p>` : ''}
<label>Naam *<input name="naam" required maxlength="120" autocomplete="name" value="${scanEsc(v.naam)}"></label>
<label>Organisatie *<input name="organisatie" required maxlength="160" autocomplete="organization" value="${scanEsc(v.organisatie)}"></label>
<label>E-mail *<input name="email" type="email" required maxlength="200" autocomplete="email" value="${scanEsc(v.email)}"></label>
<label>Pakket<select name="pakket">${scanOptions(SCAN_PLANS, v.pakket || 'onbekend')}</select></label>
<label class="full">Deadline of toelichting (optioneel)<textarea name="toelichting" maxlength="2000">${scanEsc(v.toelichting)}</textarea></label>
<div class="trap" aria-hidden="true"><label>Laat dit veld leeg<input name="website" tabindex="-1" autocomplete="off"></label></div>
<label class="full check"><input type="checkbox" name="toestemming" value="ja" required${v.toestemming ? ' checked' : ''}><span>Je mag mijn gegevens gebruiken om contact met me op te nemen over dit project. *</span></label>
<div class="full"><button class="button" type="submit">Verstuur bericht</button></div>
</form>`;
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${scanEsc(SCAN.title)}</title><meta name="description" content="${scanEsc(SCAN.description)}">
<meta property="og:title" content="${scanEsc(SCAN.headline)} · Waterstofscan"><meta property="og:description" content="${scanEsc(SCAN.description)}"><meta property="og:type" content="website">
<link rel="canonical" href="https://mijnwindpark.nl${SCAN_PATH}">
<link rel="icon" href="/favicon.svg"><style>${font ? `@font-face{font-family:'TASA Orbiter';src:url(data:font/ttf;base64,${font}) format('truetype');font-weight:400 800;font-display:swap}` : ''}${SCAN_STYLE}</style></head><body>
<header><div class="wrap"><a class="brand" href="${SCAN_PATH}">mijnwindpark<span>.nl</span></a><nav aria-label="Pagina"><a href="#werkwijze">Werkwijze</a><a href="#prijzen">Prijzen</a><a href="/inloggen">Inloggen</a></nav></div></header>
<main class="wrap" id="inhoud">
<div class="hero"><span class="eyebrow">WATERSTOFSCAN</span>
<h1>${scanEsc(SCAN.headline)}</h1>
<p class="lead">${scanEsc(SCAN.description)}</p>
<div class="cta"><a class="button" href="#aanvraag">Bespreek je project</a><a class="link" href="#prijzen">Bekijk de pakketten</a></div></div>

<section id="prijzen" aria-labelledby="price-title"><h2 id="price-title">Twee pakketten, vaste prijs</h2>
<p class="intro">Per projectlocatie. We bevestigen in de intake de gegevens, de omvang en de planning.</p>
<div class="plans">${SCAN.packages.map(p => `<article class="plan${p.featured ? ' featured' : ''}"><h3>${scanEsc(p.name)}</h3><p class="price">${scanEsc(p.price)} <small>excl. btw</small></p><p class="fit">${scanEsc(p.fit)}</p><ul>${p.items.map(i => `<li>${scanEsc(i)}</li>`).join('')}</ul><a class="button" href="${SCAN_PATH}?pakket=${p.id}#aanvraag" aria-label="Bespreek dit pakket (${scanEsc(p.name)})">Bespreek dit pakket</a></article>`).join('')}</div></section>

<section id="werkwijze" aria-labelledby="how-title"><h2 id="how-title">Van projectgegevens naar rekenrapport</h2>
<ol class="steps">${SCAN_STEPS.map(([a, b]) => `<li><h3>${scanEsc(a)}</h3><p>${scanEsc(b)}</p></li>`).join('')}</ol></section>

<section class="requirements" aria-labelledby="rvo-title"><h2 id="rvo-title">Wat RVO vraagt voor OWE</h2>
<p>De RVO-handleiding voor OWE 2024 vraagt een opbrengstberekening in de haalbaarheidsstudie. Die geeft de kilo’s volledig en niet-volledig hernieuwbare waterstof per toekomstig kalenderjaar van de exploitatiesubsidie, met onderbouwing van omzettingsrendement, beschikbaarheid van de installatie en hernieuwbare stroom, en degradatie.</p>
<p>In de intake stemmen we af welke cijfers onze analyse voor jouw dossier kan onderbouwen. Raadpleeg de <a href="https://www.rvo.nl/subsidies-financiering/owe/aanvragen">RVO-aanvraaginformatie</a> en de <a href="https://www.rvo.nl/subsidies-financiering/owe">actuele stand van de volgende OWE-ronde</a>.</p></section>

<section aria-labelledby="faq-title"><h2 id="faq-title">Veelgestelde vragen</h2>${SCAN_FAQ.map(([q, a]) => `<details><summary>${scanEsc(q)}</summary><p>${scanEsc(a)}</p></details>`).join('')}</section>

<section id="aanvraag" aria-labelledby="form-title"><h2 id="form-title">Bespreek je project</h2>
${sent ? '' : '<p class="intro">Laat je gegevens achter voor een vrijblijvende intake. We nemen per e-mail contact op. Velden met * zijn verplicht.</p>'}${form}</section>
</main>
<footer><div class="wrap"><span>mijnwindpark.nl · Waterstofscan</span><a href="/inloggen">Inloggen</a></div></footer>
</body></html>`;
}
