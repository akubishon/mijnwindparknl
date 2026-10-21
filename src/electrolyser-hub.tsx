import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {SiteHeader,SiteNavigation} from './site-navigation';
import Electrolyser from './electrolyser';
import {catalogueModels,missingEndpointFields,DISABLED_MANUFACTURERS,NM3_PER_KG} from './electrolyser-catalogue.mjs';
import {resolveSetup,generalValues,defaultGeneral,newSetup,fillToTarget,RESULT_ROWS,PERCENT_KEYS,differences,capacityWarnings,comparisonCSV,fieldMeta,GENERAL_KEYS,WIND_YEARS,WIND_SERIES,MAX_SETUPS,MAX_MODULES,DEFAULT_TARGET_MW,MODEL_KEYS,jobFor} from './electrolyser-setup.mjs';
import {assemble} from './electrolyser-run.mjs';
import {STRATEGIES,TECHNOLOGIES,SUPPLY_EDGES,KERNEL_VERSION} from './electrolyser-kernel.mjs';

type Tab='vermogen'|'catalogus'|'samenstellen'|'vergelijken';
type Choices={power?:number;powerNote?:string;boundary?:'systeem'|'stack';energy?:number;energyNote?:string;energySource?:'tech';minimum?:number;minimumNote?:string;minimumSource?:'tech';profile?:string;bopConfirmed?:boolean;usePartLoad?:boolean;values?:Record<string,number>};
type Setup={id:string;modelId:string;modules:number;choices:Choices};
type General={strategy:string;years:number[];values:Record<string,number>};
type Field={key:string;label:string;value:any;unit:string;status:string;aanname?:boolean;rule?:string;raw?:string;candidates?:number[];scale?:number;basis?:string;fit?:{rms:number}};
type Resolved={ready:boolean;needsBoP?:boolean;problems:string[];fields:Field[];modules:number;moduleMW:number|null;boundary?:string;bopFactor?:number|null;nominalMW?:number|null;intakeMW?:number|null;platformLimitMW?:number|null;counts?:{bron:number;aanname:number;open:number};nominalEnergy?:number|null;aannames?:Record<string,number>};
type Value={status:string;value?:number;raw:string;rule?:string;reason?:string;candidates?:number[];basis?:string;aanname?:boolean};
type Model={id:string;name:string;manufacturer:string;technology:string;power:Value&{platformLimitMW?:number};systemEnergy:Value;stackEnergy:Value;minimum:Value;boundary:{value:string;status:string;rule:string;aanname?:boolean};acdc:{value:string|null;status:string;rule:string};delivery:{kind:string|null;label:string;status:string;raw:string;note?:string};stacks:{raw:string;status:string};partload?:{raw:string;usable:boolean;unit?:string;bands:{van:number;tot:number;waarde:number;kWhPerKg:number}[]};production:string;hotStart:string;coldStart:string;source:string;url:string;profile:{key:string|null}};
type Catalogue={schemaVersion:number;revision:string;sourceUpdatedAt?:string|null;additionsVersion?:string|null;models:any[]};
type Metrics=Record<string,any>;
type Assembled={years:number[];keys:string[];perYear:Metrics[];mean:Metrics;dropped:number};

const TABS:[Tab,string,string][]=[['vermogen','Beschikbaar vermogen','/elektrolyser'],['catalogus','Catalogus','/elektrolyser/catalogus'],['samenstellen','Samenstellen','/elektrolyser/samenstellen'],['vergelijken','Vergelijken','/elektrolyser/vergelijken']];
const tabFromPath=(path:string):Tab=>(TABS.find(t=>t[2]===path.replace(/\/$/,''))?.[0])||'vermogen';
const LETTERS='ABCD';
const COLORS=['#0C2340','#00A6DE','#9A5B13','#4E7A3A'],DASHES=['','6 4','2 3','10 3 2 3'];
const fmt=(n:number|null|undefined,d=1)=>typeof n==='number'&&Number.isFinite(n)?new Intl.NumberFormat('nl-NL',{maximumFractionDigits:d,minimumFractionDigits:0}).format(n):'—';
const signed=(n:number,d=1)=>(n>0?'+':n<0?'−':'±')+fmt(Math.abs(n),d);
const STATUS_CLASS:Record<string,string>={'bron':'bron','afgeleid':'afgeleid','standaard technologie':'standaard','eigen invoer':'eigen','open':'open','ontbreekt':'ontbreekt','niet-in-endpoint':'endpoint'};
function load<T>(key:string,fallback:T,valid:(v:any)=>boolean):T{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v!==null&&valid(v)?v:fallback;}catch{return fallback;}}
function save(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* storage blocked: settings stay in memory */}}
const validSetups=(v:any)=>Array.isArray(v)&&v.length<=MAX_SETUPS&&v.every(s=>s&&typeof s.id==='string'&&typeof s.modelId==='string'&&Number.isInteger(s.modules)&&s.choices&&typeof s.choices==='object');
const validGeneral=(v:any)=>v&&typeof v.strategy==='string'&&Array.isArray(v.years)&&v.values&&typeof v.values==='object';
const makeId=()=>Math.random().toString(36).slice(2,10);
const inputText=(v:number|null|undefined)=>typeof v==='number'&&Number.isFinite(v)?String(Math.round(v*1e6)/1e6).replace('.',','):'';
const parse=(t:string)=>t.trim()===''?NaN:Number(t.trim().replace(',','.'));

function StatusChip({field}:{field:{status:string;aanname?:boolean;value?:any}}){
 const status=field.value===null?'open':field.status,label=status==='afgeleid'&&field.aanname?'afgeleid · aanname':status==='niet-in-endpoint'?'niet in endpoint':status;
 return <span className={'status-chip status-'+(STATUS_CLASS[status]||'open')+(field.aanname&&status==='afgeleid'?' status-aanname':'')}>{label}</span>;
}
function NumberInput({value,scale=1,onCommit,label,disabled}:{value:number|null|undefined;scale?:number;onCommit:(v:number|null)=>void;label:string;disabled?:boolean}){
 const [text,setText]=useState(inputText(value==null?null:value*scale));
 useEffect(()=>setText(inputText(value==null?null:value*scale)),[value,scale]);
 const commit=()=>{const n=parse(text);if(text.trim()===''){onCommit(null);return;}if(Number.isFinite(n))onCommit(n/scale);else setText(inputText(value==null?null:value*scale));};
 return <input type="text" inputMode="decimal" aria-label={label} value={text} disabled={disabled} onChange={e=>setText(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();}}}/>;
}
function SubTabs({current,go}:{current:Tab;go:(t:Tab)=>void}){
 return <nav className="electrolyser-tabs" aria-label="Elektrolyser">{TABS.map(([key,label,href])=><a key={key} href={href} aria-current={current===key?'page':undefined} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;e.preventDefault();go(key);}}>{label}</a>)}</nav>;
}
function Shell({tab,go,children}:{tab:Tab;go:(t:Tab)=>void;children:ReactNode}){
 return <div className="shell electrolyser-shell"><SiteHeader/><main id="inhoud"><SiteNavigation current="/elektrolyser"/><SubTabs current={tab} go={go}/>{children}<footer>Waterstofatlas · rekenkern /opsplitsing · Europe/Amsterdam</footer></main></div>;
}

