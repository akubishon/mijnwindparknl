// One setup = one catalogue model × a whole number of modules. This module turns the catalogue reading plus the
// user's explicit choices into the Aannames of opsplitsing.py, keeps a status per field, and derives the fixed
// result definitions shown on the comparison tab.
import {TECHNOLOGIES, DEFAULTS, STRATEGIES, KERNEL_VERSION, hoursInYear} from './electrolyser-kernel.mjs';
import {STATUS, fitPartLoadGain, NM3_PER_KG} from './electrolyser-catalogue.mjs';
import {formatFixed, formatSigned, sharedDecimals, shownDifference, energyUnit} from './number-format.mjs';
import {WIND_PROFILES, DEFAULT_WIND_PROFILE, windSeries} from './electrolyser-wind.mjs';
import {COST_KEYS, COST_SETUP_KEYS, generalCosts} from './electrolyser-economics.mjs';

export const WIND_YEARS = [2022, 2023, 2024, 2025];
export const MAX_SETUPS = 6, MAX_MODULES = 200, DEFAULT_TARGET_MW = 44;

// [key, label, unit, shown-scale, low, high] in the shown unit, as AANNAMES_META in opsplitsing.py.
const META = {
 minimumlast: ['Minimumlast', '% van de stacklast', 100, 0, 80], systeemverbruik_vol: ['Systeemverbruik bij vollast', 'kWh/kg, incl. BoP', 1, 20, 90],
 deellastvoordeel: ['Deellastvoordeel stack', '%', 100, 0, 30], faradayverlies_10: ['Faradayverlies bij 10 % last', '%', 100, 0, 20],
 bop_vast: ['BoP-vast', '% van module', 100, 0, 20], bop_variabel: ['BoP-variabel', '% van stack', 100, 0, 30],
 degradatie_jaar: ['Stackdegradatie', '% meer verbruik per jaar', 100, 0, 3], degradatie_jaren: ['Degradatieperiode', 'jaar', 1, 1, 30],
 stack_levensduur_uur: ['Stacklevensduur', 'bedrijfsuren', 1, 10000, 200000],
 min_aan_min: ['Minimale aan-tijd', 'min', 1, 0, 240], min_uit_min: ['Minimale uit-tijd', 'min', 1, 0, 240], startvertraging_min: ['Startvertraging', 'min', 1, 0, 240],
 standby: ['Warmhouden', '% van module', 100, 0, 10], koud_na_uur: ['Koud na', 'uur', 1, 0, 48], opstart_warm_min: ['Opstarttijd warm', 'min', 1, 0, 120],
 opstart_koud_min: ['Opstarttijd koud', 'min', 1, 0, 240], onderhoud_dagen: ['Gepland onderhoud', 'dagen per module per jaar', 1, 0, 60],
 storingen_per_jaar: ['Storingen', 'per module per jaar', 1, 0, 20], hersteltijd_uur: ['Hersteltijd per storing', 'uur', 1, 0, 720],
 stackwissel_weken: ['Stilstand per stackwissel', 'weken', 1, 0, 26],
};
export const fieldMeta = key => ({key, label: META[key][0], unit: META[key][1], scale: META[key][2], low: META[key][3], high: META[key][4]});
// Model-bound values from the technology standard; general values are equal for every setup in a comparison.
export const MODEL_KEYS = ['faradayverlies_10', 'degradatie_jaar', 'degradatie_jaren', 'stack_levensduur_uur'];
export const GENERAL_KEYS = ['min_aan_min', 'min_uit_min', 'startvertraging_min', 'opstart_warm_min', 'opstart_koud_min', 'koud_na_uur', 'standby', 'onderhoud_dagen', 'storingen_per_jaar', 'hersteltijd_uur', 'stackwissel_weken'];
// source() in opsplitsing.py
const EU_TOOL = new Set(['systeemverbruik_vol', 'stack_levensduur_uur']), WEBSITE = new Set(['bop_vast', 'bop_variabel']);
export const sourceOf = key => EU_TOOL.has(key) ? 'EU LCOH-tool' : WEBSITE.has(key) ? 'mijnwindpark.nl (10 % BoP op vollast)' : 'plaatshouder';
export const isAssumption = field => field.status === STATUS.standaard || field.status === STATUS.eigen || !!field.aanname;
const fmt = (n, d = 3) => new Intl.NumberFormat('nl-NL', {maximumFractionDigits: d}).format(n);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const inRange = (key, value) => { const m = fieldMeta(key); return finite(value) && value * m.scale >= m.low - 1e-9 && value * m.scale <= m.high + 1e-9; };

export const defaultGeneral = () => ({strategy: 'verdelen', years: [...WIND_YEARS], values: {}, wind: DEFAULT_WIND_PROFILE});
// The doelvermogen is total stack power; BoP comes on top in the calculation. A system rating is converted with the
// setup's BoP, or with the standard 3 % + 7 % of opsplitsing.py while that is not known yet (catalogue, new setup).
const STANDARD_BOP = 1 + DEFAULTS.bop_vast + DEFAULTS.bop_variabel;
export const stackPowerMW = (moduleMW, boundary, bopFactor) => !finite(moduleMW) ? null : boundary === 'stack' ? moduleMW : moduleMW / (bopFactor || STANDARD_BOP);
export const newSetup = (id, modelId = '', modules = 1) => ({id, modelId, modules, choices: {}});
export function fillToTarget(moduleMW, target) {
 if (!(moduleMW > 0) || !(target > 0)) return null;
 const ratio = target / moduleMW, nearest = Math.round(ratio);
 if (nearest >= 1 && Math.abs(nearest * moduleMW - target) <= Math.max(target, 1) * 1e-9) return {modules: nearest, exact: true, below: null};
 const above = Math.max(1, Math.ceil(ratio)), below = Math.floor(ratio);
 return {modules: Math.min(MAX_MODULES, above), exact: false, below: below >= 1 ? below : null};
}

// Optional module limit, off by default. The user chooses whether it only warns or blocks (mode) and whether the
// target power must be reached with at most `max` modules or may be undershot by `tolerance` (reach).
export const LIMIT_MODES = ['uit', 'waarschuwen', 'blokkeren'], LIMIT_REACH = ['volledig', 'onder'], DEFAULT_MAX_MODULES = 12;
export const defaultLimit = () => ({mode: 'uit', max: DEFAULT_MAX_MODULES, reach: 'volledig', tolerance: 0.05});
export const validLimit = v => !!v && LIMIT_MODES.includes(v.mode) && Number.isInteger(v.max) && v.max >= 1 && v.max <= MAX_MODULES
 && LIMIT_REACH.includes(v.reach) && finite(v.tolerance) && v.tolerance >= 0 && v.tolerance <= 0.5;
