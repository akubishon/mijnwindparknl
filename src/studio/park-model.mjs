// Projectstudio (C2): één parkmodel voor elk windpark, in de browser en in de worker.
// Fryslân en Beabuorren rekenen exact zoals de opsplitsing (windbron.py, application.py) en knmi.mjs;
// andere parken krijgen de genormaliseerde SWT-DD-130-curve, de seizoens-α en 5 % zogverlies (aannames).
import fryslanCurve from '../opsplitsing/python/data/fryslan.json' with { type: 'json' };
import beabuorrenCurve from '../opsplitsing/python/data/beabuorren.json' with { type: 'json' };
import heightTable from '../opsplitsing/python/data/ashoogte.json' with { type: 'json' };

export const HOUTRIBDIJK = '0-20000-0-06258', STAVOREN = '0-20000-0-06267';
export const KNOWN = {
  fryslan: { id: 'fryslan', naam: 'Windpark Fryslân', turbines: 89, rated_kw: 4300, hub_height_m: 115, wake_pct: 5, curve: 'fryslan', hoogte: 'wins50', model: 'Siemens Gamesa SWT-DD-130' },
  beabuorren: { id: 'beabuorren', naam: 'Windpark Beabuorren', turbines: 8, rated_kw: 1300, hub_height_m: 60, wake_pct: 2, curve: 'beabuorren', hoogte: 'wins50', model: 'Siemens SWT-1.3-62' },
};
for (const id of Object.keys(KNOWN)) Object.assign(KNOWN[id], { lat: heightTable.locaties[id].latitude, lon: heightTable.locaties[id].longitude });
const CURVES = { fryslan: fryslanCurve, beabuorren: beabuorrenCurve, standaard: fryslanCurve };
const NOMINAL_KW = { fryslan: 4300, beabuorren: 1300, standaard: 4300 };
export const DEFAULT_ALPHA = 0.115, DEFAULT_ALPHA_SEASONAL = 0.065;

export const parkMW = park => park.turbines * park.rated_kw / 1000;
export const kmBetween = (a, b) => {
  const rad = v => v * Math.PI / 180, h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
// Standaard ashoogte voor een park zonder bron, naar turbinevermogen.
export const defaultHubHeight = ratedKW => ratedKW < 2000 ? 80 : ratedKW <= 4000 ? 100 : 120;

// OSM-park naar een studiopark. Het parkmidden binnen 2 km van Fryslân of Beabuorren geeft het bekende model.
export function parkFromFeature(feature) {
  const [lon, lat] = feature.geometry.coordinates, p = feature.properties || {};
  for (const known of Object.values(KNOWN)) if (kmBetween({ lat, lon }, known) <= 2) return { ...known, herkomst: { turbines: 'bron', rated_kw: 'bron', hub_height_m: 'bron', wake_pct: 'aanname' } };
  const turbines = Math.max(1, Math.round(Number(p.turbines) || 1));
  const mw = Number(p.mw) > 0 ? Number(p.mw) : null;
  const rated_kw = mw ? Math.round(mw * 1000 / turbines) : 3000;
  return {
    id: `osm:${lat.toFixed(4)},${lon.toFixed(4)}`, naam: p.naam || 'Windpark', plaats: p.plaats || '', gemeente: p.gemeente || '', land: p.land || 'NL', lat, lon,
    turbines, rated_kw, hub_height_m: defaultHubHeight(rated_kw), wake_pct: 5, curve: 'standaard', hoogte: 'alpha',
    herkomst: { turbines: p.turbines ? 'osm' : 'aanname', rated_kw: mw ? 'osm' : 'aanname', hub_height_m: 'aanname', wake_pct: 'aanname', curve: 'aanname', hoogte: 'aanname' },
  };
}

const localDate = (() => {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' });
  return stamp => format.format(new Date(stamp));
})();

// Maandfactoren uit WINS50 voor een bekend park en de gekozen stations (month_factors() in windbron.py).
export function monthFactors(parkId, stations) {
  const entry = heightTable.parken[parkId], ids = [...stations].sort(), same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  if (ids.length > 1 && entry.regel === 'gemiddelde' && same(ids, [...entry.stations].sort())) return { factor: entry.factor, herkomst: 'WINS50 voor ' + entry.bron };
  const item = entry.bronvergelijking.find(b => same([...b.stations].sort(), ids));
  return item ? { factor: item.factor, herkomst: 'WINS50 voor ' + item.naam } : { factor: entry.schering, herkomst: 'WINS50-hoogtetoename op de parklocatie; stationsligging niet gecorrigeerd' };
}

// v_as / v_10 op de Nederlandse kalenderdag `day` (JJJJ-MM-DD).
export function hubFactor(park, day) {
  if (park.hoogte === 'wins50' && heightTable.parken[park.id]) return monthFactors(park.id, park.stations || []).factor[Number(day.slice(5, 7)) - 1];
  const doy = Math.floor((Date.parse(day + 'T00:00:00Z') - Date.UTC(Number(day.slice(0, 4)), 0, 1)) / 86400000) + 1;
  const alpha = park.alpha ?? (DEFAULT_ALPHA + DEFAULT_ALPHA_SEASONAL * Math.cos(2 * Math.PI * (doy - 1) / 365));
  return (park.hub_height_m / 10) ** alpha;
}

// Turbinevermogen in kW: lineair tussen de curvepunten, nul vanaf cut-out (power_kw() in profile.py).
export function turbineKW(park) {
  const source = CURVES[park.curve] || CURVES.standaard, points = source.points, cutOut = source.cut_out, last = points.at(-1);
  const scale = park.curve === 'standaard' ? park.rated_kw / NOMINAL_KW.standaard : 1;
  return v => {
    if (v < points[0][0] || v >= cutOut) return 0;
    if (v >= last[0]) return last[1] * scale;
    const i = points.findIndex(p => p[0] > v), [v0, p0] = points[i - 1], [v1, p1] = points[i];
    return (p0 + (p1 - p0) * (v - v0) / (v1 - v0)) * scale;
  };
}

// Wind op 10 m (m/s) → MW van het hele park op deze dag; null blijft null.
export function parkPowerModel(park, day, factor = hubFactor(park, day)) {
  const turbine = turbineKW(park), wake = 1 - park.wake_pct / 100;
  return v => {
    if (v === null || v === undefined || Number.isNaN(v)) return null;
    const hub = v * factor;
    let kw = turbine(hub);
    if (kw > 0 && park.wake_pct > 0) kw = turbine(hub * wake);
    return kw * park.turbines / 1000;
  };
}

// Per moment (Unix-seconden) het parkvermogen; factoren per kalenderdag in een cache.
export function parkPowerAt(park) {
  const days = new Map();
  return (t, v) => {
    const day = localDate(t * 1000);
    let model = days.get(day);
    if (!model) days.set(day, model = parkPowerModel(park, day));
    return model(v);
  };
}

export const localDay = stamp => localDate(stamp);
