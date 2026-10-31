import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBrowserModel} from './helpers/pyodide-runtime.mjs';

// Windprofiel and windparken in the browser model (browser-runtime.py). Simulations run on a short window of 2025
// (about ten days); the derivation of the series is checked on the full year.
const {json} = await loadBrowserModel({year: 2025, extra: `
BASE = json.loads(Path('/app/data/2025.json').read_text())
def window(start=0, stop=1500):
    return {**BASE, 't': BASE['t'][start:stop], 'mw': BASE['mw'][start:stop], 'bron': BASE['bron'][start:stop],
            'v10': {k: v[start:stop] for k, v in BASE['v10'].items()}, 'stations': {k: v[start:stop] for k, v in BASE['stations'].items()}}
def call(path, body):
    try: return {'ok': dispatch(path, {'jaren': [2025], 'modules': [1, 2], **body})}
    except ValueError as e: return {'fout': str(e)}
def scaled_days():
    """Per kalenderdag van het geschaalde Fryslân: [dag, MWh, volledig gemeten, hoogste MW]."""
    series, days = park_series(BASE, SCALED), {}
    for i, value in zip(series['keep'], series['mw']['fryslan']):
        days.setdefault(datetime.fromtimestamp(BASE['t'][i], model.LOCAL).date(), []).append(value)
    return [[d.isoformat(), sum(v) / 6, len(v) == round(6 * day_hours(d)), max(v)] for d, v in days.items()]
def strip(result):
    return {k: v for k, v in result.items() if k not in ('rekentijd_s', 'uit_cache', 'eerste_rekentijd_s')}
_supplies[2025] = window()
`});
const PROFILES = ['onafhankelijk', 'productie_houtribdijk', 'productie_hoogste', 'gemeten_dagproductie'];
const PARKS = [['fryslan', 'beabuorren'], ['fryslan'], ['beabuorren']];

test('an unknown wind profile or an empty, unknown or malformed park list is a clear Dutch error', () => {
  assert.match(json("call('/api/opsplitsing', {'windprofiel': 'hoogste'})").fout, /^Onbekend windprofiel\. Kies: Productie-onafhankelijk \(standaard\), /);
  for (const parken of ['[]', "['zeewind']", "'fryslan'", '[1]', 'None'])
    assert.equal(json(`call('/api/opsplitsing/gevoeligheid', {'n': 2, 'parken': ${parken}})`).fout, 'Kies minstens één windpark: Windpark Fryslân, Windpark Beabuorren of beide.', parken);
  assert.match(json("call('/api/opsplitsing/dag', {'datum': '2025-01-05', 'windprofiel': 5})").fout, /Onbekend windprofiel/);
});

test('the default is the bundled series itself and gives the same result with or without the new fields', () => {
  assert.equal(json("WIND.update(parken=ALL_PARKS) or supply_year(2025) is _supplies[2025]"), true);
  assert.equal(json("wind_supply(_supplies[2025], 'onafhankelijk', ALL_PARKS) is _supplies[2025]"), true);
  const old = json("strip(call('/api/opsplitsing', {})['ok'])");
  const explicit = json("strip(call('/api/opsplitsing', {'windprofiel': 'onafhankelijk', 'parken': ['beabuorren', 'fryslan']})['ok'])");
  assert.deepEqual(explicit, old);
  // Exactly what the model computes on the bundled series, as before the wind choice existed.
  assert.deepEqual(old.rijen, json("strip(model.run(model.parse_aannames({'bop_vast': 0, 'bop_variabel': 0}), [2025], [1, 2], 'verdelen', workers=1))['rijen']"));
  assert.equal(old.windprofiel, 'onafhankelijk');
  assert.deepEqual(old.parken, ['fryslan', 'beabuorren']);
  assert.ok(old.aanbod['2025'].parken.fryslan.gemeten_mwh > 1.1e6, 'Measured annual production of the whole park, on the 8.760 h basis');
});

