// Projectstudio (C2): aanbod per tien minuten voor een jaar, uit de gekozen parken en stations.
// Zelfde vorm als src/opsplitsing/data/20xx.json, zodat de rekenkern het zonder aanpassing leest.
import { parkPowerAt, parkMW, KNOWN, HOUTRIBDIJK, STAVOREN } from './park-model.mjs';

export const YEARS = [2022, 2023, 2024, 2025];
const round = (v, digits) => Number(v.toFixed(digits));

// Tijdas van een windjaar: KNMI-tijdstempels −5 minuten over het Nederlandse kalenderjaar (zoals knmi.py).
export function yearAxis(year) {
  // 1 januari valt altijd in de wintertijd (UTC+1).
  const begin = Date.UTC(year, 0, 1) / 1000 - 3600, end = Date.UTC(year + 1, 0, 1) / 1000 - 3600;
  return { start: begin + 300, n: (end - begin) / 600, step: 600 };
}

// `wind`: {stationId: Float64Array (m/s, NaN = ontbrekend)} op de as van yearAxis(jaar).
export function buildSupply({ jaar, parks, wind, axis = yearAxis(jaar) }) {
  const active = parks.filter(p => p.aandeel > 0);
  if (!active.length) throw Error('Kies minstens één park met vermogen voor de elektrolyser.');
  for (const p of active) {
    if (!p.stations?.length) throw Error(`Kies een KNMI-station voor ${p.naam}.`);
    for (const id of p.stations) if (!wind[id] || wind[id].length !== axis.n) throw Error(`Winddata ontbreekt voor station ${id} in ${jaar}.`);
  }
  const stationIds = [...new Set(active.flatMap(p => p.stations))];
  const power = Object.fromEntries(active.map(p => [p.id, parkPowerAt(p)]));
  const out = { jaar, methode: 'studio', t: [], mw: [], v10: {}, bron: [], stations: {}, park_mw: {}, park_mwh: {}, aandeel: {} };
  for (const p of active) { out.v10[p.id] = []; out.park_mw[p.id] = []; out.park_mwh[p.id] = 0; out.aandeel[p.id] = p.aandeel; }
  for (const id of stationIds) out.stations[id] = [];
  const bron = stationIds.length > 1 ? 'gemiddelde' : stationIds[0];
  for (let i = 0; i < axis.n; i++) {
    let complete = true;
    for (const id of stationIds) if (Number.isNaN(wind[id][i])) { complete = false; break; }
    if (!complete) continue;
    const t = axis.start + i * axis.step;
    let mw = 0;
    for (const p of active) {
      let sum = 0;
      for (const id of p.stations) sum += wind[id][i];
      const v10 = sum / p.stations.length, park = power[p.id](t, v10);
      out.v10[p.id].push(v10); out.park_mw[p.id].push(park); out.park_mwh[p.id] += park / 6;
      mw += p.aandeel * park;
    }
    out.t.push(t); out.mw.push(round(mw, 4)); out.bron.push(bron);
    for (const id of stationIds) out.stations[id].push(wind[id][i]);
  }
  return out;
}

// Kerngetallen voor stap 5: vollasturen, dekking en duurkromme.
export function supplySummary(supply, parks) {
  const allocated = parks.filter(p => p.aandeel > 0).reduce((s, p) => s + p.aandeel * parkMW(p), 0);
  const mwh = supply.mw.reduce((s, v) => s + v, 0) / 6, slots = yearAxis(supply.jaar).n;
  const sorted = Float64Array.from(supply.mw).sort().reverse(), duration = [];
  for (let k = 0; k <= 100; k++) duration.push(sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(k / 100 * (sorted.length - 1)))] : 0);
  return { jaar: supply.jaar, mwh, toegewezen_mw: allocated, vollasturen: allocated ? mwh / allocated * slots / Math.max(1, supply.mw.length) : 0, dekking: supply.mw.length / slots, momenten: supply.mw.length, duurkromme: duration };
}

// Startinstelling Bolsward: Fryslân 10 %, Beabuorren 100 %, Houtribdijk + Stavoren, WINS50.
export function bolswardParks() {
  return [
    { ...KNOWN.fryslan, aandeel: 0.1, stations: [HOUTRIBDIJK, STAVOREN], herkomst: { turbines: 'bron', rated_kw: 'bron', hub_height_m: 'bron', wake_pct: 'aanname' } },
    { ...KNOWN.beabuorren, aandeel: 1, stations: [HOUTRIBDIJK, STAVOREN], herkomst: { turbines: 'bron', rated_kw: 'bron', hub_height_m: 'bron', wake_pct: 'aanname' } },
  ];
}
