import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastPoints,previousForecastRun} from '../src/forecast-comparison.mjs';
import {harmonieDayWindow} from '../src/harmonie.mjs';
test('today comparison keeps elapsed forecast hours and selects the requested park without filling missing values',()=>{
 const data={rows:['2026-10-21T22:00:00Z','2026-10-22T03:00:00Z','2026-10-22T18:00:00Z','2026-10-22T22:00:00Z'].map(time=>({time,parks:[{id:'fryslan',powerMW:12,windSpeedMS:5},{id:'beabuorren',powerMW:3,windSpeedMS:5}]}))};
 assert.deepEqual(forecastPoints(data,'2026-10-22',{park:'fryslan'}).map(p=>p.time),['2026-10-21T22:00:00Z','2026-10-22T03:00:00Z','2026-10-22T18:00:00Z']);
 assert.equal(forecastPoints(data,'2026-10-22',{park:'beabuorren'})[0].powerMW,3);
 assert.deepEqual(forecastPoints(data,'2026-10-22',{park:'missing'}),[]);
 assert.equal(previousForecastRun('2026-01-01'),'2025-12-31T18');
});
test('whole-day comparisons respect Dutch midnight and clock changes',()=>{
 const day=harmonieDayWindow('2026-10-22');assert.equal(day.start,Date.parse('2026-10-21T22:00:00Z'));assert.equal(day.until,Date.parse('2026-10-22T22:00:00Z'));
 assert.equal(harmonieDayWindow('2026-03-29').limit,23);assert.equal(harmonieDayWindow('2026-10-25').limit,25);
 assert.throws(()=>harmonieDayWindow('2026-02-30'),/INVALID/);
});
