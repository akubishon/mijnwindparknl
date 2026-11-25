// Projectstudio: samenvatting rechts (breed) of inklapbaar boven het werkvlak (smaller dan 1320 px).
// Alleen wat een werktuigbouwkundige nodig heeft: windvermogen, de opstelling, het aanbod en daarna waterstof en LCOH.
import {useState} from 'react';
import {TriangleAlert,Info,ChevronDown} from 'lucide-react';
import {StaticMap,type MapPoint} from './StaticMap';
import {Eyebrow,cx} from './kit';
import {nl} from '../lib';
import {parkMW} from '../park-model.mjs';

export type Row={label:string;waterstof_t:number;lcoh:number|null;best:boolean;ref:boolean};
export type OverviewProps={project:any;status:any;allocated:number;design:{label:string;modules:number;moduleMW:number;nominalMW:number;intakeMW:number}|null;supply:{summary:any}|null;rows:Row[];onStep:(i:number)=>void;onCompute:()=>void;busy:boolean;canCompute:boolean};

export function projectPoints(project:any):MapPoint[]{
 const parks=project.parken.map((p:any)=>({lat:p.lat,lon:p.lon,kind:p.aandeel>0?'chosen':'park',r:4+Math.sqrt(parkMW(p))*.5}));
 return project.locatie?[...parks,{...project.locatie,kind:'h2'}]:parks;
}
const Fact=({k,v,unit,onClick}:{k:string;v:string;unit?:string;onClick?:()=>void})=><div className="s-fact"><dt>{k}</dt><dd>{onClick?<button type="button" onClick={onClick}>{v}{unit&&<i>{unit}</i>}</button>:<>{v}{unit&&<i>{unit}</i>}</>}</dd></div>;

function Body({status,allocated,design,supply,rows,onStep,onCompute,busy,canCompute}:OverviewProps){
 const issues=[...status.issues.filter((x:any)=>x.level==='let'),...status.issues.filter((x:any)=>x.level==='info'&&x.step!==3)].slice(0,4);
 const s=supply?.summary;
 return <div className="s-ov-body">
  <Eyebrow>Samenvatting</Eyebrow>
  <dl className="s-facts-list">
   <Fact k="Windvermogen voor de elektrolyser" v={nl(allocated)} unit="MW" onClick={()=>onStep(2)}/>
   {design?<>
    <Fact k={`Variant ${design.label}`} v={`${design.modules} × ${nl(design.moduleMW,design.moduleMW%1?2:0)}`} unit="MW" onClick={()=>onStep(1)}/>
    <Fact k="Nominaal vermogen" v={nl(design.nominalMW,1)} unit="MW"/>
    <Fact k="Opname bij vollast (incl. BoP)" v={nl(design.intakeMW,1)} unit="MW"/>
   </>:<Fact k="Opstelling" v="nog niet gekozen" onClick={()=>onStep(1)}/>}
   {s&&<><Fact k={`Aanbod ${s.jaar}`} v={nl(s.mwh/1000,1)} unit="GWh" onClick={()=>onStep(4)}/><Fact k="Vollasturen aanbod" v={nl(s.vollasturen,0)} unit="h"/></>}
  </dl>
  {!s&&<div className="s-ov-compute">{busy?<span className="s-muted">Aanbod wordt berekend…</span>:<><button type="button" className="s-btn s-btn-cta s-btn-small" disabled={!canCompute} onClick={onCompute}>Bereken aanbod</button>{!canCompute&&<span className="s-muted">Kies eerst parken en stations.</span>}</>}</div>}
  {rows.length>0&&<table className="s-ov-result"><caption>Resultaat per jaar</caption><thead><tr><th/><th className="num">H₂ (t)</th><th className="num">LCOH (€/kg)</th></tr></thead><tbody>{rows.map(r=><tr key={r.label} className={cx(r.best&&'best')}><th>Variant {r.label}{r.ref&&<small> ref.</small>}</th><td className="num">{nl(Number(r.waterstof_t.toPrecision(3)),0)}</td><td className="num">{r.lcoh===null?'–':nl(r.lcoh,2)}</td></tr>)}</tbody></table>}
  {issues.length>0&&<div className="s-todo"><Eyebrow>Let op</Eyebrow>{issues.map((x:any,i:number)=><button type="button" key={i} className={cx('s-note',x.level==='let'&&'s-note-let')} onClick={()=>onStep(x.step)}>{x.level==='let'?<TriangleAlert size={14}/>:<Info size={14}/>}<span>{x.text}</span></button>)}</div>}
 </div>;
}
export function Overview(props:OverviewProps){
 const {project}=props,points=projectPoints(project);
 return <aside className="s-overview" aria-label="Samenvatting"><div className="s-ov-card">
  <div className="s-ov-map">{points.length?<StaticMap points={points} lines={project.locatie?project.parken.filter((p:any)=>p.aandeel>0).map((p:any)=>[project.locatie,p]):[]} width={300} height={130} label="Minikaart van het project"/>:<span className="s-ov-nomap">Nog geen locatie of parken</span>}</div>
  <Body {...props}/></div></aside>;
}
export function MobileSummary(props:OverviewProps){
 const [open,setOpen]=useState(false),lets=props.status.issues.filter((x:any)=>x.level==='let').length,best=props.rows.find(r=>r.best);
 return <div className={cx('s-msum',open&&'open')}>
  <button type="button" aria-expanded={open} onClick={()=>setOpen(o=>!o)}><span><b>{nl(props.allocated)} MW</b>{props.design?` · ${props.design.modules} × ${nl(props.design.moduleMW,props.design.moduleMW%1?2:0)} MW`:''}{best&&best.lcoh!==null?` · LCOH ${nl(best.lcoh,2)} €/kg`:props.supply?` · ${nl(props.supply.summary.mwh/1000,0)} GWh`:''}</span>{lets>0&&<span className="s-pill-let"><TriangleAlert size={12}/>{lets}</span>}<ChevronDown size={16} className="s-msum-chev"/></button>
  {open&&<div className="s-msum-panel"><Body {...props} onStep={i=>{setOpen(false);props.onStep(i);}}/></div>}
 </div>;
}
