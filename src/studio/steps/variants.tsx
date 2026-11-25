// Stap 2: elektrolyser. Varianten naast elkaar (één model × aantal units) en de catalogus van de Waterstofatlas als kaarten.
import {useState} from 'react';
import {Star,Trash2,Plus,Search} from 'lucide-react';
import {DISABLED_MANUFACTURERS} from '../../electrolyser-catalogue.mjs';
import {newSetup,fillToTarget,stackPowerMW,autoResolve,MAX_MODULES} from '../../electrolyser-setup.mjs';
import {MAX_VARIANTS} from '../project.mjs';
import {nl,letter,makeId} from '../lib';
import {Card,Chip,NumberField,RangeSlider,StepHead,Notice,Skeleton,Seg,cx} from '../ui/kit';

const PAGE=12;
export function VariantsStep({project,set,models,byId,catalogue,general,target,limit,resolved}:{project:any;set:(f:(p:any)=>any)=>void;models:any[];byId:Map<string,any>;catalogue:{data:any;error:string};general:any;target:number;limit:any;resolved:any[]}){
 const powers=models.map(m=>m.power?.value).filter((v:any)=>Number.isFinite(v)) as number[];
 const pmin=powers.length?Math.floor(Math.min(...powers)):0,pmax=powers.length?Math.ceil(Math.max(...powers)):10;
 const [tech,setTech]=useState(''),[maker,setMaker]=useState(''),[range,setRange]=useState<[number,number]|null>(null),[more,setMore]=useState(PAGE);
 const [lo,hi]=range||[pmin,pmax];
 const techs=[...new Set(models.map(m=>m.technology).filter(Boolean))].sort() as string[],makers=[...new Set(models.map(m=>m.manufacturer).filter(Boolean))].sort() as string[];
 const shown=models.filter(m=>(!tech||m.technology===tech)&&(!maker||m.manufacturer.toLowerCase().includes(maker.toLowerCase()))&&((m.power?.value??lo)>=lo)&&((m.power?.value??hi)<=hi));
 const moduleMW=(m:any)=>m?.power?.value?stackPowerMW(m.power.value,m.boundary?.value):null;
 const update=(id:string,change:any)=>set(p=>({...p,varianten:p.varianten.map((v:any)=>v.id===id?{...v,...change}:v)}));
 const chooseModel=(v:any,modelId:string)=>{const f=fillToTarget(moduleMW(byId.get(modelId)),target);update(v.id,{modelId,modules:f?.modules||1,choices:{}});};
 const usedBy=(id:string)=>project.varianten.map((v:any,i:number)=>v.modelId===id?letter(i):null).filter(Boolean);
 return <>
  <StepHead n={2} title="Welke elektrolyser?">De hele catalogus van de Waterstofatlas (zonder {DISABLED_MANUFACTURERS.join(', ')}). Een variant is één model × aantal units; geen mix van modellen in één installatie. Je kunt tot {MAX_VARIANTS} varianten naast elkaar zetten.</StepHead>
  {catalogue.error&&<Notice kind="fout" title="De catalogus kon niet worden geladen.">{catalogue.error}</Notice>}
  <div className="s-sectionhead"><h2>Varianten</h2><label className="s-inline">Doelvermogen stack<NumberField value={target} min={0.1} max={100000} step={5} decimals={1} unit="MW" onChange={n=>set(p=>({...p,algemeen:{...p.algemeen,doel_mw:n}}))} label="Doelvermogen stack in MW"/></label></div>
  <div className="s-variants">{project.varianten.map((v:any,i:number)=>{const m=byId.get(v.modelId),r=resolved[i],ref=project.referentie===i;return <article key={v.id} className={cx('s-variant',ref&&'s-variant-ref',!m&&'s-variant-empty')}>
   <header><b>Variant {letter(i)}</b><button type="button" className={cx('s-star',ref&&'on')} aria-pressed={ref} title={ref?'Referentie':'Maak referentie'} aria-label={ref?`Variant ${letter(i)} is de referentie`:`Maak variant ${letter(i)} de referentie`} onClick={()=>set(p=>({...p,referentie:i}))}><Star size={16}/>{ref&&<span>referentie</span>}</button>
    {project.varianten.length>1&&<button type="button" className="s-iconbtn" aria-label={`Variant ${letter(i)} verwijderen`} onClick={()=>set(p=>({...p,varianten:p.varianten.filter((x:any)=>x.id!==v.id),referentie:Math.max(0,Math.min(p.referentie>i?p.referentie-1:p.referentie,p.varianten.length-2))}))}><Trash2 size={16}/></button>}</header>
   {m?<><div className="s-variant-model"><b>{m.name}</b><span>{m.manufacturer} · {m.technology} · {nl(m.power.value,2)} MW per unit</span></div>
    <div className="s-variant-row"><label className="s-inline">Units<NumberField value={v.modules} min={1} max={MAX_MODULES} decimals={0} onChange={n=>update(v.id,{modules:n})} label={`Aantal units van variant ${letter(i)}`}/></label><button type="button" className="s-btn s-btn-ghost s-btn-small" onClick={()=>{const f=fillToTarget(moduleMW(m),target);if(f)update(v.id,{modules:f.modules});}}>Vul aan tot {nl(target,target%1?1:0)} MW</button></div>
    {r.ready?<div className="s-variant-num"><b>{nl(r.nominalMW,1)}<i>MW nominaal</i></b><span>{nl(r.intakeMW,1)} MW opname bij vollast (stack + BoP)</span><Chip tone="dark">klaar</Chip></div>
     :<Notice kind="let" title="Open punten" action={<button type="button" className="s-btn s-btn-ghost s-btn-small" onClick={()=>{const x=autoResolve(m,v,general,{target,limit});set(p=>({...p,varianten:p.varianten.map((y:any)=>y.id===v.id?x.setup:y)}));}}>Vul aan met voorzichtige aannames</button>}><ul>{r.problems.map((p:string)=><li key={p}>{p}</li>)}</ul></Notice>}</>
   :<div className="s-variant-none"><b>Nog geen model</b><span>Kies hieronder een model uit de catalogus en klik op <em>Variant {letter(i)}</em>.</span></div>}
  </article>;})}
   {project.varianten.length<MAX_VARIANTS&&<button type="button" className="s-variant s-variant-add" onClick={()=>set(p=>({...p,varianten:[...p.varianten,newSetup(makeId())]}))}><span><Plus size={20}/></span><b>Variant toevoegen</b><small>Tot {MAX_VARIANTS} varianten naast elkaar</small></button>}
  </div>
  <div className="s-sectionhead"><h2>Catalogus</h2><span className="s-muted">{shown.length} van {models.length} modellen</span></div>
  <Card className="s-pad s-filters">
   <div><small>Technologie</small><Seg label="Technologie" value={tech} onChange={setTech} options={[{value:'',label:'Alle'},...techs.map(t=>({value:t,label:t}))]}/></div>
   <label><small>Fabrikant</small><span className="s-search s-search-small"><Search size={15} aria-hidden="true"/><input type="search" list="s-makers" value={maker} onChange={e=>{setMaker(e.target.value);setMore(PAGE);}} placeholder="Alle fabrikanten" aria-label="Fabrikant"/></span><datalist id="s-makers">{makers.map(m=><option key={m} value={m}/>)}</datalist></label>
   <div className="s-filter-range"><small>Modulevermogen</small>{powers.length>1?<RangeSlider min={pmin} max={pmax} lo={lo} hi={hi} step={0.5} label="Modulevermogen" format={v=>nl(v,v%1?1:0)+' MW'} onChange={(a,b)=>{setRange([a,b]);setMore(PAGE);}}/>:<span className="s-muted">–</span>}</div>
  </Card>
  {!catalogue.data&&!catalogue.error?<div className="s-catalogue">{[0,1,2].map(i=><Card key={i} className="s-pad"><Skeleton lines={4}/></Card>)}</div>
  :<ul className="s-catalogue">{shown.slice(0,more).map(m=>{const used=usedBy(m.id);return <li key={m.id} className={cx('s-model',used.length>0&&'s-model-used')}>
   <div className="s-model-head"><h3>{m.name}</h3><p>{m.manufacturer}</p><Chip>{m.technology}</Chip></div>
   <dl><div><dt>Modulevermogen</dt><dd>{m.power?.value?nl(m.power.value,2)+' MW':'onbekend'}</dd></div><div><dt>Systeemverbruik</dt><dd>{m.systemEnergy?.value?nl(m.systemEnergy.value,1)+' kWh/kg':'onbekend'}</dd></div><div><dt>Minimumlast</dt><dd>{Number.isFinite(m.minimum?.value)?nl(m.minimum.value*100,0)+' %':'onbekend'}</dd></div>{m.production&&<div><dt>Productie</dt><dd>{m.production}</dd></div>}</dl>
   <div className="s-model-pick"><small>{used.length?`Gekozen in ${used.join(', ')}`:'Kies voor'}</small><div>{project.varianten.map((v:any,i:number)=><button key={v.id} type="button" className={cx('s-pick',v.modelId===m.id&&'on')} aria-pressed={v.modelId===m.id} aria-label={`${m.name} kiezen voor variant ${letter(i)}`} onClick={()=>chooseModel(v,m.id)}>{letter(i)}</button>)}</div></div>
  </li>;})}</ul>}
  {shown.length>more&&<button type="button" className="s-btn s-btn-ghost s-btn-wide" onClick={()=>setMore(n=>n+PAGE)}>Meer laden ({shown.length-more} over)</button>}
  {catalogue.data&&!shown.length&&<Notice kind="info">Geen model past bij deze filters.</Notice>}
 </>;
}
