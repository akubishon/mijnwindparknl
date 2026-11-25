// Atlas (atlas.mijnwindpark.nl): openbare kaartpagina met teaser; LCOH alleen server-side en achter het sitewachtwoord.
// Wordt met esbuild gebundeld tot `atlasServer` in worker/index.js (scripts/compose-worker.mjs). Nooit in de browserbundle.
import stationCatalog from '../stations.json' with { type: 'json' };
import windparken from './windparken.geojson' with { type: 'json' };
import {modelOptions, windPowerModel} from '../knmi.mjs';
import {DEFAULTS, STEP_H, simulate_with_replacements, summarise, cleanSupply} from '../electrolyser-kernel.mjs';
import {COST_DEFAULTS, economics} from '../electrolyser-economics.mjs';
import {parseLead, leadKey, ATLAS_EVENTS, atlasEventKey} from '../leads.mjs';

export const ATLAS_HOSTS = ['atlas.mijnwindpark.nl', 'atlas.localhost'];
const ATLAS_ORIGIN = 'https://atlas.mijnwindpark.nl', SCAN_URL = 'https://mijnwindpark.nl/waterstofscan';
// Conceptfase: zoekmachines mogen de Atlas niet indexeren (robots.txt sluit alles af, elke response krijgt noindex).
// Zet op true zodra de site geen concept meer is; dan gaan robots.txt en de sitemap open.
export const ATLAS_INDEXABLE = false;
const WIND_PREFIX = 'atlas/v1/wind-2025/';
const MODULE_MW = 5, MAX_MODULES = 20, MISSING = 255;
// Een windpark is alleen te kiezen als er een KNMI-station met uurdata 2025 binnen deze afstand van het park ligt:
// de wind van dat station staat dan model voor het park.
export const MAX_STATION_KM = 25;
// Een perceel is alleen te kiezen als er zo'n windpark binnen deze afstand ligt.
export const MAX_PARK_KM = 30;
// Windparken die bij een perceel te kiezen zijn: de dichtstbijzijnde, en hoogstens zoveel tegelijk in de LCOH.
const PARK_CHOICES = 8, MAX_SELECTED_PARKS = 10;
// Vaste id per park (volgorde van src/atlas/windparken.geojson), zodat de browser parken kan aanwijzen.
const parks = windparken.features.map((f, id) => ({id, naam: f.properties.naam, mw: f.properties.mw, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1]}));
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

export function dataStations(index) {
 return (index.stations || []).map(entry => {
  const s = stationCatalog.find(c => c.id === entry.id);
  return s && {id: s.id, name: s.name, lat: s.latitude, lon: s.longitude, mean: entry.mean_ms};
 }).filter(Boolean);
}
// Dichtstbijzijnde station met data, maar alleen binnen MAX_STATION_KM; anders null.
export function nearestStation(index, lat, lon, maxKm = MAX_STATION_KM) {
 let best = null;
 for (const s of dataStations(index)) {
  const km = haversineKm(lat, lon, s.lat, s.lon);
  if (km <= maxKm && (!best || km < best.km)) best = {id: s.id, name: s.name, km, mean: s.mean};
 }
 return best;
}
// Per park het KNMI-station dat erbij past (of null), per versie van de index één keer berekend.
const parkStationCache = new WeakMap();
export function parkStations(index) {
 if (!parkStationCache.has(index)) parkStationCache.set(index, parks.map(p => nearestStation(index, p.lat, p.lon)));
 return parkStationCache.get(index);
}
// Dichtstbijzijnde windparken bij een perceel, alleen parken met een passend KNMI-station en binnen MAX_PARK_KM.
export function nearestParks(index, lat, lon, count = PARK_CHOICES) {
 const stations = parkStations(index);
 return parks.map(p => ({...p, station: stations[p.id], km: haversineKm(lat, lon, p.lat, p.lon)}))
  .filter(p => p.station && p.km <= MAX_PARK_KM).sort((a, b) => a.km - b.km).slice(0, count);
}
// Gekozen park-id's uit de browser → parken met hun station; null bij een ongeldige keuze,
// 'geen-station' als een gekozen park geen KNMI-station binnen MAX_STATION_KM heeft.
export function selectedParks(index, ids) {
 if (!Array.isArray(ids) || !ids.length || ids.length > MAX_SELECTED_PARKS) return null;
 const unique = [...new Set(ids)];
 if (unique.some(id => !Number.isInteger(id) || id < 0 || id >= parks.length)) return null;
 const stations = parkStations(index), chosen = unique.map(id => ({...parks[id], station: stations[id]}));
 return chosen.some(p => !p.station) ? 'geen-station' : chosen;
}
const parkGeojson = index => {
 const stations = index ? parkStations(index) : [];
 return JSON.stringify({...windparken, features: windparken.features.map((f, id) => ({...f, properties: {...f.properties, id, knmi: stations[id]?.name ?? null}}))});
};

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
// groups: [{series, P}], één groep per KNMI-station; het aanbod van de groepen wordt per tijdstap opgeteld
// (ontbreekt een station op een tijdstap, dan ontbreekt het totaal daar ook).
export function lcohFor(groups) {
 const P = groups.reduce((sum, g) => sum + g.P, 0);
 const capaciteit = 0.5 * P;
 const n = Math.min(MAX_MODULES, Math.max(1, Math.ceil(capaciteit / MODULE_MW - 1e-9)));
 const a = {...DEFAULTS, ...COST_DEFAULTS, capaciteit_mw: capaciteit};
 const supplies = groups.map(g => supplyFromSeries(g.series, g.P));
 const supply = {...supplies[0], mw: supplies[0].mw.map((_, i) => supplies.some(s => s.mw[i] === null || s.mw[i] === undefined) ? null : supplies.reduce((sum, s) => sum + s.mw[i], 0))};
 const result = summarise([simulate_with_replacements(cleanSupply(supply), n, a, 'verdelen')]);
 return economics(result, a).lcoh_eur_kg;
}

