// Onbalansprijzen per kwartier voor één kalenderjaar en één biedzone, van het ENTSO-E Transparency Platform.
//
//   ENTSOE_TOKEN=… node scripts/update-onbalans.mjs 2025            Nederland → src/opsplitsing/data/onbalans-2025.json
//   ENTSOE_TOKEN=… node scripts/update-onbalans.mjs 2025 --zone BE  België    → src/opsplitsing/data/onbalans-BE-2025.json
//   ENTSOE_TOKEN=… node scripts/update-onbalans.mjs 2025 --alle     alle zones uit IMBALANCE_ZONES
//
// Bron: Imbalance Prices [17.1.G] (documentType A85) via https://web-api.tp.entsoe.eu/api, één verzoek per maand.
// De sleutel (security token) staat in ENTSOE_TOKEN of `transparency`; hij is alleen voor dit script nodig, niet voor de site.
// Bewaard wordt de prijs voor wie kort staat (categorie A05, Insufficient balance): wie meer afneemt dan gepland staat
// kort en wordt met die prijs afgerekend. Is die prijs negatief, dan krijgt de afnemer geld. Voor Nederland is dat
// dezelfde prijs als TenneT's Settlement Prices ‘Price Shortage’ (tests/onbalans-entsoe.test.mjs).
// curveType A03: een ontbrekende positie herhaalt de vorige waarde. Uurprijzen (Denemarken tot de overstap naar
// kwartieren) gelden voor alle vier de kwartieren van dat uur.
import {writeFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {IMBALANCE_ZONES} from '../src/electrolyser-imbalance.mjs';

const API = 'https://web-api.tp.entsoe.eu/api';

// Eén of meer XML-bestanden uit een zip (centrale map, want de lokale koppen kunnen een grootte 0 hebben).
export function unzipAll(buf) {
 let e = buf.length - 22;
 while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
 if (e < 0) throw Error('Geen geldig zipbestand');
 const n = buf.readUInt16LE(e + 10), out = [];
 for (let i = 0, p = buf.readUInt32LE(e + 16); i < n; i++) {
  const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), body = buf.subarray(start, start + size);
  out.push((method === 8 ? inflateRawSync(body) : body).toString('utf8'));
  p += 46 + nameLen + extraLen + commentLen;
 }
 return out;
}

const DUR = {PT15M: 900, PT30M: 1800, PT60M: 3600};
// Balancing_MarketDocument (A85) → [{t: UTC-seconden, s: stap, prijs}] voor één categorie (A05 kort, A04 lang).
export function parseImbalance(xml, category = 'A05') {
 const out = [];
 for (const ts of xml.split('<TimeSeries>').slice(1)) {
  for (const period of ts.split('<Period>').slice(1)) {
   const start = Date.parse(period.match(/<start>([^<]+)<\/start>/)[1]) / 1000, end = Date.parse(period.match(/<end>([^<]+)<\/end>/)[1]) / 1000;
   const step = DUR[period.match(/<resolution>([^<]+)<\/resolution>/)[1]];
   if (!step) throw Error('Onbekende resolutie in ' + period.slice(0, 200));
   const points = new Map();
   for (const pt of period.split('<Point>').slice(1)) {
    const cat = pt.match(/<imbalance_Price\.category>([^<]+)</)?.[1], amount = pt.match(/<imbalance_Price\.amount>([^<]+)</)?.[1];
    if (amount !== undefined && (!cat || cat === category)) points.set(Number(pt.match(/<position>(\d+)</)[1]), Number(amount));
   }
   if (!points.size) continue;
   let last = null;
   for (let pos = 1; start + (pos - 1) * step < end; pos++) {
    if (points.has(pos)) last = points.get(pos);
    if (last !== null) out.push({t: start + (pos - 1) * step, s: step, prijs: last});
   }
  }
 }
 return out;
}

// Lokale middernacht (Europe/Amsterdam) als UTC-seconden; alle zones hier liggen in dezelfde tijdzone.
const LOCAL = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
export const midnight = day => { for (const off of [3600, 7200]) { const t = Date.parse(day + 'T00:00:00Z') / 1000 - off; if (LOCAL.format(new Date(t * 1000)).replace(' ', 'T') === day + 'T00:00') return t; } throw Error('Geen middernacht voor ' + day); };
const stamp = t => new Date(t * 1000).toISOString().slice(0, 16).replace(/[-T:]/g, '');

