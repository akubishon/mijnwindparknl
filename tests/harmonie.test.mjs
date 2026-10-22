import test from 'node:test';
import assert from 'node:assert/strict';
import {gribWindPoints,extractHarmonie,readHarmonie,forecastWindow,historicalHarmonieOptions} from '../src/harmonie.mjs';
function message(component=33,hour=0){
 const a=new Uint8Array(8+28+32+15+4),p=8,g=36,b=68;
 const str=(p,s)=>a.set(new TextEncoder().encode(s),p),u16=(p,v)=>{a[p]=v>>8;a[p+1]=v&255;},u24=(p,v)=>{a[p]=v>>16;a[p+1]=v>>8&255;a[p+2]=v&255;};
 str(0,'GRIB');u24(4,a.length);a[7]=1;u24(p,28);a[p+7]=128;a[p+8]=component;a[p+9]=105;u16(p+10,10);a.set([26,10,22,6,0,1,hour,0,0],p+12);a[p+24]=21;
 u24(g,32);a[g+4]=255;u16(g+6,2);u16(g+8,2);u24(g+10,52000);u24(g+13,5000);u24(g+17,54000);u24(g+20,6000);u16(g+23,1000);u16(g+25,2000);a[g+27]=64;
 u24(b,15);a[b+10]=8;a.set(component===33?[1,2,3,4]:[4,5,6,7],b+11);str(a.length-4,'7777');return a;
}
function tar(count=9){const files=[];for(let hour=0;hour<count;hour++){const u=message(33,hour),v=message(34,hour),head=new Uint8Array(512);head.set(new TextEncoder().encode(`HA43_N20_202610220600_${String(hour*100).padStart(5,'0')}_GB`));head.set(new TextEncoder().encode((u.length+v.length).toString(8).padStart(11,'0')+'\0'),124);head[156]=48;files.push(head,u,v,new Uint8Array((512-(u.length+v.length)%512)%512));}return new ReadableStream({start(c){for(const x of files)c.enqueue(x);c.enqueue(new Uint8Array(1024));c.close();}});}
test('GRIB1 point extraction respects latitude scan and time, preserves zero, rejects incompatible fields',()=>{const a=message();let d=gribWindPoints(a);assert.equal(d.run,'2026-10-22T06:00:00.000Z');assert.equal(d.values[0].value,3);assert.equal(d.values[0].latitude,54);a[79+2]=0;assert.equal(gribWindPoints(a).values[0].value,0);a[17]=100;assert.equal(gribWindPoints(a),null);const bad=message();bad[71]=128;assert.throws(()=>gribWindPoints(bad),/PACKING/);});
test('TAR stream joins u/v from one run, extracts future hours and cancels early',async()=>{const d=await extractHarmonie(tar(),Date.parse('2026-10-22T06:30:00Z'));assert.equal(d.rows.length,7);assert.equal(d.rows[0].time,'2026-10-22T07:00:00.000Z');assert.equal(d.rows[0].parks[0].windSpeedMS,Math.hypot(3,6));});
test('missing key is explicit and authorization failures do not fetch signed downloads',async()=>{await assert.rejects(readHarmonie({}),/NOT_CONFIGURED/);const old=globalThis.fetch;let calls=0;globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response('{}',{status:403});};try{await assert.rejects(readHarmonie({KNMI_OPEN_DATA_API_KEY:'test-key'}),/AUTH/);assert.equal(calls,1);}finally{globalThis.fetch=old;}});

test('unordered future hours do not make a gap look like a complete planning horizon',()=>{
 const row=h=>({time:`2026-10-22T${String(h).padStart(2,'0')}:00:00Z`,u:[1],v:[1]});
 const now=Date.parse('2026-10-22T06:30:00Z');
 assert.deepEqual(forecastWindow([row(10),row(7),row(9),row(11),row(12),row(13),row(14)],now).map(x=>x.time),[row(7).time]);
 assert.equal(forecastWindow([row(10),row(7),row(9),row(8),row(11),row(12),row(13),row(14)],now).length,7);
 assert.equal(forecastWindow([{time:row(7).time,u:[1]},row(8)],now).length,1);
});

test('incomplete latest archive falls back to complete hours without forwarding the API key to storage',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now;let calls=0;
 Date.now=()=>Date.parse('2026-10-22T06:30:00Z');
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.redirect,'manual');
  if(url.includes('?maxKeys='))return Response.json({files:[{filename:'latest.tar'},{filename:'previous.tar'}]});
  if(url.endsWith('/url')){assert.equal(options.headers.Authorization,'fallback-fixture-key');return Response.json({temporaryDownloadUrl:'https://storage.googleapis.com/'+(url.includes('latest.tar')?'latest':'previous')});}
  assert.equal(options.headers,undefined);return new Response(tar(url.endsWith('latest')?2:9));
 };
 try{const d=await readHarmonie({KNMI_OPEN_DATA_API_KEY:'fallback-fixture-key'});assert.equal(d.rows.length,7);assert.equal(d.filename,'previous.tar');assert.equal(d.partial,false);assert.equal(calls,5);}finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
});

