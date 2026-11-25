// Projectstudio: tienminutenwind van alle KNMI-stations voor de windjaren vooraf ophalen (C1).
//   node scripts/studio-data.mjs wind10 [--upload] [--station <id>] [--jaar <jaar>]
// Bestanden komen in .cache/studio/wind10/ (studio/v1/wind10/<id>/<jaar>.json en index.json); met --upload ook in R2
// (bucket mijnwindpark, via wrangler). KNMI_EDR_API_KEY komt uit de omgeving of .env.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUDIO_STATIONS, PREFIX, INDEX_KEY, fetchStationYear, windFile, seriesStats, updateIndex, emptyIndex, decodeSeries } from '../src/studio/wind-data.mjs';
import { YEARS } from '../src/studio/supply.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), cache = resolve(root, '.cache/studio');
try { process.loadEnvFile(resolve(root, '.env')); } catch {}
const args = process.argv.slice(2), flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
if (args[0] !== 'wind10') { console.error('Gebruik: node scripts/studio-data.mjs wind10 [--upload] [--station <id>] [--jaar <jaar>]'); process.exit(2); }
const key = process.env.KNMI_EDR_API_KEY;
if (!key) { console.error('KNMI_EDR_API_KEY ontbreekt (omgeving of .env).'); process.exit(1); }
const stations = STUDIO_STATIONS.filter(s => !flag('--station') || s.id === flag('--station'));
const years = YEARS.filter(y => !flag('--jaar') || y === Number(flag('--jaar')));
const upload = args.includes('--upload');
const put = (objectKey, file) => {
  const path = resolve(cache, objectKey.slice('studio/v1/'.length));
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(file));
  if (upload) { const r = spawnSync('npx', ['wrangler', 'r2', 'object', 'put', `mijnwindpark/${objectKey}`, '--file', path, '--content-type', 'application/json', '--remote'], { stdio: 'inherit' }); if (r.status) throw Error('Upload mislukt: ' + objectKey); }
  return path;
};
const indexPath = resolve(cache, INDEX_KEY.slice('studio/v1/'.length));
let index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : emptyIndex();
for (const station of stations) for (const year of years) {
  const objectKey = `${PREFIX}${station.id}/${year}.json`, local = resolve(cache, objectKey.slice('studio/v1/'.length));
  let series;
  if (existsSync(local)) series = decodeSeries(JSON.parse(readFileSync(local, 'utf8')));
  else {
    // KNMI telt verzoeken per uur: bij een vol quotum tien minuten wachten en opnieuw (hooguit twee uur).
    for (let attempt = 0; ; attempt++) {
      try { series = await fetchStationYear(station.id, year, key); break; }
      catch (e) {
        if (e.message === 'KNMI_QUOTA' && attempt < 12) { console.error(`${station.name} ${year}: quotum op, over 10 minuten opnieuw`); await new Promise(r => setTimeout(r, 600000)); continue; }
        console.error(`${station.name} ${year}: ${e.message}`); break;
      }
    }
    if (!series) continue;
    put(objectKey, windFile(station.id, year, series));
  }
  const stats = seriesStats(series);
  index = updateIndex(index, station.id, year, stats);
  console.log(`${station.name.padEnd(28)} ${year}  dekking ${(stats.dekking * 100).toFixed(1)} %  gemiddeld ${stats.gemiddeld_ms?.toFixed(2) ?? '–'} m/s`);
}
put(INDEX_KEY, index);
console.log(`Index met ${index.stations.length} stations bewaard${upload ? ' en geüpload' : ''}.`);
