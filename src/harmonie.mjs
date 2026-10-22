// KNMI HARMONIE Cy43 P1: bounded streaming TAR / GRIB1 point extraction.
// GRIB1 layout: https://codes.ecmwf.int/grib/format/grib1/
const HARMONIE_BASE='https://api.dataplatform.knmi.nl/open-data/v1/datasets/harmonie_arome_cy43_p1/versions/1.0/files';
export function harmonieModel(value='p1'){if(!['p1','p2b'].includes(value))throw Error('HARMONIE_INVALID_MODEL');return value;}
// Preserve the producing process and complete local ensemble extension as identity.
// Unknown member numbering is never advertised as control member or ensemble mean.
export function gribMember(a){const p=8,pl=u24(a,p);return [a[p+4],a[p+5],...a.subarray(p+28,p+pl)].join('-');}
const harmonieCache=new Map();
const u24=(a,p)=>a[p]*65536+a[p+1]*256+a[p+2];
const u16=(a,p)=>a[p]*256+a[p+1];
const signed=(v,bits)=>v>=2**(bits-1)?-(v-2**(bits-1)):v;
const textBytes=a=>new TextDecoder().decode(a);
const points=[{id:'fryslan',latitude:53.017,longitude:5.367},{id:'beabuorren',latitude:53.052,longitude:5.493}];
export function gribWindPoints(a){
 if(a.length<36||textBytes(a.subarray(0,4))!=='GRIB'||a[7]!==1||u24(a,4)!==a.length||textBytes(a.subarray(-4))!=='7777')throw Error('HARMONIE_FORMAT');
 const p=8,pl=u24(a,p);if(pl<28||p+pl>a.length-4)throw Error('HARMONIE_FORMAT');
 const param=a[p+8],level=u16(a,p+10);
 if(![33,34].includes(param)||a[p+9]!==105||level!==10||a[p+20]!==0)return null;
 if(!(a[p+7]&128)||a[p+17]!==1)throw Error('HARMONIE_FORMAT');
 const year=(a[p+24]-1)*100+a[p+12],run=Date.UTC(year,a[p+13]-1,a[p+14],a[p+15],a[p+16]);
 if(!Number.isFinite(run)||year<2024||year>2100||a[p+18]>60)throw Error('HARMONIE_FORMAT');
 const g=p+pl,gl=u24(a,g);if(gl<32||g+gl>a.length-4||a[g+5]!==0)throw Error('HARMONIE_GRID');
 const nx=u16(a,g+6),ny=u16(a,g+8),lat=signed(u24(a,g+10),24)/1000,lon=signed(u24(a,g+13),24)/1000,dx=u16(a,g+23)/1000,dy=u16(a,g+25)/1000,scan=a[g+27];
 if(!nx||!ny||nx===65535||ny===65535||!dx||!dy||(scan&63))throw Error('HARMONIE_GRID');
 const indexes=points.map(pt=>{const x=Math.round((pt.longitude-lon)/((scan&128)?-dx:dx)),y=Math.round((pt.latitude-lat)/((scan&64)?dy:-dy));if(x<0||x>=nx||y<0||y>=ny)throw Error('HARMONIE_GRID');return {index:y*nx+x,latitude:lat+y*((scan&64)?dy:-dy),longitude:lon+x*((scan&128)?-dx:dx)};});
 let b=g+gl;
 // For safety, bitmap-packed fields are explicitly rejected rather than treating missing points as zero.
 if(a[p+7]&64)throw Error('HARMONIE_PACKING');
 const bl=u24(a,b);if(bl<11||b+bl!==a.length-4||(a[b+3]&240))throw Error('HARMONIE_PACKING');
 const exponent=signed(u16(a,b+4),16),decimal=signed(u16(a,p+26),16),bits=a[b+10];
 if(bits>32||nx*ny*bits>(bl-11)*8-(a[b+3]&15))throw Error('HARMONIE_PACKING');
 const ref=(a[b+6]&128?-1:1)*16**((a[b+6]&127)-64)*u24(a,b+7)/16777216;
 const values=indexes.map(pt=>{let n=0;for(let bit=pt.index*bits;bit<(pt.index+1)*bits;bit++)n=n*2+((a[b+11+(bit>>3)]>>(7-(bit&7)))&1);const value=(ref+n*2**exponent)*10**(-decimal);if(!Number.isFinite(value)||Math.abs(value)>200)throw Error('HARMONIE_FORMAT');return {...pt,value};});
 return {run:new Date(run).toISOString(),time:new Date(run+a[p+18]*3600000).toISOString(),component:param===33?'u':'v',values};
}
async function streamReader(body){
 const reader=body.getReader();let chunk=new Uint8Array(),offset=0,total=0;
 return {async read(n,keep=true){if(n<0||n>100000000)throw Error('HARMONIE_SIZE');const out=keep?new Uint8Array(n):null;let done=0;while(done<n){if(offset===chunk.length){const r=await reader.read();if(r.done)throw Error('HARMONIE_TRUNCATED');chunk=r.value;offset=0;total+=chunk.length;if(total>900000000)throw Error('HARMONIE_SIZE');}const size=Math.min(n-done,chunk.length-offset);if(out)out.set(chunk.subarray(offset,offset+size),done);offset+=size;done+=size;}return out;},cancel:()=>reader.cancel().catch(()=>{})};
}
export function forecastWindow(rows,now,limit=7,until=Infinity){
 const complete=rows.filter(x=>x.u&&x.v&&Date.parse(x.time)>=now&&Date.parse(x.time)<until).sort((a,b)=>a.time.localeCompare(b.time));
 const first=complete[0];if(!first)return [];const consecutive=[first];
 for(const row of complete.slice(1)){if(Date.parse(row.time)-Date.parse(consecutive.at(-1).time)!==3600000)break;consecutive.push(row);if(consecutive.length>=limit)break;}
 return consecutive;
}
export async function extractHarmonie(body,now=Date.now(),options={}){
 const limit=options.limit||7,until=options.until??Infinity;
 const r=await streamReader(body),rows=new Map();let run=null,member=null;
 const add=m=>{if(!m)return;if(run&&run!==m.run)throw Error('HARMONIE_MIXED_RUN');run=m.run;const row=rows.get(m.time)||{time:m.time};if(row[m.component]&&JSON.stringify(row[m.component])!==JSON.stringify(m.values))throw Error('HARMONIE_MEMBER_CONFLICT');row[m.component]=m.values;rows.set(m.time,row);};
 try {for(let file=0;file<500;file++){
  const header=await r.read(512);if(header.every(v=>v===0))break;
  const name=textBytes(header.subarray(0,100)).split('\0')[0],size=parseInt(textBytes(header.subarray(124,136)).replace(/\0/g,'').trim(),8);
  if(!Number.isSafeInteger(size)||size<0||size>100000000)throw Error('HARMONIE_SIZE');
  const regular=[0,48].includes(header[156]);
  if(!regular||!/_GB(?:\.[a-z0-9]+)?$/i.test(name)){await r.read(size,false);}else{
   let remaining=size;
   while(remaining>=8){const lead=await r.read(8);remaining-=8;if(textBytes(lead.subarray(0,4))!=='GRIB')throw Error('HARMONIE_FORMAT');const length=u24(lead,4);if(lead[7]!==1||length<36||length>remaining+8||length>8000000)throw Error('HARMONIE_FORMAT');const message=new Uint8Array(length);message.set(lead);message.set(await r.read(length-8),8);remaining-=length-8;if(options.model==='p2b'){const decoded=gribWindPoints(message);if(decoded){const identity=gribMember(message);if(member===null)member=identity;if(identity===member)add(decoded);}}else add(gribWindPoints(message));}
   if(remaining)await r.read(remaining,false);
  }
  if(size%512)await r.read(512-size%512,false);
  if(forecastWindow([...rows.values()],now,limit,until).length>=limit)break;
 }}finally{await r.cancel();}
 if(!run||Date.parse(run)>Math.max(options.validationNow??now,options.expectedRun?Date.parse(options.expectedRun):now)+300000||options.expectedRun&&run!==options.expectedRun)throw Error('HARMONIE_FORMAT');
 const complete=forecastWindow([...rows.values()],now,limit,until);
 console.info('HARMONIE_WINDOW',JSON.stringify({run,fields:rows.size,completeFuture:[...rows.values()].filter(x=>x.u&&x.v&&Date.parse(x.time)>=now).length,consecutive:complete.length,first:[...rows.keys()].sort()[0],last:[...rows.keys()].sort().at(-1)}));
 return {run,member,points,rows:complete.map(row=>({time:row.time,parks:points.map((pt,i)=>({id:pt.id,windSpeedMS:Math.hypot(row.u[i].value,row.v[i].value),gridLatitude:row.u[i].latitude,gridLongitude:row.u[i].longitude}))}))};
}
export function harmonieDayWindow(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||new Date(Date.parse(day+'T00:00:00Z')).toISOString().slice(0,10)!==day)throw Error('HARMONIE_INVALID_HISTORY');
 const dayStamp=Date.parse(day+'T00:00:00Z');
 const df=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'});
 const hours=[];for(let t=dayStamp-3*3600000;t<dayStamp+27*3600000;t+=3600000)if(df.format(new Date(t))===day)hours.push(t);
 return {start:hours[0],until:hours.at(-1)+3600000,limit:hours.length,day};
}
export function historicalHarmonieOptions(run,day){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(run||'')||!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw Error('HARMONIE_INVALID_HISTORY');
 const stamp=Date.parse(run+':00:00Z'),dayStamp=Date.parse(day+'T00:00:00Z');
 if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,13)!==run||!Number.isFinite(dayStamp)||new Date(dayStamp).toISOString().slice(0,10)!==day||stamp<Date.parse('2026-01-08T00:00:00Z')||stamp>Date.now()||dayStamp-stamp>61*3600000||stamp-dayStamp>27*3600000)throw Error('HARMONIE_INVALID_HISTORY');
 return {historical:true,filename:'HARM43_V1_P1_'+run.replace(/[-T]/g,'')+'.tar',expectedRun:new Date(stamp).toISOString(),...harmonieDayWindow(day)};
}
export async function readHarmonie(env,selection={}){
 const model=harmonieModel(selection.model);
 const base=HARMONIE_BASE.replace('cy43_p1','cy43_'+model);
 const history=selection.run?historicalHarmonieOptions(selection.run,selection.day):null;
 const window=history||(selection.day?harmonieDayWindow(selection.day):null);
 if(model==='p2b'&&history&&Date.now()-Date.parse(history.expectedRun)>72*3600000)throw Error('HARMONIE_P2B_ARCHIVE');
 if(history&&model==='p2b')history.filename=history.filename.replace('_P1_','_P2B_');
 if(!env.KNMI_OPEN_DATA_API_KEY)throw Error('HARMONIE_NOT_CONFIGURED');
 const key=env.KNMI_OPEN_DATA_API_KEY.trim(),cacheKey=key+'|'+model+'|'+(history?history.filename+'|'+history.day:'live|'+(selection.day||'future')),hit=harmonieCache.get(cacheKey);if(hit&&hit.expires>Date.now())return hit.promise;
 const promise=(async()=>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
 async function api(url){const r=await fetch(url,{headers:{Authorization:key,Accept:'application/json'},redirect:'manual',signal:controller.signal});if(!r.ok){console.error('HARMONIE_API_STATUS',r.status);throw Error(r.status===401||r.status===403?'HARMONIE_AUTH':r.status===404?'HARMONIE_RUN_NOT_FOUND':r.status===429?'HARMONIE_RATE_LIMIT':'HARMONIE_UNAVAILABLE');}return r.json();}
 try{
  const listing=history?{files:[{filename:history.filename}]}:await api(base+'?maxKeys=4&sorting=desc&orderBy=filename');
  let best=null;
  for(const file of (listing.files||[]).slice(0,4)){
  const filename=file.filename;
  if(typeof filename!=='string'||!filename.endsWith('.tar')||filename.length>240)throw Error('HARMONIE_FORMAT');
  const link=await api(base+'/'+encodeURIComponent(filename)+'/url');let target;try{target=new URL(link.temporaryDownloadUrl);}catch{throw Error('HARMONIE_FORMAT');}
  // Signed object-store URLs must never receive the KNMI Authorization header.
  if(target.protocol!=='https:'||!(/(^|\.)knmi\.nl$|(^|\.)knmi\.cloud$|(^|\.)amazonaws\.com$|(^|\.)googleapis\.com$|(^|\.)blob\.core\.windows\.net$/.test(target.hostname)))throw Error('HARMONIE_DOWNLOAD_HOST');
  const response=await fetch(target.href,{redirect:'manual',signal:controller.signal});if(!response.ok||!response.body)throw Error('HARMONIE_UNAVAILABLE');
  const forecast=await extractHarmonie(response.body,window?.start??Date.now(),{...(window||{}),model,validationNow:Date.now()});
  console.info('HARMONIE_FILE',JSON.stringify({filename,run:forecast.run,hours:forecast.rows.length}));
  if(forecast.rows.length&&(!best||forecast.rows.length>best.rows.length))best={...forecast,filename};
  if(history||window&&forecast.rows.length||forecast.rows.length>=7)break;
  }
  if(!best)throw Error('HARMONIE_INCOMPLETE');
  const stale=!history&&Date.now()-Date.parse(best.run)>6*3600000;
  return {...best,historical:!!history,partial:best.rows.length<(window?.limit||7),retrievedAt:new Date().toISOString(),stale,model,ensemble:model==='p2b',ensembleSummary:false,source:'KNMI HARMONIE-AROME Cy43 '+model.toUpperCase(),heightM:10,productionCorrection:false};
 }finally{clearTimeout(timer);}
 })();
 harmonieCache.set(cacheKey,{promise,expires:Date.now()+(history?86400000:15*60000)});promise.catch(()=>{const entry=harmonieCache.get(cacheKey);if(entry?.promise===promise)entry.expires=Date.now()+60000;});if(harmonieCache.size>20)harmonieCache.delete(harmonieCache.keys().next().value);return promise;
}
