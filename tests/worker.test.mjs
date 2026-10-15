import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const env = { SITE_PASSWORD:'fixture-site-password', WPF_PUBLIC_CLIENT_KEY: 'fixture-client', WPF_FIREBASE_API_KEY: 'fixture-api' };
async function rawFresh() { return (await import(`data:text/javascript;base64,${Buffer.from(source + '\n// ' + Math.random()).toString('base64')}`)).default; }
async function fresh(){
 const worker=await rawFresh();
 const login=await worker.fetch(new Request('https://fixture.test/auth/site',{method:'POST',headers:{Origin:'https://fixture.test','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:env.SITE_PASSWORD})}),env);
 const cookie=login.headers.get('Set-Cookie').split(';')[0];
 return {fetch(request,settings){const headers=new Headers(request.headers);if(!headers.has('Cookie'))headers.set('Cookie',cookie);return worker.fetch(new Request(request,{headers}),settings);}};
}
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

test('security policy permits the bundled script and iframe embedding', async () => {
  const { createHash } = await import('node:crypto');
  const worker = await fresh();
  const page = await get(worker, '/');
  const html = await page.text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = createHash('sha256').update(script).digest('base64');
  const policy = page.headers.get('Content-Security-Policy');
  assert.ok(policy.includes(`script-src 'sha256-${hash}'`));
  assert.ok(!policy.includes("frame-ancestors"));
  assert.ok(policy.includes("connect-src 'self'"));
  assert.equal(page.headers.get('X-Frame-Options'), null);
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

test('period research counts utilisation, duration curve and runs across midnight',async()=>{
 const {researchResults}=await import('../src/electrolysis.mjs');
 const intervals=[{start:'2026-01-01T23:50:00Z',end:'2026-01-02T00:00:00Z',powerMW:44},{start:'2026-01-02T00:00:00Z',end:'2026-01-02T00:10:00Z',powerMW:44},{start:'2026-01-02T00:10:00Z',end:'2026-01-02T00:20:00Z',powerMW:22}];
 const result=researchResults(intervals);assert.equal(result.power90,22);assert.equal(result.power50,44);assert.equal(result.availableHours,.5);
 const row=result.rows.find(r=>r.capacityMW===44);assert.ok(Math.abs(row.utilisation-5/6)<1e-10);assert.equal(row.longestHours,1/3);assert.equal(row.fullLoadHours,1/3);
 assert.equal(researchResults([]),null);
 const worker=await fresh();assert.equal((await get(worker,'/onderzoek')).status,200);
});

test('research is blocked without a password and tokens cannot be forged',async()=>{
 const worker=await fresh(),base='https://fixture.test',settings={...env,RESEARCH_PASSWORD:'fixture-long-research-password'};
 assert.equal((await worker.fetch(new Request(base+'/api/research/day?day=2026-10-13'),settings)).status,401);
 const login=password=>worker.fetch(new Request(base+'/api/research/auth',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password})}),settings);
 assert.equal((await login('wrong')).status,401);
 const response=await login(settings.RESEARCH_PASSWORD);assert.equal(response.status,200);const {token}=await response.json();
 const valid=await worker.fetch(new Request(base+'/api/research/day?day=bad',{headers:{Authorization:'Bearer '+token}}),settings);assert.equal(valid.status,400);
 const forged=await worker.fetch(new Request(base+'/api/research/day?day=bad',{headers:{Authorization:'Bearer '+token.slice(0,-1)+(token.endsWith('0')?'1':'0')}}),settings);assert.equal(forged.status,401);
 const rotated=await worker.fetch(new Request(base+'/api/research/day?day=bad',{headers:{Authorization:'Bearer '+token}}),{...settings,RESEARCH_PASSWORD:'different'});assert.equal(rotated.status,401);
 assert.equal((await worker.fetch(new Request(base+'/api/research/auth',{method:'POST',headers:{Origin:base},body:'{}'}),env)).status,503);
});

test('research distinguishes captured supply from average loading and leaves missing hours out', async()=>{
 const {researchResults}=await import('../src/electrolysis.mjs');
 const intervals=[0,6,null,12,-2].map((powerMW,i)=>({powerMW,start:new Date(Date.UTC(2026,0,1,0,i*10)).toISOString(),end:new Date(Date.UTC(2026,0,1,0,(i+1)*10)).toISOString()}));
 const result=researchResults(intervals),row=result.rows.find(r=>r.capacityMW===10);
 assert.equal(result.availableHours,.5); // Missing and invalid data are not zero production.
 assert.equal(result.supplyEnergyMWh,3);
 assert.equal(result.supplyHours,1/3);
 assert.ok(Math.abs(row.energyMWh-8/3)<1e-10);
 assert.ok(Math.abs(row.captureFraction-8/9)<1e-10);
 assert.ok(Math.abs(row.utilisation-8/15)<1e-10);
 const zero=researchResults([intervals[0]]);
 assert.equal(zero.supplyEnergyMWh,0);assert.equal(zero.rows[0].captureFraction,0);
});

test('hydrogen estimate uses kWh per kg without applying BoP twice', async()=>{
 const {hydrogenKg,combinedSupply,researchResults}=await import('../src/electrolysis.mjs');
 const i={start:'2026-01-01T00:00:00Z',end:'2026-01-01T00:10:00Z'};
 const supply=combinedSupply([{...i,powerMW:110}],[{...i,powerMW:0}]);
 assert.equal(supply[0].powerMW,10);
 const row=researchResults(supply).rows.find(r=>r.capacityMW===10);
 assert.ok(Math.abs(hydrogenKg(row.energyMWh,50)-100/3)<1e-10);
 assert.equal(hydrogenKg(53540.70503972581,50),1070814.1007945163);
 for(const bad of [0,-1,NaN,Infinity])assert.equal(hydrogenKg(1,bad),null);
 assert.equal(hydrogenKg(0,50),0);
});

test('research operating limits include minimum equality, cap input and distinguish nominal full load',async()=>{
 const {researchResults}=await import('../src/electrolysis.mjs');
 const intervals=[0,1,2,8,10,null,2].map((powerMW,i)=>({powerMW,start:new Date(Date.UTC(2026,0,1,0,i*10)).toISOString(),end:new Date(Date.UTC(2026,0,1,0,(i+1)*10)).toISOString()}));
 const result=researchResults(intervals,20,80),row=result.rows.find(r=>r.capacityMW===10);
 assert.equal(result.availableHours,1);
 assert.equal(row.minimumMW,2);assert.equal(row.maximumMW,8);
 assert.ok(Math.abs(row.energyMWh-20/6)<1e-10);
 assert.equal(row.operatingHours,4/6);assert.equal(row.longestOperatingHours,3/6);
 assert.equal(row.upperLimitHours,2/6);assert.equal(row.fullLoadHours,0);
 assert.equal(row.belowMinimumEnergyMWh,1/6);assert.equal(row.aboveMaximumEnergyMWh,2/6);
 assert.ok(Math.abs(row.energyMWh+row.belowMinimumEnergyMWh+row.aboveMaximumEnergyMWh-result.supplyEnergyMWh)<1e-10);
 assert.ok(result.rows.find(r=>r.capacityMW===20).energyMWh<row.energyMWh); // Larger need not capture more with a scaled minimum load.
 assert.equal(researchResults(intervals,80,80).rows.find(r=>r.capacityMW===10).operatingHours,2/6);
 const defaultRow=researchResults(intervals).rows.find(r=>r.capacityMW===10);
 assert.equal(defaultRow.belowMinimumEnergyMWh,0);assert.equal(defaultRow.operatingHours,5/6);
 assert.equal(defaultRow.fullLoadHours,1/6);
});

test('research rejects invalid percentage operating limits without substituting defaults',async()=>{
 const {researchResults}=await import('../src/electrolysis.mjs');
 for(const [min,max] of [[-1,100],[0,0],[90,80],[0,101],[NaN,100],[0,Infinity]])assert.equal(researchResults([],min,max),null);
});

test('brand style is standard on every page and former trial links redirect',async()=>{
 const worker=await fresh();
 for(const path of ['/','/beabuorren','/elektrolyser','/onderzoek']){
  const response=await get(worker,path);assert.equal(response.status,200,path);
  assert.match(response.headers.get('Content-Security-Policy'),/font-src 'self'/);
  const html=await response.text();assert.match(html,/<body class="brand-style">/);assert.doesNotMatch(html,/PROEFVERSIE HUISSTIJL/);
  const redirect=await get(worker,'/proefstijl'+(path==='/'?'':path));assert.equal(redirect.status,302);assert.equal(redirect.headers.get('Location'),path);
 }
 assert.equal((await get(worker,'/proefstijl/onbekend')).status,404);
 const font=await get(worker,'/assets/tasa-orbiter.ttf');assert.equal(font.status,200);assert.equal(font.headers.get('Content-Type'),'font/ttf');
 const bytes=new Uint8Array(await font.arrayBuffer());assert.deepEqual([...bytes.slice(0,4)],[0,1,0,0]);assert.ok(bytes.length>10000);
 assert.match(await (await get(worker,'/favicon.svg')).text(),/#0C2340/);
});

test('site gate blocks every page, data endpoint and asset before any upstream request',async()=>{
 const worker=await rawFresh();const prior=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('must not fetch');};
 try{
  for(const path of ['/','/beabuorren','/elektrolyser','/onderzoek','/proefstijl','/favicon.svg','/assets/tasa-orbiter.ttf']){
   const r=await get(worker,path);assert.equal(r.status,401,path);const html=await r.text();assert.match(html,/<label for="password">Wachtwoord<\/label>/);assert.doesNotMatch(html,/<style>|<button|<h1|<p[ >]/);assert.doesNotMatch(html,/const |<script>|Fryslân|Beabuorren|brandFont/);assert.equal(r.headers.get('Cache-Control'),'no-store');
  }
  for(const path of ['/api/live','/api/history?day=2026-10-14','/api/wind?day=2026-10-13','/api/research/day?day=2026-10-13','/api/stations','/api/catalog'])assert.equal((await get(worker,path)).status,401,path);
  assert.equal(calls,0);
  const unset=await worker.fetch(new Request('https://fixture.test/'),{});assert.equal(unset.status,503);assert.doesNotMatch(await unset.text(),/Fryslân/);
 }finally{global.fetch=prior;}
});

test('site login issues a secure session, rejects forged/expired/rotated sessions and permits logout',async()=>{
 const worker=await rawFresh(),base='https://fixture.test';
 const login=(password,next='/onderzoek',origin=base)=>worker.fetch(new Request(base+'/auth/site',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password,next})}),env);
 assert.equal((await login('wrong')).status,401);
 assert.equal((await login(env.SITE_PASSWORD,'/','https://evil.test')).status,403);
 const r=await login(env.SITE_PASSWORD);assert.equal(r.status,303);assert.equal(r.headers.get('Location'),'/onderzoek');const setCookie=r.headers.get('Set-Cookie');
 assert.match(setCookie,/Secure; HttpOnly; SameSite=Strict; Max-Age=43200/);assert.match(setCookie,/^__Host-site_session=/);
 const cookie=setCookie.split(';')[0],request=path=>new Request(base+path,{headers:{Cookie:cookie}});
 const page=await worker.fetch(request('/onderzoek'),env);assert.equal(page.status,200);assert.equal(page.headers.get('Cache-Control'),'no-store');
 assert.equal((await worker.fetch(request('/'),{...env,SITE_PASSWORD:'rotated'})).status,401);
 assert.equal((await worker.fetch(new Request(base+'/',{headers:{Cookie:cookie.slice(0,-1)+(cookie.endsWith('0')?'1':'0')}}),env)).status,401);
 assert.equal((await worker.fetch(new Request(base+'/',{headers:{Cookie:cookie.replace(/=\d+\./,'=1000000000000.')}}),env)).status,401);
 const logout=await worker.fetch(new Request(base+'/auth/logout',{method:'POST',headers:{Origin:base,Cookie:cookie}}),env);assert.equal(logout.status,303);assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
 const implicitResearch=await worker.fetch(new Request(base+'/api/research/auth',{method:'POST',headers:{Origin:base,Cookie:cookie},body:'{}'}),{...env,RESEARCH_PASSWORD:'fixture-research'});assert.equal(implicitResearch.status,200);assert.ok((await implicitResearch.json()).token);
 const redirected=await login(env.SITE_PASSWORD,'//evil.test');assert.equal(redirected.headers.get('Location'),'/');
});

