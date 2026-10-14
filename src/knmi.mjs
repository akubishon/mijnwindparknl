const windCache = new Map();
const localParts = stamp => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23' }).formatToParts(new Date(stamp)).map(p=>[p.type,p.value]));
export function modelHours(raw, day) {
  const coverage=raw.coverages?.[0];
  if(raw.coverages?.length!==1 || coverage?.['eumetnet:locationId']!=='0-20000-0-06258' || raw.parameters?.ff?.unit?.symbol?.value!=='m/s')throw Error('Invalid KNMI data');
  const stamps=coverage.domain?.axes?.t?.values || [], values=coverage.ranges?.ff?.values || [];
  if(stamps.length!==values.length)throw Error('Invalid KNMI time axis');
  const samples=stamps.map((stamp,i)=>({t:Date.parse(stamp)-300000,v:typeof values[i]==='number'&&Number.isFinite(values[i])&&values[i]>=0?values[i]:null}));
  if(samples.some((s,i)=>!Number.isFinite(s.t)||(i&&s.t<=samples[i-1].t)))throw Error('Invalid KNMI time axis');
  const base=Date.parse(day+'T00:00:00Z');
  const doy=Math.floor((base-Date.UTC(Number(day.slice(0,4)),0,1))/86400000)+1;
  const alpha=.115+.065*Math.cos(2*Math.PI*(doy-1)/365);
  const turbine=v=>v<3||v>25?0:v>=11.5?4300:4300*(v**3-3**3)/(11.5**3-3**3);
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
    const hub=v*11.5**alpha, unperturbed=turbine(hub);
    bucket.sum+=(unperturbed>0?turbine(hub*.95):unperturbed)*89/1000;
  }
  return buckets.map((b,hour)=>({hour,modelMWh:b.count&&!b.missing?b.sum/60:null,minutes:b.count,missingMinutes:b.missing}));
}
export async function readWind(day, env) {
  if(!env.KNMI_EDR_API_KEY)throw Error('KNMI_NOT_CONFIGURED');
  const hit=windCache.get(day);if(hit&&Date.now()<hit.expires)return hit.promise;
  const promise=(async()=>{
    // The UTC interval includes both possible Dutch day boundaries, including DST.
    const base=Date.parse(day+'T00:00:00Z');
    const query=new URLSearchParams({'datetime':`${new Date(base-3*3600000).toISOString()}/${new Date(base+25*3600000).toISOString()}`,'parameter-name':'ff'});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20000);
    let r;
    try { r=await fetch('https://api.dataplatform.knmi.nl/edr/v1/collections/10-minute-in-situ-meteorological-observations/locations/0-20000-0-06258?'+query,{headers:{Authorization:env.KNMI_EDR_API_KEY.trim(),Accept:'application/json'},redirect:'manual',signal:controller.signal}); } catch(e) { console.error('KNMI_FETCH_FAILED',e?.name||'Error');throw Error('KNMI_CONNECTION'); } finally {clearTimeout(timer);}
    if(!r.ok){console.error('KNMI_HTTP_STATUS',r.status);throw Error(r.status===401||r.status===403?'KNMI_AUTH':'KNMI_UNAVAILABLE');}
    const hours=modelHours(await r.json(),day);
    return {day,station:'Houtribdijk',hours};
  })();
  windCache.set(day,{promise,expires:Date.now()+300000});promise.catch(()=>windCache.delete(day));
  if(windCache.size>100)windCache.delete(windCache.keys().next().value);
  return promise;
}
