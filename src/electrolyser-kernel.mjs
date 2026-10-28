// JavaScript port of the per-module simulation in src/opsplitsing/python/opsplitsing.py (MODEL_VERSION 14).
// Function names and operation order follow the Python source so results stay within floating-point noise;
// scripts/test-python-browser.mjs and tests/electrolyser-kernel.test.mjs compare both kernels.
// Additions that the Python kernel does not report (remaining energy split, supply classes, start counts)
// are computed alongside the unchanged decisions and never feed back into them.

export const KERNEL_VERSION = 'opsplitsing.py MODEL_VERSION 14 · JS 1';
export const STEP_H = 1 / 6;
export const STRATEGIES = {
 verdelen: 'Per tijdstap het aantal modules dat de meeste waterstof geeft, last gelijk verdeeld.',
 bijschakelen: 'Modules één voor één bijschakelen; hooguit één module in deellast.',
 samen: 'Alle modules tegelijk aan of uit, alsof het één grote installatie is.',
};
// Aannames() defaults and TECHNOLOGIES from opsplitsing.py; the Python check compares them with meta_json().
export const DEFAULTS = Object.freeze({
 capaciteit_mw: 44.0, minimumlast: 0.25, systeemverbruik_vol: 53.3, deellastvoordeel: 0.10, faradayverlies_10: 0.03,
 bop_vast: 0.03, bop_variabel: 0.07, degradatie_jaar: 0.01, degradatie_jaren: 10.0, min_aan_min: 30.0, min_uit_min: 20.0,
 startvertraging_min: 20.0, standby: 0.01, koud_na_uur: 2.0, opstart_warm_min: 1.0, opstart_koud_min: 10.0,
 onderhoud_dagen: 7.0, storingen_per_jaar: 2.0, hersteltijd_uur: 48.0,
 stack_levensduur_uur: 60000.0, stackwissel_weken: 4.0,
});
const alkaline = {...DEFAULTS, minimumlast: 0.30, systeemverbruik_vol: 52.4, koud_na_uur: 4.0,
 opstart_warm_min: 5.0, opstart_koud_min: 45.0, stack_levensduur_uur: 80000.0};
export const TECHNOLOGIES = Object.freeze({
 pem: {naam: 'PEM', waarden: Object.freeze({...DEFAULTS})},
 alkaline: {naam: 'Alkaline', waarden: Object.freeze(alkaline)},
 alkaline_hoog: {naam: 'Alkaline, hoge minimumlast', waarden: Object.freeze({...alkaline, minimumlast: 0.40})},
});

// ---------------------------------------------------------------- Python number semantics

// builtin sum() of floats (Python ≥ 3.12): Neumaier compensated summation.
export function pySum(values) {
 let total = 0, c = 0;
 for (const x of values) {
  const t = total + x;
  c += Math.abs(total) >= Math.abs(x) ? (total - t) + x : (x - t) + total;
  total = t;
 }
 return c && Number.isFinite(c) ? total + c : total;
}

// round(x, 2): correctly rounded, ties to even. A tie needs x·8 to be an odd integer.
export function pyRound2(x) {
 const eighths = x * 8;
 if (Number.isInteger(eighths) && Math.abs(eighths % 2) === 1) {
  const low = Math.floor(x * 100);
  return (low % 2 === 0 ? low : low + 1) / 100;
 }
 return Number(x.toFixed(2));
}

