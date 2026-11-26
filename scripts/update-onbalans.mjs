// Onbalansprijzen van TenneT per kwartier voor één kalenderjaar → src/opsplitsing/data/onbalans-<jaar>.json.
//
//   TENNET_API_KEY=… node scripts/update-onbalans.mjs 2024          haalt 12 maanden op bij api.tennet.eu
//   node scripts/update-onbalans.mjs 2024 --uit-map <map>            leest eerder opgehaalde CSV's <map>/<jaar>-<mm>.csv
//
// Bron: Settlement Prices (/publications/v1/settlement-prices, https://developer.tennet.eu/specs/settlement-prices).
// Productie staat 25 verzoeken per dag en 5 per minuut toe; dit script wacht daarom 13 s tussen de maanden.
// Bewaard wordt de prijs bij tekort (Price Shortage): wie meer afneemt dan gepland staat kort en wordt met die prijs
// afgerekend. Is die prijs negatief, dan krijgt de afnemer geld. ISP-nummers tellen per lokale dag (92 of 100 op de
// dagen van de klokwissel); de UTC-tijd volgt uit lokale middernacht + (ISP − 1) × 15 minuten.
import {readFileSync, writeFileSync} from 'node:fs';

const args = process.argv.slice(2), year = Number(args[0]);
if (!Number.isInteger(year) || year < 2020) { console.error('Gebruik: node scripts/update-onbalans.mjs <jaar> [--uit-map <map>]'); process.exit(1); }
const dirArg = args.indexOf('--uit-map'), dir = dirArg >= 0 ? args[dirArg + 1] : null;
const key = process.env.TENNET_API_KEY || process.env.tennet;
if (!dir && !key) { console.error('Zet TENNET_API_KEY of gebruik --uit-map.'); process.exit(1); }

const pad = n => String(n).padStart(2, '0');
async function month(m) {
 if (dir) return readFileSync(`${dir}/${year}-${pad(m)}.csv`, 'utf8');
 const next = m === 12 ? [1, year + 1] : [m + 1, year];
 const url = new URL('https://api.tennet.eu/publications/v1/settlement-prices');
 url.searchParams.set('date_from', `01-${pad(m)}-${year} 00:00:00`);
 url.searchParams.set('date_to', `01-${pad(next[0])}-${next[1]} 00:00:00`);
 const r = await fetch(url, {headers: {apikey: key, Accept: 'text/csv'}});
 if (!r.ok) throw Error(`TenneT ${year}-${pad(m)}: HTTP ${r.status} ${await r.text()}`);
 return r.text();
}
// Lokale middernacht (Europe/Amsterdam) als UTC-seconden.
const LOCAL = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
const midnight = day => { for (const off of [3600, 7200]) { const t = Date.parse(day + 'T00:00:00Z') / 1000 - off; if (LOCAL.format(new Date(t * 1000)).replace(' ', 'T') === day + 'T00:00') return t; } throw Error('Geen middernacht voor ' + day); };

const start = midnight(`${year}-01-01`), end = midnight(`${year + 1}-01-01`), prijs = Array((end - start) / 900).fill(null);
for (let m = 1; m <= 12; m++) {
 if (m > 1 && !dir) await new Promise(r => setTimeout(r, 13000));
 const lines = (await month(m)).trim().split(/\r?\n/), sep = lines[0].includes(';') ? ';' : ',';
 const head = lines[0].split(sep), cDay = head.indexOf('Timeinterval Start Loc'), cIsp = head.indexOf('Isp'), cPrice = head.indexOf('Price Shortage');
 if (cDay < 0 || cIsp < 0 || cPrice < 0) throw Error(`${year}-${pad(m)}: onbekende kolommen ${head.join(', ')}`);
 const days = new Map();
 for (const line of lines.slice(1)) {
  const c = line.split(sep), day = c[cDay].slice(0, 10), v = c[cPrice];
  if (v === '' || v === undefined) continue;
  if (!days.has(day)) days.set(day, midnight(day));
  const i = (days.get(day) + (Number(c[cIsp]) - 1) * 900 - start) / 900;
  if (i >= 0 && i < prijs.length) prijs[i] = Number(v);
 }
 console.log(`${year}-${pad(m)}: ${lines.length - 1} kwartieren`);
}
const missing = prijs.filter(v => v === null).length;
const out = {jaar: year, bron: 'TenneT Settlement Prices, prijs bij tekort (Price Shortage), €/MWh per kwartier', opgehaald: new Date().toISOString().slice(0, 10), start, stap: 900, ontbrekend: missing, prijs};
writeFileSync(new URL(`../src/opsplitsing/data/onbalans-${year}.json`, import.meta.url), JSON.stringify(out) + '\n');
console.log(`Geschreven: ${prijs.length} kwartieren, ${missing} zonder prijs.`);
