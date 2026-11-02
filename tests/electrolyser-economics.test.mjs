import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogueModels} from '../src/electrolyser-catalogue.mjs';
import {resolveSetup, comparisonCSV, jobFor, differences, RESULT_ROWS, resultRow} from '../src/electrolyser-setup.mjs';
import {compareNow} from '../src/electrolyser-run.mjs';
import * as eco from '../src/electrolyser-economics.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const supplies = Object.fromEntries([2022, 2023, 2024, 2025].map(y => [y, read(`../src/opsplitsing/data/${y}.json`)]));
const catalogue = read('./fixtures/atlas-catalogue.json');
const fixture = catalogueModels(catalogue).models.find(m => m.name.startsWith('Fixture Systeem 4,4 MW'));
const close = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b));
const parseCSV = text => { const rows = [[]]; let cell = '', quoted = false; for (let i = 0; i < text.length; i++) { const ch = text[i]; if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; } else if (ch === '"') quoted = true; else if (ch === ';') { rows.at(-1).push(cell); cell = ''; } else if (ch === '\r' && text[i + 1] === '\n') { rows.at(-1).push(cell); cell = ''; rows.push([]); i++; } else cell += ch; } rows.at(-1).push(cell); return rows; };
const general = {strategy: 'verdelen', years: [2024, 2025], values: {}};

test('economics() equals the Python economics() of opsplitsing.py for every case and cost variant (1e-9 relative)', () => {
 const reference = read('./fixtures/elektrolyser-kosten-python.json');
 assert.ok(reference.cases.length >= 8);
 for (const c of reference.cases) {
  const a = {...c.aannames, capaciteit_mw: c.capaciteit_mw, stack_levensduur_uur: c.stack_levensduur_uur};
  const got = eco.economics(c.invoer, a);
  for (const [key, expected] of Object.entries(c.uitkomst)) assert.ok(expected === null ? got[key] === null : close(got[key], expected), `${c.naam} ${key}: ${got[key]} ≠ ${expected}`);
 }
});

test('the cost defaults equal Aannames() in opsplitsing.py and the reference price is 1.000 €/kW', () => {
 const py = readFileSync(new URL('../src/opsplitsing/python/opsplitsing.py', import.meta.url), 'utf8');
 const block = py.slice(py.indexOf('class Aannames'), py.indexOf('TECHNOLOGIES = {'));
 for (const [key, value] of Object.entries(eco.COST_DEFAULTS)) {
  const m = block.match(new RegExp(`\\n    ${key}: float = ([0-9.]+)`));
  assert.ok(m, key); assert.equal(Number(m[1]), value, key);
 }
 assert.equal(eco.DEFAULT_PRICE_EUR_KW, 1000);
});

// Two setups of 44 MW with a different module count, run through the real kernel.
function twoSetups(costOf = () => ({})) {
 const setups = [{id: 'a', modelId: fixture.id, modules: 10, choices: {cost: costOf(0)}}, {id: 'b', modelId: fixture.id, modules: 2, choices: {power: 22, cost: costOf(1)}}];
 const resolved = setups.map(s => resolveSetup(fixture, s, general));
 assert.ok(resolved.every(r => r.ready));
 const results = compareNow(resolved, general, supplies);
 return {setups, resolved, results};
}

test('setupCosts: standard, price per kW and total price give the same CAPEX arithmetic', () => {
 const {setups, resolved} = twoSetups();
 const std = eco.setupCosts(resolved[0], setups[0], general);
 assert.equal(std.price, 1000); assert.equal(std.fields[0].status, 'standaard technologie'); assert.ok(std.fields[0].aanname);
 assert.ok(close(eco.capex_eur(std.a, 10), std.a.capaciteit_mw * 1000 * 1000 + 10 * 1e6));
 const perKw = eco.setupCosts(resolved[0], {...setups[0], choices: {cost: {eurKw: 800, fixedMeur: 0.5}}}, general);
 assert.ok(close(perKw.price, 800)); assert.equal(perKw.fields[0].status, 'eigen invoer'); assert.equal(perKw.fields[1].status, 'eigen invoer');
 assert.ok(close(eco.capex_eur(perKw.a, 10), 800 * perKw.a.capaciteit_mw * 1000 + 10 * 0.5e6));
 const total = eco.setupCosts(resolved[0], {...setups[0], choices: {cost: {totalMeur: 40}}}, general);
 assert.ok(close(eco.capex_eur(total.a, 10) / 1e6, 40)); assert.equal(total.fields[0].status, 'eigen invoer');
 // A total price below the fixed costs is not usable.
 assert.equal(eco.setupCosts(resolved[0], {...setups[0], choices: {cost: {totalMeur: 5}}}, general).ready, false);
});

