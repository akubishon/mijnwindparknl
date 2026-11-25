import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSupply, yearAxis, bolswardParks, supplySummary, YEARS } from '../src/studio/supply.mjs';
import { parkPowerModel, parkFromFeature, KNOWN, HOUTRIBDIJK, STAVOREN, hubFactor } from '../src/studio/park-model.mjs';
import { suggestStations, isSeaStation } from '../src/studio/stations.mjs';
import { windPowerModel, modelOptions } from '../src/knmi.mjs';

const bundle = year => JSON.parse(readFileSync(new URL(`../src/opsplitsing/data/${year}.json`, import.meta.url)));
// Stationsreeksen uit de bundel op de volle jaaras; momenten zonder beide metingen zijn NaN.
function windFromBundle(data) {
  const axis = yearAxis(data.jaar), h = new Float64Array(axis.n).fill(NaN), s = new Float64Array(axis.n).fill(NaN);
  data.t.forEach((t, k) => { const i = (t - axis.start) / 600; h[i] = data.stations.houtribdijk[k]; s[i] = data.stations.stavoren[k]; });
  return { axis, wind: { [HOUTRIBDIJK]: h, [STAVOREN]: s } };
}

for (const year of [2022, 2023, 2024, 2025]) test(`pariteit Bolsward ${year}: exact dezelfde mw als de opsplitsing`, () => {
  const data = bundle(year), { axis, wind } = windFromBundle(data);
  assert.equal((data.t[0] - axis.start) % 600, 0);
  const supply = buildSupply({ jaar: year, parks: bolswardParks(), wind, axis });
  assert.deepEqual(supply.t, data.t);
  const diff = supply.mw.findIndex((v, i) => v !== data.mw[i]);
  assert.equal(diff, -1, `eerste verschil op index ${diff}: ${supply.mw[diff]} ≠ ${data.mw[diff]}`);
  assert.deepEqual(supply.v10.fryslan, data.v10.fryslan);
  assert.ok(Math.abs(supply.park_mwh.fryslan - data.park_mwh.fryslan) < 1e-6 * data.park_mwh.fryslan);
});

test('parkPowerModel geeft voor Fryslân en Beabuorren hetzelfde als windPowerModel', () => {
  for (const [id, park] of [['fryslan', bolswardParks()[0]], ['beabuorren', bolswardParks()[1]]]) for (const day of ['2025-01-15', '2025-07-01', '2024-03-31']) {
    const ours = parkPowerModel(park, day), theirs = windPowerModel(day, { ...modelOptions(new URLSearchParams({ park: id })), stationId: 'gemiddelde', park: id });
    for (let v = 0; v <= 30; v += 0.37) assert.ok(Math.abs(ours(v) - theirs(v)) <= 1e-12 * Math.max(1, theirs(v)), `${id} ${day} ${v}`);
    assert.equal(ours(null), null);
  }
});

test('standaardpark: geschaalde curve, seizoens-α, zogverlies', () => {
  const park = parkFromFeature({ geometry: { coordinates: [6.5, 53.3] }, properties: { naam: 'Test', mw: 20, turbines: 10 } });
  assert.equal(park.curve, 'standaard'); assert.equal(park.rated_kw, 2000); assert.equal(park.hub_height_m, 100); assert.equal(park.herkomst.hub_height_m, 'aanname');
  assert.equal(park.id, 'osm:53.3000,6.5000');
  const model = parkPowerModel(park, '2025-06-01');
  assert.ok(Math.abs(model(30) - 0) < 1e-9);
  assert.ok(model(10) > 0 && model(10) <= 20);
  assert.ok(Math.abs(model(15) - 20) < 1e-9, 'vol vermogen bij harde wind');
  assert.ok(hubFactor(park, '2025-01-01') > hubFactor(park, '2025-07-01'), 'winter hogere α');
});

test('OSM-park bij Fryslân en Beabuorren gebruikt het bekende model', () => {
  assert.equal(parkFromFeature({ geometry: { coordinates: [KNOWN.fryslan.lon + 0.01, KNOWN.fryslan.lat] }, properties: {} }).id, 'fryslan');
  assert.equal(parkFromFeature({ geometry: { coordinates: [KNOWN.beabuorren.lon, KNOWN.beabuorren.lat] }, properties: {} }).curve, 'beabuorren');
});

test('ontbrekende data: momenten zonder alle stations vallen weg; ontbrekend station geeft een fout', () => {
  const axis = { start: 0, n: 4, step: 600 }, park = { ...parkFromFeature({ geometry: { coordinates: [6, 53] }, properties: { mw: 3, turbines: 1 } }), aandeel: 0.5, stations: ['a', 'b'] };
  const s = buildSupply({ jaar: 2025, parks: [park], wind: { a: Float64Array.of(8, NaN, 9, 10), b: Float64Array.of(8, 7, NaN, 12) }, axis });
  assert.deepEqual(s.t, [0, 1800]); assert.deepEqual(s.v10[park.id], [8, 11]);
  assert.throws(() => buildSupply({ jaar: 2025, parks: [park], wind: { a: Float64Array.of(1, 2, 3, 4) }, axis }), /ontbreekt/);
  assert.throws(() => buildSupply({ jaar: 2025, parks: [{ ...park, aandeel: 0 }], wind: {}, axis }), /minstens één park/);
  const summary = supplySummary(s, [park]);
  assert.equal(summary.momenten, 2); assert.equal(summary.duurkromme.length, 101);
});

test('stationsvoorstel: dichtstbijzijnde met dekking, paar binnen 25 km, waarschuwingen', () => {
  const dekking = { 2022: 0.99, 2023: 0.99, 2024: 0.99, 2025: 0.99 };
  const index = { stations: [
    { id: HOUTRIBDIJK, naam: 'Houtribdijk', lat: 52.6481, lon: 5.4006, dekking, gemiddeld_ms: 6 },
    { id: STAVOREN, naam: 'Stavoren', lat: 52.8967, lon: 5.3833, dekking, gemiddeld_ms: 6 },
    { id: 'x', naam: 'Slecht', lat: 52.8, lon: 5.35, dekking: { ...dekking, 2025: 0.5 }, gemiddeld_ms: 5 },
  ] };
  const r = suggestStations({ lat: 52.78, lon: 5.39 }, index);
  assert.equal(r.lijst[0].id, 'x');
  assert.deepEqual(r.voorstel.enkel, [STAVOREN]);
  assert.deepEqual(r.voorstel.paar, [STAVOREN, HOUTRIBDIJK]);
  const far = suggestStations({ lat: 51.0, lon: 6.0 }, index);
  assert.ok(far.waarschuwingen.some(w => /25 km/.test(w)));
  assert.equal(isSeaStation('0-20000-0-06321'), true); assert.equal(isSeaStation(HOUTRIBDIJK), false);
});
