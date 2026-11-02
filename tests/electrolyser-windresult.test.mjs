import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogueModels} from '../src/electrolyser-catalogue.mjs';
import {resolveSetup, windResultPayload, windResultLink, encodeBase64Url, decodeBase64Url, MAX_SETUPS} from '../src/electrolyser-setup.mjs';
import {KERNEL_VERSION} from '../src/electrolyser-kernel.mjs';
import {compareNow} from '../src/electrolyser-run.mjs';
import * as eco from '../src/electrolyser-economics.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const supplies = Object.fromEntries([2022, 2023, 2024, 2025].map(y => [y, read(`../src/opsplitsing/data/${y}.json`)]));
// The fixture id is a slug; real catalogue ids are 12 hex characters, which the payload requires.
const fixture = {...catalogueModels(read('./fixtures/atlas-catalogue.json')).models.find(m => m.name.startsWith('Fixture Systeem 4,4 MW')), id: '0123456789ab'};
const general = {strategy: 'verdelen', years: [2024, 2025], values: {}};

function entries(modelOf = () => fixture, moduleCounts = [10, 2]) {
 const setups = moduleCounts.map((modules, i) => ({id: 's' + i, modelId: fixture.id, modules, choices: {}}));
 const resolved = setups.map(s => resolveSetup(fixture, s, general));
 const results = compareNow(resolved, general, supplies);
 const costsOf = resolved.map((r, i) => eco.setupCosts(r, setups[i], general));
 const costed = eco.withCosts(results.map((assembled, i) => ({assembled, a: costsOf[i].a})), 0);
 return setups.map((setup, i) => ({setup, model: modelOf(i), resolved: resolved[i], result: costed[i], costs: costsOf[i]}));
}

test('de payload bevat per model de gemiddelde uitkomsten en de rekenkernversie', () => {
 const list = entries(i => i === 0 ? fixture : {...fixture, id: 'abcdefabcdef'});
 const p = windResultPayload({entries: list, reference: 0, general, target: 44});
 assert.equal(p.type, 'windpark-result'); assert.equal(p.version, 1); assert.equal(p.kernel, KERNEL_VERSION);
 assert.deepEqual(p.years, [2024, 2025]); assert.equal(p.target, 44); assert.equal(p.reference, fixture.id);
 assert.equal(p.windprofiel, 'onafhankelijk');
 assert.equal(p.setups.length, 2);
 const [a, b] = p.setups;
 assert.equal(a.modelId, fixture.id); assert.equal(a.modules, 10); assert.equal(b.modelId, 'abcdefabcdef'); assert.equal(b.modules, 2);
 const mean = list[0].result.mean;
 assert.ok(Math.abs(a.waterstof_t - mean.waterstof_kg / 1000) <= 1e-4 * a.waterstof_t);
 assert.ok(Math.abs(a.lcoh_eur_kg - mean.lcoh_eur_kg) <= 1e-3 * a.lcoh_eur_kg);
 assert.equal(a.meerprijs_eur_kw, null);
 assert.ok(Number.isFinite(b.meerprijs_eur_kw));
 assert.ok(a.benutting > 0 && a.benutting <= 1);
 assert.ok(Array.isArray(a.aannameVelden) && a.aannameVelden.length > 0);
 assert.equal(new Set(a.aannameVelden).size, a.aannameVelden.length);
});

test('aannameVelden bevat de velden die op een standaard of aanname rusten, niet de gemeten bronwaarden', () => {
 const p = windResultPayload({entries: entries(), reference: 0, general, target: 44});
 const keys = p.setups[0].aannameVelden;
 for (const k of ['opstart_koud_min', 'min_aan_min', 'prijs_eur_kw']) assert.ok(keys.includes(k), k);
 assert.ok(keys.every(k => /^[a-z0-9_]{1,40}$/.test(k)));
 // Een eigen waarde voor een algemeen veld is geen standaard meer.
 const own = windResultPayload({entries: entries(), reference: 0, general: {...general, values: {opstart_koud_min: 30}}, target: 44});
 assert.ok(!own.setups[0].aannameVelden.includes('opstart_koud_min'));
});

test('hetzelfde model in twee opstellingen wordt één keer verstuurd, met het beste resultaat', () => {
 const list = entries();
 const p = windResultPayload({entries: list, reference: 0, general, target: 44});
 assert.equal(p.setups.length, 1);
 const best = list.reduce((x, y) => x.result.mean.lcoh_eur_kg <= y.result.mean.lcoh_eur_kg ? x : y);
 assert.equal(p.setups[0].modules, best.resolved.modules);
});

test('opstellingen zonder resultaat of met een ongeldig model-ID gaan niet mee; maximaal 6 modellen', () => {
 const list = entries(() => fixture);
 assert.equal(windResultPayload({entries: [{...list[0], result: null}], reference: 0, general, target: 44}).setups.length, 0);
 assert.equal(windResultPayload({entries: [{...list[0], model: {id: 'niet-geldig'}}], reference: 0, general, target: 44}).setups.length, 0);
 const many = Array.from({length: 9}, (_, i) => ({...list[0], model: {...fixture, id: i.toString(16).padStart(12, '0')}}));
 assert.ok(windResultPayload({entries: many, reference: 0, general, target: 44}).setups.length <= MAX_SETUPS);
});

test('de link gebruikt een queryparameter en #arena, en de payload komt er ongewijzigd uit terug', () => {
 const p = windResultPayload({entries: entries(i => ({...fixture, id: i ? 'abcdefabcdef' : fixture.id})), reference: 0, general, target: 44});
 const link = windResultLink(p);
 assert.match(link, /^https:\/\/waterstofatlas\.nl\/\?windresultaat=[A-Za-z0-9_-]+#arena$/);
 const raw = new URL(link).searchParams.get('windresultaat');
 assert.deepEqual(JSON.parse(decodeBase64Url(raw)), p);
 assert.ok(raw.length < 8000, String(raw.length));
 assert.equal(windResultLink({setups: []}), null);
 assert.equal(decodeBase64Url(encodeBase64Url('Ω ≥ 5 kWh/kg')), 'Ω ≥ 5 kWh/kg');
});