// random.Random(seed): MT19937 seeded with init_by_array([seed]); random() and expovariate() as in CPython.
export class PyRandom {
 constructor(seed) {
  const mt = this.mt = new Uint32Array(624);
  mt[0] = 19650218;
  for (let i = 1; i < 624; i++) mt[i] = (Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i) >>> 0;
  const key = [];
  for (let n = Math.abs(seed); ; n = Math.floor(n / 4294967296)) { key.push(n % 4294967296); if (n < 4294967296) break; }
  let i = 1, j = 0;
  for (let k = Math.max(624, key.length); k; k--) {
   mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j) >>> 0;
   i++; j++;
   if (i >= 624) { mt[0] = mt[623]; i = 1; }
   if (j >= key.length) j = 0;
  }
  for (let k = 623; k; k--) {
   mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i) >>> 0;
   i++;
   if (i >= 624) { mt[0] = mt[623]; i = 1; }
  }
  mt[0] = 0x80000000;
  this.index = 624;
 }
 uint32() {
  const mt = this.mt;
  if (this.index >= 624) {
   for (let k = 0; k < 624; k++) {
    const y = (mt[k] & 0x80000000) | (mt[(k + 1) % 624] & 0x7fffffff);
    mt[k] = mt[(k + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
   }
   this.index = 0;
  }
  let y = mt[this.index++];
  y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18;
  return y >>> 0;
 }
 random() { const a = this.uint32() >>> 5, b = this.uint32() >>> 6; return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0); }
 expovariate(lambd) { return -Math.log(1.0 - this.random()) / lambd; }
}

// ---------------------------------------------------------------- Europe/Amsterdam wall clock (zoneinfo, fold=0)

// EU rule (since 1996): summer time from the last Sunday of March to the last Sunday of October, 01:00 UTC.
const lastSundayUTC = (year, month) => { const d = new Date(Date.UTC(year, month + 1, 0)); return Date.UTC(year, month, d.getUTCDate() - d.getUTCDay(), 1) / 1000; };
const offsetAt = utc => { const y = new Date(utc * 1000).getUTCFullYear(); return utc >= lastSundayUTC(y, 2) && utc < lastSundayUTC(y, 9) ? 7200 : 3600; };
// aware datetime.timestamp() for a wall-clock time in whole microseconds on a naive axis. Ambiguous autumn times take
// the first (summer-time) occurrence and spring-gap times the winter offset, as zoneinfo does with fold=0.
// Integer microseconds until the final division, like timedelta.total_seconds().
function wallToTimestamp(wallUs) {
 const summer = wallUs - 7200e6;
 return (offsetAt(Math.floor(summer / 1e6)) === 7200 ? summer : wallUs - 3600e6) / 1e6;
}
// timedelta(days=float) → whole microseconds, rounded half to even as in CPython's delta_new.
function daysToMicroseconds(days) {
 const whole = Math.trunc(days), frac = days - whole, scaled = frac * 86400000000, part = Math.trunc(scaled), left = scaled - part;
 const us = whole * 86400000000 + part;
 let extra = Math.round(left);
 if (Math.abs(extra - left) === 0.5) extra = us % 2 ? 1 : 0;
 return us + extra;
}
const localMidnightJan1 = year => Date.UTC(year, 0, 1) * 1000;
const addDays = (wallUs, days) => wallUs + daysToMicroseconds(days);

// ---------------------------------------------------------------- module (opsplitsing.py)

export function stack_sec_full(a) { return a.systeemverbruik_vol * (1 - a.faradayverlies_10 * 0.1) / (1 + a.bop_variabel + a.bop_vast); }
export function stack_kg_h(stack_mw, size_mw, a) {
 const x = stack_mw / size_mw;
 if (x <= 0 || x < a.minimumlast - 1e-9) return 0.0;
 const faraday = Math.max(0.0, 1 - a.faradayverlies_10 * 0.1 / x);
 const ageing = a.degradatie_jaar * a.degradatie_jaren / 2;
 const sec = stack_sec_full(a) * (1 - a.deellastvoordeel * (1 - x)) * (1 + ageing);
 return stack_mw * 1000 / sec * faraday;
}
export function draw_mw(stack_mw, size_mw, a) { return stack_mw * (1 + a.bop_variabel) + a.bop_vast * size_mw; }
function equal_share(power, k, size, a) { return Math.min(size, (power / k - a.bop_vast * size) / (1 + a.bop_variabel)); }
function desired_count(power, n_avail, size, a, strategy, memo) {
 const minimum = draw_mw(a.minimumlast * size, size, a);
 const fits = minimum > 0 ? Math.min(n_avail, Math.floor(power / minimum)) : n_avail;
 if (strategy === 'samen') return fits >= n_avail && n_avail ? n_avail : 0;
 if (strategy === 'bijschakelen') return power >= minimum ? Math.min(fits, Math.ceil(power / draw_mw(size, size, a))) : 0;
 const rounded = pyRound2(power), key = rounded + '|' + n_avail;
 if (!memo.has(key)) {
  let best = 0.0, best_k = 0;
  for (let k = 1; k <= fits; k++) {
   const kg = k * stack_kg_h(equal_share(rounded, k, size, a), size, a);
   if (kg > best + 1e-9) { best = kg; best_k = k; }
  }
  memo.set(key, best_k);
 }
 return memo.get(key);
}
function sequential_loads(power, k, size, a) {
 const full = draw_mw(size, size, a), minimum = draw_mw(a.minimumlast * size, size, a);
 k = minimum > 0 ? Math.min(k, Math.floor(power / minimum)) : k;
 if (k <= 0) return [];
 const total = Math.min(power, k * full);
 const draws = [...Array(k - 1).fill(full), total - (k - 1) * full];
 if (k > 1 && draws[k - 1] < minimum) { draws[k - 2] -= minimum - draws[k - 1]; draws[k - 1] = minimum; }
 return draws.map(d => Math.max(0.0, Math.min(size, (d - a.bop_vast * size) / (1 + a.bop_variabel))));
}