// Lowest total power that still counts as reaching the target under the chosen reach rule.
export const limitFloorMW = (target, limit = defaultLimit()) => target * (limit.reach === 'onder' ? 1 - limit.tolerance : 1);
// What the limit asks of one setup: at most `max` modules and enough total stack power for the target. Nothing when off.
export function limitCheck({modules, moduleMW, target}, limit = defaultLimit()) {
 const problems = [];
 if (limit.mode !== 'uit' && Number.isInteger(modules)) {
  if (modules > limit.max) problems.push(`Modulelimiet: ${modules} modules is meer dan de limiet van ${limit.max} modules.`);
  if (finite(moduleMW) && moduleMW > 0 && finite(target) && target > 0) {
   const nominal = modules * moduleMW;
   if (nominal < limitFloorMW(target, limit) - target * 1e-9) problems.push(limit.reach === 'onder'
    ? `Modulelimiet: ${modules} × ${fmt(moduleMW)} = ${fmt(nominal, 2)} MW stackvermogen ligt meer dan ${fmt(limit.tolerance * 100, 1)} % onder het doelvermogen van ${fmt(target, 2)} MW.`
    : `Modulelimiet: ${modules} × ${fmt(moduleMW)} = ${fmt(nominal, 2)} MW stackvermogen haalt het doelvermogen van ${fmt(target, 2)} MW niet.`);
  }
 }
 return {mode: limit.mode, ok: !problems.length, blocks: limit.mode === 'blokkeren' && problems.length > 0, problems};
}
// For the catalogue: modules needed for the target, and whether the model can reach it within the limit.
export function modelFit(moduleMW, target, limit = defaultLimit()) {
 if (!(moduleMW > 0) || !(target > 0)) return null;
 const needed = Math.max(fillToTarget(moduleMW, target).modules, Math.ceil(target / moduleMW - 1e-9));
 const modules = limit.mode === 'uit' ? needed : Math.min(needed, limit.max);
 return {needed, modules, nominalMW: modules * moduleMW, ...limitCheck({modules, moduleMW, target}, limit)};
}
// fillToTarget, but a blocking limit caps the module count so the fill never goes past it.
export function fillWithinLimit(moduleMW, target, limit = defaultLimit()) {
 const fill = fillToTarget(moduleMW, target);
 if (!fill) return null;
 if (limit.mode !== 'blokkeren' || fill.modules <= limit.max) return {...fill, capped: false};
 return {modules: limit.max, exact: false, below: null, capped: true};
}

const field = (key, label, value, unit, status, extra = {}) => ({key, label, value, unit, status, ...extra});

