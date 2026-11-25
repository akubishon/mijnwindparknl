import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogueModels} from '../src/electrolyser-catalogue.mjs';
import {resolveSetup, generalValues, jobFor, comparisonCSV} from '../src/electrolyser-setup.mjs';
import {compareNow} from '../src/electrolyser-run.mjs';
import {windSeries, describeStudio, isStudioProfile, DEFAULT_WIND_PROFILE} from '../src/electrolyser-wind.mjs';
import {buildSupply, bolswardParks, yearAxis} from '../src/studio/supply.mjs';
import {parkFromFeature, HOUTRIBDIJK, STAVOREN} from '../src/studio/park-model.mjs';
import {studioProfile, studioWindText, BOLSWARD} from '../src/studio/project.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const data = JSON.parse(read('../src/opsplitsing/data/2025.json'));
const models = catalogueModels(JSON.parse(read('./fixtures/atlas-catalogue.json'))).models;
const fixture = models.find(m => m.name.startsWith('Fixture Systeem 4,4 MW'));
const general = {strategy: 'verdelen', years: [2025], values: {}};
const windFromBundle = () => { const axis = yearAxis(2025), h = new Float64Array(axis.n).fill(NaN), s = new Float64Array(axis.n).fill(NaN); data.t.forEach((t, k) => { const i = (t - axis.start) / 600; h[i] = data.stations.houtribdijk[k]; s[i] = data.stations.stavoren[k]; }); return {[HOUTRIBDIJK]: h, [STAVOREN]: s}; };

test('Bolsward in projectmodus geeft dezelfde uitkomst als Vergelijken op mijnwindpark.nl', () => {
  const profile = studioProfile(BOLSWARD);
  assert.ok(isStudioProfile(profile));
  const studioGeneral = {...general, wind: profile};
  assert.equal(generalValues(studioGeneral).windProfile, profile);
  const setup = resolveSetup(fixture, {id: 'a', modelId: fixture.id, modules: 10, choices: {}}, studioGeneral);
  assert.notEqual(jobFor(setup, studioGeneral, 2025).key, jobFor(setup, general, 2025).key, 'eigen cachesleutel');
  const supply = buildSupply({jaar: 2025, parks: bolswardParks(), wind: windFromBundle()});
  const [studio] = compareNow([setup], studioGeneral, {2025: supply});
  const [site] = compareNow([setup], general, {2025: data});
  assert.deepEqual(studio.mean, site.mean);
  assert.deepEqual(studio.perYear, site.perYear);
});

test('een project met een ander park rekent zonder fouten; CSV noemt locatie, parken en stations', () => {
  const park = {...parkFromFeature({geometry: {coordinates: [5.6, 52.9]}, properties: {naam: 'Testpark', mw: 30, turbines: 10}}), aandeel: 0.5, stations: [STAVOREN]};
  const project = {...BOLSWARD, id: 'abcdefghijkl', naam: 'Test', parken: [park]};
  const profile = studioProfile(project);
  describeStudio(profile, studioWindText(project));
  const studioGeneral = {...general, wind: profile};
  const setup = resolveSetup(fixture, {id: 'a', modelId: fixture.id, modules: 4, choices: {}}, studioGeneral);
  const supply = buildSupply({jaar: 2025, parks: [park], wind: windFromBundle()});
  const [result] = compareNow([setup], studioGeneral, {2025: supply});
  assert.ok(result.mean.waterstof_kg > 0);
  assert.match(windSeries(profile), /Testpark.*15,0 MW.*Stavoren/);
  const csv = comparisonCSV({catalogue: {revision: 'x'}, general: studioGeneral, entries: [{setup: {label: 'A'}, model: fixture, resolved: setup, result}]});
  assert.match(csv, /Testpark/); assert.match(csv, /53,066/);
  assert.equal(windSeries(DEFAULT_WIND_PROFILE).startsWith('Bruto toegewezen windaanbod'), true);
});
