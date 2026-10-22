import {useEffect,useState,useId,useMemo} from 'react';
import {Wind,ArrowRight,LoaderCircle} from 'lucide-react';
import {clockDayFraction} from './chart-time.mjs';
import {forecastColours,forecastDay,previousForecastRun,forecastPoints} from './forecast-comparison.mjs';
type Forecast={historical?:boolean;run:string;stale:boolean;partial:boolean;rows:{time:string;parks:{id:string;powerMW:number;windSpeedMS:number}[]}[]};
export type ForecastPoint={time:string;powerMW:number;windSpeedMS:number};
type Series={id:string;label:string;colour:string;data:Forecast;points:ForecastPoint[]};
const time=(s:string)=>new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset'}).format(new Date(s));
const fmt=(v:number)=>new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2}).format(v);
export function useHarmonieOverlay(day:string,settings:Record<string,string>|undefined,unit:string,theoretical=false){
 const [enabled,setEnabled]=useState(true),[results,setResults]=useState<{id:string;data:Forecast}[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
 const [requested,setRequested]=useState(false);
 const request=()=>{setRequested(true);setEnabled(true);setRevision(v=>v+1);};
 const isToday=day===forecastDay(Date.now());
 const defaultRun=previousForecastRun(day)<'2026-01-08T00'?'2026-01-08T00':previousForecastRun(day);
 const [chosenRun,setChosenRun]=useState(''),[draftRun,setDraftRun]=useState(defaultRun+':00');
 const historical=!isToday||!!chosenRun,archiveStart='2026-01-08',allowed=day>=archiveStart;
 const query=settings?new URLSearchParams({...settings,model:'p1',day}).toString():'';
 useEffect(()=>{
  setResults([]);setError('');setLoading(false);
  if(!requested||!enabled||!allowed||unit!=='MW'||!query)return;
  const abort=new AbortController();let stopped=false;
  const selections=historical?[{id:'previous',run:chosenRun||defaultRun}]:[{id:'previous',run:defaultRun},{id:'latest',run:''}];
  async function load(){setLoading(true);setError('');
   const loaded=await Promise.allSettled(selections.map(async selection=>{
    const r=await fetch('/api/harmonie?'+query+(selection.run?'&run='+encodeURIComponent(selection.run):''),{signal:abort.signal});
    if(!r.ok){if(r.status===401)throw Error('Je sessie is verlopen. Log opnieuw in.');const d=await r.json();throw Error(d.error||'De verwachting kon niet worden geladen.');}
    return {id:selection.id,data:await r.json() as Forecast};
   }));
   if(stopped)return;
   setResults(loaded.flatMap(r=>r.status==='fulfilled'?[r.value]:[]));
   setError(loaded.flatMap((r,i)=>r.status==='rejected'?[`${selections[i].id==='latest'?'Nieuwste run':historical?'Gekozen run':'Run van gisteravond'}: ${r.reason instanceof Error?r.reason.message:'Ophalen mislukt.'}`]:[]).join(' '));setLoading(false);
  }
  void load();const timer=historical?null:setInterval(()=>void load(),15*60000);
  return()=>{stopped=true;abort.abort();if(timer)clearInterval(timer);};
 },[requested,enabled,historical,allowed,unit,query,revision,chosenRun,defaultRun]);
 const stale=results.some(r=>r.id==='latest'&&(r.data.stale||Date.now()-Date.parse(r.data.run)>6*3600000));
 const series:Series[]=enabled&&unit==='MW'?results.filter(r=>r.id!=='latest'||!(r.data.stale||Date.now()-Date.parse(r.data.run)>6*3600000)).map(r=>({...r,label:historical?'Gekozen voorspelling':r.id==='previous'?'Gisteravond':'Nieuwste voorspelling',colour:forecastColours[r.id as 'previous'|'latest'],points:forecastPoints(r.data,day,settings,theoretical)})):[];
 const points=series.flatMap(s=>s.points),data=results[0]?.data||null;
 return {archiveStart,requested,request,enabled,setEnabled,data,error,loading,stale,points,series,isToday,historical,allowed,draftRun,setDraftRun,chooseRun:()=>{setChosenRun(draftRun.slice(0,13));request();},latest:()=>{setChosenRun('');request();},theoretical,retry:request};
}
export function HarmonieLegend({forecast}:{forecast:ReturnType<typeof useHarmonieOverlay>}){
 if(!forecast.series.length)return null;
 return <div className="forecast-run-legend" aria-label="Voorspellingen en berekentijden">{forecast.series.map(s=><div key={s.id} className={'forecast-run-card forecast-run-'+s.id}><span className={'forecast-run-swatch '+s.id} style={{borderColor:s.colour}} aria-hidden="true"/><div><strong>{s.label}</strong><span>Berekend vanaf {time(s.data.run)} · Nederlandse tijd</span><small>{s.points.length?`${time(s.points[0].time)} – ${time(s.points.at(-1)!.time)}`:'Geen uren voor deze dag beschikbaar'}{s.data.partial?' · gedeeltelijke dekking':''}</small></div></div>)}</div>;
}
export function HarmonieControls({forecast,unit}:{forecast:ReturnType<typeof useHarmonieOverlay>;unit:string;showRequest?:boolean}){
 return <section className="wind-forecast-section" aria-label="HARMONIE voorspelling"><div className="wind-forecast-heading"><div><span className="card-eyebrow">VERWACHTING EN WERKELIJKHEID</span><h4>{forecast.isToday&&!forecast.historical?'Gisteren voorspeld, vandaag geproduceerd':'De verwachting van HARMONIE'}</h4></div><label className="wind-option"><input type="checkbox" checked={forecast.enabled} onChange={e=>forecast.setEnabled(e.target.checked)}/> Voorspellingslijnen tonen</label></div>
 <p>HARMONIE P1 · deterministisch. {forecast.isToday&&!forecast.historical?'Vergelijk de run van gisteravond (18:00 UTC) en de nieuwste run met de blauwe productiebalken. Lila toont de eerdere verwachting; perzik toont de nieuwste, ook voor de al verstreken uren die deze run bevat.':'Bekijk de oorspronkelijke verwachting voor de gekozen dag.'}</p>
 {forecast.enabled&&<>{unit!=='MW'?<p>Kies ‘Vermogen · MW’ om de voorspelling in de grafiek te zien.</p>:<>
 {forecast.loading&&<p className="wind-forecast-status" role="status"><LoaderCircle className="harmonie-loading-icon" size={17}/> De modelruns worden berekend. Dit kan ongeveer anderhalve minuut duren.</p>}
 {forecast.error&&<div role="alert" className="live-error"><p>{forecast.error}</p><button className="text-button" onClick={forecast.retry}>Opnieuw proberen <ArrowRight size={15}/></button></div>}
 {!forecast.allowed?<p>Het beschikbare P1-archief begint op 8 januari 2026. Voor deze dag ontbreekt een historische voorspelling.</p>:!forecast.data&&!forecast.loading&&<button className="harmonie-request-button" type="button" onClick={forecast.request}><Wind size={17}/>{forecast.isToday&&!forecast.historical?'Vergelijk gisteren en vandaag':'Toon voorspelling'}<ArrowRight size={17}/></button>}
 {forecast.stale&&<p className="live-error">De nieuwste modelrun is ouder dan zes uur en daarom verborgen. <button className="text-button" onClick={forecast.retry}>Nieuwe verwachting ophalen</button></p>}
 <details className="wind-advanced harmonie-history-picker"><summary>Een andere historische voorspelling vergelijken</summary><div className="wind-advanced-content"><p>Kies eerst een grafiekdag in de kalender en daarna de oorspronkelijke modelrun. Het P1-archief begint op 8 januari 2026.</p><form onSubmit={e=>{e.preventDefault();forecast.chooseRun();}} className="model-actions" style={{alignItems:'end'}}><label>Modeldatum en uur · UTC<input type="datetime-local" step="3600" min={forecast.archiveStart+'T00:00'} max={new Date().toISOString().slice(0,13)+':00'} value={forecast.draftRun} onChange={e=>forecast.setDraftRun(e.target.value)} required/></label><button className="download" type="submit" disabled={forecast.loading}>Modelrun vergelijken</button>{forecast.isToday&&forecast.historical&&<button type="button" className="text-button" onClick={forecast.latest}>Terug naar gisteren en vandaag</button>}</form><p>UTC is ’s winters één uur en ’s zomers twee uur vroeger dan Nederlandse tijd. Kies een run maximaal circa 60 uur vóór de grafiekdag. De getoonde berekentijd is de initialisatietijd van het model; het exacte publicatiemoment is onbekend.</p></div></details>
 <details className="wind-advanced"><summary>Voorspelling, stationsmetingen en productie</summary><div className="wind-advanced-content"><p>HARMONIE voorspelt wind op 10 meter bij het park. We rekenen deze om met dezelfde hoogtecorrectie, turbine-instellingen en hetzelfde parkaandeel als de windpunten. {forecast.theoretical?'De curve toont onbegrensd theoretisch windpotentieel: geen vermogen dat de huidige turbines volledig kunnen leveren.':'De curve volgt de grenzen van het turbinemodel.'}</p><p>De KNMI-punten tonen waargenomen tienminutenwind bij een meetstation. De blauwe balken tonen de gemeten elektriciteitsproductie als gemiddeld uurvermogen. Afregeling en stilstand kunnen verschillen verklaren. Productie corrigeert de voorspelling niet. De voorspellingen blijven per modelrun zichtbaar; de nieuwste run begint pas bij zijn eigen berekentijd. Ontbrekende uren worden niet verbonden.</p></div></details>
 </>}</>}
 </section>;
}
export function HarmonieLine({points,day,share,maximum,theoretical=false,colour=forecastColours.previous,run,label='HARMONIE',latest=false}:{points:ForecastPoint[];day:string;share:number;maximum:number;theoretical?:boolean;colour?:string;run?:string;label?:string;latest?:boolean}){
 const x=(p:ForecastPoint)=>60+(clockDayFraction(p.time,day)??0)*832,y=(p:ForecastPoint)=>260-p.powerMW*share/maximum*220;
 const start=run?clockDayFraction(run,day):null;
 return <g aria-label={`${label}${run?' · modelrun '+time(run):''}`}>
 {latest&&start!==null&&<g><line x1={60+start*832} x2={60+start*832} y1="40" y2="260" stroke={colour} strokeWidth="1.5" strokeDasharray="3 5"/><text x={Math.min(780,64+start*832)} y="52" fontSize="10" fill="#774D38">Vanaf {time(run!).split(' ').slice(1).join(' ')}</text></g>}
 {points.map((p,i)=>{const prev=points[i-1];const title=`${time(p.time)} · ${label} ${fmt(p.powerMW*share)} MW · wind ${fmt(p.windSpeedMS)} m/s${run?' · berekend vanaf '+time(run):''} · ${theoretical?'theoretisch windpotentieel, niet leverbaar':'voorspelling'}`;return <g key={p.time}>{prev&&Date.parse(p.time)-Date.parse(prev.time)===3600000&&x(p)>x(prev)&&<line x1={x(prev)} x2={x(p)} y1={y(prev)} y2={y(p)} stroke={colour} strokeWidth="3" strokeLinecap="round" strokeDasharray={latest?undefined:'7 5'} pointerEvents="none"/>}<circle cx={x(p)} cy={y(p)} r="3.5" fill={latest?colour:'white'} stroke={colour} strokeWidth="2" tabIndex={0} aria-label={title}><title>{title}</title></circle></g>;})}</g>;
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
