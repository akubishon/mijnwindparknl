import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {loadBrowserModel} from './helpers/pyodide-runtime.mjs';

// Eén moment narekenen: het browsermodel haalt een tijdstap uit de jaarsimulatie (moment_trace), moment-check.js bouwt hem
// opnieuw op met Excel-formules. Elke controle moet "klopt" geven: de formules halen de simulatie tot op 10⁻⁹.
const context = vm.createContext({TextEncoder, Intl});
for (const file of ['report-xlsx.js', 'moment-check.js']) vm.runInContext(readFileSync(new URL('../src/opsplitsing/' + file, import.meta.url), 'utf8'), context);
const {json} = await loadBrowserModel({extra: `
from dataclasses import replace
from datetime import datetime
ALK = model.TECHNOLOGIES['alkaline'][1]

def interesting(n, a, strategy, standby):
    """Tijdstappen met een start, een start die over meerdere stappen loopt, onderhoud en een gewone stap (UU:MM, datum)."""
    supply = model.supply_year(2025)
    r = model.simulate_with_replacements(supply, n, a, strategy, trace=range(0, 10**6), standby_mode=standby)
    steps = r['stappen']
    picks = []
    def add(found):
        for i in found:
            if i not in picks:
                picks.append(i)
                return
    add(i for i, s in enumerate(steps) if any(s['opstart_min']) and i > 2000)
    add(i for i, s in enumerate(steps) if i and any(m >= 10 and steps[i - 1]['opstart_min'][j] >= 10 for j, m in enumerate(s['opstart_min'])))
    add(i for i, s in enumerate(steps) if any(s['uit']) and sum(s['kg']) > 0)
    add(i for i, s in enumerate(steps) if s['gewenst'] > sum(1 for x in s['stack'] if x > 0))
    add([30000])
    out = []
    for i in picks:
        start = datetime.fromtimestamp(supply['t'][i] - 300, model.LOCAL)
        out.append([start.date().isoformat(), start.strftime('%H:%M'), i])
    return out

def moment(day, clock, counts, a, strategy, standby):
    from datetime import date
    return model.moment_trace(a, date.fromisoformat(day), clock, counts, strategy, standby_mode=standby)
`});

function check(a, strategy, standby, counts, pickN) {
  const picks = json(`interesting(${pickN}, ${a}, '${strategy}', '${standby}')`);
  assert.ok(picks.length >= 3, 'enough moments found');
  for (const [day, clock, index] of picks) {
    const data = json(`moment('${day}', '${clock}', ${JSON.stringify(counts)}, ${a}, '${strategy}', '${standby}')`);
    assert.equal(data.index, index, 'the requested interval is the simulated step');
    const result = context.OpsMomentCheck.build(data);
    for (const view of result.views) {
      assert.equal(view.failed.length, 0, `${strategy}/${standby} ${day} ${clock}, ${view.modules} modules: ${[...view.failed].join("; ")}`);
      assert.ok(view.total > 10);
    }
    const html = context.OpsMomentCheck.html(result);
    assert.ok(!html.includes('wijkt af'), 'the page shows no differences');
    assert.ok(result.xlsx().length > 1000);
  }
  return picks;
}

test('verdelen, vast: every step of a moment matches the year run, including startup loss', () => {
  check('ALK', 'verdelen', 'vast', [1, 2, 3, 4], 3);
});

test('bijschakelen and samen, vast', () => {
  check('ALK', 'bijschakelen', 'vast', [2, 3], 3);
  check('model.Aannames()', 'samen', 'vast', [1, 3], 3);
});

test('stand-by with forecast: decisions are input, physics and startup minutes are formulas', () => {
  check('ALK', 'verdelen', 'voorspelling', [1, 3], 3);
});

test('a missing interval names the nearest moment with data', () => {
  assert.throws(() => json(`moment('2025-01-01', '12:05', [1], ALK, 'verdelen', 'vast')`), /Dichtstbijzijnde moment|UU:MM/);
});

test('the moment request is answered by the browser runtime', () => {
  const data = json(`dispatch('/api/opsplitsing/moment', {'aannames': {}, 'modules': [1, 2], 'datum': '2025-03-01', 'tijd': '12:00', 'jaren': [2025]})`);
  assert.equal(data.tijd, '12:00');
  assert.deepEqual(Object.keys(data.configuraties).sort(), ['1', '2']);
  assert.ok(data.begin.startsWith('2025-03-01T12:00'));
});

test('a wrong value is caught: the check compares formula and simulation', () => {
  const [[day, clock]] = json(`interesting(2, ALK, 'verdelen', 'vast')`);
  const data = json(`moment('${day}', '${clock}', [2], ALK, 'verdelen', 'vast')`);
  data.configuraties['2'].stap.kg_stap += 0.001;
  data.configuraties['2'].stap.opstart_min[0] += 1;
  const view = context.OpsMomentCheck.build(data).views[0];
  assert.equal(view.failed.length, 2);
});

test('the summary shows the calculated kilos and module count, not cell addresses', () => {
  const data = json(`moment('2025-03-01', '12:00', [2], ALK, 'verdelen', 'vast')`);
  const result = context.OpsMomentCheck.build(data), view = result.views[0];
  assert.equal(typeof result.read(view.kgCell), 'number');
  assert.equal(result.read(view.kgCell), data.configuraties['2'].stap.kg_stap);
  assert.equal(result.read(view.kCell), data.configuraties['2'].stap.k);
  assert.doesNotMatch(context.OpsMomentCheck.html(result), />D\d+ </);
});
