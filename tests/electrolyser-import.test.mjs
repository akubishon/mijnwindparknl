import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAtlasImport, setupsFromImport, MAX_SETUPS, DEFAULT_TARGET_MW} from '../src/electrolyser-setup.mjs';
import {catalogueModels} from '../src/electrolyser-catalogue.mjs';
import {readFileSync} from 'node:fs';

const b64 = obj => Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8').toString('base64url');
const search = obj => '?foo=1&atlas=' + b64(obj);
const ids = n => Array.from({length: n}, (_, i) => (i + 1).toString(16).padStart(12, '0'));
const good = {type: 'atlas-shortlist', version: 1, target: 44, ids: ids(4), maxModules: null, revision: 'r1'};

test('geldige payload wordt gelezen en genormaliseerd', () => {
 const r = parseAtlasImport(search(good));
 assert.equal(r.ok, true);
 assert.deepEqual(r.payload, {ids: ids(4), target: 44, maxModules: null, revision: 'r1'});
 assert.equal(parseAtlasImport('?x=1').present, false);
 assert.equal(parseAtlasImport('').present, false);
});

test('ongeldige payloads worden geweigerd met een melding', () => {
 const bad = [
  {...good, type: 'iets-anders'}, {...good, version: 2}, {...good, ids: []}, {...good, ids: ids(7)},
  {...good, ids: ['zzzzzzzzzzzz']}, {...good, ids: ['ABCDEF012345']}, {...good, ids: [ids(1)[0], ids(1)[0]]}, {...good, ids: 'abc'}, null, [],
 ];
 for (const b of bad) { const r = parseAtlasImport(search(b)); assert.equal(r.ok, false, JSON.stringify(b)); assert.equal(r.present, true); assert.ok(r.error); assert.equal(r.payload, null); }
 for (const raw of ['?atlas=', '?atlas=@@@', '?atlas=' + 'A'.repeat(5000), '?atlas=' + b64('geen json')]) assert.equal(parseAtlasImport(raw).ok, false, raw);
});

test('doelvermogen buiten 1–200 MW valt weg, de modellen blijven', () => {
 for (const target of [0, 0.5, 201, 100000, -3, null, 'x']) { const r = parseAtlasImport(search({...good, target})); assert.equal(r.ok, true); assert.equal(r.payload.target, null); }
 assert.equal(parseAtlasImport(search({...good, target: 200})).payload.target, 200);
 assert.equal(parseAtlasImport(search({...good, maxModules: 0})).payload.maxModules, null);
 assert.equal(parseAtlasImport(search({...good, maxModules: 12})).payload.maxModules, 12);
});

test('zes opstellingen zijn toegestaan', () => { assert.equal(MAX_SETUPS, 6); });

// Real catalogue fixture: setups are filled to the target using the module power of each model.
const catalogue = JSON.parse(readFileSync(new URL('./fixtures/atlas-catalogue.json', import.meta.url), 'utf8'));
const interpreted = catalogueModels(catalogue);

test('setupsFromImport maakt per bekend model een aangevulde opstelling', () => {
 const known = interpreted.models.filter(m => m.power.value).slice(0, 3).map(m => m.id);
 const payload = {ids: [...known, 'ffffffffffff'], target: 44, maxModules: null, revision: ''};
 const r = setupsFromImport(payload, interpreted.models);
 assert.equal(r.setups.length, known.length);
 assert.deepEqual(r.notFound, ['ffffffffffff']);
 assert.equal(r.target, 44);
 assert.equal(r.limitChanged, false);
 r.setups.forEach((s, i) => {
  const m = interpreted.models.find(x => x.id === known[i]);
  assert.equal(s.modelId, known[i]);
  const mw = m.boundary.value === 'stack' ? m.power.value : m.power.value / 1.1;
  assert.ok(s.modules * mw >= 44 - 1e-6, `${m.name}: ${s.modules} × ${mw}`);
  assert.ok((s.modules - 1) * mw < 44 + 1e-6 || s.modules === 1);
 });
 assert.equal(new Set(r.setups.map(s => s.id)).size, r.setups.length);
});

test('maxModules zet de modulelimiet op waarschuwen en target valt terug op huidig doel', () => {
 const m = interpreted.models.find(x => x.power.value);
 const r = setupsFromImport({ids: [m.id], target: null, maxModules: 3, revision: ''}, interpreted.models, {target: 20});
 assert.equal(r.target, 20);
 assert.deepEqual({mode: r.limit.mode, max: r.limit.max}, {mode: 'waarschuwen', max: 3});
 assert.equal(r.limitChanged, true);
});

test('uitgeschakelde fabrikant (Accelera) komt in notFound', () => {
 const off = interpreted.excluded[0];
 if (!off) return;
 const r = setupsFromImport({ids: [off.id], target: 44, maxModules: null, revision: ''}, interpreted.models);
 assert.deepEqual(r.notFound, [off.id]);
 assert.equal(r.setups.length, 0);
});
