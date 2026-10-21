// Reading Waterstofatlas catalogue values (from /api/atlas/catalogue) into calculation fields with a visible status.
// quantity() and modulePower() follow datasheetextract/configurations.js; deliveryScope() follows selection-core.js;
// DISABLED_MANUFACTURERS follows core.js. Nothing here guesses a value from a range, a bound or an unclear basis.

export const ATLAS_URL = 'https://waterstofatlas.nl/#overzicht';
export const NM3_PER_KG = 11.12;   // Nm³ H₂ per kg at 0 °C and 1,013 bar
export const DISABLED_MANUFACTURERS = ['SANY', 'LONGi Hydrogen', 'Sungrow'];
// Catalogue fields this page reads; scope, stacks and partload are optional until the Atlas endpoint provides them.
export const USED_FIELDS = ['power', 'systemEnergy', 'stackEnergy', 'minimum', 'scope', 'stacks', 'partload', 'production', 'hotStart', 'coldStart', 'source'];
export const OPTIONAL_FIELDS = {scope: 'leveringstype (Leveringsomvang)', stacks: 'aantal stacks', partload: 'deellastcurve'};
export const STATUS = {bron: 'bron', afgeleid: 'afgeleid', standaard: 'standaard technologie', eigen: 'eigen invoer'};

const text = v => typeof v === 'string' ? v.trim() : '';
const num = s => Number(String(s).replace(',', '.'));
const dutch = (n, d = 3) => new Intl.NumberFormat('nl-NL', {maximumFractionDigits: d}).format(n);

// --- datasheetextract/configurations.js (overrides are not part of the endpoint)
export function quantity(raw, unit, allowRange = false) {
 const t = String(raw || '');
 const escaped = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
 const match = t.match(new RegExp('([<>≤≥]?\\s*≈?\\s*)(\\d+(?:[.,]\\d+)?)(?:\\s*([–—/\\-])\\s*(\\d+(?:[.,]\\d+)?))?\\s*' + escaped + '(?=\\s|[;(),]|$)', 'i'));
 if (!match) return null;
 if ((match[3] && !allowRange) || /[<>≤≥]/.test(match[1]) || /\b(?:tot|max\.?|min\.?|maximaal|minimaal)\s*(?:≈\s*)?$/i.test(t.slice(0, match.index))) return null;
 const lower = num(match[2]), upper = match[4] ? num(match[4]) : lower, value = allowRange ? Math.max(lower, upper) : lower;
 return Number.isFinite(value) && value > 0 && lower > 0 && upper > 0 ? {value, lower: Math.min(lower, upper), upper: Math.max(lower, upper), range: !!match[3], approximate: match[1].includes('≈'), raw: t, note: match[3] ? 'Berekend met de hoogste waarde van het vermogensbereik.' : ''} : null;
}
export function modulePower(model) {
 const raw = text(model?.values?.power);
 let power = quantity(raw, 'MW', true);
 if (model.manufacturer === 'Hydrogenera' || /^Plug GenEco (5|10) MW$/.test(model.name)) {
  const named = model.name.match(/(\d+(?:[.,]\d+)?)\s*(kW|MW)\b/);
  if (named) power = {value: num(named[1]) * (named[2] === 'kW' ? 0.001 : 1), raw, approximate: false, rule: true, note: 'Berekend met het maximale modulevermogen uit de modelnaam: ' + named[1] + ' ' + named[2] + '.'};
 }
 if (power && model.manufacturer === 'Oort Energy') {
  if (model.name === 'Oort Energy Theia') power = {...power, value: 1, rule: true, note: '1 MW nominaal per Theia-container; operationele bovengrens 1,5 MW. Meerdere containers kunnen worden gecombineerd.'};
  else if (model.name === 'Oort Energy Phaeton') power = {...power, value: 1, platformLimitMW: 20, rule: true, note: 'Rekenaanname: 1 MW per bouwsteen, maximaal 20 MW per Phaeton-platform. Meerdere platforms mogelijk; projectomvang niet begrensd op 20 MW.'};
  else if (model.name === 'Oort Energy Gaia' && power.range) power = {...power, value: power.lower, platformLimitMW: power.upper, rule: true, note: 'Volgens module-interpretatie: 0,25 MW per bouwsteen, maximaal 0,5 MW per Gaia-opstelling.'};
 }
 return power;
}
// --- datasheetextract/selection-core.js
export function deliveryScope(raw) {
 const t = String(raw || '').trim();
 if (/^(?:(?:volledig|losse|alleen)\s+)?(?:(?:PEM|SOEC|ALK|AEM)[-\s]*)?stack/i.test(t)) return {kind: 'stack', label: 'Losse stack', note: 'Stack of stackmodule; integratie met voeding, besturing en hulpapparatuur is nodig.'};
 if (/^procesmodule/i.test(t)) return {kind: 'module', label: 'Procesmodule', note: 'Procesmodule; aanvullende hulpinstallaties vallen buiten de genoemde module of zijn optioneel.'};
 if (/projectafhankelijk|configureerbaar/i.test(t)) return {kind: 'variable', label: 'Projectafhankelijk', note: 'De uitvoering wordt per project samengesteld. De offerte bepaalt of je een stack of een systeem krijgt.'};
 if (/systeem|system/i.test(t) && !/\bgeen\s+(?:compleet\s+)?(?:systeem|system)\b/i.test(t)) return {kind: 'system', label: 'Systeem', note: 'Als systeem aangeboden. De bronomschrijving bepaalt welke voeding, waterbehandeling en gaszuivering zijn inbegrepen.'};
 return {kind: 'unknown', label: /skid/i.test(t) ? 'Skid; scope onduidelijk' : 'Niet gespecificeerd', note: 'De bron maakt niet eenduidig duidelijk of je een losse stack of een systeem krijgt.'};
}
export const isDisabled = model => DISABLED_MANUFACTURERS.includes(model?.manufacturer);
export const isElectrolyser = model => (model?.category === undefined || model.category === 'Elektrolyser') && model?.technology !== 'Vermogenselektronica';