test('site gate uses the existing research secret when no site-specific secret is configured and throttles guesses',async()=>{
 const worker=await rawFresh();const settings={RESEARCH_PASSWORD:'fixture-research'};
 const login=password=>worker.fetch(new Request('https://fixture.test/auth/site',{method:'POST',headers:{Origin:'https://fixture.test','CF-Connecting-IP':'192.0.2.7'},body:new URLSearchParams({password})}),settings);
 const r=await login(settings.RESEARCH_PASSWORD);assert.equal(r.status,303);
 const cookie=r.headers.get('Set-Cookie').split(';')[0];assert.equal((await worker.fetch(new Request('https://fixture.test/',{headers:{Cookie:cookie}}),settings)).status,200);
 for(let n=0;n<5;n++)assert.equal((await login('wrong')).status,401);
 assert.equal((await login(settings.RESEARCH_PASSWORD)).status,429);
});

test('technical capacity comparison reports marginal capture, hydrogen and runtime without an economic verdict',async()=>{
 const {compareCapacities}=await import('../src/electrolysis.mjs');
 const base={capacityMW:10,energyMWh:100,operatingHours:60,captureFraction:.5};
 const larger={capacityMW:15,energyMWh:112,operatingHours:40,captureFraction:.56};
 const c=compareCapacities(base,larger,50);
 assert.equal(c.extraMW,5);assert.equal(c.capacityIncreasePct,50);assert.equal(c.energyDeltaMWh,12);assert.equal(c.energyChangePct,12);assert.equal(c.operatingHoursDelta,-20);assert.ok(Math.abs(c.capturePointsDelta-6)<1e-10);assert.equal(c.extraEnergyPerMW,2.4);assert.equal(c.hydrogenDeltaKg,240);
 const decrease=compareCapacities(base,{...larger,energyMWh:80,captureFraction:.4});assert.equal(decrease.energyChangePct,-20);assert.equal(decrease.hydrogenDeltaKg,null);
 assert.equal(compareCapacities({...base,energyMWh:0},larger,50).energyChangePct,null);
 assert.equal(compareCapacities(base,base),null);assert.equal(compareCapacities(larger,base),null);
});