// ---------------------------------------------------------------- locatieprofiel (geen kosten: alleen windaanbod)
// Vollasturen uit een 10-minutenaanbod: gemiddeld vermogen / P × 8760 over de tijdstappen met data.
export function fullLoadHours(mw, P) {
 let sum = 0, n = 0;
 for (const v of mw) if (v !== null && v !== undefined) { sum += v; n++; }
 return n && P > 0 ? sum / n / P * 8760 : null;
}
// Opgeteld aanbod van groepen [{series, P}] (zelfde regel als lcohFor: ontbreekt één station, dan ontbreekt het totaal).
function combinedSupply(groups) {
 const supplies = groups.map(g => supplyFromSeries(g.series, g.P));
 return supplies[0].mw.map((_, i) => supplies.some(s => s.mw[i] === null || s.mw[i] === undefined) ? null : supplies.reduce((sum, s) => sum + s.mw[i], 0));
}
// Vollasturen per KNMI-station (vermogen schaalt lineair, dus per station één getal), per isolate bewaard.
const stationHours = new Map();
async function hoursForStation(env, id) {
 if (!stationHours.has(id)) stationHours.set(id, fullLoadHours(supplyFromSeries(await windSeries(env, id), 1).mw, 1));
 return stationHours.get(id);
}
// Aandeel (%) van de te kiezen windparken met minder vollasturen dan `hours`; elk park telt één keer.
export function percentileAmong(hours, parkHours) {
 const known = parkHours.filter(h => Number.isFinite(h));
 return known.length ? Math.round(known.filter(h => h < hours).length / known.length * 100) : null;
}
async function profileFor(env, index, chosenParks) {
 const byStation = new Map();
 for (const p of chosenParks) if (p.mw > 0) byStation.set(p.station.id, {station: p.station, P: (byStation.get(p.station.id)?.P || 0) + p.mw});
 const groups = [...byStation.values()].sort((a, b) => a.station.id.localeCompare(b.station.id));
 if (!groups.length) return null;
 const P = groups.reduce((sum, g) => sum + g.P, 0);
 const withSeries = [];
 for (const g of groups) withSeries.push({series: await windSeries(env, g.station.id), P: g.P});
 const hours = fullLoadHours(combinedSupply(withSeries), P);
 const stations = parkStations(index), perStation = new Map();
 for (const st of stations) if (st && !perStation.has(st.id)) perStation.set(st.id, await hoursForStation(env, st.id));
 const parkHours = stations.map(st => st ? perStation.get(st.id) : null);
 return {P_mw: round(P, 1), vollasturen: hours === null ? null : Math.round(hours / 10) * 10, percentiel: hours === null ? null : percentileAmong(hours, parkHours)};
}

