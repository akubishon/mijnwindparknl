// Projectstudio: tienminutenwind uit de buurlanden, in dezelfde vorm als KNMI EDR.
// Elke bron geeft metingen als { t: einde van het interval (ms UTC), ff: m/s op 10 m, dd: graden }. Alle drie de bronnen
// stempelen, net als KNMI, het einde van het tien-minuteninterval:
//   DWD  FF_10 "mean wind speed during the previous 10 minutes", MESS_DATUM in UTC (vanaf 2000).
//   KMI  wind_speed_10m "average wind speed at 10 m over the last 10 min"; uur H = waarden (H-1):10 … H:00.
//   DMI  wind_speed "latest 10 minutes' mean wind speed", observed in UTC.
//   MF   (Météo-France, Frankrijk) alleen uurwaarden open: FF = 10-minutengemiddelde op 10 m dat op het hele uur eindigt
//        (UTC). De tien minuten ertussen worden lineair geïnterpoleerd tussen twee opeenvolgende uren (aanname).
// Staat de windmeter niet op 10 m (DWD vaak 12–15 m), dan wordt de snelheid omgerekend met (10/h)^(1/7) (aanname).
import { stationById } from './station-catalog.mjs';

const DWD = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/10_minutes/wind/';
const KMI = 'https://opendata.meteo.be/service/ows';
const DMI = 'https://opendataapi.dmi.dk/v2/metObs/collections/observation/items';
const MF = 'https://meteofrance.s3.sbg.io.cloud.ovh.net/data/synchro_ftp/BASE/HOR/';
export const HEIGHT_EXPONENT = 1 / 7;
const timeout = () => AbortSignal.timeout(90000);
const number = v => { const x = typeof v === 'number' ? v : Number(String(v).trim()); return Number.isFinite(x) ? x : null; };
const speed = v => { const x = number(v); return x !== null && x >= 0 && x < 100 ? x : null; };
const direction = v => { const x = number(v); return x !== null && x >= 0 && x <= 360 ? x : null; };
const fail = (source, status) => Error(status === 429 ? source + '_QUOTA' : source + '_UNAVAILABLE');
export const heightFactor = h => !h || h === 10 ? 1 : (10 / h) ** HEIGHT_EXPONENT;

// ---------- Zip (DWD) ----------
// Centrale map lezen, dan het gevraagde bestand inflaten met DecompressionStream (Workers en Node).
async function inflate(bytes) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
export async function unzipText(buffer, match) {
  const bytes = new Uint8Array(buffer), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw Error('DWD_BAD_ZIP');
  let p = view.getUint32(end + 16, true);
  const count = view.getUint16(end + 10, true), decoder = new TextDecoder('latin1');
  for (let k = 0; k < count; k++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw Error('DWD_BAD_ZIP');
    const method = view.getUint16(p + 10, true), size = view.getUint32(p + 20, true), nameLength = view.getUint16(p + 28, true), extra = view.getUint16(p + 30, true), comment = view.getUint16(p + 32, true), offset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    if (match.test(name)) {
      const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true), body = bytes.subarray(start, start + size);
      return decoder.decode(method === 8 ? await inflate(body) : body);
    }
    p += 46 + nameLength + extra + comment;
  }
  throw Error('DWD_BAD_ZIP');
}

// ---------- DWD (Duitsland) ----------
// Historische bestanden lopen tot eind vorig jaar (bijv. 20200101_20251231), recent/ bevat de laatste ~500 dagen.
export function parseDWD(text, from, to) {
  const out = { t: [], ff: [], dd: [] };
  for (const line of text.split('\n')) {
    const f = line.split(';');
    if (f.length < 5 || !/^\s*\d+$/.test(f[0])) continue;
    const s = f[1].trim(), t = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12));
    if (!(t >= from && t <= to)) continue;
    out.t.push(t); out.ff.push(speed(f[3]) === null || number(f[3]) === -999 ? null : speed(f[3])); out.dd.push(number(f[4]) === -999 ? null : direction(f[4]));
  }
  return out;
}
const ymd = ms => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '');
async function dwd(code, from, to, fetchImpl) {
  const files = [];
  const listing = await fetchImpl(DWD + 'historical/', { signal: timeout() });
  if (!listing.ok) throw fail('DWD', listing.status);
  const html = await listing.text(), pattern = new RegExp(`10minutenwerte_wind_${code}_(\\d{8})_(\\d{8})_hist\\.zip`, 'g');
  let lastHistorical = '00000000';
  for (const m of new Set([...html.matchAll(pattern)].map(m => m[0]))) {
    const [, a, b] = m.match(/_(\d{8})_(\d{8})_hist/);
    if (b > lastHistorical) lastHistorical = b;
    if (a <= ymd(to) && b >= ymd(from)) files.push('historical/' + m);
  }
  if (lastHistorical < ymd(to)) files.push(`recent/10minutenwerte_wind_${code}_akt.zip`);
  const parts = [];
  for (const file of files) {
    const r = await fetchImpl(DWD + file, { signal: timeout() });
    if (r.status === 404) continue;
    if (!r.ok) throw fail('DWD', r.status);
    parts.push(parseDWD(await unzipText(await r.arrayBuffer(), /^produkt_.*\.txt$/), from, to));
  }
  return merge(parts);
}

