/* Arithmetic explanation of the rounded day_trace output, not another dispatch simulation. */
(function (root) {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const sum = values => values.reduce((total, value) => total + (finite(value) ? value : 0), 0);
  const number = value => finite(value) ? String(value) : 'onbekend';
  const row = (key, label, formula, expression, value, unit) => ({key, label, formula, expression, value: finite(value) ? value : null, unit});
  const notes = [
    'Deze momenten komen uit één dag. Ze leggen de berekening uit; de jaaruitkomst gebruikt alle beschikbare tienminutenstappen.',
    'De dagsimulatie start twee dagen eerder om de aan- en uittoestand op te bouwen. Ze is een apart rekenvoorbeeld en kan afwijken van hetzelfde moment in de doorlopende jaarsimulatie.',
    'Het dagantwoord rondt stackvermogen en kilo’s per module af op drie decimalen. Het rapport rekent met deze afgeronde tussenwaarden; daarom geldt bij de kilocontrole een tolerantie van 0,005 kg per module.',
    'Ook de windfactoren, windtussenwaarden en parkvermogens in het dagantwoord zijn afgerond. Ingevulde windformules kunnen daardoor licht afwijken van de getoonde modelwaarde.',
    'De stroomregels hieronder betreffen draaiende modules. Stand-by van uitgeschakelde modules staat afzonderlijk in het jaarverbruik.'
  ];

  function moduleArithmetic(stackMw, size, startMinutes, a, index = 0, traceKg = null) {
    const x = stackMw / size;
    const active = stackMw > 0;
    const faraday = active ? Math.max(0, 1 - a.faradayverlies_10 * 0.1 / x) : 0;
    const ageing = a.degradatie_jaar * a.degradatie_jaren / 2;
    const secFull = a.systeemverbruik_vol * (1 - a.faradayverlies_10 * 0.1) / (1 + a.bop_variabel + a.bop_vast);
    const sec = active ? secFull * (1 - a.deellastvoordeel * (1 - x)) * (1 + ageing) : null;
    const productive = Math.max(0, 10 - startMinutes) / 10;
    const eligible = active && x >= a.minimumlast - 1e-9;
    const kg = eligible ? stackMw * 1000 / sec * faraday / 6 * productive : 0;
    // draw_mw is only used for active modules in simulate().
    const power = active ? stackMw * (1 + a.bop_variabel) + a.bop_vast * size : 0;
    const nearMinimum = active && Math.abs(stackMw - a.minimumlast * size) <= 0.000500001;
    const n = number;
    return {
      module: index + 1, stackMw, load: x, productiveFraction: productive,
      kg, traceKg: finite(traceKg) ? traceKg : null, powerMw: power, nearMinimum,
      rows: [
        row('stack', 'Stackvermogen', 'Gekozen door de besturing', `${n(stackMw)} MW uit het dagantwoord`, stackMw, 'MW'),
        row('load', 'Lastfractie', 'stackvermogen / modulevermogen', `${n(stackMw)} / ${n(size)}`, x, 'fractie'),
        row('power', 'Elektrisch vermogen inclusief BoP', active ? 'stackvermogen × (1 + variabele BoP) + vaste BoP × modulevermogen' : 'Uitgeschakelde module: geen draaiend verbruik', active ? `${n(stackMw)} × (1 + ${n(a.bop_variabel)}) + ${n(a.bop_vast)} × ${n(size)}` : '0', power, 'MW'),
        row('secFull', 'Stackverbruik bij vollast, nieuw', 'systeemverbruik × (1 − Faradayverlies × 0,1) / (1 + variabele BoP + vaste BoP)', `${n(a.systeemverbruik_vol)} × (1 − ${n(a.faradayverlies_10)} × 0,1) / (1 + ${n(a.bop_variabel)} + ${n(a.bop_vast)})`, secFull, 'kWh/kg'),
        row('ageing', 'Gemiddelde degradatie (meer verbruik per kg)', 'degradatie per jaar × degradatieperiode / 2', `${n(a.degradatie_jaar)} × ${n(a.degradatie_jaren)} / 2`, ageing, 'fractie'),
        row('sec', 'Stackverbruik bij deze last en degradatie', active ? 'stackverbruik vollast × (1 − deellastvoordeel × (1 − lastfractie)) × (1 + degradatie)' : 'Geen productie bij een uitgeschakelde module', active ? `${n(secFull)} × (1 − ${n(a.deellastvoordeel)} × (1 − ${n(x)})) × (1 + ${n(ageing)})` : 'Niet van toepassing', sec, 'kWh/kg'),
        row('faraday', 'Faradayfactor', active ? 'max(0; 1 − Faradayverlies × 0,1 / lastfractie)' : 'Geen productie bij een uitgeschakelde module', active ? `max(0; 1 − ${n(a.faradayverlies_10)} × 0,1 / ${n(x)})` : '0', faraday, 'fractie'),
        row('productive', 'Productief deel van tien minuten', 'max(0; 10 − opstartminuten) / 10', `max(0; 10 − ${n(startMinutes)}) / 10`, productive, 'fractie'),
        row('kg', 'Waterstof in tien minuten', eligible ? 'stackvermogen × 1.000 / stackverbruik × Faradayfactor × 1/6 uur × productief deel' : 'Geen productie onder de minimumlast of bij stilstand', eligible ? `${n(stackMw)} × 1000 / ${n(sec)} × ${n(faraday)} / 6 × ${n(productive)}` : '0', kg, 'kg')
      ]
    };
  }

  function windRows(data, wind, step) {
    const rows = [];
    const n = number;
    for (const [key, value] of Object.entries(wind?.knmi || {})) {
      rows.push(row('station-' + key, data.stations?.[key] || key, 'KNMI-meting op 10 m', value == null ? 'Meetgat' : `${n(value)} m/s gemeten`, value, 'm/s'));
    }
    const parks = Object.keys(data.parken || {}).filter(key => wind?.[key]);
    // A trace fixture may omit park display names while retaining the park values.
    if (!parks.length) parks.push(...['fryslan', 'beabuorren'].filter(key => wind?.[key]));
    for (const key of parks) {
      const w = wind[key], label = data.parken?.[key] || key;
      const heightFormula = w.hoogtevertaling === 'alpha' ? 'v10 × (ashoogte / 10)^α' : 'v10 × maandfactor';
      const heightExpression = w.hoogtevertaling === 'alpha' ? `${n(w.v10)} × (${n(w.ashoogte)} / 10)^${n(w.alpha)}` : `${n(w.v10)} × ${n(w.factor)}`;
      rows.push(row(key + '-v10', label + ': gekozen wind op 10 m', data.regel_per_park?.[key] || 'Geselecteerde stationswind', n(w.v10), w.v10, 'm/s'));
      rows.push(row(key + '-hub', label + ': wind op ashoogte', heightFormula, heightExpression, w.v_as, 'm/s'));
      rows.push(row(key + '-wake', label + ': wind na zog', 'wind op ashoogte × (1 − zogverlies)', `${n(w.v_as)} × (1 − ${n(w.zog)})`, w.v_turbine, 'm/s'));
      rows.push(row(key + '-curve', label + ': vermogen per turbine', 'Vermogenscurve bij wind na zog', `Vermogenscurve(${n(w.v_turbine)} m/s)`, w.turbine_kw, 'kW'));
      rows.push(row(key + '-park', label + ': parkvermogen', 'turbinevermogen × aantal turbines / 1.000', `${n(w.turbine_kw)} × ${n(w.turbines)} / 1000`, w.mw, 'MW'));
    }
    const share = key => data.aandeel?.[key] ?? wind?.[key]?.aandeel ?? (key === 'fryslan' ? data.aandeel_fryslan : 1);
    rows.push(row('supply', 'Aanbod voor de elektrolyser', 'Σ parkvermogen × toegewezen aandeel', parks.map(key => `${n(wind[key].mw)} × ${n(share(key))}`).join(' + '), step.aanbod, 'MW'));
    return rows;
  }

  function configuration(data, step, count, a) {
    const config = data.configuraties[count];
    const size = config.module_mw;
    const stacks = Array.isArray(step.stack) ? step.stack : [];
    const moduleRows = stacks.map((stack, index) => moduleArithmetic(stack, size, step.opstart_min?.[index] ?? 0, a, index, step.kg?.[index]));
    const calculatedKg = sum(moduleRows.map(m => m.kg));
    const traceKg = sum(step.kg || []);
    const calculatedPowerMw = sum(moduleRows.map(m => m.powerMw));
    const tolerance = 0.005 * Math.max(1, stacks.length);
    const nearMinimum = moduleRows.some(m => m.nearMinimum);
    const difference = calculatedKg - traceKg;
    const ok = nearMinimum ? null : finite(difference) && Math.abs(difference) <= tolerance;
    const n = number;
    return {
      modules: count, size, active: stacks.filter(x => x > 0).length,
      traceKg, calculatedKg, tracePowerMw: step.verbruik, calculatedPowerMw,
      reasons: Array.isArray(step.redenen) ? [...step.redenen] : [], moduleRows,
      rows: [
        row('size', 'Vermogen per module', 'totaal stackvermogen / aantal modules', `${n(a.capaciteit_mw)} / ${n(count)}`, size, 'MW'),
        row('threshold', 'Startdrempel inclusief BoP', 'minimumlast × modulevermogen × (1 + variabele BoP) + vaste BoP × modulevermogen', `${n(a.minimumlast)} × ${n(size)} × (1 + ${n(a.bop_variabel)}) + ${n(a.bop_vast)} × ${n(size)}`, a.minimumlast * size * (1 + a.bop_variabel) + a.bop_vast * size, 'MW'),
        row('active', 'Actieve modules', 'Aantal modules met stackvermogen > 0', stacks.map(x => n(x)).join('; '), stacks.filter(x => x > 0).length, 'modules'),
        row('power', 'Totaal draaiend verbruik', 'Som van het vermogen inclusief BoP per actieve module', moduleRows.map(m => n(m.powerMw)).join(' + ') || '0', calculatedPowerMw, 'MW'),
        row('energy', 'Stroom in tien minuten', 'draaiend verbruik × 1.000 × 1/6 uur', `${n(calculatedPowerMw)} × 1000 / 6`, calculatedPowerMw * 1000 / 6, 'kWh'),
        row('kg', 'Berekende waterstof', 'Som van de kilo’s per module', moduleRows.map(m => n(m.kg)).join(' + ') || '0', calculatedKg, 'kg'),
        row('traceKg', 'Waterstof volgens het dagantwoord', 'Som van de afgeronde kilo’s per module uit het rekenmodel', (step.kg || []).map(n).join(' + ') || '0', traceKg, 'kg')
      ],
      check: {ok, tolerance, deltaKg: difference, detail: nearMinimum
        ? 'Een afgerond stackvermogen ligt op de minimumlast. De exacte drempelcontrole is met deze afgeronde trace niet vast te stellen.'
        : `Verschil tussen narekenen en dagantwoord: ${n(difference)} kg; tolerantie ${n(tolerance)} kg vanwege afgeronde tussenwaarden.`}
    };
  }

  function build(data, a, baseN, compareN) {
    const result = {date: data?.datum ?? null, notes: [...notes], moments: []};
    const base = data?.configuraties?.[baseN]?.stappen;
    const comparison = data?.configuraties?.[compareN]?.stappen;
    if (!Array.isArray(base) || !Array.isArray(comparison) || !Array.isArray(data?.wind) || !base.length) {
      result.notes.unshift('Geen volledige daggegevens voor deze vergelijking beschikbaar.');
      return result;
    }
    const indexes = base.map((s, index) => index).filter(index => comparison[index] && data.wind[index] && finite(base[index].aanbod));
    if (!indexes.length) { result.notes.unshift('Geen gezamenlijke tienminutenstappen beschikbaar.'); return result; }
    const used = new Set();
    const choose = candidates => candidates.find(index => !used.has(index)) ?? candidates[0];
    const lowHelp = indexes.filter(index => sum(base[index].kg || []) === 0 && sum(comparison[index].kg || []) > 0)
      .sort((i, j) => base[i].aanbod - base[j].aanbod || i - j);
    const ascending = [...indexes].sort((i, j) => base[i].aanbod - base[j].aanbod || i - j);
    const descending = [...indexes].sort((i, j) => base[j].aanbod - base[i].aanbod || i - j);
    const starts = indexes.filter(index => [...(base[index].opstart_min || []), ...(comparison[index].opstart_min || [])].some(minutes => minutes > 0));
    const switches = indexes.filter(index => index > 0 && comparison[index - 1] && base[index - 1]
      && [base, comparison].some(steps => steps[index].stack?.some((stack, module) => (stack > 0) !== (steps[index - 1].stack?.[module] > 0))));
    const selections = [
      {kind: 'low', title: 'Weinig wind', candidates: lowHelp.length ? lowHelp : ascending,
        criterion: lowHelp.length ? 'Het laagste aanbod van deze dag waarbij de basis geen waterstof maakt en de vergelijking wel.' : 'Het laagste aanbod van deze dag. Er is geen moment waarop alleen de vergelijking produceert.'},
      {kind: 'high', title: 'Veel wind', candidates: descending.filter(index => base[index].aanbod === base[descending[0]].aanbod), criterion: 'Het hoogste aanbod van deze dag; bij gelijke waarden het eerste nog niet getoonde moment.'},
      {kind: 'start', title: 'Starten of stoppen', candidates: starts.length ? starts : switches,
        criterion: starts.length ? 'Het eerste nog niet getoonde moment met opstartminuten in een van beide configuraties.' : switches.length ? 'Het eerste nog niet getoonde moment waarop een module aan- of uitgaat; geen opstartminuten in deze dag.' : 'Deze dag bevat geen zichtbaar start- of stopmoment.'}
    ];
    for (const selection of selections) {
      if (!selection.candidates.length) { result.moments.push({...selection, candidates: undefined, available: false}); continue; }
      const index = choose(selection.candidates); used.add(index);
      result.moments.push({kind: selection.kind, title: selection.title, criterion: selection.criterion,
        index, timestamp: base[index].t, available: true,
        wind: windRows(data, data.wind[index], base[index]),
        configurations: [configuration(data, base[index], baseN, a), configuration(data, comparison[index], compareN, a)]});
    }
    return result;
  }

  const api = {build, moduleArithmetic};
  root.OpsReportMoments = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