async function fetchMonth(zone, from, to, token) {
 const url = new URL(API);
 for (const [k, v] of Object.entries({securityToken: token, documentType: 'A85', controlArea_Domain: zone.eic, periodStart: stamp(from), periodEnd: stamp(to)})) url.searchParams.set(k, v);
 for (let attempt = 1; ; attempt++) {
  try {
   const r = await fetch(url, {signal: AbortSignal.timeout(90000)});
   const buf = Buffer.from(await r.arrayBuffer());
   if (!r.ok) throw Error(`HTTP ${r.status} ${buf.toString('utf8').match(/<text>([^<]*)/)?.[1] || ''}`);
   if (buf.readUInt32LE(0) === 0x04034b50) return unzipAll(buf);
   const xml = buf.toString('utf8');
   if (xml.includes('Acknowledgement_MarketDocument')) { if (/No matching data/.test(xml)) return []; throw Error(xml.match(/<text>([^<]*)/)?.[1] || 'onbekende fout'); }
   return [xml];
  } catch (e) {
   if (attempt >= 4) throw Error(`ENTSO-E ${zone.code} ${stamp(from)}: ${e.message}`);
   await new Promise(r => setTimeout(r, 5000 * attempt));
  }
 }
}

export async function imbalanceYear(code, year, token) {
 const zone = IMBALANCE_ZONES[code];
 if (!zone?.eic) throw Error(`Geen eigen ENTSO-E-gebied voor ${code}`);
 const start = midnight(`${year}-01-01`), end = midnight(`${year + 1}-01-01`), prijs = Array((end - start) / 900).fill(null);
 const pad = n => String(n).padStart(2, '0'), steps = new Set();
 for (let m = 1; m <= 12; m++) {
  const from = midnight(`${year}-${pad(m)}-01`), to = m === 12 ? end : midnight(`${year}-${pad(m + 1)}-01`);
  let n = 0;
  for (const xml of await fetchMonth(zone, from, to, token)) for (const {t, s, prijs: v} of parseImbalance(xml)) {
   steps.add(s);
   for (let q = 0; q < s; q += 900) { const i = (t + q - start) / 900; if (i >= 0 && i < prijs.length && t + q >= from && t + q < to) { prijs[i] = v; n++; } }
  }
  console.log(`${code} ${year}-${pad(m)}: ${n} kwartieren`);
 }
 const missing = prijs.filter(v => v === null).length;
 const uur = steps.has(3600) ? (steps.has(900) ? ', deels uurprijzen' : ', uurprijzen per kwartier herhaald') : '';
 return {jaar: year, zone: code, bron: `ENTSO-E Transparency Platform, Imbalance Prices (${zone.tso}), prijs bij tekort (categorie A05), €/MWh per kwartier${uur}`, opgehaald: new Date().toISOString().slice(0, 10), start, stap: 900, ontbrekend: missing, prijs};
}

if (import.meta.url === `file://${process.argv[1]}`) {
 const args = process.argv.slice(2), year = Number(args[0]);
 if (!Number.isInteger(year) || year < 2015) { console.error('Gebruik: node scripts/update-onbalans.mjs <jaar> [--zone NL|BE|DE|FR|DK1|DK2] [--alle]'); process.exit(1); }
 const token = process.env.ENTSOE_TOKEN || process.env.transparency;
 if (!token) { console.error('Zet ENTSOE_TOKEN (security token van transparency.entsoe.eu).'); process.exit(1); }
 const z = args.indexOf('--zone'), codes = args.includes('--alle') ? Object.keys(IMBALANCE_ZONES).filter(c => IMBALANCE_ZONES[c].eic) : [z >= 0 ? args[z + 1] : 'NL'];
 for (const code of codes) {
  const out = await imbalanceYear(code, year, token);
  const file = code === 'NL' ? `onbalans-${year}.json` : `onbalans-${code}-${year}.json`;
  writeFileSync(new URL(`../src/opsplitsing/data/${file}`, import.meta.url), JSON.stringify(out) + '\n');
  console.log(`Geschreven: ${file}, ${out.prijs.length} kwartieren, ${out.ontbrekend} zonder prijs.`);
 }
}
