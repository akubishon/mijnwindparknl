// Windprofielen voor Vergelijken, dezelfde vier als in /opsplitsing (browser-runtime.py). De jaarreeks bevat per tien minuten
// ook de stationswind; de andere profielen worden daaruit berekend met de windstappen van knmi.mjs (WINS50-maandfactor of
// seizoens-α, turbinecurve, zog). tests/electrolyser-wind.test.mjs vergelijkt de uitkomst met de Python-route.
import {modelOptions, windPowerModel} from './knmi.mjs';

export const DEFAULT_WIND_PROFILE = 'onafhankelijk';
// Naam, uitleg en kanttekening zoals wind_meta() in browser-runtime.py; de test bewaakt dat ze gelijk blijven.
export const WIND_PROFILES = {
 onafhankelijk: {naam: 'Productie-onafhankelijk (standaard)', uitleg: 'Productie-onafhankelijk: gemiddelde van Houtribdijk en Stavoren, hoogtevertaling uit WINS50 (HARMONIE) op de parklocatie', let_op: ''},
 productie_houtribdijk: {naam: 'Oud dagprofiel: Houtribdijk', uitleg: 'Oud dagprofiel: Houtribdijk met seizoens-α geijkt op productie van Windpark Fryslân', let_op: ''},
 productie_hoogste: {naam: 'Oude opsplitsing: hoogste station', uitleg: 'Oude opsplitsing: hoogste van Houtribdijk en Stavoren met seizoens-α geijkt op productie', let_op: 'Alleen momenten waarop beide stations meten; de oorspronkelijke reeks nam ook momenten met één station mee.'},
 gemeten_dagproductie: {naam: 'Geschaald naar gemeten dagproductie', uitleg: 'Geschaald naar gemeten dagproductie: de modelvorm van Windpark Fryslân, per kalenderdag gelijk aan de gemeten dagproductie en begrensd op het parkvermogen; Beabuorren blijft gemodelleerd', let_op: 'Dagen zonder meting vallen weg. Beabuorren heeft geen productiemetingen en blijft gemodelleerd.'},
};
const SHARE = {fryslan: 0.1, beabuorren: 1.0};   // HYDROGEN_SHARE in application.py
const FRYSLAN_CAP_MW = 89 * 4300 / 1000;          // 89 turbines × 4,3 MW
// Stationswind op 10 m per park, zoals windbron.select met METHODS in windbron.py.
const WIND = {
 onafhankelijk: {fryslan: (h, s) => (h + s) / 2, beabuorren: (h, s) => (h + s) / 2, hoogte: 'wins50'},
 productie_houtribdijk: {fryslan: h => h, beabuorren: (h, s) => s, hoogte: 'alpha'},
 productie_hoogste: {fryslan: (h, s) => Math.max(h, s), beabuorren: (h, s) => s, hoogte: 'alpha'},
};
WIND.gemeten_dagproductie = WIND.onafhankelijk;

// round(x, 4) van Python: correct afgerond, bij een exacte helft naar even (alleen mogelijk als x · 32 oneven geheel is).
function round4(x) {
 const t = x * 32;
 if (Number.isInteger(t) && Math.abs(t % 2) === 1) { const low = Math.floor(x * 10000); return (low % 2 === 0 ? low : low + 1) / 10000; }
 return Number(x.toFixed(4));
}
// Kalenderdag in Europe/Amsterdam; binnen een UTC-uur verandert die niet.
const LOCAL = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit'});
const days = new Map();
export function localDay(seconds) {
 const hour = Math.floor(seconds / 3600);
 let day = days.get(hour);
 if (!day) { day = LOCAL.format(new Date(hour * 3600000)); days.set(hour, day); }
 return day;
}
// Lengte van de kalenderdag in uren: 23, 24 of 25.
const midnight = day => { const base = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 1000; let t = base - 3 * 3600; while (localDay(t) !== day) t += 3600; return t; };
export const dayHours = day => (midnight(new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)) - midnight(day)) / 3600;

