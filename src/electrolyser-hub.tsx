import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {SiteHeader,SiteNavigation} from './site-navigation';
import {formatFixed,formatSigned,shownDifference,sharedDecimals,decimalsFor,energyUnit} from './number-format.mjs';
import {resultRow,parseAtlasImport,setupsFromImport,windResultPayload,windResultLink,autoResolve,comparisonConclusion} from './electrolyser-setup.mjs';
import {catalogueModels,missingEndpointFields,DISABLED_MANUFACTURERS,NM3_PER_KG} from './electrolyser-catalogue.mjs';
import {resolveSetup,generalValues,defaultGeneral,newSetup,fillWithinLimit,stackPowerMW,defaultLimit,validLimit,modelFit,limitFloorMW,RESULT_ROWS,PERCENT_KEYS,differences,capacityWarnings,comparisonCSV,fieldMeta,GENERAL_KEYS,WIND_YEARS,MAX_SETUPS,MAX_MODULES,DEFAULT_TARGET_MW,MODEL_KEYS,jobFor} from './electrolyser-setup.mjs';
import {assemble} from './electrolyser-run.mjs';
import {COST_KEYS,generalCosts,setupCosts,withCosts,robustness,DEFAULT_PRICE_EUR_KW} from './electrolyser-economics.mjs';
import {STRATEGIES,TECHNOLOGIES,SUPPLY_EDGES,KERNEL_VERSION} from './electrolyser-kernel.mjs';
import {WIND_PROFILES,windSeries} from './electrolyser-wind.mjs';

type Tab='catalogus'|'samenstellen'|'vergelijken';
type Choices={power?:number;powerNote?:string;boundary?:'systeem'|'stack';energy?:number;energyNote?:string;energySource?:'tech';minimum?:number;minimumNote?:string;minimumSource?:'tech';profile?:string;bopConfirmed?:boolean;usePartLoad?:boolean;values?:Record<string,number>;cost?:{eurKw?:number;totalMeur?:number;fixedMeur?:number}};
type Setup={id:string;modelId:string;modules:number;choices:Choices};
type General={strategy:string;years:number[];values:Record<string,number>;wind:string};
type Field={key:string;label:string;value:any;unit:string;status:string;aanname?:boolean;rule?:string;raw?:string;candidates?:number[];scale?:number;basis?:string;fit?:{rms:number}};
type Limit={mode:'uit'|'waarschuwen'|'blokkeren';max:number;reach:'volledig'|'onder';tolerance:number};
type Resolved={ready:boolean;needsBoP?:boolean;problems:string[];limit?:{mode:string;ok:boolean;blocks:boolean;problems:string[]};fields:Field[];modules:number;moduleMW:number|null;stackModuleMW?:number|null;boundary?:string;bopFactor?:number|null;nominalMW?:number|null;intakeMW?:number|null;platformLimitMW?:number|null;counts?:{bron:number;aanname:number;open:number};nominalEnergy?:number|null;aannames?:Record<string,number>};
type Value={status:string;value?:number;raw:string;rule?:string;reason?:string;candidates?:number[];basis?:string;aanname?:boolean};
type Model={id:string;name:string;manufacturer:string;technology:string;power:Value&{platformLimitMW?:number};systemEnergy:Value;stackEnergy:Value;minimum:Value;boundary:{value:string;status:string;rule:string;aanname?:boolean};acdc:{value:string|null;status:string;rule:string};delivery:{kind:string|null;label:string;status:string;raw:string;note?:string};stacks:{raw:string;status:string};partload?:{raw:string;usable:boolean;unit?:string;bands:{van:number;tot:number;waarde:number;kWhPerKg:number}[]};production:string;hotStart:string;coldStart:string;source:string;datasheets:string[];url:string;profile:{key:string|null}};
type Catalogue={schemaVersion:number;revision:string;sourceUpdatedAt?:string|null;additionsVersion?:string|null;models:any[]};
type Metrics=Record<string,any>;
type Assembled={years:number[];keys:string[];perYear:Metrics[];mean:Metrics;dropped:number;raw:any[];summary:any};

const TABS:[Tab,string,string][]=[['catalogus','Catalogus','/elektrolyser/catalogus'],['samenstellen','Samenstellen','/elektrolyser/samenstellen'],['vergelijken','Vergelijken','/elektrolyser/vergelijken']];
const tabFromPath=(path:string):Tab=>(TABS.find(t=>t[2]===path.replace(/\/$/,''))?.[0])||'catalogus';
// Setups are named A–Z, then AA, AB, … so a whole shortlist gets its own letters.
const letter=(i:number):string=>(i>=26?letter(Math.floor(i/26)-1):'')+String.fromCharCode(65+i%26);
const TARGET_NOTE='Het doelvermogen is het totale stackvermogen; de BoP komt daar in de berekening bovenop. Met de standaard 10 % BoP neemt 44 MW stack bij vollast 48,4 MW op.';
const PALETTE=['#0C2340','#00A6DE','#9A5B13','#4E7A3A','#B3261E','#6B4C9A'],DASH_STYLES=['','6 4','2 3','10 3 2 3','4 2','8 2 2 2 2 2'];
// Six colours and six dash patterns: the first six setups look as before, the next ones shift the dash, so 36 are distinct.
const color=(i:number)=>PALETTE[i%6],dash=(i:number)=>DASH_STYLES[(i+Math.floor(i/6))%6];
const fmt=(n:number|null|undefined,d=1)=>typeof n==='number'&&Number.isFinite(n)?new Intl.NumberFormat('nl-NL',{maximumFractionDigits:d,minimumFractionDigits:0}).format(n):'—';
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
 return <nav className="electrolyser-tabs" aria-label="Elektrolyser">{TABS.map(([key,label,href],i)=><a key={key} href={href} aria-current={current===key?'page':undefined} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;e.preventDefault();go(key);}}><span className="tab-step" aria-hidden="true">{i+1}</span>{label}</a>)}<a href="/opsplitsing" className="tab-extra">Opsplitsen</a></nav>;
}
function Shell({tab,go,children}:{tab:Tab;go:(t:Tab)=>void;children:ReactNode}){
 return <div className="shell electrolyser-shell"><SiteHeader/><main id="inhoud"><SiteNavigation current="/elektrolyser"/><SubTabs current={tab} go={go}/><p className="wind-note route-hint">Zo kom je tot een keuze: <strong>1</strong> kies modellen (hier of in de <a href="https://waterstofatlas.nl/" target="_blank" rel="noopener">Waterstofatlas ↗</a>), <strong>2</strong> stel opstellingen samen, <strong>3</strong> vergelijk ze op dezelfde wind en lees de conclusie. Opsplitsen is achtergrond: één grote of meerdere kleine modules?</p>{children}<footer>Waterstofatlas · rekenkern /opsplitsing · Europe/Amsterdam</footer></main></div>;
}