test('general cost values: own values count, out-of-range values fall back to the standard', () => {
 const g = eco.generalCosts({values: {stroomprijs_eur_mwh: 60, rente: 0.5, looptijd_jaar: 25}});
 const by = Object.fromEntries(g.fields.map(f => [f.key, f]));
 assert.equal(by.stroomprijs_eur_mwh.value, 60); assert.equal(by.stroomprijs_eur_mwh.status, 'eigen invoer');
 assert.equal(by.rente.value, eco.COST_DEFAULTS.rente); assert.equal(by.rente.status, 'standaard technologie');
 assert.equal(by.looptijd_jaar.value, 25);
});

test('costs are not part of the cache key: another electricity price needs no new run', () => {
 const {resolved} = twoSetups();
 const cheap = {...general, values: {stroomprijs_eur_mwh: 20}};
 for (const year of [2024, 2025]) assert.equal(jobFor(resolved[0], general, year).key, jobFor(resolved[0], cheap, year).key);
 assert.ok(!Object.keys(resolved[0].aannames).some(k => k in eco.COST_DEFAULTS));
});

test('withCosts: LCOH per year and mean equal economics() on the raw results; the reference has no premium', () => {
 const {setups, resolved, results} = twoSetups();
 const list = results.map((assembled, i) => ({assembled, a: eco.setupCosts(resolved[i], setups[i], general).a}));
 const costed = eco.withCosts(list, 0);
 costed.forEach((c, i) => {
  assert.ok(close(c.mean.lcoh_eur_kg, eco.economics(results[i].summary, list[i].a).lcoh_eur_kg));
  c.perYear.forEach((y, j) => assert.ok(close(y.lcoh_eur_kg, eco.economics(results[i].raw[j], list[i].a).lcoh_eur_kg)));
  assert.ok(c.mean.lcoh_eur_kg > 1 && c.mean.lcoh_eur_kg < 100, String(c.mean.lcoh_eur_kg));
  assert.ok(close(c.mean.kosten_meur_jaar, c.mean.kapitaal_meur_jaar + c.mean.stroom_meur_jaar + c.mean.stack_meur_jaar));
 });
 assert.equal(costed[0].mean.meerprijs_eur_kw, null);
 assert.ok(Number.isFinite(costed[1].mean.meerprijs_eur_kw));
 // The technical metrics are unchanged.
 assert.equal(costed[1].mean.waterstof_kg, results[1].mean.waterstof_kg);
 const d = differences(costed.map(c => c.mean), 0);
 assert.ok(d[1].lcoh_eur_kg && Number.isFinite(d[1].lcoh_eur_kg.delta));
 for (const row of RESULT_ROWS) assert.ok(resultRow(row, costed.map(c => c.mean), d).cells.length === 2, row[1]);
});

test('maximum premium: at the price it implies, the setup reaches exactly the LCOH of the reference', () => {
 const {setups, resolved, results} = twoSetups();
 const list = results.map((assembled, i) => ({assembled, a: eco.setupCosts(resolved[i], setups[i], general).a}));
 for (const reference of [0, 1]) {
  const costed = eco.withCosts(list, reference), other = 1 - reference;
  const target = costed[reference].mean.lcoh_eur_kg, premium = costed[other].mean.meerprijs_eur_kw;
  // New price per kW = assumed price + premium; everything else equal (the fixed cost per module stays).
  const a = list[other].a, price = eco.per_kw_eur(a) + premium;
  const priced = eco.setupCosts(resolved[other], {...setups[other], choices: {...setups[other].choices, cost: {eurKw: price}}}, general).a;
  assert.ok(close(eco.economics(results[other].summary, priced).lcoh_eur_kg, target, 1e-9), `reference ${reference}`);
  // A setup with a lower LCOH may cost more than the reference, a dearer one must cost less.
  const own = costed[other].mean.lcoh_eur_kg;
  assert.equal(premium > 0, own < target, `sign ${premium} ${own} ${target}`);
 }
 // The same with subsidy, zero interest and a deviating electricity price.
 const values = {capex_subsidie_eur_kw: 200, rente: 0, stroomprijs_eur_mwh: 40, korting_net_belasting_eur_mwh: 30};
 const g2 = {...general, values};
 const list2 = results.map((assembled, i) => ({assembled, a: eco.setupCosts(resolved[i], setups[i], g2).a}));
 const c2 = eco.withCosts(list2, 0), a = list2[1].a;
 const priced = {...a, offerte_meur: a.offerte_meur + c2[1].mean.meerprijs_eur_kw * a.offerte_mw * 1000 / 1e6};
 assert.ok(close(eco.economics(results[1].summary, priced).lcoh_eur_kg, c2[0].mean.lcoh_eur_kg, 1e-9));
});

