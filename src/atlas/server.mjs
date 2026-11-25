// Atlas (atlas.mijnwindpark.nl): openbare kaartpagina met teaser; LCOH alleen server-side en achter het sitewachtwoord.
// Wordt met esbuild gebundeld tot `atlasServer` in worker/index.js (scripts/compose-worker.mjs). Nooit in de browserbundle.
import stationCatalog from '../stations.json' with { type: 'json' };
import windparken from './windparken.geojson' with { type: 'json' };
import {modelOptions, windPowerModel} from '../knmi.mjs';
import {DEFAULTS, STEP_H, simulate_with_replacements, summarise, cleanSupply} from '../electrolyser-kernel.mjs';
import {COST_DEFAULTS, economics} from '../electrolyser-economics.mjs';

export const ATLAS_HOSTS = ['atlas.mijnwindpark.nl', 'atlas.localhost'];
const WIND_PREFIX = 'atlas/v1/wind-2025/';
const FALLBACK_MW = 20, MODULE_MW = 5, MAX_MODULES = 20, MISSING = 255;
const encoder = new TextEncoder();

const toRad = d => d * Math.PI / 180;
export function haversineKm(lat1, lon1, lat2, lon2) {
 const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
 return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
}
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const validPoint = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= 50.5 && lat <= 54 && lon >= 3 && lon <= 7.5;

// ---------------------------------------------------------------- data uit R2 (gemaakt door scripts/atlas-data.mjs)
let indexCache = null;
async function windIndex(env) {
 if (indexCache && Date.now() < indexCache.expires) return indexCache.value;
 const object = await env.BUCKET?.get(WIND_PREFIX + 'index.json');
 if (!object) throw Error('ATLAS_NO_DATA');
 const value = await object.json();
 indexCache = {value, expires: Date.now() + 3600000};
 return value;
}
const stationSeries = new Map();
async function windSeries(env, id) {
 if (stationSeries.has(id)) return stationSeries.get(id);
 const object = await env.BUCKET?.get(WIND_PREFIX + id + '.json');
 if (!object) throw Error('ATLAS_NO_DATA');
 const value = await object.json();
 stationSeries.set(id, value);
 if (stationSeries.size > 10) stationSeries.delete(stationSeries.keys().next().value);
 return value;
}

export function nearestStation(index, lat, lon) {
 let best = null;
 for (const entry of index.stations || []) {
  const s = stationCatalog.find(c => c.id === entry.id);
  if (!s) continue;
  const km = haversineKm(lat, lon, s.latitude, s.longitude);
  if (!best || km < best.km) best = {id: s.id, name: s.name, km, mean: entry.mean_ms};
 }
 return best;
}
export function nearestParks(lat, lon, count = 3) {
 return windparken.features.map(f => ({naam: f.properties.naam, mw: f.properties.mw, km: haversineKm(lat, lon, f.geometry.coordinates[1], f.geometry.coordinates[0])}))
  .sort((a, b) => a.km - b.km).slice(0, count);
}

// ---------------------------------------------------------------- LCOH (alleen server-side)
// Uurreeks 2025 (0,1 m/s, 255 = ontbrekend) → 10-minutenaanbod in MW voor een park van P MW:
// elk uur 6× herhaald, naar ashoogte met de α-route van knmi.mjs en de Fryslân-turbinecurve, geschaald naar P.
export function supplyFromSeries(series, P) {
 const bytes = Uint8Array.from(atob(series.data), c => c.charCodeAt(0));
 const options = modelOptions(new URLSearchParams({hoogte: 'alpha', station: series.station}));
 const parkMW = 89 * options.ratedKW / 1000, scale = P / parkMW;
 const start = Date.parse(series.start) / 1000, models = new Map();
 const t = [], mw = [];
 for (let i = 0; i < bytes.length; i++) {
  const hourStart = start + i * 3600, day = new Date(hourStart * 1000).toISOString().slice(0, 10);
  if (!models.has(day)) models.set(day, windPowerModel(day, options));
  const v = bytes[i] === MISSING ? null : bytes[i] / 10, power = v === null ? null : models.get(day)(v) * scale;
  for (let k = 0; k < 6; k++) { t.push(hourStart + k * 3600 * STEP_H); mw.push(power); }
 }
 return {jaar: Number(series.start.slice(0, 4)), t, mw};
}
export function lcohFor(series, P) {
 const capaciteit = 0.5 * P;
 const n = Math.min(MAX_MODULES, Math.max(1, Math.ceil(capaciteit / MODULE_MW - 1e-9)));
 const a = {...DEFAULTS, ...COST_DEFAULTS, capaciteit_mw: capaciteit};
 const result = summarise([simulate_with_replacements(cleanSupply(supplyFromSeries(series, P)), n, a, 'verdelen')]);
 return economics(result, a).lcoh_eur_kg;
}