// ---------------------------------------------------------------- tellingen (zonder cookies, IP of persoonsgegevens)
const EVENT_NAMES = new Set(ATLAS_EVENTS.map(([k]) => k));
async function countEvent(env, name, now = Date.now()) {
 const key = atlasEventKey(now);
 let counts = {};
 try { const o = await env.BUCKET.get(key); if (o) counts = await o.json(); } catch { counts = {}; }
 counts[name] = (Number(counts[name]) || 0) + 1;
 await env.BUCKET.put(key, JSON.stringify(counts), {httpMetadata: {contentType: 'application/json'}});
}

// ---------------------------------------------------------------- pagina per windpark (vindbaar, zonder scripts)
// Alleen parken met een echte naam en een vermogen: OSM-namen als 'Windturbines (3)' of 'WT' krijgen geen pagina.
const genericName = n => /^windturbines?\s*\(\d+\)$/i.test(n) || /^(wt|windturbine|windmolen)s?$/i.test(n) || /-$/.test(n) || n.trim().length < 3;
export const slug = n => String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'windpark';
export const pageParks = parks.filter(p => p.mw > 0 && !genericName(p.naam)).sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
const parkPath = p => `/windpark/${p.id}-${slug(p.naam)}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const nl = (v, d = 1) => Number(v).toLocaleString('nl-NL', {minimumFractionDigits: d, maximumFractionDigits: d});
const CONCEPT = '<p class="atlas-concept" role="note">Conceptwebsite · ontwerp, nog geen bestaand bedrijf of aanbod</p>';
function docPage({title, description, canonical, body}) {
 return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${ATLAS_ORIGIN}${canonical}">
<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/atlas.css"></head>
<body class="brand-style atlas-doc">${CONCEPT}
<header class="atlas-top"><a class="atlas-logo" href="/"><span>mijnwindpark.nl</span> <small>Atlas</small></a><nav class="atlas-nav"><a href="/">Kaart</a><a href="/windparken">Windparken</a></nav></header>
<main class="atlas-page">${body}</main>
<footer class="atlas-foot"><p>Windparken © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers · wind © <a href="https://www.knmi.nl">KNMI</a> · indicatief, geen garantie of financieel advies.</p></footer>
</body></html>`;
}
function parkPage(p, station) {
 const osm = `https://www.openstreetmap.org/?mlat=${p.lat.toFixed(5)}&mlon=${p.lon.toFixed(5)}#map=14/${p.lat.toFixed(5)}/${p.lon.toFixed(5)}`;
 const scan = `${SCAN_URL}?${new URLSearchParams({bron: 'windparkpagina', locatie: `Bij windpark ${p.naam}`, vermogen: String(round(p.mw, 1))})}#aanvraag`;
 const facts = [['Vermogen (OSM)', `${nl(p.mw)} MW`], ['Ligging', `${nl(p.lat, 3)}° N, ${nl(p.lon, 3)}° O`],
  ['KNMI-station', station ? `${esc(station.name)}, ${nl(station.km)} km van het park` : `geen station met uurdata binnen ${MAX_STATION_KM} km`],
  ...(station ? [['Gemiddelde wind 2025', `${nl(station.mean)} m/s op 10 m hoogte (${esc(station.name)})`]] : [])];
 const body = `<p class="atlas-kicker">Windpark op de kaart</p><h1>Waterstof bij ${esc(p.naam)}</h1>
<p class="atlas-lead">Kan een elektrolyser naast ${esc(p.naam)} waterstof maken met de stroom van dit park? De Atlas laat zien welke percelen in de buurt liggen en welke windgegevens erbij horen. De Waterstofscan rekent de verwachte productie uit.</p>
<dl class="atlas-facts">${facts.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>
<p class="atlas-actions">${station ? `<a class="atlas-cta" href="/?park=${p.id}">Kies een locatie bij dit park</a>` : ''}<a class="atlas-cta atlas-cta-alt" href="${esc(scan)}">Vraag een Waterstofscan aan</a></p>
<h2>Wat je hier wel en niet ziet</h2>
<p>De gegevens van het park komen uit OpenStreetMap en kunnen verouderd zijn. <a href="${esc(osm)}">Klopt er iets niet? Bekijk en verbeter het park in OpenStreetMap.</a> De wind is één jaar (2025) van het dichtstbijzijnde KNMI-station. De Atlas toont geen kostprijs van waterstof.</p>`;
 return docPage({title: `Waterstof bij ${p.naam} · Atlas · Mijn Windpark`, description: `${p.naam}: ${nl(p.mw)} MW windvermogen. Bekijk percelen voor een elektrolyser in de buurt en de windgegevens van het dichtstbijzijnde KNMI-station.`, canonical: parkPath(p), body});
}
function parkIndexPage() {
 const items = pageParks.map(p => `<li><a href="${parkPath(p)}">${esc(p.naam)}</a> <small>${nl(p.mw)} MW</small></li>`).join('');
 return docPage({title: 'Windparken · Atlas · Mijn Windpark', description: 'Windparken in Nederland met een pagina in de Atlas: vermogen, ligging en windgegevens voor waterstof uit wind.', canonical: '/windparken',
  body: `<p class="atlas-kicker">Atlas</p><h1>Windparken</h1><p class="atlas-lead">${pageParks.length} windparken met een naam en vermogen in OpenStreetMap. Losse turbines zonder naam staan alleen op de kaart.</p><ul class="atlas-list">${items}</ul>`});
}

