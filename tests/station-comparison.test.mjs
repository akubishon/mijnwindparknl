import test from 'node:test';
import assert from 'node:assert/strict';
import {modelOptions,windPowerModel,stationComparison,readWindComparison,readWind,monthFactors,hubFactor,averageObservations} from '../src/knmi.mjs';
import heightTable from '../src/opsplitsing/python/data/ashoogte.json' with { type: 'json' };
import {comparisonHours,comparisonCoverage,differencePolygons} from '../src/comparison-display.mjs';
const day='2026-01-01';
// Old height method: the old combination rule (highest wind, fallback to one station) stays reproducible.
const options=modelOptions(new URLSearchParams('hoogte=alpha&height=10&seasonal=0&wake=0'));
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

test('default wind source: mean of Houtribdijk and Stavoren with the WINS50 month factor, no fallback',()=>{
 const o=modelOptions(new URLSearchParams('wake=0'));
 assert.equal(o.stationId,'gemiddelde');assert.equal(o.hoogte,'wins50');
 assert.deepEqual(monthFactors('fryslan','gemiddelde').factor,heightTable.parken.fryslan.factor);
 assert.equal(hubFactor('2026-07-15',o),heightTable.parken.fryslan.factor[6]);
 assert.equal(hubFactor('2026-07-15',{...o,stationId:'0-20000-0-06267'}),heightTable.parken.fryslan.bronvergelijking.find(b=>b.naam==='Stavoren').factor[6]);
 assert.equal(hubFactor('2026-07-15',{...o,stationId:'0-20000-0-06270',park:'beabuorren'}),heightTable.parken.beabuorren.bronvergelijking.find(b=>b.naam==='Leeuwarden').factor[6]);
 assert.equal(hubFactor('2026-07-15',{...o,stationId:'0-20000-0-06260'}),heightTable.parken.fryslan.schering[6]);
 const p=windPowerModel(day,o);
 const r=stationComparison([point(0,6),point(1,7)],[point(0,8)],day,o);
 const [first,second]=r.combination.filter(x=>x.start>=day+'T00:00:00.000Z');
 assert.equal(r.rule,'gemiddelde');assert.equal(first.windSpeedMS,7);assert.equal(first.powerMW,p(7));
 assert.equal(second.powerMW,null);assert.equal(second.fallbackStation,null);
});

test('averaged observations keep gaps, average direction as vectors and need both stations',async()=>{
 const raw=(id,ff,dd)=>({parameters:{ff:{unit:{symbol:{value:'m/s'}}}},coverages:[{'eumetnet:locationId':id,domain:{axes:{t:{values:ff.map((_,i)=>point(i,0).end)}}},ranges:{ff:{values:ff},dd:{values:dd}}}]});
 const m=averageObservations(raw('a',[4,null,6],[350,90,null]),raw('b',[8,5,6],[10,90,180]));
 assert.deepEqual(m.coverages[0].ranges.ff.values,[6,null,6]);
 assert.ok(Math.abs(m.coverages[0].ranges.dd.values[0])<1e-9||Math.abs(m.coverages[0].ranges.dd.values[0]-360)<1e-9);
 assert.equal(m.coverages[0].ranges.dd.values[2],null);
 // Raw station responses are cached per day, so this part uses a day no other test fetches.
 const other='2026-02-10',stamps=[1,2,3].map(i=>new Date(Date.parse(other+'T00:00:00Z')+i*600000).toISOString());
 const prior=global.fetch,seen=[];
 global.fetch=async url=>{const id=new URL(url).pathname.split('/').at(-1);seen.push(id);
  if(id.endsWith('06258')&&seen.includes('fail'))return new Response('x',{status:500});
  return Response.json({parameters:{ff:{unit:{symbol:{value:'m/s'}}}},coverages:[{'eumetnet:locationId':id,domain:{axes:{t:{values:stamps}}},ranges:{ff:{values:[id.endsWith('06258')?8:6,7,null]},dd:{values:[0,0,0]}}}]});};
 try{
  const d=await readWind(other,{KNMI_EDR_API_KEY:'k'},modelOptions(new URLSearchParams('wake=0')));
  assert.deepEqual(seen.sort(),['0-20000-0-06258','0-20000-0-06267']);
  assert.deepEqual(d.intervals.map(p=>p.windSpeedMS),[7,7,null]);assert.match(d.windSource,/gemiddelde per tien minuten/);
  seen.push('fail');
  await assert.rejects(readWind('2026-02-11',{KNMI_EDR_API_KEY:'k'},modelOptions(new URLSearchParams('wake=0'))));
 }finally{global.fetch=prior;}
});

test('default park power equals park_mw() of the Python opsplitsing for the same 10 m wind',()=>{
 // Reference: windprofiel opsplitsing.park_mw(park, v, 15th 12:00 UTC, load_curve(park), method 'onafhankelijk').
 const expected={"fryslan":[68.687352,34.265,314.366423,190.626875,382.7,371.575],"beabuorren":[0.525317,0.24242,3.643137,2.215341,8.735496,6.395807]};
 for(const park of ['fryslan','beabuorren']){
  const o=modelOptions(new URLSearchParams({park}));
  const actual=[4,7,10].flatMap(v=>['2025-01-15','2025-07-15'].map(d=>windPowerModel(d,o)(v)));
  actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[park][i])<1e-6,park+' '+i));
 }
});