test('historical selection validates real dates, archive start and Dutch daylight-saving day windows',()=>{
 const now=Date.now;Date.now=()=>Date.parse('2026-11-01T12:00:00Z');
 try{
  const spring=historicalHarmonieOptions('2026-03-28T18','2026-03-29');assert.equal(spring.limit,23);assert.equal(spring.until-spring.start,23*3600000);
  const autumn=historicalHarmonieOptions('2026-10-24T18','2026-10-25');assert.equal(autumn.limit,25);assert.equal(autumn.until-autumn.start,25*3600000);
  assert.throws(()=>historicalHarmonieOptions('2026-01-07T23','2026-01-08'),/INVALID/);
  assert.throws(()=>historicalHarmonieOptions('2026-02-30T06','2026-03-01'),/INVALID/);
  assert.throws(()=>historicalHarmonieOptions('2026-12-01T06','2026-12-01'),/INVALID/);
  assert.throws(()=>historicalHarmonieOptions('2026-10-20T06','2026-10-25'),/INVALID/);
 }finally{Date.now=now;}
});
test('historical retrieval retains past forecast hours and reads the exact selected run without latest-run fallback',async()=>{
 const oldFetch=globalThis.fetch,oldNow=Date.now;Date.now=()=>Date.parse('2026-10-23T12:00:00Z');let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;if(url.endsWith('/url')){assert.match(url,/HARM43_V1_P1_2026102206\.tar\/url$/);return Response.json({temporaryDownloadUrl:'https://storage.googleapis.com/history'});}assert.equal(options.headers,undefined);return new Response(tar());};
 try{const d=await readHarmonie({KNMI_OPEN_DATA_API_KEY:'archive-fixture-key'},{run:'2026-10-22T06',day:'2026-10-22'});assert.equal(d.historical,true);assert.equal(d.stale,false);assert.equal(d.rows.length,9);assert.equal(d.run,'2026-10-22T06:00:00.000Z');assert.equal(calls,2);}finally{globalThis.fetch=oldFetch;Date.now=oldNow;}
});

test('P2b uses its own dataset and cache, labels a single member without claiming ensemble statistics',async()=>{
 const oldFetch=globalThis.fetch,oldNow=Date.now;Date.now=()=>Date.parse('2026-10-22T06:30:00Z');let listed='';
 globalThis.fetch=async(url,options)=>{
  if(url.includes('?maxKeys=')){listed=url;return Response.json({files:[{filename:'HARM43_V1_P2B_2026102206.tar'}]});}
  if(url.endsWith('/url'))return Response.json({temporaryDownloadUrl:'https://storage.googleapis.com/p2b'});
  assert.equal(options.headers,undefined);return new Response(tar());
 };
 try{const d=await readHarmonie({KNMI_OPEN_DATA_API_KEY:'p2b-fixture-key'},{model:'p2b'});assert.match(listed,/cy43_p2b/);assert.equal(d.model,'p2b');assert.equal(d.ensemble,true);assert.equal(d.ensembleSummary,false);assert.equal(d.rows.length,7);assert.ok(d.member);assert.equal(d.heightM,10);
 await assert.rejects(readHarmonie({KNMI_OPEN_DATA_API_KEY:'unused'},{model:'p2b',run:'2026-10-10T06',day:'2026-10-10'}),/P2B_ARCHIVE/);
 await assert.rejects(readHarmonie({KNMI_OPEN_DATA_API_KEY:'unused'},{model:'arbitrary'}),/INVALID_MODEL/);
 }finally{globalThis.fetch=oldFetch;Date.now=oldNow;}
});

test('latest run day comparison includes past and future hours from the newest run and separates the future-only cache',async()=>{
 const oldFetch=globalThis.fetch,oldNow=Date.now;Date.now=()=>Date.parse('2026-10-22T10:30:00Z');let listings=0,downloads=0;
 globalThis.fetch=async(url,options)=>{
  if(url.includes('?maxKeys=')){listings++;return Response.json({files:[{filename:'newest.tar'},{filename:'older.tar'}]});}
  if(url.endsWith('/url')){assert.match(url,/newest.tar/);return Response.json({temporaryDownloadUrl:'https://storage.googleapis.com/day-comparison'});}
  downloads++;return new Response(tar(18));
 };
 try{
  const d=await readHarmonie({KNMI_OPEN_DATA_API_KEY:'day-comparison-key'},{day:'2026-10-22'});
  assert.equal(d.rows[0].time,'2026-10-22T06:00:00.000Z');assert.equal(d.rows.at(-1).time,'2026-10-22T21:00:00.000Z');assert.equal(d.historical,false);assert.equal(d.filename,'newest.tar');assert.equal(downloads,1);
  const future=await readHarmonie({KNMI_OPEN_DATA_API_KEY:'day-comparison-key'});assert.equal(future.rows[0].time,'2026-10-22T11:00:00.000Z');assert.equal(future.rows.length,7);assert.equal(listings,2);
 }finally{globalThis.fetch=oldFetch;Date.now=oldNow;}
});

