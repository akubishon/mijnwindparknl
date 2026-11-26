import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeSeries, decodeSeries, seriesFromCoverage, windFile, seriesStats, updateIndex, emptyIndex, windRoute, fetchStationYear, MISSING } from '../src/studio/wind-data.mjs';
import { yearAxis } from '../src/studio/supply.mjs';
import { HOUTRIBDIJK, STAVOREN } from '../src/studio/park-model.mjs';

const bundle = year => JSON.parse(readFileSync(new URL(`../src/opsplitsing/data/${year}.json`, import.meta.url)));
// KNMI-antwoord zoals EDR het geeft: tijdstempel = einde van het tien-minuteninterval (moment + 5 min).
const coverage = (id, t, ff) => ({ type: 'CoverageCollection', parameters: { ff: { unit: { symbol: { value: 'm/s' } } } }, coverages: [{ 'eumetnet:locationId': id, domain: { axes: { t: { values: t.map(s => new Date((s + 300) * 1000).toISOString()) } } }, ranges: { ff: { values: ff } } }] });

test('coderen en decoderen is verliesvrij voor KNMI-waarden (twee decimalen)', () => {
  const values = Float64Array.of(0, 0.01, 16.27, NaN, 655.34, -1);
  const back = decodeSeries({ data: encodeSeries(values), n: values.length });
  assert.deepEqual([...back].slice(0, 3), [0, 0.01, 16.27]); assert.ok(Number.isNaN(back[3])); assert.equal(back[4], 655.34); assert.ok(Number.isNaN(back[5]));
});

for (const year of [2022, 2025]) test(`Houtribdijk en Stavoren ${year} gelijk aan de bundel na opslag`, () => {
  const data = bundle(year);
  for (const [id, key] of [[HOUTRIBDIJK, 'houtribdijk'], [STAVOREN, 'stavoren']]) {
    const series = seriesFromCoverage(coverage(id, data.t, data.stations[key]), id, year);
    const file = JSON.parse(JSON.stringify(windFile(id, year, series)));
    assert.equal(file.n, yearAxis(year).n); assert.equal(file.ontbrekend, MISSING);
    const back = decodeSeries(file), axis = yearAxis(year);
    data.t.forEach((t, k) => assert.equal(back[(t - axis.start) / 600], data.stations[key][k]));
  }
  assert.equal(windFile(HOUTRIBDIJK, 2025, new Float64Array(yearAxis(2025).n)).start, '2024-12-31T23:05:00.000Z');
});

test('index: dekking en gemiddelde per station bijwerken', () => {
  const n = yearAxis(2025).n, series = new Float64Array(n).fill(5); series.fill(NaN, 0, n / 2);
  const index = updateIndex(emptyIndex(), HOUTRIBDIJK, 2025, seriesStats(series));
  const entry = index.stations.find(s => s.id === HOUTRIBDIJK);
  assert.equal(entry.dekking[2025], 0.5); assert.deepEqual(index.jaren, [2025]); assert.equal(entry.gemiddeld_ms, 5); assert.equal(index.voorlopig, true);
  assert.ok(!emptyIndex().stations.some(s => s.lat < 40), 'geen Caribische stations');
});

test('API: haalt eenmalig op bij KNMI, bewaart in R2 en leest daarna uit R2', async () => {
  const store = new Map(), bucket = { get: async k => store.has(k) ? { body: store.get(k), json: async () => JSON.parse(store.get(k)) } : null, put: async (k, v) => store.set(k, v) };
  const data = bundle(2025);
  let calls = 0;
  const fake = async url => { calls++; const m = new URL(url).searchParams.get('datetime').split('/').map(Date.parse); const keep = data.t.map((t, k) => k).filter(k => (data.t[k] + 300) * 1000 >= m[0] && (data.t[k] + 300) * 1000 <= m[1]); return Response.json(coverage(STAVOREN, keep.map(k => data.t[k]), keep.map(k => data.stations.stavoren[k]))); };
  const answer = (v, status = 200) => Response.json(v, { status });
  const env = { BUCKET: bucket, KNMI_EDR_API_KEY: 'x' };
  const url = new URL('https://intern.mijnwindpark.nl/api/studio/wind10/' + STAVOREN + '/2025');
  const first = await (await windRoute(new Request(url), env, url, answer, fake)).json();
  assert.equal(calls, 1, 'één verzoek per windjaar'); assert.equal(first.station, STAVOREN);
  const second = await (await windRoute(new Request(url), env, url, answer, fake)).json();
  assert.equal(calls, 1); assert.equal(second.data, first.data);
  const index = await (await windRoute(null, env, new URL('https://x/api/studio/stations'), answer)).json();
  assert.ok(index.stations.find(s => s.id === STAVOREN).dekking[2025] > 0.9);
  assert.equal((await windRoute(null, env, new URL('https://x/api/studio/wind10/0-20000-0-99999/2025'), answer)).status, 400);
  assert.equal((await windRoute(null, env, new URL('https://x/api/studio/wind10/' + HOUTRIBDIJK + '/2024'), answer, fake)).status, 400, 'alleen 2025');
  assert.equal((await windRoute(null, { BUCKET: bucket }, new URL('https://x/api/studio/wind10/' + HOUTRIBDIJK + '/2025'), answer, fake)).status, 502);
  await assert.rejects(fetchStationYear(STAVOREN, 2025, '', fake), /KNMI_NOT_CONFIGURED/);
  // Te groot voor één antwoord: vier kwartalen, zelfde reeks. Quotum op: eigen foutmelding en 429.
  let parts = 0;
  const split = async url => { const [a, b] = new URL(url).searchParams.get('datetime').split('/').map(Date.parse); if (b - a > 200 * 86400000) return new Response('{}', { status: 413 }); parts++; return fake(url); };
  const quarters = await fetchStationYear(STAVOREN, 2025, 'x', split);
  assert.equal(parts, 4); assert.equal(windFile(STAVOREN, 2025, quarters).data, first.data);
  await assert.rejects(fetchStationYear(STAVOREN, 2024, 'x', async () => new Response('{"error":"Quota exceeded"}', { status: 403 })), /KNMI_QUOTA/);
  const quota = await windRoute(null, { BUCKET: bucket, KNMI_EDR_API_KEY: 'x' }, new URL('https://x/api/studio/wind10/' + HOUTRIBDIJK + '/2025'), answer, async () => new Response('{"error":"Quota exceeded"}', { status: 403 }));
  assert.equal(quota.status, 429);
  // Nationale WIGOS-reeks (0-528-0-…), o.a. Hollandse Kust Noord: de route herkent ze en vraagt KNMI met dat ID.
  const hkn = '0-528-0-06213', asked = [];
  const viaHkn = await windRoute(null, env, new URL('https://x/api/studio/wind10/' + hkn + '/2025'), answer, async u => { asked.push(u); return Response.json(coverage(hkn, [data.t[0]], [7])); });
  assert.equal(viaHkn.status, 200); assert.equal((await viaHkn.json()).station, hkn); assert.ok(asked[0].includes(encodeURIComponent(hkn)));
});
