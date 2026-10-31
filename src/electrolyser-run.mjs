// Runs resolved setups through the kernel, one job per setup and wind year, with a cache keyed by the input hash.
import {simulate_with_replacements, summarise, cleanSupply} from './electrolyser-kernel.mjs';
import {generalValues, jobFor, metrics, meanMetrics, withCoverage} from './electrolyser-setup.mjs';
import {profileSupply} from './electrolyser-wind.mjs';

export const jobsFor = (resolvedList, general) => resolvedList.flatMap((resolved, index) => resolved?.ready ? generalValues(general).years.map(year => ({...jobFor(resolved, general, year), index})) : []);

export function runJob(job, supply) {
 const clean = cleanSupply(supply);
 return {...simulate_with_replacements(clean, job.modules, job.aannames, job.strategy), dropped: clean.dropped};
}

// Raw kernel results per key → per-year and mean metrics for one setup.
export function assemble(resolved, general, raw) {
 const g = generalValues(general);
 const keys = g.years.map(year => jobFor(resolved, general, year).key);
 if (keys.some(k => !raw.has(k))) return null;
 const results = keys.map(k => raw.get(k));
 const perYear = results.map((r, i) => withCoverage(metrics(resolved, r, g.years[i])));
 return {years: g.years, keys, perYear, mean: meanMetrics(resolved, perYear, summarise(results), g.years), dropped: results.reduce((s, r) => s + (r.dropped || 0), 0)};
}

// Synchronous helper for tests and scripts: year series are passed in directly; `production` (productie_fryslan.csv as
// parseProduction() returns it) is only needed for the profile scaled to measured production.
export function compareNow(resolvedList, general, supplies, cache = new Map(), production = null) {
 for (const job of jobsFor(resolvedList, general)) if (!cache.has(job.key)) cache.set(job.key, runJob(job, profileSupply(supplies[job.year], job.wind, production)));
 return resolvedList.map(r => r?.ready ? assemble(r, general, cache) : null);
}