// Worker-backed calculation with progress and a cache per input hash.
function useCalculator(){
 const worker=useRef<Worker|null>(null),cache=useRef(new Map<string,any>()),serial=useRef(0);
 const [state,setState]=useState({running:false,done:0,total:0,fromCache:0,error:'',version:0,label:''});
 const run=useCallback((jobs:any[])=>{
  const missing=jobs.filter(j=>!cache.current.has(j.key));
  if(!missing.length){setState(s=>({...s,running:false,done:jobs.length,total:jobs.length,fromCache:jobs.length,error:'',version:s.version+1}));return;}
  const id=++serial.current;
  try{worker.current||=new Worker('/assets/elektrolyser-rekenkern.js');}catch{setState(s=>({...s,running:false,error:'Het rekenmodel kon niet starten in deze browser.'}));return;}
  setState(s=>({...s,running:true,done:0,total:missing.length,fromCache:jobs.length-missing.length,error:'',label:''}));
  worker.current.onmessage=({data})=>{
   if(data.id!==serial.current)return;
   if(data.type==='progress')setState(s=>({...s,done:data.done,label:data.label||''}));
   else if(data.type==='done'){for(const [k,v] of Object.entries(data.results))cache.current.set(k,v);setState(s=>({...s,running:false,done:s.total,version:s.version+1}));}
   else setState(s=>({...s,running:false,error:data.error||'De berekening is mislukt.'}));
  };
  worker.current.onerror=()=>{worker.current=null;setState(s=>({...s,running:false,error:'Het rekenmodel kon niet worden geladen. Controleer de verbinding en probeer opnieuw.'}));};
  worker.current.postMessage({id,jobs:missing});
 },[]);
 return {state,cache:cache.current,run};
}

