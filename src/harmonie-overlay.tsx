import {theoreticalWindMW} from './wind-potential.mjs';
import {useEffect,useState} from 'react';
import {clockDayFraction} from './chart-time.mjs';
type Forecast={historical?:boolean;run:string;stale:boolean;partial:boolean;rows:{time:string;parks:{id:string;powerMW:number;windSpeedMS:number}[]}[]};
export type ForecastPoint={time:string;powerMW:number;windSpeedMS:number};
const localDay=(t:number|string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
const time=(s:string)=>new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(s));
const fmt=(v:number)=>new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2}).format(v);
export function useHarmonieOverlay(day:string,settings:Record<string,string>|undefined,unit:string,theoretical=false){
 const [enabled,setEnabled]=useState(true),[data,setData]=useState<Forecast|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
 const isToday=day===localDay(Date.now());
 const priorDay=new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 const defaultRun=priorDay>='2026-01-08'?priorDay+'T18':'2026-01-08T00';
 const [chosenRun,setChosenRun]=useState(''),[draftRun,setDraftRun]=useState(defaultRun+':00');
 const historical=!isToday||!!chosenRun;
 const run=chosenRun||defaultRun;
 const allowed=day>='2026-01-08';
 const query=settings?new URLSearchParams({...settings,...(historical?{run,day}:{})}).toString():'';
 useEffect(()=>{setData(null);setError('');setLoading(false);if(!enabled||historical&&!allowed||unit!=='MW'||!query)return;const abort=new AbortController();let stopped=false;
 async function load(){setLoading(true);setError('');try{const r=await fetch('/api/harmonie?'+query,{signal:abort.signal});if(!r.ok){if(r.status===401)throw Error('Je sessie is verlopen. Log opnieuw in.');const d=await r.json();throw Error(d.error||'De verwachting kon niet worden geladen.');}const d=await r.json();if(!stopped)setData(d);}catch(e){if(!stopped){setData(null);setError(e instanceof Error?e.message:'HARMONIE ophalen is niet gelukt.');}}finally{if(!stopped)setLoading(false);}}
 void load();const timer=historical?null:setInterval(()=>void load(),15*60000);return()=>{stopped=true;abort.abort();if(timer)clearInterval(timer);};},[enabled,historical,allowed,unit,query,revision]);
 const stale=!!data&&!data.historical&&(data.stale||Date.now()-Date.parse(data.run)>6*3600000);
 const points:ForecastPoint[]=enabled&&unit==='MW'&&!stale?(data?.rows||[]).filter(row=>localDay(row.time)===day&&(historical||Date.parse(row.time)>=Date.now())).flatMap(row=>{const p=row.parks.find(p=>p.id===settings?.park);const power=p?(theoretical?theoreticalWindMW(p.windSpeedMS,row.time,settings):p.powerMW):null;return p&&power!==null&&Number.isFinite(power)?[{time:row.time,powerMW:power,windSpeedMS:p.windSpeedMS}]:[];}):[];
 return {enabled,setEnabled,data,error,loading,stale,points,isToday,historical,allowed,draftRun,setDraftRun,chooseRun:()=>setChosenRun(draftRun.slice(0,13)),latest:()=>setChosenRun(''),theoretical,retry:()=>setRevision(v=>v+1)};
}
export function HarmonieControls({forecast,unit}:{forecast:ReturnType<typeof useHarmonieOverlay>;unit:string}){
 return <div className="harmonie-chart-controls"><label><input type="checkbox" checked={forecast.enabled} onChange={e=>forecast.setEnabled(e.target.checked)}/> HARMONIE-verwachting tonen</label>{forecast.enabled&&<>
 {unit!=='MW'?<p className="wind-note">Kies ‘Vermogen · MW’ om de voorspelling te zien. HARMONIE geeft vermogenspunten per uur, geen uurenergie.</p>:<>
 <form onSubmit={e=>{e.preventDefault();forecast.chooseRun();}} className="model-actions" style={{marginTop:12,alignItems:'end'}}><label>Historische modelrun (datum en uur in UTC)<input type="datetime-local" step="3600" min="2026-01-08T00:00" max={new Date().toISOString().slice(0,13)+':00'} value={forecast.draftRun} onChange={e=>forecast.setDraftRun(e.target.value)} required/></label><button className="download" type="submit" disabled={forecast.loading}>Deze modelrun tonen</button>{forecast.isToday&&forecast.historical&&<button type="button" className="text-button" onClick={forecast.latest}>Nieuwste verwachting</button>}</form>
 <p className="wind-note">Kies eerst de grafiekdag in de kalender en daarna de modelrun. Het KNMI-archief begint op 8 januari 2026. De modeltijd staat hierboven in UTC; de grafiek en onderstaande modeltijd gebruiken Nederlandse tijd. Kies een run maximaal circa 60 uur vóór de grafiekdag.</p>
 {!forecast.allowed?<p className="wind-note">Voor deze grafiekdag is in dit archief geen historische HARMONIE-verwachting beschikbaar.</p>:<>
 <p className="wind-note" role="status">{forecast.loading?'HARMONIE laden… Een volledige historische dag uitlezen kan anderhalve minuut duren.':forecast.error?'HARMONIE: '+forecast.error:forecast.data?`${forecast.data.historical?'Historische':'Actuele'} HARMONIE-modelrun ${time(forecast.data.run)} (Nederlandse tijd). Oranje stippellijn: ${forecast.theoretical?'voorspeld theoretisch windpotentieel, niet leverbaar door de huidige turbines':'voorspeld potentieel vermogen'}; geen productiecorrectie.`:'Geen voorspelling geladen.'}</p>
 {forecast.error&&<button type="button" className="text-button" onClick={forecast.retry}>Verwachting opnieuw ophalen</button>}{forecast.stale&&<p className="live-error">De actuele modelrun is ouder dan zes uur. De voorspellingslijn is daarom verborgen.</p>}{forecast.data?.partial&&<p className="wind-note">De reeks is onvolledig: alleen beschikbare aaneengesloten uurpunten binnen de grafiekdag worden getoond.</p>}{forecast.data?.historical&&<p className="wind-note">Dit zijn de voorspellingen uit één oorspronkelijke modelrun, geen achteraf gemeten wind. Het modeluur is de initialisatietijd; het exacte moment waarop het bestand destijds beschikbaar kwam is hier niet bekend. Gebruik dit dus niet als bewijs dat een regelaar de voorspelling toen al kende.</p>}{forecast.data&&!forecast.loading&&!forecast.error&&!forecast.stale&&!forecast.points.length&&<p className="wind-note">Er zijn geen voorspellingspunten voor de gekozen grafiekdag beschikbaar.</p>}
 </>}
 </>}
 </>}</div>;
}
export function HarmonieLine({points,day,share,maximum,theoretical=false}:{points:ForecastPoint[];day:string;share:number;maximum:number;theoretical?:boolean}){
 const x=(p:ForecastPoint)=>60+(clockDayFraction(p.time,day)??0)*832,y=(p:ForecastPoint)=>260-p.powerMW*share/maximum*220;
 return <g aria-label="HARMONIE voorspeld potentieel vermogen">{points.map((p,i)=>{const prev=points[i-1];return <g key={p.time}>{prev&&Date.parse(p.time)-Date.parse(prev.time)===3600000&&x(p)>x(prev)&&<line x1={x(prev)} x2={x(p)} y1={y(prev)} y2={y(p)} stroke="#A75C00" strokeWidth="2.5" strokeDasharray="7 5" pointerEvents="none"/>}<circle cx={x(p)} cy={y(p)} r="4.5" fill="white" stroke="#A75C00" strokeWidth="2" tabIndex={0} aria-label={`${time(p.time)}: HARMONIE ${fmt(p.powerMW*share)} MW, wind ${fmt(p.windSpeedMS)} m/s`}><title>{time(p.time)} · HARMONIE {fmt(p.powerMW*share)} MW · wind {fmt(p.windSpeedMS)} m/s · {theoretical?'theoretisch windpotentieel, niet leverbaar':'voorspelling'}</title></circle></g>;})}</g>;
}
