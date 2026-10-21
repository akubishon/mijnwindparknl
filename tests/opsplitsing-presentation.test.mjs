import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/opsplitsing/opsplitsing.js', import.meta.url), 'utf8');

function presentation(meta = {groepen: []}) {
  const context = vm.createContext({
    document: {getElementById: () => ({})},
    Intl,
  });
  // Load the actual presentation code without starting requests or browser setup.
  vm.runInContext(source.replace(/^\s*start\(\);\s*$/m, ''), context);
  vm.runInContext(`meta = ${JSON.stringify(meta)};
    values = () => { throw new Error('Live form must not be read'); };
    selection = () => { throw new Error('Live selection must not be read'); };
    tech = 'different-live-technology';
    globalThis.presentation = {stepMetrics, snapshotRequest, resultCsv};`, context);
  return context.presentation;
}

const plain = value => JSON.parse(JSON.stringify(value));
function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Number.isFinite(actual), `Expected a finite number, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}
function frozen(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}

// Native model, alkaline_hoog, verdelen, 2022. Keep absolute totals so the
// presentation must reconstruct differences rather than trust cached extras.
const rows2022 = [
  {modules: 4, waterstof_t: 3131.849261172063, kosten_meur_jaar: 25.64902453245712,
    productie_uur: 6140.628322126852, lcoh_eur_kg: 8.189737881208954},
  {modules: 5, waterstof_t: 3142.551059394705, kosten_meur_jaar: 25.803632316721693,
    productie_uur: 6433.690868565687, lcoh_eur_kg: 8.211046321612288,
    extra_waterstof_t: 999, extra_kosten_meur_jaar: -999, marginale_eur_kg: -999,
    extra_productie_uur: -999, stap_loont: true, beste: true},
  {modules: 6, waterstof_t: 3165.0263066029042, kosten_meur_jaar: 25.98306620950879,
    productie_uur: 6680.357408222064, lcoh_eur_kg: 8.209431357743442},
];

test('step metrics preserve the 2022 reversal and its small total-cost effect', () => {
  const {stepMetrics} = presentation();
  const input = frozen(structuredClone(rows2022));
  const steps = stepMetrics(input);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].before, input[0]);
  assert.equal(steps[0].row, input[1]);
  close(steps[0].deltaKg, 10701.798222642083, 1e-6);
  close(steps[0].deltaCost, 154607.78426457368, 1e-6);
  close(steps[0].deltaHours, 293.0625464388349);
  close(steps[0].marginal, 14.446897712710168);
  close(steps[0].deltaLcoh * 100, 2.1308440403334576);
  close(steps[1].deltaKg, 22475.247208199107, 1e-6);
  close(steps[1].deltaCost, 179433.89278709888, 1e-6);
  close(steps[1].marginal, 7.9836226549552824);
  close(steps[1].deltaLcoh * 100, -0.1614963868846071);
  assert.ok(steps[1].deltaLcoh < 0, 'Six improves on five');
  assert.ok(steps[1].vsLowest > 0, 'Six remains dearer than four');
  close(steps[1].vsLowest, input[2].lcoh_eur_kg - input[0].lcoh_eur_kg);
  assert.equal(input[1].extra_waterstof_t, 999, 'Cached fields are neither trusted nor overwritten');
});

test('step metrics retain zero/negative production and negative marginal costs', () => {
  const {stepMetrics} = presentation();
  const rows = frozen([
    {modules: 2, waterstof_t: 1, kosten_meur_jaar: 0.001, productie_uur: 100, lcoh_eur_kg: 1},
    {modules: 4, waterstof_t: 1, kosten_meur_jaar: 0.0009, productie_uur: 90, lcoh_eur_kg: 0.9},
    {modules: 8, waterstof_t: 0.9, kosten_meur_jaar: 0.00108, productie_uur: 80, lcoh_eur_kg: 1.2},
    {modules: 10, waterstof_t: 1, kosten_meur_jaar: 0.001, productie_uur: 100, lcoh_eur_kg: 1},
  ]);
  const [same, less, cheaper] = stepMetrics(rows);
  assert.equal(same.deltaKg, 0);
  assert.equal(same.marginal, null);
  close(same.deltaCost, -100);
  assert.equal(same.deltaHours, -10);
  assert.ok(same.deltaLcoh < 0, 'The total cost can fall without extra hydrogen');
  close(less.deltaKg, -100);
  assert.equal(less.marginal, null, 'An output loss is not a cost per extra kilo');
  assert.ok(less.deltaLcoh > 0);
  close(cheaper.deltaKg, 100);
  close(cheaper.deltaCost, -80);
  close(cheaper.marginal, -0.8);
  assert.equal(less.before.modules, 4);
  assert.equal(less.row.modules, 8, 'A step can span multiple module counts');
});

test('single configurations and unavailable cost prices do not invent comparisons', () => {
  const {stepMetrics} = presentation();
  assert.deepEqual(plain(stepMetrics([])), []);
  assert.deepEqual(plain(stepMetrics([rows2022[0]])), []);
  const rows = [
    {modules: 1, waterstof_t: 0, kosten_meur_jaar: 0.1, productie_uur: 0, lcoh_eur_kg: null},
    {modules: 2, waterstof_t: 1, kosten_meur_jaar: 0.2, productie_uur: 10, lcoh_eur_kg: 200},
    {modules: 3, waterstof_t: 0, kosten_meur_jaar: 0.3, productie_uur: 0, lcoh_eur_kg: null},
  ];
  const [first, second] = stepMetrics(rows);
  assert.equal(first.deltaLcoh, null, 'Missing LCOH is not zero');
  assert.equal(first.vsLowest, 0);
  assert.equal(second.deltaLcoh, null);
  assert.equal(second.vsLowest, null);
  assert.equal(second.marginal, null);
});

test('request snapshots use saved assumptions and own their mutable collections', () => {
  const metadata = {groepen: [{velden: [
    {key: 'capaciteit_mw', schaal: 1},
    {key: 'minimumlast', schaal: 100},
    {key: 'bop_vast', schaal: 100},
    {key: 'storingen_per_jaar', schaal: 1},
    {key: 'waterstofpremie_eur_kg', schaal: 1},
  ]}]};
  const {snapshotRequest} = presentation(metadata);
  const result = frozen({
    aannames: {capaciteit_mw: 44, minimumlast: 0.4, bop_vast: 0.03,
      storingen_per_jaar: 2, waterstofpremie_eur_kg: 0},
    strategie: 'verdelen', jaren: [2022, 2025],
    rijen: [{modules: 4}, {modules: 6}],
  });
  const request = snapshotRequest(result);
  assert.deepEqual(plain(request), {
    aannames: {capaciteit_mw: 44, minimumlast: 40, bop_vast: 3,
      storingen_per_jaar: 2, waterstofpremie_eur_kg: 0},
    strategie: 'verdelen', jaren: [2022, 2025], modules: [4, 6],
  });
  request.aannames.minimumlast = 60;
  request.jaren.push(2024);
  request.modules.push(8);
  assert.equal(result.aannames.minimumlast, 0.4);
  assert.deepEqual(result.jaren, [2022, 2025]);
  assert.deepEqual(result.rijen.map(r => r.modules), [4, 6]);
});

function parseCsv(csv) {
  const records = [];
  let record = [], field = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ';' && !quoted) { record.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && csv[i + 1] === '\n') i++;
      record.push(field); records.push(record); record = []; field = '';
    } else field += char;
  }
  assert.equal(quoted, false, 'CSV quotes must close');
  if (record.length || field) { record.push(field); records.push(record); }
  return records;
}

test('CSV preserves row fields, precise Dutch numbers, context and all original assumptions', () => {
  const {resultCsv} = presentation();
  const note = 'Wind; "harde wind"\nvolgende regel';
  const rows = structuredClone(rows2022);
  // Real native rows carry their own strategy, which must not collide with
  // calculation context in the export header.
  rows.forEach(row => { row.strategie = 'verdelen'; });
  rows[0].toelichting = note;
  rows[0].jaren = {2022: {waterstof_t: rows[0].waterstof_t, lcoh_eur_kg: rows[0].lcoh_eur_kg}};
  rows[0].eq_uren_per_module = [6339.730610225222, 6341.399531332517];
  rows[1].alleen_in_deze_rij = 123.45678901234567;
  const result = frozen({
    strategie: 'verdelen', jaren: [2022, 2025], technologie: 'alkaline_hoog',
    aannames: {minimumlast: 0.4, capaciteit_mw: 44, degradatie_1000h: 0.0012,
      waterstofpremie_eur_kg: 0, toelichting: note},
    rijen: rows,
  });
  const csv = resultCsv(result);
  assert.ok(csv.startsWith('\uFEFF'), 'UTF-8 BOM supports spreadsheet import');
  const [header, ...records] = parseCsv(csv.slice(1));
  assert.equal(records.length, 3);
  assert.equal(new Set(header).size, header.length, 'No ambiguous duplicate headers');
  assert.ok(records.every(row => row.length === header.length));
  const data = records.map(row => Object.fromEntries(header.map((key, i) => [key, row[i]])));
  assert.equal(data[0].toelichting, note, 'Semicolons, quotes and newlines round-trip');
  assert.deepEqual(JSON.parse(data[0].jaren), rows[0].jaren);
  assert.deepEqual(JSON.parse(data[0].eq_uren_per_module), rows[0].eq_uren_per_module);
  for (const [index, row] of rows.entries()) {
    for (const [key, value] of Object.entries(row)) {
      assert.ok(header.includes(key), `Original row field ${key} must remain available`);
      if (typeof value === 'number') assert.equal(data[index][key], value.toString().replace('.', ','));
    }
    assert.equal(data[index]['berekening.windjaren'], '2022, 2025');
    assert.equal(data[index]['berekening.strategie'], 'verdelen');
    assert.equal(data[index]['berekening.technologie'], 'alkaline_hoog');
    assert.equal(data[index].strategie, 'verdelen');
    for (const [key, value] of Object.entries(result.aannames)) {
      assert.equal(data[index]['aanname.' + key], typeof value === 'number' ? value.toString().replace('.', ',') : value);
    }
  }
  assert.equal(data[0]['stap.deltaKg'], '');
  assert.equal(data[0]['stap.marginal'], '');
  assert.equal(data[0]['stap.vsLowest'], '0');
  assert.equal(data[1]['stap.van_modules'], '4');
  close(Number(data[1]['stap.deltaKg'].replace(',', '.')), 10701.798222642083, 1e-6);
  close(Number(data[2]['stap.deltaLcoh'].replace(',', '.')), rows[2].lcoh_eur_kg - rows[1].lcoh_eur_kg);
  close(Number(data[2]['stap.marginal'].replace(',', '.')), 7.9836226549552824);
});
