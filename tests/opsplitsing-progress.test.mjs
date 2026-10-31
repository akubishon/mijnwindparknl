import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {loadBrowserModel} from './helpers/pyodide-runtime.mjs';
import {translate} from '../src/i18n.mjs';

// Voortgang van Opsplitsen: browser-runtime.py meldt elke job, calculator-worker.js stuurt die met de fasen ervoor door naar
// bridge.js (zie tests/opsplitsing-bridge.test.mjs), en progressView in opsplitsing.js toont de balk.

// Korte vensters uit de jaarreeks houden elke simulatie op een paar tienden seconde.
const model = await loadBrowserModel({extra: `
import shutil
from dataclasses import replace
FULL = json.loads(Path('/app/data/2025.json').read_text())
def window(year, start): return {**FULL, 'jaar': year, 't': FULL['t'][start:start + 1500], 'mw': FULL['mw'][start:start + 1500]}
WINDOWS = {2024: window(2024, 1000), 2025: window(2025, 4000)}
model.supply_year = lambda year, client=None, method='onafhankelijk': WINDOWS[year]
progress_log = []
def collect(text): progress_log.append(json.loads(text))
def logged(call):
    progress_log.clear()
    before = sim_cache_stats()['misses']
    call()
    return {'berichten': list(progress_log), 'missers': sim_cache_stats()['misses'] - before}
def runs():
    global progress_sink
    shutil.rmtree(model.CACHE, ignore_errors=True)
    SIM_MEMO.clear()
    progress_sink = collect
    a = model.parse_aannames({})
    cheaper = replace(a, stroomprijs_eur_mwh=a.stroomprijs_eur_mwh + 10)
    try:
        return {'koud': logged(lambda: model.run(a, [2024, 2025], [1, 2, 4], 'verdelen', workers=1)),
                'kosten': logged(lambda: model.run(cheaper, [2024, 2025], [1, 2, 4], 'verdelen', workers=1)),
                'gemengd': logged(lambda: model.run(a, [2024, 2025], [1, 2, 3, 4], 'verdelen', workers=1))}
    finally:
        progress_sink = None
def analyses():
    # Echte uitkomsten voor 1 en 2 modules, steeds opnieuw teruggegeven: het gaat hier om het tellen, niet om de getallen.
    global progress_sink
    shutil.rmtree(model.CACHE, ignore_errors=True)
    SIM_MEMO.clear()
    a = model.parse_aannames({})
    real = {n: SIM_MEMO.job((WINDOWS[2025], n, a, 'verdelen')) for n in (1, 2)}
    original, SIM_MEMO.job = SIM_MEMO.job, lambda args: real[args[1]]
    progress_sink = collect
    try:
        cases = 1 + sum(len(model.variants(a, key)) for key in model.SENSITIVE_OPERATION)
        return {'gevoeligheid': logged(lambda: model.sensitivity(a, [2025], 2, 'verdelen', workers=1)), 'gevoeligheid_jobs': cases * 2,
                'omslagkaart': logged(lambda: model.omslagkaart(a, [2025], [1, 2], 'verdelen', workers=1)),
                'omslagkaart_jobs': len(model.OMSLAG_MINIMUMLAST) * 2}
    finally:
        SIM_MEMO.job, progress_sink = original, None
        SIM_MEMO.clear()
`});

const simulations = log => log.berichten.filter(message => message.fase === 'simulaties');

// Elk bericht telt één job verder, tot het totaal; daarna volgt alleen nog het samenvatten.
function countsUp(log, total) {
  const steps = simulations(log);
  assert.deepEqual(steps.map(step => step.klaar), Array.from({length: total + 1}, (_, i) => i));
  assert.ok(steps.every(step => step.totaal === total));
  assert.deepEqual(log.berichten.at(-1), {fase: 'samenvatten'});
  assert.equal(log.berichten.length, total + 2);
  const last = steps.at(-1);
  assert.equal(last.gerekend, log.missers, 'gerekend counts the jobs that were really simulated');
  assert.equal(last.te_rekenen, log.missers, 'te_rekenen announced at the start what would be simulated');
  assert.ok(steps.every(step => step.te_rekenen === last.te_rekenen));
  assert.equal(last.werk, last.te_werken, 'All announced work is done at the end');
  assert.ok(steps.every(step => step.te_werken === last.te_werken));
  return steps;
}

