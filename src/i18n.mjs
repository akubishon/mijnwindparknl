// Taalkeuze: de site is in het Nederlands geschreven; in het Engels vertaalt deze laag
// zichtbare tekst en toegankelijkheidsattributen in de pagina, zonder de componenten aan te passen.
import english from './i18n-en.mjs';

const COOKIE = 'mwp_lang';
const ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'data-tip'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);
const MONTHS = {januari: 'January', februari: 'February', maart: 'March', april: 'April', mei: 'May', juni: 'June', juli: 'July', augustus: 'August', september: 'September', oktober: 'October', november: 'November', december: 'December', jan: 'Jan', feb: 'Feb', mrt: 'Mar', apr: 'Apr', jun: 'Jun', jul: 'Jul', aug: 'Aug', sep: 'Sep', sept: 'Sep', okt: 'Oct', nov: 'Nov', dec: 'Dec', maandag: 'Monday', dinsdag: 'Tuesday', woensdag: 'Wednesday', donderdag: 'Thursday', vrijdag: 'Friday', zaterdag: 'Saturday', zondag: 'Sunday', ma: 'Mon', di: 'Tue', wo: 'Wed', do: 'Thu', vr: 'Fri', za: 'Sat', zo: 'Sun', om: 'at'};

const UNITS = new Set(['MW', 'MWh', 'kW', 'kWh', 'GWh', 'UTC', 'CET', 'CEST', 'h', 'm', 's', 'u', 'min', 'P1', 'P2b', 'run']);

const exact = new Map();
const templates = [];
const squash = s => s.replace(/\s+/g, ' ').trim();
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [nl, en] of Object.entries(english)) {
  const key = squash(nl);
  if (/\{\d+\}/.test(key)) {
    const order = [];
    const source = key.split(/(\{\d+\})/).map(part => {
      const slot = part.match(/^\{(\d+)\}$/);
      if (!slot) return escape(part);
      order.push(Number(slot[1]));
      return '(.+?)';
    }).join('');
    const fixed = key.replace(/\{\d+\}/g, '');
    // Sjablonen met weinig vaste tekst (zoals “{0} van {1}”) mogen alleen getallen of zelf vertaalbare tekst invullen.
    templates.push({pattern: new RegExp('^' + source + '$', 's'), order, en, fixed: fixed.length, weak: (fixed.match(/[A-Za-zÀ-ÿ]/g) || []).length < 8});
  } else exact.set(key, en);
}
// Langere vaste tekst eerst: specifieke zinnen winnen van algemene sjablonen.
templates.sort((a, b) => b.fixed - a.fixed);

const cache = new Map();
export function translate(text) {
  if (typeof text !== 'string') return text;
  const core = squash(text);
  if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return text;
  let result = cache.get(core);
  if (result === undefined) {
    result = lookup(core, 0);
    if (cache.size > 5000) cache.clear();
    cache.set(core, result);
  }
  if (result === null) return text;
  const lead = text.match(/^\s*/)[0], tail = text.match(/\s*$/)[0];
  return lead + result + tail;
}

// Ingevulde waarde zonder vertaalbare woorden: getallen, eenheden, codes en hoofdletterafkortingen.
const plain = text => (text.match(/[A-Za-zÀ-ÿ]+/g) || []).every(word => UNITS.has(word) || /^[A-Z0-9]+$/.test(word) || /^(kg|t|GWh|kWh\/kg|M€|€|ton|nm|dB|Nm)$/.test(word));

