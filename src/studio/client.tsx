// Projectstudio (intern.mijnwindpark.nl): projecten, locatie, elektrolyser, windparken, stations, aanbod, vergelijken en
// windparkpagina's. Alleen Nederlands; alles achter het sitewachtwoord. Opmaak: studio.css (huisstijl van mijnwindpark.nl).
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ChevronRight} from 'lucide-react';
import {useCalculator} from '../electrolyser-hub';
import {catalogueModels} from '../electrolyser-catalogue.mjs';
import {resolveSetup,newSetup,defaultLimit,DEFAULT_TARGET_MW} from '../electrolyser-setup.mjs';
import {assemble} from '../electrolyser-run.mjs';
import {YEARS} from './supply.mjs';
import {BOLSWARD,blankProject,studioProfile} from './project.mjs';
import {stepStatus,allocatedMW,canComputeSupply} from './status.mjs';
import {getJSON,useData,clone,makeId,letter,guard,LEAVE,Link} from './lib';
import {TopBar,HomeTopBar} from './ui/TopBar';
import {StepRail,StepStrip,BottomBar,NavFoot,type Step} from './ui/StepRail';
import {Overview,MobileSummary} from './ui/Overview';
import {Toasts,toast} from './ui/Toast';
import {Notice,Loading} from './ui/kit';
import {LocationStep} from './steps/location';
import {VariantsStep} from './steps/variants';
import {ParksStep} from './steps/parks';
import {StationsStep} from './steps/stations';
import {SupplyStep,useSupplies} from './steps/supply';
import {CompareStep} from './steps/compare';
import {ProjectList} from './projects';
import {ParkPage} from './park-page';

const REVERSE='https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse';
const stepFromUrl=()=>{const n=Number(new URLSearchParams(location.search).get('stap'));return Number.isInteger(n)&&n>=1&&n<=6?n-1:0;};