// Worker-backed calculation with progress and a cache per input hash. A whole Atlas shortlist is many jobs (one per setup
// and wind year), so they are spread over several workers, one per spare processor core.
const MAX_WORKERS=6;
function useCalculator(){
 const workers=useRef<Worker[]>([]),cache=useRef(new Map<string,any>()),serial=useRef(0);
 const [state,setState]=useState({running:false,done:0,total:0,fromCache:0,error:'',version:0,label:''});
 const run=useCallback((jobs:any[])=>{
  const missing=jobs.filter(j=>!cache.current.has(j.key));
  const id=++serial.current;
  const want=Math.max(1,Math.min(MAX_WORKERS,(navigator.hardwareConcurrency||2)-1,missing.length));
  try{while(workers.current.length<want)workers.current.push(new Worker('/assets/elektrolyser-rekenkern.js'));}
  catch{if(!workers.current.length){setState(s=>({...s,running:false,error:'Het rekenmodel kon niet starten in deze browser.'}));return;}}
  const pool=missing.length?workers.current.slice(0,want):[];
  // Workers left out of this run drop whatever older request they were still working on.
  for(const w of workers.current.slice(pool.length)){w.onmessage=null;w.postMessage({id,jobs:[]});}
  if(!missing.length){setState(s=>({...s,running:false,done:jobs.length,total:jobs.length,fromCache:jobs.length,error:'',version:s.version+1}));return;}
  setState(s=>({...s,running:true,done:0,total:missing.length,fromCache:jobs.length-missing.length,error:'',label:''}));
  const done=pool.map(()=>0);let open=pool.length,failed=false;
  const fail=(error:string)=>{if(failed||id!==serial.current)return;failed=true;setState(s=>({...s,running:false,error}));};
  pool.forEach((worker,w)=>{
   worker.onmessage=({data})=>{
    if(data.id!==serial.current||failed)return;
    if(data.type==='progress'){done[w]=data.done;const sum=done.reduce((a,b)=>a+b,0);setState(s=>({...s,done:sum,label:data.label||''}));}
    else if(data.type==='done'){for(const [k,v] of Object.entries(data.results))cache.current.set(k,v);if(--open===0)setState(s=>({...s,running:false,done:s.total,version:s.version+1}));}
    else fail(data.error||'De berekening is mislukt.');
   };
   worker.onerror=()=>{workers.current=workers.current.filter(x=>x!==worker);fail('Het rekenmodel kon niet worden geladen. Controleer de verbinding en probeer opnieuw.');};
   worker.postMessage({id,jobs:missing.filter((_,i)=>i%pool.length===w)});
  });
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
 const [limit,setLimit]=useState<Limit>(()=>load('elektrolyser-modulelimiet-v1',defaultLimit() as Limit,validLimit));
 const [reference,setReference]=useState(0);
 const [atlasImport,setAtlasImport]=useState(()=>parseAtlasImport(location.search));
 const [importNote,setImportNote]=useState('');
 useEffect(()=>save('elektrolyser-opstellingen-v1',setups),[setups]);
 useEffect(()=>save('elektrolyser-algemeen-v1',general),[general]);
 useEffect(()=>save('elektrolyser-doelvermogen-v1',target),[target]);
 useEffect(()=>save('elektrolyser-modulelimiet-v1',limit),[limit]);
 const loadCatalogue=useCallback(async()=>{
  setCatalogue(c=>({...c,loading:true,error:''}));
  try{const r=await fetch('/api/atlas/catalogue');const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Waterstofatlas kon niet worden geladen. Probeer opnieuw.');setCatalogue({data:d,loading:false,error:''});}
  catch(e){setCatalogue(c=>({...c,loading:false,error:e instanceof Error?e.message:'Koppeling niet beschikbaar.'}));}
 },[]);
 useEffect(()=>{if(!catalogue.data&&!catalogue.loading&&!catalogue.error)void loadCatalogue();},[tab,catalogue,loadCatalogue]);
 const interpreted=useMemo(()=>catalogueModels(catalogue.data) as {models:Model[];excluded:Model[];other:Model[]},[catalogue.data]);
 const byId=useMemo(()=>new Map(interpreted.models.map(m=>[m.id,m])),[interpreted]);
 const resolved=useMemo(()=>setups.map(s=>resolveSetup(byId.get(s.modelId),s,general,{target,limit}) as Resolved),[setups,byId,general,target,limit]);
 const calc=useCalculator();
 const update=(id:string,change:(s:Setup)=>Setup)=>setSetups(list=>list.map(s=>s.id===id?change(s):s));
 const choose=(modelId:string)=>{
  const model=byId.get(modelId),fill=model?.power.value?fillWithinLimit(stackPowerMW(model.power.value,model.boundary.value),target,limit):null,modules=fill?.modules||1;
  const id=setups.find(s=>!s.modelId)?.id??(setups.length<MAX_SETUPS?makeId():active);
  setSetups(l=>l.some(s=>s.id===id)?l.map(s=>s.id===id?newSetup(id,modelId,modules):s):[...l,newSetup(id,modelId,modules)]);
  setActive(id);go('samenstellen');
 };
 // The parameter is removed from the address in both cases, so a reload or a copied link does not repeat the question.
 const clearImport=()=>{try{const u=new URL(location.href);u.searchParams.delete('atlas');history.replaceState(history.state,'',u.pathname+(u.search||'')+u.hash);}catch{/* address stays as it is */}setAtlasImport({present:false,ok:false,error:'',payload:null});};
 const applyImport=()=>{
  if(!atlasImport.ok||!atlasImport.payload)return;
  const r=setupsFromImport(atlasImport.payload,interpreted.models,{target,limit,makeId});
  if(r.setups.length){setSetups(r.setups);setActive(r.setups[0].id);setTarget(r.target);if(r.limitChanged)setLimit(r.limit as Limit);}
  setImportNote(r.setups.length?`${r.setups.length} ${r.setups.length===1?'opstelling':'opstellingen'} geladen uit de Waterstofatlas, aangevuld tot ${fmt(r.target,2)} MW.`+(r.setups.some(st=>!resolveSetup(byId.get(st.modelId),st,general,{target:r.target,limit:r.limitChanged?r.limit:limit}).ready)?' Sommige opstellingen hebben nog open punten: gebruik hieronder “Vul alle open punten in”.':'')+(r.notFound.length?` ${r.notFound.length} ${r.notFound.length===1?'model is':'modellen zijn'} niet gevonden in de catalogus (onbekend of uitgeschakeld) en overgeslagen.`:''):'Geen enkel model uit de shortlist staat in de catalogus; je opstellingen zijn niet veranderd.');
  clearImport();go('samenstellen');
 };
 // Fill every open point of the given setups (all when omitted) with a cautious, labelled assumption.
 const fillOpen=(ids?:string[])=>{
  const notes:string[]=[];
  const next=setups.map((s,i)=>{if(ids&&!ids.includes(s.id))return s;const m=byId.get(s.modelId);if(!m||resolved[i]?.ready)return s;const r=autoResolve(m,s,general,{target,limit});if(r.notes.length)notes.push(`Opstelling ${letter(i)}: ${r.notes.join(' ')}`);return r.setup as Setup;});
  setSetups(()=>next);
  setImportNote(notes.length?`Open punten ingevuld met voorzichtige aannames (bij een bereik de ongunstige kant). ${notes.join(' ')} Elke ingevulde waarde staat als aanname in Samenstellen en is daar aan te passen.`:'Er waren geen open punten om in te vullen.');
 };
 const importBar=atlasImport.present&&(atlasImport.ok&&atlasImport.payload
  ?<div className="import-bar" role="region" aria-label="Shortlist uit de Waterstofatlas"><p><strong>Shortlist uit de Waterstofatlas</strong> ({atlasImport.payload.ids.length} {atlasImport.payload.ids.length===1?'model':'modellen'}{atlasImport.payload.target?`, doel ${fmt(atlasImport.payload.target,2)} MW`:''}{atlasImport.payload.maxModules?`, maximaal ${atlasImport.payload.maxModules} modules`:''}) laden? Dit vervangt je huidige opstellingen.</p><div className="import-actions"><button type="button" className="download" disabled={!catalogue.data} onClick={applyImport}>{catalogue.data?'Laden':'Catalogus laden…'}</button><button type="button" className="download secondary" onClick={clearImport}>Negeren</button></div></div>
  :<div className="live-error" role="alert"><p>{atlasImport.error}</p><button type="button" className="download" onClick={clearImport}>Sluiten</button></div>);
 const catalogueState=<>{importBar}{importNote&&<p role="status" className="wind-note">{importNote}</p>}{catalogue.loading&&<p role="status" className="wind-note">Waterstofatlas-catalogus laden…</p>}{catalogue.error&&<div className="live-error" role="alert"><p>{catalogue.error}</p><button type="button" className="download" onClick={()=>void loadCatalogue()}>Opnieuw proberen</button></div>}</>;
 return <Shell tab={tab} go={go}>{catalogueState}
  {tab==='catalogus'&&<CatalogueTab catalogue={catalogue.data} interpreted={interpreted} onChoose={choose} onReload={()=>void loadCatalogue()} loading={catalogue.loading} limit={limit} setLimit={setLimit} target={target} setTarget={setTarget}/>}
  {tab==='samenstellen'&&<ComposeTab setups={setups} setSetups={setSetups} active={active} setActive={setActive} resolved={resolved} byId={byId} models={interpreted.models} update={update} target={target} setTarget={setTarget} go={go} general={general} limit={limit} setLimit={setLimit} fillOpen={fillOpen}/>}
  {tab==='vergelijken'&&<CompareTab setups={setups} resolved={resolved} byId={byId} general={general} setGeneral={setGeneral} reference={reference} setReference={setReference} calc={calc} catalogue={catalogue.data} target={target} setTarget={setTarget} update={update} go={go} setActive={setActive} limit={limit} setLimit={setLimit} fillOpen={fillOpen}/>}
 </Shell>;
}

// ---------------------------------------------------------------- Modulelimiet

// Optional and off by default: the user picks whether it warns or blocks, and whether the target must be reached.
function LimitPanel({limit,setLimit,target,setTarget}:{limit:Limit;setLimit:(l:Limit)=>void;target:number;setTarget?:(n:number)=>void}){
 const off=limit.mode==='uit',set=(change:Partial<Limit>)=>setLimit({...limit,...change});
 const explain={uit:'Geen limiet: er wordt niets gemeld of geblokkeerd.',waarschuwen:'Een opstelling buiten de limiet krijgt een waarschuwing, maar blijft rekenbaar en vergelijkbaar.',blokkeren:'Een opstelling buiten de limiet wordt niet berekend of vergeleken, tot je het aantal modules aanpast of de limiet uitzet.'}[limit.mode];
 return <fieldset className="limit-panel"><legend>Modulelimiet (optioneel)</legend>
  <div className="model-grid">
   {setTarget&&<label>Doelvermogen stack (MW)<NumberInput label="Doelvermogen als totaal stackvermogen in MW" value={target} onCommit={v=>{if(v!==null&&v>0&&v<=100000)setTarget(v);}}/></label>}
   <label>Limiet<select value={limit.mode} onChange={e=>set({mode:e.target.value as Limit['mode']})}><option value="uit">Uit</option><option value="waarschuwen">Waarschuwen</option><option value="blokkeren">Blokkeren</option></select></label>
   <label>Maximaal aantal modules<input type="number" min="1" max={MAX_MODULES} step="1" value={limit.max} disabled={off} onChange={e=>{const n=Math.round(Number(e.target.value));if(Number.isFinite(n))set({max:Math.min(MAX_MODULES,Math.max(1,n))});}}/></label>
   <label>Doel halen<select value={limit.reach} disabled={off} onChange={e=>set({reach:e.target.value as Limit['reach']})}><option value="volledig">Moet gehaald worden</option><option value="onder">Mag er licht onder blijven</option></select></label>
   {limit.reach==='onder'&&<label>Toegestaan tekort (%)<NumberInput label="Toegestaan tekort onder het doelvermogen in procent" value={limit.tolerance} scale={100} disabled={off} onCommit={v=>{if(v!==null&&v>=0&&v<=0.5)set({tolerance:v});}}/></label>}
  </div>
  {setTarget&&<p className="wind-note">{TARGET_NOTE}</p>}
  <p className="wind-note">{explain}{!off&&` Een opstelling voldoet bij ten hoogste ${limit.max} modules en minstens ${fmt(limitFloorMW(target,limit),2)} MW stackvermogen${limit.reach==='volledig'?' (het doelvermogen)':` (doelvermogen ${fmt(target,2)} MW min ${fmt(limit.tolerance*100,1)} %)`}.`}</p>
 </fieldset>;
}
// Why a setup is left out of the comparison: not complete, outside a blocking limit, or both.
function notCounted(r:Resolved){
 const blocked=!!r.limit?.blocks,other=r.problems.some(p=>!r.limit?.problems.includes(p));
 return blocked&&other?'nog niet compleet en buiten de modulelimiet':blocked?'buiten de modulelimiet':'nog niet compleet';
}

// ---------------------------------------------------------------- Catalogus

function ValueRow({label,value,unit,field,extra}:{label:string;value:ReactNode;unit?:string;field:{status:string;aanname?:boolean;value?:any};extra?:ReactNode}){
 return <div className="catalogue-row"><dt>{label}</dt><dd><span className="catalogue-value">{value}{unit&&value!=='—'?' '+unit:''}</span> <StatusChip field={field}/>{extra}</dd></div>;
}
// Modules needed for the target power; with a limit on, also whether the model gets there within it.
function FitRow({fit,target,limit}:{fit:ReturnType<typeof modelFit>;target:number;limit:Limit}){
 return <div className="catalogue-row"><dt>Modules voor {fmt(target,2)} MW stack</dt><dd>{fit?<><span className="catalogue-value">{fmt(fit.needed,0)} modules</span>{limit.mode!=='uit'&&<span className={'status-chip '+(fit.ok?'status-ready':'status-open')}>{fit.ok?'binnen limiet':'buiten limiet'}</span>}<small>{fit.needed>fit.modules?`bij ${fmt(fit.modules,0)} modules: ${fmt(fit.nominalMW,2)} MW stack`:`${fmt(fit.nominalMW,2)} MW stack totaal`}</small></>:<><span className="catalogue-value">—</span><small>modulevermogen onbekend</small></>}</dd></div>;
}
function CatalogueTab({catalogue,interpreted,onChoose,onReload,loading,limit,setLimit,target,setTarget}:{catalogue:Catalogue|null;interpreted:{models:Model[];excluded:Model[];other:Model[]};onChoose:(id:string)=>void;onReload:()=>void;loading:boolean;limit:Limit;setLimit:(l:Limit)=>void;target:number;setTarget:(n:number)=>void}){
 const [manufacturer,setManufacturer]=useState(''),[technology,setTechnology]=useState(''),[query,setQuery]=useState(''),[onlyFit,setOnlyFit]=useState(false);
 const models=interpreted.models;
 const manufacturers=[...new Set(models.map(m=>m.manufacturer))].sort((a,b)=>a.localeCompare(b,'nl'));
 const technologies=[...new Set(models.map(m=>m.technology))].sort((a,b)=>a.localeCompare(b,'nl'));
 const q=query.trim().toLocaleLowerCase('nl');
 const fit=(m:Model)=>m.power.value!==undefined?modelFit(stackPowerMW(m.power.value,m.boundary.value),target,limit):null;
 const filtered=models.filter(m=>(!manufacturer||m.manufacturer===manufacturer)&&(!technology||m.technology===technology)&&(!q||(m.name+' '+m.manufacturer+' '+m.technology).toLocaleLowerCase('nl').includes(q)));
 // Models without a known module power cannot be judged and stay visible.
 const hideOutside=onlyFit&&limit.mode!=='uit',shown=hideOutside?filtered.filter(m=>fit(m)?.ok!==false):filtered;
 const missing=catalogue?missingEndpointFields(catalogue.models):[];
 const v=(x:Value,unit:string,scale=1)=>x.value!==undefined?fmt(x.value*scale,3):x.candidates?.length?x.candidates.map(c=>fmt(c,3)).join(' / ')+' ?':'—';
 return <section className="production-panel electrolyser-panel" aria-labelledby="catalogue-title">
  <div className="panel-heading"><div><span className="eyebrow">WATERSTOFATLAS</span><h2 id="catalogue-title">Catalogus</h2></div><button type="button" className="download" disabled={loading} onClick={onReload}>Catalogus vernieuwen</button></div>
  {catalogue&&<p className="wind-note">{models.length} elektrolysers · catalogusversie {catalogue.revision}{catalogue.sourceUpdatedAt?` · bron bijgewerkt ${new Date(catalogue.sourceUpdatedAt).toLocaleDateString('nl-NL')}`:''}. Net als in de Atlas tellen {DISABLED_MANUFACTURERS.slice(0,-1).join(', ')} en {DISABLED_MANUFACTURERS.at(-1)} niet mee{interpreted.excluded.length?` (${interpreted.excluded.length} modellen)`:''}{interpreted.other.length?`; ${interpreted.other.length} voedingen zonder stack staan er niet bij`:''}.</p>}
  <StatusLegend/>
  {missing.length>0&&<details className="model-settings endpoint-note"><summary>Technische noot: {missing.length} {missing.length===1?'gegeven komt':'gegevens komen'} nog niet mee uit de Atlas ({missing.map(m=>m.label).join(', ')})</summary><p>Deze velden levert <code>/api/integrations/mijnwindpark/catalogue</code> nog niet. Ze worden niet op een andere manier uit de Atlas-website gelezen. Dit is een benodigde uitbreiding van de Atlas-endpoint, buiten deze website.</p></details>}
  <div className="model-grid catalogue-filters"><label>Fabrikant<select value={manufacturer} onChange={e=>setManufacturer(e.target.value)}><option value="">Alle fabrikanten</option>{manufacturers.map(m=><option key={m}>{m}</option>)}</select></label><label>Technologie<select value={technology} onChange={e=>setTechnology(e.target.value)}><option value="">Alle technologieën</option>{technologies.map(t=><option key={t}>{t}</option>)}</select></label><label>Zoeken<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Model of fabrikant"/></label></div>
  <LimitPanel limit={limit} setLimit={setLimit} target={target} setTarget={setTarget}/>
  {limit.mode!=='uit'&&<label className="inline-check"><input type="checkbox" checked={onlyFit} onChange={e=>setOnlyFit(e.target.checked)}/> Alleen modellen tonen die het doelvermogen binnen de limiet halen</label>}
  <p className="wind-note" role="status">{shown.length} van {models.length} modellen{filtered.length>shown.length?` (${filtered.length-shown.length} buiten de limiet verborgen)`:''}.</p>
  <ul className="catalogue-list">{shown.map(m=><li key={m.id} className="catalogue-card"><div className="catalogue-card-head"><h3>{m.name}</h3><p>{m.manufacturer} · {m.technology}</p></div>
   <dl>
    <ValueRow label="Modulevermogen" value={v(m.power,'MW')} unit="MW" field={m.power} extra={<small>{m.boundary.value==='stack'?'stack':'systeem'}{m.boundary.aanname?' (aanname)':''}</small>}/>
    <FitRow fit={fit(m)} target={target} limit={limit}/>
    <ValueRow label="Systeemverbruik" value={v(m.systemEnergy,'kWh/kg')} unit="kWh/kg" field={m.systemEnergy}/>
    <ValueRow label="Stackverbruik" value={v(m.stackEnergy,'kWh/kg')} unit="kWh/kg" field={m.stackEnergy}/>
    <ValueRow label="Minimumlast" value={m.minimum.value!==undefined?fmt(m.minimum.value*100,2):m.minimum.candidates?.length?m.minimum.candidates.map(c=>fmt(c,2)).join(' / ')+' ?':'—'} unit="%" field={m.minimum} extra={m.minimum.basis&&m.minimum.basis!=='elektrisch'?<small>basis: {m.minimum.basis}</small>:null}/>
    <ValueRow label="Leveringstype" value={m.delivery.status==='niet-in-endpoint'?'—':m.delivery.label} field={m.delivery}/>
   </dl>
   <details className="catalogue-raw"><summary>Brontekst en bron</summary><p><strong>Vermogen:</strong> {m.power.raw||'Niet vermeld'}</p><p><strong>Systeemverbruik:</strong> {m.systemEnergy.raw||'Niet vermeld'}</p><p><strong>Stackverbruik:</strong> {m.stackEnergy.raw||'Niet vermeld'}</p><p><strong>Minimumlast:</strong> {m.minimum.raw||'Niet vermeld'}</p>{m.power.reason&&<p>Vermogen: {m.power.reason}</p>}{m.power.rule&&<p>Vermogen: {m.power.rule}</p>}{m.minimum.reason&&<p>Minimumlast: {m.minimum.reason}</p>}{m.minimum.rule&&<p>Minimumlast: {m.minimum.rule}</p>}<p><strong>Bron:</strong> {m.source||'Niet vermeld'}</p></details>
   <div className="catalogue-actions"><button type="button" className="primary-button" onClick={()=>onChoose(m.id)}>Samenstellen</button>{m.datasheets.map((href,i)=><a key={href} className="download" href={href} target="_blank" rel="noopener">{m.datasheets.length>1?`Datasheet ${i+1} ↗`:'Datasheet ↗'}</a>)}<a className="download" href={m.url} target="_blank" rel="noopener noreferrer">Waterstofatlas ↗</a></div>
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
function OpenPointsBar({setups,resolved,fillOpen,byId}:{setups:Setup[];resolved:Resolved[];fillOpen:(ids?:string[])=>void;byId:Map<string,Model>}){
 const open=setups.map((s,i)=>({s,i})).filter(({s,i})=>byId.get(s.modelId)&&!resolved[i]?.ready);
 if(!open.length)return null;
 return <div className="open-points-bar" role="region" aria-label="Open punten"><div><strong>{open.length===1?'1 opstelling heeft':`${open.length} opstellingen hebben`} nog open punten</strong> ({open.map(x=>letter(x.i)).join(', ')}): de datasheet geeft een bereik, een andere eenheid of niets. Zonder keuze kan er niet gerekend worden.</div><button type="button" className="primary-button" onClick={()=>fillOpen()}>Vul alle open punten in</button><p className="wind-note">Met voorzichtige aannames: bij een bereik de ongunstige kant (hoogste verbruik, hoogste minimumlast), anders de technologiestandaard. Elke ingevulde waarde blijft als aanname zichtbaar en aanpasbaar.</p></div>;
}

function ComposeTab({setups,setSetups,active,setActive,resolved,byId,models,update,target,setTarget,go,general,limit,setLimit,fillOpen}:{setups:Setup[];setSetups:(f:(l:Setup[])=>Setup[])=>void;active:string;setActive:(id:string)=>void;resolved:Resolved[];byId:Map<string,Model>;models:Model[];update:UpdateFn;target:number;setTarget:(n:number)=>void;go:(t:Tab)=>void;general:General;limit:Limit;setLimit:(l:Limit)=>void;fillOpen:(ids?:string[])=>void}){
 const index=Math.max(0,setups.findIndex(s=>s.id===active)),setup=setups[index],r=resolved[index],model=setup?byId.get(setup.modelId):undefined;
 const choices=setup?.choices||{};
 const set=(change:(c:Choices)=>Choices)=>setup&&update(setup.id,s=>({...s,choices:change({...s.choices})}));
 const groups=[...new Set(models.map(m=>m.manufacturer))].sort((a,b)=>a.localeCompare(b,'nl'));
 const fill=r?.stackModuleMW?fillWithinLimit(r.stackModuleMW,target,limit):null,stack=r?.stackModuleMW||0;
 // A blocking limit also stops the stepper at the maximum.
 const maxModules=limit.mode==='blokkeren'?Math.min(MAX_MODULES,limit.max):MAX_MODULES;
 const add=()=>{const id=makeId();setSetups(l=>[...l,newSetup(id)]);setActive(id);};
 const remove=()=>{if(setups.length<=1)return;setSetups(l=>l.filter(s=>s.id!==setup.id));setActive(setups[index===0?1:0].id);};
 return <section className="production-panel electrolyser-panel" aria-labelledby="compose-title">
  <div className="panel-heading"><div><span className="eyebrow">OPSTELLING = ÉÉN MODEL × EEN GEHEEL AANTAL MODULES</span><h2 id="compose-title">Samenstellen</h2></div></div>
  <p className="wind-note">Een module is de kleinste eenheid die zelfstandig aan en uit kan, met een eigen minimumlast. Een systeem met meerdere stacks telt als één module.</p><p className="wind-note">{TARGET_NOTE}</p>
  <OpenPointsBar setups={setups} resolved={resolved} fillOpen={fillOpen} byId={byId}/>
  <details className="model-settings"><summary>Modulelimiet (optioneel){limit.mode!=='uit'?` · ${limit.mode}, maximaal ${limit.max}`:' · uit'}</summary><LimitPanel limit={limit} setLimit={setLimit} target={target}/></details>
  <div className="setup-picker" role="tablist" aria-label="Opstellingen">{setups.map((s,i)=><button key={s.id} type="button" role="tab" aria-selected={s.id===setup?.id} onClick={()=>setActive(s.id)}><strong>Opstelling {letter(i)}</strong><span>{byId.get(s.modelId)?.name||'Nog geen model'}{resolved[i]?.nominalMW?` · ${s.modules} × ${fmt(resolved[i].moduleMW,3)} MW`:''}</span><span className={'status-chip '+(resolved[i]?.ready?'status-ready':'status-open')}>{resolved[i]?.ready?'klaar om te rekenen':'nog open'}</span></button>)}{setups.length<MAX_SETUPS&&<button type="button" className="setup-add" onClick={add}>+ Opstelling toevoegen</button>}</div>
  {setup&&<div className="setup-editor">
   <div className="model-grid setup-basics">
    <label>Model uit de Waterstofatlas<select value={setup.modelId} onChange={e=>{const m=byId.get(e.target.value);const f=m?.power.value?fillWithinLimit(stackPowerMW(m.power.value,m.boundary.value),target,limit):null;update(setup.id,s=>({...newSetup(s.id,e.target.value,f?.modules||s.modules)}));}}><option value="">Kies een elektrolyser</option>{groups.map(g=><optgroup key={g} label={g}>{models.filter(m=>m.manufacturer===g).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>)}</select></label>
    <label>Aantal modules<span className="stepper"><button type="button" aria-label="Eén module minder" disabled={setup.modules<=1} onClick={()=>update(setup.id,s=>({...s,modules:Math.max(1,s.modules-1)}))}>−</button><input type="number" min="1" max={maxModules} step="1" value={setup.modules} onChange={e=>{const n=Math.round(Number(e.target.value));if(Number.isFinite(n))update(setup.id,s=>({...s,modules:Math.min(maxModules,Math.max(1,n))}));}}/><button type="button" aria-label="Eén module meer" disabled={setup.modules>=maxModules} onClick={()=>update(setup.id,s=>({...s,modules:Math.min(maxModules,s.modules+1)}))}>+</button></span></label>
    <label>Doelvermogen stack (MW)<NumberInput label="Doelvermogen als totaal stackvermogen in MW" value={target} onCommit={v=>{if(v!==null&&v>0&&v<=100000)setTarget(v);}}/></label>
   </div>
   <div className="model-actions"><button type="button" className="download" disabled={!fill} onClick={()=>fill&&update(setup.id,s=>({...s,modules:fill.modules}))}>Vul aan tot doelvermogen</button>{fill?.capped&&<span className="wind-note">Beperkt tot de limiet van {limit.max} modules: {fmt(fill.modules*stack,3)} MW stack voor een doel van {fmt(target,2)} MW.</span>}{fill&&!fill.exact&&!fill.capped&&<span className="wind-note">{fill.modules} × {fmt(stack,3)} = {fmt(fill.modules*stack,3)} MW stack{fill.below?`; met ${fill.below} modules is het ${fmt(fill.below*stack,3)} MW`:''}.</span>}{setups.length>1&&<button type="button" className="text-button" onClick={remove}>Opstelling {letter(index)} verwijderen</button>}</div>
   {model&&r&&<>
    <div className="setup-summary"><div><span>Totaal nominaal vermogen</span><strong>{fmt(r.nominalMW,3)} <small>MW</small></strong><p>{setup.modules} × {fmt(r.moduleMW,3)} MW · {r.boundary==='stack'?'stackvermogen':`systeemvermogen incl. BoP · ${fmt(setup.modules*stack,3)} MW stack`}</p></div><div><span>Opname bij vollast incl. BoP</span><strong>{fmt(r.intakeMW,3)} <small>MW</small></strong><p>{!r.bopFactor?'Volgt na de BoP-aanname.':r.boundary==='stack'?`Stack × (1 + BoP-vast + BoP-variabel) = × ${fmt(r.bopFactor,3)}`:'Gelijk aan het systeemvermogen.'}</p></div><div><span>Rekenwaarden</span><strong>{r.counts?.bron??0} <small>bron</small> · {r.counts?.aanname??0} <small>aanname</small></strong><p>{r.counts?.open?`${r.counts.open} nog open`:`Rust op ${r.counts?.bron} bronwaarden en ${r.counts?.aanname} aannames.`}</p></div></div>
    {r.platformLimitMW&&<p className="wind-note">Atlas-regel: maximaal {fmt(r.platformLimitMW)} MW per platform; meerdere platforms zijn mogelijk.</p>}
    {target>0&&stack>0&&Math.abs(setup.modules*stack-target)/target>0.05&&<p className="live-error">Het totale stackvermogen ({fmt(setup.modules*stack,3)} MW) wijkt {fmt(Math.abs(setup.modules*stack-target)/target*100,1)}% af van het doelvermogen van {fmt(target,2)} MW.</p>}
    {r.limit?.mode==='waarschuwen'&&!r.limit.ok&&<div className="live-error" role="status"><strong>Waarschuwing modulelimiet</strong><ul>{r.limit.problems.map(p=><li key={p}>{p}</li>)}</ul></div>}
    {r.problems.length>0&&<div className="live-error" role="status"><strong>Nog geen resultaat mogelijk</strong><ul>{r.problems.map(p=><li key={p}>{p}</li>)}</ul><button type="button" className="download" onClick={()=>fillOpen([setup.id])}>Vul de open punten van opstelling {letter(index)} in</button></div>}
    <FieldList model={model} resolved={r} choices={choices} set={set}/>
    <details className="model-settings"><summary>Informatie uit de catalogus die niet wordt meegerekend</summary><p><strong>Leveringstype:</strong> {model.delivery.status==='niet-in-endpoint'?'niet in de catalogus-endpoint':`${model.delivery.label} (${model.delivery.raw})`}. <strong>Aantal stacks:</strong> {model.stacks.status==='niet-in-endpoint'?'niet in de catalogus-endpoint':model.stacks.raw||'niet vermeld'}.</p><p><strong>Nominale productie:</strong> {model.production||'niet vermeld'}. <strong>Warme start:</strong> {model.hotStart||'niet vermeld'}. <strong>Koude start:</strong> {model.coldStart||'niet vermeld'}. Opstarttijden zijn in de vergelijking een algemene aanname, gelijk voor alle opstellingen.</p>{model.partload&&<p><strong>Deellastcurve:</strong> {model.partload.raw}{model.partload.usable?` → ${model.partload.bands.map(b=>`${fmt(b.van*100,0)}–${fmt(b.tot*100,0)}%: ${fmt(b.kWhPerKg,1)} kWh/kg`).join('; ')}${model.partload.unit==='Nm3'?` (× ${fmt(NM3_PER_KG,2)} Nm³/kg bij 0 °C en 1,013 bar)`:''}`:''}</p>}<p><strong>Bron:</strong> {model.source||'niet vermeld'} · <a href={model.url} target="_blank" rel="noopener noreferrer">Waterstofatlas ↗</a></p></details>
   </>}
   <div className="model-actions"><button type="button" className="primary-button" onClick={()=>go('vergelijken')}>Naar vergelijken →</button><span className="wind-note">{resolved.filter(x=>x.ready).length} van {setups.length} opstellingen klaar om te rekenen · besturing {generalValues(general).strategy}.</span></div>
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

function CompareTab({setups,resolved,byId,general,setGeneral,reference,setReference,calc,catalogue,target,setTarget,update,go,setActive,limit,setLimit,fillOpen}:{setups:Setup[];resolved:Resolved[];byId:Map<string,Model>;general:General;setGeneral:(f:(g:General)=>General)=>void;reference:number;setReference:(n:number)=>void;calc:ReturnType<typeof useCalculator>;catalogue:Catalogue|null;target:number;setTarget:(n:number)=>void;update:UpdateFn;go:(t:Tab)=>void;setActive:(id:string)=>void;limit:Limit;setLimit:(l:Limit)=>void;fillOpen:(ids?:string[])=>void}){
 const g=generalValues(general);
 const ready=setups.map((s,i)=>({setup:s,label:letter(i),resolved:resolved[i],model:byId.get(s.modelId)})).filter(x=>x.resolved.ready&&x.model);
 const ref=Math.min(reference,Math.max(0,ready.length-1));
 const jobs=ready.flatMap(x=>g.years.map(year=>({...jobFor(x.resolved,general,year),label:`Opstelling ${x.label} · ${year}`})));
 const signature=jobs.map(j=>j.key).join(',');
 const results:(Assembled|null)[]=useMemo(()=>ready.map(x=>assemble(x.resolved,general,calc.cache) as Assembled|null),[signature,calc.state.version]);
 const complete=ready.length>=2&&results.every(Boolean);
 // Costs follow the simulation and are not part of the cache key: another price or rate needs no new run.
 const gc=generalCosts(general),costsOf=ready.map(x=>setupCosts(x.resolved,x.setup,general));
 const costed:(Assembled|null)[]=complete?withCosts(results.map((r,i)=>({assembled:r,a:costsOf[i].a})),ref):results;
 const verdict=complete?robustness(ready.map((x,i)=>({result:results[i]!.summary,a:costsOf[i].a,fixedOwn:Number.isFinite(x.setup.choices.cost?.fixedMeur)}))):null;
 // Start once per new input; a newer request replaces a running one in the worker.
 const autoRun=useRef('');
 useEffect(()=>{if(ready.length>=2&&!complete&&autoRun.current!==signature){autoRun.current=signature;calc.run(jobs);}},[signature,complete]);
 const [chosenPeriod,setPeriod]=useState<'mean'|number>('mean');
 const period=chosenPeriod!=='mean'&&!g.years.includes(chosenPeriod)?'mean':chosenPeriod;
 const rows=costed.map(r=>r?(period==='mean'?r.mean:r.perYear[r.years.indexOf(period)]||null):null);
 const diffs=complete?differences(rows,ref):[];
 const warnings=capacityWarnings(ready.map(x=>x.resolved),ref);
 const setCost=(id:string,change:(c:NonNullable<Choices['cost']>)=>NonNullable<Choices['cost']>)=>update(id,st=>({...st,choices:{...st.choices,cost:change({...(st.choices.cost||{})})}}));
 const setValue=(key:string,v:number|null)=>setGeneral(x=>{const values={...x.values};if(v===null)delete values[key];else values[key]=v;return {...x,values};});
 function download(){
  const csv=comparisonCSV({catalogue,general,entries:ready.map((x,i)=>({setup:{label:x.label},model:x.model,resolved:x.resolved,result:costed[i],costs:costsOf[i]}))});
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`elektrolyser-vergelijking-${catalogue?.revision||'catalogus'}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const atlasLink=complete?windResultLink(windResultPayload({entries:ready.map((x,i)=>({setup:x.setup,model:x.model,resolved:x.resolved,result:costed[i],costs:costsOf[i]})),reference:ref,general,target,verdict})):null;
 const fillAll=()=>ready.forEach(x=>{const f=x.resolved.stackModuleMW?fillWithinLimit(x.resolved.stackModuleMW,target,limit):null;if(f)update(x.setup.id,s=>({...s,modules:f.modules}));});
 // With a warning limit the setups stay in the comparison; each one outside the limit is listed.
 const outside=setups.map((s,i)=>({label:letter(i),limit:resolved[i].limit})).filter(x=>x.limit?.mode==='waarschuwen'&&!x.limit.ok);
 const conclusion=complete?comparisonConclusion(costed.map(r=>r?{mean:r.mean}:null),verdict):null;
 const settingsOpen=ready.length<2;
 return <section className="production-panel electrolyser-panel" aria-labelledby="compare-title">
  <div className="panel-heading"><div><span className="eyebrow">ZELFDE WIND · ZELFDE ALGEMENE AANNAMES</span><h2 id="compare-title">Vergelijken</h2></div></div>
  <p className="wind-note compare-lead">Alle opstellingen draaien op dezelfde vier windjaren van Windpark Fryslân (10 %) en Beabuorren, met dezelfde aannames. Bovenaan staat de conclusie; de details en instellingen staan eronder.</p>
  {outside.length>0&&<div className="live-error capacity-warning" role="status">{outside.map(x=><div key={x.label}><p><strong>Opstelling {x.label}</strong> valt buiten de modulelimiet maar wordt wel meegerekend:</p><ul>{x.limit!.problems.map(p=><li key={p}>{p}</li>)}</ul></div>)}</div>}
  {ready.length<2?<div className="live-error" role="status"><p><strong>Nog geen vergelijking mogelijk.</strong> Er zijn minstens 2 opstellingen nodig die klaar zijn om te rekenen. Nu klaar: {ready.length}.</p>{setups.some((s,i)=>byId.get(s.modelId)&&!resolved[i].ready)&&<div className="model-actions"><button type="button" className="primary-button" onClick={()=>fillOpen()}>Vul alle open punten in en reken</button><span className="wind-note">Met voorzichtige aannames (bij een bereik de ongunstige kant). Ze blijven zichtbaar en aanpasbaar in Samenstellen.</span></div>}<p>Of los de punten zelf op:</p><ul>{setups.map((s,i)=>resolved[i].ready?null:<li key={s.id}>Opstelling {letter(i)}: {resolved[i].problems[0]||'kies een model'} <button type="button" className="text-button" onClick={()=>{setActive(s.id);go('samenstellen');}}>Aanpassen</button></li>)}</ul></div>:<>
   {setups.some((s,i)=>!resolved[i].ready)&&<p className="wind-note">Niet meegerekend: {setups.map((s,i)=>resolved[i].ready?null:`opstelling ${letter(i)} (${notCounted(resolved[i])})`).filter(Boolean).join(', ')}. <button type="button" className="text-button" onClick={()=>fillOpen()}>Open punten invullen</button></p>}
   {(calc.state.running||calc.state.error)&&<div className="research-progress" role="status">{calc.state.running&&<><p>{calc.state.done} van {calc.state.total} berekeningen klaar{calc.state.label?` · ${calc.state.label}`:''}{calc.state.fromCache?` · ${calc.state.fromCache} uit de cache`:''}.</p><progress value={calc.state.done} max={calc.state.total||1} aria-label="Berekeningen klaar"/></>}{calc.state.error&&<p className="live-error">{calc.state.error}</p>}</div>}
   {!complete&&!calc.state.running&&<div className="model-actions"><button type="button" className="primary-button" onClick={()=>calc.run(jobs)}>Bereken vergelijking</button></div>}
   {conclusion&&<Conclusion conclusion={conclusion} verdict={verdict} ready={ready} results={costed as Assembled[]}/>}
   {complete&&<><ResultTable ready={ready} rows={rows} diffs={diffs} reference={ref} results={results as Assembled[]}/><details className="model-settings"><summary>Waterstof per windjaar en benutting per windklasse (grafiek)</summary><YearTable ready={ready} results={results as Assembled[]} reference={ref}/><ClassChart ready={ready} rows={rows} reference={ref}/></details>
    <p className="wind-note">Kosten en LCOH zijn indicatief: de prijs per kW is een eigen aanname tot er offertes zijn, en start/stop-slijtage zit er niet in. Dit is geen financieel advies. De algemene studie naar het nut van opsplitsen, met gevoeligheid en omslagkaart, staat in <a href="/opsplitsing">Elektrolyser opsplitsen</a>. Rekenkern: {KERNEL_VERSION}.</p></>}
   {warnings.length>0&&<div className="live-error capacity-warning" role="alert">{warnings.map(w=><p key={w.index}><strong>Opstelling {ready[w.index].label}</strong> {w.kind==='nominaal'?`heeft ${fmt(Math.abs(w.pct)*100,1)}% ${w.pct>0?'meer':'minder'} nominaal vermogen dan referentie ${ready[ref].label}`:`neemt bij vollast ${fmt(Math.abs(w.pct)*100,1)}% ${w.pct>0?'meer':'minder'} op dan referentie ${ready[ref].label}, door een andere vermogensgrens (stack of systeem)`} ({fmt(w.kind==='nominaal'?ready[w.index].resolved.nominalMW:ready[w.index].resolved.intakeMW,2)} tegen {fmt(w.kind==='nominaal'?ready[ref].resolved.nominalMW:ready[ref].resolved.intakeMW,2)} MW). Verschillen in opbrengst komen dan ook door de grootte.</p>)}<div className="model-actions"><label className="inline-input">Doelvermogen stack (MW)<NumberInput label="Doelvermogen als totaal stackvermogen in MW" value={target} onCommit={v=>{if(v!==null&&v>0&&v<=100000)setTarget(v);}}/></label><button type="button" className="download" onClick={fillAll}>Vul alle opstellingen aan tot {fmt(target,2)} MW stack</button></div></div>}
   {complete&&<div className="model-actions compare-actions"><button type="button" className="download" disabled={calc.state.running} onClick={()=>calc.run(jobs)}>{calc.state.running?'Rekenen…':'Opnieuw rekenen'}</button><button type="button" className="download" onClick={download}>CSV met waarden, statussen en catalogusversie</button>{atlasLink&&<a className="primary-button" href={atlasLink} target="_blank" rel="noopener">Resultaat naar Waterstofatlas ↗</a>}</div>}
   {atlasLink&&<p className="wind-note">Stuurt per model de modules, waterstof, LCOH en maximale meerprijs naar de Arena van de Waterstofatlas, met de gegevens die nog op aannames rusten als open vragen voor fabrikanten. In de Arena wordt de LCOH omgezet naar 0–100 punten binnen je doorgerekende modellen; opstellingen die hierboven op kosten gelijkwaardig zijn, krijgen daar dezelfde punten. Er gaan geen ingevoerde prijzen of persoonsgegevens mee; de Atlas vraagt eerst om bevestiging.</p>}
  </>}
  <details className="model-settings compare-settings" open={settingsOpen||undefined}><summary>Instellingen en aannames van de vergelijking (windjaren, besturing, referentie, kosten)</summary>
  <div className="research-explainer"><p><strong>Windaanbod:</strong> {windSeries(g.windProfile)}. Meetgaten tellen niet als nul: ze vallen weg en de jaaruitkomst wordt naar 8.760 uur omgerekend, zoals in /opsplitsing. De datadekking staat in de tabel. <strong>Storingen</strong> volgen voor elke opstelling dezelfde vaste trekking per module en windjaar.</p>
   <fieldset className="year-picker"><legend>Windjaren</legend>{WIND_YEARS.map(y=><label key={y} className="inline-check"><input type="checkbox" checked={g.years.includes(y)} onChange={ev=>setGeneral(x=>{const years=ev.target.checked?[...new Set([...g.years,y])].sort():g.years.filter(v=>v!==y);return {...x,years:years.length?years:g.years};})}/> {y}</label>)}</fieldset></div>
  <LimitPanel limit={limit} setLimit={setLimit} target={target}/>
  <div className="model-grid compare-controls"><label>Besturing<select value={g.strategy} onChange={e=>setGeneral(x=>({...x,strategy:e.target.value}))}>{Object.keys(STRATEGIES).map(k=><option key={k} value={k}>{k}{k==='verdelen'?' (standaard)':''}</option>)}</select><small>{STRATEGIES[g.strategy as keyof typeof STRATEGIES]} <StatusChip field={{status:g.strategyStatus}}/></small></label>
   <label>Windprofiel<select value={g.windProfile} onChange={e=>setGeneral(x=>({...x,wind:e.target.value}))}>{Object.entries(WIND_PROFILES).map(([k,p])=><option key={k} value={k}>{p.naam}</option>)}</select><small>{WIND_PROFILES[g.windProfile as keyof typeof WIND_PROFILES].uitleg}. {WIND_PROFILES[g.windProfile as keyof typeof WIND_PROFILES].let_op} <StatusChip field={{status:g.windStatus}}/></small></label>
   <label>Referentieopstelling<select value={ref} onChange={e=>setReference(Number(e.target.value))}>{ready.map((x,i)=><option key={x.setup.id} value={i}>Opstelling {x.label} · {x.model!.name}</option>)}</select><small>Verschillen gelden ten opzichte van deze opstelling.</small></label>
   <label>Toon<select value={String(period)} onChange={e=>setPeriod(e.target.value==='mean'?'mean':Number(e.target.value))}><option value="mean">Gemiddelde {g.years.join(', ')}</option>{g.years.map(y=><option key={y} value={y}>Windjaar {y}</option>)}</select><small>De spreiding tussen jaren is geen betrouwbaarheidsinterval.</small></label></div>
  <details className="model-settings"><summary>Algemene aannames, gelijk voor alle opstellingen</summary><p>Standaard zijn dit de waarden van <code>Aannames()</code> in opsplitsing.py; de meeste zijn plaatshouders. Storingen zijn een vaste beschikbaarheidsafslag: elke module is (storingen × hersteltijd) / 8.760 uur minder beschikbaar, zonder toeval en voor elke opstelling hetzelfde.</p><ul className="field-list">{g.fields.map((f:any)=><li key={f.key} className="field-row"><div className="field-main"><span className="field-label">{f.label}<small> · {f.unit}</small></span><span className="field-value">{fmt(f.value*f.scale,3)}</span><StatusChip field={f}/></div><p className="field-rule">{f.rule}</p><div className="field-controls"><label className="inline-input">Eigen waarde<NumberInput label={`${f.label}, eigen waarde`} value={general.values[f.key]??null} scale={f.scale} onCommit={v=>setValue(f.key,v)}/></label>{general.values[f.key]!==undefined&&<button type="button" className="text-button" onClick={()=>setValue(f.key,null)}>Terug naar standaard</button>}</div></li>)}</ul></details>
  <details className="model-settings"><summary>Kostenaannames: algemeen en per opstelling</summary><p>Kosten volgen uit de simulatie en veranderen die niet: een andere prijs vraagt geen nieuwe berekening. De prijs per kW is een <strong>eigen aanname</strong> (referentieofferte van /opsplitsing: 60 M€ voor 50 MW in 10 units) zolang u geen offerte heeft; de vaste kosten per module zijn een onzekere aanname. Dat de uitkomst vooral de investering volgt, is precies waarom de maximale meerprijs hieronder het getal is om mee te onderhandelen.</p>
   <h3>Gelijk voor alle opstellingen</h3><ul className="field-list">{gc.fields.map((f:any)=><li key={f.key} className="field-row"><div className="field-main"><span className="field-label">{f.label}<small> · {f.unit}</small></span><span className="field-value">{fmt(f.value*f.scale,3)}</span><StatusChip field={f}/></div><p className="field-rule">{f.rule}</p><div className="field-controls"><label className="inline-input">Eigen waarde<NumberInput label={`${f.label}, eigen waarde`} value={general.values[f.key]??null} scale={f.scale} onCommit={v=>setValue(f.key,v)}/></label>{general.values[f.key]!==undefined&&<button type="button" className="text-button" onClick={()=>setValue(f.key,null)}>Terug naar standaard</button>}</div></li>)}</ul>
   <h3>Per opstelling</h3><ul className="field-list">{ready.map((x,i)=>{const c=x.setup.choices.cost||{},sc=costsOf[i];return <li key={x.setup.id} className="field-row"><div className="field-main"><span className="field-label">Opstelling {x.label}<small> · {x.model!.name}</small></span><span className="field-value">{fmt(sc.price,0)} €/kW · {fmt(sc.fields[1].value,2)} M€ vast per module</span><StatusChip field={sc.fields[0]}/></div><p className="field-rule">{sc.fields[0].rule}{sc.problem?` ${sc.problem}`:''}</p><div className="field-controls">
    <label className="inline-input">Eigen prijs (€/kW stack)<NumberInput label={`Opstelling ${x.label}, prijs in euro per kW`} value={c.eurKw??null} onCommit={v=>setCost(x.setup.id,k=>{const n={...k};delete n.totalMeur;if(v===null||!(v>0))delete n.eurKw;else n.eurKw=v;return n;})}/></label>
    <label className="inline-input">of totaalprijs (M€)<NumberInput label={`Opstelling ${x.label}, totaalprijs in miljoen euro`} value={c.totalMeur??null} onCommit={v=>setCost(x.setup.id,k=>{const n={...k};delete n.eurKw;if(v===null||!(v>0))delete n.totalMeur;else n.totalMeur=v;return n;})}/></label>
    <label className="inline-input">Vaste kosten per module (M€)<NumberInput label={`Opstelling ${x.label}, vaste kosten per module in miljoen euro`} value={c.fixedMeur??null} onCommit={v=>setCost(x.setup.id,k=>{const n={...k};if(v===null||!(v>=0&&v<=50))delete n.fixedMeur;else n.fixedMeur=v;return n;})}/></label>
    {x.setup.choices.cost&&Object.keys(x.setup.choices.cost).length>0&&<button type="button" className="text-button" onClick={()=>setCost(x.setup.id,()=>({}))}>Terug naar standaard ({fmt(DEFAULT_PRICE_EUR_KW,0)} €/kW)</button>}</div></li>;})}</ul></details>
  </details>
 </section>;
}

const joinNames=(list:string[])=>list.length<2?list.join(''):list.slice(0,-1).join(', ')+' en '+list[list.length-1];
type Conclusion=NonNullable<ReturnType<typeof comparisonConclusion>>;
// The answer first: which setup, why, how sure, and what to check before deciding.
function Conclusion({conclusion,verdict,ready,results}:{conclusion:Conclusion;verdict:ReturnType<typeof robustness>;ready:ReadyEntry[];results:Assembled[]}){
 const c=conclusion,w=c.winner,name=(i:number)=>`opstelling ${ready[i].label}`,eur=(v:number)=>fmt(v,2);
 const mean=(i:number)=>results[i].mean,t=(i:number)=>mean(i).waterstof_kg/1000;
 const d=sharedDecimals(c.ranking.map(t)),tons=(i:number)=>formatFixed(t(i),d,true);
 const hasCost=c.kind!=='waterstof',x=ready[w];
 const nextH2=c.ranking.filter(i=>i!==w).reduce((b,i)=>b<0||t(i)>t(b)?i:b,-1);
 const title=c.kind==='duidelijk'?'Duidelijk de beste keuze':c.kind==='gelijkwaardig'?'Voorkeur, maar op kosten gelijkwaardig aan anderen':'Voorkeur op waterstofproductie';
 const why=c.kind==='duidelijk'&&verdict
  ?`Laagste kostprijs: ${eur(verdict.lowestLcoh)} €/kg waterstof. Dat blijft zo in alle ${verdict.cases} toetsgevallen (kosten 25 % hoger of lager). Voorsprong op ${name(verdict.runnerUp)}: ${eur(verdict.margin)} €/kg.`
  :c.kind==='gelijkwaardig'&&verdict
  ?`${joinNames(c.equivalent.map((i:number)=>ready[i].label)).replace(/^/,'Opstelling ')} ${c.equivalent.length>1?'zijn':'is'} op kostprijs niet van elkaar te onderscheiden (${eur(verdict.range[0])}–${eur(verdict.range[1])} €/kg): de onzekerheid in de kosten is groter dan het verschil. Binnen die groep levert ${name(w)} de meeste waterstof.`
  :`Er zijn geen kosten berekend, dus de keuze volgt de waterstofproductie: ${name(w)} levert de meeste waterstof.`;
 const status=(i:number)=>i===w?['aanbevolen','status-ready']:c.equivalent.includes(i)?['gelijkwaardig op kosten','status-open']:c.dearer.includes(i)?['duurder','status-dearer']:['minder waterstof','status-dearer'];
 // A larger setup makes more hydrogen partly because it is larger: say so when the winner differs from the rest.
 const others=c.ranking.filter(i=>i!==w).map(i=>ready[i].resolved.nominalMW||0).sort((a,b)=>a-b),median=others.length?others[Math.floor((others.length-1)/2)]:0;
 const sizeGap=median>0&&x.resolved.nominalMW?(x.resolved.nominalMW-median)/median:0;
 const assumptions=x.resolved.counts?.aanname??0,auto=x.resolved.fields.filter(f=>typeof f.rule==='string'&&f.rule.startsWith('Automatisch ingevuld')).map(f=>f.label.toLowerCase());
 return <section className="compare-conclusion" aria-labelledby="conclusion-title">
  <span className="eyebrow">CONCLUSIE · {title.toUpperCase()}</span>
  <h3 id="conclusion-title">Kies opstelling {x.label}: {x.model!.name}</h3>
  <p className="conclusion-setup">{x.resolved.modules} × {fmt(x.resolved.moduleMW,3)} MW = {fmt(x.resolved.nominalMW,3)} MW · {tons(w)} t waterstof per jaar{hasCost&&Number.isFinite(mean(w).lcoh_eur_kg)?` · ${eur(mean(w).lcoh_eur_kg)} €/kg`:''}</p>
  <p className="conclusion-why">{why}{nextH2>=0&&` Ten opzichte van ${name(nextH2)}: ${formatSigned(shownDifference(t(w),t(nextH2),d),d)} t waterstof per jaar.`}{c.closeOnH2.length>0&&` Let op: ${joinNames(c.closeOnH2.map(name))} ${c.closeOnH2.length>1?'leveren':'levert'} bijna evenveel waterstof (minder dan 2 % verschil).`}</p>
  <ol className="conclusion-ranking">{c.ranking.map((i,rank)=>{const [label,cls]=status(i);return <li key={ready[i].setup.id} className={i===w?'winner':''}><span className="rank">{rank+1}</span><span className="who"><strong>Opstelling {ready[i].label}</strong> {ready[i].model!.name}<small>{ready[i].resolved.modules} × {fmt(ready[i].resolved.moduleMW,3)} MW · rust op {ready[i].resolved.counts?.aanname??0} aannames</small></span><span className="num">{tons(i)} <small>t/jaar</small></span>{hasCost&&<span className="num">{Number.isFinite(mean(i).lcoh_eur_kg)?eur(mean(i).lcoh_eur_kg):'–'} <small>€/kg</small></span>}<span className={'status-chip '+cls}>{label}</span></li>;})}</ol>
  <div className="conclusion-check"><strong>Voordat je besluit</strong><ul>
   <li>Opstelling {x.label} rust op {assumptions} aannames{auto.length?`, waarvan automatisch ingevuld: ${joinNames(auto)}`:''}. Vraag die gegevens na bij {x.model!.manufacturer}; in de Waterstofatlas staan ze als open vragen.</li>
   {hasCost&&<li>De prijs per kW is een aanname tot er offertes zijn.{verdict&&verdict.drivers.length>0?` Het meest bepalend voor de kostprijs: ${joinNames(verdict.drivers.map(dr=>dr.name))}.`:''} De rij “Maximale meerprijs” in de tabel zegt hoeveel duurder een opstelling per kW mag zijn om even goedkoop te blijven.</li>}
   {Math.abs(sizeGap)>0.05&&<li><strong>Niet even groot:</strong> opstelling {x.label} heeft {fmt(Math.abs(sizeGap)*100,0)} % {sizeGap>0?'meer':'minder'} vermogen ({fmt(x.resolved.nominalMW,3)} MW) dan de meeste andere opstellingen ({fmt(median,3)} MW). Een deel van het verschil in waterstof komt door de grootte; de kostprijs per kg houdt daar wel rekening mee. Zet het aantal modules gelijk in Samenstellen voor een zuivere vergelijking.</li>}
   <li>Minimumlast en opstarttijden zijn bedrijfsaannames: pas ze aan in Samenstellen of bij de instellingen hieronder en reken opnieuw.</li>
  </ul></div>
 </section>;
}
type ReadyEntry={setup:Setup;label:string;resolved:Resolved;model?:Model};
function ResultTable({ready,rows,diffs,reference,results}:{ready:ReadyEntry[];rows:(Metrics|null)[];diffs:any[];reference:number;results:Assembled[]}){
 return <div className="table-scroll compare-table-scroll"><table className="compare-table"><caption>Uitkomst per opstelling · verschil ten opzichte van opstelling {ready[reference].label}</caption><thead><tr><th scope="col">Uitkomst</th>{ready.map((x,i)=><th key={x.setup.id} scope="col"><span className="setup-swatch" style={{background:color(i)}}/>Opstelling {x.label}{i===reference?' (referentie)':''}<small>{x.model!.name} · {x.resolved.modules} × {fmt(x.resolved.moduleMW,3)} MW</small></th>)}</tr></thead><tbody>
  {(RESULT_ROWS as [string,string,string,string,string][]).map(row=>{const shown=resultRow(row,rows,diffs);return <tr key={row[1]}><th scope="row">{row[0]}{shown.unit?<small> {shown.unit}</small>:null}</th>{shown.cells.map((cell:{value:string;diff?:string},i:number)=><td key={i}>{cell.value}{cell.diff?<small className="diff">{cell.diff}</small>:null}</td>)}</tr>;})}
  <tr><th scope="row">Rust op</th>{ready.map(x=><td key={x.setup.id}>{x.resolved.counts?.bron} bronwaarden en {x.resolved.counts?.aanname} aannames</td>)}</tr>
  <tr><th scope="row">Uren met data<small> per windjaar</small></th>{results.map((r,i)=><td key={i}>{r.perYear.map(y=>`${y.jaar}: ${fmt(y.dekking_uur,0)} van ${fmt(y.uren_in_jaar,0)}`).join(' · ')}</td>)}</tr>
 </tbody></table></div>;
}
function YearTable({ready,results,reference}:{ready:ReadyEntry[];results:Assembled[];reference:number}){
 const years=results[0].years;
 // In t, met één afronding voor de hele tabel: drie significante cijfers van de grootste waarde.
 const d=sharedDecimals(results.flatMap(r=>r.perYear.map(y=>y.waterstof_kg/1000))),t=(kg:number)=>formatFixed(kg/1000,d,true);
 return <div className="table-scroll compare-table-scroll"><table className="compare-table"><caption>Waterstof per windjaar (t) · de spreiding tussen jaren is geen betrouwbaarheidsinterval</caption><thead><tr><th scope="col">Windjaar</th>{ready.map(x=><th key={x.setup.id} scope="col">Opstelling {x.label}</th>)}</tr></thead><tbody>{years.map((y,j)=><tr key={y}><th scope="row">{y}</th>{results.map((r,i)=>{const v=r.perYear[j].waterstof_kg,refv=results[reference].perYear[j].waterstof_kg;return <td key={i}>{t(v)}{i!==reference?<small className="diff">{formatSigned(shownDifference(v/1000,refv/1000,d),d)}</small>:null}</td>;})}</tr>)}<tr><th scope="row">Gemiddelde</th>{results.map((r,i)=><td key={i}><strong>{t(r.mean.waterstof_kg)}</strong></td>)}</tr><tr><th scope="row">Laagste–hoogste jaar</th>{results.map((r,i)=><td key={i}>{t(Math.min(...r.perYear.map(y=>y.waterstof_kg)))}–{t(Math.max(...r.perYear.map(y=>y.waterstof_kg)))}</td>)}</tr></tbody></table></div>;
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
 // Opgenomen en aanbod in dezelfde eenheid en afronding, bepaald door het aanbod.
 const energyPair=(taken:number,supply:number)=>{const u=energyUnit(supply),d=decimalsFor(supply*u.factor);return `${formatFixed(taken*u.factor,d,true)} van ${formatFixed(supply*u.factor,d,true)} ${u.unit} per jaar`;};
 return <figure className="class-chart"><figcaption><h3>Waar neemt elke opstelling het aanbod op?</h3><p>Per klasse van het windaanbod (MW): het deel van de windenergie in die klasse dat de opstelling opneemt. De lichte balken tonen op dezelfde as welk deel van het jaaraanbod in die klasse valt. Kleine modules beginnen eerder; bij veel wind telt vooral het totaalvermogen.</p></figcaption>
  <div className="combined-legend">{ready.map((x,i)=><span key={x.setup.id}><svg width="26" height="10" aria-hidden="true"><line x1="1" x2="25" y1="5" y2="5" stroke={color(i)} strokeWidth={i===reference?4:2.5} strokeDasharray={dash(i)}/></svg>Opstelling {x.label}{i===reference?' (referentie)':''}</span>)}<span><span className="combined-hour-swatch"/>Deel van het jaaraanbod in de klasse</span></div>
  <div className="class-chart-box" ref={box}><svg className="class-chart-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Opgenomen deel van het windaanbod per aanbodklasse, per opstelling"><title>Opgenomen deel van het windaanbod per aanbodklasse</title>
   {[0,.25,.5,.75,1].map(v=><g key={v}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} stroke="#e4e9e3"/><text x={L-8} y={y(v)+4} textAnchor="end" fontSize="11">{fmt(v*100,0)}%</text></g>)}
   {classes.map((c,i)=><rect key={i} x={x(i)-step*.38} width={step*.76} y={y(c.aanbod_mwh/total)} height={(H-T-B)*(c.aanbod_mwh/total)} fill="#C3E4F2"><title>{label(c)} MW: {fmt(c.aanbod_mwh/total*100,1)}% van het jaaraanbod</title></rect>)}
   {ready.map((s,i)=>{const cl=rows[i]!.klassen as typeof classes;const pts=cl.map((c,j)=>c.aanbod_mwh>0?[x(j),y(c.opgenomen_mwh/c.aanbod_mwh)]:null);return <g key={s.setup.id}><polyline points={pts.filter(Boolean).map(p=>p!.join(',')).join(' ')} fill="none" stroke={color(i)} strokeWidth={i===reference?3.5:2.2} strokeDasharray={dash(i)}/>{pts.map((p,j)=>p&&<circle key={j} cx={p[0]} cy={p[1]} r={i===reference?4:3} fill={color(i)}><title>Opstelling {s.label}, {label(cl[j])} MW: {fmt(cl[j].opgenomen_mwh/cl[j].aanbod_mwh*100,1)}% opgenomen ({energyPair(cl[j].opgenomen_mwh,cl[j].aanbod_mwh)})</title></circle>)}</g>;})}
   {classes.map((c,i)=>narrow?<text key={i} x={x(i)} y={H-B+12} textAnchor="end" fontSize="11" transform={`rotate(-50 ${x(i)} ${H-B+12})`}>{label(c)}</text>:<text key={i} x={x(i)} y={H-B+18} textAnchor="middle" fontSize="12">{label(c)}</text>)}
   <text x={(L+W-R)/2} y={H-8} textAnchor="middle" fontSize="12">{narrow?'Windaanbod (MW)':`Windaanbod in MW (laatste klasse: ${fmt(SUPPLY_EDGES[SUPPLY_EDGES.length-1])} MW en meer)`}</text>
  </svg></div>
 </figure>;
}