test('every wind profile and park choice is its own series and its own cache key', () => {
  const combos = PROFILES.flatMap(profile => PARKS.map(parks => [profile, parks]));
  const out = combos.map(([profile, parks]) => json(`(lambda s: {'key': repr(SIM_MEMO.key((s, 4, model.Aannames(), 'verdelen'))), 'supply': model.supply_key({2025: s})[0], 'sum': sum(s['mw']), 'mw': s['mw'][:300]})(wind_supply(_supplies[2025], '${profile}', tuple(${JSON.stringify(parks)})))`));
  assert.equal(new Set(out.map(o => o.key)).size, combos.length, 'SimulationMemo keys');
  assert.equal(new Set(out.map(o => JSON.stringify(o.supply))).size, combos.length, 'supply_key of the file cache');
  for (const profile of PROFILES) {
    const [both, fryslan, beabuorren] = PARKS.map(parks => out[combos.findIndex(([p, k]) => p === profile && k.join() === parks.join())]);
    both.mw.forEach((v, i) => assert.ok(Math.abs(v - fryslan.mw[i] - beabuorren.mw[i]) <= 2e-4, `${profile}: the series of both parks is the sum of their shares`));
  }
  assert.equal(new Set(out.filter((_, i) => combos[i][1].length === 2).map(o => o.sum.toFixed(3))).size, 4, 'The four profiles give four different series');
});

test('the derivation from station wind reproduces the bundled default series exactly', () => {
  const check = json(`(lambda s: {'verschil': sum(round(0.1 * f + 1.0 * b, 4) != m for f, b, m in zip(s['mw']['fryslan'], s['mw']['beabuorren'], BASE['mw'])),
    'momenten': len(s['keep']), 'v10': s['v10']['fryslan'] == BASE['v10']['fryslan']})(park_series(BASE, 'onafhankelijk'))`);
  assert.deepEqual(check, {verschil: 0, momenten: 51902, v10: true});
});

test('scaled to measured production: daily energy equals the measurement, capped at the park, Beabuorren stays modelled', () => {
  const r = json(`(lambda s, m: {'max': max(s['mw']['fryslan']), 'cap': FRYSLAN_CAP_MW, 'beabuorren': list(s['mw']['beabuorren']) == list(m['mw']['beabuorren']),
    'jaar': sum(s['mw']['fryslan']) / 6 * 8760 / (len(s['keep']) / 6), 'gemeten': measured_mwh(2025)})(park_series(BASE, SCALED), park_series(BASE, 'onafhankelijk'))`);
  assert.ok(r.max <= r.cap + 1e-9);
  assert.equal(r.cap, 382.7);
  assert.equal(r.beabuorren, true);
  assert.ok(Math.abs(r.jaar / r.gemeten - 1) < 0.002, `${r.jaar} vs ${r.gemeten}`);
  const days = json('scaled_days()');
  const measured = json("{d.isoformat(): v for d, v in productie.load().items() if d.year == 2025}");
  let checked = 0;
  for (const [day, mwh, complete, peak] of days) {
    if (!complete || peak >= 382.7 - 1e-9) continue;
    assert.ok(Math.abs(mwh - measured[day]) <= 1e-6 * Math.max(1, measured[day]), `${day}: ${mwh} ≠ ${measured[day]}`);
    checked++;
  }
  assert.ok(checked > 300, `Only ${checked} complete, uncapped days`);
});