// The interpreted catalogue model (interpretModel) + the stored setup → fields, problems and Aannames.
// `rules` ({target, limit}) is optional: without it no module limit applies.
export function resolveSetup(model, setup, general = defaultGeneral(), rules = {}) {
 const problems = [], fields = [], c = setup.choices || {}, own = c.values || {};
 const n = setup.modules;
 if (!Number.isInteger(n) || n < 1 || n > MAX_MODULES) problems.push(`Kies een geheel aantal modules van 1 tot ${MAX_MODULES}.`);
 if (!model) return {ready: false, problems: ['Kies een model uit de catalogus.', ...problems], fields, modules: n};

 // Module power on the stated boundary.
 let power;
 if (finite(c.power)) power = field('modulevermogen', 'Modulevermogen', c.power, 'MW', STATUS.eigen, {rule: c.powerNote || 'Eigen invoer.', raw: model.power.raw});
 else if (model.power.status === 'bron' || model.power.status === 'afgeleid') power = field('modulevermogen', 'Modulevermogen', model.power.value, 'MW', model.power.status, {rule: model.power.rule, raw: model.power.raw});
 else { power = field('modulevermogen', 'Modulevermogen', null, 'MW', 'open', {rule: model.power.reason || 'Niet in de catalogus.', raw: model.power.raw, candidates: model.power.candidates}); problems.push('Modulevermogen ontbreekt of is niet eenduidig: kies of vul een waarde in.'); }
 if (power.value !== null && !(power.value > 0 && power.value <= 1000)) { problems.push('Modulevermogen moet tussen 0 en 1.000 MW liggen.'); }
 fields.push(power);

 const boundary = c.boundary === 'systeem' || c.boundary === 'stack'
  ? field('vermogensgrens', 'Vermogensgrens', c.boundary, '', STATUS.eigen, {rule: 'Eigen keuze.'})
  : field('vermogensgrens', 'Vermogensgrens', model.boundary.value, '', model.boundary.status, {rule: model.boundary.rule, aanname: model.boundary.aanname});
 fields.push(boundary);
 const current = model.acdc.value
  ? field('acdc', 'AC/DC', model.acdc.value, '', model.acdc.status, {rule: model.acdc.rule})
  : field('acdc', 'AC/DC', boundary.value === 'stack' ? 'DC' : 'AC', '', STATUS.afgeleid, {aanname: true, rule: `AC/DC niet vermeld: gelezen als ${boundary.value === 'stack' ? 'DC (stackzijde)' : 'AC (systeemingang)'}, passend bij de vermogensgrens.`});
 fields.push(current);

 // Technology standard (TECHNOLOGIES in opsplitsing.py).
 const profileKey = TECHNOLOGIES[c.profile] ? c.profile : model.profile.key;
 const profile = profileKey ? TECHNOLOGIES[profileKey] : null;
 const profileField = TECHNOLOGIES[c.profile]
  ? field('rekenprofiel', 'Rekenprofiel', TECHNOLOGIES[c.profile].naam, '', STATUS.eigen, {rule: 'Eigen keuze van de technologiestandaard.', profileKey})
  : profile ? field('rekenprofiel', 'Rekenprofiel', profile.naam, '', model.profile.status, {rule: model.profile.rule, aanname: model.profile.aanname, profileKey})
  : field('rekenprofiel', 'Rekenprofiel', null, '', 'open', {rule: model.profile.rule});
 if (!profile) problems.push(model.profile.rule);
 const std = profile?.waarden || DEFAULTS;
 const stdLabel = key => `Standaard ${profile?.naam || 'technologie'} uit TECHNOLOGIES in opsplitsing.py (${sourceOf(key)}).`;
 const standardOr = (key, status = STATUS.standaard, rule = stdLabel(key)) => finite(own[key])
  ? field(key, fieldMeta(key).label, own[key], fieldMeta(key).unit, STATUS.eigen, {rule: 'Eigen invoer.', scale: fieldMeta(key).scale})
  : field(key, fieldMeta(key).label, std[key], fieldMeta(key).unit, profile ? status : 'open', {rule: profile ? rule : 'Kies eerst een rekenprofiel.', scale: fieldMeta(key).scale});

 // BoP: a stack delivery or stack-only consumption needs an explicit, visible BoP assumption.
 const systemKnown = model.systemEnergy.status === 'bron' || model.systemEnergy.status === 'afgeleid';
 const stackKnown = model.stackEnergy.status === 'bron' || model.stackEnergy.status === 'afgeleid';
 const stackDelivery = model.delivery.kind === 'stack';
 const energyFromStack = !finite(c.energy) && c.energySource !== 'tech' && !systemKnown && stackKnown;
 const needsBoP = stackDelivery || energyFromStack;
 let bopFields;
 if (needsBoP && !c.bopConfirmed) {
  bopFields = ['bop_vast', 'bop_variabel'].map(key => field(key, fieldMeta(key).label, null, fieldMeta(key).unit, 'open', {rule: stackDelivery ? 'Losse stack: BoP is niet inbegrepen. Bevestig eerst een BoP-aanname.' : 'Alleen stackverbruik bekend: bevestig eerst een BoP-aanname.', scale: fieldMeta(key).scale}));
  problems.push(stackDelivery ? 'Losse stack: zonder expliciete BoP-aanname geen resultaat.' : 'Alleen stackverbruik bekend: zonder expliciete BoP-aanname geen resultaat.');
 } else if (needsBoP) {
  bopFields = ['bop_vast', 'bop_variabel'].map(key => field(key, fieldMeta(key).label, finite(own[key]) ? own[key] : DEFAULTS[key], fieldMeta(key).unit, STATUS.eigen, {aanname: true, scale: fieldMeta(key).scale,
   rule: `Expliciete BoP-aanname (${stackDelivery ? 'losse stack' : 'alleen stackverbruik'})${finite(own[key]) ? '' : `, standaardwaarde ${fmt(DEFAULTS[key] * 100)} % uit opsplitsing.py`}.`}));
 } else bopFields = ['bop_vast', 'bop_variabel'].map(key => standardOr(key));
 const bv = bopFields[1].value, bf = bopFields[0].value, bopFactor = finite(bv) && finite(bf) ? 1 + bv + bf : null;

 // System consumption at full load, including BoP.
 let energy;
 if (finite(c.energy)) energy = field('systeemverbruik_vol', 'Systeemverbruik bij vollast', c.energy, 'kWh/kg, incl. BoP', STATUS.eigen, {rule: c.energyNote || 'Eigen invoer.'});
 else if (c.energySource === 'tech') energy = field('systeemverbruik_vol', 'Systeemverbruik bij vollast', profile ? std.systeemverbruik_vol : null, 'kWh/kg, incl. BoP', profile ? STATUS.standaard : 'open', {rule: profile ? stdLabel('systeemverbruik_vol') + ' Geen modelwaarde.' : 'Kies eerst een rekenprofiel.'});
 else if (systemKnown) energy = field('systeemverbruik_vol', 'Systeemverbruik bij vollast', model.systemEnergy.value, 'kWh/kg, incl. BoP', model.systemEnergy.status, {rule: model.systemEnergy.rule, raw: model.systemEnergy.raw});
 else if (stackKnown && bopFactor && c.bopConfirmed) energy = field('systeemverbruik_vol', 'Systeemverbruik bij vollast', model.stackEnergy.value * bopFactor, 'kWh/kg, incl. BoP', STATUS.afgeleid, {aanname: true, raw: model.stackEnergy.raw,
  rule: `Stackverbruik ${fmt(model.stackEnergy.value, 2)} kWh/kg × (1 + BoP-vast + BoP-variabel) = ${fmt(model.stackEnergy.value * bopFactor, 2)} kWh/kg. De BoP is een aanname.`});
 else energy = field('systeemverbruik_vol', 'Systeemverbruik bij vollast', null, 'kWh/kg, incl. BoP', 'open', {raw: model.systemEnergy.raw || model.stackEnergy.raw,
  rule: stackKnown ? 'Alleen stackverbruik: bevestig eerst de BoP-aanname.' : model.systemEnergy.reason || model.stackEnergy.reason || 'Geen verbruik in de catalogus.',
  candidates: [...new Set([...(model.systemEnergy.candidates || []), ...(stackKnown ? [] : model.stackEnergy.candidates || [])])]});
 if (energy.value === null) { if (!(needsBoP && !c.bopConfirmed)) problems.push('Systeemverbruik ontbreekt of is niet eenduidig: kies een bronwaarde, vul een waarde in of kies de technologiestandaard.'); }
 else if (!inRange('systeemverbruik_vol', energy.value)) problems.push('Systeemverbruik moet tussen 20 en 90 kWh/kg liggen.');
 fields.push(energy);

 // Minimum load per module.
 let minimum;
 if (finite(c.minimum)) minimum = field('minimumlast', 'Minimumlast', c.minimum, '% van de stacklast', STATUS.eigen, {rule: c.minimumNote || 'Eigen invoer.', raw: model.minimum.raw, scale: 100});
 else if (c.minimumSource === 'tech' || model.minimum.status === 'ontbreekt') minimum = field('minimumlast', 'Minimumlast', profile ? std.minimumlast : null, '% van de stacklast', profile ? STATUS.standaard : 'open', {scale: 100, raw: model.minimum.raw,
  rule: profile ? `${model.minimum.status === 'ontbreekt' ? 'Niet in de catalogus. ' : ''}Standaard ${profile.naam} uit TECHNOLOGIES in opsplitsing.py (plaatshouder).` : 'Kies eerst een rekenprofiel.'});
 else if (model.minimum.status === 'bron' || model.minimum.status === 'afgeleid') minimum = field('minimumlast', 'Minimumlast', model.minimum.value, '% van de stacklast', model.minimum.status, {aanname: model.minimum.aanname, rule: model.minimum.rule, raw: model.minimum.raw, scale: 100});
 else { minimum = field('minimumlast', 'Minimumlast', null, '% van de stacklast', 'open', {rule: model.minimum.reason, raw: model.minimum.raw, basis: model.minimum.basis, candidates: model.minimum.candidates, scale: 100}); problems.push('Minimumlast niet eenduidig: ' + model.minimum.reason); }
 if (minimum.value !== null && !inRange('minimumlast', minimum.value)) problems.push('Minimumlast moet tussen 0 en 80 % liggen.');
 fields.push(minimum);

 // Part-load efficiency: technology standard unless the source gives a curve.
 let gain;
 if (finite(own.deellastvoordeel)) gain = field('deellastvoordeel', 'Deellastvoordeel stack', own.deellastvoordeel, '%', STATUS.eigen, {rule: 'Eigen invoer.', scale: 100});
 else if (model.partload?.usable && c.usePartLoad !== false && profile && bopFactor) {
  const fit = fitPartLoadGain(model.partload, {...std, bop_vast: bf, bop_variabel: bv});
  gain = field('deellastvoordeel', 'Deellastvoordeel stack', fit.value, '%', STATUS.afgeleid, {scale: 100, raw: model.partload.raw, fit,
   rule: `Uit de deellastcurve van de bron (${model.partload.unit === 'Nm3' ? `kWh/Nm³ × ${fmt(NM3_PER_KG, 2)} Nm³/kg bij 0 °C en 1,013 bar` : 'kWh/kg'}): het deellastvoordeel waarbij de verhouding deellast/vollast van opsplitsing.py het best past (0–30 %, stap 0,1 %). Restafwijking ${fmt(fit.rms * 100, 1)} %.${fit.atLimit ? ' De curve valt buiten wat dit model kan volgen; de waarde staat op de grens.' : ''}`});
 } else gain = standardOr('deellastvoordeel', STATUS.standaard, `Rendement bij deellast onbekend: deellastvoordeel ${profile?.naam || ''} uit TECHNOLOGIES in opsplitsing.py (plaatshouder).`);
 fields.push(gain, ...bopFields, ...MODEL_KEYS.map(key => standardOr(key)));
 for (const f of fields) if (f.scale && f.key !== 'minimumlast' && f.value !== null && finite(f.value) && META[f.key] && !inRange(f.key, f.value)) problems.push(`${f.label} valt buiten ${fieldMeta(f.key).low}–${fieldMeta(f.key).high} ${fieldMeta(f.key).unit}.`);

 const moduleMW = power.value, stackModuleMW = stackPowerMW(moduleMW, boundary.value, bopFactor);
 // A limit that only warns leaves the setup calculable; a blocking one makes it not ready.
 const limit = limitCheck({modules: n, moduleMW: stackModuleMW, target: rules.target}, validLimit(rules.limit) ? rules.limit : defaultLimit());
 if (limit.blocks) problems.push(...limit.problems);
 const ready = !problems.length && finite(stackModuleMW) && !!bopFactor && fields.every(f => f.value !== null);
 const counted = fields.filter(f => f.key !== 'rekenprofiel');
 const result = {
  ready, problems: [...new Set(problems)], limit, fields: [profileField, ...fields], modules: n, moduleMW, needsBoP,
  boundary: boundary.value, stackModuleMW, bopFactor,
  nominalMW: finite(moduleMW) ? n * moduleMW : null, intakeMW: finite(stackModuleMW) && bopFactor ? n * stackModuleMW * bopFactor : null,
  platformLimitMW: model.power.platformLimitMW || null,
  counts: {bron: counted.filter(f => f.value !== null && !isAssumption(f)).length, aanname: counted.filter(f => f.value !== null && isAssumption(f)).length, open: counted.filter(f => f.value === null).length},
  nominalEnergy: energy.value,
 };
 if (ready) {
  const g = generalValues(general);
  result.aannames = {...DEFAULTS, ...g.values, capaciteit_mw: n * stackModuleMW};
  for (const f of fields) if (f.key in DEFAULTS) result.aannames[f.key] = f.value;
 }
 return result;
}

