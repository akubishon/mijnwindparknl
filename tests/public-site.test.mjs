// Eén website voor bezoekers: startpagina, Waterstofscan, kaart en windparken delen kop, menu en voettekst
// (src/public-site.mjs), op mijnwindpark.nl én atlas.mijnwindpark.nl.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PUBLIC_MENU, publicLinks} from '../src/public-site.mjs';

const source = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const worker = (await import(`data:text/javascript;base64,${Buffer.from(source + '\n// openbaar').toString('base64')}`)).default;
const SITE = 'https://mijnwindpark.nl', ATLAS = 'https://atlas.mijnwindpark.nl';
const index = {jaar: 2025, stations: [{id: '0-20000-0-06270', mean_ms: 4.5, uren: 8760}]};
const env = {SITE_PASSWORD: 'fixture-site-password', BUCKET: {async get(key) { return key.endsWith('index.json') ? {json: async () => index} : null; }}};
const get = async (url, init) => { const r = await worker.fetch(new Request(url, init), env); return {r, html: await r.text()}; };
// Het hoofdmenu zoals het op de pagina staat: [href, label, huidige pagina].
const menu = html => {
 const nav = html.match(/<nav class="pub-menu" aria-label="Hoofdmenu">(.*?)<\/nav>/s);
 assert.ok(nav, 'hoofdmenu ontbreekt');
 return [...nav[1].matchAll(/<a href="([^"]+)"( aria-current="page")?>([^<]+)<\/a>/g)].map(m => [m[1], m[3], Boolean(m[2])]);
};
const firstPark = async () => (await get(ATLAS + '/windparken')).html.match(/href="(\/windpark\/\d+-[a-z0-9-]+)"/)[1];

test('elke openbare pagina heeft hetzelfde menu, op beide hosts', async () => {
 const pages = [[SITE + '/welkom', null], [SITE + '/waterstofscan', 'Waterstofscan'], [ATLAS + '/', 'Kaart'], [ATLAS + '/windparken', 'Windparken'], [ATLAS + await firstPark(), 'Windparken']];
 for (const [url, current] of pages) {
  const {r, html} = await get(url);
  assert.equal(r.status, 200, url);
  const atlas = url.startsWith(ATLAS), items = menu(html);
  assert.deepEqual(items.map(i => i[1]), PUBLIC_MENU.map(m => m.label), url);
  assert.deepEqual(items.map(i => i[0]), atlas ? ['/', '/windparken', SITE + '/waterstofscan'] : [ATLAS + '/', ATLAS + '/windparken', '/waterstofscan'], url);
  assert.deepEqual(items.filter(i => i[2]).map(i => i[1]), current ? [current] : [], url);
  assert.match(html, /<p class="pub-concept" role="note">Conceptwebsite/, url);
  assert.match(html, new RegExp(`<a class="pub-logo"[^>]* href="${atlas ? SITE : ''}/welkom"`), url);
  assert.match(html, /<a class="pub-contact" href="[^"]*#aanvraag">Bespreek je project<\/a>/, url);
  assert.match(html, /<a class="pub-skip" href="#inhoud">/, url); assert.match(html, /id="inhoud"/, url);
  // De kaart vult het scherm en heeft geen voettekst; de andere pagina's hebben dezelfde voettekst met de teamlogin.
  if (url === ATLAS + '/') assert.doesNotMatch(html, /pub-foot|\/inloggen/, url);
  else assert.ok(html.indexOf('<footer class="pub-foot">') > 0 && html.indexOf('/inloggen') > html.indexOf('<footer class="pub-foot">'), url + ': teamlogin alleen in de voettekst');
 }
});

