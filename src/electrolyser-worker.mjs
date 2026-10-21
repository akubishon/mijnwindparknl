// Dedicated worker for /elektrolyser: runs comparison jobs off the main thread and reports progress.
// Wind years are the /opsplitsing year series; results are cached per input hash for this page session.
import {runJob} from './electrolyser-run.mjs';

const supplies = new Map(), results = new Map();
let latest = 0;
function supply(year) {
 if (!supplies.has(year)) supplies.set(year, fetch(`/opsplitsing-assets/data/${year}.json`).then(async r => {
  if (!r.ok) throw Error(`Windjaar ${year} kon niet worden geladen (HTTP ${r.status}).`);
  const d = await r.json();
  if (d?.jaar !== year || !Array.isArray(d.t) || !Array.isArray(d.mw) || d.t.length !== d.mw.length) throw Error(`Windjaar ${year} heeft een onbekend formaat.`);
  return {jaar: d.jaar, t: d.t, mw: d.mw};
 }).catch(e => { supplies.delete(year); throw e; }));
 return supplies.get(year);
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
    result = runJob(job, await supply(job.year));
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
