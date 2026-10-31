import fryslanCurve from './opsplitsing/python/data/fryslan.json' with { type: 'json' };
import stationCatalog from './stations.json' with { type: 'json' };
import heightTable from './opsplitsing/python/data/ashoogte.json' with { type: 'json' };
// Same wind source as windprofiel/windbron.py (method 'onafhankelijk'): per ten minutes the mean of
// Houtribdijk and Stavoren (both must measure), hub-height factor per park and month from WINS50.
// The old production-calibrated route stays available as height='alpha' (fixed α, optional seasonal term).
export const AVERAGE='gemiddelde';
const AVERAGE_IDS=['0-20000-0-06258','0-20000-0-06267'],AVERAGE_NAME='Houtribdijk + Stavoren';
const beabuorrenCurve=[[1, 0.0], [1.5, 0.0], [2, 0.0], [2.5, 0.0], [3.1, 1.54], [3.5, 11.78], [4, 32.0], [4.5, 58.2], [5, 90.0], [5.5, 127.66], [6, 172.0], [6.5, 224.18], [7, 286.0], [7.5, 358.77], [8, 441.0], [8.5, 530.51], [9, 625.0], [9.5, 722.21], [10, 820.0], [10.5, 915.92], [11, 1006.0], [11.5, 1086.13], [12, 1153.0], [12.5, 1204.31], [13, 1241.0], [13.5, 1265.11], [14, 1280.0], [14.5, 1288.98], [15, 1294.0], [15.5, 1296.58], [16, 1298.0], [16.5, 1299.9], [17, 1300.0], [17.5, 1300.0], [18, 1300.0], [18.5, 1300.0], [19, 1300.0], [19.5, 1300.0], [20, 1300.0], [20.5, 1300.0], [21, 1300.0], [21.5, 1300.0], [22, 1300.0], [22.5, 1300.0], [23, 1300.0], [23.5, 1300.0], [24, 1300.0], [24.5, 1300.0]];
const windCache = new Map();
const localParts = stamp => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23' }).formatToParts(new Date(stamp)).map(p=>[p.type,p.value]));
export function modelOptions(params) {
  const number=(key,fallback,min,max)=>{const text=params.get(key);const v=text===null?fallback:Number(text);if(text===''||!Number.isFinite(v)||v<min||v>max)throw Error('INVALID_MODEL_OPTIONS');return v;};
  const park=params.get('park')||'fryslan';if(!['fryslan','beabuorren'].includes(park))throw Error('INVALID_MODEL_OPTIONS');
  const isBea=park==='beabuorren';
  const station=params.get('station')||AVERAGE;
  const stationId=({stavoren:'0-20000-0-06267',houtribdijk:'0-20000-0-06258'})[station]||station;
  const selectedStation=stationId===AVERAGE?{name:AVERAGE_NAME}:stationCatalog.find(s=>s.id===stationId);
  if(!selectedStation)throw Error('INVALID_MODEL_OPTIONS');
  const wake=params.get('wake')??'1', seasonal=params.get('seasonal')??(isBea?'0':'1'), hoogte=params.get('hoogte')||'wins50';
  if(!['0','1'].includes(wake)||!['0','1'].includes(seasonal)||!['wins50','alpha'].includes(hoogte))throw Error('INVALID_MODEL_OPTIONS');
  const o={park,station,stationId,stationName:selectedStation.name,hoogte,wake:wake==='1',seasonal:seasonal==='1',height:number('height',isBea?60:115,10,250),alpha:number('alpha',isBea?.2:.115,0,.5),wakePercent:number('wakePercent',isBea?2:5,0,30),ratedKW:number('ratedKW',isBea?1300:4300,100,10000),cutIn:number('cutIn',3,0,10),ratedSpeed:number('ratedSpeed',11.5,1,25),cutOut:number('cutOut',isBea?25:fryslanCurve.cut_out,5,40)};
  if(!(o.cutIn<o.ratedSpeed&&o.ratedSpeed<o.cutOut))throw Error('INVALID_MODEL_OPTIONS');
  return o;
}
// Monthly factors for a station source, as month_factors() in windbron.py. A station without its own
// factor gets only the WINS50 height increase above the park; its location is then not corrected.
export function monthFactors(park,stationId) {
  const entry=heightTable.parken[park];
  if(stationId===AVERAGE)return {factor:entry.factor,origin:'WINS50 voor '+entry.bron};
  const item=entry.bronvergelijking.find(b=>b.stations.length===1&&b.stations[0]===stationId);
  return item?{factor:item.factor,origin:'WINS50 voor '+item.naam}:{factor:entry.schering,origin:'WINS50-hoogtetoename op de parklocatie; stationsligging niet gecorrigeerd'};
}
// v_hub / ff for this Dutch calendar day.
export function hubFactor(day,options) {
  if(options.hoogte!=='alpha')return monthFactors(options.park,options.stationId).factor[Number(day.slice(5,7))-1];
  const base=Date.parse(day+'T00:00:00Z');
  const doy=Math.floor((base-Date.UTC(Number(day.slice(0,4)),0,1))/86400000)+1;
  return (options.height/10)**(options.alpha+(options.seasonal?.065*Math.cos(2*Math.PI*(doy-1)/365):0));
}
// v_as / v_10 voor HARMONIE-roosterwind op 10 m bij het park. Zelfde methode, tabel, park en maand als de KNMI-wind,
// maar alleen de WINS50-hoogtetoename op de parklocatie: F voor stations bevat ook het verschil tussen station en park.
// In de oude methode krijgt HARMONIE dezelfde α als de stationswind.
export function forecastFactor(day,options) {
  return options.hoogte==='alpha'?hubFactor(day,options):heightTable.parken[options.park].schering[Number(day.slice(5,7))-1];
}
export function dutchDay(stamp) {const p=localParts(stamp);return `${p.year}-${p.month}-${p.day}`;}
export function describeWind(day,options) {
  const hub=options.park==='beabuorren'?60:115,f=hubFactor(day,options),nl=v=>v.toFixed(3).replace('.',',');
  const source='KNMI '+options.stationName+(options.stationId===AVERAGE?' (gemiddelde per tien minuten, alleen als beide meten)':'');
  if(options.hoogte==='alpha')return `${source}; oude methode met hoogte-exponent α (${options.seasonal?'seizoens-α, eerder geijkt op productie':'vaste α, aanname'}), deze dag factor ${nl(f)} van 10 naar ${options.height} m.`;
  return `${source}; hoogtevertaling F = ${nl(f)} voor deze maand (${monthFactors(options.park,options.stationId).origin}), gelijk aan α ≈ ${nl(Math.log(f)/Math.log(hub/10))} van 10 naar ${hub} m. Aanname zonder meting op ashoogte; geen productiegegevens.`;
}
export function windPowerModel(day,options,factor=hubFactor(day,options)) {
  const isBea=options.park==='beabuorren';
  const curve=isBea?beabuorrenCurve:fryslanCurve.points;
  // A lower user limit may stop production earlier; it cannot extend the digitized source range.
  const cutOut=isBea?options.cutOut:Math.min(options.cutOut,fryslanCurve.cut_out);
  const turbine=v=>{
    if(v<curve[0][0]||v>=cutOut)return 0;
    const i=curve.findIndex(p=>p[0]>v);
    const nominal=isBea?1300:4300;
    if(i<0)return curve.at(-1)[1]*options.ratedKW/nominal;
    const [v0,p0]=curve[i-1], [v1,p1]=curve[i];
    return (p0+(p1-p0)*(v-v0)/(v1-v0))*options.ratedKW/nominal;
  };
  return v=>{if(v===null)return null;const hub=v*factor, unperturbed=turbine(hub);return (options.wake&&unperturbed>0?turbine(hub*(1-options.wakePercent/100)):unperturbed)*(options.park==='beabuorren'?8:89)/1000;};
}
export function modelHours(raw, day, options=modelOptions(new URLSearchParams()), includeIntervals=false) {
  const coverage=raw.coverages?.[0];
  if(raw.coverages?.length!==1 || coverage?.['eumetnet:locationId']!==options.stationId || raw.parameters?.ff?.unit?.symbol?.value!=='m/s')throw Error('Invalid KNMI data');
  const stamps=coverage.domain?.axes?.t?.values || [], values=coverage.ranges?.ff?.values || [];
  if(stamps.length!==values.length)throw Error('Invalid KNMI time axis');
  const samples=stamps.map((stamp,i)=>({t:Date.parse(stamp)-300000,direction:typeof coverage.ranges?.dd?.values?.[i]==='number'&&Number.isFinite(coverage.ranges.dd.values[i])&&coverage.ranges.dd.values[i]>=0&&coverage.ranges.dd.values[i]<=360?coverage.ranges.dd.values[i]:null,v:typeof values[i]==='number'&&Number.isFinite(values[i])&&values[i]>=0?values[i]:null}));
  if(samples.some((s,i)=>!Number.isFinite(s.t)||(i&&s.t<=samples[i-1].t)))throw Error('Invalid KNMI time axis');
  const base=Date.parse(day+'T00:00:00Z');
  const parkPower=windPowerModel(day,options);
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
    bucket.sum+=parkPower(v);
  }
  const hours=buckets.map((b,hour)=>({hour,modelMWh:b.count&&!b.missing?b.sum/60:null,minutes:b.count,missingMinutes:b.missing}));
  if(!includeIntervals)return hours;
  const intervals=samples.filter(s=>{const p=localParts(s.t);return `${p.year}-${p.month}-${p.day}`===day&&s.t+300000<=Date.now();}).map(s=>({start:new Date(s.t-300000).toISOString(),end:new Date(s.t+300000).toISOString(),powerMW:parkPower(s.v),timestamp:new Date(s.t+300000).toISOString(),windSpeedMS:s.v,windDirectionDeg:s.direction}));
  return {hours,intervals};
}
function cached(key,make) {
  const hit=windCache.get(key);if(hit&&Date.now()<hit.expires)return hit.promise;
  const promise=make();
  windCache.set(key,{promise,expires:Date.now()+300000});promise.catch(()=>windCache.delete(key));
  if(windCache.size>100)windCache.delete(windCache.keys().next().value);
  return promise;
}
function fetchStation(day,env,stationId) {
  return cached('raw|'+day+'|'+stationId,async()=>{
    // The UTC interval includes both possible Dutch day boundaries, including DST.
    const base=Date.parse(day+'T00:00:00Z');
    const query=new URLSearchParams({'datetime':`${new Date(base-3*3600000).toISOString()}/${new Date(base+25*3600000).toISOString()}`,'parameter-name':'ff,dd'});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20000);
    let r;
    try { r=await fetch('https://api.dataplatform.knmi.nl/edr/v1/collections/10-minute-in-situ-meteorological-observations/locations/'+stationId+'?'+query,{headers:{Authorization:env.KNMI_EDR_API_KEY.trim(),Accept:'application/json'},redirect:'manual',signal:controller.signal}); } catch(e) { console.error('KNMI_FETCH_FAILED',e?.name||'Error');throw Error('KNMI_CONNECTION'); } finally {clearTimeout(timer);}
    if(!r.ok){console.error('KNMI_HTTP_STATUS',r.status);throw Error(r.status===401||r.status===403?'KNMI_AUTH':'KNMI_UNAVAILABLE');}
    return r.json();
  });
}
// Mean of two KNMI responses per timestamp. A timestamp where either station misses stays missing (no filling).
// Direction is the mean of the two unit vectors, only when both directions are known.
export function averageObservations(rawA,rawB) {
  const series=raw=>{const c=raw.coverages?.[0];if(raw.coverages?.length!==1||raw.parameters?.ff?.unit?.symbol?.value!=='m/s')throw Error('Invalid KNMI data');
   const t=c.domain?.axes?.t?.values||[],ff=c.ranges?.ff?.values||[],dd=c.ranges?.dd?.values||[];if(t.length!==ff.length)throw Error('Invalid KNMI time axis');
   return new Map(t.map((s,i)=>[s,{v:typeof ff[i]==='number'&&Number.isFinite(ff[i])&&ff[i]>=0?ff[i]:null,d:typeof dd[i]==='number'&&Number.isFinite(dd[i])&&dd[i]>=0&&dd[i]<=360?dd[i]:null}]));};
  const a=series(rawA),b=series(rawB),stamps=[...new Set([...a.keys(),...b.keys()])].sort((x,y)=>Date.parse(x)-Date.parse(y));
  const rad=Math.PI/180,ff=[],dd=[];
  for(const s of stamps){const p=a.get(s),q=b.get(s);
   ff.push(p?.v==null||q?.v==null?null:(p.v+q.v)/2);
   dd.push(p?.d==null||q?.d==null?null:(Math.atan2(Math.sin(p.d*rad)+Math.sin(q.d*rad),Math.cos(p.d*rad)+Math.cos(q.d*rad))/rad+360)%360);}
  return {parameters:rawA.parameters,coverages:[{'eumetnet:locationId':AVERAGE,domain:{axes:{t:{values:stamps}}},ranges:{ff:{values:ff},dd:{values:dd}}}]};
}
export async function readWind(day, env, options=modelOptions(new URLSearchParams())) {
  if(!env.KNMI_EDR_API_KEY)throw Error('KNMI_NOT_CONFIGURED');
  return cached(day+JSON.stringify(options),async()=>{
    const raw=options.stationId===AVERAGE
      ?averageObservations(...await Promise.all(AVERAGE_IDS.map(id=>fetchStation(day,env,id))))
      :await fetchStation(day,env,options.stationId);
    const profile=modelHours(raw,day,options,true);
    return {day,station:options.stationName,windSource:describeWind(day,options),...profile};
  });
}

