// Projectstudio (C1): tienminutenwind per meetstation (KNMI, DWD, KMI, DMI) en windjaar, compact in R2.
// Bestand: studio/v1/wind10/<stationId>/<jaar>.json met `data` = base64 van een Uint16Array (LE), ff op 10 m in 0,01 m/s,
// 65535 = ontbrekend, op de tijdas van yearAxis(jaar) (KNMI-tijdstempel −5 minuten, zoals knmi.py en de bundel).
import { STATIONS, SOURCES, stationById, knownStation as known } from './station-catalog.mjs';
import { foreignSamples } from './sources.mjs';
import { yearAxis, YEARS } from './supply.mjs';

export const MISSING = 65535, PREFIX = 'studio/v1/wind10/', INDEX_KEY = PREFIX + 'index.json';
export const SOURCE = Object.values(SOURCES).map(s => s.lang).join('; ');
const EDR = 'https://api.dataplatform.knmi.nl/edr/v1/collections/10-minute-in-situ-meteorological-observations/locations/';
// KNMI-stations in Europees Nederland en de Noordzee (niet Caribisch Nederland) plus de buurlanden.
export const STUDIO_STATIONS = STATIONS;
export const knownStation = known;

const toBase64 = bytes => { let text = ''; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(text); };
const fromBase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

export function encodeSeries(values) {
  const out = new Uint16Array(values.length), view = new DataView(out.buffer);
  for (let i = 0; i < values.length; i++) {
    const v = values[i], u = Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : MISSING;
    view.setUint16(i * 2, u < MISSING ? u : MISSING, true);
  }
  return toBase64(new Uint8Array(out.buffer));
}
export function decodeSeries(file) {
  const bytes = fromBase64(file.data), view = new DataView(bytes.buffer), n = bytes.length / 2;
  if (n !== file.n) throw Error('Windbestand heeft een onverwachte lengte.');
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) { const u = view.getUint16(i * 2, true); out[i] = u === MISSING ? NaN : u / 100; }
  return out;
}

// CoverageJSON van KNMI EDR (één of meer antwoorden) → reeks op de jaaras; waarden buiten het jaar vallen weg.
export function seriesFromCoverage(raws, stationId, year) {
  const axis = yearAxis(year), out = new Float64Array(axis.n).fill(NaN);
  for (const raw of [].concat(raws)) {
    const c = raw?.coverages?.[0];
    if (raw?.coverages?.length !== 1 || c?.['eumetnet:locationId'] !== stationId || raw.parameters?.ff?.unit?.symbol?.value !== 'm/s') throw Error('Onverwacht KNMI-antwoord.');
    const stamps = c.domain?.axes?.t?.values || [], ff = c.ranges?.ff?.values || [];
    if (stamps.length !== ff.length) throw Error('Onverwachte KNMI-tijdas.');
    for (let k = 0; k < stamps.length; k++) {
      const i = (Date.parse(stamps[k]) / 1000 - 300 - axis.start) / 600, v = ff[k];
      if (Number.isInteger(i) && i >= 0 && i < axis.n && typeof v === 'number' && Number.isFinite(v) && v >= 0) out[i] = v;
    }
  }
  return out;
}

export function windFile(station, year, series) {
  const axis = yearAxis(year), s = stationById(station);
  return { station, naam: s?.name || station, bron: s?.bron || 'knmi', land: s?.land || 'NL', meethoogte_m: s?.meethoogte_m ?? 10, jaar: year, start: new Date(axis.start * 1000).toISOString(), stap_s: 600, eenheid: '0,01 m/s', ontbrekend: MISSING, n: axis.n, data: encodeSeries(series) };
}
export function seriesStats(series) {
  let n = 0, sum = 0;
  for (const v of series) if (!Number.isNaN(v)) { n++; sum += v; }
  return { dekking: series.length ? n / series.length : 0, gemiddeld_ms: n ? sum / n : null, n };
}

