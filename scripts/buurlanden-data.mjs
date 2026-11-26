// Eenmalige data voor de Projectstudio buiten Nederland: meetstations en windparken in de buurlanden. Nooit live per klik.
//   node scripts/buurlanden-data.mjs stations     DWD (DE), KMI (BE) en DMI (DK) → src/stations-buitenland.json
//   node scripts/buurlanden-data.mjs windparken   OSM Overpass → src/studio/windparken-buurlanden.geojson (andere server via OVERPASS_URL)
// Zonder argument: beide. Committen; de Worker bundelt de bestanden. De windgegevens zelf haalt de studio per station
// en windjaar op (src/studio/sources.mjs) en bewaart ze in R2, zoals bij KNMI.
// Achter de agent-proxy: NODE_USE_ENV_PROXY=1 node scripts/buurlanden-data.mjs
import {writeFileSync, readFileSync, existsSync, mkdirSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';

const args = process.argv.slice(2), want = step => !args.length || args.includes(step);
const R = 6371.0088, rad = d => d * Math.PI / 180;
const km = (a, b) => 2 * R * Math.asin(Math.sqrt(Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2));
const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function get(url, options = {}, tries = 5) {
 for (let i = 0; ; i++) {
  try { const r = await fetch(url, {...options, signal: AbortSignal.timeout(400000)}); if (r.ok) return r; if (r.status !== 429 && r.status < 500) throw Error(`${r.status} ${url}`); }
  catch (e) { if (i >= tries - 1 || /^\d{3} /.test(e.message)) throw e; }
  if (i >= tries - 1) throw Error('Niet bereikbaar: ' + url);
  await sleep(5000 * 2 ** i);
 }
}

// ---------- Meetstations ----------
// Alleen stations die in het windjaar meten; de studio controleert de dekking zelf zodra een jaar is opgehaald.
const DWD = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/10_minutes/wind/';
// Eén bestand uit een zip (DWD levert per station een zip met één of enkele tekstbestanden).
function unzip(buffer, match) {
 const out = {};
 for (let i = 0; i + 30 <= buffer.length;) {
  if (buffer.readUInt32LE(i) !== 0x04034b50) break;
  const method = buffer.readUInt16LE(i + 8), size = buffer.readUInt32LE(i + 18), nameLength = buffer.readUInt16LE(i + 26), extra = buffer.readUInt16LE(i + 28);
  const name = buffer.subarray(i + 30, i + 30 + nameLength).toString('latin1'), start = i + 30 + nameLength + extra;
  if (match.test(name)) { const body = buffer.subarray(start, start + size); out[name] = (method === 8 ? inflateRawSync(body) : body).toString('latin1'); }
  i = start + size;
 }
 return out;
}
async function dwdStations() {
 const text = new TextDecoder('latin1').decode(await (await get(DWD + 'recent/zehn_min_ff_Beschreibung_Stationen.txt')).arrayBuffer());
 const rows = text.split('\n').slice(2).map(line => line.trim().match(/^(\d{5})\s+(\d{8})\s+(\d{8})\s+(-?\d+)\s+([\d.]+)\s+([\d.]+)\s+(.+?)\s{2,}(\S.*?)\s{2,}/)).filter(Boolean)
  .map(([, id, from, to, , lat, lon, name, state]) => ({id, from, to, lat: Number(lat), lon: Number(lon), name, state}))
  .filter(s => s.from <= '20250101' && s.to >= '20251231');
 const out = [];
 for (const s of rows) {
  // Meethoogte van de windmeter (Geberhöhe) in 2025 uit de metadata van het station.
  let height = null;
  try {
   const files = unzip(Buffer.from(await (await get(`${DWD}meta_data/Meta_Daten_zehn_min_ff_${s.id}.zip`)).arrayBuffer()), /Metadaten_Geraete_Windgeschwindigkeit.*\.txt$/);
   for (const line of Object.values(files)[0]?.split('\n') || []) {
    const f = line.split(';').map(v => v.trim());
    if (f.length > 7 && /^\d{8}$/.test(f[6]) && f[6] <= '20251231' && (!f[7] || f[7] >= '20250101')) height = Number(f[5]);
   }
  } catch (e) { console.warn('DWD-metadata', s.id, e.message); }
  out.push({id: 'dwd-' + s.id, name: s.name, longitude: s.lon, latitude: s.lat, land: 'DE', bron: 'dwd', regio: s.state, meethoogte_m: Number.isFinite(height) && height > 0 ? height : 10});
 }
 return out;
}
async function kmiStations() {
 const url = 'https://opendata.meteo.be/service/ows?' + new URLSearchParams({service: 'WFS', version: '2.0.0', request: 'GetFeature', typenames: 'aws:aws_station', outputFormat: 'application/json'});
 return (await (await get(url)).json()).features.filter(f => !f.properties.date_end || f.properties.date_end >= '2026')
  .filter(f => f.properties.date_begin <= '2025-01-01')
  .map(f => ({id: 'kmi-' + f.properties.code, name: f.properties.name.replace(/\b(\p{L})(\p{L}*)/gu, (_, a, b) => a + b.toLowerCase()), longitude: f.geometry.coordinates[0], latitude: f.geometry.coordinates[1], land: 'BE', bron: 'kmi', regio: null, meethoogte_m: 10}));
}
async function dmiStations() {
 const all = (await (await get('https://opendataapi.dmi.dk/v2/metObs/collections/station/items?limit=10000')).json()).features;
 const byId = new Map();
 for (const f of all) {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  if (p.country !== 'DNK' || !(p.parameterId || []).includes('wind_speed') || lat < 54.4 || lat > 58 || lon < 7.5 || lon > 15.5) continue;
  if (p.operationTo && p.operationTo < '2026') continue;
  if (p.operationFrom && p.operationFrom > '2025-01-01') continue;
  const prev = byId.get(p.stationId);
  if (!prev || (p.validFrom || '') > (prev.properties.validFrom || '')) byId.set(p.stationId, f);
 }
 return [...byId.values()].map(f => ({id: 'dmi-' + f.properties.stationId, name: f.properties.name, longitude: f.geometry.coordinates[0], latitude: f.geometry.coordinates[1], land: 'DK', bron: 'dmi', regio: null, meethoogte_m: f.properties.anemometerHeight || 10}));
}
async function stations() {
 const list = [...await kmiStations(), ...await dmiStations(), ...await dwdStations()]
  .map(s => ({...s, longitude: round(s.longitude), latitude: round(s.latitude)}))
  .sort((a, b) => a.land.localeCompare(b.land) || a.name.localeCompare(b.name));
 writeFileSync('src/stations-buitenland.json', JSON.stringify(list, null, 0).replace(/\},\{/g, '},\n{') + '\n');
 const count = {}; for (const s of list) count[s.land] = (count[s.land] || 0) + 1;
 console.log(`Stations buitenland: ${list.length}`, count);
}

// ---------- Windparken ----------
// Zelfde aanpak als scripts/atlas-data.mjs voor Nederland: getagde centrales plus losse turbines, geclusterd tot parken
// (≤ 1 km); vermogen uit de OSM-tags, anders 3 MW per turbine (aanname). Regio uit de bestuurlijke indeling in OSM,
// plaats = dichtstbijzijnde stad, dorp of gemeente. Parken op zee krijgen het land van de dichtstbijzijnde plaats.
const OVERPASS = process.env.OVERPASS_URL || 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
const COUNTRIES = {DE: {naam: 'Duitsland', level: 4}, BE: {naam: 'België', level: 6}, DK: {naam: 'Denemarken', level: 4}, LU: {naam: 'Luxemburg', level: 2}};
const WIND = '(node["power"="generator"]["generator:source"="wind"]AREA;nwr["power"="plant"]["plant:source"="wind"]AREA;);';
const wind = area => WIND.replaceAll('AREA', area);
// Ook het lezen van het antwoord opnieuw proberen: een proxy kan een lange download halverwege afbreken.
async function overpass(query) {
 for (let i = 0; ; i++) {
  try {
   const text = await (await get(OVERPASS, {method: 'POST', body: new URLSearchParams({data: query})}, 6)).text();
   if (text.startsWith('<')) throw Error('Overpass gaf geen JSON: ' + text.slice(0, 200));
   return text;
  } catch (e) { if (i >= 4) throw e; console.warn('Overpass opnieuw:', e.message); await sleep(10000 * (i + 1)); }
 }
}
const json = async query => JSON.parse(await overpass(query)).elements;
const outputMW = text => {
 const m = String(text || '').replace(',', '.').match(/^\s*(\d+(?:\.\d+)?)\s*(kW|MW|GW)?/i);
 if (!m) return null;
 const v = Number(m[1]), unit = (m[2] || 'MW').toUpperCase();
 return unit === 'KW' ? v / 1000 : unit === 'GW' ? v * 1000 : v;
};
// Enkelvoudige koppeling ≤ 1 km met een rooster van ~1 km, zodat 30 000 turbines niet kwadratisch hoeven.
function clusterTurbines(turbines) {
 const cell = p => `${Math.floor(p[1] / 0.009)},${Math.floor(p[0] / 0.015)}`, grid = new Map();
 turbines.forEach((t, i) => { const k = cell(t.at); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
 const seen = new Uint8Array(turbines.length), clusters = [];
 for (let i = 0; i < turbines.length; i++) {
  if (seen[i]) continue;
  const members = [i]; seen[i] = 1;
  for (let j = 0; j < members.length; j++) {
   const p = turbines[members[j]].at, [cy, cx] = cell(p).split(',').map(Number);
   for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const k of grid.get(`${cy + dy},${cx + dx}`) || [])
    if (!seen[k] && km(p, turbines[k].at) <= 1) { seen[k] = 1; members.push(k); }
  }
  clusters.push(members.map(m => turbines[m]));
 }
 return clusters;
}
// Kleine verzoeken (per deelstaat/provincie en per stuk zee): één groot verzoek over het hele gebied loopt achter een
// proxy vast. Antwoorden worden bewaard in work/overpass/, zodat een herhaalde run alleen ontbrekende delen ophaalt.
const SEAS = {Noordzee: '53.3,3.0,56.6,9.0', Oostzee: '53.8,9.5,56.6,15.5', Kattegat: '56.6,7.5,58,13'};
const PLACE_COUNTRIES = {...Object.fromEntries(Object.keys(COUNTRIES).map(c => [c, 'city|town|village'])), NL: 'city|town', SE: 'city|town', PL: 'city|town', GB: 'city|town', NO: 'city|town', FR: 'city|town'};
async function cachedOverpass(name, query) {
 const file = `work/overpass/${name}.txt`;
 if (existsSync(file)) return readFileSync(file, 'utf8');
 const text = await overpass(query); mkdirSync('work/overpass', {recursive: true}); writeFileSync(file, text); await sleep(2000);
 return text;
}
async function windparken() {
 const at = e => e.type === 'node' ? [e.lon, e.lat] : [e.center.lon, e.center.lat];
 const byKey = new Map(), where = new Map();
 for (const [code, c] of Object.entries(COUNTRIES)) {
  const sel = c.level === 2 ? `area["ISO3166-1"="${code}"][admin_level=2]` : `area["ISO3166-2"~"^${code}-"][admin_level=${c.level}]`;
  const regions = JSON.parse(await cachedOverpass(`regios-${code}`, `[out:json][timeout:120];${sel};out tags;`)).elements;
  for (const r of regions) {
   const naam = c.level === 2 ? c.naam : r.tags?.['name:nl'] || r.tags?.name || null;
   const list = JSON.parse(await cachedOverpass(`wind-${code}-${r.id}`, `[out:json][timeout:300];area(id:${r.id})->.a;${wind('(area.a)')}out center tags;`)).elements;
   for (const e of list) { byKey.set(e.type + e.id, e); if (!where.has(e.type + e.id)) where.set(e.type + e.id, {land: code, provincie: naam?.replace(/\s*\(Landmasse\)$/, '') || null}); }
   console.log(code, naam, list.length);
  }
 }
 for (const [zee, box] of Object.entries(SEAS)) {
  const list = JSON.parse(await cachedOverpass(`wind-zee-${zee}`, `[out:json][timeout:300][bbox:${box}];${wind('')}out center tags;`)).elements;
  let n = 0; for (const e of list) if (!byKey.has(e.type + e.id)) { byKey.set(e.type + e.id, e); n++; }
  console.log(zee, n, 'objecten buiten de bestuurlijke gebieden');
 }
 const elements = [...byKey.values()];
 // Plaatsen per land, voor plaats en (op zee) land. Ook NL, SE, PL, GB, NO en FR (alleen steden), zodat objecten in
 // die landen of hun wateren daar terechtkomen en wegvallen.
 const places = [];
 for (const [code, kinds] of Object.entries(PLACE_COUNTRIES)) {
  const csv = await cachedOverpass(`plaatsen-${code}`, `[out:csv(::lat,::lon,name;false;"\\t")][timeout:300];area["ISO3166-1"="${code}"][admin_level=2]->.a;node["place"~"^(${kinds})$"](area.a);out;`);
  for (const line of csv.split('\n')) { const [lat, lon, name] = line.split('\t'); if (name) places.push({at: [Number(lon), Number(lat)], name, land: code}); }
 }
 console.log('Plaatsen:', places.length);
 const pgrid = new Map(), pcell = p => `${Math.floor(p[1] / 0.25)},${Math.floor(p[0] / 0.4)}`;
 for (const p of places) { const k = pcell(p.at); if (!pgrid.has(k)) pgrid.set(k, []); pgrid.get(k).push(p); }
 const nearest = (point, land) => {
  const [cy, cx] = pcell(point).split(',').map(Number);
  for (let r = 1; r <= 8; r++) {
   let best = null;
   for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) for (const p of pgrid.get(`${cy + dy},${cx + dx}`) || []) { if (land && p.land !== land) continue; const d = km(point, p.at); if (!best || d < best.d) best = {...p, d}; }
   if (best && best.d <= r * 25) return best;
  }
  return null;
 };
 const placeOf = (e, point) => {
  const w = where.get(e.type + e.id);
  if (w) return {...w, plaats: nearest(point, w.land)?.name || null};
  const p = nearest(point);
  if (!p || p.d > 120 || !COUNTRIES[p.land]) return null;   // ander land, of te ver op zee om toe te wijzen
  return {land: p.land, provincie: 'Zee', plaats: p.name};
 };
 const plants = elements.filter(e => e.tags?.power === 'plant').map(e => ({e, at: at(e), tags: e.tags, turbines: 0}));
 const turbines = elements.filter(e => e.tags?.power === 'generator').map(e => ({e, at: at(e), tags: e.tags}));
 const features = [], add = (point, props, e) => { const place = placeOf(e, point); if (place) features.push({type: 'Feature', geometry: {type: 'Point', coordinates: point.map(v => round(v, 5))}, properties: {...props, ...place, gemeente: null}}); };
 for (const members of clusterTurbines(turbines)) {
  const c = [members.reduce((s, t) => s + t.at[0], 0) / members.length, members.reduce((s, t) => s + t.at[1], 0) / members.length];
  const plant = plants.find(p => Math.abs(p.at[1] - c[1]) < 0.02 && km(p.at, c) <= 1.5);
  if (plant) { plant.turbines += members.length; continue; }
  const name = members.map(t => t.tags.name || '').find(Boolean)?.replace(/\s*\d+$/, '') || members[0].tags.operator || `Windturbines (${members.length})`;
  const mw = members.reduce((s, t) => s + (outputMW(t.tags['generator:output:electricity']) ?? 3), 0);
  add(c, {naam: name, mw: Math.round(mw * 10) / 10, turbines: members.length}, members[0].e);
 }
 for (const p of plants) {
  const mw = outputMW(p.tags['plant:output:electricity']) ?? Math.max(1, p.turbines) * 3;
  add(p.at, {naam: p.tags.name || p.tags.operator || 'Windpark', mw: Math.round(mw * 10) / 10, turbines: p.turbines || null}, p.e);
 }
 // Kort houden: alleen wat de studio gebruikt.
 const text = JSON.stringify({type: 'FeatureCollection', attributie: '© OpenStreetMap-bijdragers (ODbL)', features});
 writeFileSync('src/studio/windparken-buurlanden.geojson', text + '\n');
 const count = {}; for (const f of features) { const c = count[f.properties.land] ||= {parken: 0, mw: 0}; c.parken++; c.mw += f.properties.mw; }
 for (const c of Object.values(count)) c.mw = Math.round(c.mw);
 console.log(`Windparken buurlanden: ${features.length} parken, ${(text.length / 1024).toFixed(0)} kB.`, count);
}

if (want('stations')) await stations();
if (want('windparken')) await windparken();
