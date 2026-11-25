// Projectstudio: stappen met status. Rail links (breed), strook en onderbalk (telefoon), pillen boven de kaart (stap 1 en 4).
import type {ReactNode} from 'react';
import {Check,TriangleAlert,ChevronLeft,ChevronRight} from 'lucide-react';
import {cx,Progress,Eyebrow} from './kit';

export type Step={key:string;label:string;status:'klaar'|'open'|'let';summary:string;count:number};
type Props={steps:Step[];active:number;onStep:(i:number)=>void};

function Mark({step,i,on}:{step:Step;i:number;on:boolean}){
 if(step.status==='let')return <span className="s-dot s-dot-let" aria-hidden="true"><TriangleAlert size={14}/></span>;
 if(step.status==='klaar')return <span className={cx('s-dot','s-dot-ok',on&&'s-dot-on')} aria-hidden="true"><Check size={14}/></span>;
 return <span className={cx('s-dot',on&&'s-dot-on')} aria-hidden="true">{i+1}</span>;
}
const state=(s:Step)=>s.status==='klaar'?'klaar':s.status==='let'?`let op${s.count?`, ${s.count} ${s.count===1?'waarschuwing':'waarschuwingen'}`:''}`:'open';
const done=(steps:Step[])=>steps.filter(s=>s.status==='klaar').length;

export function StepRail({steps,active,onStep,footer}:Props&{footer?:ReactNode}){
 const n=done(steps),next=steps.findIndex(s=>s.status!=='klaar');
 return <nav className="s-rail" aria-label="Stappen van het project">
  <div className="s-rail-head"><Eyebrow>Project</Eyebrow><Progress value={n} max={steps.length} label="Stappen klaar"/><small>{n} van {steps.length} stappen klaar</small></div>
  <ol>{steps.map((s,i)=><li key={s.key} className={cx(i===active&&'on','st-'+s.status)}><a href={'?stap='+(i+1)} aria-current={i===active?'step':undefined} onClick={e=>{e.preventDefault();onStep(i);}}><Mark step={s} i={i} on={i===active}/><span><b>{s.label}</b><small>{s.summary}</small>{i===next&&i!==active&&<span className="s-next">hier verder</span>}</span><span className="s-sr">{state(s)}</span></a></li>)}</ol>
  {footer&&<div className="s-rail-foot">{footer}</div>}
 </nav>;
}
export function StepStrip({steps,active,onStep}:Props){
 return <nav className="s-strip" aria-label="Stappen">{steps.map((s,i)=><a key={s.key} href={'?stap='+(i+1)} className={cx(i===active&&'on','st-'+s.status)} aria-current={i===active?'step':undefined} onClick={e=>{e.preventDefault();onStep(i);}}>{i!==active&&s.status==='klaar'?<Check size={14} aria-hidden="true"/>:s.status==='let'?<TriangleAlert size={14} aria-hidden="true"/>:<b>{i+1}</b>}<span>{s.label}</span><span className="s-sr">{state(s)}</span></a>)}</nav>;
}
export function PillSteps({steps,active,onStep}:Props){
 return <nav className="s-pills" aria-label="Stappen">{steps.map((s,i)=><a key={s.key} href={'?stap='+(i+1)} className={cx(i===active&&'on','st-'+s.status)} aria-current={i===active?'step':undefined} onClick={e=>{e.preventDefault();onStep(i);}}>{i!==active&&s.status==='klaar'?<Check size={14} aria-hidden="true"/>:i!==active&&s.status==='let'?<TriangleAlert size={14} aria-hidden="true"/>:<b>{i+1}</b>}<span>{s.label}</span><span className="s-sr">{state(s)}</span></a>)}</nav>;
}
export function BottomBar({steps,active,onStep}:Props){
 return <div className="s-bottombar">
  <button type="button" className="s-btn s-btn-ghost" disabled={active===0} onClick={()=>onStep(active-1)} aria-label={active?`Vorige: ${steps[active-1].label}`:'Vorige'}><ChevronLeft size={16}/></button>
  <small>stap {active+1} van {steps.length}</small>
  {active<steps.length-1?<button type="button" className="s-btn s-btn-cta" onClick={()=>onStep(active+1)}>{steps[active+1].label}<ChevronRight size={16}/></button>:<span/>}
 </div>;
}
// Begeleiding onderaan elke stap: wat nog moet (en waarom de volgende stap nog niet klaar is), en de volgende stap.
export function NavFoot({steps,active,onStep,todo}:Props&{todo:{text:string}[]}){
 const open=todo.length>0,last=active===steps.length-1;
 return <div className="s-guide">
  {open?<div className="s-guide-todo" role="status"><b>Nog te doen in deze stap</b><ul>{todo.map(t=><li key={t.text}><TriangleAlert size={14} aria-hidden="true"/>{t.text}</li>)}</ul></div>
   :!last&&<p className="s-guide-ok"><Check size={16} aria-hidden="true"/>Deze stap is klaar. Ga door met {steps[active+1].label}.</p>}
  <div className="s-navfoot">
   {active>0?<button type="button" className="s-btn s-btn-ghost" onClick={()=>onStep(active-1)}><ChevronLeft size={16}/>{steps[active-1].label}</button>:<span/>}
   {!last&&<button type="button" className={'s-btn s-btn-big '+(open?'s-btn-ghost':'s-btn-cta')} onClick={()=>onStep(active+1)}>{open?'Toch verder naar ':'Verder naar '}{steps[active+1].label}<ChevronRight size={16}/></button>}
  </div>
 </div>;
}
