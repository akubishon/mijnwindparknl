import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { parseDWD, parseKMI, parseDMI, unzipText, foreignSamples, coverageOf, heightFactor, parseMFStream, interpolateHours, mfFiles } from '../src/studio/sources.mjs';
import { gzipSync } from 'node:zlib';
import { windRoute, fetchAnyStationYear, seriesStats, completeIndex, emptyIndex } from '../src/studio/wind-data.mjs';
import { STATIONS, stationById, sourceLabel } from '../src/studio/station-catalog.mjs';
import { yearAxis } from '../src/studio/supply.mjs';

// Minimale zip met één deflate-bestand, zoals DWD die levert.
function zip(name, text) {
  const data = Buffer.from(text, 'latin1'), body = deflateRawSync(data), n = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(0, 42);
  const at = 30 + n.length + body.length, end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + n.length, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([local, n, body, central, n, end]);
}
const dwdLine = (t, ff, dd = 200) => `         11;${t};    3;${String(ff).padStart(6)};${String(dd).padStart(4)};eor`;

test('catalogus: KNMI plus Duitsland, België, Denemarken en Frankrijk, elk met bron, land en meethoogte', () => {
  const lands = new Set(STATIONS.map(s => s.land));
  for (const land of ['NL', 'DE', 'BE', 'DK', 'FR']) assert.ok(lands.has(land), land);
  assert.ok(STATIONS.every(s => s.bron && s.meethoogte_m > 0 && s.latitude > 40));
  assert.equal(new Set(STATIONS.map(s => s.id)).size, STATIONS.length, 'unieke id');
  assert.equal(sourceLabel('0-20000-0-06267'), 'KNMI Stavoren');
  assert.match(sourceLabel(STATIONS.find(s => s.bron === 'dwd').id), /^DWD /);
});

test('DWD: zip lezen, -999 is ontbrekend, tijdstempel = einde interval in UTC', async () => {
  const text = 'STATIONS_ID;MESS_DATUM;  QN;FF_10;DD_10;eor\n' + [dwdLine('202501010000', 3.5), dwdLine('202501010010', -999, -999), dwdLine('202501010020', 4.25)].join('\n');
  const back = await unzipText(zip('produkt_zehn_min_ff_20200101_20251231_00011.txt', text), /^produkt_/);
  const s = parseDWD(back, Date.UTC(2025, 0, 1), Date.UTC(2025, 0, 2));
  assert.deepEqual(s.t, [Date.UTC(2025, 0, 1, 0, 0), Date.UTC(2025, 0, 1, 0, 10), Date.UTC(2025, 0, 1, 0, 20)]);
  assert.deepEqual(s.ff, [3.5, null, 4.25]); assert.deepEqual(s.dd, [200, null, 200]);
});

test('KMI-csv en DMI-geojson', () => {
  const k = parseKMI('FID,code,timestamp,wind_speed_10m,wind_direction\na,6418,2025-01-01T00:10:00,9.5,199\nb,6418,2025-01-01T00:00:00,,\n');
  assert.deepEqual(k.t, [Date.UTC(2025, 0, 1, 0, 10), Date.UTC(2025, 0, 1)]); assert.deepEqual(k.ff, [9.5, null]); assert.deepEqual(k.dd, [199, null]);
  const d = parseDMI({ features: [{ properties: { observed: '2025-01-01T00:10:00Z', value: 6.8 } }] });
  assert.deepEqual(d, { t: [Date.UTC(2025, 0, 1, 0, 10)], ff: [6.8], dd: [null] });
});

test('meethoogte: 15 m wordt met (10/h)^(1/7) naar 10 m omgerekend', () => {
  assert.equal(heightFactor(10), 1); assert.ok(Math.abs(heightFactor(15) - (10 / 15) ** (1 / 7)) < 1e-12);
});

