import {assets as opsAssets,html as opsPage,policy as opsPolicy} from './compose-opsplitsing.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { PUBLIC_STYLE } from '../src/public-site.mjs';
// Openbare pagina's worden letterlijk in de worker geplakt: importregels en het exportwoord verdwijnen, de namen komen
// in één scope. Volgorde: gedeelde opmaak, startpagina, Waterstofscan, aanvragen.
const paste = file => readFileSync(file, 'utf8').replace(/^import .*;\s*$/gm, '').replaceAll('export ', '');
const result = await build({ entryPoints: ['src/client.tsx'], bundle: true, write: false, minify: true, format: 'iife', target: ['es2022'], jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const client = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const calculator = (await build({ entryPoints: ['src/electrolyser-worker.mjs'], bundle: true, write: false, minify: true, format: 'iife', target: ['es2022'] })).outputFiles[0].text;
const css = (readFileSync('src/styles.css', 'utf8').replace('@import "tailwindcss";', '')+'\n'+readFileSync('src/brand-style.css','utf8')+'\n'+readFileSync('src/landing.css','utf8')+'\n'+readFileSync('src/electrolyser-hub.css','utf8')+'\n'+readFileSync('src/product.css','utf8'));
const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Mijnwindpark.nl: bekijk windproductie van Fryslân en Beabuorren en verken elektrolyse, waterstof en onderzoek."><title>Mijnwindpark.nl · Windenergie &amp; waterstof</title><link rel="icon" href="/favicon.svg"><style>${css}</style></head><body class="brand-style"><a class="site-skip" href="#inhoud">Naar de inhoud</a><div id="root"><p style="padding:40px;font-family:sans-serif">Mijnwindpark.nl laden…</p></div><noscript>Schakel JavaScript in om Mijnwindpark.nl te bekijken.</noscript><script>${client}</script></body></html>`;
const dataClient = readFileSync('src/wpf.mjs', 'utf8').replaceAll('export ', '');
const scriptHash = createHash('sha256').update(client).digest('base64');
const policy = `default-src 'none'; script-src 'sha256-${scriptHash}'; worker-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'`;
const harmonieClient=readFileSync('src/harmonie.mjs','utf8').replaceAll('export ', '');
const stationCatalog = readFileSync('src/stations.json', 'utf8');
const electrolyserClient=readFileSync('src/electrolysis.mjs','utf8').replaceAll('export ', '');
const windClient = readFileSync('src/knmi.mjs', 'utf8').replace("import stationCatalog from './stations.json' with { type: 'json' };", 'const stationCatalog = '+stationCatalog+';').replace("import heightTable from './opsplitsing/python/data/ashoogte.json' with { type: 'json' };", ()=>'const heightTable = '+readFileSync('src/opsplitsing/python/data/ashoogte.json','utf8')+';').replace("import fryslanCurve from './opsplitsing/python/data/fryslan.json' with { type: 'json' };", ()=>'const fryslanCurve = '+readFileSync('src/opsplitsing/python/data/fryslan.json','utf8')+';').replaceAll('export ', '');
const worker = readFileSync('src/worker-template.mjs', 'utf8').replace('/* __DATA_CLIENT__ */', () => dataClient).replace('/* __WIND_CLIENT__ */', () => windClient+'\n'+electrolyserClient+'\n'+harmonieClient).replace('/* __SCAN__ */', () => ['src/public-site.mjs', 'src/home-page.mjs', 'src/scan-page.mjs', 'src/leads.mjs'].map(paste).join('\n')).replace('/* __STATIONS__ */', () => stationCatalog).replace('/* __BRAND_FONT__ */',()=>JSON.stringify(readFileSync('src/assets/tasa-orbiter.ttf').toString('base64'))).replace('/* __OPS_ASSETS__ */',()=>JSON.stringify(opsAssets)).replace('/* __OPS_PAGE__ */',()=>JSON.stringify(opsPage)).replace('/* __OPS_POLICY__ */',()=>JSON.stringify(opsPolicy)).replace('/* __PAGE__ */', () => JSON.stringify(html)).replace('/* __CALC_WORKER__ */', () => JSON.stringify(calculator)).replace('/* __CSP__ */', () => JSON.stringify(policy));
mkdirSync('worker', { recursive: true });
// Atlas (atlas.mijnwindpark.nl): browserbundle zonder rekencode, serverbundle met kernel + economics.
const atlasClient = (await build({ entryPoints: ['src/atlas/client.mjs'], bundle: true, write: false, minify: true, format: 'iife', target: ['es2022'] })).outputFiles[0].text;
if (/simulate_with_replacements|capex_eur|COST_DEFAULTS|stroomprijs|electrolyser-(kernel|economics)/.test(atlasClient)) throw Error('De atlas-browserbundle bevat reken- of kostencode.');
const atlasServer = (await build({ entryPoints: ['src/atlas/server.mjs'], bundle: true, write: false, minify: true, format: 'iife', globalName: 'atlasServer', target: ['es2022'], loader: { '.geojson': 'json' } })).outputFiles[0].text;
const atlasAssets = { page: readFileSync('src/atlas/page.html', 'utf8'), script: atlasClient, style: readFileSync('node_modules/maplibre-gl/dist/maplibre-gl.css', 'utf8') + '\n' + readFileSync('src/brand-style.css', 'utf8') + '\n' + PUBLIC_STYLE + '\n' + readFileSync('src/atlas/atlas.css', 'utf8') };
// Projectstudio (intern.mijnwindpark.nl): eigen browserbundle (React, MapLibre, Vergelijken) en serverbundle.
const studioClient = (await build({ entryPoints: ['src/studio/client.tsx'], bundle: true, write: false, minify: true, format: 'iife', target: ['es2022'], jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text;
const studioServer = (await build({ entryPoints: ['src/studio/server.mjs'], bundle: true, write: false, minify: true, format: 'iife', globalName: 'studioServer', target: ['es2022'], loader: { '.geojson': 'json' } })).outputFiles[0].text;
const studioAssets = { page: readFileSync('src/studio/page.html', 'utf8'), script: studioClient, style: readFileSync('node_modules/maplibre-gl/dist/maplibre-gl.css', 'utf8') + '\n' + css + '\n' + readFileSync('src/studio/studio.css', 'utf8') };
writeFileSync('worker/index.js', worker.replace('/* __ATLAS__ */', () => atlasServer + '\nconst atlasAssets = ' + JSON.stringify(atlasAssets) + ';').replace('/* __STUDIO__ */', () => studioServer + '\nconst studioAssets = ' + JSON.stringify(studioAssets) + ';'));

console.log('Composed the standalone app worker.');