// General assumptions: equal for every setup. Standard = Aannames() in opsplitsing.py (PEM/EU-tool defaults).
export function generalValues(general = defaultGeneral()) {
 const values = {}, fields = [];
 for (const key of GENERAL_KEYS) {
  const own = general.values?.[key];
  const value = finite(own) && inRange(key, own) ? own : DEFAULTS[key];
  values[key] = value;
  fields.push({key, label: fieldMeta(key).label, unit: fieldMeta(key).unit, scale: fieldMeta(key).scale, value, status: finite(own) && inRange(key, own) ? STATUS.eigen : STATUS.standaard,
   rule: finite(own) && inRange(key, own) ? 'Eigen invoer, gelijk voor alle opstellingen.' : `Aannames() in opsplitsing.py (${sourceOf(key)}).`});
 }
 const strategy = STRATEGIES[general.strategy] ? general.strategy : 'verdelen';
 const years = WIND_YEARS.filter(y => general.years?.includes(y));
 // Windprofiel: zonder (oude opslag) of onbekend de standaard.
 const windProfile = WIND_PROFILES[general.wind] ? general.wind : DEFAULT_WIND_PROFILE;
 return {values, fields, strategy, years: years.length ? years : [...WIND_YEARS], strategyStatus: strategy === 'verdelen' ? STATUS.standaard : STATUS.eigen,
  windProfile, windStatus: windProfile === DEFAULT_WIND_PROFILE ? STATUS.standaard : STATUS.eigen};
}

// Canonical JSON (keys sorted at every level) and a stable short hash of it (cyrb53).
export const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
 : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);