test('a day without a measurement drops out instead of counting as zero', () => {
  const r = json(`(lambda original: (setattr(productie, 'load', lambda: {d: v for d, v in original().items() if d != date(2025, 1, 4)}),
    (lambda s: {'dag4': sum(datetime.fromtimestamp(t, model.LOCAL).date() == date(2025, 1, 4) for t in s['t']),
               'dag5': sum(datetime.fromtimestamp(t, model.LOCAL).date() == date(2025, 1, 5) for t in s['t']),
               'lengte': len(s['t']) == len(s['mw']) == len(s['v10']['fryslan']) == len(s['bron']) == len(s['stations']['stavoren'])})(
      wind_supply(window(), SCALED, ALL_PARKS)), setattr(productie, 'load', original))[1])(productie.load)`);
  const before = json("{d: sum(datetime.fromtimestamp(t, model.LOCAL).date() == date(2025, 1, d) for t in window()['t']) for d in (4, 5)}");
  assert.ok(before['4'] > 100);
  assert.deepEqual(r, {dag4: 0, dag5: before['5'], lengte: true});
});

test('Bereken, the day trace and the error without hydrogen follow the choice', () => {
  const run = json("strip(call('/api/opsplitsing', {'windprofiel': 'gemeten_dagproductie', 'parken': ['fryslan', 'beabuorren']})['ok'])");
  assert.equal(run.windprofiel, 'gemeten_dagproductie');
  assert.equal(run.windmethode, 'gemeten_dagproductie');
  assert.match(run.windmethode_uitleg, /^Geschaald naar gemeten dagproductie/);
  assert.equal(run.aanbod['2025'].methode, 'gemeten_dagproductie');
  const alone = json("strip(call('/api/opsplitsing', {'modules': [2, 4], 'parken': ['beabuorren']})['ok'])");
  assert.deepEqual(Object.keys(alone.aanbod['2025'].parken), ['beabuorren']);
  assert.deepEqual(alone.parken, ['beabuorren']);
  assert.ok(alone.rijen[0].waterstof_t < run.rijen[0].waterstof_t);
  assert.match(json("call('/api/opsplitsing', {'parken': ['beabuorren']})").fout, /^Met dit aanbod maakt 1 module geen waterstof: /);

  const day = json("call('/api/opsplitsing/dag', {'datum': '2025-01-05', 'windprofiel': 'gemeten_dagproductie'})['ok']");
  assert.deepEqual(Object.keys(day.parken), ['fryslan', 'beabuorren']);
  const steps = day.configuraties['1'].stappen;
  day.wind.forEach((w, i) => {
    assert.ok(w.fryslan.dagfactor > 0 && w.fryslan.mw_aanbod <= 382.7);
    assert.ok(Math.abs(0.1 * w.fryslan.mw_aanbod + w.beabuorren.mw - steps[i].aanbod) < 0.003, `step ${i}`);
  });
  const bea = json("call('/api/opsplitsing/dag', {'datum': '2025-01-05', 'modules': [2], 'parken': ['beabuorren']})['ok']");
  assert.deepEqual(Object.keys(bea.parken), ['beabuorren']);
  assert.deepEqual(bea.aandeel, {beabuorren: 1});
  bea.wind.forEach((w, i) => assert.ok(Math.abs(w.beabuorren.mw - bea.configuraties['2'].stappen[i].aanbod) < 0.002));

  // The sensitivity analysis and the omslagkaart simulate on the chosen series too.
  const sensitivity = parks => json(`call('/api/opsplitsing/gevoeligheid', {'n': 2, 'parken': ${parks}})['ok']['voordeel']`);
  assert.notEqual(sensitivity("['fryslan', 'beabuorren']"), sensitivity("['fryslan']"));
  const map = profile => json(`call('/api/opsplitsing/omslagkaart', {'windprofiel': '${profile}'})['ok']['cellen'][1][0]['lcoh_een_eur_kg']`);
  assert.notEqual(map('onafhankelijk'), map('productie_houtribdijk'));

  const meta = json("dispatch('/api/opsplitsing/aannames', {})['windkeuze']");
  assert.deepEqual(Object.keys(meta.profielen), PROFILES);
  assert.equal(meta.standaard, 'onafhankelijk');
  assert.deepEqual(meta.parken.fryslan, {naam: 'Windpark Fryslân', aandeel: 0.1, mw: 38.3});
  assert.equal(meta.parken.beabuorren.mw, 10.4);
});