// ---------------------------------------------------------------- projecteditor
function Editor({initial}:{initial:any}){
 const [project,setProject]=useState<any>(initial),[step,setStepState]=useState(stepFromUrl),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false);
 const set=useCallback((f:(p:any)=>any)=>{setProject((p:any)=>f(p));setDirty(true);},[]);
 useEffect(()=>{guard.dirty=dirty;},[dirty]);
 useEffect(()=>()=>{guard.dirty=false;},[]);
 useEffect(()=>{document.title=`${project.naam} · Projectstudio`;},[project.naam]);

 const catalogue=useData('catalogue','/api/atlas/catalogue'),parks=useData('parks','/api/studio/parks'),index=useData('stations','/api/studio/stations');
 const interpreted=useMemo(()=>catalogueModels(catalogue.data) as any,[catalogue.data]);
 const byId=useMemo(()=>new Map<string,any>(interpreted.models.map((m:any)=>[m.id,m])),[interpreted]);
 const target=project.algemeen.doel_mw||DEFAULT_TARGET_MW,limit=project.algemeen.limiet||defaultLimit();
 const supply=useSupplies(project);
 const general=useMemo(()=>({...project.algemeen,years:YEARS,wind:supply.result?.profile||studioProfile(project)}),[project.algemeen,project.jaren,supply.result]);
 const resolved=useMemo(()=>project.varianten.map((s:any)=>resolveSetup(byId.get(s.modelId),s,general,{target,limit})),[project.varianten,byId,general,target,limit]);
 const calc=useCalculator(supply.result?{profile:supply.result.profile,supplies:supply.result.supplies}:null);

 // Na Vergelijken: kerncijfers van de referentievariant voor het overzicht.
 const {reference,compared}=useMemo(()=>{
  const ready=resolved.map((r:any,i:number)=>r.ready&&byId.get(project.varianten[i].modelId)?i:-1).filter((i:number)=>i>=0);
  if(!supply.result||ready.length<2)return {reference:null,compared:false};
  const results=ready.map((i:number)=>assemble(resolved[i],general,calc.cache));
  const pos=Math.min(project.referentie,ready.length-1),a:any=results[pos];
  return {reference:a?{label:letter(ready[pos]),waterstof_t:a.mean.waterstof_kg/1000,benut:a.mean.benut}:null,compared:results.every(Boolean)};
 },[calc.state.version,resolved,general,supply.result,project.referentie]);

 const status=useMemo(()=>stepStatus(project,{resolved,index:index.data,supply:{ready:!!supply.result,vollasturen:supply.result?.summaries[0]?.vollasturen,error:supply.error},compared}),[project,resolved,index.data,supply.result,supply.error,compared]);
 const allocated=allocatedMW(project),steps=status.steps as Step[];

 // Stap in de URL (?stap=3), zodat een link naar een stap werkt en de browserknop terug gaat.
 const setStep=useCallback((i:number)=>{const n=Math.max(0,Math.min(5,i));setStepState(n);history.pushState(null,'',location.pathname+'?stap='+(n+1));window.scrollTo({top:0});},[]);
 useEffect(()=>{const pop=()=>setStepState(stepFromUrl());addEventListener('popstate',pop);return()=>removeEventListener('popstate',pop);},[]);
 // Het aanbod start vanzelf in stap 5 en 6 als alle eerdere keuzes er zijn.
 const supplyKey=studioProfile(project);
 useEffect(()=>{if((step===4||step===5)&&!supply.result&&!supply.busy&&!supply.error&&canComputeSupply(project))void supply.run();},[step,supplyKey]);

 // Plaatsnaam bij de locatie (PDOK Locatieserver, omgekeerd zoeken).
 const placed=useRef(project.plaats?`${project.locatie?.lat},${project.locatie?.lon}`:'');
 useEffect(()=>{
  const loc=project.locatie;if(!loc)return;const key=`${loc.lat},${loc.lon}`;if(placed.current===key)return;
  const timer=setTimeout(()=>{placed.current=key;getJSON(`${REVERSE}?${new URLSearchParams({lat:String(loc.lat),lon:String(loc.lon),type:'woonplaats',rows:'1',fl:'woonplaatsnaam,gemeentenaam'})}`).then(d=>{const doc=d.response?.docs?.[0];setProject((p:any)=>p.locatie?.lat===loc.lat&&p.locatie?.lon===loc.lon?{...p,plaats:doc?.woonplaatsnaam||doc?.gemeentenaam||''}:p);}).catch(()=>{});},450);
  return()=>clearTimeout(timer);
 },[project.locatie?.lat,project.locatie?.lon]);

 const save=async(copy=false)=>{
  if(saving)return;setSaving(true);
  try{
   const body=JSON.stringify({...project,naam:copy?project.naam+' (kopie)':project.naam}),headers={'Content-Type':'application/json'};
   const saved=project.id&&!project.vast&&!copy?await getJSON('/api/studio/projects/'+project.id,{method:'PUT',headers,body}):await getJSON('/api/studio/projects',{method:'POST',headers,body});
   setProject(saved);setDirty(false);guard.dirty=false;
   if(location.pathname!=='/project/'+saved.id)history.replaceState(null,'',`/project/${saved.id}?stap=${step+1}`);
   toast(copy||project.vast?'Kopie bewaard als nieuw project':'Project bewaard');
  }catch(e:any){toast(e.message||'Bewaren mislukt.','fout');}
  finally{setSaving(false);}
 };
 const copyLink=async()=>{const url=`${location.origin}/project/${project.id}`;try{await navigator.clipboard.writeText(url);toast('Link gekopieerd');}catch{window.prompt('Kopieer de link (alleen te openen met het wachtwoord):',url);}};
 // Ctrl/Cmd+S bewaart; weggaan met niet bewaarde wijzigingen vraagt eerst.
 const saveRef=useRef(save);saveRef.current=save;
 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();void saveRef.current(Boolean(project.vast));}};
  const leave=(e:BeforeUnloadEvent)=>{if(guard.dirty){e.preventDefault();e.returnValue=LEAVE;}};
  addEventListener('keydown',key);addEventListener('beforeunload',leave);
  return()=>{removeEventListener('keydown',key);removeEventListener('beforeunload',leave);};
 },[project.vast]);

 const top=<TopBar project={project} onRename={n=>set(p=>({...p,naam:n}))} dirty={dirty} saving={saving} onSave={()=>void save()} onCopy={()=>void save(true)} onCopyLink={()=>void copyLink()}/>;
 const kpis={allocated,stations:new Set(project.parken.filter((p:any)=>p.aandeel>0).flatMap((p:any)=>p.stations)).size,lets:status.issues.filter((x:any)=>x.level==='let').length};
 if(step===0)return <>{top}<main id="inhoud"><LocationStep project={project} set={set} parks={parks.data?.features||null} steps={steps} onStep={setStep} kpis={kpis}/></main></>;
 if(step===3)return <>{top}<main id="inhoud"><StationsStep project={project} set={set} index={index} steps={steps} onStep={setStep} kpis={kpis}/></main></>;

 const ov={project,status,allocated,supply:supply.result?{summary:supply.result.summaries[0],quiet:supply.result.extras.quiet}:null,reference,onStep:setStep,onCompute:()=>{setStep(4);void supply.run();},busy:supply.busy,canCompute:canComputeSupply(project)};
 const parkLink=(p:any)=>project.vast?`/project/bolsward/park/${p.id}`:project.id?`/project/${project.id}/park/${encodeURIComponent(p.id)}`:'';
 const railFoot=project.parken.length?<><small>Windparkpagina's</small>{project.parken.map((p:any)=>parkLink(p)?<Link key={p.id} href={parkLink(p)}><ChevronRight size={14}/>{p.naam.replace(/^Windpark /,'')}</Link>:null)}{!project.id&&!project.vast&&<span className="s-muted">Bewaar het project voor de windparkpagina's.</span>}</>:null;
 return <>{top}
  <div className="s-frame">
   <StepRail steps={steps} active={step} onStep={setStep} footer={railFoot}/>
   <main id="inhoud" className="s-work">
    <MobileSummary {...ov}/>
    <StepStrip steps={steps} active={step} onStep={setStep}/>
    {step===1&&<VariantsStep project={project} set={set} models={interpreted.models} byId={byId} catalogue={catalogue} general={general} target={target} limit={limit} resolved={resolved}/>}
    {step===2&&<ParksStep project={project} set={set} parks={parks}/>}
    {step===4&&<SupplyStep project={project} supply={supply} resolved={resolved}/>}
    {step===5&&<CompareStep project={project} set={set} supply={supply} resolved={resolved} byId={byId} general={general} calc={calc} catalogue={catalogue.data} target={target} limit={limit} onStep={setStep}/>}
    <NavFoot steps={steps} active={step} onStep={setStep}/>
   </main>
   <Overview {...ov}/>
  </div>
  <BottomBar steps={steps} active={step} onStep={setStep}/>
 </>;
}

