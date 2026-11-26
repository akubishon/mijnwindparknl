import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulate_with_replacements, cleanSupply, DEFAULTS, IMBALANCE_EDGES, priceAt} from '../src/electrolyser-kernel.mjs';
import {economics, COST_DEFAULTS, setupEconomics} from '../src/electrolyser-economics.mjs';
import {imbalanceValue, imbalanceMetrics, validPrices, IMBALANCE_YEAR} from '../src/electrolyser-imbalance.mjs';

// A short synthetic year: 30 days of ten-minute steps from 1 January 2024 with a steady 20 MW.
const start = Date.UTC(2024, 0, 1) / 1000, steps = 30 * 144;
const supply = (mw = 20) => ({jaar: 2024, t: Array.from({length: steps}, (_, i) => start + i * 600), mw: Array(steps).fill(mw)});
const flat = (price, quarters = steps * 2 / 3) => ({jaar: 2024, start, stap: 900, prijs: Array(Math.ceil(quarters)).fill(price), bron: 'test'});
const a = {...DEFAULTS, capaciteit_mw: 44, onderhoud_dagen: 0, storingen_per_jaar: 0, stackwissel_weken: 0};
const costs = {...COST_DEFAULTS, ...a};
const levies = COST_DEFAULTS.netkosten_eur_mwh + COST_DEFAULTS.belasting_eur_mwh;

test('Imbalance prices never change the simulation itself', () => {
 const plain = simulate_with_replacements(cleanSupply(supply()), 10, a, 'verdelen');
 const priced = simulate_with_replacements(cleanSupply({...supply(), onbalans: flat(-100)}), 10, a, 'verdelen');
 assert.equal(plain.onbalans, undefined);
 const {onbalans, ...rest} = priced;
 assert.deepEqual(rest, plain);
 assert.ok(onbalans);
});

test('A negative price fills running modules up to full load and pays −price minus the levies', () => {
 const r = simulate_with_replacements(cleanSupply({...supply(), onbalans: flat(-100)}), 10, a, 'verdelen');
 const v = imbalanceValue(r, costs, economics(r, costs));
 assert.ok(v.mwh > 0 && v.kg > 0);
 // All quarters fall in the band −100 … −80, which counts with levies of 22 €/MWh.
 assert.ok(Math.abs(v.bruto_eur - 100 * v.mwh) < 1e-6 * v.bruto_eur);
 assert.ok(Math.abs(v.netto_eur - (100 - levies) * v.mwh) < 1e-6 * v.bruto_eur);
 // Extra energy never exceeds full load minus what was drawn.
 assert.ok(v.mwh <= (r.onbalans.vollast_mw * v.uur_negatief) - r.verbruik_mwh + 1e-6);
 assert.ok(v.lcoh_met_eur_kg < v.lcoh_eur_kg);
 assert.ok(Math.abs(v.uur_negatief - 30 * 24 * r.extra.schaal) < 1e-6);   // naar een jaar geschaald, zoals de andere uitkomsten
});

test('Prices less negative than the levies do not count', () => {
 const r = simulate_with_replacements(cleanSupply({...supply(), onbalans: flat(-10)}), 10, a, 'verdelen');
 const v = imbalanceValue(r, costs, economics(r, costs));
 assert.ok(v.mwh_alle_negatieve > 0);
 assert.equal(v.mwh, 0); assert.equal(v.netto_eur, 0);
 // With the levies discounted away, the same quarters do count.
 const free = {...costs, korting_net_belasting_eur_mwh: 200};
 const w = imbalanceValue(r, free, economics(r, free));
 assert.ok(Math.abs(w.netto_eur - 10 * w.mwh) < 1e-6);
 assert.equal(w.drempel_eur_mwh, 0);
});

test('Positive prices and missing prices give no imbalance energy', () => {
 const r = simulate_with_replacements(cleanSupply({...supply(), onbalans: flat(50)}), 10, a, 'verdelen');
 assert.equal(imbalanceValue(r, costs, economics(r, costs)).mwh_alle_negatieve, 0);
 assert.equal(priceAt(flat(50, 4), start + 3600), null);
 assert.equal(priceAt(flat(50, 4), start + 600), 50);
});

test('Price bands are ordered and end at zero', () => {
 assert.equal(IMBALANCE_EDGES.at(-1), 0);
 for (let i = 1; i < IMBALANCE_EDGES.length; i++) assert.ok(IMBALANCE_EDGES[i] > IMBALANCE_EDGES[i - 1]);
});

test('The table rows carry the 2024 value only when that year is computed', () => {
 const r = simulate_with_replacements(cleanSupply({...supply(), onbalans: flat(-100)}), 10, a, 'verdelen');
 const with2024 = setupEconomics({years: [IMBALANCE_YEAR], raw: [r], summary: r}, costs);
 assert.ok(with2024.onbalans.netto_eur > 0);
 const without = setupEconomics({years: [2023], raw: [r], summary: r}, costs);
 assert.equal(without.onbalans, null);
 assert.deepEqual(Object.values(imbalanceMetrics(null)), [null, null, null, null, null]);
});

test('The 2024 price file is complete and in the expected format', () => {
 const d = JSON.parse(readFileSync(new URL('../src/opsplitsing/data/onbalans-2024.json', import.meta.url), 'utf8'));
 assert.ok(validPrices(d));
 assert.equal(d.jaar, 2024); assert.equal(d.prijs.length, 366 * 96); assert.equal(d.ontbrekend, 0);
 assert.equal(d.start, Date.UTC(2023, 11, 31, 23) / 1000);
});
