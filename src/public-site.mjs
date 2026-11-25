// Eén website voor bezoekers: dezelfde balk, kop, hetzelfde menu en dezelfde voettekst op alle openbare pagina's,
// zowel op mijnwindpark.nl (startpagina, Waterstofscan) als op atlas.mijnwindpark.nl (kaart, windparken).
// Server-side HTML zonder scripts. De worker plakt dit bestand in (scripts/compose-worker.mjs, net als scan-page.mjs);
// de Atlas-server importeert het. Let op: bij het plakken verdwijnt elk exportwoord met een spatie erachter en elke
// importregel; gebruik dat woord met een spatie erachter dus nergens in teksten.

export const PUBLIC_ORIGINS = {site: 'https://mijnwindpark.nl', atlas: 'https://atlas.mijnwindpark.nl'};
export const HOME_PATH = '/welkom';
export const PUBLIC_CONCEPT = 'Conceptwebsite · ontwerp, nog geen bestaand bedrijf of aanbod';

// Het menu volgt de route van een bezoeker: zelf kijken (kaart, windparken), dan laten uitrekenen (Waterstofscan).
// Het logo gaat naar de startpagina; de knop rechts naar het contactformulier.
export const PUBLIC_MENU = [
  {id: 'kaart', label: 'Kaart', host: 'atlas', path: '/'},
  {id: 'windparken', label: 'Windparken', host: 'atlas', path: '/windparken'},
  {id: 'waterstofscan', label: 'Waterstofscan', host: 'site', path: '/waterstofscan'},
];
export const PUBLIC_CONTACT = {label: 'Bespreek je project', host: 'site', path: '/waterstofscan#aanvraag'};

// Links voor de pagina op `url`: binnen dezelfde host relatief, naar de andere host absoluut. Lokaal (localhost en
// atlas.localhost) blijven de links op de lokale server, zodat je beide hosts met één dev-server bekijkt.
export function publicLinks(url) {
  const u = new URL(url), here = u.hostname.startsWith('atlas.') ? 'atlas' : 'site';
  const local = u.hostname === 'localhost' || u.hostname === 'atlas.localhost', port = u.port ? ':' + u.port : '';
  const origins = local ? {site: `${u.protocol}//localhost${port}`, atlas: `${u.protocol}//atlas.localhost${port}`} : PUBLIC_ORIGINS;
  return {here, origins, href: (host, path) => host === here ? path : origins[host] + path};
}

const pubEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// Balk 'Conceptwebsite', overslaglink en kop met logo, menu en contactknop.
// current: id uit PUBLIC_MENU; extra: HTML tussen logo en menu (zoekveld op de kaart); contactHref: eigen doel voor de
// contactknop (op de Waterstofscan '#aanvraag', zodat meegegeven context in het adres blijft staan).
export function publicHeader(links, {current = '', extra = '', contactHref = '', logoId = '', wide = false} = {}) {
  const item = m => `<a href="${pubEsc(links.href(m.host, m.path))}"${m.id === current ? ' aria-current="page"' : ''}>${pubEsc(m.label)}</a>`;
  return `<p class="pub-concept" role="note">${PUBLIC_CONCEPT}</p>
<a class="pub-skip" href="#inhoud">Naar de inhoud</a>
<header class="pub-top${wide ? ' pub-wide' : ''}"><div class="pub-bar">
<a class="pub-logo"${logoId ? ` id="${pubEsc(logoId)}"` : ''} href="${pubEsc(links.href('site', HOME_PATH))}" title="Naar de startpagina">mijnwindpark<span>.nl</span></a>
${extra ? `<div class="pub-extra">${extra}</div>` : ''}<nav class="pub-menu" aria-label="Hoofdmenu">${PUBLIC_MENU.map(item).join('')}</nav>
<a class="pub-contact" href="${pubEsc(contactHref || links.href(PUBLIC_CONTACT.host, PUBLIC_CONTACT.path))}">${PUBLIC_CONTACT.label}</a>
</div></header>`;
}

