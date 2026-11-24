import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseLead, leadKey, leadsCsv, LEAD_PREFIX} from '../src/leads.mjs';
import {scanPage} from '../src/scan-page.mjs';

const source = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const fresh = async () => (await import(`data:text/javascript;base64,${Buffer.from(source + '\n// scan ' + Math.random()).toString('base64')}`)).default;
const ORIGIN = 'https://fixture.test';
function bucket() {
 const store = new Map();
 return {store,
  async put(key, value) { store.set(key, String(value)); },
  async get(key) { const v = store.get(key); return v === undefined ? null : {json: async () => JSON.parse(v)}; },
  async list({prefix = '', limit = 1000} = {}) { const objects = [...store.keys()].filter(k => k.startsWith(prefix)).sort().slice(0, limit).map(key => ({key})); return {objects, truncated: false}; },
 };
}
const form = fields => new URLSearchParams({naam: 'Anna de Vries', organisatie: 'Waterstof Noord', email: 'anna@example.nl', pakket: 'keuze', ronde: 'hubs', vermogen: '5,5', toestemming: 'ja', ...fields});
const post = (worker, env, body, ip = '203.0.113.1', origin = ORIGIN) => worker.fetch(new Request(ORIGIN + '/waterstofscan', {method: 'POST', headers: {Origin: origin, 'CF-Connecting-IP': ip, 'Content-Type': 'application/x-www-form-urlencoded'}, body}), env);

test('de openbare pagina staat vóór de login, zonder scripts, en noemt geen windparken of klant', async () => {
 const worker = await fresh();
 const r = await worker.fetch(new Request(ORIGIN + '/waterstofscan'), {SITE_PASSWORD: 'x'});
 assert.equal(r.status, 200);
 const csp = r.headers.get('Content-Security-Policy');
 assert.match(csp, /default-src 'none'/); assert.doesNotMatch(csp, /script-src/);
 assert.equal(r.headers.get('X-Robots-Tag'), null);
 const html = await r.text();
 assert.match(html, /<h1>Technische opbrengstanalyse voor de voorbereiding van je OWE-aanvraag<\/h1>/);
 assert.match(html, /<form method="post" action="\/waterstofscan#aanvraag"/);
 assert.match(html, /€ 11\.999 <small>excl\. btw<\/small>/);
 assert.match(html, /€ 21\.999 <small>excl\. btw<\/small>/);
 assert.doesNotMatch(html, /€ (7\.500|14\.500)/);
 assert.match(html, /Bespreek je project/);
 assert.doesNotMatch(html, /<script/i);
 assert.doesNotMatch(html, /Fryslân|Beabuorren|44 MW/);
 assert.equal((await (await worker.fetch(new Request(ORIGIN + '/robots.txt'), {})).text()), 'User-agent: *\nAllow: /waterstofscan\nDisallow: /\n');
});

test('pakketlinks selecteren het gekozen pakket en onbekende pakketten vallen terug op de standaard', async () => {
 const worker = await fresh();
 const base = ORIGIN + '/waterstofscan';
 const page = async query => (await worker.fetch(new Request(base + query), {})).text();
 const html = await page('');
 assert.match(html, /href="\/waterstofscan\?pakket=opbrengst#aanvraag"/);
 assert.match(html, /href="\/waterstofscan\?pakket=keuze#aanvraag"/);
 assert.match(html, /<option value="onbekend" selected>/);
 assert.match(await page('?pakket=opbrengst'), /<option value="opbrengst" selected>/);
 assert.match(await page('?pakket=keuze'), /<option value="keuze" selected>/);
 assert.match(await page('?pakket=gratis'), /<option value="onbekend" selected>/);
});

