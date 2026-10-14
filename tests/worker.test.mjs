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
