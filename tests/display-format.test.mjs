import test from 'node:test';
import assert from 'node:assert/strict';
import {formatSignificant,formatSigned,formatFixed,sharedDecimals,decimalsFor,shownDifference,energyParts} from '../src/number-format.mjs';
import {STALE_AFTER_S,readingAge,readingMoment,measuredNote,sinceText,isStale,sourceSilent,readingsLabel} from '../src/live-reading.mjs';
import {daysUpToToday} from '../src/display-hours.mjs';
import {RESULT_ROWS,resultRow,differences} from '../src/electrolyser-setup.mjs';

test('computed values get three significant figures in Dutch notation',()=>{
 assert.equal(formatSignificant(3081.33),'3.080');
 assert.equal(formatSignificant(38.123),'38,1');
 assert.equal(formatSignificant(0.4567),'0,457');
 assert.equal(formatSignificant(0.0123),'0,012'); // at most three decimals
 assert.equal(formatSignificant(371.9,{maxDecimals:2}),'372');
 assert.equal(formatSignificant(1.234,{maxDecimals:2}),'1,23');
 assert.equal(formatSignificant(0),'0');
 assert.equal(formatSignificant(-0.0001),'0');
 assert.equal(formatSignificant(NaN),'—');
 assert.equal(decimalsFor(152345),-3);
 assert.equal(formatFixed(152345,-3),'152.000');
});

test('values shown side by side share the rounding of the largest',()=>{
 assert.equal(sharedDecimals([38.123,3.456,null]),1);
 assert.equal(sharedDecimals([]),0);
 assert.equal(formatSigned(-131.33,-1),'−130');
 assert.equal(formatSigned(3,-1),'±0'); // the sign follows the rounded difference
 assert.equal(formatSigned(4.26,1),'+4,3');
 assert.equal(formatFixed(4.4,2,true),'4,40'); // padded within a group: 4,39 van 4,40
 assert.equal(formatFixed(-0.001,1,true),'0,0');
 assert.equal(shownDifference(7877,7873,-1),10); // the difference of 7.880 and 7.870 as shown
});

test('energy switches from MWh to GWh at 1.000 MWh',()=>{
 assert.deepEqual(energyParts(312.44),{value:'312',unit:'MWh'});
 assert.deepEqual(energyParts(3456.8),{value:'3,46',unit:'GWh'});
 assert.deepEqual(energyParts(999.7),{value:'1',unit:'GWh'});
 assert.deepEqual(energyParts(4.04),{value:'4,04',unit:'MWh'});
});

test('comparison rows: hydrogen in t, energy in MWh/GWh, percentages with one decimal, consistent differences',()=>{
 const row=key=>RESULT_ROWS.find(r=>r[1]===key);
 const rows=[
  {nominaal_mw:44,waterstof_kg:3081330,opgenomen_mwh:152345,standby_mwh:312,benut:0.6234,dekking:0.99451,draaiuren:5432.1,productie_uur:7873,kwh_per_kg:55.96,kwh_per_kg_nominaal:53.35,modules:10},
  {nominaal_mw:45.6,waterstof_kg:2950000,opgenomen_mwh:148000,standby_mwh:290,benut:0.6012,dekking:0.99451,draaiuren:6012.7,productie_uur:7877,kwh_per_kg:55.98,kwh_per_kg_nominaal:53.35,modules:12},
 ];
 const diffs=differences(rows,0);
 const h2=resultRow(row('waterstof_kg'),rows,diffs);
 assert.equal(h2.unit,'t per jaar');
 assert.deepEqual(h2.cells.map(c=>c.value),['3.080','2.950']);
 assert.equal(h2.cells[0].diff,null);assert.equal(h2.cells[1].diff,'−130 (−4,3%)');
 const energy=resultRow(row('opgenomen_mwh'),rows,diffs);
 assert.equal(energy.unit,'GWh per jaar');assert.deepEqual(energy.cells.map(c=>c.value),['152','148']);assert.equal(energy.cells[1].diff,'−4 (−2,9%)');
 assert.equal(resultRow(row('standby_mwh'),rows,diffs).unit,'MWh per jaar');
 const used=resultRow(row('benut'),rows,diffs);
 assert.deepEqual(used.cells.map(c=>c.value),['62,3','60,1']);assert.equal(used.cells[1].diff,'−2,2 procentpunt');
 const coverage=resultRow(row('dekking'),rows,diffs);
 assert.equal(coverage.cells[0].value,'99,5');assert.equal(coverage.cells[1].diff,'gelijk');
 const hours=resultRow(row('draaiuren'),rows,diffs);
 assert.deepEqual(hours.cells.map(c=>c.value),['5.430','6.010']);assert.equal(hours.cells[1].diff,'+580 (+10,7%)');
 // Inputs (modules × catalogue value, catalogue consumption) are shown as entered.
 const nominal=resultRow(row('nominaal_mw'),rows,diffs);
 assert.deepEqual(nominal.cells.map(c=>c.value),['44','45,6']);assert.equal(nominal.cells[1].diff,'+1,6 (+3,6%)');
 assert.deepEqual(resultRow(row('kwh_per_kg_nominaal'),rows,diffs).cells.map(c=>c.value),['53,35','53,35']);
 // The difference is that of the values as shown, never "7.870 | 7.880 ±0".
 assert.deepEqual(resultRow(row('productie_uur'),rows,diffs).cells.map(c=>[c.value,c.diff]),[['7.870',null],['7.880','+10 (+0,1%)']]);
 assert.deepEqual(resultRow(row('kwh_per_kg'),rows,diffs).cells.map(c=>[c.value,c.diff]),[['56,0',null],['56,0','±0,0']]);
 // A relative difference that rounds to 0 % is left out.
 const close=[{productie_uur:7873},{productie_uur:7875}];
 assert.equal(resultRow(row('productie_uur'),close,differences(close,0)).cells[1].diff,'+10');
 assert.equal(resultRow(row('kwh_per_kg'),[{kwh_per_kg:null},{kwh_per_kg:55}],[]).cells[0].value,'—');
});

