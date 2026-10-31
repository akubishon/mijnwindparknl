import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBrowserModel} from './helpers/pyodide-runtime.mjs';

// /opsplitsing in de browser: 44 MW is stackvermogen en de BoP (3 % vast + 7 % variabel) komt erbovenop, zoals in het
// Python-model. Bij vollast neemt 44 MW stack dus 48,4 MW af van het bruto aanbod (tot 48,7 MW).
const {json} = await loadBrowserModel();

test('the assumptions form offers the model BoP fields with their source and defaults', () => {
  const meta = json("dispatch('/api/opsplitsing/aannames', {})");
  const fields = Object.fromEntries(meta.groepen.flatMap(g => g.velden.map(f => [f.key, f])));
  assert.deepEqual([fields.bop_vast.standaard, fields.bop_vast.bron], [3, 'mijnwindpark.nl']);
  assert.deepEqual([fields.bop_variabel.standaard, fields.bop_variabel.bron], [7, 'mijnwindpark.nl']);
  for (const technology of Object.values(meta.technologieen)) assert.deepEqual([technology.waarden.bop_vast, technology.waarden.bop_variabel], [3, 7]);
  assert.match(fields.capaciteit_mw.uitleg, /Totaal stackvermogen.*48,4 MW.*48,7 MW/);
  assert.doesNotMatch(JSON.stringify(meta), /systeemvermogen/);
});

test('a calculation applies BoP on top of the stack power and is marked with model version 17', () => {
  assert.equal(json('model.MODEL_VERSION'), 17);
  assert.ok(json('model.SENSITIVE_OPERATION').includes('bop_vast'), 'BoP belongs in the sensitivity analysis again');
  const result = json("dispatch('/api/opsplitsing', {'jaren': [2025], 'modules': [1], 'strategie': 'verdelen'})");
  assert.equal(result.model_versie, 17);
  assert.deepEqual([result.aannames.capaciteit_mw, result.aannames.bop_vast, result.aannames.bop_variabel], [44, 0.03, 0.07]);
  assert.ok(Math.abs(json('model.draw_mw(44, 44, model.Aannames())') - 48.4) < 1e-9);
  // Own BoP values are used as given.
  assert.equal(json("dispatch('/api/opsplitsing', {'jaren': [2025], 'modules': [1], 'aannames': {'bop_vast': 0, 'bop_variabel': 0}})").aannames.bop_vast, 0);
});

test('at full load the installation draws 48,4 MW of the supply, whatever the module count', () => {
  // 24 oktober 2025 heeft 120 tienminutenstappen met meer dan 48,4 MW aanbod.
  const day = json("dispatch('/api/opsplitsing/dag', {'datum': '2025-10-24', 'modules': [1, 2, 4], 'strategie': 'verdelen'})");
  for (const [n, config] of Object.entries(day.configuraties)) {
    const size = config.module_mw;
    const draws = config.stappen.map(step => step.stack.filter(x => x > 0).reduce((sum, x) => sum + x * 1.07 + 0.03 * size, 0));
    const peak = Math.max(...draws);
    assert.ok(Math.abs(peak - 48.4) < 0.01, `${n} modules: ${peak} MW`);
    config.stappen.forEach((step, i) => assert.ok(draws[i] <= step.aanbod + 0.01, `${n} modules, step ${i}: ${draws[i]} > ${step.aanbod}`));
  }
});
