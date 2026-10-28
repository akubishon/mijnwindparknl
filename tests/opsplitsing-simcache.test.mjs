import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadBrowserModel} from './helpers/pyodide-runtime.mjs';

// The browser model caches simulations independently of the cost assumptions (browser-runtime.py, SimulationMemo).
// That is only correct while the cache key names every Aannames field the simulation reads. SIMULATION_FIELDS is
// therefore checked against a run that logs every attribute access, so a model change cannot silently break the cache.
const model = await loadBrowserModel({extra: readFileSync(new URL('./fixtures/opsplitsing_simcache_probe.py', import.meta.url), 'utf8')});
const {json} = model;

// Costs are applied afterwards by summarise/break_even; none of these may influence a simulation.
const COST_ONLY = ['offerte_meur', 'offerte_mw', 'offerte_modules', 'vaste_kosten_module_meur', 'stack_aandeel', 'opex_aandeel',
  'stroomprijs_eur_mwh', 'netkosten_eur_mwh', 'belasting_eur_mwh', 'rente', 'looptijd_jaar', 'capex_subsidie_eur_kw',
  'waterstofpremie_eur_kg', 'korting_net_belasting_eur_mwh', 'zuurstofprijs_eur_t'];

test('the simulation reads exactly the assumptions in SIMULATION_FIELDS', () => {
  const probe = json('probe()');
  const simulation = json('list(SIMULATION_FIELDS)');
  const hint = 'The model now reads other assumptions than the cache key names. Update SIMULATION_FIELDS in browser-runtime.py '
    + '(and the cost-only list in this test) after checking which fields simulate() really uses.';
  assert.deepEqual(probe.gelezen, [...simulation].sort(), hint);
  assert.deepEqual([...probe.velden].filter(name => !simulation.includes(name)).sort(), [...COST_ONLY].sort(), hint);
  assert.equal(probe.velden.length, 36);
  assert.equal(simulation.length, 21);
  // The full-year run reads the same fields as the short window, so no branch is only reached later in the year.
  assert.deepEqual(probe.jaar, [...simulation].sort());
  // Every strategy, module count and starting point reads all of them: nothing relies on a rarely reached branch.
  for (const [run, reads] of Object.entries(probe.per_run)) assert.deepEqual(reads.filter(name => !simulation.includes(name)), [], run);
});

test('changing an assumption the simulation does not read leaves every outcome identical', () => {
  const check = json('unread_fields_change_nothing()');
  assert.deepEqual([...check.ongelezen].sort(), [...COST_ONLY].sort());
  assert.deepEqual(check.verschillend, []);
});

test('the cache key changes with simulation inputs and ignores cost inputs', () => {
  const {velden, overig} = json('key_sensitivity()');
  const simulation = json('list(SIMULATION_FIELDS)');
  for (const [name, changed] of Object.entries(velden)) assert.equal(changed, simulation.includes(name), name);
  assert.deepEqual(overig, {n: true, besturing: true, jaar: true, aanbod: true, modelversie: true});
});

test('cache hits return the same outcome without simulating again', () => {
  const memo = json('memo_behaviour()');
  assert.equal(memo.zelfde_object, true);
  assert.equal(memo.gelijk_aan_origineel, true);
  assert.deepEqual(memo.na_kosten, {hits: 2, misses: 1, jobs: 1}, 'Cost-only changes are cache hits');
  assert.equal(memo.minimumlast_anders, true);
  assert.deepEqual(memo.na_minimumlast, {hits: 2, misses: 2, jobs: 2}, 'A changed minimum load is a new simulation');
});

test('the cache is a bounded LRU and does not keep failed jobs', () => {
  const lru = json('lru_behaviour()');
  assert.deepEqual(lru.volgorde, ['a', 'c'], 'The least recently used job is evicted, not the oldest');
  assert.deepEqual(lru.aanroepen, ['a', 'b', 'c', 'b', 'fout']);
  assert.deepEqual(lru.na, ['a', 'b']);
  assert.equal(lru.treffers, 2);
  assert.equal(json('SIM_MEMO.limit'), 1000);
});

test('Bereken, gevoeligheid and omslagkaart reuse simulations and give the same JSON as a cold run', () => {
  const out = json('pipeline()');
  assert.deepEqual(out.na_bereken, {hits: 0, misses: 3, jobs: 3});
  assert.deepEqual(out.na_kosten, {hits: 3, misses: 3, jobs: 3}, 'Only stroomprijs and rente changed: no new simulation');
  assert.ok(out.gevoeligheid_stats.treffers >= 2, 'The base run of the sensitivity (1 module and N modules) comes from Bereken');
  assert.ok(out.omslag_stats.treffers >= 3, 'The omslagkaart row with the current minimum load comes from Bereken');
  assert.equal(out.gemuteerd, 0, 'summarise, break_even and example_day must not change shared simulation outcomes; return a deep copy from SimulationMemo if they ever do');
  assert.notEqual(out.bereken.rijen[0].lcoh_eur_kg, out.bereken_kosten.rijen[0].lcoh_eur_kg, 'The cost change must be visible');
  assert.equal(out.bereken.rijen[1].waterstof_t, out.bereken_kosten.rijen[1].waterstof_t);
  assert.deepEqual(out.bereken, out.koud_bereken);
  assert.deepEqual(out.bereken_kosten, out.koud_bereken_kosten);
  assert.deepEqual(out.gevoeligheid, out.koud_gevoeligheid);
  assert.deepEqual(out.omslagkaart, out.koud_omslagkaart);
});
