// Costs and LCOH for the comparison tab. per_kw_eur … economics() are a literal port of the cost section of
// src/opsplitsing/python/opsplitsing.py (same operation order, pySum for the sums), so a result can be compared
// one-to-one with /opsplitsing. Costs are computed after the simulation and are NOT part of the cache key:
// another electricity price never needs a new run.
import {pySum, DEFAULTS} from './electrolyser-kernel.mjs';
import {STATUS} from './electrolyser-catalogue.mjs';

export const OXYGEN_KG_PER_KG = 8.0;
// Aannames() cost defaults in opsplitsing.py.
export const COST_DEFAULTS = Object.freeze({
 offerte_meur: 60.0, offerte_mw: 50.0, offerte_modules: 10.0, vaste_kosten_module_meur: 1.0, stack_aandeel: 0.14, opex_aandeel: 0.02,
 stroomprijs_eur_mwh: 88.91, netkosten_eur_mwh: 18.20, belasting_eur_mwh: 3.80, rente: 0.06, looptijd_jaar: 20.0,
 capex_subsidie_eur_kw: 0.0, waterstofpremie_eur_kg: 0.0, korting_net_belasting_eur_mwh: 0.0, zuurstofprijs_eur_t: 0.0,
});
// [label, unit, shown-scale, low, high] in the shown unit, as AANNAMES_META in opsplitsing.py.
const META = {
 offerte_meur: ['Referentieofferte: prijs', 'M€', 1, 1, 2000], offerte_mw: ['Referentieofferte: vermogen', 'MW', 1, 1, 500], offerte_modules: ['Referentieofferte: aantal units', '', 1, 1, 100],
 vaste_kosten_module_meur: ['Vaste kosten per module', 'M€', 1, 0, 50], stack_aandeel: ['Stackvervanging', '% van module-CAPEX', 100, 0, 100], opex_aandeel: ['Vaste OPEX', '% van CAPEX per jaar', 100, 0, 10],
 stroomprijs_eur_mwh: ['Stroomprijs', '€/MWh', 1, 0, 300], netkosten_eur_mwh: ['Netkosten', '€/MWh', 1, 0, 100], belasting_eur_mwh: ['Energiebelasting', '€/MWh', 1, 0, 100],
 rente: ['Rente', '%', 100, 0, 20], looptijd_jaar: ['Looptijd', 'jaar', 1, 5, 40],
 capex_subsidie_eur_kw: ['CAPEX-subsidie', '€/kW', 1, 0, 5000], waterstofpremie_eur_kg: ['Waterstofpremie', '€/kg', 1, 0, 20],
 korting_net_belasting_eur_mwh: ['Korting netkosten en belasting', '€/MWh', 1, 0, 200], zuurstofprijs_eur_t: ['Zuurstofprijs', '€/t', 1, 0, 1000],
};
export const costMeta = key => ({key, label: META[key][0], unit: META[key][1], scale: META[key][2], low: META[key][3], high: META[key][4]});
// General cost assumptions: equal for every setup. The reference offer and the fixed cost per module are per setup.
export const COST_KEYS = ['stroomprijs_eur_mwh', 'netkosten_eur_mwh', 'belasting_eur_mwh', 'rente', 'looptijd_jaar', 'opex_aandeel', 'stack_aandeel',
 'capex_subsidie_eur_kw', 'waterstofpremie_eur_kg', 'korting_net_belasting_eur_mwh', 'zuurstofprijs_eur_t'];
export const COST_SETUP_KEYS = ['prijs_eur_kw', 'vaste_kosten_module_meur'];
// source() in opsplitsing.py
const EU_TOOL = new Set(['stack_aandeel', 'opex_aandeel', 'stroomprijs_eur_mwh', 'netkosten_eur_mwh', 'belasting_eur_mwh', 'rente', 'looptijd_jaar',
 'capex_subsidie_eur_kw', 'waterstofpremie_eur_kg', 'korting_net_belasting_eur_mwh', 'zuurstofprijs_eur_t']);
export const costSourceOf = key => EU_TOOL.has(key) ? 'EU LCOH-tool' : key === 'vaste_kosten_module_meur' ? 'onzekere aanname' : key.startsWith('offerte') ? 'eigen aanname' : 'plaatshouder';
const finite = v => typeof v === 'number' && Number.isFinite(v);
const inRange = (key, v) => { const m = costMeta(key); return finite(v) && v * m.scale >= m.low - 1e-9 && v * m.scale <= m.high + 1e-9; };

