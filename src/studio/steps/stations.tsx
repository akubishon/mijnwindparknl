// Stap 4: meetstations per park (KNMI, DWD, KMI, DMI; kaartpodium). De studio stelt voor, de gebruiker kiest.
import {useEffect,useMemo,useState} from 'react';
import {Check,TriangleAlert} from 'lucide-react';
import {StudioMap,type StationPin} from '../map';
import {Stage,useStagePadding} from './stage';
import {suggestStations,MAX_KM,MIN_COVERAGE} from '../stations.mjs';
import {parkStationNotes} from '../status.mjs';
import {stationName} from '../project.mjs';
import {YEARS} from '../supply.mjs';
import {nl,windLoaded} from '../lib';
import {Loading,Empty,Info,cx} from '../ui/kit';
import type {Step} from '../ui/StepRail';

// Bron per station; buiten Nederland de weerdienst van het land.
const BRON:Record<string,string>={knmi:'KNMI',dwd:'DWD',kmi:'KMI',dmi:'DMI'};
const same=(a:string[],b:string[])=>a.length===b.length&&[...a].sort().every((v,i)=>v===[...b].sort()[i]);

// Deel van de momenten van het eerste station dat wegvalt omdat het tweede dan niet meet (alleen als beide reeksen al geladen zijn).
function usePairLoss(pair:string[]|null){
 const [loss,setLoss]=useState<number|null>(null);
 useEffect(()=>{
  setLoss(null);if(!pair)return;
  const a=windLoaded(pair[0],YEARS[0]),b=windLoaded(pair[1],YEARS[0]);if(!a||!b)return;
  let live=true;Promise.all([a,b]).then(([x,y])=>{let own=0,both=0;for(let i=0;i<x.length;i++)if(!Number.isNaN(x[i])){own++;if(!Number.isNaN(y[i]))both++;}if(live&&own)setLoss(1-both/own);}).catch(()=>{});
  return()=>{live=false;};
 },[pair?.join()]);
 return loss;
}