test('expansion chart compares fixed steps and normalises the shorter final extension',async()=>{
 const {expansionSteps}=await import('../src/electrolysis.mjs');
 const row=(capacityMW,energyMWh)=>({capacityMW,energyMWh,operatingHours:10,captureFraction:energyMWh/200});
 const rows=[row(1,10),row(5,40),row(7.5,50),row(10,70),row(15,60),row(20,90),row(25,120),row(30,145),row(35,165),row(40,180),row(44.25,200)];
 const steps=expansionSteps(rows);
 assert.equal(steps[0].base.capacityMW,5);assert.equal(steps[0].larger.capacityMW,10);assert.equal(steps[0].extraEnergyPerMW,6);
 assert.equal(steps[1].extraEnergyPerMW,-2);
 assert.equal(steps.at(-1).extraMW,4.25);assert.ok(Math.abs(steps.at(-1).extraEnergyPerMW-20/4.25)<1e-10);
 assert.equal(rows.length,11);assert.ok(steps.slice(0,-1).every(r=>r.extraMW===5));assert.deepEqual(expansionSteps([]),[]);
});

test('atlas model calculation uses gross system supply and never deducts generic BoP twice',async()=>{
 const {atlasDraft,evaluateAtlasConfiguration}=await import('../src/atlas.mjs');
 const interval={start:'2026-01-01T00:00:00Z',end:'2026-01-01T00:10:00Z',powerMW:10};
 const c={modules:'1',powerMW:'11',kWhPerKg:'50',minimumPct:'0',maximumPct:'100'};
 const r=evaluateAtlasConfiguration([interval,{...interval,powerMW:null}],c);
 assert.ok(Math.abs(r.hydrogenKg-110/3)<1e-10);assert.equal(r.availableHours,1/6);assert.ok(Math.abs(r.energyMWh-11/6)<1e-10);
 assert.equal(evaluateAtlasConfiguration([interval],{...c,minimumPct:''}),null);
 assert.equal(evaluateAtlasConfiguration([interval],{...c,modules:'1.5'}),null);
 assert.equal(evaluateAtlasConfiguration([interval],{...c,minimumPct:'90',maximumPct:'80'}),null);
 const draft=atlasDraft({id:'test',values:{power:'2–5 MW',systemEnergy:'50–55 kWh/kg',minimum:'20% van nominale H₂-productie'}});
 assert.equal(draft.powerMW,'');assert.equal(draft.kWhPerKg,'');assert.equal(draft.minimumPct,'');
});

