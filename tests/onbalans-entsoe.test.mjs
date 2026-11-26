// Onbalansprijzen van het ENTSO-E Transparency Platform (scripts/update-onbalans.mjs) en de biedzone per project.
// Bij de overstap van TenneT naar ENTSO-E (november 2026) gaf categorie A05 voor Nederland in 2024 en 2025 exact dezelfde
// prijs als TenneT's Settlement Prices ‘Price Shortage’, kwartier voor kwartier.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseImbalance, midnight} from '../scripts/update-onbalans.mjs';
import {IMBALANCE_ZONES, IMBALANCE_YEARS, imbalanceZone, imbalanceFile, validPrices} from '../src/electrolyser-imbalance.mjs';
import {projectZone, supplyConfig, studioProfile, validateProject, BOLSWARD} from '../src/studio/project.mjs';

const doc = (resolution, points) => `<Balancing_MarketDocument><TimeSeries><Period><timeInterval><start>2025-01-01T00:00Z</start><end>2025-01-01T02:00Z</end></timeInterval><resolution>${resolution}</resolution>${points.map(([pos, cat, v]) => `<Point><position>${pos}</position><imbalance_Price.amount>${v}</imbalance_Price.amount><imbalance_Price.category>${cat}</imbalance_Price.category></Point>`).join('')}</Period></TimeSeries></Balancing_MarketDocument>`;
const t0 = Date.parse('2025-01-01T00:00Z') / 1000;

test('A85: prijs bij tekort (A05), een ontbrekende positie herhaalt de vorige (curveType A03)', () => {
  const xml = doc('PT15M', [[1, 'A04', -50], [1, 'A05', -55.5], [2, 'A05', 10], [5, 'A05', 99], [5, 'A04', 1]]);
  const out = parseImbalance(xml);
  assert.equal(out.length, 8);
  assert.deepEqual(out.map(p => p.prijs), [-55.5, 10, 10, 10, 99, 99, 99, 99]);
  assert.equal(out[0].t, t0); assert.equal(out[7].t, t0 + 7 * 900);
  assert.deepEqual(parseImbalance(xml, 'A04').map(p => p.prijs).slice(0, 5), [-50, -50, -50, -50, 1]);
});

test('A85: uurprijzen (Denemarken) komen als uurstap terug', () => {
  const out = parseImbalance(doc('PT60M', [[1, 'A05', 20], [2, 'A05', -3]]));
  assert.deepEqual(out.map(p => [p.t - t0, p.s, p.prijs]), [[0, 3600, 20], [3600, 3600, -3]]);
});

test('biedzone per land; Denemarken op lengte, Luxemburg met het Duitse bestand', () => {
  assert.equal(imbalanceZone('NL', 5), 'NL');
  assert.equal(imbalanceZone('DK', 8.6), 'DK1');
  assert.equal(imbalanceZone('DK', 12.5), 'DK2');
  assert.equal(imbalanceZone('XX', 5), 'NL');
  assert.equal(imbalanceFile(2025), '/opsplitsing-assets/data/onbalans-2025.json');
  assert.equal(imbalanceFile(2025, 'BE'), '/opsplitsing-assets/data/onbalans-BE-2025.json');
  assert.equal(imbalanceFile(2025, 'LU'), '/opsplitsing-assets/data/onbalans-DE-2025.json');
});

test('elke zone heeft voor elk onbalansjaar een volledig prijsbestand', () => {
  for (const [code, zone] of Object.entries(IMBALANCE_ZONES)) for (const year of IMBALANCE_YEARS) {
    const file = imbalanceFile(year, code).replace('/opsplitsing-assets/', '');
    const d = JSON.parse(readFileSync(new URL('../src/opsplitsing/' + file, import.meta.url), 'utf8'));
    assert.ok(validPrices(d), file);
    assert.equal(d.jaar, year); assert.equal(d.start, midnight(`${year}-01-01`));
    assert.equal(d.prijs.length, (midnight(`${year + 1}-01-01`) - d.start) / 900, file);
    // Denemarken 2025: 6–30 januari staat niet op ENTSO-E; die kwartieren tellen niet mee (uur_met_prijs).
    assert.ok(d.ontbrekend / d.prijs.length < (code.startsWith('DK') ? 0.08 : 0.01), `${file}: ${d.ontbrekend} kwartieren zonder prijs`);
    assert.equal(d.zone, zone.als || code);
  }
});

test('project: zone uit het land van de locatie, anders van het park; Bolsward houdt zijn profiel', () => {
  assert.equal(projectZone(BOLSWARD), 'NL');
  assert.equal(supplyConfig(BOLSWARD).onbalans, undefined);
  const park = {...BOLSWARD.parken[0], land: 'DE', lon: 7.1};
  const abroad = {...BOLSWARD, parken: [park], locatie: {lat: 53.3, lon: 7.2}};
  assert.equal(projectZone(abroad), 'DE');
  assert.equal(projectZone({...abroad, land: 'BE'}), 'BE');
  assert.equal(projectZone({...abroad, land: 'DK', locatie: {lat: 55.6, lon: 12.4}}), 'DK2');
  assert.notEqual(studioProfile(abroad), studioProfile({...abroad, land: 'NL'}), 'andere zone, andere cachesleutel');
  const saved = validateProject({...abroad, id: 'abcdefghijkl', land: 'BE'});
  assert.equal(saved.land, 'BE');
  assert.equal(validateProject({...abroad, id: 'abcdefghijkl', land: 'US'}).land, undefined);
});
