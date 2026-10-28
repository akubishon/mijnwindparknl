import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as kernel from '../src/electrolyser-kernel.mjs';
import {catalogueModels, datasheetLinks, interpretModel, missingEndpointFields, modulePower, NM3_PER_KG} from '../src/electrolyser-catalogue.mjs';
import {resolveSetup, comparisonCSV, generalValues, fillToTarget, capacityWarnings, differences, jobFor, inputHash} from '../src/electrolyser-setup.mjs';
import {compareNow} from '../src/electrolyser-run.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const supplies = Object.fromEntries([2022, 2023, 2024, 2025].map(y => [y, read(`../src/opsplitsing/data/${y}.json`)]));
const catalogue = read('./fixtures/atlas-catalogue.json');
const models = catalogueModels(catalogue).models;
const byName = name => models.find(m => m.name.startsWith(name));
const fixture = byName('Fixture Systeem 4,4 MW');
const close = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b));
const KEYS = ['waterstof_t', 'verbruik_mwh', 'standby_mwh', 'aanbod_mwh', 'benutting', 'bedrijfsuren_gem', 'productie_uur', 'starts_warm_per_module', 'starts_koud_per_module', 'dekking_uur', 'stackwissel_dagen'];
const isolated = {values: {onderhoud_dagen: 0, storingen_per_jaar: 0, stackwissel_weken: 0, min_aan_min: 0}};
const parseCSV = text => { const rows = [[]]; let cell = '', quoted = false; for (let i = 0; i < text.length; i++) { const ch = text[i]; if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; } else if (ch === '"') quoted = true; else if (ch === ';') { rows.at(-1).push(cell); cell = ''; } else if (ch === '\r' && text[i + 1] === '\n') { rows.at(-1).push(cell); cell = ''; rows.push([]); i++; } else cell += ch; } rows.at(-1).push(cell); return rows; };

test('Python source files stay identical to the hashes in PROVENANCE.json', () => {
 const provenance = read('../src/opsplitsing/PROVENANCE.json');
 for (const [name, hash] of Object.entries(provenance.python_sha256))
  assert.equal(createHash('sha256').update(readFileSync(new URL('../src/opsplitsing/python/' + name.split('/').pop(), import.meta.url))).digest('hex'), hash, name);
});

test('JavaScript kernel matches Python with the active turbine curve for all reference cases', () => {
 const reference = read('./fixtures/elektrolyser-kern-python.json');
 assert.equal(reference.model_version, 13);
 for (const c of reference.cases) {
  const r = kernel.simulate_with_replacements(supplies[c.jaar], c.modules, c.aannames, c.strategie);
  for (const [key, expected] of Object.entries(c.uitkomst)) {
   if (Array.isArray(expected)) expected.forEach((v, i) => assert.ok(close(r[key][i], v), `${c.naam} ${key}[${i}]`));
   else assert.ok(close(r[key], expected), `${c.naam} ${key}: ${r[key]} ≠ ${expected}`);
  }
 }
 for (const [key, values] of Object.entries(reference.technologieen))
  for (const [field, value] of Object.entries(kernel.TECHNOLOGIES[key].waarden)) assert.equal(value, values[field], `${key}.${field}`);
});

test('Python number semantics: compensated sum, round(x, 2) and random.Random', () => {
 // Expected values printed by CPython 3.13.
 assert.deepEqual([12.345, 3.125, 0.375, 2.675, 1.005].map(kernel.pyRound2), [12.35, 3.12, 0.38, 2.67, 1.0]);
 assert.equal(kernel.pySum([1e16, 1.0, -1e16]), 1.0); assert.equal(kernel.pySum(Array(10).fill(0.1)), 1.0);
 assert.equal(new kernel.PyRandom(202500).random(), 0.4339126179454005);
 assert.equal(new kernel.PyRandom(202500).expovariate(2 / (365 * 86400)), 8972099.655068481);
});

