import test from 'node:test';
import assert from 'node:assert/strict';
import {modelOptions,windPowerModel,stationComparison,readWindComparison} from '../src/knmi.mjs';
import {comparisonHours,comparisonCoverage,differencePolygons} from '../src/comparison-display.mjs';
const day='2026-01-01';
const options=modelOptions(new URLSearchParams('height=10&seasonal=0&wake=0'));
const power=windPowerModel(day,options);
const point=(i,wind)=>{const start=new Date(Date.parse(day+'T00:00:00Z')+i*600000).toISOString();return {start,end:new Date(Date.parse(start)+600000).toISOString(),windSpeedMS:wind,powerMW:power(wind)};};

test('chooses highest wind before power, including turbine cut-out and ties',()=>{
 const result=stationComparison([point(0,10),point(1,30),point(2,8)],[point(0,30),point(1,10),point(2,8)],day,options);
 const known=result.combination.filter(p=>p.windSpeedMS!==null);
 assert.deepEqual(known.map(p=>p.windSpeedMS),[30,30,8]);
 assert.deepEqual(known.map(p=>p.highestStation),['Houtribdijk','Stavoren','Gelijk']);
 assert.equal(known[0].powerMW,0);assert.ok(result.stavoren.find(p=>p.start===known[0].start).powerMW>0);
 assert.equal(known[0].differenceMW,power(10));
});

test('aligns exact intervals, retains zero, falls back to one station and leaves both missing unknown',()=>{
 const invalid={...point(3,9),end:point(4,9).end};
 const result=stationComparison([point(0,0),point(2,7),invalid],[point(1,9)],day,options);
 const points=result.combination.filter(p=>p.start>=day+'T00:00:00.000Z').slice(0,5);
 assert.equal(points[0].powerMW,0);assert.equal(points[0].fallbackStation,'Stavoren');
 assert.equal(points[1].fallbackStation,'Houtribdijk');assert.equal(points[1].differenceMW,null);
 assert.equal(points[3].powerMW,null);assert.equal(points[4].powerMW,null);
 assert.equal(result.combination.length,144);
 const coverage=comparisonCoverage(result.combination);
 assert.equal(coverage.validMinutes,30);assert.equal(coverage.missingMinutes,1410);assert.equal(coverage.fallbackPoints,3);
 assert.ok(Math.abs(coverage.energyMWh-(power(7)+power(9))/6)<1e-9);
});

test('Dutch daylight-saving days preserve distinct UTC intervals and full clock-hour coverage',()=>{
 assert.equal(stationComparison([],[],'2026-03-29',options).combination.length,138);
 assert.equal(stationComparison([],[],'2025-10-26',options).combination.length,150);
 const full=Array.from({length:6},(_,i)=>point(i,6)),other=full.map((_,i)=>point(i,8));
 const c=stationComparison(full,other,day,options),h=comparisonHours(c,day,.1).find(h=>h.hour===1);
 assert.ok(Math.abs(h.combination.energyMWh-power(8)*.1)<1e-9);
 assert.equal(h.highestStation,'Houtribdijk');
 const fallback=stationComparison(full,other.slice(1),day,options);
 const incomplete=comparisonHours(fallback,day,.1).find(h=>h.hour===1);
 assert.equal(incomplete.houtribdijk,null);assert.ok(incomplete.combination);assert.equal(incomplete.fallback,true);
});

test('difference band changes colour at crossings and never bridges missing values',()=>{
 const polygons=differencePolygons({x:0,a:10,b:5},{x:10,a:5,b:10});
 assert.deepEqual(polygons.map(p=>p.station),['Stavoren','Houtribdijk']);
 assert.equal(polygons[0].points[1][0],5);assert.equal(polygons[1].points[0][0],5);
 assert.deepEqual(differencePolygons({x:0,a:null,b:5},{x:10,a:5,b:10}),[]);
 assert.deepEqual(differencePolygons({x:0,a:5,b:5},{x:10,a:5,b:5}),[]);
});

test('a station request failure still returns the available station without exposing upstream errors',async()=>{
 const prior=global.fetch;
 global.fetch=async url=>{
  if(String(url).includes('06258'))return new Response('upstream-secret',{status:500});
  const stamps=Array.from({length:3},(_,i)=>point(i,7).end);
  return Response.json({parameters:{ff:{unit:{symbol:{value:'m/s'}}}},coverages:[{'eumetnet:locationId':'0-20000-0-06267',domain:{axes:{t:{values:stamps}}},ranges:{ff:{values:[7,0,null]}}}]});
 };
 try{
  const result=await readWindComparison(day,{KNMI_EDR_API_KEY:'fixture'},options);
  assert.deepEqual(result.unavailable,['Houtribdijk']);
  const available=result.combination.filter(p=>p.powerMW!==null);
  assert.equal(available.length,2);assert.ok(available.every(p=>p.fallbackStation==='Stavoren'&&p.differenceMW===null));
  assert.doesNotMatch(JSON.stringify(result),/upstream-secret|fixture/);
 }finally{global.fetch=prior;}
});
