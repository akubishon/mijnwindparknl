// Projectstudio: kleine bouwstenen in de huisstijl van mijnwindpark.nl (zie studio.css, klassen met s-).
import {useEffect,useId,useState,type ReactNode} from 'react';
import {Check,TriangleAlert,Info as InfoIcon,CircleAlert,Minus,Plus,ChevronDown,X} from 'lucide-react';
import {nl,parseNumber,plain} from '../lib';

export {Check,TriangleAlert,InfoIcon,CircleAlert,Minus,Plus,ChevronDown,X};
export const cx=(...c:(string|false|null|undefined)[])=>c.filter(Boolean).join(' ');

export function Card({className,children,as:Tag='section',...rest}:{className?:string;children:ReactNode;as?:any;[k:string]:any}){
 return <Tag className={cx('s-card',className)} {...rest}>{children}</Tag>;
}
export function Tile({label,value,unit,note,main}:{label:string;value:string;unit?:string;note?:ReactNode;main?:boolean}){
 return <div className={cx('s-tile',main&&'s-tile-main')}><small>{label}</small><b>{value}{unit&&<i>{unit}</i>}</b>{note&&<span>{note}</span>}</div>;
}
export function Notice({kind='info',title,children,action}:{kind?:'info'|'let'|'fout';title?:ReactNode;children?:ReactNode;action?:ReactNode}){
 const Icon=kind==='info'?InfoIcon:kind==='let'?TriangleAlert:CircleAlert;
 return <div className={cx('s-notice','s-notice-'+kind)} role={kind==='fout'?'alert':'status'}><Icon size={16} aria-hidden="true"/><div>{title&&<b>{title}</b>}{children}{action&&<div className="s-notice-action">{action}</div>}</div></div>;
}
const CHIP:{[k:string]:string}={osm:'bron OSM',bron:'bron',aanname:'aanname','eigen invoer':'eigen invoer'};
export function Chip({kind,children,tone}:{kind?:string;children?:ReactNode;tone?:'dark'|'let'|'sky'}){
 if(!kind&&!children)return null;
 const t=tone||(kind==='aanname'?'let':kind==='eigen invoer'?'sky':undefined);
 return <span className={cx('s-chip',t&&'s-chip-'+t)}>{children??CHIP[kind!]??kind}</span>;
}
export function Eyebrow({children,light}:{children:ReactNode;light?:boolean}){return <span className={cx('s-eyebrow',light&&'s-eyebrow-light')}>{children}</span>;}
export function StepHead({n,title,children,actions}:{n:number;title:string;children?:ReactNode;actions?:ReactNode}){
 return <header className="s-head"><div><Eyebrow>Stap {n} van 6</Eyebrow><h1>{title}</h1>{children&&<p>{children}</p>}</div>{actions&&<div className="s-head-actions">{actions}</div>}</header>;
}

// Getalinvoer met komma, eenheid, grenzen en − / +. Neemt de waarde over bij Enter of bij het verlaten van het veld.
export function NumberField({value,onChange,min=-Infinity,max=Infinity,step=1,decimals=1,unit,label,stepper=true,disabled,id}:{value:number;onChange:(v:number)=>void;min?:number;max?:number;step?:number;decimals?:number;unit?:string;label:string;stepper?:boolean;disabled?:boolean;id?:string}){
 const show=(v:number)=>Number.isFinite(v)?plain(v,decimals):'';
 const [draft,setDraft]=useState(show(value)),[bad,setBad]=useState(false);
 useEffect(()=>{setDraft(show(value));setBad(false);},[value]);
 const clamp=(v:number)=>Math.min(max,Math.max(min,Math.round(v*10**decimals)/10**decimals));
 const commit=()=>{const v=parseNumber(draft);if(v===null||v<min||v>max){setBad(true);return;}setBad(false);if(clamp(v)!==value)onChange(clamp(v));else setDraft(show(value));};
 return <span className={cx('s-number',bad&&'s-number-bad',disabled&&'s-number-off')}>
  {stepper&&<button type="button" aria-label={`${label} verlagen`} disabled={disabled||value<=min} onClick={()=>onChange(clamp(value-step))}><Minus size={14}/></button>}
  <input id={id} inputMode="decimal" aria-label={label} aria-invalid={bad||undefined} value={draft} disabled={disabled} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='ArrowUp'){e.preventDefault();onChange(clamp(value+step));}if(e.key==='ArrowDown'){e.preventDefault();onChange(clamp(value-step));}}}/>
  {unit&&<em>{unit}</em>}
  {stepper&&<button type="button" aria-label={`${label} verhogen`} disabled={disabled||value>=max} onClick={()=>onChange(clamp(value+step))}><Plus size={14}/></button>}
  {bad&&<span className="s-number-hint" role="alert">{`Tussen ${nl(min,decimals&&min%1?decimals:0)} en ${nl(max,decimals&&max%1?decimals:0)}`}</span>}
 </span>;
}

