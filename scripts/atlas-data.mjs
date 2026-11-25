// Eenmalige data voor de Atlas (atlas.mijnwindpark.nl). Nooit live per klik.
//   node scripts/atlas-data.mjs wind [--upload]   KNMI-uurwind 2025 → work/atlas-data/wind-2025/*.json (+ naar R2 met --upload)
//   node scripts/atlas-data.mjs windparken         OSM Overpass → src/atlas/windparken.geojson (committen; andere server via OVERPASS_URL)
// Zonder argument: beide stappen.
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

if (want('wind')) await wind();
if (want('windparken')) await windparken();
