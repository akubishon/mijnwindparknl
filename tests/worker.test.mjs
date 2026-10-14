import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const env = { WPF_PUBLIC_CLIENT_KEY: 'fixture-client', WPF_FIREBASE_API_KEY: 'fixture-api' };
async function fresh() { return (await import(`data:text/javascript;base64,${Buffer.from(source + '\n// ' + Math.random()).toString('base64')}`)).default; }
const get = (worker, route) => worker.fetch(new Request('https://fixture.test' + route), env);
test('serves the app and validates requests before contacting upstream', async () => {
  const worker=await fresh();let calls=0;const prior=global.fetch;global.fetch=async()=>{calls++;throw Error('Unexpected request');};
  try {
    const page=await get(worker,'/');assert.equal(page.status,200);assert.match(await page.text(),/Fryslân/);
    for(const p of ['/api/history?day=2026-02-30','/api/history?day=2026-1-1','/api/catalog?month=1','/api/catalog?year=2026&month=13'])assert.equal((await get(worker,p)).status,400);
    assert.equal((await worker.fetch(new Request('https://fixture.test/',{method:'POST'}),env)).status,405);
    assert.equal((await get(worker,'/unknown')).status,404);assert.equal(calls,0);
  } finally {global.fetch=prior;}
});
test('authenticates once, filters calendar keys, normalizes energy and projects live fields', async () => {
  const worker=await fresh();const calls=[];const prior=global.fetch;
  global.fetch=async(url,options)=>{
    calls.push(String(url));
    if(String(url).includes('/auth/public-key')){assert.equal(JSON.parse(options.body).key,env.WPF_PUBLIC_CLIENT_KEY);return Response.json({token:'fixture-custom-token',key:'not-forwarded'});}
    if(String(url).includes('signInWithCustomToken')){assert.equal(JSON.parse(options.body).token,'fixture-custom-token');return Response.json({idToken:'fixture-id-token'});}
    assert.match(String(url),/auth=fixture-id-token/);
    if(String(url).includes('shallow=true'))return Response.json({'2021':true,'2026':true,total:true,data:true});
    if(String(url).includes('live-data/park'))return Response.json({power:40400,timestamp:'Wed, 14 Oct 2026 13:37:34 GMT',windspeed:5.2,winddirection:224,secret:'not-forwarded'});
    if(String(url).includes('/2020/1/1/'))return Response.json(null);
    return Response.json({'energy-produced':{'2':4000,'0':0,'1':2000,'bad':1},'calculated-values':{production:6000}});
  };
  try {
    assert.deepEqual((await (await get(worker,'/api/catalog')).json()).values,[2021,2026]);
    const history=await (await get(worker,'/api/history?day=2026-10-14')).json();assert.deepEqual(history.hours,[{hour:0,kWh:0},{hour:1,kWh:2000},{hour:2,kWh:4000}]);assert.equal(history.available,true);
    const count=calls.length;await get(worker,'/api/history?day=2026-10-14');assert.equal(calls.length,count);
    const live=await (await get(worker,'/api/live')).json();assert.equal(live.powerKW,40400);assert.equal(live.windSpeed,5.2);assert.equal(live.secret,undefined);assert.equal(live.token,undefined);
    const missing=await (await get(worker,'/api/history?day=2020-01-01')).json();assert.equal(missing.available,false);assert.deepEqual(missing.hours,[]);
    assert.equal(calls.filter(u=>u.includes('/auth/public-key')).length,1);
  } finally {global.fetch=prior;}
});
test('returns a recoverable error without exposing credentials when upstream fails',async()=>{
  const worker=await fresh(), prior=global.fetch;global.fetch=async()=>new Response('sensitive-upstream-response',{status:403});
  try {const response=await get(worker,'/api/live');assert.equal(response.status,502);const body=await response.text();assert.doesNotMatch(body,/fixture|sensitive|token|key/);assert.match(body,/opnieuw/i);}finally{global.fetch=prior;}
});