test('DWD-windjaar via de studio-API: historisch bestand, op de jaaras, bewaard in R2 en in de index', async () => {
  const station = STATIONS.find(s => s.bron === 'dwd' && s.meethoogte_m === 10), code = station.id.slice(4), axis = yearAxis(2025);
  // Alle intervallen van 2025 (KNMI-as: einde interval = moment + 5 min, dus de reeks loopt van 31-12 23:10 UTC).
  const lines = [];
  for (let i = 0; i < axis.n; i++) { const d = new Date((axis.start + 300 + i * 600) * 1000).toISOString(); lines.push(dwdLine(d.slice(0, 16).replace(/[-T:]/g, ''), i % 2 ? 5 : 7)); }
  const file = zip(`produkt_zehn_min_ff_20200101_20251231_${code}.txt`, 'STATIONS_ID;MESS_DATUM;  QN;FF_10;DD_10;eor\n' + lines.join('\n'));
  const calls = [];
  const fake = async url => { calls.push(url); if (url.endsWith('/historical/')) return new Response(`<a href="10minutenwerte_wind_${code}_20200101_20251231_hist.zip">x</a> <a href="10minutenwerte_wind_${code}_20100101_20191231_hist.zip">y</a>`); if (url.includes(`_${code}_20200101_20251231_hist.zip`)) return new Response(file); return new Response('', { status: 404 }); };
  const series = await fetchAnyStationYear(station.id, 2025, {}, fake);
  assert.equal(calls.length, 2, 'lijst + één zip, geen recent/ omdat historisch het jaar dekt');
  const stats = seriesStats(series); assert.equal(stats.dekking, 1); assert.equal(stats.gemiddeld_ms, 6);
  const store = new Map(), bucket = { get: async k => store.has(k) ? { body: store.get(k), json: async () => JSON.parse(store.get(k)) } : null, put: async (k, v) => store.set(k, v) };
  const answer = (v, status = 200) => Response.json(v, { status }), url = new URL(`https://x/api/studio/wind10/${station.id}/2025`);
  const saved = await (await windRoute(null, { BUCKET: bucket }, url, answer, fake)).json();
  assert.equal(saved.bron, 'dwd'); assert.equal(saved.land, 'DE'); assert.equal(saved.n, axis.n);
  const index = await (await windRoute(null, { BUCKET: bucket }, new URL('https://x/api/studio/stations'), answer)).json();
  assert.equal(index.stations.find(s => s.id === station.id).dekking[2025], 1);
  const down = await windRoute(null, { BUCKET: { get: async () => null, put: async () => {} } }, url, answer, async () => new Response('', { status: 503 }));
  assert.equal(down.status, 502); assert.match((await down.json()).error, /DWD/);
});

test('oude index (alleen KNMI) wordt aangevuld met de buurlanden, dekking blijft', () => {
  const old = emptyIndex(); old.stations = old.stations.filter(s => s.land === 'NL').map(s => ({ id: s.id, naam: s.naam, lat: s.lat, lon: s.lon, dekking: { 2025: 0.95 }, gemiddeld_ms: 5 }));
  const next = completeIndex(old);
  assert.equal(next.stations.length, STATIONS.length); assert.equal(next.stations.find(s => s.id === '0-20000-0-06267').dekking[2025], 0.95);
  assert.ok(next.stations.some(s => s.land === 'DK' && s.bron === 'dmi'));
});

test('dagweergave: buitenlands station als KNMI-achtig antwoord, omgerekend naar 10 m', async () => {
  const st = STATIONS.find(s => s.bron === 'dmi'), f = heightFactor(st.meethoogte_m);
  const fake = async url => { const p = new URL(url).searchParams.get('parameterId'); return Response.json({ features: [{ properties: { observed: '2025-03-01T12:10:00Z', value: p === 'wind_dir' ? 270 : 8 } }] }); };
  const s = await foreignSamples(st.id, Date.UTC(2025, 2, 1), Date.UTC(2025, 2, 2), fake);
  assert.equal(s.ff[0], Math.round(8 * f * 1000) / 1000); assert.equal(s.dd[0], 270);
  const c = coverageOf(st.id, s);
  assert.equal(c.coverages[0]['eumetnet:locationId'], st.id); assert.equal(c.coverages[0].domain.axes.t.values[0], '2025-03-01T12:10:00.000Z');
});

test('Météo-France: uurbestand gestreamd, alleen dit station, lineair naar tien minuten', async () => {
  const csv = 'NUM_POSTE;NOM_USUEL;LAT;LON;ALTI;AAAAMMJJHH;RR1;QRR1;FF;QFF;DD;QDD\n'
    + '59178001;DOUAI;50.39;3.07;26;2025010100;0;1;4.0;1;200;1\n'
    + '59999999;ANDERS;50;3;1;2025010100;0;1;99;1;10;1\n'
    + '59178001;DOUAI;50.39;3.07;26;2025010101;0;1;7.0;1;210;1\n'
    + '59178001;DOUAI;50.39;3.07;26;2025010102;0;1;;;;\n';
  const stream = new Response(gzipSync(Buffer.from(csv))).body.pipeThrough(new DecompressionStream('gzip'));
  const from = Date.UTC(2025, 0, 1), to = Date.UTC(2025, 0, 1, 2);
  const hours = await parseMFStream(stream, '59178001', from, to);
  assert.equal(hours.size, 3); assert.deepEqual(hours.get(from), [4, 200]);
  const s = interpolateHours(hours, from, to);
  assert.equal(s.t.length, 13);
  assert.deepEqual(s.ff.slice(0, 7), [4, 4.5, 5, 5.5, 6, 6.5, 7]);
  assert.ok(s.ff.slice(7).every(v => v === null), 'geen waarde na het laatste gemeten uur');
  assert.deepEqual(mfFiles('59', Date.UTC(2025, 0, 1), Date.UTC(2025, 11, 31)), ['H_59_latest-2025-2026.csv.gz']);
  assert.deepEqual(mfFiles('2A', Date.UTC(2024, 11, 31, 23), Date.UTC(2025, 0, 2)), ['H_2A_previous-2020-2024.csv.gz', 'H_2A_latest-2025-2026.csv.gz']);
});