// ---------------------------------------------------------------- literal port (a: Aannames-like object)
export function per_kw_eur(a) { return (a.offerte_meur - a.offerte_modules * a.vaste_kosten_module_meur) * 1e6 / (a.offerte_mw * 1000); }
export function capex_eur(a, n) { return per_kw_eur(a) * a.capaciteit_mw * 1000 + n * a.vaste_kosten_module_meur * 1e6; }
export function power_price(a) {
 const levies = Math.max(0.0, a.netkosten_eur_mwh + a.belasting_eur_mwh - a.korting_net_belasting_eur_mwh);
 return a.stroomprijs_eur_mwh + levies;
}
export function subsidy_eur(a) { return a.capex_subsidie_eur_kw * a.capaciteit_mw * 1000; }
export function revenue_eur_kg(a) { return a.waterstofpremie_eur_kg + a.zuurstofprijs_eur_t * OXYGEN_KG_PER_KG / 1000; }
export function crf(a) { return a.rente ? a.rente / (1 - (1 + a.rente) ** -a.looptijd_jaar) : 1 / a.looptijd_jaar; }
// result: {modules, waterstof_t, verbruik_mwh, standby_mwh, eq_uren_per_module}
export function economics(result, a) {
 const n = result.modules, capex = capex_eur(a, n), module_capex = capex / n;
 // Continuous approximation: every equivalent operating hour uses up a share of a stack.
 const stack = pySum(result.eq_uren_per_module.map(e => a.stack_aandeel * module_capex * e / a.stack_levensduur_uur));
 const power = (result.verbruik_mwh + result.standby_mwh) * power_price(a);
 const annual = (capex - subsidy_eur(a)) * crf(a) + a.opex_aandeel * capex + stack + power;
 const kg = result.waterstof_t * 1000;
 const wear = result.eq_uren_per_module.filter(e => e);
 return {
  capex_meur: capex / 1e6, stack_meur_jaar: stack / 1e6, kosten_meur_jaar: annual / 1e6, stroom_meur_jaar: power / 1e6,
  kapitaal_meur_jaar: ((capex - subsidy_eur(a)) * crf(a) + a.opex_aandeel * capex) / 1e6,
  lcoh_eur_kg: kg ? annual / kg : null, netto_eur_kg: kg ? annual / kg - revenue_eur_kg(a) : null,
  jaren_tot_stackwissel: wear.length ? a.stack_levensduur_uur / Math.max(...wear) : null, prijs_per_kw: per_kw_eur(a),
 };
}

// ---------------------------------------------------------------- break-even price
// annual(capex) = capex·(crf + opex + k_stack) − subsidy·crf + power, with k_stack = stack_aandeel·Σe/(n·L): linear in the CAPEX.
// capex_max is the CAPEX at which this setup reaches `targetLcoh` (the reference's LCOH) on its own production and energy use.
export function capexForLcoh(result, a, targetLcoh) {
 const kg = result.waterstof_t * 1000;
 if (!finite(targetLcoh) || !(kg > 0)) return null;
 const wear = pySum(result.eq_uren_per_module) / result.modules / a.stack_levensduur_uur;
 const power = (result.verbruik_mwh + result.standby_mwh) * power_price(a);
 return (targetLcoh * kg - power + subsidy_eur(a) * crf(a)) / (crf(a) + a.opex_aandeel + a.stack_aandeel * wear);
}
// Largest price per kW (stack) above (+) or below (−) the assumed price at which this setup still matches the reference.
export function maxPremiumEurKw(result, a, targetLcoh) {
 const max = capexForLcoh(result, a, targetLcoh);
 return max === null ? null : (max - capex_eur(a, result.modules)) / (a.capaciteit_mw * 1000);
}