test('atlas catalogue stays behind site login and proxy credentials are server-only',async()=>{
 const raw=await rawFresh();assert.equal((await get(raw,'/api/atlas/catalogue')).status,401);
 const worker=await fresh();const prior=global.fetch;global.fetch=async(url,options)=>{
  assert.equal(url,'https://waterstofatlas.nl/api/integrations/mijnwindpark/catalogue');assert.equal(options.headers.Authorization,'Bearer fixture-atlas-secret');assert.equal(options.redirect,'manual');
  return Response.json({schemaVersion:1,revision:'fixture',models:[]});
 };
 try{const r=await worker.fetch(new Request('https://fixture.test/api/atlas/catalogue'),{...env,WINDPARK_CATALOG_TOKEN:'fixture-atlas-secret'});assert.equal(r.status,200);assert.doesNotMatch(await r.text(),/fixture-atlas-secret/);}finally{global.fetch=prior;}
});

test('atlas proxy uses Worker-compatible manual redirects and never follows a credential-bearing redirect',async()=>{
 const worker=await fresh(),prior=global.fetch;let calls=0;
 global.fetch=async(url,options)=>{calls++;if(options.redirect==='error')throw new TypeError('Unsupported redirect mode');assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://other.example/catalogue'}});};
 try{const r=await worker.fetch(new Request('https://fixture.test/api/atlas/catalogue'),{...env,WINDPARK_CATALOG_TOKEN:'fixture-atlas-secret'});assert.equal(r.status,502);assert.equal(calls,1);assert.doesNotMatch(await r.text(),/fixture-atlas-secret|other.example/);}finally{global.fetch=prior;}
});

test('KNMI point view retains original timestamps and wind observations without hourly aggregation',async()=>{
 const {modelOptions,modelHours}=await import('../src/knmi.mjs');
 const options=modelOptions(new URLSearchParams());
 const stamps=['2026-01-01T11:00:00Z','2026-01-01T11:10:00Z','2026-01-01T11:20:00Z'];
 const raw={parameters:{ff:{unit:{symbol:{value:'m/s'}}}},coverages:[{'eumetnet:locationId':options.stationId,domain:{axes:{t:{values:stamps}}},ranges:{ff:{values:[4,null,12]}}}]};
 const {intervals}=modelHours(raw,'2026-01-01',options,true);
 assert.deepEqual(intervals.map(p=>p.timestamp),stamps.map(s=>new Date(s).toISOString()));
 assert.deepEqual(intervals.map(p=>p.windSpeedMS),[4,null,12]);
 assert.equal(intervals[1].powerMW,null);assert.equal(intervals[0].end,intervals[0].timestamp);
 assert.equal(intervals.length,3);
});

test('ten-minute dots use a fixed Dutch day clock instead of stretching partial data',async()=>{
 const {clockDayFraction}=await import('../src/chart-time.mjs');
 assert.equal(clockDayFraction('2026-10-15T04:00:00Z','2026-10-15'),.25);
 assert.equal(clockDayFraction('2026-10-14T22:00:00Z','2026-10-15'),0);
 assert.equal(clockDayFraction('2026-10-15T22:00:00Z','2026-10-15'),1);
 assert.equal(clockDayFraction('2026-10-25T00:10:00Z','2026-10-25'),clockDayFraction('2026-10-25T01:10:00Z','2026-10-25'));
 assert.equal(clockDayFraction('bad','2026-10-15'),null);
});

test('chart energy units use each interval duration and kWh equals MWh times one thousand',async()=>{
 const {chartValue,chartCeiling}=await import('../src/chart-units.mjs');
 assert.equal(chartValue(12,1,'MWh'),12);
 assert.equal(chartValue(12,1/6,'MWh'),2);
 assert.equal(chartValue(12,1/6,'kWh'),2000);
 assert.equal(chartValue(12,1/6,'MW'),12);
 assert.equal(chartValue(null,1/6,'kWh'),null);
 assert.equal(chartValue(0,1/6,'MWh'),0);
 assert.equal(chartCeiling([12,18.2,null]),45);
 assert.equal(chartCeiling([20],'MWh'),45);
 assert.equal(chartCeiling([235],'kWh'),240);
 assert.equal(chartCeiling([240],'kWh'),250);
 assert.equal(chartCeiling([null],'kWh'),10);
});

test('KNMI hourly comparison sums interval energy and excludes incomplete hours',async()=>{
 const {knmiHourlyValues}=await import('../src/chart-units.mjs');
 const points=[6,12,18,24,30,36].map((powerMW,i)=>({powerMW,start:new Date(Date.UTC(2026,0,1,11,i*10)).toISOString(),end:new Date(Date.UTC(2026,0,1,11,(i+1)*10)).toISOString()}));
 const full=knmiHourlyValues(points,'2026-01-01',.1);
 assert.equal(full.length,1);assert.equal(full[0].hour,12);assert.ok(Math.abs(full[0].energyMWh-2.1)<1e-10);assert.ok(Math.abs(full[0].powerMW-2.1)<1e-10);
 assert.equal(knmiHourlyValues(points.slice(1),'2026-01-01').length,0);
 assert.equal(knmiHourlyValues(points.map((p,i)=>i===2?{...p,powerMW:null}:p),'2026-01-01').length,0);
 const repeated=Array.from({length:12},(_,i)=>({powerMW:12,start:new Date(Date.UTC(2026,9,25,0,i*10)).toISOString(),end:new Date(Date.UTC(2026,9,25,0,(i+1)*10)).toISOString()}));
 const winter=knmiHourlyValues(repeated,'2026-10-25');assert.equal(winter[0].hour,2);assert.equal(winter[0].energyMWh,24);assert.equal(winter[0].powerMW,12);
});
