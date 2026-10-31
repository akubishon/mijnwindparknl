import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogueModels} from '../src/electrolyser-catalogue.mjs';
import {resolveSetup, fillToTarget, fillWithinLimit, defaultLimit, validLimit, limitCheck, modelFit, stackPowerMW, MAX_MODULES} from '../src/electrolyser-setup.mjs';

const catalogue = JSON.parse(readFileSync(new URL('./fixtures/atlas-catalogue.json', import.meta.url), 'utf8'));
const models = catalogueModels(catalogue).models;
const byName = name => models.find(m => m.name.startsWith(name));
const fixture = byName('Fixture Systeem 4,4 MW'); // 4,4 MW systeemvermogen per module = 4 MW stack met de standaard 10 % BoP
const setupOf = modules => ({id: 'a', modelId: fixture.id, modules, choices: {}});
const limit = (mode, extra = {}) => ({...defaultLimit(), mode, ...extra});

test('the module limit is off by default and then changes nothing', () => {
 assert.equal(defaultLimit().mode, 'uit');
 assert.equal(defaultLimit().max, 12);
 const plain = resolveSetup(fixture, setupOf(44));
 const withRules = resolveSetup(fixture, setupOf(44), undefined, {target: 44, limit: defaultLimit()});
 assert.equal(plain.ready, true);
 assert.equal(withRules.ready, true);
 assert.deepEqual(withRules.problems, []);
 assert.deepEqual(withRules.limit, {mode: 'uit', ok: true, blocks: false, problems: []});
 // An invalid stored limit falls back to "off" instead of blocking.
 assert.equal(resolveSetup(fixture, setupOf(44), undefined, {target: 44, limit: {mode: 'blokkeren', max: 0}}).ready, true);
});

test('a blocking limit makes a setup with too many modules not ready', () => {
 const rules = {target: 44, limit: limit('blokkeren')};
 const ok = resolveSetup(fixture, setupOf(11), undefined, rules); // 11 × 4 = 44 MW stack
 assert.equal(ok.ready, true); assert.equal(ok.limit.ok, true);
 const twelve = resolveSetup(fixture, setupOf(12), undefined, rules); // exactly at the limit, 48 MW stack
 assert.equal(twelve.ready, true);
 const over = resolveSetup(fixture, setupOf(13), undefined, rules);
 assert.equal(over.ready, false); assert.equal(over.limit.blocks, true);
 assert.ok(over.problems.some(p => p.startsWith('Modulelimiet:') && p.includes('13 modules') && p.includes('12')));
 assert.equal(over.aannames, undefined);
});

test('a warning limit reports the same problem but keeps the setup calculable', () => {
 const over = resolveSetup(fixture, setupOf(13), undefined, {target: 44, limit: limit('waarschuwen')});
 assert.equal(over.ready, true);
 assert.equal(over.limit.ok, false); assert.equal(over.limit.blocks, false);
 assert.ok(over.limit.problems[0].includes('13 modules'));
 assert.deepEqual(over.problems, []);
 assert.ok(over.aannames);
});

test('the limit also decides whether the target power has to be reached', () => {
 // 9 × 4,4 = 39,6 MW is 10 % below 44 MW.
 const nine = {modules: 9, moduleMW: 4.4, target: 44};
 assert.equal(limitCheck(nine, limit('blokkeren')).ok, false);
 assert.match(limitCheck(nine, limit('blokkeren')).problems[0], /haalt het doelvermogen van 44 MW niet/);
 assert.equal(limitCheck(nine, limit('blokkeren', {reach: 'onder', tolerance: 0.05})).ok, false);
 assert.match(limitCheck(nine, limit('blokkeren', {reach: 'onder', tolerance: 0.05})).problems[0], /meer dan 5 % onder/);
 assert.equal(limitCheck(nine, limit('blokkeren', {reach: 'onder', tolerance: 0.1})).ok, true);
 // Reaching the target exactly is enough under the strict rule, despite floating point.
 assert.equal(limitCheck({modules: 10, moduleMW: 4.4, target: 44}, limit('blokkeren')).ok, true);
 // Without a target only the module count is checked.
 assert.equal(limitCheck({modules: 3, moduleMW: 4.4, target: undefined}, limit('blokkeren')).ok, true);
 // The target is total stack power: 10 × 4,4 MW system is 10 × 4 = 40 MW stack, 9 % below 44 MW.
 const under = resolveSetup(fixture, setupOf(10), undefined, {target: 44, limit: limit('blokkeren')});
 assert.equal(under.ready, false);
 assert.match(under.limit.problems[0], /10 × 4 = 40 MW stackvermogen haalt het doelvermogen van 44 MW niet/);
 assert.equal(resolveSetup(fixture, setupOf(10), undefined, {target: 44, limit: limit('blokkeren', {reach: 'onder', tolerance: 0.1})}).ready, true);
 assert.equal(resolveSetup(fixture, setupOf(10), undefined, {target: 44, limit: limit('uit')}).ready, true);
});

