import test from 'node:test';
import assert from 'node:assert/strict';
import { readWind, readWindComparison, modelOptions } from '../src/knmi.mjs';
import { parkDay, parkDayComparison, averageMany, isSiteDefault, findPark } from '../src/studio/park-day.mjs';
import { bolswardParks } from '../src/studio/supply.mjs';
import { parkFromFeature, HOUTRIBDIJK, STAVOREN } from '../src/studio/park-model.mjs';

// Nep-KNMI: per station een vaste, verschillende windreeks over de hele dag (UTC-venster zoals fetchStation vraagt).
const DAY = '2025-03-12';
globalThis.fetch = async url => {
  const u = new URL(url), id = decodeURIComponent(u.pathname.split('/').pop()), [from, to] = u.searchParams.get('datetime').split('/').map(Date.parse);
  const t = [], ff = [], dd = [];
  for (let s = from; s <= to; s += 600000) { t.push(new Date(s).toISOString()); const k = (s / 600000) % 97; ff.push(id === STAVOREN ? 3 + (k % 13) : id === HOUTRIBDIJK ? 4 + (k % 11) * 1.1 : (k % 7) === 0 ? null : 5 + k % 9); dd.push(200); }
  return Response.json({ type: 'CoverageCollection', parameters: { ff: { unit: { symbol: { value: 'm/s' } } } }, coverages: [{ 'eumetnet:locationId': id, domain: { axes: { t: { values: t } } }, ranges: { ff: { values: ff }, dd: { values: dd } } }] });
};
const env = { KNMI_EDR_API_KEY: 'x' };

test('parkdag Bolsward geeft voor Fryslân en Beabuorren hetzelfde als /api/wind', async () => {
  for (const park of bolswardParks()) {
    assert.ok(isSiteDefault(park));
    const ours = await parkDay(park, DAY, env), site = await readWind(DAY, env, modelOptions(new URLSearchParams({ park: park.id })));
    assert.deepEqual(ours.hours, site.hours);
    assert.deepEqual(ours.intervals.map(p => [p.start, p.powerMW, p.windSpeedMS]), site.intervals.map(p => [p.start, p.powerMW, p.windSpeedMS]));
    assert.equal(ours.windSource, site.windSource);
  }
});

test('stationsvergelijking: elk station apart, combinatie met verschilband', async () => {
  const [fryslan] = bolswardParks(), ours = await parkDayComparison(fryslan, DAY, env), site = await readWindComparison(DAY, env, modelOptions(new URLSearchParams({ park: 'fryslan' })));
  assert.equal(ours.stations.length, 2);
  assert.deepEqual(ours.combination.map(p => p.powerMW), site.combination.map(p => p.powerMW));
  assert.ok(ours.combination.some(p => p.differenceMW > 0));
});

test('standaardpark met één station: daggrafiek met gaten, geen invulling', async () => {
  const park = { ...parkFromFeature({ geometry: { coordinates: [6.6, 53.2] }, properties: { naam: 'Groningen', mw: 30, turbines: 10 } }), aandeel: 1, stations: ['0-20000-0-06280'] };
  assert.equal(isSiteDefault(park), false);
  const r = await parkDay(park, DAY, env);
  assert.equal(r.hours.length, 24); assert.match(r.windSource, /aanname/);
  assert.ok(r.intervals.some(p => p.powerMW === null) && r.intervals.some(p => p.powerMW > 0));
  assert.ok(r.intervals.every(p => p.powerMW === null || p.powerMW <= 30 + 1e-9));
});

test('gemiddelde van drie stations alleen als alle drie meten', () => {
  const raw = (id, ff) => ({ parameters: { ff: { unit: { symbol: { value: 'm/s' } } } }, coverages: [{ 'eumetnet:locationId': id, domain: { axes: { t: { values: ['a', 'b'] } } }, ranges: { ff: { values: ff } } }] });
  assert.deepEqual(averageMany([raw('x', [3, 4]), raw('y', [6, null]), raw('z', [9, 1])]).coverages[0].ranges.ff.values, [6, null]);
});

test('park zoeken: Bolsward vast, onbekend project geeft null', async () => {
  assert.equal((await findPark({}, 'bolsward', 'fryslan')).aandeel, 0.1);
  assert.equal(await findPark({}, 'onbekend', 'fryslan'), null);
});