// ---------- KMI (België) ----------
export function parseKMI(csv) {
  const out = { t: [], ff: [], dd: [] }, lines = csv.split('\n'), head = lines[0].split(',').map(s => s.trim());
  const it = head.indexOf('timestamp'), iff = head.indexOf('wind_speed_10m'), idd = head.indexOf('wind_direction');
  if (it < 0 || iff < 0) throw Error('KMI_UNAVAILABLE');
  for (const line of lines.slice(1)) {
    const f = line.split(','); if (f.length <= iff) continue;
    const stamp = f[it].trim(), t = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(stamp) ? stamp : stamp + 'Z');
    if (Number.isFinite(t)) { out.t.push(t); out.ff.push(f[iff] === '' ? null : speed(f[iff])); out.dd.push(idd < 0 || f[idd] === '' ? null : direction(f[idd])); }
  }
  return out;
}
async function kmi(code, from, to, fetchImpl) {
  const iso = ms => new Date(ms).toISOString().replace('.000', '');
  const query = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', typenames: 'aws:aws_10min', outputFormat: 'csv', propertyName: 'code,timestamp,wind_speed_10m,wind_direction', CQL_FILTER: `code=${Number(code)} AND timestamp DURING ${iso(from)}/${iso(to)}` });
  const r = await fetchImpl(KMI + '?' + query, { signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw fail('KMI', r.status);
  return parseKMI(await r.text());
}

// ---------- DMI (Denemarken) ----------
export function parseDMI(raw, read = speed) {
  const out = { t: [], ff: [], dd: [] };
  for (const f of raw?.features || []) { const t = Date.parse(f.properties?.observed); if (Number.isFinite(t)) { out.t.push(t); out.ff.push(read(f.properties.value)); out.dd.push(null); } }
  return out;
}
async function dmi(code, from, to, fetchImpl) {
  const iso = ms => new Date(ms).toISOString().replace('.000', '');
  const get = async (parameter, read) => {
    const r = await fetchImpl(DMI + '?' + new URLSearchParams({ stationId: code, parameterId: parameter, datetime: `${iso(from)}/${iso(to)}`, limit: '300000' }), { headers: { Accept: 'application/geo+json' }, signal: timeout() });
    if (!r.ok) throw fail('DMI', r.status);
    return parseDMI(await r.json(), read);
  };
  const s = await get('wind_speed', speed);
  // Richting alleen voor korte perioden (dagweergave); voor een windjaar is alleen de snelheid nodig.
  if (to - from <= 3 * 86400000) { const d = await get('wind_dir', direction), at = new Map(d.t.map((t, i) => [t, d.ff[i]])); s.dd = s.t.map(t => at.get(t) ?? null); }
  return s;
}

// ---------- Météo-France (Frankrijk) ----------
// Eén gzip-csv per departement en periode met alle stations; gestreamd uitpakken en alleen de regels van dit station
// bewaren, zodat het geheugen klein blijft (een bestand is uitgepakt 50–150 MB).
export function mfFiles(dep, from, to) {
  const years = [new Date(from).getUTCFullYear(), new Date(to).getUTCFullYear()], files = new Set();
  for (let y = years[0]; y <= years[1]; y++) {
    if (y >= 2025) files.add(`H_${dep}_latest-2025-2026.csv.gz`);
    else if (y >= 2020) files.add(`H_${dep}_previous-2020-2024.csv.gz`);
    else { const d = Math.floor(y / 10) * 10; files.add(`H_${dep}_${d}-${d + 9}.csv.gz`); }
  }
  return [...files];
}
export async function parseMFStream(stream, poste, from, to) {
  const hours = new Map(), decoder = stream.pipeThrough(new TextDecoderStream()).getReader();
  let rest = '', head = null;
  const take = line => {
    if (!head) { head = Object.fromEntries(line.split(';').map((k, i) => [k.trim(), i])); return; }
    if (!line.startsWith(poste + ';')) return;
    const f = line.split(';'), s = f[head.AAAAMMJJHH], t = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10));
    if (t >= from - 3600000 && t <= to + 3600000) hours.set(t, [f[head.FF] === '' ? null : speed(f[head.FF]), f[head.DD] === '' ? null : direction(f[head.DD])]);
  };
  for (;;) {
    const { value, done } = await decoder.read();
    if (done) break;
    const lines = (rest + value).split('\n'); rest = lines.pop();
    for (const line of lines) take(line.replace(/\r$/, ''));
  }
  if (rest) take(rest);
  return hours;
}
// Uur → tien minuten: waarde op het hele uur, lineair naar het volgende uur; zonder buurwaarde blijft het moment leeg.
export function interpolateHours(hours, from, to) {
  const out = { t: [], ff: [], dd: [] }, H = 3600000;
  for (let t = Math.ceil(from / 600000) * 600000; t <= to; t += 600000) {
    const h0 = Math.floor(t / H) * H, a = hours.get(h0), w = (t - h0) / H;
    let v = a?.[0] ?? null;
    if (w > 0) { const b = hours.get(h0 + H); v = a?.[0] != null && b?.[0] != null ? a[0] + (b[0] - a[0]) * w : null; }
    out.t.push(t); out.ff.push(v === null ? null : Math.round(v * 1000) / 1000); out.dd.push(a?.[1] ?? null);
  }
  return out;
}
async function mf(poste, dep, from, to, fetchImpl) {
  const hours = new Map();
  for (const file of mfFiles(dep, from, to)) {
    const r = await fetchImpl(MF + file, { signal: AbortSignal.timeout(180000) });
    if (r.status === 404) continue;
    if (!r.ok || !r.body) throw fail('MF', r.status);
    for (const [t, v] of await parseMFStream(r.body.pipeThrough(new DecompressionStream('gzip')), poste, from, to)) hours.set(t, v);
  }
  return interpolateHours(hours, from, to);
}

