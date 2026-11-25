// Windparkpagina per park in een project: daggrafiek van het model, stationsvergelijking en HARMONIE-voorspelling.
import {useEffect,useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight,Download} from 'lucide-react';
import {StaticMap} from './ui/StaticMap';
import {LineChart,SERIES} from './ui/Chart';
import {Card,Chip,Eyebrow,Tile,Notice,Skeleton,Details,Seg} from './ui/kit';
import {BOLSWARD,stationName} from './project.mjs';
import {parkMW} from './park-model.mjs';
import stationCatalog from '../stations.json';
import {getJSON,nl,clone,Link,download} from './lib';

const TZ='Europe/Amsterdam';
const hhmm=(t:number)=>new Date(t).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:TZ});
const dayHour=(t:number)=>new Date(t).toLocaleString('nl-NL',{weekday:'short',hour:'2-digit',minute:'2-digit',timeZone:TZ});
const todayNL=()=>new Date().toLocaleDateString('en-CA',{timeZone:TZ});
const shift=(day:string,d:number)=>new Date(Date.parse(day+'T12:00:00Z')+d*864e5).toISOString().slice(0,10);
const ticks=(ts:number[],every:number,label:(t:number)=>string)=>ts.filter(t=>{const s=hhmm(t);return s.endsWith(':00')&&Number(s.slice(0,2))%every===0;}).map(t=>({t,label:label(t)}));
const pts=(list:any[])=>list.map(p=>({t:Date.parse(p.start),v:typeof p.powerMW==='number'?p.powerMW:null}));

function Forecast({projectId,park,cap}:{projectId:string;park:any;cap:number}){
 const [f,setF]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{setF(null);setError('');getJSON(`/api/studio/harmonie?${new URLSearchParams({project:projectId,park:park.id})}`).then(setF,e=>setError(e.message));},[park.id]);
 if(error)return <Notice kind="info" title="Nog geen voorspelling">{error}</Notice>;
 if(!f)return <Skeleton height={260}/>;
 const series=[{label:'Voorspeld parkvermogen',color:'#0C2340',points:f.rows.map((r:any)=>({t:Date.parse(r.time),v:r.powerMW}))}];
 const age=(Date.now()-Date.parse(f.run))/36e5;
 return <>
  <div className="s-chips s-chips-left"><Chip tone="dark">run {new Date(f.run).toLocaleString('nl-NL',{dateStyle:'medium',timeStyle:'short',timeZone:TZ})}</Chip><Chip tone={f.stale?'let':undefined}>{f.stale?'ouder dan zes uur':`${nl(age,0)} uur oud`}</Chip><Chip>{f.rows.length} uur vooruit</Chip></div>
  <LineChart label="HARMONIE-voorspelling van het parkvermogen" series={series} yMax={cap} xTicks={ticks(series[0].points.map((p:any)=>p.t),6,dayHour)} timeLabel={dayHour}/>
  <p className="s-muted">{f.source}; roosterpunt {nl(f.rows[0].gridLatitude,3)}° N {nl(f.rows[0].gridLongitude,3)}° E, wind op 10 m met {f.hoogtevertaling}, daarna hetzelfde parkmodel als de daggrafiek. Uurwaarden.</p>
 </>;
}