test('reading age in one human unit, rounded down',()=>{
 assert.deepEqual(readingAge(794967),{value:'9',unit:'dagen'});
 assert.deepEqual(readingAge(45.7),{value:'45',unit:'s'});
 assert.deepEqual(readingAge(119),{value:'119',unit:'s'});
 assert.deepEqual(readingAge(3600),{value:'60',unit:'min'});
 assert.deepEqual(readingAge(10800),{value:'3',unit:'uur'});
 assert.deepEqual(readingAge(172799),{value:'47',unit:'uur'});
 assert.equal(readingAge(NaN),null);
});

test('reading time includes the date when it is not today in the Netherlands',()=>{
 const now=Date.parse('2026-10-30T16:50:00Z');
 assert.deepEqual(readingMoment('2026-10-21T15:46:14Z',now),{date:'21 oktober',time:'17:46:14'});
 assert.equal(measuredNote('2026-10-21T15:46:14Z',now),'Gemeten op 21 oktober om 17:46:14');
 assert.equal(sinceText('2026-10-21T15:46:14Z',now),'21 oktober om 17:46:14');
 assert.equal(measuredNote('2026-10-30T16:49:50Z',now),'Gemeten om 17:49:50');
 // 00:30 Dutch time is today, although the UTC date is yesterday.
 assert.equal(readingMoment('2026-10-29T23:30:00Z',now).date,null);
 assert.equal(readingMoment('2025-12-31T12:00:00Z',Date.parse('2026-01-02T12:00:00Z')).date,'31 december 2025');
 assert.equal(measuredNote('geen tijd',now),'Tijdstip onbekend');
});

test('stale after two minutes; the source counts as silent only from the server answer itself',()=>{
 assert.equal(STALE_AFTER_S,120);
 const now=Date.parse('2026-10-30T16:50:00Z');
 assert.equal(isStale('2026-10-30T16:48:01Z',now),false);
 assert.equal(isStale('2026-10-30T16:47:59Z',now),true);
 assert.equal(sourceSilent({timestamp:'2026-10-21T15:46:14Z',receivedAt:'2026-10-30T16:49:59Z'}),true);
 assert.equal(sourceSilent({timestamp:'2026-10-30T16:49:50Z',receivedAt:'2026-10-30T16:50:00Z'}),false);
 assert.equal(sourceSilent(null),false);
});

test('singular and plural readings',()=>{
 assert.equal(readingsLabel(1),'meting');
 assert.equal(readingsLabel(2),'metingen');
 assert.equal(readingsLabel(0),'metingen');
});

test('calendar counts days with data up to and including today, not tomorrow',()=>{
 const october=Array.from({length:31},(_,i)=>i+1);
 assert.equal(daysUpToToday(october,2026,10,'2026-10-30').length,30);
 assert.equal(daysUpToToday(october,2026,10,'2026-10-31').length,31);
 assert.equal(daysUpToToday([1,2,30],2026,9,'2026-10-30').length,3);
 assert.equal(daysUpToToday([1,2],2026,11,'2026-10-30').length,0);
});
