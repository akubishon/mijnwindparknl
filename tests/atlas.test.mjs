import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const worker = (await import(`data:text/javascript;base64,${Buffer.from(source + '\n// atlas').toString('base64')}`)).default;
const index = { jaar: 2025, stations: [{ id: '0-20000-0-06270', mean_ms: 4.5, uren: 8760 }] };
const env = { SITE_PASSWORD: 'fixture-site-password', BUCKET: { async get(key) { return key.endsWith('index.json') ? { json: async () => index } : null; } } };
const host = 'https://atlas.mijnwindpark.nl';

test('atlas teaser: alleen windparken met een KNMI-station binnen 25 km, zonder LCOH', async () => {
 const r = await worker.fetch(new Request(host + '/api/atlas/teaser?lat=53.2&lon=5.79'), env);
 assert.equal(r.status, 200);
 const d = await r.json();
 assert.ok(d.windparken.length > 0 && d.windparken.length <= 8);
 for (const p of d.windparken) {
  assert.ok(Number.isInteger(p.id));
  assert.equal(p.station.naam, 'Leeuwarden Airport');
  assert.ok(p.station.afstand_km <= 25, JSON.stringify(p));
  assert.ok(p.afstand_km <= 30);
 }
 assert.equal(d.windparken[0].station.wind_gem_ms, 4.5);
 assert.ok(!JSON.stringify(d).toLowerCase().includes('lcoh'));
 assert.equal((await worker.fetch(new Request(host + '/elektrolyser'), env)).status, 404);
});

test('atlas lcoh: 401 zonder wachtwoord', async () => {
 const r = await worker.fetch(new Request(host + '/api/atlas/lcoh', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify({ lat: 53.2, lon: 5.79 }) }), env);
 assert.equal(r.status, 401);
 assert.ok(!('lcoh_eur_kg' in await r.json()));
});