export function ParkPage({projectId,parkId}:{projectId:string;parkId:string}){
 const [project,setProject]=useState<any>(projectId==='bolsward'?clone(BOLSWARD):null),[error,setError]=useState('');
 const today=todayNL();
 const fromUrl=new URLSearchParams(location.search).get('dag');
 const [day,setDayState]=useState(fromUrl&&/^\d{4}-\d{2}-\d{2}$/.test(fromUrl)&&fromUrl<=today?fromUrl:today),[tab,setTab]=useState<'dag'|'stations'|'harmonie'>('dag'),[data,setData]=useState<any>(null),[cmp,setCmp]=useState<any>(null),[busy,setBusy]=useState(false);
 // De dag staat in de URL (?dag=JJJJ-MM-DD), zodat een link naar een dag werkt.
 const setDay=(f:string|((d:string)=>string))=>setDayState(d=>{const next=typeof f==='function'?f(d):f;history.replaceState(null,'',location.pathname+(next===today?'':'?dag='+next));return next;});
 useEffect(()=>{if(projectId!=='bolsward')getJSON('/api/studio/projects/'+projectId).then(setProject,e=>setError(e.message));},[projectId]);
 const park=project?.parken.find((p:any)=>p.id===parkId);
 useEffect(()=>{if(park)document.title=`${park.naam} · Projectstudio`;},[park?.id]);
 const q=(extra={})=>`/api/studio/park-dag?${new URLSearchParams({project:projectId,park:parkId,dag:day,...extra})}`;
 useEffect(()=>{if(!park)return;setBusy(true);setData(null);setCmp(null);setError('');getJSON(q()).then(setData,e=>setError(e.message)).finally(()=>setBusy(false));},[park?.id,day]);
 useEffect(()=>{if(!park||tab!=='stations'||cmp)return;getJSON(q({vergelijking:'1'})).then(setCmp,e=>setCmp({error:e.message}));},[park?.id,day,tab,cmp]);
 const stats=useMemo(()=>{if(!data)return null;const v=data.intervals.map((p:any)=>p.powerMW).filter((x:any)=>typeof x==='number');return {mwh:data.hours.reduce((s:number,h:any)=>h.modelMWh===null?s:s+h.modelMWh,0),mean:v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:null,max:v.length?Math.max(...v):null,missing:data.hours.reduce((s:number,h:any)=>s+(h.missingMinutes||0),0),partial:data.hours.some((h:any)=>h.modelMWh===null)};},[data]);
 if(error&&!project)return <main id="inhoud" className="s-page"><Notice kind="fout" title="Project niet gevonden.">{error}</Notice></main>;
 if(!project)return <main id="inhoud" className="s-page"><Skeleton height={220}/></main>;
 if(!park)return <main id="inhoud" className="s-page"><Notice kind="fout" title="Dit park staat niet in het project."><Link href={'/project/'+projectId}>Terug naar {project.naam}</Link></Notice></main>;
 const cap=parkMW(park),known=park.curve!=='standaard';
 const stations=park.stations.map((id:string)=>stationCatalog.find((s:any)=>s.id===id)).filter(Boolean);
 const csv=()=>{if(!data?.hours)return;download(`${park.naam}-${day}.csv`,[['uur','model_MWh','minuten','ontbrekende_minuten'],...data.hours.map((h:any)=>[h.hour,h.modelMWh===null?'':String(h.modelMWh).replace('.',','),h.minutes,h.missingMinutes])].map(r=>r.join(';')).join('\n'));};
 const dayText=new Date(day+'T12:00:00Z').toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}),dayLabel=dayText.charAt(0).toUpperCase()+dayText.slice(1);
 return <main id="inhoud" className="s-page">
  <Link href={`/project/${projectId}?stap=3`} className="s-back"><ChevronLeft size={16}/>{project.naam}</Link>
  <section className="s-parkhero">
   <div><Eyebrow>Windparkpagina</Eyebrow><h1>{park.naam}</h1>
    <p>{park.turbines} × {nl(park.rated_kw/1000,2)} MW = {nl(cap,1)} MW · ashoogte {park.hub_height_m} m · zogverlies {nl(park.wake_pct,park.wake_pct%1?1:0)} % · {nl(park.aandeel*100,0)} % naar de elektrolyser</p>
    <div className="s-chips s-chips-left"><Chip tone={known?'dark':undefined}>{known?'bekend parkmodel':'standaardmodel'}</Chip><Chip tone={park.hoogte==='wins50'?undefined:'let'}>{park.hoogte==='wins50'?'WINS50':'seizoens-α (aanname)'}</Chip><Chip>KNMI {park.stations.map(stationName).join(' + ')||'geen station'}</Chip></div></div>
   <div className="s-parkhero-map"><StaticMap points={[{lat:park.lat,lon:park.lon,kind:'chosen',r:9},...stations.map((s:any)=>({lat:s.latitude,lon:s.longitude,kind:'station-on' as const})),...(project.locatie?[{...project.locatie,kind:'h2' as const}]:[])]} rings={[{lat:park.lat,lon:park.lon,km:25}]} fit={[park,{lat:park.lat+.23,lon:park.lon},{lat:park.lat-.23,lon:park.lon},...stations.map((s:any)=>({lat:s.latitude,lon:s.longitude}))]} width={520} height={215} pad={0.12} label={`Kaart van ${park.naam} met de KNMI-stations`}/></div>
  </section>
  <div className="s-daybar">
   <div className="s-daypick"><button type="button" className="s-btn s-btn-ghost s-btn-icon" aria-label="Vorige dag" onClick={()=>setDay(d=>shift(d,-1))}><ChevronLeft size={16}/></button>
    <input type="date" value={day} max={today} aria-label="Dag" onChange={e=>e.target.value&&setDay(e.target.value)}/>
    <button type="button" className="s-btn s-btn-ghost s-btn-icon" aria-label="Volgende dag" disabled={day>=today} onClick={()=>setDay(d=>shift(d,1))}><ChevronRight size={16}/></button>
    <button type="button" className="s-btn s-btn-ghost" disabled={day===today} onClick={()=>setDay(today)}>Vandaag</button></div>
   <span className="s-daylabel">{dayLabel}</span>
  </div>
  <div className="s-tiles">
   <Tile main label="Dagenergie (model)" value={stats?nl(stats.mwh,1):'–'} unit="MWh" note={stats?.partial?'over de uren met volledige data':'hele dag'}/>
   <Tile label="Gemiddeld vermogen" value={stats?nl(stats.mean,1):'–'} unit="MW" note={`van ${nl(cap,1)} MW`}/>
   <Tile label="Hoogste vermogen" value={stats?nl(stats.max,1):'–'} unit="MW" note="per tien minuten"/>
   <Tile label="Ontbrekend" value={stats?String(stats.missing):'–'} unit="min" note="minuten zonder meting"/>
  </div>
  {error&&<Notice kind="fout" title="De dag kon niet worden geladen.">{error}</Notice>}
  <Card className="s-pad">
   <div className="s-cardhead"><Seg label="Weergave" value={tab} onChange={setTab} options={[{value:'dag',label:'Daggrafiek'},{value:'stations',label:<>Stations<span className="s-hide-small">vergelijking</span></>},{value:'harmonie',label:<>HARMONIE<span className="s-hide-small">-voorspelling</span></>}]}/>{tab==='dag'&&data&&<button type="button" className="s-btn s-btn-ghost" onClick={csv}><Download size={16}/>CSV per uur</button>}</div>
   {tab==='dag'&&(busy||!data?<Skeleton height={260}/>:<>
    <LineChart label="Gemodelleerd parkvermogen per tien minuten" series={[{label:'Model',color:'#0C2340',points:pts(data.intervals)}]} yMax={cap} xTicks={ticks(data.intervals.map((p:any)=>Date.parse(p.start)),3,hhmm)} timeLabel={t=>hhmm(t)}/>
    <p className="s-muted">{data.windSource}</p>
    <Details summary="Uurtabel" meta={`${data.hours.length} uur`}><div className="s-tablewrap"><table className="s-table"><thead><tr><th>Uur</th><th className="num">Model (MWh)</th><th className="num">Ontbrekend</th></tr></thead><tbody>{data.hours.map((h:any)=><tr key={h.hour}><td>{h.hour}:00</td><td className="num">{nl(h.modelMWh,2)}</td><td className="num">{h.missingMinutes?h.missingMinutes+' min':''}</td></tr>)}</tbody></table></div></Details></>)}
   {tab==='stations'&&(!cmp?<Skeleton height={260}/>:cmp.error?<Notice kind="fout">{cmp.error}</Notice>:<>
    <LineChart label="Parkvermogen per station en de combinatie" band={cmp.combination.map((p:any)=>({t:Date.parse(p.start),lo:p.minMW,hi:p.maxMW}))} yMax={cap} xTicks={ticks(cmp.combination.map((p:any)=>Date.parse(p.start)),3,hhmm)} timeLabel={t=>hhmm(t)}
     series={[...cmp.stations.map((s:any,i:number)=>({label:s.naam,color:SERIES[(i+1)%SERIES.length],points:pts(s.intervals),width:1.6})),{label:'Combinatie',color:'#0C2340',points:pts(cmp.combination),width:2.6}]}/>
    <p className="s-muted">Elk station apart door hetzelfde parkmodel; de band is het verschil tussen de stations. {cmp.windSource}{cmp.unavailable?.length?` Niet beschikbaar: ${cmp.unavailable.join(', ')}.`:''}</p></>)}
   {tab==='harmonie'&&<Forecast projectId={projectId} park={park} cap={cap}/>}
  </Card>
 </main>;
}
