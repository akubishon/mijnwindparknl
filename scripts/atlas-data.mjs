// Eenmalige data voor de Atlas (atlas.mijnwindpark.nl). Nooit live per klik.
//   node scripts/atlas-data.mjs wind [--upload]   KNMI-uurwind 2025 → work/atlas-data/wind-2025/*.json (+ naar R2 met --upload)
//   node scripts/atlas-data.mjs windparken         OSM Overpass → src/atlas/windparken.geojson (committen; andere server via OVERPASS_URL)
//   node scripts/atlas-data.mjs plaatsen           PDOK Locatieserver → plaats, gemeente en provincie per park in dezelfde geojson
// Zonder argument: alle stappen. Na 'windparken' volgt 'plaatsen' altijd, zodat de plaatsnamen niet wegvallen.
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const args = process.argv.slice(2), steps = args.filter(a => !a.startsWith('--'));
const want = step => !steps.length || steps.includes(step);
const OUT = 'work/atlas-data/wind-2025', BUCKET = 'mijnwindpark', PREFIX = 'atlas/v1/wind-2025/';
const R = 6371.0088, rad = d => d * Math.PI / 180;
const km = (a, b) => 2 * R * Math.asin(Math.sqrt(Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2));

async function wind() {
 // Uurgegevens FH (uurgemiddelde wind op 10 m, 0,1 m/s) van alle KNMI-landstations, 2025 in UT.
 // KNMI weigert een heel jaar in één request (HTML-foutpagina); daarom één request per maand.
 const rows = [];
 for (let m = 1; m <= 12; m++) {
  const mm = String(m).padStart(2, '0'), last = new Date(Date.UTC(2025, m, 0)).getUTCDate();
  const r = await fetch('https://www.daggegevens.knmi.nl/klimatologie/uurgegevens?' + new URLSearchParams({start: `2025${mm}0101`, end: `2025${mm}${last}24`, vars: 'FH', stns: 'ALL', fmt: 'json'}));
  if (!r.ok || !r.headers.get('content-type')?.includes('json')) throw Error(`KNMI ${r.status} voor maand ${m}`);
  rows.push(...await r.json());
 }
 const catalog = JSON.parse(readFileSync('src/stations.json', 'utf8'));
 const byCode = new Map(catalog.map(s => [Number(s.id.slice(-3)), s]));
 const start = Date.UTC(2025, 0, 1), HOURS = 8760, series = new Map();
 for (const row of rows) {
  const s = byCode.get(Number(row.station_code));
  if (!s || typeof row.FH !== 'number' || row.FH < 0) continue;
  const i = Math.round((Date.parse(row.date) - start) / 3600000) + row.hour - 1;
  if (i < 0 || i >= HOURS) continue;
  if (!series.has(s.id)) series.set(s.id, new Array(HOURS).fill(null));
  series.get(s.id)[i] = row.FH;
 }
 mkdirSync(OUT, {recursive: true});
 const index = [];
 for (const [id, values] of series) {
  const known = values.filter(v => v !== null);
  if (known.length < HOURS / 2) continue; // te weinig data: overslaan
  const mean = known.reduce((a, b) => a + b, 0) / known.length / 10;
  // Uint8 in 0,1 m/s; 255 = ontbrekend, hoger dan 25,4 m/s wordt 25,4 (ruim boven de afslagsnelheid op ashoogte).
  const bytes = Uint8Array.from(values, v => v === null ? 255 : Math.min(254, v));
  const s = catalog.find(c => c.id === id);
  writeFileSync(`${OUT}/${id}.json`, JSON.stringify({station: id, naam: s.name, start: '2025-01-01T00:00:00Z', stap_uur: 1, eenheid: '0,1 m/s', ontbrekend: 255, mean_ms: mean, uren: known.length, data: Buffer.from(bytes).toString('base64')}));
  index.push({id, mean_ms: Math.round(mean * 100) / 100, uren: known.length});
 }
 writeFileSync(`${OUT}/index.json`, JSON.stringify({jaar: 2025, bron: 'KNMI uurgegevens FH', stations: index}));
 console.log(`Wind 2025: ${index.length} stations met data in ${OUT}.`);
 if (args.includes('--upload')) for (const name of ['index', ...index.map(s => s.id)]) {
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${PREFIX}${name}.json`, '--file', `${OUT}/${name}.json`, '--content-type', 'application/json', '--remote'], {stdio: 'inherit'});
 }
}

const outputMW = text => {
 const m = String(text || '').replace(',', '.').match(/^\s*(\d+(?:\.\d+)?)\s*(kW|MW|GW)?/i);
 if (!m) return null;
 const v = Number(m[1]), unit = (m[2] || 'MW').toUpperCase();
 return unit === 'KW' ? v / 1000 : unit === 'GW' ? v * 1000 : v;
};
async function windparken() {
 const query = `[out:json][timeout:300];area["ISO3166-1"="NL"][admin_level=2]->.nl;(nwr["power"="plant"]["plant:source"="wind"](area.nl);node["power"="generator"]["generator:source"="wind"](area.nl););out center tags;`;
 const r = await fetch(process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter', {method: 'POST', body: new URLSearchParams({data: query})});
 if (!r.ok) throw Error('Overpass ' + r.status);
 const elements = (await r.json()).elements;
 const at = e => e.type === 'node' ? [e.lon, e.lat] : [e.center.lon, e.center.lat];
 const plants = elements.filter(e => e.tags?.power === 'plant').map(e => ({at: at(e), tags: e.tags, turbines: 0}));
 const turbines = elements.filter(e => e.tags?.power === 'generator').map(e => ({at: at(e), tags: e.tags}));
 // Losse turbines clusteren tot parken: enkelvoudige koppeling, ≤ 1 km.
 const cluster = new Array(turbines.length).fill(-1), clusters = [];
 for (let i = 0; i < turbines.length; i++) {
  if (cluster[i] >= 0) continue;
  const members = [i]; cluster[i] = clusters.length;
  for (let j = 0; j < members.length; j++) for (let k = 0; k < turbines.length; k++)
   if (cluster[k] < 0 && km(turbines[members[j]].at, turbines[k].at) <= 1) { cluster[k] = clusters.length; members.push(k); }
  clusters.push(members.map(m => turbines[m]));
 }
 const features = [];
 for (const members of clusters) {
  const c = [members.reduce((s, t) => s + t.at[0], 0) / members.length, members.reduce((s, t) => s + t.at[1], 0) / members.length];
  // Een cluster bij een getagde centrale hoort bij die centrale (geeft alleen het aantal turbines door).
  const plant = plants.find(p => km(p.at, c) <= 1.5);
  if (plant) { plant.turbines += members.length; continue; }
  const name = members.map(t => t.tags.name || '').find(Boolean)?.replace(/\s*\d+$/, '') || members[0].tags.operator || `Windturbines (${members.length})`;
  const mw = members.reduce((s, t) => s + (outputMW(t.tags['generator:output:electricity']) ?? 3), 0);
  features.push({type: 'Feature', geometry: {type: 'Point', coordinates: c.map(v => Math.round(v * 1e5) / 1e5)}, properties: {naam: name, mw: Math.round(mw * 10) / 10, turbines: members.length}});
 }
 for (const p of plants) {
  const mw = outputMW(p.tags['plant:output:electricity']) ?? Math.max(1, p.turbines) * 3;
  features.push({type: 'Feature', geometry: {type: 'Point', coordinates: p.at.map(v => Math.round(v * 1e5) / 1e5)}, properties: {naam: p.tags.name || p.tags.operator || 'Windpark', mw: Math.round(mw * 10) / 10, turbines: p.turbines || null}});
 }
 const text = JSON.stringify({type: 'FeatureCollection', attributie: '© OpenStreetMap-bijdragers (ODbL)', features});
 writeFileSync('src/atlas/windparken.geojson', text + '\n');
 console.log(`Windparken: ${features.length} parken, ${(text.length / 1024).toFixed(0)} kB in src/atlas/windparken.geojson.`);
}

// Plaats, gemeente en provincie per park uit de PDOK Locatieserver (omgekeerd zoeken), zodat bezoekers een park op
// plaatsnaam en per provincie vinden. Ligt een park meer dan 500 m buiten elke gemeente, dan ligt het op zee:
// provincie 'Noordzee', met de dichtstbijzijnde gemeente en plaats aan de kust. Parken buiten Europees Nederland
// (OSM rekent ook de eilanden in het Caribisch gebied tot NL) staan niet op de kaart en krijgen geen plaats.
const inEuropeanNL = ([lon, lat]) => lat >= 50.5 && lat <= 54 && lon >= 3 && lon <= 7.5;
const REVERSE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse';
async function reverse(lon, lat, type, fl) {
 for (let attempt = 0; attempt < 5; attempt++) {
  const r = await fetch(`${REVERSE}?${new URLSearchParams({lat: String(lat), lon: String(lon), type, rows: '1', fl})}`);
  if (r.ok) return (await r.json()).response?.docs?.[0] || null;
  if (r.status !== 429 && r.status < 500) throw Error(`PDOK ${r.status}`);
  await new Promise(done => setTimeout(done, 1000 * 2 ** attempt));
 }
 throw Error('PDOK Locatieserver niet bereikbaar');
}
async function plaatsen() {
 const file = 'src/atlas/windparken.geojson', geo = JSON.parse(readFileSync(file, 'utf8'));
 let next = 0;
 const work = async () => {
  while (next < geo.features.length) {
   const f = geo.features[next++], [lon, lat] = f.geometry.coordinates;
   if (!inEuropeanNL(f.geometry.coordinates)) { Object.assign(f.properties, {plaats: null, gemeente: null, provincie: null}); continue; }
   const g = await reverse(lon, lat, 'gemeente', 'gemeentenaam,provincienaam,afstand');
   const w = await reverse(lon, lat, 'woonplaats', 'woonplaatsnaam,afstand');
   const opZee = !g || g.afstand > 500;
   Object.assign(f.properties, {plaats: w?.woonplaatsnaam || null, gemeente: g?.gemeentenaam || null, provincie: opZee ? 'Noordzee' : g.provincienaam});
  }
 };
 await Promise.all([work(), work(), work()]);
 const text = JSON.stringify(geo);
 writeFileSync(file, text + '\n');
 const counts = {};
 for (const f of geo.features) counts[f.properties.provincie] = (counts[f.properties.provincie] || 0) + 1;
 console.log(`Plaatsen: ${geo.features.length} parken, ${(text.length / 1024).toFixed(0)} kB.`, counts);
}

if (want('wind')) await wind();
if (want('windparken')) await windparken();
if (want('windparken') || want('plaatsen')) await plaatsen();
