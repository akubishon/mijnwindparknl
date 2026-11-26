// Onbalans als opbrengstregel: wat levert het op als de elektrolyser in kwartieren met een negatieve onbalansprijs
// (ENTSO-E Transparency Platform, per biedzone; in Nederland die van TenneT) extra stroom van het net afneemt, tot vollast van de modules die al draaien? De kern (simulate) legt per maand
// en per prijsband vast hoeveel extra stroom dat is, wat het oplevert (−prijs × energie) en hoeveel extra waterstof.
// Hier gaan de netkosten en energiebelasting van de vergelijking eraf: een kwartier telt alleen mee als de prijs
// zo negatief is dat de afnemer na die heffingen nog geld krijgt. Achteraf bekende prijzen: dit is een bovengrens.
import {IMBALANCE_EDGES} from './electrolyser-kernel.mjs';

// Windjaren met een volledig prijsbestand (src/opsplitsing/data/onbalans-<jaar>.json en onbalans-<zone>-<jaar>.json, scripts/update-onbalans.mjs).
export const IMBALANCE_YEARS = [2024, 2025];
// "2024–2025" voor de labels in de tabel.
export const IMBALANCE_SPAN = IMBALANCE_YEARS.length > 1 ? `${IMBALANCE_YEARS[0]}–${IMBALANCE_YEARS.at(-1)}` : String(IMBALANCE_YEARS[0]);
// Biedzones met onbalansprijzen van het ENTSO-E Transparency Platform (scripts/update-onbalans.mjs). Nederland houdt de
// oude bestandsnaam onbalans-<jaar>.json; de andere zones onbalans-<zone>-<jaar>.json. Luxemburg heeft geen eigen
// onbalansprijs op ENTSO-E en zit met Duitsland in biedzone DE-LU: daar gelden de Duitse prijzen als benadering.
export const IMBALANCE_ZONES = Object.freeze({
 NL: {eic: '10YNL----------L', tso: 'TenneT', naam: 'Nederland'},
 BE: {eic: '10YBE----------2', tso: 'Elia', naam: 'België'},
 DE: {eic: '10Y1001A1001A83F', tso: 'Duitse netbeheerders, reBAP', naam: 'Duitsland'},
 FR: {eic: '10YFR-RTE------C', tso: 'RTE', naam: 'Frankrijk'},
 DK1: {eic: '10YDK-1--------W', tso: 'Energinet', naam: 'West-Denemarken (DK1)'},
 DK2: {eic: '10YDK-2--------M', tso: 'Energinet', naam: 'Oost-Denemarken (DK2)'},
 LU: {eic: null, als: 'DE', tso: 'Duitse netbeheerders, reBAP (benadering)', naam: 'Luxemburg'},
});
// Land van de elektrolyser → zone met prijsbestand. Denemarken: west van de Grote Belt (Jutland, Funen) is DK1.
export function imbalanceZone(land, lon) {
 if (land === 'DK') return lon < 10.95 ? 'DK1' : 'DK2';
 return IMBALANCE_ZONES[land] ? land : 'NL';
}
const fileZone = zone => IMBALANCE_ZONES[zone]?.als || zone || 'NL';
export const imbalanceFile = (year, zone = 'NL') => fileZone(zone) === 'NL' ? `/opsplitsing-assets/data/onbalans-${year}.json` : `/opsplitsing-assets/data/onbalans-${fileZone(zone)}-${year}.json`;
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
  jaar: ob.jaar, bron: ob.bron, zone: ob.zone || 'NL', heffingen_eur_mwh: L, drempel_eur_mwh: Number.isFinite(threshold) ? threshold : null,
  mwh: sum('mwh'), mwh_alle_negatieve: all, kg: extraKg, bruto_eur: sum('bruto_eur'), netto_eur: netto, maanden: months,
  uur_met_prijs: ob.uur_met_prijs * scale, uur_negatief: ob.uur_negatief * scale, uur_negatief_in_bedrijf: ob.uur_negatief_in_bedrijf * scale,
  belasting_negatief: ob.belasting_negatief, belasting_met_prijs: ob.belasting_met_prijs, aanbod_negatief_mw: ob.aanbod_negatief_mw, aanbod_met_prijs_mw: ob.aanbod_met_prijs_mw, vollast_mw: ob.vollast_mw,
  kosten_eur: base.kosten_meur_jaar * 1e6, kg_basis: kg,
  lcoh_eur_kg: base.lcoh_eur_kg, lcoh_met_eur_kg: kg + extraKg > 0 ? (base.kosten_meur_jaar * 1e6 - netto) / (kg + extraKg) : null,
 };
}

// The years with prices together (values from imbalanceValue, nulls skipped): energy, hydrogen and revenue as the mean
// per year; the LCOH with and without imbalance from the summed costs and hydrogen of those years.
export function imbalanceMean(values) {
 const list = (values || []).filter(Boolean);
 if (!list.length) return null;
 const mean = key => list.reduce((s, v) => s + v[key], 0) / list.length;
 const costs = mean('kosten_eur'), kg = mean('kg_basis'), extra = mean('kg'), netto = mean('netto_eur');
 return {jaren: list.map(v => v.jaar), mwh: mean('mwh'), kg: extra, netto_eur: netto,
  lcoh_eur_kg: kg > 0 ? costs / kg : null, lcoh_met_eur_kg: kg + extra > 0 ? (costs - netto) / (kg + extra) : null};
}

// The fields the comparison table shows: per wind year that year's values, in the mean column imbalanceMean().
export const imbalanceMetrics = v => v ? {
 onbalans_mwh: v.mwh, onbalans_kg: v.kg, onbalans_meur_jaar: v.netto_eur / 1e6, onbalans_lcoh_eur_kg: v.lcoh_eur_kg, onbalans_lcoh_met_eur_kg: v.lcoh_met_eur_kg,
} : {onbalans_mwh: null, onbalans_kg: null, onbalans_meur_jaar: null, onbalans_lcoh_eur_kg: null, onbalans_lcoh_met_eur_kg: null};
