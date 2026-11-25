import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const worker = (await import(`data:text/javascript;base64,${Buffer.from(source + '\n// atlas').toString('base64')}`)).default;
const index = { jaar: 2025, stations: [{ id: '0-20000-0-06270', mean_ms: 4.5, uren: 8760 }] };
const env = { SITE_PASSWORD: 'fixture-site-password', BUCKET: { async get(key) { return key.endsWith('index.json') ? { json: async () => index } : null; } } };
const host = 'https://atlas.mijnwindpark.nl';

test('atlas teaser: station, wind en windparken, zonder LCOH', async () => {
 const r = await worker.fetch(new Request(host + '/api/atlas/teaser?lat=53.2&lon=5.79'), env);
 assert.equal(r.status, 200);
 assert.match(r.headers.get('Cache-Control'), /max-age=86400/);
 const d = await r.json();
 assert.equal(d.station.wind_gem_ms, 4.5);
 assert.equal(d.windparken.length, 8);
 assert.ok(d.windparken.every(p => Number.isInteger(p.id)));
 assert.ok(!JSON.stringify(d).toLowerCase().includes('lcoh'));
 assert.equal((await worker.fetch(new Request(host + '/elektrolyser'), env)).status, 404);
});

test('atlas lcoh: 401 zonder wachtwoord', async () => {
 const r = await worker.fetch(new Request(host + '/api/atlas/lcoh', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify({ lat: 53.2, lon: 5.79 }) }), env);
 assert.equal(r.status, 401);
 assert.ok(!('lcoh_eur_kg' in await r.json()));
});

test('atlas: perceel zonder KNMI-station binnen 25 km is niet te kiezen', async () => {
 // Leeuwarden Airport ligt op 53.22/5.75; Maastricht ligt er ver buiten.
 const r = await worker.fetch(new Request(host + '/api/atlas/teaser?lat=50.85&lon=5.69'), env);
 assert.equal(r.status, 422);
 assert.match((await r.json()).error, /KNMI-station/);
 const s = await (await worker.fetch(new Request(host + '/api/atlas/stations'), env)).json();
 assert.equal(s.max_km, 25);
 assert.deepEqual(s.stations.map(x => x.naam), ['Leeuwarden Airport']);
 const lcoh = await worker.fetch(new Request(host + '/api/atlas/lcoh', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.2' }, body: JSON.stringify({ lat: 50.85, lon: 5.69, parken: [0], password: env.SITE_PASSWORD }) }), env);
 assert.equal(lcoh.status, 422);
});

test('atlas: windparken hebben een id en de LCOH vraagt een eigen keuze', async () => {
 const geo = await (await worker.fetch(new Request(host + '/windparken.geojson'), env)).json();
 assert.ok(geo.features.every((f, i) => f.properties.id === i));
 let ip = 10;
 const post = parken => worker.fetch(new Request(host + '/api/atlas/lcoh', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.' + ip++ }, body: JSON.stringify({ lat: 53.2, lon: 5.79, parken, password: env.SITE_PASSWORD }) }), env);
 for (const parken of [undefined, [], [-1], [1.5], ['3'], [geo.features.length]]) assert.equal((await post(parken)).status, 400, JSON.stringify(parken));
});
