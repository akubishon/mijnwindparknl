import test from 'node:test';
import assert from 'node:assert/strict';
import { stepStatus, canComputeSupply, allocatedMW, projectComplete } from '../src/studio/status.mjs';
import { BOLSWARD, blankProject } from '../src/studio/project.mjs';
import { emptyIndex } from '../src/studio/wind-data.mjs';
import { HOUTRIBDIJK, STAVOREN } from '../src/studio/park-model.mjs';

// Stapstatus van de Projectstudio: één bron voor de stappenrail, het overzicht en de knop "Bereken aanbod".
const statuses = r => r.steps.map(s => s.status);
const ready = mw => ({ ready: true, nominalMW: mw, intakeMW: mw * 1.1, problems: [] });
const index = (coverage = {}) => { const i = emptyIndex(); for (const s of i.stations) if (coverage[s.id] !== undefined) s.dekking = { 2025: coverage[s.id] }; return i; };

test('leeg project: alles open, niets te berekenen', () => {
  const p = blankProject(), r = stepStatus(p, { resolved: p.varianten.map(() => ({ ready: false, problems: [] })), index: index() });
  assert.deepEqual(statuses(r), ['open', 'open', 'open', 'open', 'open', 'open']);
  assert.equal(r.done, 0);
  assert.equal(canComputeSupply(p), false);
  assert.equal(projectComplete(p), false);
  assert.ok(r.issues.some(x => x.step === 0 && /plek van de elektrolyser/.test(x.text)));
  assert.equal(r.steps[4].summary, 'Eerst parken en stations');
});

test('Bolsward: locatie en parken klaar, Houtribdijk verder dan 25 km geeft een waarschuwing per park', () => {
  const p = structuredClone(BOLSWARD); p.varianten.forEach((v, i) => { v.modelId = 'model-' + i; });
  const r = stepStatus(p, { resolved: [ready(20), ready(30)], index: index({ [HOUTRIBDIJK]: 0.99, [STAVOREN]: 0.99 }) });
  assert.equal(r.steps[0].status, 'klaar');
  assert.equal(stepStatus(structuredClone(BOLSWARD), { index: index() }).steps[1].status, 'open', 'de startinstelling heeft nog geen model');
  assert.deepEqual(r.steps[1], { key: 'elektrolyser', label: 'Elektrolyser', status: 'klaar', summary: '2 varianten · 20–30 MW', count: 0 });
  assert.equal(r.steps[2].summary, '48,7 MW uit 2 parken');
  assert.equal(Math.round(allocatedMW(p) * 10) / 10, 48.7);
  assert.equal(r.steps[3].status, 'let');
  assert.equal(r.steps[3].count, 2);
  assert.ok(r.issues.filter(x => x.step === 3).every(x => /Houtribdijk ligt \d+ km van het park/.test(x.text)));
  assert.equal(canComputeSupply(p), true);
  assert.equal(r.steps[4].summary, 'Nog niet berekend');
  const done = stepStatus(p, { resolved: [ready(20), ready(30)], index: index({ [HOUTRIBDIJK]: 0.99, [STAVOREN]: 0.99 }), supply: { ready: true, vollasturen: 3617.4 }, compared: true });
  assert.deepEqual(statuses(done), ['klaar', 'klaar', 'klaar', 'let', 'klaar', 'klaar']);
  assert.equal(done.steps[4].summary, '3.617 vollasturen');
  assert.equal(done.done, 5);
});

test('park zonder station: stap 4 is niet klaar en het aanbod is niet te berekenen', () => {
  const p = { ...blankProject(), locatie: { lat: 53.03, lon: 5.66 }, parken: [{ id: 'osm:53.0000,5.6000', naam: 'Testpark', lat: 53, lon: 5.6, turbines: 4, rated_kw: 3000, hub_height_m: 100, wake_pct: 5, curve: 'standaard', hoogte: 'alpha', aandeel: 0.5, stations: [], herkomst: {} }] };
  const r = stepStatus(p, { resolved: [ready(10)], index: index() });
  assert.equal(r.steps[2].status, 'klaar');
  assert.equal(r.steps[2].summary, '6,0 MW uit 1 park');
  assert.equal(r.steps[3].status, 'open');
  assert.ok(r.issues.some(x => x.step === 3 && x.text === 'Testpark: kies een KNMI-station'));
  assert.equal(canComputeSupply(p), false);
  assert.equal(r.steps[4].summary, 'Eerst parken en stations');
  const zero = stepStatus({ ...p, parken: [{ ...p.parken[0], aandeel: 0 }] }, { index: index() });
  assert.equal(zero.steps[2].status, 'let');
  assert.ok(zero.issues.some(x => x.level === 'info' && /levert 0 MW/.test(x.text)));
});

test('station met lage dekking: let op; dekking nog niet opgehaald is alleen informatie', () => {
  const park = { id: 'osm:53.0000,5.4000', naam: 'Windpark Test', lat: 53, lon: 5.4, turbines: 4, rated_kw: 3000, hub_height_m: 100, wake_pct: 5, curve: 'standaard', hoogte: 'alpha', aandeel: 1, stations: [STAVOREN], herkomst: {} };
  const p = { ...blankProject(), locatie: { lat: 53, lon: 5.4 }, parken: [park] };
  const low = stepStatus(p, { index: index({ [STAVOREN]: 0.5 }) });
  assert.equal(low.steps[3].status, 'let');
  assert.ok(low.issues.some(x => x.level === 'let' && x.text === 'Test: Stavoren heeft minder dan 90 % dekking in 2025.'));
  const unknown = stepStatus(p, { index: index() });
  assert.equal(unknown.steps[3].status, 'klaar');
  assert.equal(unknown.steps[3].summary, 'Stavoren');
  assert.ok(unknown.issues.some(x => x.level === 'info' && /nog niet bekend/.test(x.text)));
});

test('één variant is genoeg voor LCOH vergelijken', () => {
  const p = structuredClone(BOLSWARD); p.varianten = [{ ...p.varianten[0], modelId: 'model-0' }];
  const open = stepStatus(p, { resolved: [ready(20)], index: index({ [HOUTRIBDIJK]: 0.99, [STAVOREN]: 0.99 }), supply: { ready: true, vollasturen: 3617.4 } });
  assert.equal(open.steps[5].summary, 'Nog niet bekeken');
  assert.ok(open.issues.some(x => x.step === 5 && /nog niet bekeken/.test(x.text)));
  const done = stepStatus(p, { resolved: [ready(20)], index: index({ [HOUTRIBDIJK]: 0.99, [STAVOREN]: 0.99 }), supply: { ready: true, vollasturen: 3617.4 }, compared: true });
  assert.deepEqual(done.steps[5], { key: 'vergelijken', label: 'LCOH vergelijken', status: 'klaar', summary: '1 variant berekend', count: 0 });
});