// Schuifje (native range, opgemaakt). `marks`: labels onder de balk.
export function Slider({value,min,max,step,onChange,label,marks}:{value:number;min:number;max:number;step:number;onChange:(v:number)=>void;label:string;marks?:string[]}){
 const pct=max>min?(value-min)/(max-min)*100:0;
 return <div className="s-slider"><input type="range" min={min} max={max} step={step} value={value} aria-label={label} style={{'--pct':pct+'%'} as any} onChange={e=>onChange(Number(e.target.value))}/>{marks&&<div className="s-slider-marks">{marks.map((m,i)=><span key={i}>{m}</span>)}</div>}</div>;
}
// Schuifje met twee grepen (vanaf … tot …).
export function RangeSlider({min,max,lo,hi,step,onChange,label,format}:{min:number;max:number;lo:number;hi:number;step:number;onChange:(lo:number,hi:number)=>void;label:string;format:(v:number)=>string}){
 const pct=(v:number)=>max>min?(v-min)/(max-min)*100:0;
 return <div className="s-range"><div className="s-range-track"><span style={{left:pct(lo)+'%',right:100-pct(hi)+'%'}}/></div>
  <input type="range" min={min} max={max} step={step} value={lo} aria-label={label+' vanaf'} onChange={e=>onChange(Math.min(Number(e.target.value),hi),hi)}/>
  <input type="range" min={min} max={max} step={step} value={hi} aria-label={label+' tot'} onChange={e=>onChange(lo,Math.max(Number(e.target.value),lo))}/>
  <div className="s-slider-marks"><span>{format(lo)}</span><span>{format(hi)}</span></div></div>;
}
export function Seg<T extends string|number>({options,value,onChange,label}:{options:{value:T;label:ReactNode;title?:string}[];value:T;onChange:(v:T)=>void;label:string}){
 return <div className="s-seg" role="group" aria-label={label}>{options.map(o=><button type="button" key={String(o.value)} title={o.title} aria-pressed={o.value===value} className={o.value===value?'on':''} onClick={()=>onChange(o.value)}>{o.label}</button>)}</div>;
}
export function Progress({value,max,label}:{value:number;max:number;label:string}){
 return <div className="s-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}><span style={{width:(max?value/max*100:0)+'%'}}/></div>;
}
export function Skeleton({lines=3,height}:{lines?:number;height?:number}){
 return <div className="s-skeleton" aria-hidden="true">{height?<span style={{height}}/>:Array.from({length:lines},(_,i)=><span key={i} style={{width:`${90-i*17}%`}}/>)}</div>;
}
export function Loading({children}:{children:ReactNode}){return <div className="s-loading" role="status"><span className="s-spinner" aria-hidden="true"/>{children}</div>;}
export function Empty({title,children,art=true,action}:{title:string;children?:ReactNode;art?:boolean;action?:ReactNode}){
 return <div className="s-empty">{art&&<Turbine/>}<b>{title}</b>{children&&<p>{children}</p>}{action}</div>;
}
export function Turbine(){
 return <svg className="s-turbine" viewBox="0 0 64 80" aria-hidden="true"><path d="M31 30h2l2 48h-6z" fill="currentColor"/><g className="s-turbine-rotor"><path d="M32 30 30 4c0-2 4-2 4 0z" fill="currentColor"/><path d="M32 30 30 4c0-2 4-2 4 0z" fill="currentColor" transform="rotate(120 32 30)"/><path d="M32 30 30 4c0-2 4-2 4 0z" fill="currentColor" transform="rotate(240 32 30)"/></g><circle cx="32" cy="30" r="3.5" fill="#00A6DE"/></svg>;
}
// Uitleg achter een ⓘ-knop.
export function Info({children,label='Uitleg'}:{children:ReactNode;label?:string}){
 const [open,setOpen]=useState(false),id=useId();
 return <span className="s-info"><button type="button" aria-expanded={open} aria-controls={id} aria-label={label} onClick={()=>setOpen(o=>!o)}><InfoIcon size={15}/></button>{open&&<span id={id} className="s-info-pop" role="note">{children}<button type="button" aria-label="Sluiten" onClick={()=>setOpen(false)}><X size={14}/></button></span>}</span>;
}
export function Details({summary,meta,children,open,className}:{summary:ReactNode;meta?:ReactNode;children:ReactNode;open?:boolean;className?:string}){
 return <details className={cx('s-details',className)} open={open}><summary><span>{summary}</span>{meta&&<small>{meta}</small>}<ChevronDown size={16} aria-hidden="true"/></summary><div className="s-details-body">{children}</div></details>;
}