// ---------------------------------------------------------------- wachtwoord en pogingen
async function sameSecret(given, secret) {
 const [x, y] = await Promise.all([given, secret].map(s => crypto.subtle.digest('SHA-256', encoder.encode(String(s)))));
 const a = new Uint8Array(x), b = new Uint8Array(y);
 let diff = 0;
 for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
 return diff === 0;
}
const attempts = new Map(), eventAttempts = new Map(), profileAttempts = new Map();
// Per IP en per soort: meer dan `max` keer binnen `windowMs` (per worker-instantie) is te veel.
function tooMany(ip, store = attempts, max = 5, windowMs = 60000) {
 const now = Date.now(), list = (store.get(ip) || []).filter(t => now - t < windowMs);
 list.push(now);
 store.set(ip, list);
 if (store.size > 5000) store.delete(store.keys().next().value);
 return list.length > max;
}

// ---------------------------------------------------------------- routes
const CSP = "default-src 'none'; script-src 'self'; worker-src blob:; child-src blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://service.pdok.nl; connect-src 'self' https://service.pdok.nl https://api.pdok.nl; font-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'";
const baseHeaders = {'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', ...(ATLAS_INDEXABLE ? {} : {'X-Robots-Tag': 'noindex, nofollow'})};
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
  if (path === '/windparken.geojson') {
   let index = null;
   try { index = await windIndex(env); } catch (e) { console.error('ATLAS_PARKS_DATA', e.message); }
   return file(parkGeojson(index), 'application/geo+json', index ? 'public, max-age=3600' : 'no-store');
  }
  if (path === '/api/atlas/stations') {
   try {
    const stations = dataStations(await windIndex(env)).map(s => ({naam: s.name, lat: s.lat, lon: s.lon, wind_gem_ms: round(s.mean, 1)}));
    return json({max_km: MAX_STATION_KM, stations}, 200, 'public, max-age=3600');
   } catch (e) {
    console.error('ATLAS_STATIONS_DATA', e.message);
    return json({error: 'Winddata is nu niet beschikbaar.'}, 503);
   }
  }
  if (path === '/robots.txt') return file(ATLAS_INDEXABLE ? `User-agent: *\nDisallow: /api/\nAllow: /\nSitemap: ${ATLAS_ORIGIN}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n', 'text/plain; charset=utf-8');
  if (path === '/sitemap.xml') return file(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/windparken', ...pageParks.map(parkPath)].map(u => `<url><loc>${ATLAS_ORIGIN}${u}</loc></url>`).join('')}</urlset>\n`, 'application/xml; charset=utf-8');
  if (path === '/windparken') return file(parkIndexPage(), 'text/html; charset=utf-8');
  const parkMatch = path.match(/^\/windpark\/(\d{1,5})(?:-([a-z0-9-]*))?$/);
  if (parkMatch) {
   const p = pageParks.find(x => x.id === Number(parkMatch[1]));
   if (!p) return notFound();
   if (parkMatch[2] !== slug(p.naam)) return new Response(null, {status: 301, headers: {...baseHeaders, Location: parkPath(p), 'Cache-Control': 'public, max-age=86400'}});
   let station = null;
   try { station = parkStations(await windIndex(env))[p.id]; } catch (e) { console.error('ATLAS_PARK_PAGE_DATA', e.message); }
   return file(parkPage(p, station), 'text/html; charset=utf-8', station ? 'public, max-age=3600' : 'no-store');
  }
  if (path === '/favicon.svg') return file(assets.favicon, 'image/svg+xml', 'public, max-age=86400');
  if (path === '/assets/tasa-orbiter.ttf') return file(Uint8Array.from(atob(assets.font), c => c.charCodeAt(0)), 'font/ttf', 'public, max-age=604800');
  if (path === '/api/atlas/teaser') {
   const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
   if (!url.searchParams.has('lat') || !url.searchParams.has('lon') || !validPoint(lat, lon)) return json({error: 'Kies een punt in Nederland.'}, 400);
   let index;
   try { index = await windIndex(env); } catch (e) {
    console.error('ATLAS_TEASER_DATA', e.message);
    return json({error: 'Winddata is nu niet beschikbaar.'}, 503);
   }
   const near = nearestParks(index, lat, lon);
   if (!near.length) return json({error: `Binnen ${MAX_PARK_KM} km van dit perceel ligt geen windpark met een KNMI-station binnen ${MAX_STATION_KM} km.`, max_km: MAX_STATION_KM, max_park_km: MAX_PARK_KM}, 422, 'public, max-age=3600');
   return json({
    windparken: near.map(p => ({id: p.id, naam: p.naam, mw: round(p.mw, 1), afstand_km: round(p.km, 1),
     station: {naam: p.station.name, afstand_km: round(p.station.km, 1), wind_gem_ms: round(p.station.mean, 1)}})),
   }, 200, 'public, max-age=3600');
  }
  return notFound();
 }
 if (method === 'POST' && path === '/api/atlas/event') {
  const ip = request.headers.get('CF-Connecting-IP') || 'onbekend';
  if (tooMany(ip, eventAttempts, 60)) return new Response(null, {status: 429, headers: baseHeaders});
  let name = '';
  try { name = String(JSON.parse((await request.text()).slice(0, 200))?.e ?? ''); } catch { name = ''; }
  if (!EVENT_NAMES.has(name) || !env.BUCKET) return new Response(null, {status: 204, headers: baseHeaders});
  try { await countEvent(env, name); } catch (e) { console.error('ATLAS_EVENT_FAILED', e.message); }
  return new Response(null, {status: 204, headers: baseHeaders});
 }
 if (method === 'POST' && path === '/api/atlas/profiel') {
  if (request.headers.get('Origin') !== url.origin) return json({error: 'Ongeldige aanvraag. Laad de pagina opnieuw.'}, 403);
  const ip = request.headers.get('CF-Connecting-IP') || 'onbekend';
  if (tooMany(ip, profileAttempts, 5, 3600000)) return json({error: 'Te veel aanvragen vanaf dit adres. Probeer het over een uur opnieuw.'}, 429);
  let body = null;
  try { const text = await request.text(); if (text.length > 8192) throw Error(); body = JSON.parse(text); } catch { body = null; }
  if (!body || typeof body !== 'object') return json({error: 'Ongeldige aanvraag.'}, 400);
  const {lead, errors, spam} = parseLead(new URLSearchParams({naam: String(body.naam ?? ''), organisatie: String(body.organisatie ?? ''), email: String(body.email ?? ''), toestemming: body.toestemming === true ? 'ja' : '', website: String(body.website ?? '')}));
  if (errors.length) return json({error: errors.join(' ')}, 400);
  const lat = Number(body.lat), lon = Number(body.lon);
  if (!validPoint(lat, lon)) return json({error: 'Kies een punt in Nederland.'}, 400);
  let index;
  try { index = await windIndex(env); } catch (e) { console.error('ATLAS_PROFILE_FAILED', e.message); return json({error: 'Winddata is nu niet beschikbaar.'}, 503); }
  const chosenParks = selectedParks(index, body.parken);
  if (!chosenParks) return json({error: `Kies 1 tot ${MAX_SELECTED_PARKS} windparken.`}, 400);
  if (chosenParks === 'geen-station') return json({error: `Een gekozen windpark heeft geen KNMI-station binnen ${MAX_STATION_KM} km.`}, 422);
  const perceel = /^[\p{L}\p{N} .'()-]{1,80}$/u.test(String(body.perceel ?? '')) ? String(body.perceel) : '';
  let profiel;
  try { profiel = await profileFor(env, index, chosenParks); } catch (e) { console.error('ATLAS_PROFILE_FAILED', e.message); return json({error: 'Het profiel is nu niet beschikbaar.'}, 503); }
  if (!profiel) return json({error: 'De gekozen windparken hebben geen bekend vermogen.'}, 400);
  const result = {perceel, lat: round(lat, 5), lon: round(lon, 5), jaar: index.jaar || 2025, ...profiel,
   windparken: chosenParks.map(p => ({naam: p.naam, mw: round(p.mw, 1), afstand_km: round(haversineKm(lat, lon, p.lat, p.lon), 1), station: {naam: p.station.name, afstand_km: round(p.station.km, 1), wind_gem_ms: round(p.station.mean, 1)}}))};
  if (!spam) {
   if (!env.BUCKET) return json({error: 'Aanvragen lukt op dit moment niet.'}, 503);
   const now = Date.now(), campagne = typeof body.bron === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(body.bron) && body.bron !== 'atlas' ? body.bron : '';
   const stored = {...lead, bron: 'atlas-profiel', pakket: 'onbekend', ontvangen: new Date(now).toISOString(),
    locatie: `${perceel ? 'Perceel ' + perceel + ' ' : ''}(${result.lat}, ${result.lon}); windparken: ${result.windparken.map(p => p.naam).join(', ')}`.slice(0, 300),
    vermogen: String(result.P_mw), toelichting: `Locatieprofiel aangevraagd in de Atlas.${campagne ? ' Campagne: ' + campagne + '.' : ''}`};
   try {
    await env.BUCKET.put(leadKey(now, crypto.randomUUID().slice(0, 8)), JSON.stringify(stored), {httpMetadata: {contentType: 'application/json'}});
    await countEvent(env, 'profiel', now).catch(() => {});
   } catch (e) { console.error('ATLAS_PROFILE_STORE_FAILED', e.message); return json({error: 'Je aanvraag kon niet worden opgeslagen. Probeer het later opnieuw.'}, 503); }
  }
  return json(result);
 }
 if (method === 'POST' && path === '/api/atlas/lcoh') {
  const ip = request.headers.get('CF-Connecting-IP') || 'onbekend';
  if (tooMany(ip)) return json({error: 'Te veel pogingen. Probeer het over een minuut opnieuw.'}, 429);
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  if (!env.SITE_PASSWORD || typeof body?.password !== 'string' || !await sameSecret(body.password, env.SITE_PASSWORD)) return json({error: 'Onjuist wachtwoord.'}, 401);
  const lat = Number(body.lat), lon = Number(body.lon);
  if (!validPoint(lat, lon)) return json({error: 'Kies een punt in Nederland.'}, 400);
  let index;
  try { index = await windIndex(env); } catch (e) {
   console.error('ATLAS_LCOH_FAILED', e.message);
   return json({error: 'De berekening is nu niet beschikbaar.'}, 503);
  }
  const chosenParks = selectedParks(index, body.parken);
  if (!chosenParks) return json({error: `Kies 1 tot ${MAX_SELECTED_PARKS} windparken.`}, 400);
  if (chosenParks === 'geen-station') return json({error: `Een gekozen windpark heeft geen KNMI-station binnen ${MAX_STATION_KM} km.`}, 422);
  // Per station het opgetelde vermogen van de gekozen parken die bij dat station horen.
  const byStation = new Map();
  for (const p of chosenParks) if (p.mw > 0) byStation.set(p.station.id, {station: p.station, P: (byStation.get(p.station.id)?.P || 0) + p.mw});
  const groups = [...byStation.values()].sort((a, b) => a.station.id.localeCompare(b.station.id));
  if (!groups.length) return json({error: 'De gekozen windparken hebben geen bekend vermogen.'}, 400);
  const P = groups.reduce((sum, g) => sum + g.P, 0);
  try {
   const key = groups.map(g => g.station.id + ':' + round(g.P, 3)).join('|');
   if (!lcohCache.has(key)) {
    const withSeries = [];
    for (const g of groups) withSeries.push({series: await windSeries(env, g.station.id), P: g.P});
    lcohCache.set(key, lcohFor(withSeries));
    if (lcohCache.size > 200) lcohCache.delete(lcohCache.keys().next().value);
   }
   const lcoh = lcohCache.get(key);
   return json({lcoh_eur_kg: lcoh === null ? null : round(lcoh, 2), windparken: chosenParks.map(p => p.naam), P_mw: round(P, 1), stations: groups.map(g => g.station.name)});
  } catch (e) {
   console.error('ATLAS_LCOH_FAILED', e.message);
   return json({error: 'De berekening is nu niet beschikbaar.'}, 503);
  }
 }
 return notFound();
}