// ---------------------------------------------------------------- router
function App(){
 const [path,setPath]=useState(location.pathname);
 useEffect(()=>{const pop=()=>setPath(location.pathname);addEventListener('popstate',pop);return()=>removeEventListener('popstate',pop);},[]);
 const [loaded,setLoaded]=useState<{id:string;project:any;error:string}|null>(null);
 const m=/^\/project\/([^/]+)(?:\/park\/([^/]+))?$/.exec(path);
 useEffect(()=>{if(m&&!m[2]&&m[1]!=='bolsward'&&loaded?.id!==m[1])getJSON('/api/studio/projects/'+m[1]).then(project=>setLoaded({id:m[1],project,error:''}),e=>setLoaded({id:m[1],project:null,error:e.message}));},[path]);
 let body;
 if(path==='/nieuw')body=<Editor key="nieuw" initial={{...blankProject(),varianten:[newSetup(makeId()),newSetup(makeId())]}}/>;
 else if(m&&m[2])body=<><HomeTopBar/><ParkPage projectId={m[1]} parkId={decodeURIComponent(m[2])}/></>;
 else if(m&&m[1]==='bolsward')body=<Editor key="bolsward" initial={clone(BOLSWARD)}/>;
 else if(m)body=loaded?.id===m[1]?(loaded.project?<Editor key={m[1]} initial={loaded.project}/>:<><HomeTopBar/><main id="inhoud" className="s-page"><Notice kind="fout" title="Dit project kon niet worden geopend.">{loaded.error} <Link href="/">Naar de projecten</Link></Notice></main></>)
  :<><HomeTopBar/><main id="inhoud" className="s-page"><Loading>Project laden…</Loading></main></>;
 else body=<><HomeTopBar/><ProjectList/></>;
 return <div className="s-shell">{body}<Toasts/></div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
