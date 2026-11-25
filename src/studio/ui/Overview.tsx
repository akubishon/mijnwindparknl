// Projectstudio: projectoverzicht rechts (breed) of inklapbaar boven het werkvlak (smaller dan 1320 px).
import {useState} from 'react';
import {TriangleAlert,Info,ChevronDown} from 'lucide-react';
import {StaticMap,type MapPoint} from './StaticMap';
import {Eyebrow,cx} from './kit';
import {nl} from '../lib';
import {parkMW} from '../park-model.mjs';

export type OverviewProps={project:any;status:any;allocated:number;supply:{summary:any;quiet:number}|null;reference:{label:string;waterstof_t:number;benut:number}|null;onStep:(i:number)=>void;onCompute:()=>void;busy:boolean;canCompute:boolean};

export function projectPoints(project:any):MapPoint[]{
 const parks=project.parken.map((p:any)=>({lat:p.lat,lon:p.lon,kind:p.aandeel>0?'chosen':'park',r:4+Math.sqrt(parkMW(p))*.5}));
 return project.locatie?[...parks,{...project.locatie,kind:'h2'}]:parks;
}
function Body({project,status,allocated,supply,reference,onStep,onCompute,busy,canCompute}:OverviewProps){
 const active=project.parken.filter((p:any)=>p.aandeel>0),stations=new Set(active.flatMap((p:any)=>p.stations)).size;
 const issues=[...status.issues.filter((x:any)=>x.level==='let'),...status.issues.filter((x:any)=>x.level==='info'&&x.step!==3)].slice(0,5);
 return <div className="s-ov-body">
  <Eyebrow>Projectoverzicht</Eyebrow>
  <div className="s-kpis"><div><small>Toegewezen</small><b>{nl(allocated)}<i>MW</i></b></div><div><small>Parken</small><b>{active.length}</b></div><div><small>Varianten</small><b>{project.varianten.length}</b></div><div><small>Stations</small><b>{stations}</b></div></div>
  {supply?<button type="button" className="s-ov-supply" onClick={()=>onStep(4)}><small>Aanbod {supply.summary.jaar}</small><b>{nl(supply.summary.mwh/1000,1)}<i>GWh</i></b><span>{nl(supply.summary.vollasturen,0)} vollasturen · dekking {nl(supply.summary.dekking*100,1)} %</span></button>
   :<div className="s-ov-supply s-ov-empty"><small>Aanbod 2025</small><b className="s-ov-none">{busy?'Bezig met rekenen…':'Nog niet berekend'}</b>{!busy&&<button type="button" className="s-btn s-btn-mini" disabled={!canCompute} onClick={onCompute}>Bereken aanbod</button>}{!canCompute&&<span>Kies eerst parken en stations.</span>}</div>}
  {reference&&<button type="button" className="s-ov-ref" onClick={()=>onStep(5)}><small>Referentie: variant {reference.label}</small><b>{nl(Number(reference.waterstof_t.toPrecision(3)),0)}<i>t waterstof per jaar</i></b><span>{nl(reference.benut*100,1)} % van het aanbod benut</span></button>}
  {issues.length>0&&<div className="s-todo"><Eyebrow>Let op</Eyebrow>{issues.map((x:any,i:number)=><button type="button" key={i} className={cx('s-note',x.level==='let'&&'s-note-let')} onClick={()=>onStep(x.step)}>{x.level==='let'?<TriangleAlert size={14}/>:<Info size={14}/>}<span>{x.text}</span></button>)}</div>}
 </div>;
}
export function Overview(props:OverviewProps){
 const {project}=props,points=projectPoints(project);
 return <aside className="s-overview" aria-label="Projectoverzicht"><div className="s-ov-card">
  <div className="s-ov-map">{points.length?<StaticMap points={points} lines={project.locatie?project.parken.filter((p:any)=>p.aandeel>0).map((p:any)=>[project.locatie,p]):[]} width={300} height={150} label="Minikaart van het project"/>:<span className="s-ov-nomap">Nog geen locatie of parken</span>}</div>
  <Body {...props}/></div></aside>;
}
export function MobileSummary(props:OverviewProps){
 const [open,setOpen]=useState(false),lets=props.status.issues.filter((x:any)=>x.level==='let').length,active=props.project.parken.filter((p:any)=>p.aandeel>0).length;
 return <div className={cx('s-msum',open&&'open')}>
  <button type="button" aria-expanded={open} onClick={()=>setOpen(o=>!o)}><span><b>{nl(props.allocated)} MW</b> · {active} {active===1?'park':'parken'} · {props.project.varianten.length} varianten{props.supply?` · ${nl(props.supply.summary.mwh/1000,0)} GWh`:''}</span>{lets>0&&<span className="s-pill-let"><TriangleAlert size={12}/>{lets}</span>}<ChevronDown size={16} className="s-msum-chev"/></button>
  {open&&<div className="s-msum-panel"><Body {...props} onStep={i=>{setOpen(false);props.onStep(i);}}/></div>}
 </div>;
}