// ---------------------------------------------------------------- assumptions (general and per setup)
// General cost assumptions share `general.values` with the operating assumptions; the key sets are disjoint.
export function generalCosts(general = {}) {
 const values = {}, fields = [];
 for (const key of COST_KEYS) {
  const own = general.values?.[key], used = inRange(key, own), m = costMeta(key);
  values[key] = used ? own : COST_DEFAULTS[key];
  fields.push({key, label: m.label, unit: m.unit, scale: m.scale, value: values[key], status: used ? STATUS.eigen : STATUS.standaard,
   rule: used ? 'Eigen invoer, gelijk voor alle opstellingen.' : `Aannames() in opsplitsing.py (${costSourceOf(key)}).`});
 }
 return {values, fields};
}
const REFERENCE_PRICE = (COST_DEFAULTS.offerte_meur - COST_DEFAULTS.offerte_modules * COST_DEFAULTS.vaste_kosten_module_meur) * 1e6 / (COST_DEFAULTS.offerte_mw * 1000);
export const DEFAULT_PRICE_EUR_KW = REFERENCE_PRICE;
// Per setup: the price as €/kW (stack) or as a total in M€ for the whole installation, plus the fixed cost per module.
// choices.cost = {eurKw?, totalMeur?, fixedMeur?}; the standard is the reference offer (60 M€ / 50 MW / 10 modules, 1 M€ fixed).
export function setupCosts(resolved, setup, general = {}) {
 const c = setup?.choices?.cost || {}, g = generalCosts(general);
 const power = resolved?.aannames?.capaciteit_mw, n = resolved?.modules;
 const fixedOwn = finite(c.fixedMeur) && inRange('vaste_kosten_module_meur', c.fixedMeur);
 const fixed = fixedOwn ? c.fixedMeur : COST_DEFAULTS.vaste_kosten_module_meur;
 const kwOwn = finite(c.eurKw) && c.eurKw > 0, totalOwn = !kwOwn && finite(c.totalMeur) && c.totalMeur > 0;
 let offer = {offerte_meur: COST_DEFAULTS.offerte_meur, offerte_mw: COST_DEFAULTS.offerte_mw, offerte_modules: COST_DEFAULTS.offerte_modules};
 if (finite(power) && power > 0 && Number.isInteger(n) && n > 0) {
  if (kwOwn) offer = {offerte_meur: c.eurKw * power * 1000 / 1e6 + n * fixed, offerte_mw: power, offerte_modules: n};
  else if (totalOwn) offer = {offerte_meur: c.totalMeur, offerte_mw: power, offerte_modules: n};
 }
 const a = {...g.values, ...offer, vaste_kosten_module_meur: fixed, capaciteit_mw: power, stack_levensduur_uur: resolved?.aannames?.stack_levensduur_uur ?? DEFAULTS.stack_levensduur_uur};
 const priceStandard = !kwOwn && !totalOwn;
 const price = per_kw_eur(a);
 const fields = [
  {key: 'prijs_eur_kw', label: 'Prijs per kW (stack)', unit: '€/kW', value: price, scale: 1, status: priceStandard ? STATUS.standaard : STATUS.eigen, aanname: true,
   rule: priceStandard ? 'Referentieofferte van opsplitsing.py (60 M€ voor 50 MW in 10 units van 5 MW, na aftrek van 1 M€ vaste kosten per unit): eigen aanname, geen offerte voor dit model.'
    : totalOwn ? `Uit de ingevoerde totaalprijs van ${c.totalMeur} M€ voor ${n} modules, na aftrek van de vaste kosten.` : 'Eigen invoer.'},
  {key: 'vaste_kosten_module_meur', label: 'Vaste kosten per module', unit: 'M€', value: fixed, scale: 1, status: fixedOwn ? STATUS.eigen : STATUS.standaard, aanname: true,
   rule: fixedOwn ? 'Eigen invoer.' : 'Onzekere aanname van opsplitsing.py (gelijkrichter, transformator, besturing en leidingwerk per unit); geen gevalideerde prijs.'},
 ];
 const valid = finite(a.capaciteit_mw) && a.capaciteit_mw > 0 && price > 0;
 return {ready: valid, a: valid ? a : null, fields, price, problem: valid ? '' : price > 0 || !finite(power) ? '' : 'De ingevoerde prijs is lager dan de vaste kosten per module.'};
}

// ---------------------------------------------------------------- results
// Raw kernel results (per year and the mean) → economics per year and for the mean.
export function setupEconomics(assembled, a) {
 const perYear = assembled.raw.map(r => economics(r, a)), mean = economics(assembled.summary, a);
 return {perYear, mean};
}
// Adds the cost metrics to the per-year and mean metrics of every ready setup; `reference` is the index in `list`.
// list: [{assembled, a}] (a: setupCosts().a or null). Returns assembled copies; the originals stay untouched.
export function withCosts(list, reference) {
 const costs = list.map(item => item?.assembled && item.a ? setupEconomics(item.assembled, item.a) : null);
 return list.map((item, i) => {
  if (!item?.assembled) return item?.assembled ?? null;
  const c = costs[i], ref = costs[reference], refItem = list[reference];
  if (!c) return item.assembled;
  const premium = (result, a, lcoh) => i === reference ? null : maxPremiumEurKw(result, a, lcoh);
  const add = (m, e, refE, result, a, refResult) => ({...m, ...pickCosts(e), meerprijs_eur_kw: refE && finite(refE.lcoh_eur_kg) ? premium(result, a, refE.lcoh_eur_kg) : null, capex_eur_kw: a.capaciteit_mw ? e.capex_meur * 1e6 / (a.capaciteit_mw * 1000) : null});
  return {...item.assembled,
   perYear: item.assembled.perYear.map((m, y) => add(m, c.perYear[y], ref?.perYear[y], item.assembled.raw[y], item.a)),
   mean: add(item.assembled.mean, c.mean, ref?.mean, item.assembled.summary, item.a),
   costs: c, a: item.a};
 });
}
const pickCosts = e => ({capex_meur: e.capex_meur, kapitaal_meur_jaar: e.kapitaal_meur_jaar, stroom_meur_jaar: e.stroom_meur_jaar, stack_meur_jaar: e.stack_meur_jaar,
 kosten_meur_jaar: e.kosten_meur_jaar, lcoh_eur_kg: e.lcoh_eur_kg});