// Technology → standard values in TECHNOLOGIES (opsplitsing.py). Only PEM and alkaline exist there.
export function technologyProfile(technology) {
 if (technology === 'PEM') return {key: 'pem', status: 'bron', rule: 'Technologie PEM uit de catalogus.'};
 if (technology === 'Alkalisch') return {key: 'alkaline', status: 'bron', rule: 'Technologie alkalisch uit de catalogus.'};
 if (technology === 'Drukalkalisch') return {key: 'alkaline', status: 'afgeleid', aanname: true, rule: 'Drukalkalisch: gerekend met de alkaline-standaard, want opsplitsing.py kent geen aparte drukalkalische technologie.'};
 return {key: null, status: 'open', rule: `Voor ${technology || 'deze technologie'} staat geen standaard in opsplitsing.py. Kies zelf een rekenprofiel.`};
}

// --- strict single values for kWh/kg and minimum load

// kWh/kg: one leading value. Ranges, bounds, tolerances and labelled variants stay open with explicit candidates.
export function energyValue(raw) {
 const t = text(raw);
 if (!t) return {status: 'ontbreekt', raw: t, candidates: []};
 const plain = t.replace(/^(?:stack|systeem)\s*:\s*/i, '');
 const m = plain.match(/^(≈\s*)?(\d+(?:[.,]\d+)?)(?:\s*([–—-]|±)\s*(\d+(?:[.,]\d+)?))?\s*kWh\/kg/i);
 const numbers = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*kWh\/kg/gi)].map(x => num(x[1])).filter(v => v >= 20 && v <= 90);
 if (!m) return {status: 'open', raw: t, reason: /^[<>≤≥]|^tot\b|^max/i.test(plain) ? 'De bron geeft een grens, geen nominale waarde.' : 'Geen eenduidige waarde aan het begin van de brontekst.', candidates: [...new Set(numbers)]};
 const value = num(m[2]);
 if (m[3] === '±') return {status: 'open', raw: t, reason: `Waarde met marge (${m[2]} ± ${m[4]}): kies zelf of je de middenwaarde gebruikt.`, candidates: [value]};
 if (m[3]) return {status: 'open', raw: t, reason: `Bereik ${m[2]}–${m[4]} kWh/kg: wordt niet stilzwijgend één getal.`, candidates: [value, num(m[4])]};
 if (!(value >= 20 && value <= 90)) return {status: 'open', raw: t, reason: 'Waarde valt buiten 20–90 kWh/kg; controleer de bron.', candidates: []};
 if (m[1] || /berekend/i.test(t)) return {status: 'afgeleid', value, raw: t, rule: 'Door de Waterstofatlas berekend of benaderd (≈): ' + t};
 return {status: 'bron', value, raw: t};
}

