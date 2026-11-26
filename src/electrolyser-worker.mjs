// Dedicated worker for /elektrolyser: runs comparison jobs off the main thread and reports progress.
// Wind years are the /opsplitsing year series; results are cached per input hash for this page session.
import {runJob} from './electrolyser-run.mjs';
import {profileSupply, parseProduction, isStudioProfile} from './electrolyser-wind.mjs';
import {IMBALANCE_YEARS, imbalanceFile, validPrices, withPrices} from './electrolyser-imbalance.mjs';

const years = new Map(), supplies = new Map(), results = new Map();
let latest = 0, production = null;
function year(y) {
 if (!years.has(y)) years.set(y, fetch(`/opsplitsing-assets/data/${y}.json`).then(async r => {
  if (!r.ok) throw Error(`Windjaar ${y} kon niet worden geladen (HTTP ${r.status}).`);
  const d = await r.json();
  if (d?.jaar !== y || !Array.isArray(d.t) || !Array.isArray(d.mw) || d.t.length !== d.mw.length) throw Error(`Windjaar ${y} heeft een onbekend formaat.`);
  // Stationswind blijft bewaard: daaruit volgen de andere windprofielen.
  return {jaar: d.jaar, t: d.t, mw: d.mw, stations: d.stations};
 }).catch(e => { years.delete(y); throw e; }));
 return years.get(y);
}
// Gemeten dagproductie van Fryslân: hetzelfde bestand als het Python-model, uit de bestaande rekenbundel (alleen voor dat profiel).
function measured() {
 return production ||= fetch('/opsplitsing-assets/bundle.json').then(async r => {
  if (!r.ok) throw Error(`De productiegegevens konden niet worden geladen (HTTP ${r.status}).`);
  const file = (await r.json())['windprofiel/data/productie_fryslan.csv'];
  if (typeof file !== 'string') throw Error('De productiegegevens ontbreken in de rekenbundel.');
  return parseProduction(new TextDecoder().decode(Uint8Array.from(atob(file), c => c.charCodeAt(0))));
 }).catch(e => { production = null; throw e; });
}
// Onbalansprijzen (ENTSO-E, per biedzone; standaard Nederland) voor de jaren met een prijsbestand. Ontbreekt het bestand, dan rekent alles door zonder
// onbalansregels: de prijzen zijn een toevoeging en nooit een voorwaarde.
const priceFiles = new Map();
function prices(y, zone = 'NL') {
 if (!IMBALANCE_YEARS.includes(y)) return Promise.resolve(null);
 const key = `${zone}|${y}`, file = imbalanceFile(y, zone);
 // Luxemburg rekent met het Duitse bestand, maar houdt zijn eigen zone voor de tekst.
 if (!priceFiles.has(key)) priceFiles.set(key, fetch(file).then(r => r.ok ? r.json() : null).then(d => validPrices(d) && d.jaar === y ? {...d, zone} : null).catch(() => null));
 return priceFiles.get(key);
}
// Projectstudio: het aanbod per windjaar komt met de opdrachten mee (data.studio = {profile, supplies: {jaar: {jaar, t, mw}}, zone}).
// `zone`: de biedzone van de elektrolyser (imbalanceZone), voor de onbalansprijzen.
const studio = new Map();
async function supply(y, profile) {
 const key = `${y}|${profile}`;
 if (isStudioProfile(profile)) { const p = studio.get(profile), s = p?.supplies[y]; if (!s) throw Error(`Het projectaanbod voor ${y} ontbreekt.`); return withPrices(s, await prices(y, p.zone)); }
 if (!supplies.has(key)) supplies.set(key, (async () => withPrices(profileSupply(await year(y), profile, profile === 'gemeten_dagproductie' ? await measured() : null), await prices(y)))()
  .catch(e => { supplies.delete(key); throw e; }));
 return supplies.get(key);
}
self.onmessage = async ({data}) => {
 const {id, jobs} = data;
 latest = id;
 if (data.studio) { studio.clear(); studio.set(data.studio.profile, {supplies: data.studio.supplies, zone: data.studio.zone || 'NL'}); }
 try {
  const out = {};
  for (let i = 0; i < jobs.length; i++) {
   const job = jobs[i];
   let result = results.get(job.key);
   const cached = !!result;
   if (!result) {
    result = runJob(job, await supply(job.year, job.wind));
    results.set(job.key, result);
   }
   out[job.key] = result;
   self.postMessage({id, type: 'progress', done: i + 1, total: jobs.length, cached, label: job.label});
   await new Promise(resolve => setTimeout(resolve, 0));
   if (latest !== id) return;   // a newer request replaces this one
  }
  self.postMessage({id, type: 'done', results: out});
 } catch (e) {
  self.postMessage({id, type: 'error', error: e instanceof Error ? e.message : 'De berekening is mislukt.'});
 }
};
