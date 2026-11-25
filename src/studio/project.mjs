// Projectstudio (C4): het project als gegevens, gedeeld door browser en worker.
// R2: studio/v1/projects/<id>.json en studio/v1/projects/index.json (zie server.mjs). Bolsward is vast en staat niet in R2.
import stationCatalog from '../stations.json' with { type: 'json' };
import { defaultGeneral, inputHash, newSetup } from '../electrolyser-setup.mjs';
import { bolswardParks, YEARS } from './supply.mjs';
import { parkMW } from './park-model.mjs';

export const PROJECT_VERSION = 1, MAX_PARKS = 20, MAX_VARIANTS = 12, ID_PATTERN = /^[a-z2-7]{12}$/;
export const BOLSWARD_LOCATION = { lat: 53.066, lon: 5.531 };
export const BOLSWARD = Object.freeze({
  versie: PROJECT_VERSION, id: 'bolsward', naam: 'Bolsward', gemaakt: null, gewijzigd: null, vast: true,
  locatie: BOLSWARD_LOCATION, varianten: [newSetup('v1'), newSetup('v2')], referentie: 0, parken: bolswardParks(), jaren: [...YEARS], algemeen: defaultGeneral(),
});
export function newProjectId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567', bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, b => alphabet[b & 31]).join('');
}
export const blankProject = () => ({ ...structuredClone(BOLSWARD), id: '', naam: 'Nieuw project', vast: false, parken: [], locatie: null });

const nl = (v, d = 1) => v.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
export const stationName = id => stationCatalog.find(s => s.id === id)?.name || id;
// De parkkeuze die het aanbod bepaalt; twee projecten met dezelfde keuze delen de cache van de rekenkern.
// Het aanbod wordt altijd voor alle windjaren berekend; de jaarkeuze in Vergelijken verandert het profiel dus niet.
export const supplyConfig = project => ({ parken: project.parken.filter(p => p.aandeel > 0).map(p => ({ id: p.id, aandeel: p.aandeel, stations: p.stations, turbines: p.turbines, rated_kw: p.rated_kw, hub_height_m: p.hub_height_m, wake_pct: p.wake_pct, curve: p.curve, hoogte: p.hoogte, lat: p.lat, lon: p.lon })) });
export const studioProfile = project => 'studio:' + inputHash(supplyConfig(project));
export function studioWindText(project) {
  const loc = project.locatie ? `elektrolyser op ${nl(project.locatie.lat, 3)}° N ${nl(project.locatie.lon, 3)}° E` : 'elektrolyser zonder locatie';
  const parks = project.parken.filter(p => p.aandeel > 0).map(p => `${p.naam} ${nl(p.aandeel * parkMW(p))} MW van ${nl(parkMW(p))} MW (${nl(p.aandeel * 100, 0)} %), KNMI ${p.stations.map(stationName).join(' + ')}${p.stations.length > 1 ? ' (gemiddelde)' : ''}, ${p.hoogte === 'wins50' ? 'hoogtevertaling WINS50' : `seizoens-α naar ${p.hub_height_m} m (aanname)`}${p.curve === 'standaard' ? ', standaardcurve (aanname)' : ''}`);
  return `${loc}; ${parks.join('; ')}. Windjaren ${project.jaren.join(', ')}, KNMI-tienminutenwaarden.`;
}

// Controle van een project uit de browser of uit R2; geeft een schone kopie of gooit een fout.
const finite = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const text = (v, max) => typeof v === 'string' && v.length <= max;
export function validateProject(input) {
  const fail = why => { throw Error('Ongeldig project: ' + why); };
  if (!input || typeof input !== 'object') fail('geen object');
  if (!text(input.naam, 120) || !input.naam.trim()) fail('naam');
  if (input.locatie !== null && !(finite(input.locatie?.lat, 50, 54) && finite(input.locatie?.lon, 3, 7.5))) fail('locatie');
  if (!Array.isArray(input.parken) || input.parken.length > MAX_PARKS) fail('parken');
  const parken = input.parken.map(p => {
    if (!text(p.id, 40) || !text(p.naam, 200) || !finite(p.lat, 50, 56) || !finite(p.lon, 2, 8)) fail('park');
    if (!finite(p.turbines, 1, 1000) || !finite(p.rated_kw, 100, 20000) || !finite(p.hub_height_m, 20, 250) || !finite(p.wake_pct, 0, 30) || !finite(p.aandeel, 0, 1)) fail('parkgegevens van ' + p.naam);
    if (!['fryslan', 'beabuorren', 'standaard'].includes(p.curve) || !['wins50', 'alpha'].includes(p.hoogte)) fail('curve of hoogte');
    if (!Array.isArray(p.stations) || p.stations.length > 6 || !p.stations.every(id => stationCatalog.some(s => s.id === id))) fail('stations van ' + p.naam);
    const herkomst = Object.fromEntries(Object.entries(p.herkomst || {}).filter(([k, v]) => text(k, 30) && text(v, 20)));
    return { id: p.id, naam: p.naam, plaats: text(p.plaats, 120) ? p.plaats : '', gemeente: text(p.gemeente, 120) ? p.gemeente : '', lat: p.lat, lon: p.lon, turbines: p.turbines, rated_kw: p.rated_kw, hub_height_m: p.hub_height_m, wake_pct: p.wake_pct, curve: p.curve, hoogte: p.hoogte, aandeel: p.aandeel, stations: [...p.stations], herkomst, ...(p.model && text(p.model, 120) ? { model: p.model } : {}) };
  });
  if (!Array.isArray(input.varianten) || input.varianten.length > MAX_VARIANTS) fail('varianten');
  const varianten = input.varianten.map(v => {
    if (!text(v.id, 40) || !text(v.modelId ?? '', 200) || !finite(v.modules, 1, 200)) fail('variant');
    return { id: v.id, modelId: v.modelId || '', modules: Math.round(v.modules), choices: v.choices && typeof v.choices === 'object' && JSON.stringify(v.choices).length < 20000 ? v.choices : {} };
  });
  const jaren = Array.isArray(input.jaren) ? YEARS.filter(y => input.jaren.includes(y)) : [...YEARS];
  const algemeen = input.algemeen && typeof input.algemeen === 'object' && JSON.stringify(input.algemeen).length < 20000 ? input.algemeen : defaultGeneral();
  return { versie: PROJECT_VERSION, id: input.id, naam: input.naam.trim(), gemaakt: input.gemaakt ?? null, gewijzigd: input.gewijzigd ?? null, locatie: input.locatie, varianten, referentie: Number.isInteger(input.referentie) ? input.referentie : 0, parken, jaren: jaren.length ? jaren : [...YEARS], algemeen };
}