export default function ElectrolyserApp(){
 const [tab,setTab]=useState<Tab>(()=>tabFromPath(location.pathname));
 useEffect(()=>{const pop=()=>setTab(tabFromPath(location.pathname));addEventListener('popstate',pop);return()=>removeEventListener('popstate',pop);},[]);
 const go=useCallback((next:Tab)=>{const href=TABS.find(t=>t[0]===next)![2];if(location.pathname!==href)history.pushState(null,'',href);setTab(next);window.scrollTo({top:0});},[]);
 const [catalogue,setCatalogue]=useState<{data:Catalogue|null;loading:boolean;error:string}>({data:null,loading:false,error:''});
 const [setups,setSetups]=useState<Setup[]>(()=>load('elektrolyser-opstellingen-v1',[newSetup(makeId()),newSetup(makeId())],validSetups));
 const [active,setActive]=useState(()=>setups[0]?.id||'');
 const [general,setGeneral]=useState<General>(()=>load('elektrolyser-algemeen-v1',defaultGeneral(),validGeneral));
 const [target,setTarget]=useState<number>(()=>load('elektrolyser-doelvermogen-v1',DEFAULT_TARGET_MW,v=>typeof v==='number'&&v>0&&v<=100000));
 const [reference,setReference]=useState(0);
 useEffect(()=>save('elektrolyser-opstellingen-v1',setups),[setups]);
 useEffect(()=>save('elektrolyser-algemeen-v1',general),[general]);
 useEffect(()=>save('elektrolyser-doelvermogen-v1',target),[target]);
 const loadCatalogue=useCallback(async()=>{
  setCatalogue(c=>({...c,loading:true,error:''}));
  try{const r=await fetch('/api/atlas/catalogue');const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Waterstofatlas kon niet worden geladen. Probeer opnieuw.');setCatalogue({data:d,loading:false,error:''});}
  catch(e){setCatalogue(c=>({...c,loading:false,error:e instanceof Error?e.message:'Koppeling niet beschikbaar.'}));}
 },[]);
 useEffect(()=>{if(tab!=='vermogen'&&!catalogue.data&&!catalogue.loading&&!catalogue.error)void loadCatalogue();},[tab,catalogue,loadCatalogue]);
 const interpreted=useMemo(()=>catalogueModels(catalogue.data) as {models:Model[];excluded:Model[];other:Model[]},[catalogue.data]);
 const byId=useMemo(()=>new Map(interpreted.models.map(m=>[m.id,m])),[interpreted]);
 const resolved=useMemo(()=>setups.map(s=>resolveSetup(byId.get(s.modelId),s,general) as Resolved),[setups,byId,general]);
 const calc=useCalculator();
 const update=(id:string,change:(s:Setup)=>Setup)=>setSetups(list=>list.map(s=>s.id===id?change(s):s));
 const choose=(modelId:string)=>{
  const model=byId.get(modelId),fill=model?.power.value?fillToTarget(model.power.value,target):null,modules=fill?.modules||1;
  const id=setups.find(s=>!s.modelId)?.id??(setups.length<MAX_SETUPS?makeId():active);
  setSetups(l=>l.some(s=>s.id===id)?l.map(s=>s.id===id?newSetup(id,modelId,modules):s):[...l,newSetup(id,modelId,modules)]);
  setActive(id);go('samenstellen');
 };
 if(tab==='vermogen')return <Electrolyser subnav={<SubTabs current={tab} go={go}/>}/>;
 const catalogueState=<>{catalogue.loading&&<p role="status" className="wind-note">Waterstofatlas-catalogus laden…</p>}{catalogue.error&&<div className="live-error" role="alert"><p>{catalogue.error}</p><button type="button" className="download" onClick={()=>void loadCatalogue()}>Opnieuw proberen</button></div>}</>;
 return <Shell tab={tab} go={go}>{catalogueState}
  {tab==='catalogus'&&<CatalogueTab catalogue={catalogue.data} interpreted={interpreted} onChoose={choose} onReload={()=>void loadCatalogue()} loading={catalogue.loading}/>}
  {tab==='samenstellen'&&<ComposeTab setups={setups} setSetups={setSetups} active={active} setActive={setActive} resolved={resolved} byId={byId} models={interpreted.models} update={update} target={target} setTarget={setTarget} go={go} general={general}/>}
  {tab==='vergelijken'&&<CompareTab setups={setups} resolved={resolved} byId={byId} general={general} setGeneral={setGeneral} reference={reference} setReference={setReference} calc={calc} catalogue={catalogue.data} target={target} setTarget={setTarget} update={update} go={go} setActive={setActive}/>}
 </Shell>;
}

// ---------------------------------------------------------------- Catalogus

function ValueRow({label,value,unit,field,extra}:{label:string;value:ReactNode;unit?:string;field:{status:string;aanname?:boolean;value?:any};extra?:ReactNode}){
 return <div className="catalogue-row"><dt>{label}</dt><dd><span className="catalogue-value">{value}{unit&&value!=='—'?' '+unit:''}</span> <StatusChip field={field}/>{extra}</dd></div>;
}
function CatalogueTab({catalogue,interpreted,onChoose,onReload,loading}:{catalogue:Catalogue|null;interpreted:{models:Model[];excluded:Model[];other:Model[]};onChoose:(id:string)=>void;onReload:()=>void;loading:boolean}){
 const [manufacturer,setManufacturer]=useState(''),[technology,setTechnology]=useState(''),[query,setQuery]=useState('');
 const models=interpreted.models;
 const manufacturers=[...new Set(models.map(m=>m.manufacturer))].sort((a,b)=>a.localeCompare(b,'nl'));
 const technologies=[...new Set(models.map(m=>m.technology))].sort((a,b)=>a.localeCompare(b,'nl'));
 const q=query.trim().toLocaleLowerCase('nl');
 const shown=models.filter(m=>(!manufacturer||m.manufacturer===manufacturer)&&(!technology||m.technology===technology)&&(!q||(m.name+' '+m.manufacturer+' '+m.technology).toLocaleLowerCase('nl').includes(q)));
 const missing=catalogue?missingEndpointFields(catalogue.models):[];
 const v=(x:Value,unit:string,scale=1)=>x.value!==undefined?fmt(x.value*scale,3):x.candidates?.length?x.candidates.map(c=>fmt(c,3)).join(' / ')+' ?':'—';
 return <section className="production-panel electrolyser-panel" aria-labelledby="catalogue-title">
  <div className="panel-heading"><div><span className="eyebrow">WATERSTOFATLAS</span><h2 id="catalogue-title">Catalogus</h2></div><button type="button" className="download" disabled={loading} onClick={onReload}>Catalogus vernieuwen</button></div>
  {catalogue&&<p className="wind-note">{models.length} elektrolysers · catalogusversie {catalogue.revision}{catalogue.sourceUpdatedAt?` · bron bijgewerkt ${new Date(catalogue.sourceUpdatedAt).toLocaleDateString('nl-NL')}`:''}{catalogue.additionsVersion?` · aanvullingen ${catalogue.additionsVersion}`:''}. Net als in de Atlas tellen {DISABLED_MANUFACTURERS.slice(0,-1).join(', ')} en {DISABLED_MANUFACTURERS.at(-1)} niet mee{interpreted.excluded.length?` (${interpreted.excluded.length} modellen)`:''}{interpreted.other.length?`; ${interpreted.other.length} voedingen zonder stack staan er niet bij`:''}.</p>}
  <StatusLegend/>
  {missing.length>0&&<details className="research-explainer endpoint-note"><summary>Niet in de catalogus-endpoint: {missing.map(m=>m.label).join(', ')}</summary><p>Deze velden levert <code>/api/integrations/mijnwindpark/catalogue</code> nog niet. Ze worden niet op een andere manier uit de Atlas-website gelezen. Dit is een benodigde uitbreiding van de Atlas-endpoint, buiten deze website.</p></details>}
  <div className="model-grid catalogue-filters"><label>Fabrikant<select value={manufacturer} onChange={e=>setManufacturer(e.target.value)}><option value="">Alle fabrikanten</option>{manufacturers.map(m=><option key={m}>{m}</option>)}</select></label><label>Technologie<select value={technology} onChange={e=>setTechnology(e.target.value)}><option value="">Alle technologieën</option>{technologies.map(t=><option key={t}>{t}</option>)}</select></label><label>Zoeken<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Model of fabrikant"/></label></div>
  <p className="wind-note" role="status">{shown.length} van {models.length} modellen.</p>
  <ul className="catalogue-list">{shown.map(m=><li key={m.id} className="catalogue-card"><div className="catalogue-card-head"><h3>{m.name}</h3><p>{m.manufacturer} · {m.technology}</p></div>
   <dl>
    <ValueRow label="Modulevermogen" value={v(m.power,'MW')} unit="MW" field={m.power} extra={<small>{m.boundary.value==='stack'?'stack':'systeem'}{m.boundary.aanname?' (aanname)':''}</small>}/>
    <ValueRow label="Systeemverbruik" value={v(m.systemEnergy,'kWh/kg')} unit="kWh/kg" field={m.systemEnergy}/>
    <ValueRow label="Stackverbruik" value={v(m.stackEnergy,'kWh/kg')} unit="kWh/kg" field={m.stackEnergy}/>
    <ValueRow label="Minimumlast" value={m.minimum.value!==undefined?fmt(m.minimum.value*100,2):m.minimum.candidates?.length?m.minimum.candidates.map(c=>fmt(c,2)).join(' / ')+' ?':'—'} unit="%" field={m.minimum} extra={m.minimum.basis&&m.minimum.basis!=='elektrisch'?<small>basis: {m.minimum.basis}</small>:null}/>
    <ValueRow label="Leveringstype" value={m.delivery.status==='niet-in-endpoint'?'—':m.delivery.label} field={m.delivery}/>
   </dl>
   <details className="catalogue-raw"><summary>Brontekst en bron</summary><p><strong>Vermogen:</strong> {m.power.raw||'Niet vermeld'}</p><p><strong>Systeemverbruik:</strong> {m.systemEnergy.raw||'Niet vermeld'}</p><p><strong>Stackverbruik:</strong> {m.stackEnergy.raw||'Niet vermeld'}</p><p><strong>Minimumlast:</strong> {m.minimum.raw||'Niet vermeld'}</p>{m.power.reason&&<p>Vermogen: {m.power.reason}</p>}{m.power.rule&&<p>Vermogen: {m.power.rule}</p>}{m.minimum.reason&&<p>Minimumlast: {m.minimum.reason}</p>}{m.minimum.rule&&<p>Minimumlast: {m.minimum.rule}</p>}<p><strong>Bron:</strong> {m.source||'Niet vermeld'}</p></details>
   <div className="catalogue-actions"><button type="button" className="primary-button" onClick={()=>onChoose(m.id)}>Samenstellen</button><a className="download" href={m.url} target="_blank" rel="noopener noreferrer">Waterstofatlas ↗</a></div>
  </li>)}</ul>
 </section>;
}
function StatusLegend(){
 return <details className="status-legend"><summary>Wat betekenen de labels?</summary><ul>
  <li><StatusChip field={{status:'bron'}}/> letterlijk uit de datasheet, via de Waterstofatlas.</li>
  <li><StatusChip field={{status:'afgeleid'}}/> volgens een vaste regel; de regel staat erbij. Met “aanname” rust de regel op een aanname.</li>
  <li><StatusChip field={{status:'standaard technologie'}}/> uit <code>TECHNOLOGIES</code> in opsplitsing.py, met de bron.</li>
  <li><StatusChip field={{status:'eigen invoer'}}/> door jou ingevuld of gekozen.</li>
  <li><StatusChip field={{status:'open'}}/> staat in de bron, maar niet eenduidig (bereik, grens, waterstofbasis). Wordt nooit stilzwijgend één getal.</li>
  <li><StatusChip field={{status:'ontbreekt'}}/> niet in de catalogus. <StatusChip field={{status:'niet-in-endpoint'}}/> veld zit nog niet in de catalogus-endpoint.</li>
 </ul></details>;
}

// ---------------------------------------------------------------- Samenstellen

type UpdateFn=(id:string,change:(s:Setup)=>Setup)=>void;
function ComposeTab({setups,setSetups,active,setActive,resolved,byId,models,update,target,setTarget,go,general}:{setups:Setup[];setSetups:(f:(l:Setup[])=>Setup[])=>void;active:string;setActive:(id:string)=>void;resolved:Resolved[];byId:Map<string,Model>;models:Model[];update:UpdateFn;target:number;setTarget:(n:number)=>void;go:(t:Tab)=>void;general:General}){
 const index=Math.max(0,setups.findIndex(s=>s.id===active)),setup=setups[index],r=resolved[index],model=setup?byId.get(setup.modelId):undefined;
 const choices=setup?.choices||{};
 const set=(change:(c:Choices)=>Choices)=>setup&&update(setup.id,s=>({...s,choices:change({...s.choices})}));
 const groups=[...new Set(models.map(m=>m.manufacturer))].sort((a,b)=>a.localeCompare(b,'nl'));
 const fill=r?.moduleMW?fillToTarget(r.moduleMW,target):null;
 const add=()=>{const id=makeId();setSetups(l=>[...l,newSetup(id)]);setActive(id);};
 const remove=()=>{if(setups.length<=1)return;setSetups(l=>l.filter(s=>s.id!==setup.id));setActive(setups[index===0?1:0].id);};
 return <section className="production-panel electrolyser-panel" aria-labelledby="compose-title">
  <div className="panel-heading"><div><span className="eyebrow">OPSTELLING = ÉÉN MODEL × EEN GEHEEL AANTAL MODULES</span><h2 id="compose-title">Samenstellen</h2></div></div>
  <p className="wind-note">Een module is de kleinste eenheid die zelfstandig aan en uit kan, met een eigen minimumlast. Een systeem met meerdere stacks telt als één module.</p>
  <div className="setup-picker" role="tablist" aria-label="Opstellingen">{setups.map((s,i)=><button key={s.id} type="button" role="tab" aria-selected={s.id===setup?.id} onClick={()=>setActive(s.id)}><strong>Opstelling {LETTERS[i]}</strong><span>{byId.get(s.modelId)?.name||'Nog geen model'}{resolved[i]?.nominalMW?` · ${s.modules} × ${fmt(resolved[i].moduleMW,3)} MW`:''}</span><span className={'status-chip '+(resolved[i]?.ready?'status-ready':'status-open')}>{resolved[i]?.ready?'klaar om te rekenen':'nog open'}</span></button>)}{setups.length<MAX_SETUPS&&<button type="button" className="setup-add" onClick={add}>+ Opstelling toevoegen</button>}</div>
  {setup&&<div className="setup-editor">
   <div className="model-grid setup-basics">
    <label>Model uit de Waterstofatlas<select value={setup.modelId} onChange={e=>{const m=byId.get(e.target.value);const f=m?.power.value?fillToTarget(m.power.value,target):null;update(setup.id,s=>({...newSetup(s.id,e.target.value,f?.modules||s.modules)}));}}><option value="">Kies een elektrolyser</option>{groups.map(g=><optgroup key={g} label={g}>{models.filter(m=>m.manufacturer===g).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>)}</select></label>
    <label>Aantal modules<span className="stepper"><button type="button" aria-label="Eén module minder" disabled={setup.modules<=1} onClick={()=>update(setup.id,s=>({...s,modules:Math.max(1,s.modules-1)}))}>−</button><input type="number" min="1" max={MAX_MODULES} step="1" value={setup.modules} onChange={e=>{const n=Math.round(Number(e.target.value));if(Number.isFinite(n))update(setup.id,s=>({...s,modules:Math.min(MAX_MODULES,Math.max(1,n))}));}}/><button type="button" aria-label="Eén module meer" disabled={setup.modules>=MAX_MODULES} onClick={()=>update(setup.id,s=>({...s,modules:Math.min(MAX_MODULES,s.modules+1)}))}>+</button></span></label>
    <label>Doelvermogen (MW)<NumberInput label="Doelvermogen in MW" value={target} onCommit={v=>{if(v!==null&&v>0&&v<=100000)setTarget(v);}}/></label>
   </div>
   <div className="model-actions"><button type="button" className="download" disabled={!fill} onClick={()=>fill&&update(setup.id,s=>({...s,modules:fill.modules}))}>Vul aan tot doelvermogen</button>{fill&&!fill.exact&&<span className="wind-note">{fill.modules} × {fmt(r.moduleMW,3)} = {fmt(fill.modules*(r.moduleMW||0),3)} MW{fill.below?`; met ${fill.below} modules is het ${fmt(fill.below*(r.moduleMW||0),3)} MW`:''}.</span>}{setups.length>1&&<button type="button" className="text-button" onClick={remove}>Opstelling {LETTERS[index]} verwijderen</button>}</div>
   {model&&r&&<>
    <div className="setup-summary"><div><span>Totaal nominaal vermogen</span><strong>{fmt(r.nominalMW,3)} <small>MW</small></strong><p>{setup.modules} × {fmt(r.moduleMW,3)} MW · {r.boundary==='stack'?'stackvermogen':'systeemvermogen incl. BoP'}</p></div><div><span>Opname bij vollast incl. BoP</span><strong>{fmt(r.intakeMW,3)} <small>MW</small></strong><p>{!r.bopFactor?'Volgt na de BoP-aanname.':r.boundary==='stack'?`Stack × (1 + BoP-vast + BoP-variabel) = × ${fmt(r.bopFactor,3)}`:'Gelijk aan het systeemvermogen.'}</p></div><div><span>Rekenwaarden</span><strong>{r.counts?.bron??0} <small>bron</small> · {r.counts?.aanname??0} <small>aanname</small></strong><p>{r.counts?.open?`${r.counts.open} nog open`:`Rust op ${r.counts?.bron} bronwaarden en ${r.counts?.aanname} aannames.`}</p></div></div>
    {r.platformLimitMW&&<p className="wind-note">Atlas-regel: maximaal {fmt(r.platformLimitMW)} MW per platform; meerdere platforms zijn mogelijk.</p>}
    {target>0&&r.nominalMW&&Math.abs(r.nominalMW-target)/target>0.05&&<p className="live-error">Het totaalvermogen wijkt {fmt(Math.abs(r.nominalMW-target)/target*100,1)}% af van het doelvermogen van {fmt(target,2)} MW.</p>}
    {r.problems.length>0&&<div className="live-error" role="status"><strong>Nog geen resultaat mogelijk</strong><ul>{r.problems.map(p=><li key={p}>{p}</li>)}</ul></div>}
    <FieldList model={model} resolved={r} choices={choices} set={set}/>
    <details className="model-settings"><summary>Informatie uit de catalogus die niet wordt meegerekend</summary><p><strong>Leveringstype:</strong> {model.delivery.status==='niet-in-endpoint'?'niet in de catalogus-endpoint':`${model.delivery.label} (${model.delivery.raw})`}. <strong>Aantal stacks:</strong> {model.stacks.status==='niet-in-endpoint'?'niet in de catalogus-endpoint':model.stacks.raw||'niet vermeld'}.</p><p><strong>Nominale productie:</strong> {model.production||'niet vermeld'}. <strong>Warme start:</strong> {model.hotStart||'niet vermeld'}. <strong>Koude start:</strong> {model.coldStart||'niet vermeld'}. Opstarttijden zijn in de vergelijking een algemene aanname, gelijk voor alle opstellingen.</p>{model.partload&&<p><strong>Deellastcurve:</strong> {model.partload.raw}{model.partload.usable?` → ${model.partload.bands.map(b=>`${fmt(b.van*100,0)}–${fmt(b.tot*100,0)}%: ${fmt(b.kWhPerKg,1)} kWh/kg`).join('; ')}${model.partload.unit==='Nm3'?` (× ${fmt(NM3_PER_KG,2)} Nm³/kg bij 0 °C en 1,013 bar)`:''}`:''}</p>}<p><strong>Bron:</strong> {model.source||'niet vermeld'} · <a href={model.url} target="_blank" rel="noopener noreferrer">Waterstofatlas ↗</a></p></details>
   </>}
   <div className="model-actions"><button type="button" className="primary-button" onClick={()=>go('vergelijken')}>Naar vergelijken</button><span className="wind-note">{resolved.filter(x=>x.ready).length} van {setups.length} opstellingen klaar om te rekenen · besturing {generalValues(general).strategy}.</span></div>
  </div>}
 </section>;
}

function FieldList({model,resolved,choices,set}:{model:Model;resolved:Resolved;choices:Choices;set:(f:(c:Choices)=>Choices)=>void}){
 const fields=resolved.fields,byKey=Object.fromEntries(fields.map(f=>[f.key,f])) as Record<string,Field>;
 const own=(key:string,v:number|null)=>set(c=>{const values={...(c.values||{})};if(v===null)delete values[key];else values[key]=v;return {...c,values};});
 const reset=(...keys:(keyof Choices)[])=>set(c=>{const next={...c};for(const k of keys)delete next[k];return next;});
 const needsBoP=!!resolved.needsBoP;
 const row=(f:Field,controls:ReactNode)=><li key={f.key} className="field-row"><div className="field-main"><span className="field-label">{f.label}{f.unit?<small> · {f.unit}</small>:null}</span><span className="field-value">{f.value===null?'—':typeof f.value==='number'?fmt(f.value*(f.scale||1),4):f.value}</span><StatusChip field={f}/></div>{(f.rule||f.raw)&&<p className="field-rule">{f.rule}{f.raw&&f.rule!==f.raw&&!f.rule?.includes(f.raw)?<span> Brontekst: “{f.raw}”</span>:null}</p>}{controls&&<div className="field-controls">{controls}</div>}</li>;
 const numeric=(f:Field,commit:(v:number|null)=>void,overridden:boolean,onReset:()=>void,extra?:ReactNode)=><>{extra}<label className="inline-input">Eigen waarde<NumberInput label={`${f.label}, eigen waarde`} value={overridden?f.value:null} scale={f.scale||1} onCommit={commit}/></label>{overridden&&<button type="button" className="text-button" onClick={onReset}>Terug naar {f.key==='modulevermogen'||f.key==='systeemverbruik_vol'||f.key==='minimumlast'?'catalogus':'standaard'}</button>}</>;
 const candidates=(f:Field,apply:(v:number)=>void,label:(v:number)=>string)=>f.value===null&&f.candidates?.length?f.candidates.map(v=><button key={v} type="button" className="download" onClick={()=>apply(v)}>{label(v)}</button>):null;
 const p=byKey.modulevermogen,b=byKey.vermogensgrens,e=byKey.systeemverbruik_vol,m=byKey.minimumlast,g=byKey.deellastvoordeel;
 return <><ul className="field-list">
  {row(byKey.rekenprofiel,<label className="inline-input">Technologiestandaard<select value={choices.profile||''} onChange={ev=>ev.target.value?set(c=>({...c,profile:ev.target.value})):reset('profile')}><option value="">{model.profile.key?`Volgens catalogus (${TECHNOLOGIES[model.profile.key as keyof typeof TECHNOLOGIES].naam})`:'Kies een rekenprofiel'}</option>{Object.entries(TECHNOLOGIES).map(([k,t])=><option key={k} value={k}>{t.naam}</option>)}</select></label>)}
  {row(p,numeric(p,v=>v===null?reset('power','powerNote'):set(c=>({...c,power:v,powerNote:'Eigen invoer.'})),choices.power!==undefined,()=>reset('power','powerNote'),candidates(p,v=>set(c=>({...c,power:v,powerNote:`Gekozen uit de brontekst “${model.power.raw}”.`})),v=>`Gebruik ${fmt(v,3)} MW`)))}
  {row(b,<label className="inline-input">Grens<select value={choices.boundary||''} onChange={ev=>ev.target.value?set(c=>({...c,boundary:ev.target.value as 'systeem'|'stack'})):reset('boundary')}><option value="">Volgens catalogus ({model.boundary.value})</option><option value="systeem">Systeem incl. BoP</option><option value="stack">Alleen stack</option></select></label>)}
  {row(byKey.acdc,null)}
  {row(e,numeric(e,v=>v===null?reset('energy','energyNote'):set(c=>({...c,energy:v,energyNote:'Eigen invoer.',energySource:undefined})),choices.energy!==undefined||choices.energySource==='tech',()=>reset('energy','energyNote','energySource'),<>{candidates(e,v=>set(c=>({...c,energy:v,energyNote:`Gekozen uit de brontekst “${model.systemEnergy.raw||model.stackEnergy.raw}”.`})),v=>`Gebruik ${fmt(v,2)} kWh/kg`)}{e.value===null&&!(needsBoP&&!choices.bopConfirmed&&(model.stackEnergy.status==='bron'||model.stackEnergy.status==='afgeleid'))&&<button type="button" className="download" onClick={()=>set(c=>({...c,energySource:'tech'}))}>Gebruik standaard technologie</button>}</>))}
  {row(m,numeric(m,v=>v===null?reset('minimum','minimumNote'):set(c=>({...c,minimum:v,minimumNote:'Eigen invoer.'})),choices.minimum!==undefined||choices.minimumSource==='tech',()=>reset('minimum','minimumNote','minimumSource'),<>{candidates(m,v=>set(c=>({...c,minimum:v/100,minimumNote:m.basis==='waterstofproductie'?`De bron noemt “${model.minimum.raw}”; ${fmt(v,2)} % gebruikt als percentage van het elektrisch vermogen (aanname).`:`Gekozen uit de brontekst “${model.minimum.raw}”.`})),v=>m.basis==='waterstofproductie'?`Gebruik ${fmt(v,2)} % als elektrisch percentage (aanname)`:`Gebruik ${fmt(v,2)} %`)}{m.value===null&&<button type="button" className="download" onClick={()=>set(c=>({...c,minimumSource:'tech'}))}>Gebruik standaard technologie</button>}</>))}
  {row(g,numeric(g,v=>own('deellastvoordeel',v),choices.values?.deellastvoordeel!==undefined,()=>own('deellastvoordeel',null),model.partload?.usable?<label className="inline-check"><input type="checkbox" checked={choices.usePartLoad!==false} onChange={ev=>set(c=>({...c,usePartLoad:ev.target.checked}))}/> Deellastcurve uit de bron gebruiken</label>:null))}
 </ul>
 <div className={'bop-block'+(needsBoP&&!choices.bopConfirmed?' bop-needed':'')}><h3>Hulpapparatuur (BoP)</h3>{needsBoP?<><p>{model.delivery.kind==='stack'?'Dit is een losse stack: voeding, koeling en andere hulpapparatuur zijn niet inbegrepen.':'Alleen het stackverbruik is bekend. Het systeemverbruik volgt pas met een BoP-aanname.'} Zonder expliciete BoP-aanname rekenen we niet.</p><label className="inline-check"><input type="checkbox" checked={!!choices.bopConfirmed} onChange={ev=>set(c=>({...c,bopConfirmed:ev.target.checked}))}/> Reken met een BoP-aanname (standaard 3 % vast + 7 % variabel, aan te passen)</label></>:<p>Het systeemverbruik in kWh/kg bevat de BoP al. Het windaanbod is bruto; de BoP wordt niet nog eens afgetrokken.</p>}
  <ul className="field-list">{['bop_vast','bop_variabel'].map(k=>row(byKey[k],byKey[k].value===null?null:numeric(byKey[k],v=>own(k,v),choices.values?.[k]!==undefined,()=>own(k,null))))}</ul></div>
 <details className="model-settings"><summary>Overige modelwaarden ({MODEL_KEYS.length}, standaard technologie)</summary><ul className="field-list">{MODEL_KEYS.map(k=>row(byKey[k],numeric(byKey[k],v=>own(k,v),choices.values?.[k]!==undefined,()=>own(k,null))))}</ul></details></>;
}

// ---------------------------------------------------------------- Vergelijken

function CompareTab({setups,resolved,byId,general,setGeneral,reference,setReference,calc,catalogue,target,setTarget,update,go,setActive}:{setups:Setup[];resolved:Resolved[];byId:Map<string,Model>;general:General;setGeneral:(f:(g:General)=>General)=>void;reference:number;setReference:(n:number)=>void;calc:ReturnType<typeof useCalculator>;catalogue:Catalogue|null;target:number;setTarget:(n:number)=>void;update:UpdateFn;go:(t:Tab)=>void;setActive:(id:string)=>void}){
 const g=generalValues(general);
 const ready=setups.map((s,i)=>({setup:s,label:LETTERS[i],resolved:resolved[i],model:byId.get(s.modelId)})).filter(x=>x.resolved.ready&&x.model);
 const ref=Math.min(reference,Math.max(0,ready.length-1));
 const jobs=ready.flatMap(x=>g.years.map(year=>({...jobFor(x.resolved,general,year),label:`Opstelling ${x.label} · ${year}`})));
 const signature=jobs.map(j=>j.key).join(',');
 const results:(Assembled|null)[]=useMemo(()=>ready.map(x=>assemble(x.resolved,general,calc.cache) as Assembled|null),[signature,calc.state.version]);
 const complete=ready.length>=2&&results.every(Boolean);
 // Start once per new input; a newer request replaces a running one in the worker.
 const autoRun=useRef('');
 useEffect(()=>{if(ready.length>=2&&!complete&&autoRun.current!==signature){autoRun.current=signature;calc.run(jobs);}},[signature,complete]);
 const [chosenPeriod,setPeriod]=useState<'mean'|number>('mean');
 const period=chosenPeriod!=='mean'&&!g.years.includes(chosenPeriod)?'mean':chosenPeriod;
 const rows=results.map(r=>r?(period==='mean'?r.mean:r.perYear[r.years.indexOf(period)]||null):null);
 const diffs=complete?differences(rows,ref):[];
 const warnings=capacityWarnings(ready.map(x=>x.resolved),ref);
 const setValue=(key:string,v:number|null)=>setGeneral(x=>{const values={...x.values};if(v===null)delete values[key];else values[key]=v;return {...x,values};});
 function download(){
  const csv=comparisonCSV({catalogue,general,entries:ready.map((x,i)=>({setup:{label:x.label},model:x.model,resolved:x.resolved,result:results[i]}))});
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`elektrolyser-vergelijking-${catalogue?.revision||'catalogus'}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const fillAll=()=>ready.forEach(x=>{const f=x.resolved.moduleMW?fillToTarget(x.resolved.moduleMW,target):null;if(f)update(x.setup.id,s=>({...s,modules:f.modules}));});
 return <section className="production-panel electrolyser-panel" aria-labelledby="compare-title">
  <div className="panel-heading"><div><span className="eyebrow">ZELFDE WIND · ZELFDE ALGEMENE AANNAMES</span><h2 id="compare-title">Vergelijken</h2></div></div>
  <div className="research-explainer"><p><strong>Windaanbod:</strong> {WIND_SERIES}. Meetgaten tellen niet als nul: ze vallen weg en de jaaruitkomst wordt naar 8.760 uur omgerekend, zoals in /opsplitsing. De datadekking staat in de tabel. <strong>Storingen</strong> volgen voor elke opstelling dezelfde vaste trekking per module en windjaar.</p>
   <fieldset className="year-picker"><legend>Windjaren</legend>{WIND_YEARS.map(y=><label key={y} className="inline-check"><input type="checkbox" checked={g.years.includes(y)} onChange={ev=>setGeneral(x=>{const years=ev.target.checked?[...new Set([...g.years,y])].sort():g.years.filter(v=>v!==y);return {...x,years:years.length?years:g.years};})}/> {y}</label>)}</fieldset></div>
  <div className="model-grid compare-controls"><label>Besturing<select value={g.strategy} onChange={e=>setGeneral(x=>({...x,strategy:e.target.value}))}>{Object.keys(STRATEGIES).map(k=><option key={k} value={k}>{k}{k==='verdelen'?' (standaard)':''}</option>)}</select><small>{STRATEGIES[g.strategy as keyof typeof STRATEGIES]} <StatusChip field={{status:g.strategyStatus}}/></small></label>
   <label>Referentieopstelling<select value={ref} onChange={e=>setReference(Number(e.target.value))}>{ready.map((x,i)=><option key={x.setup.id} value={i}>Opstelling {x.label} · {x.model!.name}</option>)}</select><small>Verschillen gelden ten opzichte van deze opstelling.</small></label>
   <label>Toon<select value={String(period)} onChange={e=>setPeriod(e.target.value==='mean'?'mean':Number(e.target.value))}><option value="mean">Gemiddelde {g.years.join(', ')}</option>{g.years.map(y=><option key={y} value={y}>Windjaar {y}</option>)}</select><small>De spreiding tussen jaren is geen betrouwbaarheidsinterval.</small></label></div>
  <details className="model-settings"><summary>Algemene aannames, gelijk voor alle opstellingen</summary><p>Standaard zijn dit de waarden van <code>Aannames()</code> in opsplitsing.py; de meeste zijn plaatshouders. Storingen volgen een vaste trekking per module en windjaar (zaad = jaar × 100 + modulenummer), voor elke opstelling hetzelfde. Meer modules betekent meer, kleinere storingen.</p><ul className="field-list">{g.fields.map((f:any)=><li key={f.key} className="field-row"><div className="field-main"><span className="field-label">{f.label}<small> · {f.unit}</small></span><span className="field-value">{fmt(f.value*f.scale,3)}</span><StatusChip field={f}/></div><p className="field-rule">{f.rule}</p><div className="field-controls"><label className="inline-input">Eigen waarde<NumberInput label={`${f.label}, eigen waarde`} value={general.values[f.key]??null} scale={f.scale} onCommit={v=>setValue(f.key,v)}/></label>{general.values[f.key]!==undefined&&<button type="button" className="text-button" onClick={()=>setValue(f.key,null)}>Terug naar standaard</button>}</div></li>)}</ul></details>
  {ready.length<2?<div className="live-error" role="status"><p>Vergelijken kan met 2 tot 4 opstellingen die klaar zijn om te rekenen. Nu klaar: {ready.length}.</p><ul>{setups.map((s,i)=>resolved[i].ready?null:<li key={s.id}>Opstelling {LETTERS[i]}: {resolved[i].problems[0]||'kies een model'} <button type="button" className="text-button" onClick={()=>{setActive(s.id);go('samenstellen');}}>Aanpassen</button></li>)}</ul></div>:<>
   {setups.some((s,i)=>!resolved[i].ready)&&<p className="wind-note">Niet meegerekend: {setups.map((s,i)=>resolved[i].ready?null:`opstelling ${LETTERS[i]}`).filter(Boolean).join(', ')} (nog niet compleet).</p>}
   {warnings.length>0&&<div className="live-error capacity-warning" role="alert">{warnings.map(w=><p key={w.index}><strong>Opstelling {ready[w.index].label}</strong> {w.kind==='nominaal'?`heeft ${fmt(Math.abs(w.pct)*100,1)}% ${w.pct>0?'meer':'minder'} nominaal vermogen dan referentie ${ready[ref].label}`:`neemt bij vollast ${fmt(Math.abs(w.pct)*100,1)}% ${w.pct>0?'meer':'minder'} op dan referentie ${ready[ref].label}, door een andere vermogensgrens (stack of systeem)`} ({fmt(w.kind==='nominaal'?ready[w.index].resolved.nominalMW:ready[w.index].resolved.intakeMW,2)} tegen {fmt(w.kind==='nominaal'?ready[ref].resolved.nominalMW:ready[ref].resolved.intakeMW,2)} MW). Verschillen in opbrengst komen dan ook door de grootte.</p>)}<div className="model-actions"><label className="inline-input">Doelvermogen (MW)<NumberInput label="Doelvermogen in MW" value={target} onCommit={v=>{if(v!==null&&v>0&&v<=100000)setTarget(v);}}/></label><button type="button" className="download" onClick={fillAll}>Vul alle opstellingen aan tot {fmt(target,2)} MW</button></div></div>}
   <div className="model-actions compare-actions"><button type="button" className="primary-button" disabled={calc.state.running} onClick={()=>calc.run(jobs)}>{calc.state.running?'Rekenen…':complete?'Opnieuw rekenen':'Bereken vergelijking'}</button>{complete&&<button type="button" className="download" onClick={download}>CSV met waarden, statussen en catalogusversie</button>}</div>
   {(calc.state.running||calc.state.error)&&<div className="research-progress" role="status">{calc.state.running&&<><p>{calc.state.done} van {calc.state.total} berekeningen klaar{calc.state.label?` · ${calc.state.label}`:''}{calc.state.fromCache?` · ${calc.state.fromCache} uit de cache`:''}.</p><progress value={calc.state.done} max={calc.state.total||1} aria-label="Berekeningen klaar"/></>}{calc.state.error&&<p className="live-error">{calc.state.error}</p>}</div>}
   {complete&&<><ResultTable ready={ready} rows={rows} diffs={diffs} reference={ref} results={results as Assembled[]}/><YearTable ready={ready} results={results as Assembled[]} reference={ref}/><ClassChart ready={ready} rows={rows} reference={ref}/>
    <p className="wind-note">Dit is een technische vergelijking zonder oordeel over de beste opstelling en zonder financieel advies. Kosten en LCOH staan in <a href="/opsplitsing">Elektrolyser opsplitsen</a>, met dezelfde rekenkern. Rekenkern: {KERNEL_VERSION}.</p></>}
  </>}
 </section>;
}

type ReadyEntry={setup:Setup;label:string;resolved:Resolved;model?:Model};
function ResultTable({ready,rows,diffs,reference,results}:{ready:ReadyEntry[];rows:(Metrics|null)[];diffs:any[];reference:number;results:Assembled[]}){
 return <div className="table-scroll compare-table-scroll"><table className="compare-table"><caption>Uitkomst per opstelling · verschil ten opzichte van opstelling {ready[reference].label}</caption><thead><tr><th scope="col">Uitkomst</th>{ready.map((x,i)=><th key={x.setup.id} scope="col"><span className="setup-swatch" style={{background:COLORS[i]}}/>Opstelling {x.label}{i===reference?' (referentie)':''}<small>{x.model!.name} · {x.resolved.modules} × {fmt(x.resolved.moduleMW,3)} MW</small></th>)}</tr></thead><tbody>
  {(RESULT_ROWS as [string,string,string,number,string][]).map(([label,key,unit,d])=><tr key={key}><th scope="row">{label}{unit?<small> {unit}</small>:null}</th>{rows.map((row,i)=>{const value=row?.[key],pct=PERCENT_KEYS.has(key),diff=diffs[i]?.[key];return <td key={i}>{pct?fmt(value*100,d):fmt(value,d)}{diff&&Math.abs(diff.delta)>1e-9?<small className="diff">{pct?signed(diff.delta*100,d)+' procentpunt':signed(diff.delta,d)+(diff.pct!==null?` (${signed(diff.pct*100,1)}%)`:'')}</small>:diff?<small className="diff">gelijk</small>:null}</td>;})}</tr>)}
  <tr><th scope="row">Rust op</th>{ready.map(x=><td key={x.setup.id}>{x.resolved.counts?.bron} bronwaarden en {x.resolved.counts?.aanname} aannames</td>)}</tr>
  <tr><th scope="row">Uren met data<small> per windjaar</small></th>{results.map((r,i)=><td key={i}>{r.perYear.map(y=>`${y.jaar}: ${fmt(y.dekking_uur,0)} van ${fmt(y.uren_in_jaar,0)}`).join(' · ')}</td>)}</tr>
 </tbody></table></div>;
}
function YearTable({ready,results,reference}:{ready:ReadyEntry[];results:Assembled[];reference:number}){
 const years=results[0].years;
 return <div className="table-scroll compare-table-scroll"><table className="compare-table"><caption>Waterstof per windjaar (kg) · de spreiding tussen jaren is geen betrouwbaarheidsinterval</caption><thead><tr><th scope="col">Windjaar</th>{ready.map(x=><th key={x.setup.id} scope="col">Opstelling {x.label}</th>)}</tr></thead><tbody>{years.map((y,j)=><tr key={y}><th scope="row">{y}</th>{results.map((r,i)=>{const v=r.perYear[j].waterstof_kg,refv=results[reference].perYear[j].waterstof_kg;return <td key={i}>{fmt(v,0)}{i!==reference?<small className="diff">{signed(v-refv,0)}</small>:null}</td>;})}</tr>)}<tr><th scope="row">Gemiddelde</th>{results.map((r,i)=><td key={i}><strong>{fmt(r.mean.waterstof_kg,0)}</strong></td>)}</tr><tr><th scope="row">Laagste–hoogste jaar</th>{results.map((r,i)=><td key={i}>{fmt(Math.min(...r.perYear.map(y=>y.waterstof_kg)),0)}–{fmt(Math.max(...r.perYear.map(y=>y.waterstof_kg)),0)}</td>)}</tr></tbody></table></div>;
}
// One chart: share of the wind supply taken up per supply class, so it is visible where module size matters.
function useWidth<T extends HTMLElement>(){
 const ref=useRef<T|null>(null),[width,setWidth]=useState(640);
 useEffect(()=>{const el=ref.current;if(!el)return;const observer=new ResizeObserver(([entry])=>setWidth(Math.round(entry.contentRect.width)));observer.observe(el);return()=>observer.disconnect();},[]);
 return [ref,width] as const;
}
function ClassChart({ready,rows,reference}:{ready:ReadyEntry[];rows:(Metrics|null)[];reference:number}){
 const classes=rows[0]!.klassen as {van_mw:number;tot_mw:number|null;aanbod_mwh:number;opgenomen_mwh:number}[];
 const [box,width]=useWidth<HTMLDivElement>();
 // Drawn at the real pixel width, so labels keep their size on phones and wide screens.
 const W=Math.max(300,Math.min(960,width)),narrow=W<560,H=narrow?300:320,L=46,R=12,T=16,B=narrow?78:56,step=(W-L-R)/classes.length,x=(i:number)=>L+step*(i+.5),y=(v:number)=>T+(1-v)*(H-T-B);
 const total=classes.reduce((s,c)=>s+c.aanbod_mwh,0);
 const label=(c:{van_mw:number;tot_mw:number|null})=>c.tot_mw===null?`${fmt(c.van_mw)}+`:`${fmt(c.van_mw)}–${fmt(c.tot_mw)}`;
 return <figure className="class-chart"><figcaption><h3>Waar neemt elke opstelling het aanbod op?</h3><p>Per klasse van het windaanbod (MW): het deel van de windenergie in die klasse dat de opstelling opneemt. De lichte balken tonen op dezelfde as welk deel van het jaaraanbod in die klasse valt. Kleine modules beginnen eerder; bij veel wind telt vooral het totaalvermogen.</p></figcaption>
  <div className="combined-legend">{ready.map((x,i)=><span key={x.setup.id}><svg width="26" height="10" aria-hidden="true"><line x1="1" x2="25" y1="5" y2="5" stroke={COLORS[i]} strokeWidth={i===reference?4:2.5} strokeDasharray={DASHES[i]}/></svg>Opstelling {x.label}{i===reference?' (referentie)':''}</span>)}<span><span className="combined-hour-swatch"/>Deel van het jaaraanbod in de klasse</span></div>
  <div className="class-chart-box" ref={box}><svg className="class-chart-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Opgenomen deel van het windaanbod per aanbodklasse, per opstelling"><title>Opgenomen deel van het windaanbod per aanbodklasse</title>
   {[0,.25,.5,.75,1].map(v=><g key={v}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} stroke="#e4e9e3"/><text x={L-8} y={y(v)+4} textAnchor="end" fontSize="11">{fmt(v*100,0)}%</text></g>)}
   {classes.map((c,i)=><rect key={i} x={x(i)-step*.38} width={step*.76} y={y(c.aanbod_mwh/total)} height={(H-T-B)*(c.aanbod_mwh/total)} fill="#C3E4F2"><title>{label(c)} MW: {fmt(c.aanbod_mwh/total*100,1)}% van het jaaraanbod</title></rect>)}
   {ready.map((s,i)=>{const cl=rows[i]!.klassen as typeof classes;const pts=cl.map((c,j)=>c.aanbod_mwh>0?[x(j),y(c.opgenomen_mwh/c.aanbod_mwh)]:null);return <g key={s.setup.id}><polyline points={pts.filter(Boolean).map(p=>p!.join(',')).join(' ')} fill="none" stroke={COLORS[i]} strokeWidth={i===reference?3.5:2.2} strokeDasharray={DASHES[i]}/>{pts.map((p,j)=>p&&<circle key={j} cx={p[0]} cy={p[1]} r={i===reference?4:3} fill={COLORS[i]}><title>Opstelling {s.label}, {label(cl[j])} MW: {fmt(cl[j].opgenomen_mwh/cl[j].aanbod_mwh*100,1)}% opgenomen ({fmt(cl[j].opgenomen_mwh,0)} van {fmt(cl[j].aanbod_mwh,0)} MWh per jaar)</title></circle>)}</g>;})}
   {classes.map((c,i)=>narrow?<text key={i} x={x(i)} y={H-B+12} textAnchor="end" fontSize="11" transform={`rotate(-50 ${x(i)} ${H-B+12})`}>{label(c)}</text>:<text key={i} x={x(i)} y={H-B+18} textAnchor="middle" fontSize="12">{label(c)}</text>)}
   <text x={(L+W-R)/2} y={H-8} textAnchor="middle" fontSize="12">{narrow?'Windaanbod (MW)':`Windaanbod in MW (laatste klasse: ${fmt(SUPPLY_EDGES[SUPPLY_EDGES.length-1])} MW en meer)`}</text>
  </svg></div>
 </figure>;
}