test('acceptance 2: one setup with n modules and standard assumptions equals /opsplitsing with the same input', () => {
 const native = read('./fixtures/opsplitsing-2025-native.json');
 for (const row of native.rijen) {
  const setup = {id: 'x', modelId: fixture.id, modules: row.modules, choices: {power: 44 / row.modules, boundary: 'stack', minimum: 0.10}};
  const resolved = resolveSetup(fixture, setup, {strategy: 'verdelen', years: [2025], values: {}});
  assert.ok(resolved.ready, resolved.problems.join(' '));
  for (const [key, value] of Object.entries(resolved.aannames)) if (key in native.aannames) assert.equal(value, native.aannames[key], key);
  const [result] = compareNow([resolved], {strategy: 'verdelen', years: [2025], values: {}}, supplies);
  const raw = kernel.simulate_with_replacements(supplies[2025], row.modules, resolved.aannames, 'verdelen');
  for (const key of KEYS) assert.ok(close(raw[key], row[key]), `${row.modules} modules ${key}`);
  assert.ok(close(result.mean.waterstof_kg, row.waterstof_t * 1000));
  assert.ok(close(result.mean.opgenomen_mwh, row.verbruik_mwh));
  assert.ok(close(result.mean.benut, row.benutting));
 }
});

test('acceptance 1: 10 × 4,4 MW takes more power than 2 × 22 MW at low wind with verdelen; equal with samen', () => {
 const general = {strategy: 'verdelen', years: [2022, 2023, 2024, 2025], values: {}};
 const small = resolveSetup(fixture, {id: 'a', modelId: fixture.id, modules: 10, choices: {}}, general);
 const large = resolveSetup(fixture, {id: 'b', modelId: fixture.id, modules: 2, choices: {power: 22}}, general);
 assert.ok(small.ready && large.ready);
 assert.equal(small.aannames.minimumlast, 0.20); assert.equal(small.nominalMW, 44); assert.equal(large.nominalMW, 44);
 assert.equal(small.fields.find(f => f.key === 'minimumlast').status, 'bron');
 const [a, b] = compareNow([small, large], general, supplies);
 const low = m => m.klassen.filter(c => c.tot_mw !== null && c.tot_mw <= 5).reduce((s, c) => s + c.opgenomen_mwh, 0);
 assert.ok(low(a.mean) > 1000, `10 modules below 5 MW: ${low(a.mean)}`);
 assert.equal(a.mean.klassen[0].opgenomen_mwh > 0, true);
 assert.equal(b.mean.klassen[0].opgenomen_mwh, 0);   // one 22 MW module needs 5,4 MW at 20 % minimum load
 assert.ok(low(a.mean) > 2 * low(b.mean));
 assert.ok(a.mean.onder_minimum_mwh < b.mean.onder_minimum_mwh);
 a.perYear.forEach((y, i) => assert.ok(low(y) > low(b.perYear[i]), String(y.jaar)));
 assert.ok(a.mean.opgenomen_mwh > b.mean.opgenomen_mwh);
 for (const r of [a, b]) assert.ok(close(r.mean.rest_mwh, r.mean.onder_minimum_mwh + r.mean.boven_maximum_mwh + r.mean.overig_mwh, 1e-9));

 // With samen all modules switch together: the same total behaves as one installation. Availability (maintenance,
 // failures, stack replacement) is drawn per module, and the minimum on-time keeps just-started modules running
 // (floor(aanbod ÷ minimum) of them), so both are switched off to isolate the control strategy.
 const together = {strategy: 'samen', years: [2025], ...isolated};
 const [s1, s2] = compareNow([resolveSetup(fixture, {id: 'a', modelId: fixture.id, modules: 10, choices: {}}, together), resolveSetup(fixture, {id: 'b', modelId: fixture.id, modules: 2, choices: {power: 22}}, together)], together, supplies);
 for (const key of ['waterstof_kg', 'opgenomen_mwh', 'standby_mwh', 'benut', 'belasting', 'onder_minimum_mwh', 'boven_maximum_mwh', 'kwh_per_kg', 'productie_uur'])
  assert.ok(close(s1.mean[key], s2.mean[key], 1e-9), `samen ${key}: ${s1.mean[key]} ≠ ${s2.mean[key]}`);
 const standard = {strategy: 'samen', years: [2025], values: {}};
 const [d1, d2] = compareNow([resolveSetup(fixture, {id: 'a', modelId: fixture.id, modules: 10, choices: {}}, standard), resolveSetup(fixture, {id: 'b', modelId: fixture.id, modules: 2, choices: {power: 22}}, standard)], standard, supplies);
 assert.ok(Math.abs(d1.mean.waterstof_kg - d2.mean.waterstof_kg) / d2.mean.waterstof_kg < 0.01);
});