// Per module: a Uint8Array over the time steps, 1 while in maintenance or outage.
export function outages(times, n, year, a) {
 const startWall = localMidnightJan1(year), yearStart = wallToTimestamp(startWall);
 const blocks = [];
 for (let i = 0; i < n; i++) {
  const spans = [];
  if (a.onderhoud_dagen > 0) {
   const beginWall = addDays(startWall, 105 + i * a.onderhoud_dagen % 150);
   spans.push([wallToTimestamp(beginWall), wallToTimestamp(addDays(beginWall, a.onderhoud_dagen))]);
  }
  if (a.storingen_per_jaar > 0 && a.hersteltijd_uur > 0) {
   const draw = new PyRandom(year * 100 + i);
   let moment = yearStart;
   for (;;) {
    moment += draw.expovariate(a.storingen_per_jaar / (365 * 86400));
    if (moment >= yearStart + 365 * 86400) break;
    spans.push([moment, moment + a.hersteltijd_uur * 3600]);
   }
  }
  const down = new Uint8Array(times.length);
  for (const [lo, hi] of spans) for (let s = lowerBound(times, lo); s < times.length && times[s] < hi; s++) down[s] = 1;
  blocks.push(down);
 }
 return blocks;
}
const lowerBound = (sorted, value) => { let lo = 0, hi = sorted.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < value) lo = mid + 1; else hi = mid; } return lo; };

// Supply classes (MW) for showing where module size matters; finer at low wind, the last class is open-ended.
export const SUPPLY_EDGES = [0, 2.5, 5, 7.5, 10, 15, 20, 25, 30, 35, 40, 45];
const supplyClass = power => { let c = 0; while (c + 1 < SUPPLY_EDGES.length && power >= SUPPLY_EDGES[c + 1]) c++; return c; };