// Minimum load as a fraction. Only an explicitly electrical basis counts as a source value; an unknown basis
// becomes a labelled assumption; a hydrogen-production basis or several values stay open.
export function minimumValue(raw) {
 const t = text(raw);
 if (!t) return {status: 'ontbreekt', raw: t, candidates: []};
 const values = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map(x => num(x[1]));
 const m = t.match(/^≈?\s*(\d+(?:[.,]\d+)?)\s*%/);
 const candidates = [...new Set(values.filter(v => v < 100))];
 if (!m || num(m[1]) > 100) return {status: 'open', raw: t, basis: 'onduidelijk', reason: 'Meerdere waarden of geen enkelvoudig percentage aan het begin.', candidates};
 const pct = num(m[1]);
 if (/per\s+(?:afzonderlijke\s+)?stack|max\.\s*\d+\s*h|daarna/i.test(t)) return {status: 'open', raw: t, basis: 'onduidelijk', reason: 'De minimumlast geldt voor een onderdeel of een beperkte tijd, niet voor de hele module.', candidates};
 if (/H[₂2]|productie|Nm³|Nm3|volumestroom|-flow|\bflow\b|stroom\s*\(|max\.\s*stroom/i.test(t)) return {status: 'open', raw: t, basis: 'waterstofproductie', reason: 'De minimumlast is uitgedrukt in waterstofproductie of stroomsterkte, niet als elektrisch vermogen.', candidates: [pct]};
 if (/elektrische last|stacklast|vermogensbereik|van het (?:elektrisch )?vermogen/i.test(t)) return {status: 'bron', value: pct / 100, raw: t, basis: 'elektrisch'};
 return {status: 'afgeleid', aanname: true, value: pct / 100, raw: t, basis: 'onbekend', rule: 'Referentiegrootheid niet vermeld: gelezen als percentage van het elektrisch vermogen (aanname).'};
}

// Which boundary the stated module power has: the whole system including BoP, or the stack only.
export function powerBoundary(rawPower, delivery, energy) {
 const t = text(rawPower), first = t.split(';')[0];
 if (/BoP\s*\+\s*stack|stack\s*\+\s*BoP|systeem|system|electrical loads|plant power|nominaal verbruik/i.test(first)) return {value: 'systeem', status: 'bron', rule: 'De bron noemt het vermogen van het systeem: ' + first.trim()};
 if (/stack/i.test(first) || /stacks? op DC|stackvoeding/i.test(t)) return {value: 'stack', status: 'bron', rule: 'De bron noemt het stackvermogen: ' + t};
 if (delivery?.kind === 'stack') return {value: 'stack', status: 'afgeleid', aanname: true, rule: 'Leveringstype Losse stack: vermogen gelezen als stackvermogen.'};
 if (energy.system.status === 'ontbreekt' && energy.stack.status !== 'ontbreekt') return {value: 'stack', status: 'afgeleid', aanname: true, rule: 'Alleen stackverbruik bekend: vermogen gelezen als stackvermogen.'};
 const current = acdc(rawPower).value;
 if (current === 'DC') return {value: 'stack', status: 'afgeleid', aanname: true, rule: 'DC-vermogen zonder verdere grens: gelezen als stackvermogen; gelijkrichter en BoP komen erbij.'};
 if (current === 'AC') return {value: 'systeem', status: 'afgeleid', aanname: true, rule: 'AC-vermogen zonder verdere grens: gelezen als systeemvermogen inclusief gelijkrichter en BoP.'};
 return {value: 'systeem', status: 'afgeleid', aanname: true, rule: 'Grens niet vermeld: vermogen gelezen als systeemvermogen inclusief BoP, dezelfde grens als het systeemverbruik in kWh/kg.'};
}
export function acdc(rawPower) {
 const t = text(rawPower);
 const derived = t.match(/\b(AC|DC)\b[^;]*afgeleid|afgeleid[^;]*\b(AC|DC)\b/);
 if (derived) return {value: derived[1] || derived[2], status: 'afgeleid', rule: t};
 if (/AC\/DC|niet expliciet/i.test(t)) return {value: null, status: 'open', rule: 'AC/DC niet vermeld in de bron.'};
 const m = t.match(/\b(AC|DC)\b/);
 return m ? {value: m[1], status: 'bron', rule: t} : {value: null, status: 'open', rule: 'AC/DC niet vermeld in de bron.'};
}

// Part-load curve such as "60–100%: 5,1; 30–60%: 5,3; 10–30%: 5,7 kWh/Nm³", converted to kWh/kg with NM3_PER_KG.
export function partLoadCurve(raw) {
 const t = text(raw);
 if (!t) return null;
 const unit = /kWh\/Nm³|kWh\/Nm3/i.test(t) ? 'Nm3' : /kWh\/kg/i.test(t) ? 'kg' : null;
 const bands = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*[–-]\s*(\d+(?:[.,]\d+)?)\s*%\s*:\s*(\d+(?:[.,]\d+)?)/g)].map(m => ({van: num(m[1]) / 100, tot: num(m[2]) / 100, waarde: num(m[3])}));
 if (!unit || bands.length < 2 || bands.some(b => !(b.tot > b.van))) return {raw: t, bands: [], usable: false, reason: 'Curve niet eenduidig te lezen.'};
 return {raw: t, unit, usable: true, bands: bands.map(b => ({...b, kWhPerKg: unit === 'Nm3' ? b.waarde * NM3_PER_KG : b.waarde}))};
}