test('acceptance 3: stack-only consumption gives no result without an explicit, labelled BoP assumption', () => {
 for (const name of ['Stargate Hydrogen', 'Nel PSM']) {
  const model = byName(name);
  const without = resolveSetup(model, {id: 'a', modelId: model.id, modules: 4, choices: {}});
  assert.equal(without.ready, false); assert.equal(without.aannames, undefined);
  assert.match(without.problems.join(' '), /BoP-aanname/);
  assert.equal(without.fields.find(f => f.key === 'systeemverbruik_vol').value, null);
  const withBoP = resolveSetup(model, {id: 'a', modelId: model.id, modules: 4, choices: {bopConfirmed: true}});
  assert.ok(withBoP.ready, withBoP.problems.join(' '));
  const energy = withBoP.fields.find(f => f.key === 'systeemverbruik_vol');
  assert.equal(energy.status, 'afgeleid'); assert.equal(energy.aanname, true); assert.match(energy.rule, /BoP is een aanname/);
  assert.ok(close(energy.value, model.stackEnergy.value * 1.1));
  for (const key of ['bop_vast', 'bop_variabel']) { const f = withBoP.fields.find(x => x.key === key); assert.equal(f.status, 'eigen invoer'); assert.equal(f.aanname, true); }
 }
 // A delivered stack needs the BoP assumption even when a system value is given (scope from an extended endpoint).
 const raw = catalogue.models.find(m => m.name.startsWith('Accelera'));
 const stack = interpretModel({...raw, values: {...raw.values, scope: 'Stack; BoP niet inbegrepen'}});
 assert.equal(stack.delivery.label, 'Losse stack');
 assert.equal(resolveSetup(stack, {id: 'a', modelId: stack.id, modules: 1, choices: {}}).ready, false);
 // A system whose consumption already includes BoP needs nothing extra and keeps the standard 10 %.
 const system = resolveSetup(byName('Accelera by Cummins HyLYZER 1000-30'), {id: 'b', modelId: 'x', modules: 9, choices: {}});
 assert.ok(system.ready); assert.equal(system.fields.find(f => f.key === 'bop_vast').status, 'standaard technologie');
});