test('Bereken reports every job, counting cache hits as done at once', () => {
  const {koud, kosten, gemengd} = model.json('runs()');
  const cold = countsUp(koud, 6);
  assert.equal(koud.missers, 6);
  assert.deepEqual(cold.map(step => step.gerekend), [0, 1, 2, 3, 4, 5, 6]);
  // Werk weegt een job met n modules als n + 3: 1, 2 en 4 modules over twee windjaren is 2 × (4 + 5 + 7).
  assert.deepEqual(cold.map(step => step.werk), [0, 4, 8, 13, 18, 25, 32]);
  assert.equal(cold[0].te_werken, 32);
  // jaar en modules beschrijven de job die nu rekent, in de volgorde van run(): per aantal modules alle windjaren.
  assert.deepEqual(cold.map(step => [step.modules, step.jaar]),
    [[1, 2024], [1, 2025], [2, 2024], [2, 2025], [4, 2024], [4, 2025], [null, null]]);

  const cached = countsUp(kosten, 6);
  assert.equal(kosten.missers, 0, 'Only a cost changed: every job is a cache hit');
  assert.ok(cached.every(step => step.gerekend === 0 && step.te_rekenen === 0 && step.werk === 0 && step.te_werken === 0));

  const mixed = countsUp(gemengd, 8);
  assert.equal(gemengd.missers, 2, 'Only the new module count is simulated');
  assert.deepEqual(mixed.map(step => step.gerekend), [0, 0, 0, 0, 0, 1, 2, 2, 2]);
  assert.equal(mixed[0].te_werken, 12, 'Only the two new 3-module jobs count as work');
});

test('gevoeligheid and omslagkaart report their jobs the same way', () => {
  const out = model.json('analyses()');
  countsUp(out.gevoeligheid, out.gevoeligheid_jobs);
  assert.ok(out.gevoeligheid_jobs > 20);
  countsUp(out.omslagkaart, out.omslagkaart_jobs);
  assert.ok(out.omslagkaart.missers < out.omslagkaart_jobs, 'The row with the current minimum load comes from the sensitivity run');
});

test('a JavaScript progress sink is called while runPython is still computing', () => {
  const seen = [];
  model.py.globals.set('progress_sink', text => seen.push({...JSON.parse(text), at: performance.now()}));
  const began = performance.now();
  try {
    model.py.runPython("SIM_MEMO.clear(); shutil.rmtree(model.CACHE, ignore_errors=True); model.run(model.parse_aannames({}), [2025], [1, 2, 3], 'verdelen', workers=1)");
  } finally {
    model.py.runPython('progress_sink = None');
  }
  const ended = performance.now();
  const steps = seen.filter(message => message.fase === 'simulaties');
  assert.deepEqual(steps.map(step => step.klaar), [0, 1, 2, 3]);
  // Elk bericht kwam binnen op het moment van de job, niet allemaal aan het eind.
  assert.ok(steps[0].at - began < (ended - began) / 2, 'The first message arrives before the simulations ran');
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].at > steps[i - 1].at);
});

// ---------------------------------------------------------------- calculator-worker.js

// De worker met een nep-Pyodide: runPython voor een verzoek meldt twee jobs via progress_sink, zoals browser-runtime.py.
async function fakeWorker() {
  const source = await readFile(new URL('../src/opsplitsing/calculator-worker.js', import.meta.url), 'utf8');
  const posted = [], files = new Set(), globals = new Map();
  const python = {
    FS: {mkdirTree() {}, writeFile: path => files.add(path), analyzePath: path => ({exists: files.has(path)})},
    globals: {set: (name, value) => globals.set(name, value)},
    runPython(code) {
      if (!code.includes('dispatch(')) return;
      const sink = globals.get('progress_sink');
      for (const klaar of [0, 1, 2]) sink(JSON.stringify({fase: 'simulaties', klaar, totaal: 2}));
      sink(JSON.stringify({fase: 'samenvatten'}));
      return JSON.stringify({ok: globals.get('request_path')});
    },
  };
  const self = {postMessage: message => posted.push(JSON.parse(JSON.stringify(message)))};
  vm.runInContext(source, vm.createContext({self, importScripts() {}, loadPyodide: async () => python, atob,
    fetch: async () => ({ok: true, json: async () => ({}), text: async () => '{}'})}));
  return {posted, send: data => self.onmessage({data})};
}