function memoryBucket(){const objects=new Map();return {objects,async head(k){return objects.has(k)?{}:null;},async get(k){return objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null;},async put(k,v){objects.set(k,v);}};}
test('background extraction persists both parks and whole horizon; repeat polls never download the same run',async()=>{
 const {updateHarmonieSnapshot,readStoredHarmonie}=await import('../src/harmonie.mjs');
 const oldFetch=globalThis.fetch,oldNow=Date.now;Date.now=()=>Date.parse('2026-10-22T10:30:00Z');let downloads=0;
 const BUCKET=memoryBucket(),env={BUCKET,KNMI_OPEN_DATA_API_KEY:'snapshot-fixture'};
 globalThis.fetch=async url=>url.includes('?maxKeys=')?Response.json({files:[{filename:'HARM43_V1_P1_2026102206.tar'}]}):url.endsWith('/url')?Response.json({temporaryDownloadUrl:'https://storage.googleapis.com/snapshot'}):(downloads++,new Response(tar(49)));
 try{
  const result=await updateHarmonieSnapshot(env);assert.equal(result.hours,49);assert.equal(result.updated,true);
  assert.equal((await updateHarmonieSnapshot(env)).updated,false);assert.equal(downloads,1);
  globalThis.fetch=()=>{throw Error('Visitor must not fetch upstream');};
  const day=await readStoredHarmonie(env,{day:'2026-10-22'});assert.equal(day.rows[0].time,'2026-10-22T06:00:00.000Z');assert.equal(day.rows[0].parks.length,2);
  const future=await readStoredHarmonie(env);assert.equal(future.rows.length,7);assert.equal(future.rows[0].time,'2026-10-22T11:00:00.000Z');assert.equal(future.stored,true);
  Date.now=()=>Date.parse('2026-10-22T14:30:00Z');assert.equal((await readStoredHarmonie(env)).stale,true);
  const history=await readStoredHarmonie(env,{run:'2026-10-22T06',day:'2026-10-22'});assert.equal(history.historical,true);assert.equal(history.stale,false);
  await assert.rejects(readStoredHarmonie(env,{model:'p2b'}),/PENDING/);
 }finally{globalThis.fetch=oldFetch;Date.now=oldNow;}
});
test('failed extraction leaves previous durable forecast unchanged',async()=>{
 const {updateHarmonieSnapshot}=await import('../src/harmonie.mjs');const BUCKET=memoryBucket();await BUCKET.put('harmonie/v1/p1/latest.json',JSON.stringify({run:'2026-10-22T05:00:00.000Z',key:'previous'}));
 const oldFetch=globalThis.fetch,oldNow=Date.now;Date.now=()=>Date.parse('2026-10-22T10:30:00Z');
 globalThis.fetch=async url=>url.includes('?maxKeys=')?Response.json({files:[{filename:'HARM43_V1_P1_2026102206.tar'}]}):url.endsWith('/url')?Response.json({temporaryDownloadUrl:'https://storage.googleapis.com/incomplete'}):new Response(tar(9));
 try{await assert.rejects(updateHarmonieSnapshot({BUCKET,KNMI_OPEN_DATA_API_KEY:'test'}),/INCOMPLETE/);assert.equal((await (await BUCKET.get('harmonie/v1/p1/latest.json')).json()).key,'previous');assert.equal(BUCKET.objects.size,1);}finally{globalThis.fetch=oldFetch;Date.now=oldNow;}
});

test('missing historical run is backfilled once for both parks without replacing the latest snapshot',async()=>{
 const {readStoredHarmonie}=await import('../src/harmonie.mjs');const BUCKET=memoryBucket();
 const latest={run:'2026-10-22T09:00:00.000Z',key:'newer'};await BUCKET.put('harmonie/v1/p1/latest.json',JSON.stringify(latest));
 const oldFetch=globalThis.fetch,oldNow=Date.now;Date.now=()=>Date.parse('2026-10-22T10:30:00Z');let downloads=0;
 globalThis.fetch=async url=>{assert.ok(!url.includes('?maxKeys='));if(url.endsWith('/url')){assert.match(url,/HARM43_V1_P1_2026102206.tar/);return Response.json({temporaryDownloadUrl:'https://storage.googleapis.com/backfill'});}downloads++;return new Response(tar(49));};
 try{
  const env={BUCKET,KNMI_OPEN_DATA_API_KEY:'historical-backfill'},selection={run:'2026-10-22T06',day:'2026-10-22'};
  const first=await readStoredHarmonie(env,selection);assert.equal(first.historical,true);assert.equal(first.rows[0].parks.length,2);assert.equal(first.rows.length,16);
  globalThis.fetch=()=>{throw Error('Backfilled run must use durable storage');};
  assert.deepEqual(await readStoredHarmonie(env,selection),first);assert.equal(downloads,1);
  assert.deepEqual(await (await BUCKET.get('harmonie/v1/p1/latest.json')).json(),latest);
 }finally{globalThis.fetch=oldFetch;Date.now=oldNow;}
});