test('acceptance 4: hydrogen-basis minimum load and power ranges are never converted silently', () => {
 const quest = byName('Quest One ME450');
 assert.equal(quest.minimum.status, 'open'); assert.equal(quest.minimum.basis, 'waterstofproductie'); assert.equal(quest.minimum.value, undefined);
 const open = resolveSetup(quest, {id: 'a', modelId: quest.id, modules: 44, choices: {}});
 assert.equal(open.ready, false); assert.equal(open.fields.find(f => f.key === 'minimumlast').value, null);
 const chosen = resolveSetup(quest, {id: 'a', modelId: quest.id, modules: 44, choices: {minimum: 0.2, minimumNote: 'als elektrisch percentage gebruikt (aanname).'}});
 assert.ok(chosen.ready); assert.equal(chosen.fields.find(f => f.key === 'minimumlast').status, 'eigen invoer');

 const range = byName('H2GREEM');
 assert.equal(range.power.status, 'open'); assert.equal(range.power.value, undefined); assert.deepEqual(range.power.candidates, [0.3, 1]);
 assert.equal(modulePower({name: range.name, manufacturer: range.manufacturer, values: {power: range.power.raw}}).value, 1);   // the Atlas rule exists, but is not applied silently
 assert.equal(resolveSetup(range, {id: 'a', modelId: range.id, modules: 1, choices: {}}).ready, false);
 assert.equal(byName('Sunfire HyLink Alkaline').systemEnergy.status, 'open');
 const theia = byName('Oort Energy Theia');
 assert.equal(theia.power.status, 'afgeleid'); assert.equal(theia.power.value, 1); assert.match(theia.power.rule, /modulePower/);
 const plug = byName('Plug GenEco 5 MW');
 assert.equal(plug.power.value, 5); assert.equal(plug.boundary.value, 'stack'); assert.equal(plug.stackEnergy.status, 'open');
 assert.equal(interpretModel({id: 'x', name: 'x', manufacturer: 'x', technology: 'PEM', values: {power: '≈ 5,160 / 5,400 MW DC (berekend)', stackEnergy: '50 ± 1,1 kWh/kg H₂ stack'}}).power.status, 'open');
 assert.equal(interpretModel({id: 'x', name: 'x', manufacturer: 'x', technology: 'PEM', values: {stackEnergy: '50 ± 1,1 kWh/kg H₂ stack'}}).stackEnergy.status, 'open');
 const unknown = byName('Accelera by Cummins HyLYZER 1000-30').minimum;
 assert.equal(unknown.status, 'afgeleid'); assert.equal(unknown.aanname, true); assert.match(unknown.rule, /aanname/);
 const acdc = resolveSetup(byName('Accelera by Cummins HyLYZER 1000-30'), {id: 'a', modelId: 'x', modules: 1, choices: {}}).fields.find(f => f.key === 'acdc');
 assert.equal(acdc.aanname, true); assert.match(acdc.rule, /niet vermeld/);
});

test('acceptance 5: measurement gaps are dropped, never counted as zero, and coverage is reported', () => {
 const base = {jaar: 2025, t: supplies[2025].t.slice(0, 3000), mw: supplies[2025].mw.slice(0, 3000)};
 const withGaps = {...base, mw: base.mw.map((v, i) => i >= 1000 && i < 1500 ? null : v)};
 const dropped = {jaar: 2025, t: base.t.filter((_, i) => i < 1000 || i >= 1500), mw: base.mw.filter((_, i) => i < 1000 || i >= 1500)};
 const zeros = {...base, mw: base.mw.map((v, i) => i >= 1000 && i < 1500 ? 0 : v)};
 const a = {...kernel.DEFAULTS};
 const gap = kernel.simulate_with_replacements(kernel.cleanSupply(withGaps), 4, a, 'verdelen');
 const ref = kernel.simulate_with_replacements(dropped, 4, a, 'verdelen');
 const zero = kernel.simulate_with_replacements(zeros, 4, a, 'verdelen');
 assert.equal(kernel.cleanSupply(withGaps).dropped, 500);
 for (const key of KEYS) assert.equal(gap[key], ref[key], key);
 assert.equal(gap.dekking_uur, 2500 * kernel.STEP_H); assert.equal(zero.dekking_uur, 3000 * kernel.STEP_H);
 assert.notEqual(gap.waterstof_t, zero.waterstof_t);
 const resolved = resolveSetup(fixture, {id: 'a', modelId: fixture.id, modules: 10, choices: {}});
 const [result] = compareNow([resolved], {strategy: 'verdelen', years: [2024], values: {}}, supplies);
 // Sinds modelversie 11 moeten Houtribdijk én Stavoren meten; in 2024 is de dekking daardoor circa 96 %.
 assert.ok(result.perYear[0].dekking > 0.9 && result.perYear[0].dekking < 1);
 assert.equal(result.perYear[0].uren_in_jaar, 8784);
});