test('security policy permits the bundled script and blocks framing', async () => {
  const { createHash } = await import('node:crypto');
  const worker = await fresh();
  const page = await get(worker, '/');
  const html = await page.text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = createHash('sha256').update(script).digest('base64');
  const policy = page.headers.get('Content-Security-Policy');
  assert.ok(policy.includes(`script-src 'sha256-${hash}'`));
  assert.ok(policy.includes("frame-ancestors 'none'"));
  assert.ok(policy.includes("connect-src 'self'"));
  assert.equal(page.headers.get('X-Frame-Options'), 'DENY');
  const invalid = await get(worker, '/api/history?day=%3Cscript%3E');
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('filters unexpected upstream fields and rejects malformed live readings', async () => {
  const worker = await fresh(), prior = global.fetch;
  let malformed = false;
  global.fetch = async url => {
    if (String(url).includes('/auth/public-key')) return Response.json({token:'fixture-custom-token'});
    if (String(url).includes('signInWithCustomToken')) return Response.json({idToken:'fixture-id-token'});
    if (String(url).includes('live-data/park')) return Response.json(malformed
      ? {power:'script',timestamp:'invalid'}
      : {power:10,timestamp:'2026-10-14T12:00:00Z',windspeed:{secret:'hidden'},winddirection:'text'});
    return Response.json({'energy-produced':{'0':100,'24':900,'bad':1},'calculated-values':{production:100,secret:'hidden'}});
  };
  try {
    const history = await (await get(worker, '/api/history?day=2026-10-14')).json();
    assert.deepEqual(history.hours, [{hour:0,kWh:100}]);
    assert.deepEqual(history.totals, {production:100});
    const live = await (await get(worker, '/api/live')).json();
    assert.equal(live.windSpeed, null);
    assert.equal(live.windDirection, null);
    assert.doesNotMatch(JSON.stringify(live), /sensitive|hidden/);
    malformed = true;
    const next = await fresh();
    assert.equal((await get(next, '/api/live')).status, 502);
  } finally { global.fetch = prior; }
});


test('KNMI request uses Worker-compatible redirect mode and returns model hours', async () => {
  const worker=await fresh(), prior=global.fetch;
  const values=Array(180).fill(7);
  const stamps=values.map((_,i)=>new Date(Date.parse('2026-10-12T21:00:00Z')+i*600000).toISOString());
  global.fetch=async (url, options)=>{
    assert.ok(String(url).startsWith('https://api.dataplatform.knmi.nl/'));
    assert.equal(options.redirect,'manual');
    assert.equal(options.headers.Authorization,'fixture-knmi');
    return Response.json({parameters:{ff:{unit:{symbol:{value:'m/s'}}}},coverages:[{'eumetnet:locationId':'0-20000-0-06267',domain:{axes:{t:{values:stamps}}},ranges:{ff:{values}}}]});
  };
  try {
    const r=await worker.fetch(new Request('https://fixture.test/api/wind?day=2026-10-13'),{...env,KNMI_EDR_API_KEY:'fixture-knmi'});
    assert.equal(r.status,200);
    const d=await r.json();assert.equal(d.hours.length,24);assert.ok(d.hours.every(h=>h.modelMWh>0));
  } finally {global.fetch=prior;}
});

test('model settings reject invalid values and Beabuorren uses its own turbine curve', async()=>{
  const {modelOptions,modelHours}=await import('../src/knmi.mjs');
  for(const q of ['height=0','alpha=NaN','station=../../secret','wake=2','cutIn=9&ratedSpeed=8','park=unknown'])assert.throws(()=>modelOptions(new URLSearchParams(q)));
  const o=modelOptions(new URLSearchParams('park=beabuorren&height=10&wake=0&seasonal=0'));
  assert.equal(o.height,10);assert.equal(o.ratedKW,1300);assert.equal(o.alpha,.2);
  const values=Array(180).fill(8),stamps=values.map((_,i)=>new Date(Date.parse('2026-10-12T21:00:00Z')+i*600000).toISOString());
  const raw={parameters:{ff:{unit:{symbol:{value:'m/s'}}}},coverages:[{'eumetnet:locationId':o.stationId,domain:{axes:{t:{values:stamps}}},ranges:{ff:{values}}}]};
  modelHours(raw,'2026-10-13',o).forEach(h=>assert.ok(Math.abs(h.modelMWh-3.528)<1e-9));
  const worker=await fresh();assert.equal((await get(worker,'/beabuorren')).status,200);
});

test('electrolyser runtime includes equality and breaks at missing intervals or low power', async()=>{
  const {runtimeStats}=await import('../src/electrolysis.mjs');
  const interval=(i,powerMW)=>({start:new Date(Date.UTC(2026,0,1,0,i*10)).toISOString(),end:new Date(Date.UTC(2026,0,1,0,(i+1)*10)).toISOString(),powerMW});
  const values=[interval(0,44),interval(1,50),interval(2,43),interval(3,80),interval(4,null),interval(5,70),interval(7,70),interval(8,70),interval(9,70)];
  assert.deepEqual(runtimeStats(values,44),{totalMinutes:70,longestMinutes:30});
  assert.deepEqual(runtimeStats(values,100),{totalMinutes:0,longestMinutes:0});
  assert.equal(runtimeStats(values,NaN),null);
  assert.equal(runtimeStats(values,0),null);
});

test('ten-minute model intervals stay within Dutch day boundaries and retain missing readings', async()=>{
  const {modelOptions,modelHours}=await import('../src/knmi.mjs');
  const o=modelOptions(new URLSearchParams());
  const values=Array(180).fill(7),stamps=values.map((_,i)=>new Date(Date.parse('2026-10-12T21:00:00Z')+i*600000).toISOString());
  values[12]=null;
  const raw={parameters:{ff:{unit:{symbol:{value:'m/s'}}}},coverages:[{'eumetnet:locationId':o.stationId,domain:{axes:{t:{values:stamps}}},ranges:{ff:{values}}}]};
  const p=modelHours(raw,'2026-10-13',o,true);
  assert.equal(p.intervals.length,144);
  assert.equal(p.intervals[0].start,'2026-10-12T22:00:00.000Z');
  assert.equal(p.intervals.at(-1).end,'2026-10-13T22:00:00.000Z');
  assert.ok(p.intervals.some(i=>i.powerMW===null));
});

test('10 percent allocation applies to every production interval', async()=>{
 const {runtimeStats}=await import('../src/electrolysis.mjs');
 const intervals=[{start:'2026-01-01T00:00:00Z',end:'2026-01-01T00:10:00Z',powerMW:382.7}];
 assert.deepEqual(runtimeStats(intervals,38.27,.1),{totalMinutes:10,longestMinutes:10});
 assert.deepEqual(runtimeStats(intervals,44,.1),{totalMinutes:0,longestMinutes:0});
 assert.deepEqual(runtimeStats([{...intervals[0],powerMW:10.4}],5.73,.1),{totalMinutes:0,longestMinutes:0});
});

test('combined electrolyser supply aligns both parks and includes BoP',async()=>{
 const {combinedSupply,runtimeStats}=await import('../src/electrolysis.mjs');
 const a=[{start:'2026-01-01T00:00:00Z',end:'2026-01-01T00:10:00Z',powerMW:382.7},{start:'2026-01-01T00:10:00Z',end:'2026-01-01T00:20:00Z',powerMW:382.7}];
 const b=[{...a[0],powerMW:10.4}];
 const supply=combinedSupply(a,b);
 assert.ok(Math.abs(supply[0].powerMW-48.67/1.1)<1e-9);
 assert.equal(supply[1].powerMW,null);
 assert.deepEqual(runtimeStats(supply,44),{totalMinutes:10,longestMinutes:10});
 assert.deepEqual(runtimeStats(supply,44.3),{totalMinutes:0,longestMinutes:0});
 const worker=await fresh();assert.equal((await get(worker,'/elektrolyser')).status,200);
 assert.equal((await get(worker,'/api/electrolyser?day=2026-02-30')).status,400);
});

test('most frequent power groups one-MW bands and ignores missing model data',async()=>{
 const {mostFrequentPower}=await import('../src/electrolysis.mjs');
 const list=[12.1,12.9,null,15.1,12.3].map((powerMW,i)=>({powerMW,start:new Date(Date.UTC(2026,0,1,0,i*10)).toISOString(),end:new Date(Date.UTC(2026,0,1,0,(i+1)*10)).toISOString()}));
 assert.deepEqual(mostFrequentPower(list),{lowerMW:12,upperMW:13,lineMW:12.5,minutes:30,availableMinutes:40,tiedBands:1});
 assert.equal(mostFrequentPower([]),null);
 const tied=mostFrequentPower([list[0],list[3]]);assert.equal(tied.lowerMW,12);assert.equal(tied.tiedBands,2);
});