export function StationsStep({project,set,index,steps,onStep,kpis}:{project:any;set:(f:(p:any)=>any)=>void;index:{data:any;error:string};steps:Step[];onStep:(i:number)=>void;kpis:{allocated:number;stations:number;lets:number}}){
 const active=project.parken.filter((p:any)=>p.aandeel>0);
 const [focusId,setFocus]=useState<string>(active[0]?.id||''),padding=useStagePadding();
 const focus=active.find((p:any)=>p.id===focusId)||active[0];
 const s:any=useMemo(()=>focus&&index.data?suggestStations(focus,index.data):null,[focus?.id,focus?.lat,index.data]);
 const loss=usePairLoss(s?.voorstel.paar||null);
 const choose=(id:string,stations:string[])=>set(p=>({...p,parken:p.parken.map((x:any)=>x.id===id?{...x,stations}:x)}));
 const toggle=(sid:string)=>focus&&choose(focus.id,focus.stations.includes(sid)?focus.stations.filter((x:string)=>x!==sid):[...focus.stations,sid]);
 const shown=s?[...s.lijst.slice(0,8),...s.lijst.slice(8).filter((x:any)=>focus.stations.includes(x.id))]:[];
 const pins:StationPin[]=useMemo(()=>s?s.lijst.filter((x:any,i:number)=>i<12&&x.km<70||focus.stations.includes(x.id)).map((x:any)=>({id:x.id,naam:x.naam,lat:index.data.stations.find((y:any)=>y.id===x.id).lat,lon:index.data.stations.find((y:any)=>y.id===x.id).lon,on:focus.stations.includes(x.id),km:x.km,zee:x.zee})):[],[s,focus?.stations.join()]);
 const notes=focus?parkStationNotes(focus,index.data):[];
 const cov=(d:number|undefined)=>d===undefined?null:d;
 const map=<StudioMap mode="stations" label={`Kaart met meetstations rond ${focus?.naam||'het park'}`} locatie={project.locatie} chosen={active} parks={null} stations={pins} focus={focus} onStation={toggle} fitKey={'stations:'+(focus?.id||'')} padding={padding} className="s-map-fill"/>;
 return <Stage steps={steps} active={3} onStep={onStep} kpis={kpis} map={map} title="Meetstations"
  intro="De studio stelt per park een station voor: KNMI in Nederland, DWD (Duitsland), KMI (België) of DMI (Denemarken) daarbuiten. Jij kiest; bij twee of meer stations telt een moment alleen als alle stations meten."
  next={{label:'Beschikbaar vermogen',onClick:()=>onStep(4)}}>
  {!active.length?<Empty art={false} title="Nog geen parken met vermogen" action={<button type="button" className="s-btn s-btn-cta" onClick={()=>onStep(2)}>Naar windparken</button>}>Kies eerst in stap 3 welke parken leveren en hoeveel MW.</Empty>
  :!index.data?(index.error?<p className="s-sheet-note" role="alert">{index.error}</p>:<Loading>Stations laden…</Loading>)
  :<>
   <div className="s-parktabs" role="tablist" aria-label="Park">{active.map((p:any)=>{const warn=parkStationNotes(p,index.data).some(n=>n.level==='let');return <button key={p.id} type="button" role="tab" aria-selected={p.id===focus.id} className={p.id===focus.id?'on':''} onClick={()=>setFocus(p.id)}><i className="s-lg s-lg-chosen" aria-hidden="true"/>{p.naam.replace(/^Windpark /,'')}{warn&&<span className="s-pill-let" aria-label="waarschuwing"><TriangleAlert size={12}/></span>}</button>;})}</div>
   {notes.filter(n=>n.level==='let').length>0&&<div className="s-sheet-warn" role="status"><TriangleAlert size={16} aria-hidden="true"/><ul>{notes.filter(n=>n.level==='let').map(n=><li key={n.text}>{n.text.charAt(0).toUpperCase()+n.text.slice(1)}</li>)}</ul></div>}
   {s&&<div className="s-choices-head">Voorstel van de studio<Info label="Hoe de studio stations voorstelt">Voorstel: het dichtstbijzijnde station met minstens 90 % dekking in elk windjaar. Ligt het op één na dichtstbijzijnde zulke station ook binnen 25 km, dan als alternatief het gemiddelde van die twee (zoals Houtribdijk + Stavoren bij Bolsward). Bij meer stations telt een moment alleen als alle stations meten. De studio waarschuwt bij een station verder dan 25 km, bij minder dan 90 % dekking en bij een station op zee.</Info></div>}
   {s&&<div className="s-choices">
    {s.voorstel.enkel.length>0&&<button type="button" className={cx('s-choice',same(focus.stations,s.voorstel.enkel)&&'on')} aria-pressed={same(focus.stations,s.voorstel.enkel)} onClick={()=>choose(focus.id,s.voorstel.enkel)}><small>Voorstel{same(focus.stations,s.voorstel.enkel)?' · gekozen':''}</small><b>{stationName(s.voorstel.enkel[0])}</b><span>{nl(s.lijst.find((x:any)=>x.id===s.voorstel.enkel[0])!.km)} km · dichtstbij met ≥ 90 % dekking</span>{same(focus.stations,s.voorstel.enkel)&&<Check size={16} className="s-choice-check"/>}</button>}
    {s.voorstel.paar&&<button type="button" className={cx('s-choice',same(focus.stations,s.voorstel.paar)&&'on')} aria-pressed={same(focus.stations,s.voorstel.paar)} onClick={()=>choose(focus.id,s.voorstel.paar!)}><small>Alternatief{same(focus.stations,s.voorstel.paar)?' · gekozen':''}</small><b>{s.voorstel.paar.map(stationName).join(' + ')}</b><span>gemiddelde · {loss===null?'telt alleen als beide meten':`−${nl(loss*100,1)} % momenten`}</span>{same(focus.stations,s.voorstel.paar)&&<Check size={16} className="s-choice-check"/>}</button>}
    {!s.voorstel.paar&&!s.voorstel.enkel.length&&<p className="s-sheet-note">Geen station met minstens 90 % dekking in elk windjaar. Kies zelf uit de lijst.</p>}
   </div>}
   <ul className="s-stations">{shown.map((st:any)=>{const on=focus.stations.includes(st.id),d=cov(st.dekking[YEARS[0]]);return <li key={st.id} className={on?'on':''}>
    <button type="button" className="s-cb" role="checkbox" aria-checked={on} aria-label={`${st.naam} ${on?'uitzetten':'kiezen'}`} onClick={()=>toggle(st.id)}>{on&&<Check size={14}/>}</button>
    <div><b>{st.naam}{st.zee&&<span className="s-tag">zee</span>}{st.bron!=='knmi'&&<span className="s-tag">{BRON[st.bron]}</span>}</b><small>{nl(st.km)} km{st.km>MAX_KM?' · verder dan 25 km':''}{st.meethoogte_m!==10?` · gemeten op ${st.meethoogte_m} m, omgerekend naar 10 m`:''}</small></div>
    <div className={cx('s-cov',d===null&&'s-cov-unknown')} title={d===null?'Dekking nog niet bekend: data nog niet opgehaald':`Dekking ${YEARS[0]}: ${nl(d*100,1)} %`}><span className={d!==null&&d<MIN_COVERAGE?'low':''} style={{width:d===null?'100%':d*100+'%'}}/></div>
    <span className="num">{d===null?'?':nl(d*100,0)+' %'}</span><span className="num s-muted">{st.gemiddeld_ms===null?'–':nl(st.gemiddeld_ms,1)+' m/s'}</span></li>;})}</ul>
   <p className="s-sheet-note">Dekking en gemiddelde wind zijn bekend zodra een station een keer is opgehaald (bij het berekenen van het aanbod).{index.data.voorlopig?' Een vraagteken betekent: nog niet opgehaald.':''}</p>
   {active.length>1&&focus.stations.length>0&&<button type="button" className="s-btn s-btn-light s-btn-wide" onClick={()=>set(x=>({...x,parken:x.parken.map((y:any)=>y.aandeel>0?{...y,stations:[...focus.stations]}:y)}))}>Gebruik {focus.stations.map(stationName).join(' + ')} voor alle parken</button>}
  </>}
 </Stage>;
}