function lookup(core, depth) {
  const hit = exact.get(core);
  if (hit !== undefined) return hit;
  if (depth > 2) return null;
  for (const item of templates) {
    const match = item.pattern.exec(core);
    if (!match) continue;
    const filled = match.slice(1).map(value => {
      const inner = squash(value);
      const done = /[A-Za-zÀ-ÿ]/.test(inner) ? lookup(inner, depth + 1) : inner;
      return {value, inner, done};
    });
    if (item.weak && filled.some(part => part.done === null && !plain(part.inner))) continue;
    return item.en.replace(/\{(\d+)\}/g, (_, n) => {
      const part = filled[item.order.indexOf(Number(n))];
      if (!part) return '';
      const lead = part.value.match(/^\s*/)[0], tail = part.value.match(/\s*$/)[0];
      return lead + (part.done ?? part.inner) + tail;
    });
  }
  // Leestekens aan begin of eind: vertaal de tekst ertussen.
  const edges = core.match(/^([\s·:;,.()\[\]–—\-+×→←↗%*“”"'‘’]*)(.*?)([\s·:;,.()\[\]–—\-+×→←↗*“”"'‘’…]*)$/s);
  if (edges && (edges[1] || edges[3]) && edges[2]) {
    const inner = lookup(edges[2], depth + 1);
    if (inner !== null) return edges[1] + inner + edges[3];
  }
  // Teksten die met « · » zijn samengesteld: vertaal elk deel.
  if (core.includes(' · ')) {
    const parts = core.split(' · ');
    const done = parts.map(part => lookup(part, depth + 1));
    if (done.some(part => part !== null)) return done.map((part, i) => part ?? parts[i]).join(' · ');
  }
  // Datums uit Intl met nl-NL: maand- en dagnamen.
  if (/\d/.test(core)) {
    const words = core.match(/[A-Za-zÀ-ÿ]+/g) || [];
    const dateWord = w => MONTHS[w.toLowerCase()] !== undefined;
    if (words.some(dateWord) && words.every(w => dateWord(w) || UNITS.has(w))) return core.replace(/[A-Za-zÀ-ÿ]+/g, w => MONTHS[w.toLowerCase()] ?? w);
  }
  return null;
}

export function readLanguage() {
  try {
    const match = document.cookie.match(/(?:^|;\s*)mwp_lang=(en|nl)\b/);
    if (match) return match[1];
  } catch { /* cookies niet beschikbaar */ }
  return 'nl';
}

let language = 'nl';
let observer = null;
const textOriginal = new WeakMap();    // tekstnode → {nl, en}
const attrOriginal = new WeakMap();    // element → Map(attribuut → {nl, en})
const touched = new Set();             // refs naar vertaalde nodes, voor terugzetten
const listeners = new Set();

function skip(node) {
  for (let el = node.nodeType === 1 ? node : node.parentElement; el; el = el.parentElement) {
    if (SKIP.has(el.tagName) || el.isContentEditable || el.getAttribute('translate') === 'no' || el.classList?.contains('notranslate')) return true;
  }
  return false;
}

function doText(node) {
  const value = node.nodeValue;
  const known = textOriginal.get(node);
  if (known && value === known.en) return;
  const nl = value;
  const en = translate(nl);
  if (en === nl) { if (known) textOriginal.delete(node); return; }
  if (skip(node)) return;
  textOriginal.set(node, {nl, en});
  touched.add(new WeakRef(node));
  node.nodeValue = en;
}

function doAttribute(el, name) {
  const value = el.getAttribute(name);
  if (value == null) return;
  let map = attrOriginal.get(el);
  const known = map?.get(name);
  if (known && value === known.en) return;
  const en = translate(value);
  if (en === value) { map?.delete(name); return; }
  if (!map) { map = new Map(); attrOriginal.set(el, map); }
  map.set(name, {nl: value, en});
  touched.add(new WeakRef(el));
  el.setAttribute(name, en);
}

function doElement(el) {
  if (el.nodeType === 3) { doText(el); return; }
  if (el.nodeType !== 1 || skip(el)) return;
  for (const name of ATTRIBUTES) if (el.hasAttribute(name)) doAttribute(el, name);
  if ((el.tagName === 'INPUT') && /^(button|submit|reset)$/i.test(el.type) && el.hasAttribute('value')) doAttribute(el, 'value');
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: node => node.nodeType === 1 && SKIP.has(node.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 3) doText(node);
    else {
      for (const name of ATTRIBUTES) if (node.hasAttribute(name)) doAttribute(node, name);
      if (node.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(node.type) && node.hasAttribute('value')) doAttribute(node, 'value');
    }
  }
}

function start() {
  if (observer) return;
  doElement(document.documentElement);
  observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') doText(record.target);
      else if (record.type === 'attributes') doAttribute(record.target, record.attributeName);
      else for (const node of record.addedNodes) doElement(node);
    }
  });
  observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRIBUTES, 'value']});
}

function stop() {
  observer?.disconnect();
  observer = null;
  for (const ref of touched) {
    const node = ref.deref();
    if (!node) continue;
    const text = textOriginal.get(node);
    if (text && node.nodeValue === text.en) node.nodeValue = text.nl;
    textOriginal.delete(node);
    const map = attrOriginal.get(node);
    if (map) for (const [name, item] of map) if (node.getAttribute(name) === item.en) node.setAttribute(name, item.nl);
    attrOriginal.delete(node);
  }
  touched.clear();
}

export function getLanguage() { return language; }
export function onLanguage(listener) { listeners.add(listener); return () => listeners.delete(listener); }

export function setLanguage(next, {remember = true} = {}) {
  language = next === 'en' ? 'en' : 'nl';
  if (remember) {
    try { document.cookie = `${COOKIE}=${language}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`; } catch { /* geen cookies */ }
  }
  document.documentElement.lang = language;
  if (language === 'en') start(); else stop();
  for (const listener of listeners) listener(language);
}

// Knop die de taal wisselt; het label staat in de doeltaal en wordt zelf niet vertaald.
export function languageButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'language-toggle notranslate';
  const sync = () => {
    const en = language === 'en';
    button.textContent = en ? 'Nederlands' : 'English';
    button.lang = en ? 'nl' : 'en';
    button.setAttribute('aria-label', en ? 'Toon de website in het Nederlands' : 'Show the website in English');
  };
  button.addEventListener('click', () => setLanguage(language === 'en' ? 'nl' : 'en'));
  onLanguage(sync);
  sync();
  return button;
}

export function initLanguage() { setLanguage(readLanguage(), {remember: false}); }