// Delen samenvoegen: gesorteerd, per tijdstempel de laatste (recent/ gaat voor historical/ bij overlap).
function merge(parts) {
  const map = new Map();
  for (const p of parts) p.t.forEach((t, i) => map.set(t, [p.ff[i], p.dd[i]]));
  const t = [...map.keys()].sort((a, b) => a - b);
  return { t, ff: t.map(x => map.get(x)[0]), dd: t.map(x => map.get(x)[1]) };
}

// Metingen van één buitenlands station tussen from en to (ms, tijdstempels = einde interval), omgerekend naar 10 m.
export async function foreignSamples(stationId, from, to, fetchImpl = fetch) {
  const s = stationById(stationId);
  if (!s || s.bron === 'knmi') throw Error('UNKNOWN_STATION');
  const code = stationId.slice(stationId.indexOf('-') + 1);
  const raw = s.bron === 'dwd' ? await dwd(code, from, to, fetchImpl) : s.bron === 'kmi' ? await kmi(code, from, to, fetchImpl) : s.bron === 'mf' ? await mf(code, s.departement, from, to, fetchImpl) : await dmi(code, from, to, fetchImpl);
  const sorted = merge([raw]), f = heightFactor(s.meethoogte_m);
  return { ...sorted, ff: sorted.ff.map(v => v === null ? null : Math.round(v * f * 1000) / 1000) };
}

// Zelfde vorm als een KNMI EDR-antwoord (CoverageJSON), zodat modelHours() en averageMany() ongewijzigd werken.
export function coverageOf(stationId, samples) {
  return { type: 'CoverageCollection', parameters: { ff: { unit: { symbol: { value: 'm/s' } } }, dd: { unit: { symbol: { value: 'degree' } } } },
    coverages: [{ 'eumetnet:locationId': stationId, domain: { axes: { t: { values: samples.t.map(t => new Date(t).toISOString()) } } }, ranges: { ff: { values: samples.ff }, dd: { values: samples.dd } } }] };
}
