import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as content from '../src/product-content.mjs';
import {viewFromSearch,withoutViewParam,VIEW_HINT,VIEW_LABEL} from '../src/view-mode.mjs';
import {translate} from '../src/i18n.mjs';

const {SITE_ROUTES,ANCHORS,pageNotes,noteFor,nextDemoStep} = content;

test('?weergave= kiest de weergave en verdwijnt uit het adres, andere parameters blijven', () => {
 assert.equal(viewFromSearch('?weergave=product'), 'product');
 assert.equal(viewFromSearch('?day=2026-10-01&weergave=project'), 'project');
 assert.equal(viewFromSearch('?weergave=sales'), null);
 assert.equal(viewFromSearch(''), null);
 assert.equal(withoutViewParam('https://site.test/fryslan?day=2026-10-01&weergave=product#stroom'), '/fryslan?day=2026-10-01#stroom');
 assert.equal(withoutViewParam('https://site.test/?weergave=product'), '/');
});

// Alle links in de productweergave: een pagina van de site, een anker op de productpagina of /#anker.
function links() {
 const found = [];
 const walk = value => {
  if (Array.isArray(value)) value.forEach(walk);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) key === 'href' ? found.push(item) : walk(item);
 };
 walk([content.hero, content.segments, content.demo]);
 for (const path of Object.keys(pageNotes)) found.push(nextDemoStep(path).href);
 found.push(nextDemoStep('/elektrolyser').href, nextDemoStep('/elektrolyser/opsplitsen').href);
 return found;
}

test('elke link in de productweergave wijst naar een bestaande pagina of een anker op de productpagina', () => {
 for (const href of links()) {
  const ok = SITE_ROUTES.includes(href) || ANCHORS.includes(href) || (href.startsWith('/#') && ANCHORS.includes(href.slice(1)));
  assert.ok(ok, href);
 }
});

test('elke pagina behalve de startpagina heeft een productnotitie en een volgende demo-stap', () => {
 for (const path of SITE_ROUTES.filter(p => p !== '/')) {
  const note = noteFor(path);
  assert.ok(note, path);
  for (const field of ['title', 'shows', 'why', 'who', 'ask']) assert.ok(note[field]?.length > 10, `${path} ${field}`);
  assert.ok(nextDemoStep(path)?.href, path);
 }
 assert.equal(noteFor('/'), null);
 assert.equal(noteFor('/elektrolyser/opsplitsen'), pageNotes['/opsplitsing']);
 assert.equal(noteFor('/fryslan/'), pageNotes['/fryslan']);
 // De route loopt door tot de afsluiting op de productpagina.
 assert.equal(nextDemoStep('/fryslan').href, '/beabuorren');
 assert.equal(nextDemoStep('/opsplitsing').href, '/#volgende-stap');
 assert.equal(nextDemoStep('/elektrolyser/samenstellen').href, '/elektrolyser/vergelijken');
});

// Teksten die in het Engels hetzelfde blijven: getallen en namen van windparken.
const SAME_IN_ENGLISH = new Set(['77', '696', 'Windpark Fryslân', 'Windpark Beabuorren', 'Status', 'Data']);
function texts() {
 const skip = new Set(['href', 'url', 'id', 'status']);
 const found = new Set();
 const walk = (value, key) => {
  if (typeof value === 'string') { if (!skip.has(key)) found.add(value); }
  else if (Array.isArray(value)) value.forEach(item => walk(item, key));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, k);
 };
 for (const [name, value] of Object.entries(content)) if (typeof value !== 'function' && !['SITE_ROUTES', 'ANCHORS'].includes(name)) walk(value, name);
 return [...found];
}

test('alle tekst van de productweergave heeft een Engelse vertaling', () => {
 const missing = texts().filter(text => !SAME_IN_ENGLISH.has(text) && translate(text) === text);
 assert.deepEqual(missing, []);
 assert.equal(translate(VIEW_LABEL), 'Product view');
 assert.notEqual(translate(VIEW_HINT), VIEW_HINT);
 assert.equal(translate(content.proof.catalogueNote.replace('{0}', '26')), '26 manufacturers · from the Waterstofatlas');
 assert.equal(translate(`Open dit scherm: ${content.demo.steps[1].title}`), 'Open this screen: Measurement, model and forecast');
 assert.equal(translate('nu niet beschikbaar'), 'not available right now');
});

test('vaste cijfers in de productweergave kloppen met de data van de site', async () => {
 const stations = JSON.parse(await readFile(new URL('../src/stations.json', import.meta.url), 'utf8'));
 assert.equal(content.proof.stationsValue, String(stations.length));
 for (const fact of content.why.facts) {
  assert.match(fact.url, /^https:\/\//);
  assert.ok(fact.source.length > 5 && fact.figure.length > 0);
 }
 // Prijzen staan alleen in het productplan, niet op de site.
 for (const offer of content.offerings.items) assert.doesNotMatch(JSON.stringify(offer), /€|\d+\s?k\b/);
});

const source = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const env = {SITE_PASSWORD: 'fixture-site-password'};
async function signedIn() {
 const worker = (await import(`data:text/javascript;base64,${Buffer.from(source + '\n// product ' + Math.random()).toString('base64')}`)).default;
 const login = await worker.fetch(new Request('https://fixture.test/auth/site', {method: 'POST', headers: {Origin: 'https://fixture.test', 'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({password: env.SITE_PASSWORD})}), env);
 const cookie = login.headers.get('Set-Cookie').split(';')[0];
 return route => worker.fetch(new Request('https://fixture.test' + route, {headers: {Cookie: cookie}}), env);
}

test('de samengestelde site levert alle pagina’s uit de demo-route en de stijl van de productweergave', async () => {
 const get = await signedIn();
 for (const route of SITE_ROUTES) assert.equal((await get(route)).status, 200, route);
 const page = await (await get('/')).text();
 assert.match(page, /\.product-note\{/);
 assert.match(page, /view-toggle/);
 // /opsplitsing heeft geen React: knop en notitie komen uit i18n.js, de stijl uit product.css.
 const ops = await (await get('/opsplitsing')).text();
 assert.match(ops, /href="\/opsplitsing-assets\/opsplitsing\.css"><link rel="stylesheet" href="\/opsplitsing-assets\/product\.css">/);
 const css = await get('/opsplitsing-assets/product.css');
 assert.equal(css.status, 200);
 assert.match(css.headers.get('Content-Type'), /^text\/css/);
 assert.match(await css.text(), /\.product-note\{/);
 const script = await (await get('/opsplitsing-assets/i18n.js')).text();
 assert.match(script, /mwp_view/);
 assert.match(script, /PRODUCTNOTITIE/);
});
