import {theoreticalWindMW} from './wind-potential.mjs';
import {useEffect,useState,useId,useMemo} from 'react';
import {Wind,ArrowRight,LoaderCircle} from 'lucide-react';
import {clockDayFraction} from './chart-time.mjs';
type Forecast={model?:string;source?:string;ensemble?:boolean;historical?:boolean;run:string;stale:boolean;partial:boolean;rows:{time:string;parks:{id:string;powerMW:number;windSpeedMS:number}[]}[]};
export type ForecastPoint={time:string;powerMW:number;windSpeedMS:number};
const localDay=(t:number|string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
const time=(s:string)=>new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(s));
const fmt=(v:number)=>new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2}).format(v);
export function useHarmonieOverlay(day:string,settings:Record<string,string>|undefined,unit:string,theoretical=false){
 const [enabled,setEnabled]=useState(true),[data,setData]=useState<Forecast|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
 const [model,setModel]=useState('p1');
 const [requested,setRequested]=useState(false);
 const request=()=>{setRequested(true);setEnabled(true);setRevision(v=>v+1);};
 const isToday=day===localDay(Date.now());
 const priorDay=new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 const defaultRun=priorDay>='2026-01-08'?priorDay+'T18':'2026-01-08T00';
 const [chosenRun,setChosenRun]=useState(''),[draftRun,setDraftRun]=useState(defaultRun+':00');
 const historical=!isToday||!!chosenRun;
 const run=chosenRun||defaultRun;
 const archiveStart=model==='p2b'?new Date(Date.now()-72*3600000).toISOString().slice(0,10):'2026-01-08';
 const allowed=day>=archiveStart;
 const query=settings?new URLSearchParams({...settings,model,...(historical?{run,day}:{})}).toString():'';
 useEffect(()=>{setData(null);setError('');setLoading(false);if(!requested||!enabled||historical&&!allowed||unit!=='MW'||!query)return;const abort=new AbortController();let stopped=false;
 async function load(){setLoading(true);setError('');try{const r=await fetch('/api/harmonie?'+query,{signal:abort.signal});if(!r.ok){if(r.status===401)throw Error('Je sessie is verlopen. Log opnieuw in.');const d=await r.json();throw Error(d.error||'De verwachting kon niet worden geladen.');}const d=await r.json();if(!stopped)setData(d);}catch(e){if(!stopped){setData(null);setError(e instanceof Error?e.message:'HARMONIE ophalen is niet gelukt.');}}finally{if(!stopped)setLoading(false);}}
 void load();const timer=historical?null:setInterval(()=>void load(),15*60000);return()=>{stopped=true;abort.abort();if(timer)clearInterval(timer);};},[requested,enabled,historical,allowed,unit,query,revision]);
 const stale=!!data&&!data.historical&&(data.stale||Date.now()-Date.parse(data.run)>6*3600000);
 const points:ForecastPoint[]=enabled&&unit==='MW'&&!stale?(data?.rows||[]).filter(row=>localDay(row.time)===day&&(historical||Date.parse(row.time)>=Date.now())).flatMap(row=>{const p=row.parks.find(p=>p.id===settings?.park);const power=p?(theoretical?theoreticalWindMW(p.windSpeedMS,row.time,settings):p.powerMW):null;return p&&power!==null&&Number.isFinite(power)?[{time:row.time,powerMW:power,windSpeedMS:p.windSpeedMS}]:[];}):[];
 return {model,setModel,archiveStart,requested,request,enabled,setEnabled,data,error,loading,stale,points,isToday,historical,allowed,draftRun,setDraftRun,chooseRun:()=>{setChosenRun(draftRun.slice(0,13));request();},latest:()=>{setChosenRun('');request();},theoretical,retry:request};
}
export function HarmonieControls({forecast,unit,showRequest=false}:{forecast:ReturnType<typeof useHarmonieOverlay>;unit:string;showRequest?:boolean}){
 return <section className="wind-forecast-section" aria-label="HARMONIE voorspelling"><div className="wind-forecast-heading"><div><span className="card-eyebrow">VOORUITKIJKEN</span><h4>De verwachting van HARMONIE</h4></div><label className="wind-option"><input type="checkbox" checked={forecast.enabled} onChange={e=>forecast.setEnabled(e.target.checked)}/> Voorspellingslijn tonen</label></div>
 <label className="wind-option">Weermodel <select value={forecast.model} onChange={e=>forecast.setModel(e.target.value)}><option value="p1">HARMONIE P1 · deterministisch</option><option value="p2b">HARMONIE P2b · één ensemblelid</option></select></label>
 <details className="wind-advanced"><summary>Verschil tussen P1, P2b en stationsmetingen</summary><div className="wind-advanced-content">
 <p><strong>P1</strong> geeft één deterministische weersverwachting. Dit is de standaardkeuze; het KNMI-archief begint op 8 januari 2026.</p>
 <p><strong>P2b</strong> is het Nederlandse ensembleproduct voor duurzame energie. Verschillende ensembleleden beschrijven mogelijke weersontwikkelingen. Deze pagina toont één beschikbaar lid uit één modelrun, het eerste herkenbare lid in het gekozen bestand. Het is geen ensemblegemiddelde, controlelidselectie of onzekerheidsband. P2b is dus niet automatisch nauwkeuriger dan P1.</p>
 <p>Beide producten bevatten wind op 10, 50, 100, 200 en 300 meter. Voor een vergelijkbare berekening gebruikt deze pagina bij beide de wind op 10 meter bij het park en dezelfde hoogtecorrectie, turbinecurve en parkaandeel. De hogere modelniveaus worden hier niet gebruikt. De modeltijdstappen zijn één uur; een lijn ertussen voegt geen voorspelde windvlagen toe.</p>
 <p><strong>Stationsmetingen</strong> zijn waargenomen tienminutenwind bij een meetstation, geen weersverwachting bij het park. Zowel stationswind als modelwind worden omgerekend naar indicatief vermogen. De gemeten elektriciteitsproductie kan door afregeling of stilstand lager zijn.</p>
 <p>KNMI bewaart P2b slechts 72 uur. Voor oudere modelruns kies je P1. P2b-leden verschijnen in batches en kunnen een andere uitgiftetijd hebben; vergelijk altijd de getoonde modelrun. Bij ontbrekende gegevens wordt geen P1-lijn als P2b getoond.</p>
 <a href="https://www.knmidata.nl/open-data/harmonie" target="_blank" rel="noreferrer">KNMI: producten, ensembleleden en beschikbaarheid ↗</a>
 </div></details>
 {forecast.enabled&&<>{unit!=='MW'?<p>Kies ‘Vermogen · MW’ om de voorspelling in de grafiek te zien.</p>:<>
 {forecast.loading?<p className="wind-forecast-status" role="status"><LoaderCircle className="harmonie-loading-icon" size={17}/> De verwachting wordt berekend. Dit kan ongeveer anderhalve minuut duren.</p>:forecast.error?<div role="alert" className="live-error"><p>{forecast.error}</p><button className="text-button" onClick={forecast.retry}>Opnieuw proberen <ArrowRight size={15}/></button></div>:forecast.data?<p className="wind-forecast-status" role="status">{forecast.model.toUpperCase()} · {forecast.model==='p2b'?'één ensemblelid · ':''}{forecast.data.historical?'Historische':'Actuele'} modelrun · {time(forecast.data.run)} Nederlandse tijd · oranje stippellijn in de grafiek.</p>:<p>{forecast.historical?'Kies hieronder welke oorspronkelijke modelrun je wilt vergelijken.':'Gebruik ‘Toon voorspelling’ in de grafiek om het verwachte windaanbod te zien.'}</p>}
 {!forecast.allowed&&<p>{forecast.model==='p2b'?'P2b heeft alleen recente runs (72 uur bewaartermijn). Kies P1 voor oudere voorspellingen.':'Het beschikbare P1-archief begint op 8 januari 2026. Voor deze dag ontbreekt een historische voorspelling.'}</p>}
 {forecast.allowed&&!forecast.data&&!forecast.loading&&(showRequest||forecast.historical)&&<button className="harmonie-request-button" type="button" onClick={forecast.request}><Wind size={17}/> Toon voorspelling <ArrowRight size={17}/></button>}
 {forecast.stale&&<p className="live-error">De modelrun is ouder dan zes uur en daarom verborgen. <button className="text-button" onClick={forecast.retry}>Nieuwe verwachting ophalen</button></p>}
 {forecast.data?.partial&&<p className="wind-forecast-warning">Niet alle uren zijn beschikbaar. Alleen de aaneengesloten voorspellingspunten worden getoond.</p>}
 {forecast.data&&!forecast.loading&&!forecast.error&&!forecast.stale&&!forecast.points.length&&<p>Deze run bevat geen zichtbare voorspellingspunten voor de gekozen dag.</p>}
 <details className="wind-advanced harmonie-history-picker"><summary>Historische voorspelling vergelijken</summary><div className="wind-advanced-content"><p>Kies eerst een grafiekdag in de kalender. Selecteer daarna de oorspronkelijke modelrun die je wilt terugzien. {forecast.model==='p2b'?'P2b-runs zijn slechts 72 uur beschikbaar.':'Het P1-archief begint op 8 januari 2026.'}</p><form onSubmit={e=>{e.preventDefault();forecast.chooseRun();}} className="model-actions" style={{alignItems:'end'}}><label>Modeldatum en uur · UTC<input type="datetime-local" step="3600" min={forecast.archiveStart+'T00:00'} max={new Date().toISOString().slice(0,13)+':00'} value={forecast.draftRun} onChange={e=>forecast.setDraftRun(e.target.value)} required/></label><button className="download" type="submit" disabled={forecast.loading}>Modelrun vergelijken</button>{forecast.isToday&&forecast.historical&&<button type="button" className="text-button" onClick={forecast.latest}>Terug naar de nieuwste verwachting</button>}</form><p>UTC is ’s winters één uur en ’s zomers twee uur vroeger dan Nederlandse tijd. Kies een run maximaal circa 60 uur vóór de grafiekdag. De modeltijd is de initialisatietijd; het exacte publicatiemoment is onbekend.</p></div></details>
 <details className="wind-advanced"><summary>Wat vertelt deze voorspelling?</summary><div className="wind-advanced-content"><p>HARMONIE voorspelt de wind bij het park. We rekenen deze om met dezelfde turbine-instellingen en hetzelfde parkaandeel als de windpunten. {forecast.theoretical?'De curve toont onbegrensd theoretisch windpotentieel: geen vermogen dat de huidige turbines volledig kunnen leveren.':'De curve volgt de grenzen van het turbinemodel.'}</p><p>De gemeten productie corrigeert de voorspelling niet, omdat afregeling de productie kan verlagen. Een historische modelrun bevat de verwachtingen uit die run, geen achteraf gemeten wind.</p></div></details>
 </>}</>}
 </section>;
}
export function HarmonieLine({points,day,share,maximum,theoretical=false}:{points:ForecastPoint[];day:string;share:number;maximum:number;theoretical?:boolean}){
 const x=(p:ForecastPoint)=>60+(clockDayFraction(p.time,day)??0)*832,y=(p:ForecastPoint)=>260-p.powerMW*share/maximum*220;
 return <g aria-label="HARMONIE voorspeld potentieel vermogen">{points.map((p,i)=>{const prev=points[i-1];return <g key={p.time}>{prev&&Date.parse(p.time)-Date.parse(prev.time)===3600000&&x(p)>x(prev)&&<line x1={x(prev)} x2={x(p)} y1={y(prev)} y2={y(p)} stroke="#A75C00" strokeWidth="2.5" strokeDasharray="7 5" pointerEvents="none"/>}<circle cx={x(p)} cy={y(p)} r="4.5" fill="white" stroke="#A75C00" strokeWidth="2" tabIndex={0} aria-label={`${time(p.time)}: HARMONIE ${fmt(p.powerMW*share)} MW, wind ${fmt(p.windSpeedMS)} m/s`}><title>{`${time(p.time)} · HARMONIE ${fmt(p.powerMW*share)} MW · wind ${fmt(p.windSpeedMS)} m/s · ${theoretical?'theoretisch windpotentieel, niet leverbaar':'voorspelling'}`}</title></circle></g>;})}</g>;
}