test('atlas: de afstand windpark → KNMI-station telt, niet perceel → station', async () => {
 const geo = await (await worker.fetch(new Request(host + '/windparken.geojson'), env)).json();
 assert.ok(geo.features.every((f, i) => f.properties.id === i));
 const leeuwarden = [5.7517, 53.2231];
 const dist = f => Math.hypot((f.geometry.coordinates[0] - leeuwarden[0]) * 66.8, (f.geometry.coordinates[1] - leeuwarden[1]) * 111.2);
 const near = geo.features.filter(f => dist(f) < 20), far = geo.features.filter(f => dist(f) > 30);
 assert.ok(near.length && near.every(f => f.properties.knmi === 'Leeuwarden Airport'));
 assert.ok(far.length && far.every(f => f.properties.knmi === null));
 // Perceel zonder geschikt windpark binnen 30 km (Maastricht): niet te kiezen.
 const r = await worker.fetch(new Request(host + '/api/atlas/teaser?lat=50.85&lon=5.69'), env);
 assert.equal(r.status, 422);
 assert.match((await r.json()).error, /KNMI-station/);
 // Perceel op ruim 25 km van het station, maar met een park dichtbij het station: wel te kiezen.
 const t = await worker.fetch(new Request(host + '/api/atlas/teaser?lat=53.2&lon=5.3'), env);
 assert.equal(t.status, 200);
 const s = await (await worker.fetch(new Request(host + '/api/atlas/stations'), env)).json();
 assert.equal(s.max_km, 25);
 assert.deepEqual(s.stations.map(x => x.naam), ['Leeuwarden Airport']);
 let ip = 10;
 const post = parken => worker.fetch(new Request(host + '/api/atlas/lcoh', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.' + ip++ }, body: JSON.stringify({ lat: 53.2, lon: 5.79, parken, password: env.SITE_PASSWORD }) }), env);
 for (const parken of [undefined, [], [-1], [1.5], ['3'], [geo.features.length]]) assert.equal((await post(parken)).status, 400, JSON.stringify(parken));
 assert.equal((await post([geo.features.indexOf(far[0])])).status, 422);
});

// Opslag in het geheugen met een synthetische windreeks voor Leeuwarden (alleen voor deze tests).
function memoryEnv() {
 const store = new Map();
 const bytes = Buffer.from(Array.from({ length: 8760 }, (_, i) => 30 + Math.round(40 * Math.abs(Math.sin(i / 37)))));
 store.set('atlas/v1/wind-2025/index.json', JSON.stringify(index));
 store.set('atlas/v1/wind-2025/0-20000-0-06270.json', JSON.stringify({ station: '0-20000-0-06270', start: '2025-01-01T00:00:00Z', data: bytes.toString('base64') }));
 return { store, SITE_PASSWORD: 'fixture-site-password', BUCKET: {
  async get(key) { const v = store.get(key); return v === undefined ? null : { json: async () => JSON.parse(v) }; },
  async put(key, value) { store.set(key, String(value)); },
 } };
}

test('atlas tellingen: alleen bekende stappen, per dag opgeteld, zonder persoonsgegevens', async () => {
 const e = memoryEnv();
 const send = (body, ip = '198.51.100.1') => worker.fetch(new Request(host + '/api/atlas/event', { method: 'POST', headers: { 'CF-Connecting-IP': ip }, body }), e);
 for (const b of ['{"e":"kaart"}', '{"e":"kaart"}', '{"e":"cta"}', '{"e":"onbekend"}', 'geen json']) assert.equal((await send(b)).status, 204);
 const day = [...e.store.keys()].find(k => k.startsWith('atlas/v1/events/'));
 assert.match(day, /^atlas\/v1\/events\/\d{4}-\d{2}-\d{2}\.json$/);
 assert.deepEqual(JSON.parse(e.store.get(day)), { kaart: 2, cta: 1 });
});

test('atlas locatieprofiel: lead met bron en locatie, windaanbod relatief, geen kostprijs', async () => {
 const e = memoryEnv();
 const geo = await (await worker.fetch(new Request(host + '/windparken.geojson'), e)).json();
 const park = geo.features.find(f => f.properties.knmi && f.properties.mw > 0);
 const body = { naam: 'Anna', organisatie: 'Waterstof Noord', email: 'anna@example.nl', toestemming: true, lat: 53.2, lon: 5.79, perceel: 'Leeuwarden A 1234', parken: [park.properties.id], bron: 'adviseur-x' };
 const send = (b, origin = host, ip = '198.51.100.9') => worker.fetch(new Request(host + '/api/atlas/profiel', { method: 'POST', headers: { Origin: origin, 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }), e);
 assert.equal((await send(body, 'https://elders.example')).status, 403);
 assert.equal((await send({ ...body, toestemming: false }, host, '198.51.100.2')).status, 400);
 const r = await send(body, host, '198.51.100.3');
 assert.equal(r.status, 200);
 const d = await r.json();
 assert.equal(d.perceel, 'Leeuwarden A 1234');
 assert.equal(d.windparken[0].station.naam, 'Leeuwarden Airport');
 assert.ok(d.vollasturen > 0 && d.vollasturen < 8760);
 assert.ok(d.percentiel >= 0 && d.percentiel <= 100);
 assert.ok(!/lcoh|eur|€|capex/i.test(JSON.stringify(d)), 'geen kostprijs in het profiel');
 const lead = JSON.parse([...e.store].find(([k]) => k.startsWith('leads/v1/'))[1]);
 assert.equal(lead.bron, 'atlas-profiel');
 assert.match(lead.locatie, /^Perceel Leeuwarden A 1234 \(53\.2, 5\.79\); windparken: /);
 assert.match(lead.toelichting, /Campagne: adviseur-x/);
 assert.equal(lead.email, 'anna@example.nl');
 // Een ingevuld lokveld geeft wel een profiel, maar wordt niet bewaard.
 const before = [...e.store.keys()].filter(k => k.startsWith('leads/v1/')).length;
 assert.equal((await send({ ...body, website: 'spam' }, host, '198.51.100.4')).status, 200);
 assert.equal([...e.store.keys()].filter(k => k.startsWith('leads/v1/')).length, before);
});

test('atlas pagina per windpark: alleen benoemde parken, canonieke slug, sitemap en robots', async () => {
 const e = memoryEnv();
 const list = await worker.fetch(new Request(host + '/windparken'), e);
 assert.equal(list.status, 200);
 const html = await list.text();
 assert.match(html, /Conceptwebsite/);
 assert.doesNotMatch(html, />Windturbines \(\d+\)</);
 const href = html.match(/href="(\/windpark\/(\d+)-[a-z0-9-]+)"/);
 const page = await worker.fetch(new Request(host + href[1]), e);
 assert.equal(page.status, 200);
 const body = await page.text();
 assert.match(body, /<h1>Waterstof bij /);
 assert.match(body, /<link rel="canonical" href="https:\/\/atlas\.mijnwindpark\.nl\/windpark\//);
 assert.match(body, /bron=windparkpagina/);
 assert.doesNotMatch(body, /<script/i);
 const wrong = await worker.fetch(new Request(host + `/windpark/${href[2]}-verkeerd`), e);
 assert.equal(wrong.status, 301);
 assert.equal(wrong.headers.get('Location'), href[1]);
 const geo = await (await worker.fetch(new Request(host + '/windparken.geojson'), e)).json();
 const generic = geo.features.find(f => /^Windturbines \(\d+\)$/.test(f.properties.naam));
 assert.equal((await worker.fetch(new Request(host + `/windpark/${generic.properties.id}`), e)).status, 404);
 const robots = await (await worker.fetch(new Request(host + '/robots.txt'), e)).text();
 // Conceptfase: niets indexeren, ook niet de windparkpagina's.
 assert.equal(robots, 'User-agent: *\nDisallow: /\n');
 assert.equal(page.headers.get('X-Robots-Tag'), 'noindex, nofollow');
 assert.equal((await worker.fetch(new Request(host + '/'), e)).headers.get('X-Robots-Tag'), 'noindex, nofollow');
 const sitemap = await (await worker.fetch(new Request(host + '/sitemap.xml'), e)).text();
 assert.ok(sitemap.includes(`<loc>https://atlas.mijnwindpark.nl${href[1]}</loc>`));
});

test('atlas-pagina: conceptbalk, link naar windparken, en de browsercode bevat geen kostprijs', async () => {
 const html = await (await worker.fetch(new Request(host + '/'), env)).text();
 assert.match(html, /Conceptwebsite/); assert.match(html, /href="\/windparken"/);
 const js = await (await worker.fetch(new Request(host + '/atlas.js'), env)).text();
 assert.match(js, /waterstofscan/); assert.match(js, /\/api\/atlas\/profiel/);
 assert.doesNotMatch(js, /capex|COST_DEFAULTS|stroomprijs/);
});