// Voettekst met hetzelfde menu, de afbakening en de teamlogin. extra: HTML boven de afbakening (bronnen, leverancier).
export function publicFooter(links, {extra = '', contactHref = ''} = {}) {
  const items = [...PUBLIC_MENU.map(m => [links.href(m.host, m.path), m.label]), [contactHref || links.href(PUBLIC_CONTACT.host, PUBLIC_CONTACT.path), PUBLIC_CONTACT.label]];
  return `<footer class="pub-foot"><div class="pub-foot-in">
<div><a class="pub-foot-logo" href="${pubEsc(links.href('site', HOME_PATH))}">mijnwindpark.nl</a><p>Een locatie voor waterstof uit wind op land vinden, en uitrekenen wat die oplevert.</p></div>
<nav aria-label="Menu onderaan">${items.map(([href, label]) => `<a href="${pubEsc(href)}">${pubEsc(label)}</a>`).join('')}</nav>
<div>${extra}<p>Berekeningen met benoemde aannames, geen garantie of financieel advies.</p><p><a href="${pubEsc(links.href('site', '/inloggen'))}">Inloggen voor het team</a></p></div>
</div></footer>`;
}

// Alleen klassen met pub-, zodat de opmaak niet botst met de pagina's zelf (Waterstofscan, kaart, windparken).
export const PUBLIC_STYLE = `
.pub-concept{margin:0;padding:4px 16px;background:#F2C94C;color:#0C2340;font-size:13px;font-weight:600;line-height:1.5;text-align:center}
.pub-skip{position:absolute;left:-10000px;top:0}.pub-skip:focus{left:16px;top:12px;z-index:30;background:#fff;color:#0C2340;padding:8px 12px}
.pub-top{position:relative;z-index:4;background:#0C2340;color:#fff;border-radius:0 0 28px 0}
.pub-bar{display:flex;align-items:center;gap:10px 18px;max-width:1160px;min-height:72px;margin:0 auto;padding:12px 20px;box-sizing:border-box}
.pub-wide .pub-bar{max-width:none;min-height:64px;padding:10px 20px}
.pub-logo{color:#fff;font-size:23px;font-weight:700;letter-spacing:-.6px;line-height:1.2;text-decoration:none;white-space:nowrap}.pub-logo span{color:#7ad0ed}
.pub-extra{flex:1 1 280px;min-width:0;max-width:520px;margin-left:auto}
.pub-menu{display:flex;align-items:center;gap:2px;margin-left:auto}.pub-extra+.pub-menu{margin-left:0}
.pub-menu a{color:#fff;font-size:15px;line-height:1.3;padding:9px 12px;border-radius:0 10px 0 0;text-decoration:none;white-space:nowrap}
.pub-menu a:hover{background:rgba(195,228,242,.16)}
.pub-menu a[aria-current=page]{background:rgba(195,228,242,.16);box-shadow:inset 0 -3px #00A6DE;font-weight:600}
.pub-contact{display:inline-flex;align-items:center;min-height:42px;padding:8px 16px;background:#00A6DE;color:#0C2340;font-size:15px;font-weight:600;line-height:1.2;text-decoration:none;white-space:nowrap;border-radius:0 12px 0 0}
.pub-contact:hover{background:#7ad0ed}
.pub-top a:focus-visible,.pub-foot a:focus-visible{outline:3px solid #00A6DE;outline-offset:2px}
.pub-foot{margin:64px 0 0;border-top:1px solid #0C2340;color:#465970;font-size:14px;line-height:1.6}
.pub-foot-in{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.3fr);gap:18px 32px;max-width:1160px;margin:0 auto;padding:26px 20px 34px;box-sizing:border-box}
.pub-foot p{margin:0 0 6px}.pub-foot a{color:#0C2340}.pub-foot nav{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.pub-foot-logo{display:inline-block;margin:0 0 6px;font-size:18px;font-weight:700;letter-spacing:-.4px;text-decoration:none}
@media(max-width:860px){
 .pub-bar,.pub-wide .pub-bar{flex-wrap:wrap;gap:8px 12px;min-height:0;padding:10px 16px}
 .pub-logo{flex:1 0 auto;font-size:21px}
 .pub-contact{order:2;min-height:38px;padding:6px 12px;font-size:14px}
 .pub-menu{order:3;flex-basis:100%;margin:0 0 0 -10px;overflow-x:auto}
 .pub-menu a{padding:7px 10px}
 .pub-extra{order:4;flex-basis:100%;max-width:none;margin:0 0 4px}
 .pub-foot-in{grid-template-columns:1fr;padding:22px 16px 28px}
}
@media print{.pub-concept,.pub-skip,.pub-top,.pub-foot{display:none!important}}`;