// Gemeten dagproductie van Windpark Fryslân (productie_fryslan.csv) in MWh, zoals productie.load(): lege waarden ontbreken.
export function parseProduction(text) {
 const out = new Map();
 for (const line of text.split(/\r?\n/).slice(1)) {
  const [day, kwh] = line.split(',');
  if (day && kwh !== undefined && kwh.trim() !== '' && kwh.trim() !== 'None') out.set(day, Number(kwh) / 1000);
 }
 return out;
}

// Aanbod {jaar, t, mw} voor dit profiel: 10 % Fryslân + heel Beabuorren. De standaard is de meegeleverde reeks zelf.
export function profileSupply(data, profile = DEFAULT_WIND_PROFILE, production = null) {
 if (!WIND_PROFILES[profile]) throw Error(`Onbekend windprofiel: ${profile}.`);
 if (profile === DEFAULT_WIND_PROFILE) return {jaar: data.jaar, t: data.t, mw: data.mw};
 if (!data.stations?.houtribdijk || !data.stations?.stavoren) throw Error(`Windjaar ${data.jaar} bevat geen stationswind.`);
 const rule = WIND[profile], {houtribdijk: h, stavoren: s} = data.stations;
 const options = {fryslan: modelOptions(new URLSearchParams({park: 'fryslan', hoogte: rule.hoogte})), beabuorren: modelOptions(new URLSearchParams({park: 'beabuorren', hoogte: rule.hoogte}))};
 const models = new Map();
 const power = (park, day, v) => { const key = park + day; if (!models.has(key)) models.set(key, windPowerModel(day, options[park])); return models.get(key)(v); };
 const t = [], fryslan = [], beabuorren = [];
 for (let i = 0; i < data.t.length; i++) {
  if (h[i] == null || s[i] == null) continue;
  const day = localDay(data.t[i]);
  t.push(data.t[i]);
  fryslan.push(power('fryslan', day, rule.fryslan(h[i], s[i])));
  beabuorren.push(power('beabuorren', day, rule.beabuorren(h[i], s[i])));
 }
 let keep = t.map((_, i) => i), parkF = fryslan;
 if (profile === 'gemeten_dagproductie') {
  if (!production) throw Error('Voor dit windprofiel zijn de productiegegevens van Windpark Fryslân nodig.');
  // Per dag: gemiddeld vermogen over de aanwezige momenten = gemeten MWh / uren van de dag. Dagen zonder meting vallen weg.
  const sums = new Map();
  t.forEach((stamp, i) => { const day = localDay(stamp), e = sums.get(day) || [0, 0]; e[0] += fryslan[i]; e[1] += 1; sums.set(day, e); });
  const factor = new Map();
  for (const [day, [total, n]] of sums) if (production.has(day) && total > 0) factor.set(day, production.get(day) * n / (dayHours(day) * total));
  keep = keep.filter(i => factor.has(localDay(t[i])));
  parkF = fryslan.map((v, i) => factor.has(localDay(t[i])) ? Math.min(FRYSLAN_CAP_MW, v * factor.get(localDay(t[i]))) : null);
 }
 return {jaar: data.jaar, t: keep.map(i => t[i]), mw: keep.map(i => { let total = 0; total += SHARE.fryslan * parkF[i]; total += SHARE.beabuorren * beabuorren[i]; return round4(total); }),
  park_mwh: {fryslan: keep.reduce((a, i) => a + parkF[i], 0) / 6, beabuorren: keep.reduce((a, i) => a + beabuorren[i], 0) / 6}};
}

// Tekst voor de windreeks in Vergelijken en in de CSV.
export const windSeries = (profile = DEFAULT_WIND_PROFILE) => `Bruto toegewezen windaanbod uit /opsplitsing: 10 % Windpark Fryslân + 100 % Windpark Beabuorren, KNMI-tienminutenwaarden, jaarreeksen 2022–2025. Windprofiel: ${(WIND_PROFILES[profile] || WIND_PROFILES[DEFAULT_WIND_PROFILE]).uitleg}`;