export function simulate(supply, n, a, strategy) {
 const times = supply.t, mw = supply.mw;
 const size = a.capaciteit_mw / n;
 const min_on = a.min_aan_min / 60, min_off = a.min_uit_min / 60, delay = a.startvertraging_min / 60;
 const minimum = draw_mw(a.minimumlast * size, size, a), full = draw_mw(size, size, a);
 let want_h = 0.0;
 const down = outages(times, n, supply.jaar, a);
 const on = Array(n).fill(false), on_h = Array(n).fill(0.0), off_h = Array(n).fill(a.koud_na_uur + min_off), startup = Array(n).fill(0.0);
 const stack = Array(n).fill(0.0), eq = Array(n).fill(0.0), hours = Array(n).fill(0.0), warm = Array(n).fill(0), cold = Array(n).fill(0);
 let kg = 0.0, used = 0.0, standby = 0.0, producing = 0.0;
 // Additions: where unused wind energy goes, and absorption per supply class.
 let below = 0.0, above = 0.0, other = 0.0, outageSteps = 0;
 const classSupply = new Float64Array(SUPPLY_EDGES.length), classUsed = new Float64Array(SUPPLY_EDGES.length);
 const lowerLimit = strategy === 'samen' ? n * minimum : minimum, installedFull = n * full;
 const memo = new Map();
 const loads = new Float64Array(n);
 for (let step = 0; step < times.length; step++) {
  const power = mw[step];
  const avail = [], running = [], must = [], starters = [];
  for (let i = 0; i < n; i++) if (!down[i][step]) {
   avail.push(i);
   if (on[i]) { running.push(i); if (on_h[i] < min_on) must.push(i); }
   else if (off_h[i] >= min_off) starters.push(i);
  }
  if (avail.length < n) outageSteps++;
  const fits = minimum > 0 ? Math.min(avail.length, Math.floor(power / minimum)) : avail.length;
  let k = desired_count(power, avail.length, size, a, strategy, memo);
  want_h = k > running.length ? want_h + STEP_H : 0.0;
  const waiting = starters.length > 0 && want_h < delay - 1e-9;
  const startable = waiting ? [] : starters;
  k = Math.max(Math.min(k, running.length + startable.length), Math.min(must.length, fits));
  k = Math.min(k, fits, running.length + startable.length);
  const mustSet = new Set(must);
  const keep = running.map(i => i).sort((x, y) => (mustSet.has(x) ? 0 : 1) - (mustSet.has(y) ? 0 : 1) || eq[x] - eq[y]).slice(0, k);
  const chosen = keep.concat(startable.map(i => i).sort((x, y) => eq[x] - eq[y]).slice(0, k - keep.length));
  loads.fill(0.0);
  if (strategy === 'bijschakelen') {
   const shares = sequential_loads(power, chosen.length, size, a);
   for (let j = 0; j < Math.min(chosen.length, shares.length); j++) loads[chosen[j]] = shares[j];
  } else if (chosen.length) {
   const share = equal_share(power, chosen.length, size, a);
   for (const i of chosen) loads[i] = share;
  }
  let step_kg = 0.0, step_draw = 0.0;
  for (let i = 0; i < n; i++) {
   const x = loads[i];
   if (x >= a.minimumlast * size - 1e-9 && x > 0) {
    if (!on[i]) {
     if (off_h[i] >= a.koud_na_uur) { cold[i] += 1; startup[i] = a.opstart_koud_min; }
     else { warm[i] += 1; startup[i] = a.opstart_warm_min; }
     on[i] = true; on_h[i] = 0.0;
    }
    const productive = Math.max(0.0, 10 - startup[i]) / 10;
    startup[i] = Math.max(0.0, startup[i] - 10);
    step_kg += stack_kg_h(x, size, a) * STEP_H * productive;
    const drawn = draw_mw(x, size, a);
    used += drawn * STEP_H;
    step_draw += drawn;
    eq[i] += STEP_H;
    hours[i] += STEP_H;
    on_h[i] += STEP_H;
    stack[i] = x;
   } else {
    if (on[i]) { on[i] = false; off_h[i] = 0.0; }
    if (down[i][step]) { /* lost_outage in Python; not reported */ }
    else if (off_h[i] < a.koud_na_uur) standby += a.standby * size * STEP_H;
    off_h[i] += STEP_H;
    stack[i] = 0.0;
   }
  }
  kg += step_kg;
  producing += step_kg > 0 ? STEP_H : 0.0;
  const unused = Math.max(0, power - step_draw);
  const over = Math.min(unused, Math.max(0, power - installedFull));
  const under = step_draw === 0 && power < lowerLimit ? unused : 0;
  above += over * STEP_H; below += under * STEP_H; other += Math.max(0, unused - over - under) * STEP_H;
  const cls = supplyClass(power);
  classSupply[cls] += power * STEP_H; classUsed[cls] += step_draw * STEP_H;
 }
 const scale = mw.length ? 8760 / (mw.length * STEP_H) : 0;
 const supply_mwh = pySum(mw) * STEP_H;
 return {
  modules: n, module_mw: size, strategie: strategy, jaar: supply.jaar,
  waterstof_t: kg * scale / 1000, verbruik_mwh: used * scale, standby_mwh: standby * scale,
  aanbod_mwh: supply_mwh * scale,
  benutting: supply_mwh ? used / supply_mwh : 0.0,
  bedrijfsuren_gem: pySum(hours) / n * scale, productie_uur: producing * scale,
  starts_warm_per_module: pySum(warm) / n * scale, starts_koud_per_module: pySum(cold) / n * scale,
  eq_uren_per_module: eq.map(e => e * scale),
  dekking_uur: mw.length * STEP_H,
  extra: {
   schaal: scale, waterstof_kg_gemeten: kg, verbruik_mwh_gemeten: used, starts_totaal: pySum(warm) + pySum(cold),
   onder_minimum_mwh: below * scale, boven_maximum_mwh: above * scale, overig_mwh: other * scale,
   uitval_uur: outageSteps * STEP_H * scale, drempel_mw: lowerLimit, vollast_mw: installedFull,
   klassen: Array.from(classSupply, (s, i) => ({van_mw: SUPPLY_EDGES[i], tot_mw: SUPPLY_EDGES[i + 1] ?? null, aanbod_mwh: s * scale, opgenomen_mwh: classUsed[i] * scale})),
  },
 };
}

