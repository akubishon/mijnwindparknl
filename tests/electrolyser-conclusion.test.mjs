import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogueModels} from '../src/electrolyser-catalogue.mjs';
import {autoResolve, resolveSetup, newSetup, comparisonConclusion, AUTO_PROFILE} from '../src/electrolyser-setup.mjs';

const catalogue = JSON.parse(readFileSync(new URL('./fixtures/atlas-catalogue.json', import.meta.url), 'utf8'));
const {models} = catalogueModels(catalogue);

test('autoResolve maakt elke catalogusopstelling rekenbaar en benoemt elke aanname', () => {
 for (const model of models) {
  const setup = newSetup('a', model.id, 2);
  const before = resolveSetup(model, setup);
  const r = autoResolve(model, setup, undefined, {target: 44});
  assert.equal(r.ready, true, model.name);
  assert.equal(resolveSetup(model, r.setup).ready, true, model.name);
  if (before.ready) assert.deepEqual(r.notes, [], model.name);
  else assert.ok(r.notes.length > 0, model.name);
 }
});

test('autoResolve kiest bij een bereik de ongunstige kant en raakt het origineel niet aan', () => {
 const model = {...models[0], systemEnergy: {status: 'open', raw: '46,4–52,2 kWh/kg', reason: 'Bereik', candidates: [46.4, 52.2]}, stackEnergy: {status: 'ontbreekt', raw: '', candidates: []},
  minimum: {status: 'open', raw: '5 % H2-productie', basis: 'waterstofproductie', reason: 'eenheid', candidates: [5, 10]}, profile: {key: 'pem', status: 'bron', rule: ''}, delivery: {kind: 'systeem'}};
 const setup = newSetup('a', model.id, 3);
 const r = autoResolve(model, setup);
 assert.equal(r.setup.choices.energy, 52.2);
 assert.equal(r.setup.choices.minimum, 0.10);
 assert.match(r.setup.choices.energyNote, /^Automatisch ingevuld/);
 assert.deepEqual(setup.choices, {});
});

test('autoResolve kiest een rekenprofiel voor technologieën zonder standaard', () => {
 assert.equal(AUTO_PROFILE.AEM, 'pem');
 const model = {...models[0], technology: 'AEM', profile: {key: null, status: 'open', rule: 'Voor AEM staat geen standaard in opsplitsing.py. Kies zelf een rekenprofiel.'}};
 const r = autoResolve(model, newSetup('a', model.id, 2));
 assert.equal(r.setup.choices.profile, 'pem');
 assert.match(r.notes[0], /Rekenprofiel PEM voor AEM/);
});

const e = (kg, lcoh) => ({mean: {waterstof_kg: kg, lcoh_eur_kg: lcoh}});
test('conclusie: robuust goedkoopste wint', () => {
 const verdict = {clear: true, lowest: 1, equivalent: [1], dearer: [0, 2]};
 const c = comparisonConclusion([e(3e6, 8), e(2.9e6, 7.5), e(3.1e6, 9)], verdict);
 assert.equal(c.winner, 1); assert.equal(c.kind, 'duidelijk'); assert.deepEqual(c.ranking, [1, 0, 2]);
});
test('conclusie: gelijkwaardig op kosten, dan de meeste waterstof', () => {
 const verdict = {clear: false, lowest: 0, equivalent: [0, 2], dearer: [1]};
 const c = comparisonConclusion([e(3e6, 7.9), e(3.2e6, 9), e(3.1e6, 7.95)], verdict);
 assert.equal(c.winner, 2); assert.equal(c.kind, 'gelijkwaardig'); assert.equal(c.ranking[0], 2);
 assert.deepEqual(c.closeOnH2, [0, 1].filter(i => Math.abs([3e6, 3.2e6][i] - 3.1e6) <= 0.02 * 3.1e6));
});
test('conclusie zonder kosten: de meeste waterstof; te weinig opstellingen: geen conclusie', () => {
 const c = comparisonConclusion([e(3e6, null), e(3.05e6, null)], null);
 assert.equal(c.winner, 1); assert.equal(c.kind, 'waterstof'); assert.deepEqual(c.closeOnH2, [0]);
 assert.equal(comparisonConclusion([e(3e6, 8), null], null), null);
});
