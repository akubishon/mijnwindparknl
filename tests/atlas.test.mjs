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