export function inputHash(value) {
 const text = canonical(value);
 let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
 for (let i = 0; i < text.length; i++) { const ch = text.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
 h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
 h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
 return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
export function jobFor(resolved, general, year) {
 const g = generalValues(general);
 const aannames = Object.fromEntries(Object.keys(resolved.aannames).sort().map(k => [k, resolved.aannames[k]]));
 const input = {kernel: KERNEL_VERSION, year, modules: resolved.modules, strategy: g.strategy, wind: g.windProfile, aannames};
 return {...input, key: inputHash(input)};
}

// Fixed result definitions for one year (or the mean over years).
export function metrics(resolved, r, year) {
 const kg = r.waterstof_t * 1000, intake = resolved.intakeMW;
 const hours = year === null ? null : hoursInYear(year);
 return {
  jaar: year, modules: r.modules, nominaal_mw: resolved.nominalMW, opname_vollast_mw: intake,
  waterstof_kg: kg, opgenomen_mwh: r.verbruik_mwh, standby_mwh: r.standby_mwh, aanbod_mwh: r.aanbod_mwh,
  benut: r.benutting, belasting: intake ? r.verbruik_mwh / (intake * 8760) : 0,
  rest_mwh: r.aanbod_mwh - r.verbruik_mwh, onder_minimum_mwh: r.extra.onder_minimum_mwh, boven_maximum_mwh: r.extra.boven_maximum_mwh, overig_mwh: r.extra.overig_mwh,
  kwh_per_kg: kg > 0 ? (r.verbruik_mwh + r.standby_mwh) * 1000 / kg : null, kwh_per_kg_nominaal: resolved.nominalEnergy,
  draaiuren: r.bedrijfsuren_gem, productie_uur: r.productie_uur, starts_per_module: r.starts_warm_per_module + r.starts_koud_per_module,
  starts_koud_per_module: r.starts_koud_per_module, dekking_uur: r.dekking_uur, uren_in_jaar: hours, stackwissel_dagen: r.stackwissel_dagen,
  klassen: r.extra.klassen,
 };
}
export function meanMetrics(resolved, perYear, summary, years) {
 const m = metrics(resolved, summary, null);
 m.dekking = years.reduce((s, y, i) => s + perYear[i].dekking_uur, 0) / years.reduce((s, y) => s + hoursInYear(y), 0);
 m.uren_in_jaar = years.reduce((s, y) => s + hoursInYear(y), 0) / years.length;
 m.belasting = perYear.reduce((s, r) => s + r.belasting, 0) / perYear.length;
 return m;
}
export const withCoverage = m => ({...m, dekking: m.dekking ?? (m.uren_in_jaar ? m.dekking_uur / m.uren_in_jaar : null)});

// Comparison rows (label, metric key, unit, display, CSV name); differences are against the chosen reference setup.
// Weergave: 'invoer' = afgeleid uit modules × catalogus- of invoerwaarde, getoond zoals ingevoerd (hoogstens 2 decimalen);
// 'waterstof' = kg, getoond in t; 'energie' = MWh, getoond in MWh of GWh; 'procent' = hoogstens 1 decimaal;
// 'uitkomst' = drie significante cijfers. De CSV houdt de waarden in de eenheid van de kolomnaam, in volle precisie.
export const RESULT_ROWS = [
 ['Totaal nominaal vermogen', 'nominaal_mw', 'MW', 'invoer', 'totaal_nominaal_MW'], ['Opname bij vollast incl. BoP', 'opname_vollast_mw', 'MW', 'invoer', 'opname_vollast_incl_BoP_MW'], ['Aantal modules', 'modules', '', 'invoer', 'modules'],
 ['Waterstof', 'waterstof_kg', 'kg per jaar', 'waterstof', 'waterstof_kg_per_jaar'], ['Opgenomen stroom incl. BoP', 'opgenomen_mwh', 'MWh per jaar', 'energie', 'opgenomen_MWh_per_jaar'], ['Stand-by (warmhouden)', 'standby_mwh', 'MWh per jaar', 'energie', 'standby_MWh_per_jaar'],
 ['Deel van het windaanbod benut', 'benut', '%', 'procent', 'aanbod_benut_pct'], ['Gemiddelde belasting', 'belasting', '%', 'procent', 'gemiddelde_belasting_pct'],
 ['Resterende windenergie', 'rest_mwh', 'MWh per jaar', 'energie', 'rest_MWh_per_jaar'], ['· onder minimumlast', 'onder_minimum_mwh', 'MWh per jaar', 'energie', 'rest_onder_minimumlast_MWh_per_jaar'], ['· boven maximum', 'boven_maximum_mwh', 'MWh per jaar', 'energie', 'rest_boven_maximum_MWh_per_jaar'],
 ['· overig (onderhoud, storing, wacht- en uittijd)', 'overig_mwh', 'MWh per jaar', 'energie', 'rest_overig_MWh_per_jaar'],
 ['Werkelijk stroomverbruik', 'kwh_per_kg', 'kWh/kg', 'uitkomst', 'werkelijk_kWh_per_kg'], ['Nominaal systeemverbruik (rekenwaarde)', 'kwh_per_kg_nominaal', 'kWh/kg', 'invoer', 'nominaal_kWh_per_kg'],
 ['Draaiuren per module', 'draaiuren', 'uur per jaar', 'uitkomst', 'draaiuren_per_module'], ['Uren met productie', 'productie_uur', 'uur per jaar', 'uitkomst', 'uren_met_productie'], ['Starts per module', 'starts_per_module', 'per jaar', 'uitkomst', 'starts_per_module'],
 ['Datadekking', 'dekking', '%', 'procent', 'datadekking_pct'],
 // Costs (electrolyser-economics.mjs): shown after the technical rows, never part of the simulation.
 ['CAPEX (aangenomen prijs)', 'capex_meur', 'M€', 'uitkomst', 'CAPEX_MEUR'], ['Kapitaalkosten en vaste OPEX', 'kapitaal_meur_jaar', 'M€ per jaar', 'uitkomst', 'kapitaal_en_OPEX_MEUR_per_jaar'],
 ['Stroomkosten', 'stroom_meur_jaar', 'M€ per jaar', 'uitkomst', 'stroom_MEUR_per_jaar'], ['Stackvervanging', 'stack_meur_jaar', 'M€ per jaar', 'uitkomst', 'stackvervanging_MEUR_per_jaar'],
 ['Kosten per jaar', 'kosten_meur_jaar', 'M€ per jaar', 'uitkomst', 'kosten_MEUR_per_jaar'], ['LCOH', 'lcoh_eur_kg', '€/kg', 'uitkomst', 'LCOH_EUR_per_kg'],
 ['Maximale meerprijs t.o.v. referentie (boven +, onder − de aangenomen prijs)', 'meerprijs_eur_kw', '€/kW', 'uitkomst', 'max_meerprijs_EUR_per_kW'],
];
export const PERCENT_KEYS = new Set(['benut', 'belasting', 'dekking']);

// Eén uitkomstregel in de tabel: elke opstelling en elk verschil in dezelfde eenheid en met dezelfde afronding,
// bepaald door de grootste waarde in de regel. Het verschil is dat van de getoonde waarden; het percentage komt
// uit de onafgeronde waarden.
export function resultRow([, key, unit, display, _column], rows, diffs = []) {
 const raw = rows.map(row => row?.[key]);
 const energy = energyUnit(Math.max(0, ...raw.filter(finite).map(Math.abs)));
 const scale = display === 'waterstof' ? {factor: 1e-3, unit: unit.replace('kg', 't')} : display === 'energie' ? {factor: energy.factor, unit: unit.replace('MWh', energy.unit)}
  : display === 'procent' ? {factor: 100, unit} : {factor: 1, unit};
 const shown = raw.map(v => finite(v) ? v * scale.factor : null);
 const decimals = display === 'procent' ? 1 : display === 'invoer' ? 2 : sharedDecimals(shown), pad = display !== 'invoer';
 return {unit: scale.unit, cells: shown.map((v, i) => {
  const d = diffs[i]?.[key];
  if (!d || v === null) return {value: v === null ? '—' : formatFixed(v, decimals, pad), diff: null};
  const delta = Math.abs(d.delta) <= 1e-9 ? 0 : shownDifference(v, v - d.delta * scale.factor, decimals);
  const relative = display !== 'procent' && d.pct !== null && delta !== 0 ? formatSigned(d.pct * 100, 1) : '±0';
  const diff = Math.abs(d.delta) <= 1e-9 ? 'gelijk' : formatSigned(delta, decimals, pad)
   + (display === 'procent' ? ' procentpunt' : relative !== '±0' ? ` (${relative}%)` : '');
  return {value: formatFixed(v, decimals, pad), diff};
 })};
}

export function differences(rows, reference) {
 const ref = rows[reference];
 return rows.map((row, i) => i === reference || !row || !ref ? null : Object.fromEntries(RESULT_ROWS.map(([, key]) => {
  const a = row[key], b = ref[key];
  if (!finite(a) || !finite(b)) return [key, null];
  return [key, {delta: a - b, pct: b !== 0 && !PERCENT_KEYS.has(key) ? (a - b) / Math.abs(b) : null}];
 })));
}
export function capacityWarnings(resolvedList, reference) {
 const ref = resolvedList[reference];
 if (!ref?.nominalMW) return [];
 const out = [];
 resolvedList.forEach((r, i) => {
  if (i === reference || !r?.nominalMW) return;
  const d = (r.nominalMW - ref.nominalMW) / ref.nominalMW;
  if (Math.abs(d) > 0.05) out.push({kind: 'nominaal', index: i, pct: d});
  else if (r.intakeMW && ref.intakeMW && Math.abs(r.intakeMW - ref.intakeMW) / ref.intakeMW > 0.05) out.push({kind: 'grens', index: i, pct: (r.intakeMW - ref.intakeMW) / ref.intakeMW});
 });
 return out;
}

// CSV in the house style: UTF-8 BOM, semicolons, decimal commas; values and statuses with bron./aanname./uitkomst.
export function csvCell(v) {
 if (v === null || v === undefined) return '';
 if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : '';
 let t = String(v);
 if (/^[=+@\-\t\r]/.test(t)) t = "'" + t;
 return /[;"\r\n]/.test(t) ? '"' + t.replaceAll('"', '""') + '"' : t;
}
const statusText = f => f.value === null ? 'open' : f.status + (f.aanname && f.status === STATUS.afgeleid ? ' (aanname)' : '');
export function comparisonCSV({catalogue, entries, general}) {
 const g = generalValues(general);
 const modelCols = ['rekenprofiel', 'modulevermogen', 'vermogensgrens', 'acdc', 'systeemverbruik_vol', 'minimumlast', 'deellastvoordeel', 'bop_vast', 'bop_variabel', ...MODEL_KEYS];
 const shown = f => f.value === null ? null : f.scale ? f.value * f.scale : f.value;
 const head = ['bron.catalogusversie', 'bron.catalogus_bijgewerkt', 'bron.aanvullingen_versie', 'bron.opstelling', 'bron.model_id', 'bron.model', 'bron.fabrikant', 'bron.technologie',
  'bron.leveringstype', 'bron.leveringstype.status', 'bron.tekst_vermogen', 'bron.tekst_systeemverbruik', 'bron.tekst_stackverbruik', 'bron.tekst_minimumlast', 'bron.bronvermelding',
  'aanname.aantal_modules', ...modelCols.flatMap(k => [`aanname.${k}`, `aanname.${k}.status`, `aanname.${k}.regel`]),
  'aanname.besturing', 'aanname.besturing.status', ...GENERAL_KEYS.flatMap(k => [`aanname.${k}`, `aanname.${k}.status`]),
  ...COST_SETUP_KEYS.flatMap(k => [`aanname.kosten.${k}`, `aanname.kosten.${k}.status`]), ...COST_KEYS.flatMap(k => [`aanname.kosten.${k}`, `aanname.kosten.${k}.status`]), 'aanname.windprofiel', 'aanname.windprofiel.status', 'aanname.windreeks', 'aanname.windjaren', 'aanname.storingen',
  'uitkomst.windjaar', 'uitkomst.rust_op', ...RESULT_ROWS.map(row => 'uitkomst.' + row[4]), 'uitkomst.uren_met_data', 'uitkomst.invoer_hash', 'uitkomst.rekenkern'];
 const lines = [head];
 for (const entry of entries) {
  const {setup, model, resolved, result} = entry;
  if (!result) continue;
  const byKey = Object.fromEntries(resolved.fields.map(f => [f.key, f]));
  const base = [catalogue?.revision, catalogue?.sourceUpdatedAt, catalogue?.additionsVersion, setup.label, model.id, model.name, model.manufacturer, model.technology,
   model.delivery.label, model.delivery.status, model.power.raw, model.systemEnergy.raw, model.stackEnergy.raw, model.minimum.raw, model.source,
   resolved.modules, ...modelCols.flatMap(k => { const f = byKey[k]; return f ? [shown(f), statusText(f), f.rule || ''] : ['', '', '']; }),
   g.strategy, g.strategyStatus, ...g.fields.flatMap(f => [f.value * f.scale, f.status]),
   ...COST_SETUP_KEYS.flatMap(k => { const f = entry.costs?.fields?.find(x => x.key === k); return f ? [f.value * f.scale, f.status] : ['', '']; }),
   ...generalCosts(general).fields.flatMap(f => [f.value * f.scale, f.status]), g.windProfile, g.windStatus, windSeries(g.windProfile), g.years.join(', '), 'Vaste trekking per module en jaar (zaad jaar × 100 + modulenummer), gelijk voor elke opstelling'];
  const rust = `${resolved.counts.bron} bronwaarden en ${resolved.counts.aanname} aannames`;
  const rows = [...result.years.map((y, i) => [String(y), withCoverage(result.perYear[i])]), ['gemiddelde', result.mean]];
  for (const [label, m] of rows) lines.push([...base, label, rust, ...RESULT_ROWS.map(([, k]) => PERCENT_KEYS.has(k) ? (finite(m[k]) ? m[k] * 100 : null) : m[k]), m.dekking_uur, result.keys.join(' '), KERNEL_VERSION]);
 }
 return '﻿' + lines.map(row => row.map(csvCell).join(';')).join('\r\n');
}

// ---- Import of a shortlist from the Waterstofatlas (?atlas=<base64url JSON>) ----
// The Atlas links here with a query parameter because both password gates keep path + query and drop the #fragment.
export const ATLAS_IMPORT_MAX_IDS = 6, ATLAS_IMPORT_MAX_CHARS = 4000, ATLAS_TARGET_RANGE = [1, 200];
export function decodeBase64Url(text) {
 const bin = atob(String(text).replace(/-/g, '+').replace(/_/g, '/')), bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
 return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}
// Validate the payload strictly: only model ids, a target and an optional module limit are accepted. An invalid target
// (outside 1–200 MW) is dropped, not fatal: the models are still useful at the target already set here.
export function parseAtlasImport(search) {
 const raw = new URLSearchParams(String(search || '')).get('atlas');
 if (raw === null) return {present: false, ok: false, error: '', payload: null};
 const fail = error => ({present: true, ok: false, error, payload: null});
 if (!raw || raw.length > ATLAS_IMPORT_MAX_CHARS || !/^[A-Za-z0-9_-]+$/.test(raw)) return fail('De link uit de Waterstofatlas is onleesbaar.');
 let data;
 try { data = JSON.parse(decodeBase64Url(raw)); } catch { return fail('De link uit de Waterstofatlas is onleesbaar.'); }
 if (!data || typeof data !== 'object' || data.type !== 'atlas-shortlist') return fail('Dit is geen shortlist uit de Waterstofatlas.');
 if (data.version !== 1) return fail('Deze shortlist komt van een andere versie van de Waterstofatlas en wordt niet gelezen.');
 const ids = data.ids;
 if (!Array.isArray(ids) || ids.length < 1 || ids.length > ATLAS_IMPORT_MAX_IDS || ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{12}$/.test(id)) || new Set(ids).size !== ids.length)
  return fail(`De shortlist moet 1 tot ${ATLAS_IMPORT_MAX_IDS} unieke modellen bevatten.`);
 const target = finite(data.target) && data.target >= ATLAS_TARGET_RANGE[0] && data.target <= ATLAS_TARGET_RANGE[1] ? data.target : null;
 const maxModules = Number.isInteger(data.maxModules) && data.maxModules >= 1 && data.maxModules <= MAX_MODULES ? data.maxModules : null;
 return {present: true, ok: true, error: '', payload: {ids: [...ids], target, maxModules, revision: typeof data.revision === 'string' ? data.revision.slice(0, 80) : ''}};
}
// One setup per known model, filled to the target as `choose` does it in the hub. `models` are interpreted catalogue
// models; unknown or disabled ids (they are not in `models`) end up in `notFound`.
export function setupsFromImport(payload, models, {target = DEFAULT_TARGET_MW, limit = defaultLimit(), makeId = (i => `import${i}`)} = {}) {
 const byId = new Map(models.map(m => [m.id, m]));
 const goal = payload.target ?? target;
 const useLimit = payload.maxModules ? {...defaultLimit(), mode: 'waarschuwen', max: payload.maxModules} : limit;
 const setups = [], notFound = [];
 for (const id of payload.ids) {
  const model = byId.get(id);
  if (!model) { notFound.push(id); continue; }
  const fill = model.power?.value ? fillWithinLimit(stackPowerMW(model.power.value, model.boundary.value), goal, useLimit) : null;
  setups.push(newSetup(makeId(setups.length), id, fill?.modules || 1));
 }
 return {setups, notFound, target: goal, limit: useLimit, limitChanged: !!payload.maxModules};
}

// ---- Result back to the Waterstofatlas (?windresultaat=<base64url JSON>#arena) ----
// Same reason as the import: the Atlas password gate keeps path + query and drops the #fragment, so the data travels in the query.
export const ATLAS_RESULT_BASE = 'https://waterstofatlas.nl/';
export const encodeBase64Url = text => {
 let bin = '';
 for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
 return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const sig = (v, digits = 5) => finite(v) ? Number(v.toPrecision(digits)) : null;
// A field still rests on an assumption when it is open, a technology standard or a derived assumption.
const restsOnAssumption = f => f.value === null || f.status === STATUS.standaard || (f.status === STATUS.afgeleid && !!f.aanname);
// entries: [{setup, model, resolved, result (the costed assembly), costs}] in the order of the comparison. Only setups with a
// result and a catalogue id travel along. A model used in two setups is sent once, with its best result (lowest LCOH,
// otherwise most hydrogen), because the Atlas knows models and not setups.
// verdict: robustness() over the same entries, or null. Per setup it travels as kostenoordeel ('goedkoopst', 'gelijkwaardig',
// 'duurder' or null), so the Arena does not turn a difference that the cost tests cannot tell apart into 100 against 0 points.
export const costVerdictOf = (verdict, index) => !verdict ? null : index === verdict.lowest ? 'goedkoopst' : verdict.equivalent.includes(index) ? 'gelijkwaardig' : verdict.dearer.includes(index) ? 'duurder' : null;
export function windResultPayload({entries, reference = 0, general = defaultGeneral(), target = DEFAULT_TARGET_MW, verdict = null}) {
 const g = generalValues(general);
 const generalOpen = g.fields.filter(restsOnAssumption).map(f => f.key);
 const best = new Map();
 entries.forEach((e, index) => {
  const mean = e?.result?.mean, id = e?.model?.id;
  if (!mean || typeof id !== 'string' || !/^[a-f0-9]{12}$/.test(id)) return;
  const keys = [...new Set([...e.resolved.fields.filter(restsOnAssumption).map(f => f.key), ...generalOpen, ...(e.costs?.fields || []).filter(restsOnAssumption).map(f => f.key)])].slice(0, 40);
  const item = {modelId: id, modules: e.resolved.modules, waterstof_t: sig(mean.waterstof_kg / 1000), benutting: sig(mean.benut, 4), lcoh_eur_kg: sig(mean.lcoh_eur_kg, 4),
   meerprijs_eur_kw: index === reference ? null : sig(mean.meerprijs_eur_kw, 4), koude_starts: sig(mean.starts_koud_per_module, 4), kostenoordeel: costVerdictOf(verdict, index), aannameVelden: keys, isReference: index === reference};
  const old = best.get(id);
  const better = !old || (finite(item.lcoh_eur_kg) && finite(old.lcoh_eur_kg) ? item.lcoh_eur_kg < old.lcoh_eur_kg : item.waterstof_t > old.waterstof_t);
  if (better) best.set(id, item);
 });
 const setups = [...best.values()].slice(0, MAX_SETUPS).map(({isReference, ...rest}) => rest);
 const referenceId = entries[reference]?.model?.id;
 return {type: 'windpark-result', version: 1, kernel: KERNEL_VERSION, years: [...g.years], windprofiel: g.windProfile, target: sig(target, 6),
  reference: typeof referenceId === 'string' && best.has(referenceId) ? referenceId : null, kostentoetsen: verdict?.tested ? verdict.cases : null, setups};
}
export const windResultLink = payload => payload?.setups?.length ? `${ATLAS_RESULT_BASE}?windresultaat=${encodeBase64Url(JSON.stringify(payload))}#arena` : null;

// ---- Open punten in één keer invullen ----
// After an Atlas import most setups are not calculable yet: a range in the datasheet, a minimum load in hydrogen terms,
// a stack without BoP or a technology without a standard. autoResolve fills each open point with a cautious, visible
// assumption, so a comparison is possible; every filled value is labelled (eigen invoer / standaard technologie) and listed.
// Cautious = the unfavourable side of a range: the highest consumption and the highest minimum load.
export const AUTO_PROFILE = {AEM: 'pem', SOEC: 'alkaline_hoog', Waterdamp: 'alkaline_hoog', Membraanvrij: 'alkaline'};
const autoProfileFor = technology => AUTO_PROFILE[technology] || 'pem';
export function autoResolve(model, setup, general = defaultGeneral(), rules = {}) {
 if (!model) return {setup, notes: [], ready: false};
 let s = {...setup, choices: {...(setup.choices || {})}};
 const notes = [];
 for (let round = 0; round < 6; round++) {
  const r = resolveSetup(model, s, general, rules);
  if (r.ready) return {setup: s, notes, ready: true};
  const f = Object.fromEntries(r.fields.map(x => [x.key, x])), c = {...s.choices};
  let changed = false;
  if (f.rekenprofiel && f.rekenprofiel.value === null) {
   const key = autoProfileFor(model.technology);
   c.profile = key; changed = true;
   notes.push(`Rekenprofiel ${TECHNOLOGIES[key].naam} voor ${model.technology || 'deze technologie'} (aanname, geen eigen standaard in opsplitsing.py).`);
  } else if (f.modulevermogen && f.modulevermogen.value === null && f.modulevermogen.candidates?.length) {
   const v = Math.max(...f.modulevermogen.candidates.filter(x => x > 0 && x <= 1000));
   if (Number.isFinite(v)) { c.power = v; c.powerNote = `Automatisch ingevuld: hoogste waarde uit de brontekst “${model.power.raw}” (aanname).`; changed = true; notes.push(`Modulevermogen ${fmt(v, 3)} MW (hoogste waarde uit de bron).`); }
  } else if (r.needsBoP && !c.bopConfirmed) {
   c.bopConfirmed = true; changed = true;
   notes.push('BoP-aanname 3 % vast + 7 % variabel (losse stack of alleen stackverbruik bekend).');
  } else if (f.systeemverbruik_vol && f.systeemverbruik_vol.value === null) {
   const cands = (f.systeemverbruik_vol.candidates || []).filter(x => x >= 20 && x <= 90);
   if (cands.length) { const v = Math.max(...cands); c.energy = v; c.energyNote = `Automatisch ingevuld: ongunstigste (hoogste) waarde uit de brontekst “${model.systemEnergy.raw || model.stackEnergy.raw}” (aanname).`; delete c.energySource; notes.push(`Systeemverbruik ${fmt(v, 2)} kWh/kg (ongunstigste waarde uit de bron).`); }
   else { c.energySource = 'tech'; notes.push('Systeemverbruik volgens de technologiestandaard (geen bruikbare waarde in de bron).'); }
   changed = true;
  } else if (f.minimumlast && f.minimumlast.value === null) {
   const cands = (f.minimumlast.candidates || []).filter(x => x >= 0 && x <= 80);
   if (cands.length) { const v = Math.max(...cands); c.minimum = v / 100; c.minimumNote = `Automatisch ingevuld: ${fmt(v, 2)} % uit de brontekst “${model.minimum.raw}”, gelezen als percentage van het elektrisch vermogen (ongunstigste waarde, aanname).`; delete c.minimumSource; notes.push(`Minimumlast ${fmt(v, 2)} % (uit de bron, gelezen als elektrisch percentage).`); }
   else { c.minimumSource = 'tech'; notes.push('Minimumlast volgens de technologiestandaard (geen bruikbare waarde in de bron).'); }
   changed = true;
  }
  if (!changed) return {setup: s, notes, ready: false};
  s = {...s, choices: c};
  // A module power that was open could not fill the setup to the target yet: do that now.
  if (c.power !== setup.choices?.power && finite(c.power) && finite(rules.target)) {
   const fill = fillWithinLimit(stackPowerMW(c.power, resolveSetup(model, s, general, rules).boundary), rules.target, validLimit(rules.limit) ? rules.limit : defaultLimit());
   if (fill?.modules) s = {...s, modules: fill.modules};
  }
 }
 return {setup: s, notes, ready: resolveSetup(model, s, general, rules).ready};
}

// ---- Conclusie van de vergelijking ----
// entries: [{mean: {waterstof_kg, lcoh_eur_kg}}] in comparison order; verdict: robustness() or null (no costs).
// Returns the recommended setup and why: lowest LCOH when that is robust, otherwise the most hydrogen within the
// group that is equivalent on cost, otherwise (no costs) the most hydrogen. Within 2 % hydrogen counts as equal.
export const HYDROGEN_TIE = 0.02;
/** @param {any[]} entries @param {any} [verdict] */
export function comparisonConclusion(entries, verdict = null) {
 const live = entries.map((e, i) => e?.mean && finite(e.mean.waterstof_kg) ? i : -1).filter(i => i >= 0);
 if (live.length < 2) return null;
 const h2 = i => entries[i].mean.waterstof_kg, lcoh = i => entries[i].mean.lcoh_eur_kg;
 const mostH2 = list => list.reduce((b, i) => h2(i) > h2(b) ? i : b, list[0]);
 const withCost = verdict && live.every(i => finite(lcoh(i)));
 const ranking = [...live].sort((a, b) => withCost ? lcoh(a) - lcoh(b) || h2(b) - h2(a) : h2(b) - h2(a));
 let winner, kind, closeOnH2 = [];
 if (withCost && (verdict.clear || verdict.equivalent.length <= 1)) { winner = verdict.lowest; kind = 'duidelijk'; }
 else if (withCost) { winner = mostH2(verdict.equivalent); kind = 'gelijkwaardig'; }
 else { winner = mostH2(live); kind = 'waterstof'; }
 closeOnH2 = live.filter(i => i !== winner && Math.abs(h2(i) - h2(winner)) <= HYDROGEN_TIE * h2(winner));
 // The recommended setup leads; the rest keep their order (LCOH, otherwise hydrogen).
 return {winner, kind, ranking: [winner, ...ranking.filter(i => i !== winner)], closeOnH2, equivalent: withCost ? verdict.equivalent : [], dearer: withCost ? verdict.dearer : []};
}
