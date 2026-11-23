// Weergavekeuze: 'project' (standaard, de site voor het eigen project) of 'product' (de site als platform, voor
// verkoopgesprekken). Werkt zoals de taalkeuze: een cookie voor de hele site, een knop in de sessiebalk en
// listeners, zodat React-pagina's en de losse pagina /opsplitsing dezelfde keuze volgen.
// Een link met ?weergave=product of ?weergave=project zet de keuze en haalt de parameter uit het adres.
const COOKIE = 'mwp_view';
const PARAM = 'weergave';
export const VIEWS = ['project', 'product'];
const valid = value => VIEWS.includes(value);

export function readView() {
  try {
    const match = document.cookie.match(/(?:^|;\s*)mwp_view=(project|product)\b/);
    if (match) return match[1];
  } catch { /* cookies niet beschikbaar */ }
  return 'project';
}

// De keuze uit een zoekstring ('?weergave=product'), of null als er geen geldige keuze in staat.
export function viewFromSearch(search) {
  try {
    const value = new URLSearchParams(search).get(PARAM);
    return valid(value) ? value : null;
  } catch { return null; }
}

// Het adres zonder de weergaveparameter; andere parameters en de hash blijven staan.
export function withoutViewParam(href) {
  const url = new URL(href);
  url.searchParams.delete(PARAM);
  return url.pathname + url.search + url.hash;
}

let view = 'project';
const listeners = new Set();
export function getView() { return view; }
export function onView(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export function setView(next, {remember = true} = {}) {
  view = next === 'product' ? 'product' : 'project';
  if (remember) {
    try { document.cookie = `${COOKIE}=${view}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`; } catch { /* geen cookies: keuze geldt alleen op deze pagina */ }
  }
  try { document.documentElement.dataset.view = view; } catch { /* geen document */ }
  for (const listener of listeners) listener(view);
}

export function initView() {
  const fromLink = viewFromSearch(location.search);
  if (!fromLink) { setView(readView(), {remember: false}); return; }
  setView(fromLink);
  try { history.replaceState(history.state, '', withoutViewParam(location.href)); } catch { /* adres blijft zoals het is */ }
}

export const VIEW_LABEL = 'Productweergave';
export const VIEW_HINT = 'Toon de site als platform voor verkoopgesprekken; nogmaals klikken zet de projectweergave terug.';

// Knop voor pagina's zonder React (/opsplitsing); de React-pagina's gebruiken ViewToggle met dezelfde tekst
// en hetzelfde icoon (lucide "presentation").
const ICON_PATHS = ['M2 3h20', 'M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3', 'm7 21 5-5 5 5'];
function presentationIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [name, value] of Object.entries({width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'})) svg.setAttribute(name, value);
  for (const d of ICON_PATHS) { const path = document.createElementNS(ns, 'path'); path.setAttribute('d', d); svg.append(path); }
  return svg;
}
export function viewButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'view-toggle';
  button.append(presentationIcon(), VIEW_LABEL);
  button.title = VIEW_HINT;
  const sync = () => button.setAttribute('aria-pressed', String(view === 'product'));
  button.addEventListener('click', () => setView(view === 'product' ? 'project' : 'product'));
  onView(sync);
  sync();
  return button;
}