test('catalogue: Atlas exclusions, missing endpoint fields and the part-load curve with 11,12 Nm³/kg', () => {
 const all = catalogueModels(catalogue);
 assert.ok(all.excluded.some(m => m.manufacturer === 'SANY')); assert.ok(!all.models.some(m => ['SANY', 'LONGi Hydrogen', 'Sungrow'].includes(m.manufacturer)));
 assert.ok(all.other.some(m => m.technology === 'Vermogenselektronica'));
 assert.deepEqual(missingEndpointFields(catalogue.models).map(f => f.key).slice(0, 3), ['scope', 'stacks', 'partload']);
 const raw = catalogue.models.find(m => m.name.startsWith('H₂ Energy 1 MW PEM'));
 const model = interpretModel({...raw, values: {...raw.values, partload: '60–100%: 5,1; 30–60%: 5,3; 10–30%: 5,7 kWh/Nm³ (droger uitgesloten)'}});
 assert.equal(NM3_PER_KG, 11.12);
 assert.ok(close(model.partload.bands[0].kWhPerKg, 5.1 * 11.12));
 const resolved = resolveSetup(model, {id: 'a', modelId: model.id, modules: 1, choices: {minimum: 0.1}});
 const gain = resolved.fields.find(f => f.key === 'deellastvoordeel');
 assert.equal(gain.status, 'afgeleid'); assert.match(gain.rule, /11,12 Nm³\/kg/); assert.ok(gain.value >= 0 && gain.value <= 0.3);
 const standard = resolveSetup(fixture, {id: 'a', modelId: fixture.id, modules: 1, choices: {}}).fields.find(f => f.key === 'deellastvoordeel');
 assert.equal(standard.status, 'standaard technologie'); assert.equal(standard.value, 0.10);
});

test('target fill, 5 % capacity warning and differences against the reference', () => {
 assert.deepEqual(fillToTarget(4.4, 44), {modules: 10, exact: true, below: null});
 assert.deepEqual(fillToTarget(5, 44), {modules: 9, exact: false, below: 8});
 const a = resolveSetup(fixture, {id: 'a', modelId: fixture.id, modules: 10, choices: {}});
 const b = resolveSetup(fixture, {id: 'b', modelId: fixture.id, modules: 11, choices: {}});
 const c = resolveSetup(fixture, {id: 'c', modelId: fixture.id, modules: 10, choices: {boundary: 'stack'}});
 assert.deepEqual(capacityWarnings([a, b, c], 0).map(w => w.kind), ['nominaal', 'grens']);
 const d = differences([{waterstof_kg: 100, benut: 0.5}, {waterstof_kg: 110, benut: 0.6}], 0);
 assert.equal(d[0], null); assert.ok(close(d[1].waterstof_kg.pct, 0.1)); assert.equal(d[1].benut.pct, null);
});

test('CSV: BOM, semicolons, decimal commas, statuses with bron./aanname./uitkomst. and the catalogue version', () => {
 const general = {strategy: 'verdelen', years: [2025], values: {}};
 const resolved = resolveSetup(fixture, {id: 'a', modelId: fixture.id, modules: 10, choices: {}}, general);
 const [result] = compareNow([resolved], general, supplies);
 const csv = comparisonCSV({catalogue, general, entries: [{setup: {label: 'A'}, model: fixture, resolved, result}]});
 assert.ok(csv.startsWith('﻿'));
 const [head, year, mean] = parseCSV(csv.slice(1));
 assert.ok(year.length === head.length && mean.length === head.length);
 assert.ok(head.every(h => /^(bron|aanname|uitkomst)\./.test(h)));
 const col = name => head.indexOf(name);
 assert.equal(year[col('bron.catalogusversie')], catalogue.revision);
 assert.equal(year[col('aanname.minimumlast')], '20'); assert.equal(year[col('aanname.minimumlast.status')], 'bron');
 assert.equal(year[col('aanname.deellastvoordeel.status')], 'standaard technologie');
 assert.equal(year[col('aanname.besturing')], 'verdelen');
 assert.equal(year[col('uitkomst.windjaar')], '2025'); assert.equal(mean[col('uitkomst.windjaar')], 'gemiddelde');
 assert.match(year[col('uitkomst.waterstof_kg_per_jaar')], /^\d+,\d+$/);
 assert.match(year[col('uitkomst.rust_op')], /bronwaarden en \d+ aannames/);
 assert.ok(year[col('uitkomst.invoer_hash')].length >= 10);
});