// ---------------------------------------------------------------- robustness (principle of materiality() in report-model.js)
// A setup is clearly cheaper only if it stays cheaper in every test case: each cost key 25 % lower and higher (within the
// input limits) and the fixed cost per module at both ends of its range, 0,3 and 2 M€. All cases reuse the simulated
// production and energy use; operating assumptions (minimum load, start-up times) need a new run.
export const TEST_STEP = 0.25, FIXED_COST_BAND = [0.3, 2];
const TEST_KEYS = ['offerte_meur', 'vaste_kosten_module_meur', 'stroomprijs_eur_mwh', 'netkosten_eur_mwh', 'rente', 'looptijd_jaar', 'stack_aandeel', 'opex_aandeel'];
export const TEST_NAMES = {offerte_meur: 'de investering', vaste_kosten_module_meur: 'de vaste kosten per module', stroomprijs_eur_mwh: 'de stroomprijs', netkosten_eur_mwh: 'de netkosten',
 rente: 'de rente', looptijd_jaar: 'de looptijd', stack_aandeel: 'de stackvervanging', opex_aandeel: 'de vaste OPEX'};
const near = (x, y) => finite(x) && finite(y) && Math.abs(x - y) <= 1e-8 * Math.max(1, Math.abs(y));
// items: [{result (mean kernel result), a, fixedOwn}] → verdict about the cheapest setup, or null when there is nothing to compare.
export function robustness(items) {
 const rows = items.map(item => item?.a ? {result: item.result, a: item.a, fixedOwn: !!item.fixedOwn, lcoh: economics(item.result, item.a).lcoh_eur_kg} : null);
 if (rows.filter(r => r && finite(r.lcoh)).length < 2) return null;
 const cases = [];
 const lcohs = change => rows.map(r => {
  if (!r || !finite(r.lcoh)) return null;
  const a = change(r);
  if (!a || !(per_kw_eur(a) > 0)) return null;
  const v = economics(r.result, a).lcoh_eur_kg;
  return finite(v) ? v : null;
 });
 const addCase = (key, kind, value, change) => { const l = lcohs(change); if (l.every((v, i) => rows[i] === null || !finite(rows[i].lcoh) || v !== null)) cases.push({key, kind, value, lcoh: l}); };
 for (const key of TEST_KEYS) {
  const m = costMeta(key);
  for (const [kind, factor] of [['laag', 1 - TEST_STEP], ['hoog', 1 + TEST_STEP]]) {
   // The value shown for the case comes from the first setup; the factor is applied to each setup's own value.
   addCase(key, kind, factor, r => {
    if (!finite(r.a[key]) || !r.a[key]) return r.a;
    const shown = Math.min(m.high, Math.max(m.low, r.a[key] * m.scale * factor));
    return {...r.a, [key]: shown / m.scale};
   });
  }
 }
 for (const value of FIXED_COST_BAND) addCase('vaste_kosten_module_meur', 'band', value, r => r.fixedOwn ? r.a : {...r.a, vaste_kosten_module_meur: value});
 const live = rows.map((r, i) => r && finite(r.lcoh) ? i : -1).filter(i => i >= 0);
 const lowest = live.reduce((best, i) => rows[i].lcoh < rows[best].lcoh ? i : best, live[0]);
 const at = (c, i) => c.lcoh[i];
 const equivalent = live.filter(i => i === lowest || near(rows[i].lcoh, rows[lowest].lcoh) || cases.some(c => finite(at(c, i)) && finite(at(c, lowest)) && at(c, i) <= at(c, lowest) + 1e-12));
 const others = live.filter(i => i !== lowest);
 const runnerUp = others.reduce((best, i) => rows[i].lcoh < rows[best].lcoh ? i : best, others[0]);
 const group = equivalent.map(i => rows[i].lcoh);
 const drivers = TEST_KEYS.map(key => {
  const ends = cases.filter(c => c.key === key && c.kind !== 'band');
  return {key, name: TEST_NAMES[key], shift: ends.length ? Math.max(...ends.map(c => Math.abs(at(c, lowest) - rows[lowest].lcoh))) : null};
 }).filter(d => finite(d.shift)).sort((x, y) => y.shift - x.shift).slice(0, 2);
 return {
  tested: cases.length > 0, cases: cases.length, lowest, lowestLcoh: rows[lowest].lcoh, runnerUp, margin: rows[runnerUp].lcoh - rows[lowest].lcoh,
  clear: cases.length > 0 && equivalent.length === 1, equivalent, dearer: live.filter(i => !equivalent.includes(i)),
  range: [Math.min(...group), Math.max(...group)], drivers,
 };
}