test('startpagina: openbaar, zonder scripts, met drie keuzes en zonder namen van de opdrachtgever', async () => {
 const {r, html} = await get(SITE + '/welkom');
 assert.equal(r.status, 200);
 assert.doesNotMatch(r.headers.get('Content-Security-Policy'), /script-src/);
 assert.equal(r.headers.get('X-Robots-Tag'), 'noindex, nofollow', 'conceptfase: niet indexeren');
 assert.doesNotMatch(html, /<script/i);
 assert.doesNotMatch(html, /Fryslân|Beabuorren|44 MW/);
 assert.match(html, /<h1>Vind een plek naast een windpark en weet hoeveel waterstof je er kunt maken<\/h1>/);
 // Drie keuzes: kaart en windparken (gratis, op de Atlas) en de Waterstofscan (met prijs).
 const choices = [...html.matchAll(/<article class="choice[^"]*"><span class="tag">([^<]+)<\/span><h3>([^<]+)<\/h3><p>[^<]+<\/p><a class="go" href="([^"]+)">/g)].map(m => [m[1], m[2], m[3]]);
 assert.deepEqual(choices, [['Gratis', 'Een locatie bekijken', ATLAS + '/'], ['Gratis', 'Een windpark opzoeken', ATLAS + '/windparken'], ['Vanaf € 12.000', 'De opbrengst laten uitrekenen', '/waterstofscan']]);
 assert.match(html, /Ruim 300 windparken per provincie/);
 assert.equal((await worker.fetch(new Request(SITE + '/welkom', {method: 'HEAD'}), env)).status, 200);
 // Ook zonder ingesteld wachtwoord blijft de startpagina openbaar; de rest van de site blijft dicht.
 assert.equal((await worker.fetch(new Request(SITE + '/welkom'), {})).status, 200);
});

test('Waterstofscan: contactknop blijft op de pagina, lokale navigatie wijst naar bestaande onderdelen en de kaart is te vinden', async () => {
 const {html} = await get(SITE + '/waterstofscan?bron=atlas&locatie=Perceel%20X&vermogen=12');
 // Op de scanpagina springt de contactknop naar het formulier, zodat de context uit de Atlas in het adres blijft.
 assert.match(html, /<a class="pub-contact" href="#aanvraag">/);
 const anchors = [...html.match(/<nav class="onpage" aria-label="Op deze pagina">(.*?)<\/nav>/s)[1].matchAll(/href="#([a-z-]+)"/g)].map(m => m[1]);
 assert.ok(anchors.length >= 5);
 for (const id of anchors) assert.match(html, new RegExp(`id="${id}"`), id);
 assert.match(html, /<p class="tip">Nog geen locatie gekozen\? <a href="https:\/\/atlas\.mijnwindpark\.nl\/">/);
 assert.match(html, /name="locatie" value="Perceel X"/);
});

test('publicLinks: binnen een host relatief, naar de andere host absoluut, lokaal op localhost', () => {
 const site = publicLinks(SITE + '/welkom'), atlas = publicLinks(ATLAS + '/windparken');
 assert.equal(site.href('site', '/waterstofscan'), '/waterstofscan'); assert.equal(site.href('atlas', '/'), ATLAS + '/');
 assert.equal(atlas.href('atlas', '/windparken'), '/windparken'); assert.equal(atlas.href('site', '/welkom'), SITE + '/welkom');
 const local = publicLinks('http://atlas.localhost:8787/');
 assert.equal(local.href('site', '/welkom'), 'http://localhost:8787/welkom'); assert.equal(local.href('atlas', '/'), '/');
 assert.equal(publicLinks('http://localhost:8787/welkom').href('atlas', '/windparken'), 'http://atlas.localhost:8787/windparken');
 // Een preview op workers.dev heeft geen eigen Atlas: daar wijst de kaart naar de echte Atlas.
 assert.equal(publicLinks('https://mijnwindparknl.voorbeeld.workers.dev/welkom').href('atlas', '/'), ATLAS + '/');
});

test('kaart: zoekveld in de gedeelde kop, uitleg-knop, stijl en script met dezelfde versie', async () => {
 const {r, html} = await get(ATLAS + '/');
 assert.doesNotMatch(html, /<!--KOP-->/);
 assert.match(html, /<header class="pub-top pub-wide">.*<a class="pub-logo" id="logo" href="https:\/\/mijnwindpark\.nl\/welkom".*<form id="zoekform" class="atlas-search" role="search">.*<\/header>/s);
 assert.match(html, /<button id="uitleg" type="button" class="atlas-link">Hoe werkt de kaart\?<\/button>/);
 const versions = [...html.matchAll(/\/atlas\.(?:css|js)\?v=([a-z0-9]+)/g)].map(m => m[1]);
 const docVersion = (await get(ATLAS + '/windparken')).html.match(/\/atlas\.css\?v=([a-z0-9]+)/)[1];
 assert.equal(versions.length, 2); assert.ok(versions.every(v => v === docVersion), 'kaart en windparkpagina gebruiken dezelfde versie');
 assert.match(r.headers.get('Content-Security-Policy'), /form-action 'self'/);
 const css = await (await worker.fetch(new Request(ATLAS + '/atlas.css'), env)).text();
 assert.match(css, /\.pub-top\{/); assert.match(css, /\.atlas-legend\{/);
 const js = await (await worker.fetch(new Request(ATLAS + '/atlas.js'), env)).text();
 assert.match(js, /mwp-kaart-uitleg/); assert.match(js, /windparken\.geojson\?v=plaats1/);
});

test('windparken: per provincie met sprongmenu, op zee ingeklapt, zoeken op naam of plaats zonder accenten', async () => {
 const {html} = await get(ATLAS + '/windparken');
 const total = Number(html.match(/(\d+) windparken met een naam en vermogen/)[1]);
 assert.ok(total > 250, String(total));
 assert.equal((html.match(/<li><a href="\/windpark\//g) || []).length, total, 'elk park staat één keer in de lijst');
 const groups = [...html.matchAll(/<(section|details) class="atlas-group" id="([a-z-]+)"/g)].map(m => [m[1], m[2]]);
 const jump = [...html.match(/<nav class="atlas-jump" aria-label="Provincies">(.*?)<\/nav>/s)[1].matchAll(/href="#([a-z-]+)"/g)].map(m => m[1]);
 assert.deepEqual(jump, groups.map(g => g[1]));
 assert.ok(groups.length >= 12);
 assert.deepEqual(groups.at(-1), ['details', 'op-zee'], 'op zee als laatste, ingeklapt');
 assert.doesNotMatch(html, /<details class="atlas-group" id="op-zee" open>/);
 const names = groups.slice(0, -1).map(g => g[1]);
 assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'nl')), 'provincies op alfabet');
 // Windparken in het Caribisch deel van het Koninkrijk liggen buiten de kaart en krijgen geen pagina.
 assert.doesNotMatch(html, /Vader Piet|Playa Kanoa|Tera Kòrá/);
 // Zoeken zonder accenten en op plaatsnaam.
 const fryslan = (await get(ATLAS + '/windparken?q=windpark+fryslan')).html;
 assert.match(fryslan, /\d+ windparken? gevonden voor ‘windpark fryslan’/); assert.match(fryslan, />Windpark Fryslân<\/a> <small>bij Makkum/);
 const zeewolde = (await get(ATLAS + '/windparken?q=Zeewolde')).html;
 assert.match(zeewolde, />Windpark Zeewolde<\/a>/); assert.match(zeewolde, /href="\/windparken">Toon alle windparken<\/a>/);
 assert.ok([...zeewolde.matchAll(/<li><a href="\/windpark\/[^"]+">[^<]+<\/a> <small>([^<]+)<\/small>/g)].every(m => /Zeewolde/.test(m[1])), 'alleen parken bij Zeewolde');
 const none = (await get(ATLAS + '/windparken?q=' + encodeURIComponent('<script>alert(1)</script>'))).html;
 assert.match(none, /Geen windpark gevonden voor ‘&lt;script&gt;alert\(1\)&lt;\/script&gt;’/); assert.doesNotMatch(none, /<script>alert/);
});

test('pagina per windpark: plaatsnaam, kruimelpad, parken in de buurt en de plaats in de aanvraag', async () => {
 const list = (await get(ATLAS + '/windparken?q=Windpark+Zeewolde')).html;
 const path = list.match(/href="(\/windpark\/\d+-windpark-zeewolde)"/)[1];
 const {r, html} = await get(ATLAS + path);
 assert.equal(r.status, 200);
 assert.match(html, /<nav class="atlas-crumbs" aria-label="Kruimelpad"><a href="\/windparken">Windparken<\/a> › <a href="\/windparken#flevoland">Flevoland<\/a> › <span aria-current="page">Windpark Zeewolde<\/span><\/nav>/);
 assert.match(html, /<dt>Ligging<\/dt><dd>bij Zeewolde \(Flevoland\)<\/dd>/);
 const near = html.match(/<h2>Windparken in de buurt<\/h2><ul class="atlas-list atlas-near">(.*?)<\/ul>/s)[1];
 const km = [...near.matchAll(/<small>([\d,]+) km/g)].map(m => Number(m[1].replace(',', '.')));
 assert.ok(km.length > 0 && km.length <= 6 && km.every(v => v <= 20)); assert.deepEqual(km, [...km].sort((a, b) => a - b));
 // De aanvraag krijgt het park en de plaats mee, zodat de bezoeker niets opnieuw hoeft uit te leggen.
 const query = new URLSearchParams({bron: 'windparkpagina', locatie: 'Bij Windpark Zeewolde (Zeewolde, Flevoland)'}).toString().replaceAll('&', '&amp;');
 assert.ok(html.includes(`href="https://mijnwindpark.nl/waterstofscan?${query}&amp;vermogen=`), 'locatie met plaats in de link naar de Waterstofscan');
});

test('kaartgegevens voor de browser: plaats wel, gemeente en provincie alleen op de server', async () => {
 const geo = await (await worker.fetch(new Request(ATLAS + '/windparken.geojson'), env)).json();
 const inNL = f => { const [lon, lat] = f.geometry.coordinates; return lat >= 50.5 && lat <= 54 && lon >= 3 && lon <= 7.5; };
 assert.ok(geo.features.filter(inNL).every(f => typeof f.properties.plaats === 'string' && f.properties.plaats.length > 1));
 assert.ok(geo.features.every(f => !('gemeente' in f.properties) && !('provincie' in f.properties)));
 const teaser = await (await worker.fetch(new Request(ATLAS + '/api/atlas/teaser?lat=53.2&lon=5.79'), env)).json();
 assert.ok(teaser.windparken.every(p => typeof p.plaats === 'string'));
});
