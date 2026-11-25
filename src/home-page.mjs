// Openbare startpagina /welkom: wat je op mijnwindpark.nl kunt doen, in drie keuzes en drie stappen. Bezoekers zonder
// login die mijnwindpark.nl openen, komen hier (de worker stuurt / door). Server-side HTML zonder scripts, met
// dezelfde kop, hetzelfde menu en dezelfde voettekst als de Waterstofscan en de Atlas (src/public-site.mjs).
// Let op: scripts/compose-worker.mjs plakt dit bestand in de worker en haalt daarbij elke importregel en elk
// exportwoord met een spatie erachter weg; gebruik dat woord met een spatie erachter dus nergens in teksten.
import {HOME_PATH, PUBLIC_STYLE, publicFooter, publicHeader, publicLinks} from './public-site.mjs';
import {SCAN, SCAN_STYLE} from './scan-page.mjs';

export const HOME = {
  title: 'mijnwindpark.nl · waterstof uit wind op land',
  description: 'Bekijk gratis welke windparken en windmetingen bij een locatie horen, zoek een windpark op en laat met de Waterstofscan uitrekenen hoeveel waterstof een elektrolyser oplevert.',
};

const HOME_STYLE = `
.home-hero h1{max-width:920px}
.choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.choice{position:relative;display:flex;flex-direction:column;align-items:flex-start;background:#fff;border:1px solid #0C2340;border-radius:0 28px 0 0;padding:24px 24px 22px}
.choice:hover{box-shadow:0 10px 28px rgba(12,35,64,.16)}.choice:focus-within{box-shadow:0 0 0 3px #00A6DE}
.choice h3{margin:12px 0 6px;font-size:22px;font-weight:600;line-height:1.25}.choice p{margin:0 0 18px;color:#465970}
.choice .go{margin-top:auto;font-weight:600;text-decoration:none;border-bottom:1px solid #0C2340;padding-bottom:2px}.choice .go::after{content:'';position:absolute;inset:0}
.choice .go:focus-visible{outline:none}
.choice.featured{background:#0C2340;color:#fff}.choice.featured p{color:#d2e2ec}.choice.featured .go{border-color:#fff}
.tag{display:inline-block;padding:2px 10px;background:#C3E4F2;color:#0C2340;font-size:13px;font-weight:700;letter-spacing:.3px;border-radius:0 8px 0 0}.featured .tag{background:#00A6DE}
.steps.home-steps{grid-template-columns:repeat(3,minmax(0,1fr))}
.when .button{background:#00A6DE;border-color:#00A6DE;color:#0C2340}.when .button:hover{background:#7ad0ed}
@media(max-width:960px){.choices{grid-template-columns:1fr}}
@media(max-width:760px){.steps.home-steps{grid-template-columns:1fr}}`;

const homeEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// links: publicLinks() van het verzoek; parks: aantal windparken met een eigen pagina in de Atlas (of 0).
export function homePage({font = '', links = publicLinks('https://mijnwindpark.nl' + HOME_PATH), parks = 0} = {}) {
  const kaart = homeEsc(links.href('atlas', '/')), windparken = homeEsc(links.href('atlas', '/windparken'));
  const choices = [
    {tag: 'Gratis', title: 'Een locatie bekijken', text: 'Zoek een adres of plaats en klik op een perceel. Je ziet welke windparken in de buurt liggen en wat het dichtstbijzijnde KNMI-station aan wind meet.', href: kaart, go: 'Open de kaart'},
    {tag: 'Gratis', title: 'Een windpark opzoeken', text: `${parks > 0 ? `Ruim ${Math.floor(parks / 50) * 50} windparken` : 'Windparken'} per provincie, met vermogen, ligging en windgegevens. Vanuit elk park zoek je een locatie in de buurt.`, href: windparken, go: 'Naar de windparken'},
    {tag: `Vanaf ${SCAN.packages[0].price}`, title: 'De opbrengst laten uitrekenen', text: 'De Waterstofscan: de verwachte waterstofproductie per jaar voor je OWE-aanvraag, in een rekenrapport en een Excel die je adviseur kan narekenen.', href: '/waterstofscan', go: 'Over de Waterstofscan', featured: true},
  ];
  const steps = [
    ['Kies een locatie', 'Klik op de kaart op een perceel en vink de windparken aan die de elektrolyser stroom geven.'],
    ['Bekijk het locatieprofiel', 'Gratis: hoe het windaanbod bij die parken zich verhoudt tot andere locaties. Om te bewaren of af te drukken.'],
    ['Laat de productie uitrekenen', 'De Waterstofscan rekent per tien minuten op historische windjaren, met jouw windpark en elektrolysers, in de vorm die RVO vraagt.'],
  ];
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${homeEsc(HOME.title)}</title><meta name="description" content="${homeEsc(HOME.description)}">
<meta property="og:title" content="${homeEsc(HOME.title)}"><meta property="og:description" content="${homeEsc(HOME.description)}"><meta property="og:type" content="website">
<link rel="canonical" href="https://mijnwindpark.nl${HOME_PATH}"><link rel="icon" href="/favicon.svg">
<style>${font ? `@font-face{font-family:'TASA Orbiter';src:url(data:font/ttf;base64,${font}) format('truetype');font-weight:400 800;font-display:swap}` : ''}${SCAN_STYLE}${PUBLIC_STYLE}${HOME_STYLE}</style></head><body>
${publicHeader(links)}
<main class="wrap" id="inhoud">
<div class="hero home-hero"><span class="eyebrow">WATERSTOF UIT WIND OP LAND</span>
<h1>Vind een plek naast een windpark en weet hoeveel waterstof je er kunt maken</h1>
<p class="lead">Voor iedereen die een elektrolyser bij wind op land overweegt: projectontwikkelaars, subsidieadviseurs, gemeenten, regio’s en eigenaren van windparken. Bekijk gratis welke windparken en windmetingen bij een locatie horen. Laat daarna met de Waterstofscan uitrekenen wat die locatie oplevert.</p>
<div class="cta"><a class="button" href="${kaart}">Open de kaart</a><a class="link" href="#kiezen">Wat kun je hier doen?</a></div></div>

<section id="kiezen" aria-labelledby="choose-title"><h2 id="choose-title">Wat wil je doen?</h2>
<p class="intro">Kies waar je wilt beginnen. De kaart en de windparken zijn gratis en zonder account.</p>
<div class="choices">${choices.map(c => `<article class="choice${c.featured ? ' featured' : ''}"><span class="tag">${homeEsc(c.tag)}</span><h3>${homeEsc(c.title)}</h3><p>${homeEsc(c.text)}</p><a class="go" href="${c.href}">${homeEsc(c.go)} →</a></article>`).join('')}</div></section>

<section id="zo-werkt-het" aria-labelledby="how-title"><h2 id="how-title">Zo werkt het</h2>
<p class="intro">Van een eerste blik op de kaart tot de productieraming in je subsidieaanvraag.</p>
<ol class="steps home-steps">${steps.map(([a, b]) => `<li><h3>${homeEsc(a)}</h3><p>${homeEsc(b)}</p></li>`).join('')}</ol></section>

<section class="when" aria-labelledby="contact-title"><h2 id="contact-title">Liever eerst overleggen?</h2>
<p>Vertel kort over je project. We plannen een vrijblijvende kennismaking en zeggen eerlijk of de Waterstofscan bij je past.</p>
<p><a class="button" href="/waterstofscan#aanvraag">Bespreek je project</a></p></section>
</main>
${publicFooter(links)}
</body></html>`;
}