test('catalogue fit: modules for 44 MW and whether they fit in 12', () => {
 const fit = name => modelFit(byName(name).power.value, 44, limit('blokkeren'));
 assert.deepEqual([fit('Nel PSM').needed, fit('Nel PSM').ok], [5, true]);
 assert.deepEqual([fit('Sunfire HyLink Alkaline 22').needed, fit('Sunfire HyLink Alkaline 22').ok], [5, true]);
 assert.deepEqual([fit('Accelera by Cummins HyLYZER 1000-30').needed, fit('Accelera by Cummins HyLYZER 1000-30').ok], [9, true]);
 assert.deepEqual([fit('Stargate Hydrogen').needed, fit('Stargate Hydrogen').ok], [10, true]);
 for (const [name, needed] of [['Oort Energy Theia', 44], ['Quest One ME450', 44], ['H₂ Energy 1 MW PEM', 48], ['Enapter AEM Nexus 1000', 48]]) {
  const f = fit(name);
  assert.equal(f.needed, needed, name); assert.equal(f.ok, false, name); assert.equal(f.modules, 12, name);
 }
 // Off: nothing is judged and the full module count is kept.
 const off = modelFit(1, 44, limit('uit'));
 assert.deepEqual([off.needed, off.modules, off.ok, off.blocks], [44, 44, true, false]);
 // A 3,5 MW module reaches 42 MW in 12 modules: too little when strict, fine with 5 % tolerance.
 assert.equal(modelFit(3.5, 44, limit('waarschuwen')).ok, false);
 assert.equal(modelFit(3.5, 44, limit('waarschuwen', {reach: 'onder', tolerance: 0.05})).ok, true);
 assert.equal(modelFit(0, 44, limit('blokkeren')), null);
 assert.equal(modelFit(5, 0, limit('blokkeren')), null);
});

test('fill to target is capped only by a blocking limit', () => {
 const same = (moduleMW, mode) => assert.deepEqual(fillWithinLimit(moduleMW, 44, limit(mode)), {...fillToTarget(moduleMW, 44), capped: false});
 same(5, 'uit'); same(1, 'uit'); same(1, 'waarschuwen'); same(5, 'blokkeren'); same(4.4, 'blokkeren');
 assert.deepEqual(fillWithinLimit(5, 44), {modules: 9, exact: false, below: 8, capped: false});
 assert.deepEqual(fillWithinLimit(1, 44, limit('blokkeren')), {modules: 12, exact: false, below: null, capped: true});
 assert.equal(fillWithinLimit(0, 44, limit('blokkeren')), null);
 // The catalogue fit reports the real count, not the hard 200-module maximum.
 assert.equal(modelFit(0.1, 44, limit('uit')).needed, 440);
});

test('validLimit accepts stored limits only when every part is sound', () => {
 assert.equal(validLimit(defaultLimit()), true);
 assert.equal(validLimit(limit('blokkeren', {max: 1})), true);
 for (const bad of [null, {}, limit('aan'), limit('blokkeren', {max: 0}), limit('blokkeren', {max: 12.5}), limit('blokkeren', {max: MAX_MODULES + 1}),
  limit('blokkeren', {reach: 'ruim'}), limit('blokkeren', {tolerance: -0.1}), limit('blokkeren', {tolerance: 0.6}), limit('blokkeren', {tolerance: NaN})])
  assert.equal(validLimit(bad), false, JSON.stringify(bad));
});

test('the target counts stack power: a system rating is converted with the BoP before filling', () => {
 assert.ok(Math.abs(stackPowerMW(4.4, 'systeem') - 4) < 1e-12);
 assert.equal(stackPowerMW(4.4, 'stack'), 4.4);
 assert.ok(Math.abs(stackPowerMW(4.4, 'systeem', 1.2) - 4.4 / 1.2) < 1e-12);
 assert.equal(stackPowerMW(undefined, 'systeem'), null);
 const r = resolveSetup(fixture, setupOf(1));
 assert.ok(Math.abs(r.stackModuleMW - 4) < 1e-12);
 // Vul aan tot doelvermogen: 11 modules of 4 MW stack reach 44 MW stack (48,4 MW at full load with BoP), not 10 × 4,4 MW system.
 assert.deepEqual(fillWithinLimit(r.stackModuleMW, 44), {modules: 11, exact: true, below: null, capped: false});
 const filled = resolveSetup(fixture, setupOf(11));
 assert.ok(Math.abs(filled.aannames.capaciteit_mw - 44) < 1e-9);
 assert.ok(Math.abs(filled.intakeMW - 48.4) < 1e-9);
 assert.equal(modelFit(stackPowerMW(fixture.power.value, fixture.boundary.value), 44).needed, 11);
});
