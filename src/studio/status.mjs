// Projectstudio: status per stap (klaar, open, let op) en de open punten van een project.
// Eén bron voor de stappenrail, het projectoverzicht en de knop "Bereken aanbod".
import { parkMW } from './park-model.mjs';
import { rankStations, stationWarnings } from './stations.mjs';
import { stationName } from './project.mjs';

export const STEPS = [
  { key: 'locatie', label: 'Locatie' }, { key: 'elektrolyser', label: 'Elektrolyser' }, { key: 'parken', label: 'Windparken' },
  { key: 'stations', label: 'KNMI-stations' }, { key: 'aanbod', label: 'Beschikbaar vermogen' }, { key: 'vergelijken', label: 'LCOH vergelijken' },
];
const nl = (v, d = 1) => v.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const letter = i => String.fromCharCode(65 + i);

export const activeParks = project => project.parken.filter(p => p.aandeel > 0);
export const allocatedMW = project => activeParks(project).reduce((s, p) => s + p.aandeel * parkMW(p), 0);
// Het aanbod is te berekenen als er minstens één park vermogen levert en elk zo'n park een station heeft.
export const canComputeSupply = project => activeParks(project).length > 0 && activeParks(project).every(p => p.stations.length > 0);
// Waarschuwingen over nog niet opgehaalde dekking zijn informatie: dat geldt voor elk station dat nog nooit is gebruikt.
const isInfo = text => /nog niet bekend/.test(text);

// Waarschuwingen bij de stationskeuze van één park.
export function parkStationNotes(park, index) {
  if (!park.stations.length) return [{ level: 'let', text: 'kies een KNMI-station' }];
  if (!index) return [];
  return stationWarnings(rankStations(park, index), park.stations).map(text => ({ level: isInfo(text) ? 'info' : 'let', text }));
}

// `data`: {resolved: resolveSetup() per variant, index: stationsindex, supply: {ready, vollasturen, error}, compared: boolean}.
// Geeft {steps: [{key, label, status: 'klaar'|'open'|'let', summary, count}], issues: [{step, level, text}], done}.
export function stepStatus(project, data = {}) {
  const { resolved = [], index = null, supply = null, compared = false } = data;
  const issues = [], steps = [], add = (step, level, text) => issues.push({ step, level, text });

  // 1. Locatie
  steps.push(project.locatie ? { status: 'klaar', summary: project.plaats || `${nl(project.locatie.lat, 3)}° N ${nl(project.locatie.lon, 3)}° E` } : { status: 'open', summary: 'Nog geen locatie' });
  if (!project.locatie) add(0, 'let', 'Kies de plek van de elektrolyser.');

  // 2. Elektrolyser
  const withModel = project.varianten.filter(v => v.modelId).length, ready = resolved.filter(r => r?.ready);
  project.varianten.forEach((v, i) => { const r = resolved[i]; if (!r?.ready) add(1, 'let', `Variant ${letter(i)}: ${v.modelId ? (r?.problems?.[0] || 'open punten') : 'kies een model'}.`); });
  const mw = ready.map(r => r.nominalMW).filter(Number.isFinite), range = mw.length ? (Math.min(...mw) === Math.max(...mw) ? nl(mw[0], 0) : `${nl(Math.min(...mw), 0)}–${nl(Math.max(...mw), 0)}`) + ' MW' : '';
  const variants = `${project.varianten.length} ${project.varianten.length === 1 ? 'variant' : 'varianten'}`;
  steps.push(!withModel ? { status: 'open', summary: 'Nog geen model gekozen' } : ready.length === project.varianten.length ? { status: 'klaar', summary: `${variants} · ${range}` } : { status: 'let', summary: `${ready.length} van ${project.varianten.length} klaar` });

  // 3. Windparken
  const active = activeParks(project), allocated = allocatedMW(project);
  for (const p of project.parken) if (!(p.aandeel > 0)) add(2, 'info', `${p.naam} levert 0 MW en telt niet mee.`);
  if (!project.parken.length) add(2, 'let', 'Kies minstens één windpark.');
  else if (!active.length) add(2, 'let', 'Geef minstens één park vermogen voor de elektrolyser.');
  steps.push(active.length ? { status: 'klaar', summary: `${nl(allocated)} MW uit ${active.length} ${active.length === 1 ? 'park' : 'parken'}` } : { status: project.parken.length ? 'let' : 'open', summary: project.parken.length ? 'Nog geen vermogen' : 'Nog geen parken' });

  // 4. KNMI-stations
  let missing = 0;
  for (const p of active) for (const note of parkStationNotes(p, index)) { if (note.text === 'kies een KNMI-station') missing++; add(3, note.level, `${p.naam.replace(/^Windpark /, '')}: ${note.text}`); }
  const warnings = issues.filter(x => x.step === 3 && x.level === 'let').length, ids = [...new Set(active.flatMap(p => p.stations))];
  steps.push(!active.length ? { status: 'open', summary: 'Kies eerst windparken' }
    : missing === active.length ? { status: 'open', summary: 'Nog geen stations' }
    : warnings ? { status: 'let', summary: `${warnings} ${warnings === 1 ? 'waarschuwing' : 'waarschuwingen'}` }
    : { status: 'klaar', summary: ids.length <= 2 ? ids.map(stationName).join(' + ') : `${ids.length} stations` });

  // 5. Beschikbaar vermogen
  if (supply?.error) add(4, 'let', supply.error);
  steps.push(supply?.ready ? { status: 'klaar', summary: `${nl(supply.vollasturen, 0)} vollasturen` }
    : supply?.error ? { status: 'let', summary: 'Berekening mislukt' }
    : { status: 'open', summary: canComputeSupply(project) ? 'Nog niet berekend' : 'Eerst parken en stations' });

  // 6. Vergelijken
  if (supply?.ready && !compared && ready.length >= 2) add(5, 'info', 'Vergelijken nog niet bekeken.');
  steps.push(compared ? { status: 'klaar', summary: `${ready.length} varianten vergeleken` } : { status: 'open', summary: ready.length < 2 ? 'Minstens 2 varianten nodig' : 'Nog niet bekeken' });

  const out = steps.map((s, i) => ({ ...STEPS[i], ...s, count: issues.filter(x => x.step === i && x.level === 'let').length }));
  return { steps: out, issues, done: out.filter(s => s.status === 'klaar').length };
}

// Kort oordeel voor de projectenlijst (server): is alles gekozen om te rekenen?
export function projectComplete(project) {
  return Boolean(project.locatie) && canComputeSupply(project) && project.varianten.some(v => v.modelId);
}