test('general assumptions are shared, standard by default and labelled when changed', () => {
 const g = generalValues({strategy: 'samen', years: [2023], values: {storingen_per_jaar: 4}});
 assert.equal(g.strategy, 'samen'); assert.equal(g.strategyStatus, 'eigen invoer'); assert.deepEqual(g.years, [2023]);
 assert.equal(g.fields.find(f => f.key === 'storingen_per_jaar').status, 'eigen invoer');
 assert.equal(g.fields.find(f => f.key === 'hersteltijd_uur').status, 'standaard technologie');
 assert.equal(generalValues({strategy: 'onbekend', years: [], values: {}}).strategy, 'verdelen');
});

test('the cache key covers every calculation input, including nested assumptions', () => {
 const general = {strategy: 'verdelen', years: [2025], values: {}};
 const a = resolveSetup(fixture, {id: 'a', modelId: fixture.id, modules: 10, choices: {}}, general);
 const b = resolveSetup(fixture, {id: 'b', modelId: fixture.id, modules: 10, choices: {energy: 55}}, general);
 const c = resolveSetup(fixture, {id: 'c', modelId: fixture.id, modules: 10, choices: {}}, {...general, values: {storingen_per_jaar: 3}});
 const keys = [a, b, c].map(r => jobFor(r, r === c ? {...general, values: {storingen_per_jaar: 3}} : general, 2025).key);
 assert.equal(new Set(keys).size, 3);
 assert.equal(jobFor(a, general, 2025).key, jobFor(resolveSetup(fixture, {id: 'z', modelId: fixture.id, modules: 10, choices: {}}, general), general, 2025).key);
 assert.notEqual(inputHash({x: {p: 1}}), inputHash({x: {p: 2}}));
 assert.equal(inputHash({x: {p: 1, q: 2}}), inputHash({x: {q: 2, p: 1}}));
 const [ra, rb] = compareNow([a, b], general, supplies);
 assert.ok(ra.mean.waterstof_kg > rb.mean.waterstof_kg);
});

test('datasheet links come from the repository paths in the source text, not from online URLs', () => {
 const source = 'Siemens Energy, p. 3; https://assets.siemens-energy.com/dam/x/Brochure%20file.pdf; oorspronkelijke brochure: ProtonExchangeMembrane/Siemens_17.5MW.pdf; ProtonExchangeMembrane/Siemens_17.5MW.pdf p. 2';
 assert.deepEqual(datasheetLinks(source), ['/api/atlas/datasheets/ProtonExchangeMembrane/Siemens_17.5MW.pdf']);
 assert.deepEqual(datasheetLinks('Anders/CPH2_1_5MW.pdf; p. 1 en AlkalineElectroLysis/nel_25MW.pdf'), ['/api/atlas/datasheets/Anders/CPH2_1_5MW.pdf', '/api/atlas/datasheets/AlkalineElectroLysis/nel_25MW.pdf']);
 assert.deepEqual(datasheetLinks(''), []);
 assert.deepEqual(interpretModel({id: 'x', name: 'x', manufacturer: 'x', technology: 'PEM', values: {source: 'ProtonExchangeMembrane/nel_10MW.pdf; p. 1'}}).datasheets, ['/api/atlas/datasheets/ProtonExchangeMembrane/nel_10MW.pdf']);
});
