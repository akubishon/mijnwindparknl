// Alle meetstations van de Projectstudio: KNMI (Europees Nederland en de Noordzee) plus de buurlanden
// (src/stations-buitenland.json, gemaakt met scripts/buurlanden-data.mjs). Elk station heeft een bron, een land en de
// meethoogte van de windmeter; windsnelheden worden bij het ophalen naar 10 m omgerekend (sources.mjs).
import knmi from '../stations.json' with { type: 'json' };
import foreign from '../stations-buitenland.json' with { type: 'json' };

export const SOURCES = {
  knmi: { naam: 'KNMI', land: 'NL', lang: 'KNMI EDR 10-minute-in-situ-meteorological-observations' },
  dwd: { naam: 'DWD', land: 'DE', lang: 'Deutscher Wetterdienst, Climate Data Center, 10-Minutenwerte Wind (FF_10)' },
  kmi: { naam: 'KMI', land: 'BE', lang: 'Koninklijk Meteorologisch Instituut, open data AWS 10 minuten (wind_speed_10m)' },
  dmi: { naam: 'DMI', land: 'DK', lang: 'Danmarks Meteorologiske Institut, metObs (wind_speed, 10 minutter)' },
};
export const COUNTRY_NAMES = { NL: 'Nederland', DE: 'Duitsland', BE: 'België', DK: 'Denemarken', LU: 'Luxemburg' };

export const STATIONS = [
  ...knmi.filter(s => s.latitude > 50 && s.latitude < 56).map(s => ({ ...s, land: 'NL', bron: 'knmi', regio: null, meethoogte_m: 10 })),
  ...foreign,
];
const byId = new Map(STATIONS.map(s => [s.id, s]));
export const stationById = id => byId.get(id) || null;
export const sourceOf = id => byId.get(id)?.bron || null;
export const knownStation = id => byId.has(id);
// Korte bronnaam voor teksten: "KNMI Stavoren", "DWD Emden".
export const sourceLabel = id => { const s = byId.get(id); return s ? SOURCES[s.bron].naam + ' ' + s.name : id; };
export const sourcesOf = ids => [...new Set(ids.map(sourceOf).filter(Boolean))].map(b => SOURCES[b].naam);
