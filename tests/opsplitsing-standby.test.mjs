import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBrowserModel} from './helpers/pyodide-runtime.mjs';

// Stand-by met voorspelling (Li e.a., Entropy 2026, 28, 194): warm houden of laten afkoelen, en niet starten voor een korte vlaag.
// De reeksen hieronder zijn kunstmatig: 10-minutenstappen met een vast aanbod, zodat elk besluit na te rekenen is.
const {json, py} = await loadBrowserModel({extra: `
from dataclasses import replace
STEP = 600
BASE = replace(model.Aannames(), onderhoud_dagen=0.0, storingen_per_jaar=0.0, stackwissel_weken=0.0, voorspelfout=0.0)

def series(blocks, year=2025):
    """blocks: [(uren, MW)]; begint op een heel uur, zodat uurgemiddelden precies zijn."""
    mw = [p for hours, p in blocks for _ in range(round(hours * 6))]
    start = 1735693200   # 2025-01-01 01:00 UTC
    return {'jaar': year, 't': [start + i * STEP for i in range(len(mw))], 'mw': mw}

def sim(blocks, n=2, mode='voorspelling', **changes):
    a = replace(BASE, **changes)
    return model.simulate(series(blocks), n, a, 'bijschakelen', trace=range(0, 10**6), standby_mode=mode)

def startup_total(r, step, i=0):
    """Opstartminuten van module i vanaf stap step (de trace geeft per stap hooguit 10 min)."""
    total = 0.0
    for s in r['stappen'][step:]:
        if not s['opstart_min'][i]: break
        total += s['opstart_min'][i]
    return total

def starts(r): return round((r['starts_warm_per_module'] + r['starts_koud_per_module']) * r['modules'] / (8760 / r['dekking_uur']))
`});

test('fixed policy keeps the old behaviour and reports no forecast fields', () => {
  const r = json("sim([(3, 30), (0.5, 50), (3, 30)], mode='vast')");
  assert.equal(r.standbybeleid, 'vast');
  assert.equal(r.standby_uur_per_module, 0);
  assert.equal(r.starts_vermeden_per_module, 0);
  assert.equal(r.stappen[0].toestand, undefined);
});

test('a short gust does not start an extra module with a forecast, but does without one', () => {
  // 20 MW: één module van 22 MW draait. Een vlaag van 30 min op 40 MW vraagt een tweede module.
  // De uurvoorspelling ziet de vlaag als één uur; met een minimale aan-tijd van 60 min plus opstarten is dat te kort.
  const blocks = '[(3, 20), (0.5, 40), (3, 20)], min_aan_min=60';
  const fixed = json(`starts(sim(${blocks}, mode='vast', startvertraging_min=0))`);
  const predicted = json(`sim(${blocks})`);
  assert.equal(fixed, 2, 'Without a forecast the second module starts for the gust');
  assert.equal(json(`starts(sim(${blocks}))`), 1, 'With a forecast only the first module starts');
  assert.ok(predicted.starts_vermeden_per_module > 0);
  assert.ok(predicted.stappen.some(s => s.redenen.some(r => r.startsWith('module 2 niet gestart'))));
  // A long enough windy period does start the second module.
  assert.equal(json("starts(sim([(3, 20), (4, 40), (3, 20)], min_aan_min=60))"), 2);
});

test('a short lull keeps the module warm; a long lull lets it cool down', () => {
  // Alkaline-achtig: koude start 45 min, warm 5 min, koud na 4 uur.
  const alk = "opstart_warm_min=5.0, opstart_koud_min=45.0, koud_na_uur=4.0, standby=0.01";
  const short = json(`sim([(4, 20), (1, 0), (4, 20)], n=1, ${alk})`);
  const lull = short.stappen.slice(24, 30);
  assert.ok(lull.every(s => s.toestand[0] === 'warm'), 'Kept warm during a one-hour lull');
  assert.ok(lull.every(s => s.warmte[0] === 1));
  assert.equal(json(`startup_total(sim([(4, 20), (1, 0), (4, 20)], n=1, ${alk}), 30)`), 5, 'Warm start after the lull');
  assert.ok(short.standby_mwh > 0);

  const long = json(`sim([(4, 20), (30, 0), (4, 20)], n=1, ${alk})`);
  const quiet = long.stappen.slice(24, 24 + 180);
  assert.ok(quiet.every(s => s.toestand[0] === 'koelt af'), 'Cools down when the wind returns beyond the horizon gain');
  assert.equal(long.standby_mwh, 0);
  const restart = json(`startup_total(sim([(4, 20), (30, 0), (4, 20)], n=1, ${alk}), 24 + 180)`);
  assert.ok(restart > 44 && restart <= 45, `Cold start after a long lull: ${restart}`);
});

test('start-up time grows gradually with standstill, between the warm and the cold value', () => {
  // Hele uren, want de voorspelling is per uur. Warmhouden is hier duurder dan het opstartverlies.
  const times = json(`[startup_total(sim([(4, 20), (h, 0), (4, 20)], n=1, standby=1.0, opstart_warm_min=5.0, opstart_koud_min=45.0, koud_na_uur=4.0), 24 + h * 6)
                       for h in (1, 2, 3, 6)]`);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1], times.join(', '));
  assert.ok(times[0] > 5 && times.at(-1) < 45 + 1e-9, times.join(', '));
});

test('the forecast is reproducible and its error only matters with the forecast policy', () => {
  py.runPython(`FULL = json.loads(Path('/app/data/2025.json').read_text())
def year(fout, mode='voorspelling'):
    r = model.simulate(FULL, 4, replace(model.Aannames(), voorspelfout=fout), 'verdelen', standby_mode=mode)
    return {k: r[k] for k in ('waterstof_t', 'standby_mwh', 'starts_koud_per_module', 'starts_vermeden_per_module')}`);
  const a = json('year(0.2)'), b = json('year(0.2)');
  assert.deepEqual(a, b, 'Same input, same outcome');
  assert.notDeepEqual(json('year(0.0)'), a, 'The forecast error changes the outcome');
  assert.deepEqual(json("year(0.0, 'vast')"), json("year(0.5, 'vast')"), 'The fixed policy ignores the forecast');
  // On this year the forecast policy yields at least as much hydrogen with fewer cold starts.
  const fixed = json("year(0.2, 'vast')");
  assert.ok(a.waterstof_t >= fixed.waterstof_t, `${a.waterstof_t} < ${fixed.waterstof_t}`);
  assert.ok(a.starts_koud_per_module < fixed.starts_koud_per_module);
});

test('the browser runtime passes the policy through and rejects unknown values', () => {
  const meta = json("dispatch('/api/opsplitsing/aannames', {})");
  assert.deepEqual(Object.keys(meta.standbybeleid), ['vast', 'voorspelling']);
  const keys = meta.groepen.flatMap(g => g.velden.map(v => v.key));
  assert.ok(keys.includes('voorspelfout') && keys.includes('vooruitkijk_uur'));
  assert.throws(() => py.runPython("dispatch('/api/opsplitsing', {'jaren': [2025], 'modules': [1], 'standby': 'heet'})"), /stand-by/);
});