// Eén windjaar ophalen bij KNMI EDR in één verzoek, zoals observations_range() in knmi.py. KNMI telt verzoeken per uur
// (quotum per sleutel); alleen als het hele jaar niet in één antwoord past, volgen vier kwartalen.
async function edr(stationId, from, to, key, fetchImpl) {
  const query = new URLSearchParams({ datetime: `${new Date(from * 1000).toISOString()}/${new Date(to * 1000).toISOString()}`, 'parameter-name': 'ff' });
  const r = await fetchImpl(EDR + encodeURIComponent(stationId) + '?' + query, { headers: { Authorization: key.trim(), Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(60000) });
  if (r.status === 404 || r.status === 204) return null;   // geen metingen in deze periode
  if (r.ok) return r.json();
  const text = await r.text().catch(() => '');
  throw Error(r.status === 429 || /quota/i.test(text) ? 'KNMI_QUOTA' : r.status === 401 || r.status === 403 ? 'KNMI_AUTH' : r.status === 400 || r.status === 413 ? 'KNMI_TOO_LARGE' : 'KNMI_UNAVAILABLE');
}
export async function fetchStationYear(stationId, year, key, fetchImpl = fetch) {
  if (!key) throw Error('KNMI_NOT_CONFIGURED');
  const axis = yearAxis(year), from = axis.start - 300, to = axis.start - 300 + axis.n * 600;
  try { return seriesFromCoverage([await edr(stationId, from, to, key, fetchImpl)].filter(Boolean), stationId, year); }
  catch (e) { if (e.message !== 'KNMI_TOO_LARGE') throw e; }
  const raws = [], step = Math.ceil((to - from) / 4 / 600) * 600;
  for (let a = from; a < to; a += step) { const raw = await edr(stationId, a, Math.min(to, a + step), key, fetchImpl); if (raw) raws.push(raw); }
  return seriesFromCoverage(raws, stationId, year);
}

// Metingen van een buitenlands station (sources.mjs) → reeks op de jaaras, zoals seriesFromCoverage.
export function seriesFromSamples(samples, year) {
  const axis = yearAxis(year), out = new Float64Array(axis.n).fill(NaN);
  samples.t.forEach((t, k) => { const i = (t / 1000 - 300 - axis.start) / 600, v = samples.ff[k]; if (Number.isInteger(i) && i >= 0 && i < axis.n && v !== null) out[i] = v; });
  return out;
}
// Eén windjaar van elk station: KNMI met de EDR-sleutel, de buurlanden via hun open data (geen sleutel).
export async function fetchAnyStationYear(stationId, year, env, fetchImpl = fetch) {
  if (stationById(stationId)?.bron === 'knmi') return fetchStationYear(stationId, year, env.KNMI_EDR_API_KEY, fetchImpl);
  const axis = yearAxis(year);
  return seriesFromSamples(await foreignSamples(stationId, (axis.start - 300) * 1000, (axis.start - 300 + axis.n * 600) * 1000, fetchImpl), year);
}

const entryOf = s => ({ id: s.id, naam: s.name, lat: s.latitude, lon: s.longitude, land: s.land, bron: s.bron, meethoogte_m: s.meethoogte_m, dekking: {}, gemiddeld_ms: null });
// Bewaarde index aanvullen met stations die later aan de catalogus zijn toegevoegd (buurlanden), zonder dekking te verliezen.
export function completeIndex(index) {
  if (!index) return emptyIndex();
  const have = new Map(index.stations.map(s => [s.id, s]));
  const stations = STUDIO_STATIONS.map(s => ({ ...entryOf(s), ...(have.get(s.id) || {}), land: s.land, bron: s.bron, meethoogte_m: s.meethoogte_m }));
  return { ...index, bron: SOURCE, stations, voorlopig: stations.some(s => YEARS.some(y => s.dekking?.[y] === undefined)) };
}

// Index zonder bewaarde data: alle stations, dekking nog onbekend.
export const emptyIndex = () => ({ jaren: [...YEARS], bron: SOURCE, voorlopig: true, stations: STUDIO_STATIONS.map(entryOf) });
export function updateIndex(index, station, year, stats) {
  const next = completeIndex(structuredClone(index || emptyIndex())), entry = next.stations.find(s => s.id === station);
  if (!entry) return next;
  entry.dekking[year] = Math.round(stats.dekking * 1000) / 1000;
  entry._mean = { ...(entry._mean || {}), [year]: [stats.gemiddeld_ms, stats.n] };
  const parts = Object.values(entry._mean).filter(([m]) => m !== null), total = parts.reduce((s, [, n]) => s + n, 0);
  entry.gemiddeld_ms = total ? Math.round(parts.reduce((s, [m, n]) => s + m * n, 0) / total * 100) / 100 : null;
  next.voorlopig = next.stations.some(s => YEARS.some(y => s.dekking[y] === undefined));
  return next;
}

async function readJSON(bucket, key) { const o = await bucket.get(key); return o ? o.json() : null; }

// GET /api/studio/stations en GET /api/studio/wind10/<stationId>/<jaar> (achter het wachtwoord, alleen op intern.).
export async function windRoute(request, env, url, answer, fetchImpl = fetch) {
  if (url.pathname === '/api/studio/stations') {
    const index = env.BUCKET ? await readJSON(env.BUCKET, INDEX_KEY) : null;
    return answer(completeIndex(index));
  }
  const m = url.pathname.match(/^\/api\/studio\/wind10\/(0-20000-0-\d{5}|0-528-0-\d{5}|dwd-\d{5}|kmi-\d{4,8}|dmi-\d{5})\/(\d{4})$/);
  if (!m) return null;
  const [, station, yearText] = m, year = Number(yearText);
  if (!knownStation(station) || !YEARS.includes(year)) return answer({ error: 'Onbekend station of windjaar.' }, 400);
  if (!env.BUCKET) return answer({ error: 'De opslag is niet gekoppeld.' }, 503);
  const key = `${PREFIX}${station}/${year}.json`, stored = await env.BUCKET.get(key);
  if (stored) return new Response(stored.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=86400' } });
  let series;
  try { series = await fetchAnyStationYear(station, year, env, fetchImpl); }
  catch (e) {
    const source = SOURCES[stationById(station).bron].naam;
    if (!e.message.startsWith('KNMI')) { console.error('STUDIO_WIND_FAILED', station, e?.message); return answer({ error: e.message.endsWith('_QUOTA') ? `${source} beperkt het aantal verzoeken. Probeer het later opnieuw.` : `De open data van ${source} is tijdelijk niet beschikbaar. Probeer het opnieuw.` }, e.message.endsWith('_QUOTA') ? 429 : 502); } const auth = e.message === 'KNMI_AUTH' || e.message === 'KNMI_NOT_CONFIGURED'; return answer({ error: e.message === 'KNMI_QUOTA' ? 'Het uurquotum van KNMI EDR is op. Probeer het over een uur opnieuw.' : auth ? 'KNMI EDR is niet ingesteld of weigert de sleutel.' : 'KNMI EDR is tijdelijk niet beschikbaar. Probeer het opnieuw.' }, e.message === 'KNMI_QUOTA' ? 429 : 502); }
  const file = windFile(station, year, series);
  await env.BUCKET.put(key, JSON.stringify(file), { httpMetadata: { contentType: 'application/json' } });
  try { await env.BUCKET.put(INDEX_KEY, JSON.stringify(updateIndex(await readJSON(env.BUCKET, INDEX_KEY), station, year, seriesStats(series)))); } catch {}
  return answer(file);
}