test('premium formula against the break-even CAPEX of opsplitsing.py (break_even)', () => {
 const reference = read('./fixtures/elektrolyser-kosten-python.json');
 const c = reference.cases[0];
 const a = {...c.aannames, capaciteit_mw: c.capaciteit_mw, stack_levensduur_uur: c.stack_levensduur_uur};
 const own = eco.economics(c.invoer, a);
 // Target the setup's own LCOH: the CAPEX that gives it is its own CAPEX.
 assert.ok(close(eco.capexForLcoh(c.invoer, a, own.lcoh_eur_kg), own.capex_meur * 1e6, 1e-9));
 assert.ok(Math.abs(eco.maxPremiumEurKw(c.invoer, a, own.lcoh_eur_kg)) < 1e-6);
 assert.equal(eco.capexForLcoh({...c.invoer, waterstof_t: 0}, a, 5), null);
});

test('robustness: identical setups are equivalent; a clearly cheaper one is named; the cost price scale cannot flip the verdict', () => {
 const {setups, resolved, results} = twoSetups();
 const costs = resolved.map((r, i) => eco.setupCosts(r, setups[i], general));
 const same = eco.robustness([{result: results[0].summary, a: costs[0].a}, {result: results[0].summary, a: costs[0].a}]);
 assert.equal(same.clear, false); assert.deepEqual(same.equivalent.sort(), [0, 1]);
 // The same production, but one of the two setups costs a fifth of the investment.
 const cheap = {...costs[0].a, offerte_meur: costs[0].a.offerte_meur * 0.2};
 const verdict = eco.robustness([{result: results[0].summary, a: costs[0].a}, {result: results[0].summary, a: cheap}]);
 assert.equal(verdict.lowest, 1); assert.equal(verdict.clear, true); assert.deepEqual(verdict.equivalent, [1]); assert.deepEqual(verdict.dearer, [0]);
 assert.ok(verdict.cases >= 12 && verdict.margin > 0 && verdict.drivers.length === 2);
 const real = eco.robustness([{result: results[0].summary, a: costs[0].a}, {result: results[1].summary, a: costs[1].a}]);
 assert.ok(real.tested && real.cases >= 12);
 assert.equal(real.clear, real.equivalent.length === 1);
 assert.equal(eco.robustness([{result: results[0].summary, a: costs[0].a}]), null);
});

test('CSV: cost columns, assumption statuses and cost results are included', () => {
 const {setups, resolved, results} = twoSetups(i => i === 0 ? {eurKw: 900} : {});
 const costs = resolved.map((r, i) => eco.setupCosts(r, setups[i], general));
 const costed = eco.withCosts(results.map((assembled, i) => ({assembled, a: costs[i].a})), 0);
 const csv = comparisonCSV({catalogue, general, entries: setups.map((s, i) => ({setup: {label: 'AB'[i]}, model: fixture, resolved: resolved[i], result: costed[i], costs: costs[i]}))});
 const table = parseCSV(csv.replace('﻿', '')), head = table[0];
 for (const column of ['aanname.kosten.prijs_eur_kw', 'aanname.kosten.prijs_eur_kw.status', 'aanname.kosten.stroomprijs_eur_mwh', 'aanname.kosten.rente.status', 'uitkomst.LCOH_EUR_per_kg', 'uitkomst.max_meerprijs_EUR_per_kW', 'uitkomst.CAPEX_MEUR'])
  assert.ok(head.includes(column), column);
 const row = table[1];
 assert.equal(row[head.indexOf('aanname.kosten.prijs_eur_kw')], '900'); assert.equal(row[head.indexOf('aanname.kosten.prijs_eur_kw.status')], 'eigen invoer');
 assert.equal(row[head.indexOf('aanname.kosten.stroomprijs_eur_mwh')], '88,91');
 assert.ok(Number(row[head.indexOf('uitkomst.LCOH_EUR_per_kg')].replace(',', '.')) > 0);
 assert.ok(table.every(r => r.length === head.length));
});
