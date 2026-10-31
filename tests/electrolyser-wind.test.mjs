import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadBrowserModel} from './helpers/pyodide-runtime.mjs';
import {profileSupply, parseProduction, WIND_PROFILES, DEFAULT_WIND_PROFILE, windSeries, dayHours, localDay} from '../src/electrolyser-wind.mjs';
import {catalogueModels} from '../src/electrolyser-catalogue.mjs';
import {resolveSetup, generalValues, jobFor, comparisonCSV} from '../src/electrolyser-setup.mjs';
import {compareNow} from '../src/electrolyser-run.mjs';

// Vergelijken computes the wind profiles in JavaScript (electrolyser-wind.mjs). They must match the browser model of
// /opsplitsing (browser-runtime.py), which follows supply_year() in the Python model.
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const data = JSON.parse(read('../src/opsplitsing/data/2025.json'));
const production = parseProduction(read('../src/opsplitsing/python/data/productie_fryslan.csv'));
const {json} = await loadBrowserModel({year: 2025});
const parseCSV = text => { const rows = [[]]; let cell = '', quoted = false; for (let i = 0; i < text.length; i++) { const ch = text[i]; if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; } else if (ch === '"') quoted = true; else if (ch === ';') { rows.at(-1).push(cell); cell = ''; } else if (ch === '\r' && text[i + 1] === '\n') { rows.at(-1).push(cell); cell = ''; rows.push([]); i++; } else cell += ch; } rows.at(-1).push(cell); return rows; };
const python = profile => json(`(lambda s: {'t': s['t'], 'mw': s['mw'], 'park_mwh': s['park_mwh']})(WIND.update(parken=ALL_PARKS) or supply_year(2025, method='${profile}'))`);

test('profile names and explanations are the same as in the Opsplitsen model', () => {
  const meta = json('wind_meta()');
  assert.equal(meta.standaard, DEFAULT_WIND_PROFILE);
  assert.deepEqual(WIND_PROFILES, meta.profielen);
});

test('every wind profile matches the Python series per ten minutes', () => {
  assert.deepEqual(profileSupply(data).mw, data.mw, 'The default is the bundled series itself');
  for (const profile of Object.keys(WIND_PROFILES).filter(p => p !== DEFAULT_WIND_PROFILE)) {
    const js = profileSupply(data, profile, production), py = python(profile);
    assert.deepEqual(js.t, py.t, `${profile}: moments`);
    let off = 0;
    js.mw.forEach((v, i) => {
      const delta = Math.abs(v - py.mw[i]);
      // Rounded to 0,1 kW like supply_year(); a last-bit difference in pow/cos may only flip that rounding.
      assert.ok(delta <= 1e-4 + 1e-12, `${profile} ${i}: ${v} ≠ ${py.mw[i]}`);
      if (delta) off++;
    });
    assert.ok(off <= js.mw.length * 1e-3, `${profile}: ${off} rounding differences`);
    for (const park of ['fryslan', 'beabuorren'])
      assert.ok(Math.abs(js.park_mwh[park] / py.park_mwh[park] - 1) < 1e-9, `${profile} ${park} MWh`);
  }
  assert.throws(() => profileSupply(data, 'gemeten_dagproductie'), /productiegegevens/);
  assert.throws(() => profileSupply(data, 'hoogste'), /Onbekend windprofiel/);
});

test('Dutch calendar days, including the clock changes', () => {
  assert.deepEqual(['2025-03-30', '2025-10-26', '2025-01-01', '2024-02-29'].map(dayHours), [23, 25, 24, 24]);
  assert.equal(localDay(Date.parse('2025-06-30T22:05:00Z') / 1000), '2025-07-01');
  assert.equal(localDay(Date.parse('2025-12-31T23:05:00Z') / 1000), '2026-01-01');
  assert.equal(production.get('2025-01-19'), 0, 'A measured zero stays zero');
  assert.equal(production.size, 1461);
});

test('Vergelijken: the profile is a shared assumption, part of the cache key, the result and the CSV', () => {
  const models = catalogueModels(JSON.parse(read('./fixtures/atlas-catalogue.json'))).models;
  const fixture = models.find(m => m.name.startsWith('Fixture Systeem 4,4 MW'));
  const general = {strategy: 'verdelen', years: [2025], values: {}};
  assert.equal(generalValues(general).windProfile, DEFAULT_WIND_PROFILE, 'Stored settings without a profile mean the default');
  assert.equal(generalValues({...general, wind: 'onbekend'}).windProfile, DEFAULT_WIND_PROFILE);
  assert.equal(generalValues({...general, wind: 'productie_hoogste'}).windStatus, 'eigen invoer');
  const setup = resolveSetup(fixture, {id: 'a', modelId: fixture.id, modules: 10, choices: {}}, general);
  const keys = Object.keys(WIND_PROFILES).map(wind => jobFor(setup, {...general, wind}, 2025).key);
  assert.equal(new Set(keys).size, 4);
  const supplies = {2025: data};
  const [standard] = compareNow([setup], general, supplies);
  const [scaled] = compareNow([setup], {...general, wind: 'gemeten_dagproductie'}, supplies, new Map(), production);
  assert.ok(scaled.mean.waterstof_kg < 0.9 * standard.mean.waterstof_kg, 'Less wind than the model: less hydrogen');
  assert.ok(scaled.mean.aanbod_mwh < standard.mean.aanbod_mwh);
  const csv = comparisonCSV({catalogue: {revision: 'x'}, general: {...general, wind: 'gemeten_dagproductie'},
    entries: [{setup: {label: 'A'}, model: fixture, resolved: setup, result: scaled}]});
  const [head, row] = parseCSV(csv.slice(1));
  assert.equal(row[head.indexOf('aanname.windprofiel')], 'gemeten_dagproductie');
  assert.equal(row[head.indexOf('aanname.windprofiel.status')], 'eigen invoer');
  assert.match(windSeries('gemeten_dagproductie'), /Windprofiel: Geschaald naar gemeten dagproductie/);
  assert.doesNotMatch(windSeries(), /hoogste wind/);
});