export function HarmoniePreview({forecast,startFraction}:{forecast:ReturnType<typeof useHarmonieOverlay>;startFraction:number}){
 const id=useId();
 const wave=useMemo(()=>{let seed=7919;const values=['0,62'];let value=62;for(let i=1;i<=48;i++){seed=(seed*16807)%2147483647;value=Math.max(18,Math.min(82,value+(seed/2147483647-.5)*18));values.push(`${i/48*100},${value}`);}return values.join(' ');},[]);
 if(!forecast.enabled||!forecast.isToday||forecast.historical||forecast.points.length||startFraction>=.995)return null;
 const left=(60+Math.max(0,startFraction)*832)/920*100,width=(1-Math.max(0,startFraction))*832/920*100;
 const compact=width<20;
 return <div className={'harmonie-preview'+(compact?' harmonie-preview-compact':'')} style={{left:left+'%',width:width+'%'}}>
 <svg className="harmonie-preview-wave" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><filter id={id}><feGaussianBlur stdDeviation="2.5"/></filter></defs><polygon points={`0,100 ${wave} 100,100`} fill="#00A6DE" fillOpacity=".2" filter={`url(#${id})`}/><polyline points={wave} fill="none" stroke="#00A6DE" strokeWidth="1.1" filter={`url(#${id})`}/></svg>
 <div className="harmonie-preview-glass" aria-hidden="true"/>
 <div className="harmonie-preview-content"><span className="harmonie-preview-icon"><Wind size={22}/></span>{!compact&&<><span className="harmonie-preview-kicker">HARMONIE</span><strong>De wind van straks</strong><p>Bekijk de verwachting voor de komende uren.</p></>}
 <button type="button" className="harmonie-request-button" onClick={forecast.request} disabled={forecast.loading} aria-label="Vraag HARMONIE-berekening op om de voorspelling te zien">{forecast.loading?<LoaderCircle size={18} className="harmonie-loading-icon"/>:null}<span>{forecast.loading?'Voorspelling ophalen…':'Toon voorspelling'}</span>{!forecast.loading&&<ArrowRight size={17}/>}</button>
 {!compact&&<small>{forecast.error?'Ophalen mislukt. Klik om opnieuw te proberen.':forecast.stale?'Modelrun verouderd. Vraag een nieuwe verwachting op.':'Voorbeeld · nog geen voorspelling'}</small>}</div></div>;
}
