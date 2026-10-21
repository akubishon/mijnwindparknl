import {readFileSync,readdirSync} from 'node:fs';
const root='src/opsplitsing/';
const bundle={};
function add(file,key){bundle[key]=readFileSync(root+file).toString('base64');}
for(const file of readdirSync(root+'python'))if(file.endsWith('.py'))add('python/'+file,'windprofiel/'+file);
for(const file of readdirSync(root+'python/data'))add('python/data/'+file,'windprofiel/data/'+file);
add('Amsterdam','zoneinfo/Europe/Amsterdam');add('browser-runtime.py','browser-runtime.py');
const assets={};
for(const file of ['opsplitsing.css','opsplitsing.js','bridge.js','calculator-worker.js'])assets[file]=[readFileSync(root+file,'utf8'),file.endsWith('.css')?'text/css':'text/javascript'];
assets['bundle.json']=[JSON.stringify(bundle),'application/json'];
for(const file of readdirSync(root+'data'))assets['data/'+file]=[readFileSync(root+'data/'+file,'utf8'),'application/json'];
assets['scenarios.json']=['{"scenarios":[]}','application/json'];
let html=readFileSync(root+'opsplitsing.html','utf8').replace('href="./opsplitsing.css"','href="/opsplitsing-assets/opsplitsing.css"').replace('<script src="./opsplitsing.js" defer></script>','<script src="/opsplitsing-assets/bridge.js" defer></script><script src="/opsplitsing-assets/opsplitsing.js" defer></script>').replace('href="/">Windprofiel</a>','href="/">Fryslân</a><a href="/beabuorren">Beabuorren</a><a href="/elektrolyser">Elektrolyser</a><a href="/onderzoek">Onderzoek</a>');
html=html.replace('Lokale analyse · Europe/Amsterdam','Tijden in Nederland').replace('<section class="intro">','<section class="intro"><p class="note">De berekeningen draaien op dit apparaat. Houd deze pagina open tijdens het rekenen. Het eerste gebruik downloadt het rekenmodel; grote analyses kunnen enkele minuten duren.</p>');
const policy="default-src 'none'; script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'; form-action 'self'";
export {assets,html,policy};