test('the worker tags every progress message with the running request and answers last', async () => {
  const worker = await fakeWorker();
  await worker.send({id: 7, path: '/api/opsplitsing', body: {jaren: [2024]}});
  const first = worker.posted.splice(0);
  assert.ok(first.every(message => message.id === 7));
  assert.deepEqual(first.at(-1), {id: 7, result: {ok: '/api/opsplitsing'}});
  assert.ok(first.slice(0, -1).every(message => message.voortgang && !('result' in message) && !('error' in message)));
  const phases = first.slice(0, -1).map(message => message.voortgang.fase);
  // Eerste gebruik: Pyodide en het model laden, dan het windjaar, dan rekenen met de jobs uit Python.
  assert.deepEqual(phases.filter(phase => phase !== 'windjaar'), ['rekenomgeving', 'model', 'starten', 'rekenen', 'simulaties', 'simulaties', 'simulaties', 'samenvatten']);
  assert.deepEqual(first.find(message => message.voortgang?.fase === 'windjaar').voortgang, {fase: 'windjaar', jaar: 2024});
  assert.deepEqual(first.filter(message => message.voortgang?.fase === 'simulaties').map(message => message.voortgang.klaar), [0, 1, 2]);

  await worker.send({id: 8, path: '/api/opsplitsing/dag', body: {datum: '2024-03-01'}});
  const second = worker.posted.splice(0);
  assert.ok(second.every(message => message.id === 8));
  assert.deepEqual(second.slice(0, 2).map(message => message.voortgang.fase), ['rekenen', 'simulaties'], 'Loaded once: no download, no wind year again');
});

// ---------------------------------------------------------------- progressView in opsplitsing.js