// System kWh/kg at stack load x relative to full load, as implied by opsplitsing.py (BoP, Faraday loss, part-load gain).
export function modelCurveRatio(x, a) {
 const at = y => (y * (1 + a.bop_variabel) + a.bop_vast) * (1 - a.deellastvoordeel * (1 - y)) / (y * Math.max(1e-9, 1 - a.faradayverlies_10 * 0.1 / y));
 return at(x) / at(1);
}
// Fixed rule: the deellastvoordeel (0–30 %, step 0,1 %) whose model curve best matches the source bands relative to the top band.
export function fitPartLoadGain(curve, a) {
 const top = curve.bands.reduce((p, b) => b.tot > p.tot ? b : p);
 const mid = b => (b.van + b.tot) / 2;
 let best = null;
 for (let d = 0; d <= 0.3000001; d += 0.001) {
  const v = Math.round(d * 1000) / 1000, b2 = {...a, deellastvoordeel: v};
  const error = curve.bands.reduce((s, b) => s + (modelCurveRatio(mid(b), b2) / modelCurveRatio(mid(top), b2) - b.kWhPerKg / top.kWhPerKg) ** 2, 0);
  if (!best || error < best.error - 1e-15) best = {value: v, error};
 }
 const rms = Math.sqrt(best.error / curve.bands.length);
 return {...best, rms, atLimit: best.value === 0 || best.value === 0.3};
}

