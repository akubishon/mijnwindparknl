// Onbalans als opbrengstregel: wat levert het op als de elektrolyser in kwartieren met een negatieve onbalansprijs van
// TenneT extra stroom van het net afneemt, tot vollast van de modules die al draaien? De kern (simulate) legt per maand
// en per prijsband vast hoeveel extra stroom dat is, wat het oplevert (−prijs × energie) en hoeveel extra waterstof.
// Hier gaan de netkosten en energiebelasting van de vergelijking eraf: een kwartier telt alleen mee als de prijs
// zo negatief is dat de afnemer na die heffingen nog geld krijgt. Achteraf bekende prijzen: dit is een bovengrens.
import {IMBALANCE_EDGES} from './electrolyser-kernel.mjs';

// Windjaren met een volledig prijsbestand (src/opsplitsing/data/onbalans-<jaar>.json, scripts/update-onbalans.mjs).
export const IMBALANCE_YEARS = [2024];
export const IMBALANCE_YEAR = 2024;
export const imbalanceFile = year => `/opsplitsing-assets/data/onbalans-${year}.json`;
export const validPrices = d => !!d && Number.isInteger(d.jaar) && Number.isFinite(d.start) && d.stap === 900 && Array.isArray(d.prijs) && d.prijs.length > 0;
export const withPrices = (supply, prices) => prices ? {...supply, onbalans: prices} : supply;

const levies = a => Math.max(0, a.netkosten_eur_mwh + a.belasting_eur_mwh - a.korting_net_belasting_eur_mwh);

// result: kernel result for the price year (with result.onbalans); a: cost assumptions (setupCosts().a);
// base: economics(result, a) for the same year, from electrolyser-economics.mjs.
export function imbalanceValue(result, a, base) {
 const ob = result?.onbalans;
 if (!ob || !a || !base) return null;
 const L = levies(a), scale = result.extra?.schaal ?? 1;
 // Band b holds prices from IMBALANCE_EDGES[b − 1] up to IMBALANCE_EDGES[b]: it counts when its upper edge is at most −L.
 const counted = IMBALANCE_EDGES.map(edge => edge <= -L + 1e-9);
 const threshold = Math.max(...IMBALANCE_EDGES.filter((edge, b) => counted[b]), -Infinity);
 const months = ob.e_mwh.map((row, m) => {
  let mwh = 0, gross = 0, kg = 0;
  row.forEach((e, b) => { if (counted[b]) { mwh += e; gross += ob.opbrengst_eur[m][b]; kg += ob.kg[m][b]; } });
  return {mwh: mwh * scale, bruto_eur: gross * scale, netto_eur: (gross - L * mwh) * scale, kg: kg * scale, uur_negatief: ob.uur_negatief_per_maand[m] * scale};
 });
 const sum = key => months.reduce((s, m) => s + m[key], 0);
 const all = ob.e_mwh.flat().reduce((s, v) => s + v, 0) * scale;
 const kg = result.waterstof_t * 1000;
 const netto = sum('netto_eur'), extraKg = sum('kg');
 return {
  jaar: ob.jaar, bron: ob.bron, heffingen_eur_mwh: L, drempel_eur_mwh: Number.isFinite(threshold) ? threshold : null,
  mwh: sum('mwh'), mwh_alle_negatieve: all, kg: extraKg, bruto_eur: sum('bruto_eur'), netto_eur: netto, maanden: months,
  uur_met_prijs: ob.uur_met_prijs * scale, uur_negatief: ob.uur_negatief * scale, uur_negatief_in_bedrijf: ob.uur_negatief_in_bedrijf * scale,
  belasting_negatief: ob.belasting_negatief, belasting_met_prijs: ob.belasting_met_prijs, aanbod_negatief_mw: ob.aanbod_negatief_mw, aanbod_met_prijs_mw: ob.aanbod_met_prijs_mw, vollast_mw: ob.vollast_mw,
  lcoh_eur_kg: base.lcoh_eur_kg, lcoh_met_eur_kg: kg + extraKg > 0 ? (base.kosten_meur_jaar * 1e6 - netto) / (kg + extraKg) : null,
 };
}

// The fields the comparison table shows; the same 2024 values in the mean column and the 2024 column.
export const imbalanceMetrics = v => v ? {
 onbalans_mwh: v.mwh, onbalans_kg: v.kg, onbalans_meur_jaar: v.netto_eur / 1e6, lcoh_2024_eur_kg: v.lcoh_eur_kg, lcoh_2024_onbalans_eur_kg: v.lcoh_met_eur_kg,
} : {onbalans_mwh: null, onbalans_kg: null, onbalans_meur_jaar: null, lcoh_2024_eur_kg: null, lcoh_2024_onbalans_eur_kg: null};
