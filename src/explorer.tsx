import WindIntro from './wind-intro';
import TenMinuteWind, {type WindPoint} from './ten-minute-wind';
'use client';
import { runtimeStats } from './electrolysis.mjs';
import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Radio, RefreshCw, Wind, Zap } from 'lucide-react';
type WindHour = { hour:number; modelMWh:number|null; minutes:number; missingMinutes:number };
type Hour = { hour: number; kWh: number };
type History = { hours: Hour[]; totals: { production?: number } | null; available: boolean };
type Live = { powerKW: number; timestamp: string; windSpeed: number | null; windDirection: number | null; sourceError: string | null; receivedAt: string };
const MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dateString = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const format = (v: number, digits = 1) => new Intl.NumberFormat('nl-NL', { maximumFractionDigits: digits }).format(v);
const time = (v: string) => Number.isNaN(Date.parse(v)) ? 'Onbekend' : new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(v));
async function api<T = any>(url: string, signal?: AbortSignal): Promise<T> { const r = await fetch(url, { signal }); const data = await r.json() as T & { error?: string }; if (!r.ok) throw Error(data.error || 'Gegevens konden niet worden geladen.'); return data; }
export default function Explorer({park='fryslan'}:{park?:'fryslan'|'beabuorren'}) {
  const isBea=park==='beabuorren';
  const parkName=isBea?'Beabuorren':'Fryslân';
  const [day, setDay] = useState(today), [view, setView] = useState<'history'|'live'>('history');
  const [year, setYear] = useState(Number(today().slice(0,4))), [month, setMonth] = useState(Number(today().slice(5,7)));
  const [years, setYears] = useState<number[]>([]), [days, setDays] = useState<number[]>([]), [calendarLoading,setCalendarLoading] = useState(true), [calendarError,setCalendarError] = useState('');
  const [data, setData] = useState<History|null>(null), [loading, setLoading] = useState(true), [error,setError] = useState(''), [retry,setRetry] = useState(0);
  const [live,setLive] = useState<Live|null>(null), [samples,setSamples] = useState<Live[]>([]), [liveError,setLiveError] = useState(''), [running,setRunning] = useState(true), [clock,setClock] = useState(Date.now());
  const defaults={park,station:'0-20000-0-06267',wake:'1',seasonal:isBea?'0':'1',height:isBea?'60':'115',alpha:isBea?'0.2':'0.115',wakePercent:isBea?'2':'5',ratedKW:isBea?'1300':'4300',cutIn:'3',ratedSpeed:'11.5',cutOut:'25'};
  const [settings,setSettings]=useState(defaults),[draft,setDraft]=useState(defaults);
  const [stations,setStations]=useState<{id:string;name:string;distanceKM:number}[]>([]),[stationError,setStationError]=useState('');
  useEffect(()=>{const abort=new AbortController();api('/api/stations?park='+park,abort.signal).then(d=>{setStations(d.stations);setStationError('');}).catch(e=>{if(e.name!=='AbortError')setStationError(e.message);});return()=>abort.abort();},[park,retry]);
  const stationName=stations.find(s=>s.id===settings.station)?.name||'Stavoren';
  const updateSetting=(key:string,value:string)=>setDraft(s=>({...s,[key]:value}));
  const [threshold,setThreshold]=useState(isBea?'5.73':'38.27');
  const [intervals,setIntervals]=useState<WindPoint[]>([]);
  const share=isBea?1:0.1;
  const thresholdMax=isBea?1000:38.27;
  const thresholdMW=Number(threshold);
  const validThreshold=threshold.trim()!==''&&Number.isFinite(thresholdMW)&&thresholdMW>0&&thresholdMW<=thresholdMax;
  const [wind,setWind]=useState<WindHour[]>([]), [windError,setWindError]=useState(''), [windLoading,setWindLoading]=useState(false);
  useEffect(()=>{const abort=new AbortController();setWind([]);setIntervals([]);setWindError('');setWindLoading(true);api('/api/wind?'+new URLSearchParams({day,...settings}),abort.signal).then(d=>{setWind(d.hours);setIntervals(d.intervals||[]);}).catch(e=>{if(e.name!=='AbortError')setWindError(e.message);}).finally(()=>{if(!abort.signal.aborted)setWindLoading(false);});return()=>abort.abort();},[day,retry,settings]);
  const stats=!windLoading&&!windError&&intervals.length&&validThreshold?runtimeStats(intervals,thresholdMW,share):null;
  const duration=(minutes:number)=>`${Math.floor(minutes/60)} u ${minutes%60} min`;
  const latestStamp = useRef('');
  useEffect(() => { if(isBea){setYears(Array.from({length:Number(today().slice(0,4))-2012+1},(_,i)=>2012+i));return;} const abort = new AbortController(); api('/api/catalog',abort.signal).then(d=>setYears(d.values)).catch(e=>{if(e.name !== 'AbortError')setCalendarError(e.message);}); return ()=>abort.abort(); },[retry]);
  useEffect(() => {
    if(isBea){setDays(Array.from({length:new Date(Date.UTC(year,month,0)).getUTCDate()},(_,i)=>i+1));setCalendarLoading(false);return;}
    const abort = new AbortController(); setCalendarLoading(true); setCalendarError(''); setDays([]);
    api(`/api/catalog?year=${year}&month=${month}`,abort.signal).then(d=>setDays(d.values.filter((v:number)=>v>=1&&v<=31))).catch(e=>{if(e.name !== 'AbortError')setCalendarError(e.message);}).finally(()=>{if(!abort.signal.aborted)setCalendarLoading(false);});
    return ()=>abort.abort();
  },[year,month,retry]);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError(''); setData(null);
    (isBea?api('/api/wind?'+new URLSearchParams({day,...settings}),abort.signal).then(d=>({hours:d.hours.filter((h:WindHour)=>h.modelMWh!==null).map((h:WindHour)=>({hour:h.hour,kWh:h.modelMWh!*1000})),available:true,totals:null})):api('/api/history?day='+day,abort.signal)).then(d=>setData(d as History)).catch(e=>{if(e.name !== 'AbortError')setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return ()=>abort.abort();
  },[day,retry,settings]);
  useEffect(() => {
    if(view !== 'live' || !running) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>; const abort = new AbortController();
    async function poll() {
      if (document.hidden) { timer=setTimeout(poll,1000); return; }
      const started=Date.now();
      try { const d = await api<Live>('/api/live',abort.signal); if(stopped)return; setLive(d);setLiveError('');
        if(d.timestamp !== latestStamp.current && !Number.isNaN(Date.parse(d.timestamp))) { latestStamp.current=d.timestamp;setSamples(s=>[...s,d].slice(-900)); }
      } catch(e) { if(!stopped)setLiveError(e instanceof Error?e.message:'Actueel vermogen kon niet worden geladen.'); }
      if(!stopped)timer=setTimeout(poll,Math.max(100,1000-(Date.now()-started)));
    }
    poll(); return ()=>{stopped=true;abort.abort();clearTimeout(timer);};
  },[view,running,retry]);
  useEffect(()=>{const t=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(t);},[]);
  function choose(value: string) { setDay(value); setYear(Number(value.slice(0,4))); setMonth(Number(value.slice(5,7))); setView('history'); }
  function stepDay(delta:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);const next=d.toISOString().slice(0,10);if(next<=today())choose(next);}
  function stepMonth(delta:number){const d=new Date(Date.UTC(year,month-1+delta,1));setYear(d.getUTCFullYear());setMonth(d.getUTCMonth()+1);}
  const hours=data?.hours || [], total=hours.reduce((s,h)=>s+h.kWh,0), peak=hours.reduce((p,h)=>h.kWh>(p?.kWh ?? -1)?h:p,null as Hour|null);

  const datedTitle=new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Amsterdam'}).format(new Date(day+'T12:00:00Z'));
  const startOffset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7, monthLength=new Date(Date.UTC(year,month,0)).getUTCDate();
  const age=live?Math.max(0,(clock-Date.parse(live.timestamp))/1000):null;
  const deltas=samples.slice(1).map((s,i)=>(Date.parse(s.timestamp)-Date.parse(samples[i].timestamp))/1000).filter(v=>v>0);
  const median=deltas.length?[...deltas].sort((a,b)=>a-b)[Math.floor(deltas.length/2)]:null;
  function download() {
    const rows=view==='history'?'hour,energy_kWh\n'+hours.map(h=>`${h.hour},${h.kWh}`).join('\n'):'source_timestamp,power_kW\n'+samples.map(s=>`${new Date(s.timestamp).toISOString()},${s.powerKW}`).join('\n');
    const url=URL.createObjectURL(new Blob([rows],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=view==='history'?`fryslan-${day}.csv`:'fryslan-live-session.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Fryslân productie startpagina"><span className="brand-symbol"><Wind size={24}/></span><span>fryslân<span className="brand-sub">PRODUCTIE</span></span></a><span className="zone">Tijden in Nederland</span></header>
    <main><nav className="park-nav" aria-label="Windparken"><a href="/" aria-current={!isBea?'page':undefined}>Fryslân</a><a href="/elektrolyser">Elektrolyser</a><a href="/beabuorren" aria-current={isBea?'page':undefined}>Beabuorren</a><a href="/onderzoek">Onderzoek</a></nav>
      <div className="intro"><WindIntro/><div><h1>Windpark {parkName}</h1><p>{isBea?'Berekende energie uit KNMI-wind · 8 turbines · 10,4 MW. Er is geen gemeten productiebron gekoppeld.':'Bekijk elk KNMI-tienminutenpunt en het berekende vermogen.'}</p></div></div>
      <div className="workspace-head"><nav className="tabs" aria-label="Productieoverzichten"><button onClick={()=>setView('history')} className={view==='history'?'selected':''}><CalendarDays size={16}/> Per dag</button>{!isBea&&<button onClick={()=>setView('live')} className={view==='live'?'selected':''}><Radio size={16}/> Actueel vermogen</button>}</nav><button className="text-button" onClick={()=>setRetry(r=>r+1)}><RefreshCw size={14}/> Vernieuwen</button></div>
      {view==='history'?<div className="history-layout">
        <aside className="calendar-card"><div className="card-eyebrow">KIES EEN DAG</div><div className="calendar-select"><label>Jaar<select value={year} onChange={e=>setYear(Number(e.target.value))}>{Array.from(new Set([...years,year])).sort((a,b)=>b-a).map(y=><option key={y}>{y}</option>)}</select></label><label>Maand<select value={month} onChange={e=>setMonth(Number(e.target.value))}>{MONTHS.map((m,i)=><option value={i+1} key={m}>{m}</option>)}</select></label></div><div className="month-heading"><button aria-label="Vorige maand" onClick={()=>stepMonth(-1)}><ChevronLeft size={18}/></button><strong>{MONTHS[month-1]} {year}</strong><button aria-label="Volgende maand" onClick={()=>stepMonth(1)}><ChevronRight size={18}/></button></div><div className="calendar-grid" aria-label="Kies een dag">{['ma','di','wo','do','vr','za','zo'].map((d,i)=><span className="weekday" key={'weekday'+i}>{d}</span>)}{Array.from({length:startOffset},(_,i)=><span key={'blank'+i}/>)}{Array.from({length:monthLength},(_,i)=>{const d=i+1,v=dateString(year,month,d),available=days.includes(d);return <button key={d} disabled={calendarLoading||!available||v>today()} onClick={()=>choose(v)} className={(day===v?'chosen ':'')+(v===today()?'today':'')} aria-label={`${d} ${MONTHS[month-1]} ${year}${available?'':', geen gegevens'}`} aria-pressed={day===v}>{d}<span className="day-dot"/></button>;})}</div><div className="calendar-note" role="status">{calendarLoading?'Beschikbare dagen laden…':calendarError||<><span className="tiny-dot"/> Dagen met gegevens · {days.length} beschikbaar</>}</div>{calendarError&&<button className="text-button" onClick={()=>setRetry(r=>r+1)}>Opnieuw laden</button>}<button className="today-button" onClick={()=>choose(today())}>Vandaag <ArrowRight size={15}/></button><div className="date-jump"><label htmlFor="date-jump">Kies een datum</label><input id="date-jump" type="date" value={day} max={today()} onChange={e=>{if(e.target.value)choose(e.target.value)}}/></div><p className="aside-note">{isBea?'Kies een datum; beschikbaarheid van KNMI-metingen wordt bij het ophalen gecontroleerd.':'Gemarkeerde dagen bevatten gegevens. Tijden zijn lokale Nederlandse tijden.'}</p></aside>
        <section className="production-panel"><div className="panel-heading"><div><div className="card-eyebrow">DAGOVERZICHT</div><h2>{datedTitle}</h2></div><div className="day-nav"><button aria-label="Vorige dag" onClick={()=>stepDay(-1)}><ChevronLeft size={19}/></button><button disabled={day>=today()} aria-label="Volgende dag" onClick={()=>stepDay(1)}><ChevronRight size={19}/></button></div></div>
          <TenMinuteWind key={day+settings.station} points={intervals} share={share} station={stationName} loading={windLoading} error={windError} day={day} hourly={hours.filter(h=>h.hour>=0&&h.hour<24).map(h=>({hour:h.hour,energyMWh:h.kWh/1000*share,powerMW:h.kWh/1000*share/(isBea?(wind.find(w=>w.hour===h.hour)?.minutes||60)/60:1)}))} hourlyLoading={loading} hourlyError={error} modelHours={isBea}/>
          <details className="hour-table"><summary>Alle uurwaarden <span>{hours.length} uur</span></summary><div className="table-scroll"><table><thead><tr><th>Uur (Nederlandse tijd)</th><th>Energie · MWh</th><th>Energie · kWh</th></tr></thead><tbody>{hours.map(h=><tr key={h.hour}><td>{String(h.hour).padStart(2,'0')}:00</td><td>{format(h.kWh/1000,3)}</td><td>{format(h.kWh,0)}</td></tr>)}</tbody></table></div></details>
          <details className="model-settings"><summary>Modelinstellingen</summary><form onSubmit={e=>{e.preventDefault();setSettings({...draft});}}><div className="model-grid"><label>KNMI-station<select value={draft.station} onChange={e=>updateSetting('station',e.target.value)}>{!stations.length&&<option value="0-20000-0-06267">Stavoren</option>}{stations.map(s=><option key={s.id} value={s.id}>{s.name} · {format(s.distanceKM,1)} km</option>)}</select></label>{[
['height','Ashoogte (m)','10','250','1'],['alpha','Hoogte-exponent α','0','0.5','0.005'],['wakePercent','Zogverlies: lagere wind (%)','0','30','0.5'],['ratedKW','Nominaal vermogen per turbine (kW)','100','10000','100'],['cutIn','Startwindsnelheid (m/s)','0','10','0.1'],['ratedSpeed','Nominale windsnelheid (m/s)','1','25','0.1'],['cutOut','Uitschakelwindsnelheid (m/s)','5','40','0.1']].filter(([key])=>!isBea||!['cutIn','ratedSpeed'].includes(key)).map(([key,label,min,max,step])=><label key={key}>{label}<input type="number" required min={min} max={max} step={step} value={draft[key as keyof typeof draft]} onChange={e=>updateSetting(key,e.target.value)}/></label>)}</div><p role="status">{stationError||'Stations gesorteerd op hemelsbrede afstand tot het geschatte parkcentrum. Een station kan voor de gekozen dag geen windgegevens hebben.'}</p><div className="model-toggles"><label><input type="checkbox" checked={draft.wake==='1'} onChange={e=>updateSetting('wake',e.target.checked?'1':'0')}/> Zogverlies meenemen</label><label><input type="checkbox" checked={draft.seasonal==='1'} onChange={e=>updateSetting('seasonal',e.target.checked?'1':'0')}/> Seizoenscorrectie α (±0,065)</label></div><p>{isBea?'8 turbines. Curve Siemens SWT-1.3-62 uit een secundaire bron; geen gecertificeerde fabrikantcurve.':'89 turbines. Indicatief kubisch model, geen fabrikantcurve. De hoogte-exponent is eerder afgestemd op Houtribdijk; bij Stavoren is dezelfde waarde een scenario-aanname.'} Instellingen gelden voor deze sessie.</p><div className="model-actions"><button className="primary-button" type="submit">Model bijwerken</button><button className="text-button" type="button" onClick={()=>{setDraft(defaults);setSettings(defaults);}}>Standaard herstellen</button></div></form></details>
          {!loading&&!error&&data?.available&&hours.length>0&&<section className="day-production-summary"><h3>{isBea?'Berekende dagproductie':'Dagproductie volgens de bron'}</h3><p className="wind-note">Het hele park · {isBea?'berekend uit KNMI-wind':'opgeteld uit de beschikbare bronuren'}.</p><div className="metrics"><Metric label="TOTALE ENERGIE" value={format(total/1000)} unit="MWh" note={day===today()?'Vandaag tot nu toe':'Som van de beschikbare uren'}/><Metric label="HOOGSTE UURPRODUCTIE" value={format((peak?.kWh||0)/1000)} unit="MWh" note={peak?`${String(peak.hour).padStart(2,'0')}:00–${String((peak.hour+1)%24).padStart(2,'0')}:00`:''}/><Metric label="GEMIDDELD PER UUR" value={format(total/hours.length/1000)} unit="MWh" note={`Over ${hours.length} beschikbare uren`}/></div></section>}
        </section>
      </div>:<section className="live-panel"><div className="panel-heading"><div><div className="card-eyebrow"><span className={running?'dot':'dot paused'}/> ACTUEEL VERMOGEN</div><h2>Vermogen op dit moment</h2></div><button className={running?'pause-button':'primary-button'} onClick={()=>setRunning(r=>!r)}>{running?'Pauzeren':'Hervatten'}</button></div>
        {liveError&&<div className="live-error" role="alert">{liveError} {live?'De laatste meting blijft zichtbaar.':''}</div>}
        <div className="metrics"><Metric label="ACTUEEL VERMOGEN" value={live?format(live.powerKW/1000,2):'—'} unit="MW" note={live?`Gemeten om ${time(live.timestamp)}`:'Wachten op een meting'}/><Metric label="WINDSNELHEID" value={live?.windSpeed != null?format(live.windSpeed):'—'} unit="m/s" note={live?.windDirection!=null?`Richting ${format(live.windDirection,0)}°`:'Bij het windpark'}/><Metric label="LEEFTIJD METING" value={age!=null&&Number.isFinite(age)?format(age,0):'—'} unit="s" note={!running?'Gepauzeerd':live?.sourceError?'De bron meldt een fout':age!=null&&age>30?'De meting is verouderd':'Bijgewerkt zolang dit tabblad zichtbaar is'}/></div>
        <div className="chart-header"><div><h3>Vermogen tijdens deze sessie</h3><p>Gemeten vermogen · MW</p></div><button className="download" disabled={!samples.length} onClick={download}><ArrowDownToLine size={15}/> CSV</button></div><LiveChart samples={samples}/><div className="chart-caption"><span><span className="legend-swatch"/> {samples.length} metingen</span><span>{median!=null?`Mediaan tijd tussen metingen: ${format(median,1)} seconden`:'Wachten op meer metingen…'}</span></div><div className="live-explanation"><Radio size={21}/><div><h3>Over deze metingen</h3><p>De grafiek toont nieuwe bronmetingen zolang dit tabblad zichtbaar is. De laatste 900 metingen worden bewaard tot je de pagina herlaadt.</p><p>MW is het vermogen op een moment; MWh is de opgewekte energie over een uur. De bron bepaalt hoe vaak er een nieuwe meting beschikbaar is.</p></div></div>
      </section>}
      <footer><span>Windpark {parkName} · {isBea?'Modelberekening':'Onofficieel productieoverzicht'}</span><span>MWh: opgewekte energie · MW: actueel vermogen</span></footer>
    </main>
  </div>;
}
function Metric({label,value,unit,note}:{label:string;value:string;unit:string;note:string}) { return <div className="metric"><div className="metric-label">{label}</div><div className="metric-value">{value}<span>{unit}</span></div><div className="metric-note">{note}</div></div>; }
function LiveChart({samples}:{samples:Live[]}) {
  if(samples.length<2)return <div className="live-chart-empty" role="status"><Zap size={27}/><p>{samples.length?'Wachten op de volgende meting…':'Metingen laden…'}</p><span>Alleen beschikbare bronmetingen.</span></div>;
  const max=Math.max(1,...samples.map(s=>s.powerKW/1000))*1.1, start=Date.parse(samples[0].timestamp), end=Date.parse(samples[samples.length-1].timestamp), span=Math.max(1,end-start);
  const points=samples.map(s=>`${60+(Date.parse(s.timestamp)-start)/span*820},${260-s.powerKW/1000/max*220}`).join(' ');
  return <svg className="live-chart" viewBox="0 0 920 310" role="img" aria-label="Actueel vermogen over the observed session"><title>Actueel vermogen in megawatts, timestamped by the source</title>{[0,.25,.5,.75,1].map(v=><g key={v}><line x1="60" x2="880" y1={260-v*220} y2={260-v*220} stroke="#e4e9e3" strokeDasharray="3 5"/><text x="47" y={264-v*220} textAnchor="end" fill="#7c8980" fontSize="11">{format(max*v,1)}</text></g>)}<polyline points={points} fill="none" stroke="#456f3d" strokeWidth="2.5"/>{samples.length<150&&samples.map((s,i)=><circle key={i} cx={60+(Date.parse(s.timestamp)-start)/span*820} cy={260-s.powerKW/1000/max*220} r="2.5" fill="#456f3d"><title>{time(s.timestamp)} · {format(s.powerKW/1000,2)} MW</title></circle>)}<text x="60" y="287" fill="#7c8980" fontSize="11">{time(samples[0].timestamp)}</text><text x="880" y="287" textAnchor="end" fill="#7c8980" fontSize="11">{time(samples[samples.length-1].timestamp)}</text></svg>;
}
