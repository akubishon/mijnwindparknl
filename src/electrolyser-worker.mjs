// Dedicated worker for /elektrolyser: runs comparison jobs off the main thread and reports progress.
// Wind years are the /opsplitsing year series; results are cached per input hash for this page session.
import {runJob} from './electrolyser-run.mjs';
import {profileSupply, parseProduction} from './electrolyser-wind.mjs';

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
async function supply(y, profile) {
 const key = `${y}|${profile}`;
 if (!supplies.has(key)) supplies.set(key, (async () => profileSupply(await year(y), profile, profile === 'gemeten_dagproductie' ? await measured() : null))()
  .catch(e => { supplies.delete(key); throw e; }));
 return supplies.get(key);
}
self.onmessage = async ({data}) => {
 const {id, jobs} = data;
 latest = id;
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