export function replacement_days(result, a) {
 const wear = pySum(result.eq_uren_per_module) / result.modules;
 return a.stackwissel_weken * 7 * wear / a.stack_levensduur_uur;
}
export function simulate_with_replacements(supply, n, a, strategy) {
 const first = simulate(supply, n, a, strategy);
 const days = a.stackwissel_weken ? replacement_days(first, a) : 0.0;
 if (!days) return {...first, stackwissel_dagen: 0.0};
 return {...simulate(supply, n, {...a, onderhoud_dagen: a.onderhoud_dagen + days}, strategy), stackwissel_dagen: days};
}

// Mean over wind years, as summarise() in opsplitsing.py (without the cost model).
const FLOAT_KEYS = ['module_mw', 'waterstof_t', 'verbruik_mwh', 'standby_mwh', 'aanbod_mwh', 'benutting', 'bedrijfsuren_gem', 'productie_uur',
 'starts_warm_per_module', 'starts_koud_per_module', 'dekking_uur', 'stackwissel_dagen'];
export function summarise(perYear) {
 const mean = pick => pySum(perYear.map(pick)) / perYear.length;
 const out = {modules: perYear[0].modules, strategie: perYear[0].strategie};
 for (const key of FLOAT_KEYS) out[key] = mean(r => r[key]);
 out.eq_uren_per_module = perYear[0].eq_uren_per_module.map((_, i) => mean(r => r.eq_uren_per_module[i]));
 const first = perYear[0].extra;
 out.extra = {
  waterstof_kg_gemeten: mean(r => r.extra.waterstof_kg_gemeten), verbruik_mwh_gemeten: mean(r => r.extra.verbruik_mwh_gemeten),
  starts_totaal: mean(r => r.extra.starts_totaal), onder_minimum_mwh: mean(r => r.extra.onder_minimum_mwh),
  boven_maximum_mwh: mean(r => r.extra.boven_maximum_mwh), overig_mwh: mean(r => r.extra.overig_mwh), uitval_uur: mean(r => r.extra.uitval_uur),
  drempel_mw: first.drempel_mw, vollast_mw: first.vollast_mw,
  klassen: first.klassen.map((c, i) => ({...c, aanbod_mwh: mean(r => r.extra.klassen[i].aanbod_mwh), opgenomen_mwh: mean(r => r.extra.klassen[i].opgenomen_mwh)})),
 };
 return out;
}

// Gaps never count as zero: steps without a finite, non-negative value are dropped, exactly as supply_year() drops
// missing KNMI moments. The simulation then continues across the gap, as the Python kernel does.
export function cleanSupply(supply) {
 const t = [], mw = [];
 let dropped = 0;
 for (let i = 0; i < supply.t.length; i++) {
  const v = supply.mw[i];
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isFinite(supply.t[i])) { t.push(supply.t[i]); mw.push(v); } else dropped++;
 }
 return {jaar: supply.jaar, t, mw, dropped};
}
export const hoursInYear = year => (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 3600000;
