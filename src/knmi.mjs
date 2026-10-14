const beabuorrenCurve=[[1, 0.0], [1.5, 0.0], [2, 0.0], [2.5, 0.0], [3.1, 1.54], [3.5, 11.78], [4, 32.0], [4.5, 58.2], [5, 90.0], [5.5, 127.66], [6, 172.0], [6.5, 224.18], [7, 286.0], [7.5, 358.77], [8, 441.0], [8.5, 530.51], [9, 625.0], [9.5, 722.21], [10, 820.0], [10.5, 915.92], [11, 1006.0], [11.5, 1086.13], [12, 1153.0], [12.5, 1204.31], [13, 1241.0], [13.5, 1265.11], [14, 1280.0], [14.5, 1288.98], [15, 1294.0], [15.5, 1296.58], [16, 1298.0], [16.5, 1299.9], [17, 1300.0], [17.5, 1300.0], [18, 1300.0], [18.5, 1300.0], [19, 1300.0], [19.5, 1300.0], [20, 1300.0], [20.5, 1300.0], [21, 1300.0], [21.5, 1300.0], [22, 1300.0], [22.5, 1300.0], [23, 1300.0], [23.5, 1300.0], [24, 1300.0], [24.5, 1300.0]];
const windCache = new Map();
const localParts = stamp => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23' }).formatToParts(new Date(stamp)).map(p=>[p.type,p.value]));
export function modelOptions(params) {
  const number=(key,fallback,min,max)=>{const text=params.get(key);const v=text===null?fallback:Number(text);if(text===''||!Number.isFinite(v)||v<min||v>max)throw Error('INVALID_MODEL_OPTIONS');return v;};
  const park=params.get('park')||'fryslan';if(!['fryslan','beabuorren'].includes(park))throw Error('INVALID_MODEL_OPTIONS');
  const isBea=park==='beabuorren';
  const station=params.get('station')||'stavoren';
  if(!['stavoren','houtribdijk'].includes(station))throw Error('INVALID_MODEL_OPTIONS');
  const wake=params.get('wake')??'1', seasonal=params.get('seasonal')??(isBea?'0':'1');
  if(!['0','1'].includes(wake)||!['0','1'].includes(seasonal))throw Error('INVALID_MODEL_OPTIONS');
  const o={park,station,stationId:station==='stavoren'?'0-20000-0-06267':'0-20000-0-06258',wake:wake==='1',seasonal:seasonal==='1',height:number('height',isBea?60:115,10,250),alpha:number('alpha',isBea?.2:.115,0,.5),wakePercent:number('wakePercent',isBea?2:5,0,30),ratedKW:number('ratedKW',isBea?1300:4300,100,10000),cutIn:number('cutIn',3,0,10),ratedSpeed:number('ratedSpeed',11.5,1,25),cutOut:number('cutOut',25,5,40)};
  if(!(o.cutIn<o.ratedSpeed&&o.ratedSpeed<o.cutOut))throw Error('INVALID_MODEL_OPTIONS');
  return o;
}
export function modelHours(raw, day, options=modelOptions(new URLSearchParams())) {
  const coverage=raw.coverages?.[0];
  if(raw.coverages?.length!==1 || coverage?.['eumetnet:locationId']!==options.stationId || raw.parameters?.ff?.unit?.symbol?.value!=='m/s')throw Error('Invalid KNMI data');
  const stamps=coverage.domain?.axes?.t?.values || [], values=coverage.ranges?.ff?.values || [];
  if(stamps.length!==values.length)throw Error('Invalid KNMI time axis');
  const samples=stamps.map((stamp,i)=>({t:Date.parse(stamp)-300000,v:typeof values[i]==='number'&&Number.isFinite(values[i])&&values[i]>=0?values[i]:null}));
  if(samples.some((s,i)=>!Number.isFinite(s.t)||(i&&s.t<=samples[i-1].t)))throw Error('Invalid KNMI time axis');
  const base=Date.parse(day+'T00:00:00Z');
  const doy=Math.floor((base-Date.UTC(Number(day.slice(0,4)),0,1))/86400000)+1;
  const alpha=options.alpha+(options.seasonal?.065*Math.cos(2*Math.PI*(doy-1)/365):0);
  const cubic=v=>v<options.cutIn||v>options.cutOut?0:v>=options.ratedSpeed?options.ratedKW:options.ratedKW*(v**3-options.cutIn**3)/(options.ratedSpeed**3-options.cutIn**3);
  const turbine=v=>{
    if(options.park!=='beabuorren')return cubic(v);
    if(v<beabuorrenCurve[0][0]||v>=options.cutOut)return 0;
    let i=beabuorrenCurve.findIndex(p=>p[0]>v);if(i<0)return options.ratedKW;
    const [v0,p0]=beabuorrenCurve[i-1], [v1,p1]=beabuorrenCurve[i];
    return (p0+(p1-p0)*(v-v0)/(v1-v0))*options.ratedKW/1300;
  };
  const buckets=Array.from({length:24},()=>({sum:0,count:0,missing:0}));
  let index=0;
  for(let t=base-3*3600000;t<base+25*3600000;t+=60000){
    const p=localParts(t);if(`${p.year}-${p.month}-${p.day}`!==day)continue;
    while(index<samples.length&&samples[index].t<t)index++;
    let v=null;
    if(samples[index]?.t===t)v=samples[index].v;
    else if(index>0&&index<samples.length){const a=samples[index-1],b=samples[index];if(a.v!==null&&b.v!==null&&b.t-a.t<=600000)v=a.v+(b.v-a.v)*(t-a.t)/(b.t-a.t);}
    const bucket=buckets[Number(p.hour)];bucket.count++;
    if(v===null){bucket.missing++;continue;}
    const hub=v*(options.height/10)**alpha, unperturbed=turbine(hub);
    bucket.sum+=(options.wake&&unperturbed>0?turbine(hub*(1-options.wakePercent/100)):unperturbed)*(options.park==='beabuorren'?8:89)/1000;
  }
  return buckets.map((b,hour)=>({hour,modelMWh:b.count&&!b.missing?b.sum/60:null,minutes:b.count,missingMinutes:b.missing}));
}
export async function readWind(day, env, options=modelOptions(new URLSearchParams())) {
  if(!env.KNMI_EDR_API_KEY)throw Error('KNMI_NOT_CONFIGURED');
  const cacheKey=day+JSON.stringify(options);
  const hit=windCache.get(cacheKey);if(hit&&Date.now()<hit.expires)return hit.promise;
  const promise=(async()=>{
    // The UTC interval includes both possible Dutch day boundaries, including DST.
    const base=Date.parse(day+'T00:00:00Z');
    const query=new URLSearchParams({'datetime':`${new Date(base-3*3600000).toISOString()}/${new Date(base+25*3600000).toISOString()}`,'parameter-name':'ff'});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20000);
    let r;
    try { r=await fetch('https://api.dataplatform.knmi.nl/edr/v1/collections/10-minute-in-situ-meteorological-observations/locations/'+options.stationId+'?'+query,{headers:{Authorization:env.KNMI_EDR_API_KEY.trim(),Accept:'application/json'},redirect:'manual',signal:controller.signal}); } catch(e) { console.error('KNMI_FETCH_FAILED',e?.name||'Error');throw Error('KNMI_CONNECTION'); } finally {clearTimeout(timer);}
    if(!r.ok){console.error('KNMI_HTTP_STATUS',r.status);throw Error(r.status===401||r.status===403?'KNMI_AUTH':'KNMI_UNAVAILABLE');}
    const hours=modelHours(await r.json(),day,options);
    return {day,station:options.station==='stavoren'?'Stavoren':'Houtribdijk',hours};
  })();
  windCache.set(cacheKey,{promise,expires:Date.now()+300000});promise.catch(()=>windCache.delete(cacheKey));
  if(windCache.size>100)windCache.delete(windCache.keys().next().value);
  return promise;
}
