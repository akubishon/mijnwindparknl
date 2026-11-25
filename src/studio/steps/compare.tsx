// Stap 6: Vergelijken. De bestaande Vergelijken-weergave van mijnwindpark.nl in projectmodus, met dezelfde omlijsting als de andere stappen.
import {CompareTab} from '../../electrolyser-hub';
import {autoResolve} from '../../electrolyser-setup.mjs';
import {YEARS} from '../supply.mjs';
import {studioWindText} from '../project.mjs';
import {canComputeSupply} from '../status.mjs';
import {StepHead,Card,Loading,Progress,Empty,Notice} from '../ui/kit';
import type {Supply} from './supply';

export function CompareStep({project,set,supply,resolved,byId,general,calc,catalogue,target,limit,onStep}:{project:any;set:(f:(p:any)=>any)=>void;supply:Supply;resolved:any[];byId:Map<string,any>;general:any;calc:any;catalogue:any;target:number;limit:any;onStep:(i:number)=>void}){
 return <>
  <StepHead n={6} title="Vergelijken">Alle varianten draaien op hetzelfde aanbod uit de gekozen windparken en KNMI-stations (windjaar {YEARS.join(', ')}), met dezelfde aannames. Waterstof, benutting, starts, LCOH, meerprijs en robuustheid.</StepHead>
  {supply.result?<div className="s-compare"><CompareTab setups={project.varianten} resolved={resolved} byId={byId} general={general}
    setGeneral={(f:any)=>set(p=>{const next=f({...p.algemeen,years:p.jaren});return {...p,jaren:next.years||p.jaren,algemeen:{...next,wind:undefined}};})}
    reference={Math.min(project.referentie,Math.max(0,resolved.filter((r:any)=>r.ready).length-1))} setReference={(i:number)=>set(p=>({...p,referentie:i}))}
    calc={calc} catalogue={catalogue} target={target} setTarget={(n:number)=>set(p=>({...p,algemeen:{...p.algemeen,doel_mw:n}}))}
    update={(id:string,change:(s:any)=>any)=>set(p=>({...p,varianten:p.varianten.map((s:any)=>s.id===id?change(s):s)}))} go={()=>onStep(1)} setActive={()=>{}}
    limit={limit} setLimit={(l:any)=>set(p=>({...p,algemeen:{...p.algemeen,limiet:l}}))}
    fillOpen={()=>set(p=>({...p,varianten:p.varianten.map((s:any)=>{const m=byId.get(s.modelId);return m?autoResolve(m,s,general,{target,limit}).setup:s;})}))}
    studio={{lead:'Alle varianten draaien op hetzelfde aanbod uit de gekozen windparken en KNMI-stations (windjaar 2025), met dezelfde aannames.',wind:studioWindText(project),years:YEARS}}/></div>
  :supply.busy?<Card className="s-pad"><Loading>Eerst het aanbod: {supply.stage}{supply.stage==='Winddata laden'?` (${supply.done} van ${supply.total})`:'…'}</Loading><Progress value={supply.done} max={supply.total||1} label="Voortgang"/></Card>
  :supply.error?<Notice kind="fout" title="Het aanbod kon niet worden berekend." action={<button type="button" className="s-btn s-btn-ghost" onClick={()=>void supply.run()}>Opnieuw proberen</button>}>{supply.error}</Notice>
  :<Card className="s-pad"><Empty title="Eerst het beschikbare vermogen" action={<button type="button" className="s-btn s-btn-cta" disabled={!canComputeSupply(project)} onClick={()=>{onStep(4);void supply.run();}}>Bereken aanbod</button>}>Vergelijken rekent met het aanbod uit stap 5. {canComputeSupply(project)?'':'Kies eerst parken met vermogen en voor elk park een KNMI-station.'}</Empty></Card>}
 </>;
}