// One catalogue model read into displayable fields; no user choices yet.
export function interpretModel(model) {
 const v = model?.values || {}, has = key => Object.hasOwn(v, key);
 const power = modulePower(model), rawPower = text(v.power);
 let powerField;
 if (!rawPower && !power) powerField = {status: 'ontbreekt', raw: rawPower, candidates: []};
 else if (!power) powerField = {status: 'open', raw: rawPower, reason: /^\s*(?:tot|max|<|≤)/i.test(rawPower) || /[<≤]\s*≈?\s*\d/.test(rawPower) ? 'De bron geeft alleen een bovengrens, geen modulevermogen.' : 'Geen eenduidig modulevermogen in MW.', candidates: [...new Set([...rawPower.matchAll(/(\d+(?:[.,]\d+)?)\s*MW\b/gi)].map(x => num(x[1])).filter(x => x > 0))]};
 else if (power.rule) powerField = {status: 'afgeleid', value: power.value, raw: rawPower, rule: 'Vaste Atlas-regel (modulePower): ' + power.note, platformLimitMW: power.platformLimitMW};
 else if (power.range) powerField = {status: 'open', raw: rawPower, reason: `Bereik ${dutch(power.lower)}–${dutch(power.upper)} MW. De Atlas rekent bij het aantal units met de hoogste waarde; hier kies je zelf.`, candidates: [power.lower, power.upper]};
 else if (power.approximate || /berekend/i.test(rawPower)) powerField = {status: 'afgeleid', value: power.value, raw: rawPower, rule: 'Door de Waterstofatlas berekend of benaderd (≈): ' + rawPower};
 else powerField = {status: 'bron', value: power.value, raw: rawPower};
 const energy = {system: energyValue(v.systemEnergy), stack: energyValue(v.stackEnergy)};
 const delivery = has('scope') ? {...deliveryScope(v.scope), raw: text(v.scope), status: text(v.scope) ? 'bron' : 'ontbreekt'} : {kind: null, label: 'Niet in catalogus-endpoint', status: 'niet-in-endpoint', raw: ''};
 const stacks = has('stacks') ? {raw: text(v.stacks), status: text(v.stacks) ? 'bron' : 'ontbreekt'} : {raw: '', status: 'niet-in-endpoint'};
 const partload = has('partload') ? partLoadCurve(v.partload) : undefined;
 return {
  id: model.id, name: model.name, manufacturer: model.manufacturer, technology: model.technology,
  disabled: isDisabled(model), electrolyser: isElectrolyser(model),
  power: powerField, boundary: powerBoundary(rawPower, delivery, energy), acdc: acdc(rawPower),
  systemEnergy: energy.system, stackEnergy: energy.stack, minimum: minimumValue(v.minimum),
  delivery, stacks, partload, profile: technologyProfile(model.technology),
  production: text(v.production), hotStart: text(v.hotStart), coldStart: text(v.coldStart), source: text(v.source),
  provenance: model.provenance || {}, url: typeof model.url === 'string' && /^https:\/\/(?:www\.)?waterstofatlas\.nl\//.test(model.url) ? model.url : ATLAS_URL,
 };
}

// Fields the endpoint does not deliver for any model: needed extensions of the Atlas endpoint.
export function missingEndpointFields(models) {
 const keys = new Set(models.flatMap(m => Object.keys(m?.values || {})));
 const missing = Object.entries(OPTIONAL_FIELDS).filter(([key]) => !keys.has(key)).map(([key, label]) => ({key, label}));
 if (!models.some(m => typeof m?.url === 'string')) missing.push({key: 'url', label: 'directe link per model'});
 if (!models.some(m => m?.category !== undefined)) missing.push({key: 'category', label: 'categorie (elektrolyser of voeding)'});
 return missing;
}

export function catalogueModels(catalogue) {
 const all = (catalogue?.models || []).map(interpretModel);
 return {models: all.filter(m => m.electrolyser && !m.disabled), excluded: all.filter(m => m.disabled), other: all.filter(m => !m.electrolyser && !m.disabled)};
}
