// Projectstudio (C3): meetstations (KNMI en buurlanden) voorstellen voor een park; de gebruiker kiest.
import { kmBetween } from './park-model.mjs';
import { YEARS } from './supply.mjs';

// Stations op zee (platforms, boeien, lichteilanden, windparken op zee).
const SEA = new Set(['06201', '06203', '06204', '06205', '06206', '06207', '06208', '06211', '06212', '06213', '06214', '06216', '06218', '06239', '06252', '06285', '06313', '06317', '06320', '06321'].map(n => '0-20000-0-' + n));
export const isSeaStation = id => SEA.has(id);
export const MIN_COVERAGE = 0.9, MAX_KM = 25;
// Dekking nog onbekend (station nog niet opgehaald) telt mee, met een waarschuwing.
const complete = s => YEARS.every(y => (s.dekking?.[y] ?? 1) >= MIN_COVERAGE);

export function rankStations(location, index) {
  return index.stations.filter(s => s.lat > 41 && s.lat < 58).map(s => ({ id: s.id, naam: s.naam, land: s.land || 'NL', bron: s.bron || 'knmi', meethoogte_m: s.meethoogte_m ?? 10, km: kmBetween(location, s), dekking: s.dekking || {}, gemiddeld_ms: s.gemiddeld_ms ?? null, zee: isSeaStation(s.id) })).sort((a, b) => a.km - b.km || a.naam.localeCompare(b.naam));
}

// Waarschuwingen voor een keuze van stations bij een park (op land).
export function stationWarnings(list, ids) {
  const out = [];
  for (const id of ids) {
    const s = list.find(x => x.id === id);
    if (!s) { out.push(`Station ${id} staat niet in de index.`); continue; }
    if (s.km > MAX_KM) out.push(`${s.naam} ligt ${Math.round(s.km)} km van het park (meer dan ${MAX_KM} km).`);
    const low = YEARS.filter(y => s.dekking[y] !== undefined && s.dekking[y] < MIN_COVERAGE), unknown = YEARS.filter(y => s.dekking[y] === undefined);
    if (low.length) out.push(`${s.naam} heeft minder dan 90 % dekking in ${low.join(', ')}.`);
    if (unknown.length) out.push(`Dekking van ${s.naam} is nog niet bekend voor ${unknown.join(', ')} (data nog niet opgehaald).`);
    if (s.zee) out.push(`${s.naam} is een station op zee; de wind daar is hoger dan op land.`);
  }
  return out;
}

export function suggestStations(location, index) {
  const lijst = rankStations(location, index), usable = lijst.filter(complete);
  const enkel = usable[0] ? [usable[0].id] : [];
  const paar = usable[1] && usable[1].km <= MAX_KM ? [usable[0].id, usable[1].id] : null;
  const waarschuwingen = enkel.length ? stationWarnings(lijst, enkel) : ['Geen station met minstens 90 % dekking in elk windjaar.'];
  return { lijst, voorstel: { enkel, paar }, waarschuwingen };
}
