// Kaartpodium (concept B) voor stap 1 en 4: de kaart vult het scherm, de stap staat in een donker paneel
// (op de telefoon een paneel van onderen), de stappen staan als pillen boven de kaart.
import {useEffect,useState,type ReactNode} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {PillSteps,type Step} from '../ui/StepRail';
import {Eyebrow} from '../ui/kit';
import {nl} from '../lib';

// Kaartmarge zodat wat ertoe doet naast het paneel valt (breed) of erboven (telefoon).
export function useStagePadding(){
 const get=()=>innerWidth<=760?{top:110,left:28,right:28,bottom:Math.round((innerHeight-56)*.6)+16}:{top:84,left:innerWidth<=1100?450:500,right:72,bottom:96};
 const [pad,setPad]=useState(get);
 useEffect(()=>{const on=()=>setPad(get());addEventListener('resize',on);return()=>removeEventListener('resize',on);},[]);
 return pad;
}
export function Stage({steps,active,onStep,title,intro,map,children,next,prev,kpis}:{steps:Step[];active:number;onStep:(i:number)=>void;title:string;intro:ReactNode;map:ReactNode;children:ReactNode;next?:{label:string;disabled?:boolean;onClick:()=>void};prev?:ReactNode;kpis:{allocated:number;stations:number;lets:number}}){
 return <div className="s-stage">
  {map}
  <PillSteps steps={steps} active={active} onStep={onStep}/>
  <section className="s-sheet" aria-labelledby="s-sheet-title">
   <div className="s-grab" aria-hidden="true"/>
   <div className="s-sheet-body">
    <Eyebrow light>Stap {active+1} van 6</Eyebrow>
    <h1 id="s-sheet-title">{title}</h1>
    <p className="s-sheet-intro">{intro}</p>
    {children}
   </div>
   <div className="s-sheet-foot">{prev||(active>0?<button type="button" className="s-btn s-btn-light" onClick={()=>onStep(active-1)}><ChevronLeft size={16}/>{steps[active-1].label}</button>:<span/>)}
    {next&&<button type="button" className="s-btn s-btn-cta" disabled={next.disabled} onClick={next.onClick}>{next.label}<ChevronRight size={16}/></button>}</div>
  </section>
  <aside className="s-floatkpi" aria-label="Kerngetallen"><div><small>Windvermogen</small><b>{nl(kpis.allocated)} MW</b></div><button type="button" className={kpis.lets?'s-floatkpi-let':''} onClick={()=>onStep(steps.findIndex(s=>s.status==='let')>=0?steps.findIndex(s=>s.status==='let'):active)}><small>Let op</small><b>{kpis.lets}</b></button></aside>
 </div>;
}