export function stationsByDistance(park) {
  // Park centres as in ashoogte.json (Fryslân estimated from the zoning plan, a few km uncertain); great-circle distance in kilometres.
  const {latitude,longitude}=heightTable.locaties[park],centre=[latitude,longitude];
  const rad=v=>v*Math.PI/180;
  return stationCatalog.map(s=>{const a=Math.sin(rad(s.latitude-centre[0])/2)**2+Math.cos(rad(centre[0]))*Math.cos(rad(s.latitude))*Math.sin(rad(s.longitude-centre[1])/2)**2;return {...s,distanceKM:6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))};}).sort((a,b)=>a.distanceKM-b.distanceKM||a.name.localeCompare(b.name));
}

// Align original observations by their exact ten-minute interval, then combine wind BEFORE power.
// Default rule 'gemiddelde' (both must measure) with the factor for that source; with the old height method
// the old rule: per interval the highest wind, the other station as fallback.
export function stationComparison(stavoren,houtribdijk,day,options) {
  const map=rows=>new Map(rows.map(p=>[p.start+'|'+p.end,p]));
  const rule=options.hoogte==='alpha'?'hoogste':AVERAGE;
  const a=map(stavoren),b=map(houtribdijk),power=windPowerModel(day,{...options,stationId:AVERAGE,stationName:AVERAGE_NAME});
  const result={rule,stavoren:[],houtribdijk:[],combination:[]};
  const base=Date.parse(day+'T00:00:00Z');
  for(let t=base-3*3600000;t<base+27*3600000;t+=600000){
    const local=localParts(t);if(`${local.year}-${local.month}-${local.day}`!==day||t+600000>Date.now())continue;
    const start=new Date(t).toISOString(),end=new Date(t+600000).toISOString(),key=start+'|'+end;
    const empty={start,end,timestamp:end,powerMW:null,windSpeedMS:null};
    const pa=a.get(key)||empty,pb=b.get(key)||empty;
    const av=typeof pa.windSpeedMS==='number'&&Number.isFinite(pa.windSpeedMS)?pa.windSpeedMS:null;
    const bv=typeof pb.windSpeedMS==='number'&&Number.isFinite(pb.windSpeedMS)?pb.windSpeedMS:null;
    const wind=rule===AVERAGE?(av===null||bv===null?null:(av+bv)/2):av===null?bv:bv===null?av:Math.max(av,bv);
    const highestStation=av===null?(bv===null?null:'Houtribdijk'):bv===null?'Stavoren':av===bv?'Gelijk':av>bv?'Stavoren':'Houtribdijk';
    result.stavoren.push({...pa});result.houtribdijk.push({...pb});
    result.combination.push({...empty,powerMW:power(wind),windSpeedMS:wind,highestStation,
      fallbackStation:rule===AVERAGE?null:av===null&&bv!==null?'Houtribdijk':bv===null&&av!==null?'Stavoren':null,
      stavorenPowerMW:pa.powerMW,houtribdijkPowerMW:pb.powerMW,
      stavorenWindSpeedMS:av,houtribdijkWindSpeedMS:bv,
      differenceMW:pa.powerMW===null||pb.powerMW===null?null:Math.abs(pa.powerMW-pb.powerMW)});
  }
  return result;
}
export async function readWindComparison(day,env,options=modelOptions(new URLSearchParams())) {
  const ids=['0-20000-0-06267','0-20000-0-06258'],names=['Stavoren','Houtribdijk'];
  const profiles=await Promise.allSettled(ids.map((stationId,i)=>readWind(day,env,{...options,station:stationId,stationId,stationName:names[i]})));
  return {day,windSource:describeWind(day,{...options,stationId:AVERAGE,stationName:AVERAGE_NAME}),...stationComparison(...profiles.map(r=>r.status==='fulfilled'?r.value.intervals:[]),day,options),
    unavailable:profiles.flatMap((r,i)=>r.status==='rejected'?[names[i]]:[])};
}