// ---------------------------------------------------------------- wachtwoord en pogingen
async function sameSecret(given, secret) {
 const [x, y] = await Promise.all([given, secret].map(s => crypto.subtle.digest('SHA-256', encoder.encode(String(s)))));
 const a = new Uint8Array(x), b = new Uint8Array(y);
 let diff = 0;
 for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
 return diff === 0;
}
const attempts = new Map();
function tooMany(ip) {
 const now = Date.now(), list = (attempts.get(ip) || []).filter(t => now - t < 60000);
 list.push(now);
 attempts.set(ip, list);
 if (attempts.size > 5000) attempts.delete(attempts.keys().next().value);
 return list.length > 5;
}

// ---------------------------------------------------------------- routes
const CSP = "default-src 'none'; script-src 'self'; worker-src blob:; child-src blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://service.pdok.nl; connect-src 'self' https://service.pdok.nl https://api.pdok.nl; font-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'";
const baseHeaders = {'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'};
const json = (value, status = 200, cache = 'no-store') => Response.json(value, {status, headers: {...baseHeaders, 'Cache-Control': cache}});
const file = (body, type, cache = 'public, max-age=3600') => new Response(body, {headers: {...baseHeaders, 'Content-Type': type, 'Cache-Control': cache}});
const notFound = () => new Response('Niet gevonden', {status: 404, headers: {...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}});
const lcohCache = new Map();

export async function atlasRoute(request, env, url, assets) {
 const path = url.pathname, method = request.method;
 if (method === 'GET') {
  if (path === '/') return file(assets.page, 'text/html; charset=utf-8', 'public, max-age=300');
  if (path === '/atlas.js') return file(assets.script, 'text/javascript; charset=utf-8');
  if (path === '/atlas.css') return file(assets.style, 'text/css; charset=utf-8');
  if (path === '/windparken.geojson') return file(JSON.stringify(windparken), 'application/geo+json', 'public, max-age=86400');
  if (path === '/favicon.svg') return file(assets.favicon, 'image/svg+xml', 'public, max-age=86400');
  if (path === '/assets/tasa-orbiter.ttf') return file(Uint8Array.from(atob(assets.font), c => c.charCodeAt(0)), 'font/ttf', 'public, max-age=604800');
  if (path === '/api/atlas/teaser') {
   const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
   if (!url.searchParams.has('lat') || !url.searchParams.has('lon') || !validPoint(lat, lon)) return json({error: 'Kies een punt in Nederland.'}, 400);
   let station = null;
   try { station = nearestStation(await windIndex(env), lat, lon); } catch (e) { console.error('ATLAS_TEASER_DATA', e.message); }
   return json({
    station: station && {naam: station.name, afstand_km: round(station.km, 1), wind_gem_ms: round(station.mean, 1)},
    windparken: nearestParks(lat, lon).map(p => ({naam: p.naam, mw: round(p.mw, 1), afstand_km: round(p.km, 1)})),
   }, 200, 'public, max-age=86400');
  }
  return notFound();
 }
 if (method === 'POST' && path === '/api/atlas/lcoh') {
  const ip = request.headers.get('CF-Connecting-IP') || 'onbekend';
  if (tooMany(ip)) return json({error: 'Te veel pogingen. Probeer het over een minuut opnieuw.'}, 429);
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  if (!env.SITE_PASSWORD || typeof body?.password !== 'string' || !await sameSecret(body.password, env.SITE_PASSWORD)) return json({error: 'Onjuist wachtwoord.'}, 401);
  const lat = Number(body.lat), lon = Number(body.lon);
  if (!validPoint(lat, lon)) return json({error: 'Kies een punt in Nederland.'}, 400);
  try {
   const station = nearestStation(await windIndex(env), lat, lon);
   if (!station) throw Error('ATLAS_NO_DATA');
   const park = nearestParks(lat, lon, 1)[0] || null;
   const P = park && park.mw > 0 ? park.mw : FALLBACK_MW;
   const key = station.id + '|' + P;
   if (!lcohCache.has(key)) {
    lcohCache.set(key, lcohFor(await windSeries(env, station.id), P));
    if (lcohCache.size > 200) lcohCache.delete(lcohCache.keys().next().value);
   }
   const lcoh = lcohCache.get(key);
   return json({lcoh_eur_kg: lcoh === null ? null : round(lcoh, 2), windpark: park?.naam || null, P_mw: round(P, 1), station: station.name});
  } catch (e) {
   console.error('ATLAS_LCOH_FAILED', e.message);
   return json({error: 'De berekening is nu niet beschikbaar.'}, 503);
  }
 }
 return notFound();
}