test('de voordeur leidt bezoekers naar het aanbod; het team logt in via /inloggen', async () => {
 const worker = await fresh();
 const env = {SITE_PASSWORD: 'fixture-site-password'};
 const door = await worker.fetch(new Request(ORIGIN + '/'), env);
 assert.equal(door.status, 302); assert.equal(door.headers.get('Location'), '/waterstofscan');
 assert.equal((await worker.fetch(new Request(ORIGIN + '/?weergave=product'), env)).status, 401);
 const login = await worker.fetch(new Request(ORIGIN + '/inloggen'), env);
 assert.equal(login.status, 200);
 const html = await login.text();
 assert.match(html, /name="next" value="\/"/); assert.match(html, /href="\/waterstofscan"/);
 const auth = await worker.fetch(new Request(ORIGIN + '/auth/site', {method: 'POST', headers: {Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({password: env.SITE_PASSWORD, next: '/'})}), env);
 const cookie = auth.headers.get('Set-Cookie').split(';')[0];
 const again = await worker.fetch(new Request(ORIGIN + '/inloggen', {headers: {Cookie: cookie}}), env);
 assert.equal(again.status, 303); assert.equal(again.headers.get('Location'), '/');
 assert.equal((await worker.fetch(new Request(ORIGIN + '/', {headers: {Cookie: cookie}}), env)).status, 200);
});

test('een aanvraag wordt bewaard in R2 zonder IP-adres; spam, fouten en vreemde herkomst niet', async () => {
 const worker = await fresh();
 const b = bucket(), env = {SITE_PASSWORD: 'x', BUCKET: b};
 const ok = await post(worker, env, new URLSearchParams({naam: 'Anna de Vries', organisatie: 'Waterstof Noord', email: 'anna@example.nl', pakket: 'keuze', toestemming: 'ja', toelichting: 'Deadline 15 januari'}));
 assert.equal(ok.status, 303); assert.equal(ok.headers.get('Location'), '/waterstofscan?verzonden=1#aanvraag');
 assert.equal(b.store.size, 1);
 const [key, value] = [...b.store][0];
 assert.ok(key.startsWith(LEAD_PREFIX));
 const lead = JSON.parse(value);
 assert.equal(lead.email, 'anna@example.nl'); assert.equal(lead.pakket, 'keuze'); assert.equal(lead.toelichting, 'Deadline 15 januari');
 assert.ok(Date.parse(lead.ontvangen));
 assert.doesNotMatch(value, /203\.0\.113/);
 // Lokveld ingevuld: zelfde bedankpagina, niets bewaard.
 assert.equal((await post(worker, env, form({website: 'spam.example'}), '203.0.113.2')).status, 303);
 assert.equal(b.store.size, 1);
 // Fout: pagina opnieuw, ingevulde tekst veilig terug, niets bewaard.
 const bad = await post(worker, env, form({email: 'geen-adres', naam: '<script>alert(1)</script>'}), '203.0.113.3');
 assert.equal(bad.status, 400);
 const html = await bad.text();
 assert.match(html, /Vul een geldig e-mailadres in\./); assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>alert/);
 assert.match(html, /<option value="keuze" selected>/);
 assert.equal(b.store.size, 1);
 assert.equal((await post(worker, env, form(), '203.0.113.4', 'https://evil.example')).status, 403);
 // Zonder opslag: duidelijke melding, geen stil verlies.
 assert.equal((await post(worker, {SITE_PASSWORD: 'x'}, form(), '203.0.113.5')).status, 503);
 // Rate limit: zes aanvragen in een uur vanaf één adres.
 for (let i = 0; i < 4; i++) await post(worker, env, form(), '203.0.113.9');
 assert.equal((await post(worker, env, form(), '203.0.113.9')).status, 303);
 assert.equal((await post(worker, env, form(), '203.0.113.9')).status, 429);
});

test('aanvragen staan achter de login op /leads en als CSV, nieuwste eerst, zonder formule-injectie', async () => {
 const worker = await fresh();
 const b = bucket(), env = {SITE_PASSWORD: 'fixture-site-password', BUCKET: b};
 await b.put(leadKey(Date.parse('2026-11-01T10:00:00Z'), 'aaaa'), JSON.stringify({naam: 'Oud', organisatie: 'A', email: 'a@example.nl', ontvangen: '2026-11-01T10:00:00Z'}));
 await b.put(leadKey(Date.parse('2026-11-20T10:00:00Z'), 'bbbb'), JSON.stringify({naam: '=HYPERLINK("x")', organisatie: 'B', email: 'b@example.nl', ontvangen: '2026-11-20T10:00:00Z'}));
 assert.equal((await worker.fetch(new Request(ORIGIN + '/leads'), env)).status, 401);
 assert.equal((await worker.fetch(new Request(ORIGIN + '/leads.csv'), env)).status, 401);
 const auth = await worker.fetch(new Request(ORIGIN + '/auth/site', {method: 'POST', headers: {Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({password: env.SITE_PASSWORD})}), env);
 const cookie = auth.headers.get('Set-Cookie').split(';')[0];
 const page = await (await worker.fetch(new Request(ORIGIN + '/leads', {headers: {Cookie: cookie}}), env)).text();
 assert.ok(page.indexOf('b@example.nl') < page.indexOf('a@example.nl'), 'nieuwste eerst');
 const csv = await (await worker.fetch(new Request(ORIGIN + '/leads.csv', {headers: {Cookie: cookie}}), env)).text();
 assert.ok(csv.replace(/^\uFEFF/, '').startsWith('Ontvangen;Naam'));
 assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
});

test('formuliercontrole: verplichte velden, vermogen als getal, onbekende keuzes naar de standaard', () => {
 assert.deepEqual(parseLead(new URLSearchParams({})).errors.length, 4);
 const r = parseLead(form({vermogen: 'veel', pakket: 'gratis', ronde: 'x'}));
 assert.deepEqual(r.errors, ['Vul het vermogen in als getal in MW, of laat het leeg.']);
 assert.equal(r.values.pakket, 'onbekend'); assert.equal(r.values.ronde, 'anders');
 assert.ok(parseLead(form({vermogen: ''})).lead);
 assert.ok(leadKey(2000, 'a') < leadKey(1000, 'a'), 'later ontvangen sorteert eerder');
 assert.match(leadsCsv([]), /^﻿/);
 assert.match(scanPage({sent: true}), /Je bericht is binnen/);
});