// Net genoeg DOM voor progressView: kinderen, attributen en tekst; innerHTML of textContent vervangen de kinderen.
class FakeElement {
  constructor(tagName = 'span') { Object.assign(this, {tagName, children: [], text: '', attributes: {}, style: {}, className: ''}); this.classes = new Set(); }
  get classList() { return {add: name => this.classes.add(name), remove: name => this.classes.delete(name), contains: name => this.classes.has(name)}; }
  get innerHTML() { return this.text; }
  set innerHTML(value) { this.text = value; this.children = []; }
  get textContent() { return [this.text, ...this.children.map(child => child.textContent)].filter(Boolean).join(' '); }
  set textContent(value) { this.text = String(value); this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.text = ''; this.children = nodes; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  find(className) { return this.className === className ? this : this.children.map(child => child.find(className)).find(Boolean); }
}

async function progressPage() {
  const source = await readFile(new URL('../src/opsplitsing/opsplitsing.js', import.meta.url), 'utf8');
  const clock = {now: 0};
  const context = vm.createContext({document: {createElement: tag => new FakeElement(tag), getElementById: () => new FakeElement()},
    Intl, performance: {now: () => clock.now}});
  vm.runInContext(source.replace(/^\s*start\(\);\s*$/m, ''), context);
  return {clock, view: (...args) => context.progressView(...args)};
}

test('the bar is indeterminate with a phase label, then counts jobs with a rough remaining time', async () => {
  const {clock, view} = await progressPage();
  const status = new FakeElement();
  status.classList.add('error');
  const progress = view(status, 'Rekenen…');
  const bar = status.find('progress-bar'), fill = status.find('progress-fill');
  const label = () => status.find('progress-label').textContent, detail = () => status.find('progress-detail').textContent;
  assert.equal(status.classList.contains('error'), false);
  assert.equal(bar.attributes.role, 'progressbar');
  assert.equal(bar.attributes['aria-label'], 'Voortgang van de berekening');
  assert.equal(label(), 'Rekenen…');
  assert.equal('aria-valuenow' in bar.attributes, false, 'Without a count the bar is indeterminate');
  assert.equal(status.find('progress-detail').attributes['aria-hidden'], 'true', 'The changing count is read from the bar, not announced');

  progress.update({fase: 'wachten', na: 'gevoeligheid'});
  assert.equal(label(), 'Wacht tot de gevoeligheid klaar is…');
  progress.update({fase: 'rekenomgeving'});
  assert.equal(label(), 'Python-rekenomgeving laden (de eerste keer een download)…');
  progress.update({fase: 'windjaar', jaar: 2024});
  assert.equal(label(), 'Windjaar 2024 laden…');
  assert.equal(bar.attributes['aria-valuetext'], 'Windjaar 2024 laden…');

  const step = (klaar, gerekend, jaar = 2024, modules = 4) => progress.update({fase: 'simulaties', klaar, totaal: 40, gerekend, te_rekenen: 36, jaar, modules});
  const weighted = (klaar, gerekend, werk) => progress.update({fase: 'simulaties', klaar, totaal: 40, gerekend, te_rekenen: 36, werk, te_werken: 360, jaar: 2024, modules: 4});
  step(0, 0);
  assert.equal(label(), 'Simulaties');
  assert.equal(detail(), '0 van 40 · windjaar 2024, 4 modules');
  assert.equal(bar.attributes['aria-valuenow'], '0');
  assert.equal(bar.attributes['aria-valuemax'], '40');
  step(4, 0, 2025, 1);
  assert.equal(detail(), '4 van 40 · windjaar 2025, 1 module', 'Cache hits move the bar without a time estimate');
  assert.equal(fill.style.width, '10%');
  clock.now = 10000;
  step(6, 2);
  assert.equal(detail(), '6 van 40 · windjaar 2024, 4 modules', 'No estimate before three simulated jobs');
  clock.now = 15000;
  step(7, 3);
  assert.equal(detail(), '7 van 40 · windjaar 2024, 4 modules · nog ongeveer 3 min', '5 s per job, 33 jobs to go');
  assert.equal(bar.attributes['aria-valuetext'], 'Simulaties · 7 van 40 · windjaar 2024, 4 modules · nog ongeveer 3 min');
  clock.now = 170000;
  step(38, 34);
  assert.match(detail(), /nog ongeveer 10 s$/);
  // Met werkeenheden telt een zware job zwaarder: 3 jobs met samen 12 eenheden in 15 s, nog 348 eenheden.
  clock.now = 15000;
  weighted(7, 3, 12);
  assert.match(detail(), /nog ongeveer 7 min$/);
  clock.now = 175000;
  weighted(39, 35, 350);
  assert.match(detail(), /nog ongeveer 10 s$/);
  progress.update({fase: 'simulaties', klaar: 40, totaal: 40, gerekend: 36, te_rekenen: 36, jaar: null, modules: null});
  assert.equal(detail(), '40 van 40');
  assert.equal(fill.style.width, '100%');
  progress.update({fase: 'samenvatten'});
  assert.equal(label(), 'Uitkomst samenstellen…');
  assert.equal('aria-valuenow' in bar.attributes, false);
  progress.clear();
  assert.deepEqual(status.children, [], 'Cleared when the request is done');
});

test('a bar whose status field was filled by something else stays out of the way', async () => {
  const {view} = await progressPage();
  const status = new FakeElement();
  const old = view(status, 'Gevoeligheid berekenen…', 'Elke aanname wordt twee keer doorgerekend en dit duurt enkele minuten. Andere berekeningen, zoals een nieuwe dag, wachten tot dit klaar is.');
  assert.match(status.textContent, /enkele minuten/, 'The note stays visible under the bar');
  const newer = view(status, 'Gevoeligheid berekenen…');
  old.update({fase: 'simulaties', klaar: 3, totaal: 112, gerekend: 3, te_rekenen: 104, jaar: 2024, modules: 4});
  old.clear();
  assert.equal(status.find('progress-label').textContent, 'Gevoeligheid berekenen…', 'The newer request keeps the field');
  newer.update({fase: 'wachten', na: 'gevoeligheid'});
  status.textContent = 'Het zwaarst weegt: …';
  newer.update({fase: 'simulaties', klaar: 3, totaal: 112, gerekend: 3, te_rekenen: 104});
  newer.clear();
  assert.equal(status.textContent, 'Het zwaarst weegt: …');
});

test('every progress text has an English translation', () => {
  const english = {
    'Voortgang van de berekening': 'Calculation progress',
    'Simulaties': 'Simulations',
    '12 van 40 · windjaar 2024, 4 modules · nog ongeveer 2 min': '12 of 40 · wind year 2024, 4 modules · about 2 min left',
    'Simulaties · 7 van 112 · windjaar 2025, 1 module · nog ongeveer 50 s': 'Simulations · 7 of 112 · wind year 2025, 1 module · about 50 s left',
    'Windjaar 2024 laden…': 'Loading wind year 2024…',
    'Python-rekenomgeving laden (de eerste keer een download)…': 'Loading the Python calculation environment (downloaded the first time)…',
    'Rekenmodel laden…': 'Loading the calculation model…',
    'Rekenmodel starten…': 'Starting the calculation model…',
    'Uitkomst samenstellen…': 'Putting the result together…',
    'Gevoeligheid berekenen…': 'Calculating sensitivity…',
  };
  for (const [dutch, expected] of Object.entries(english)) assert.equal(translate(dutch), expected);
  for (const kind of ['het rekenmodel geladen is', 'de berekening klaar is', 'de dag berekend is', 'de gevoeligheid klaar is', 'de omslagkaart klaar is']) {
    assert.match(translate(`Wacht tot ${kind}…`), /^Waiting for /);
  }
  assert.match(translate('Elke aanname wordt twee keer doorgerekend en dit duurt enkele minuten. Andere berekeningen, zoals een nieuwe dag, wachten tot dit klaar is.'), /^Each assumption/);
});
