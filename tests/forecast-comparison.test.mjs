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
test('model runs are shown and chosen in Dutch time, computed per date rather than fixed',async()=>{
 const {runToLocal,runClock,localToRun}=await import('../src/forecast-comparison.mjs');
 assert.equal(runClock('2026-10-29T18'),'19:00');assert.equal(runClock('2026-07-29T18'),'20:00');
 assert.equal(runToLocal('2026-01-08T00'),'2026-01-08T01:00');
 assert.equal(localToRun('2026-10-29T19:00'),'2026-10-29T18');assert.equal(localToRun('2026-07-29T20:00'),'2026-07-29T18');
 assert.equal(localToRun('2026-10-25T02:00'),'2026-10-25T00');assert.equal(localToRun('2026-10-25T03:00'),'2026-10-25T02');
 assert.equal(localToRun('2026-03-29T02:00'),null);assert.equal(localToRun('2026-03-29T03:00'),'2026-03-29T01');assert.equal(localToRun(''),null);
});
test('theoretical forecast uses the same height factor as the bounded forecast',async()=>{
 const {theoreticalWindMW}=await import('../src/wind-potential.mjs'),{forecastFactor,modelOptions}=await import('../src/knmi.mjs');
 const settings={park:'fryslan',station:'gemiddelde',hoogte:'wins50',wake:'0',seasonal:'1',height:'115',alpha:'0.115',wakePercent:'5',ratedKW:'4300',cutIn:'3',ratedSpeed:'11.5',cutOut:'28.01'};
 const data={rows:[{time:'2026-10-22T12:00:00Z',parks:[{id:'fryslan',powerMW:1,windSpeedMS:6}]}]};
 const factor=forecastFactor('2026-10-22',modelOptions(new URLSearchParams(settings)));assert.equal(factor,1.2209);
 const [point]=forecastPoints(data,'2026-10-22',settings,true);
 assert.ok(Math.abs(point.powerMW-4300*((6*factor)**3-27)/(11.5**3-27)*89/1000)<1e-9);assert.equal(point.powerMW,theoreticalWindMW(6,'2026-10-22T12:00:00Z',settings,factor));
});
