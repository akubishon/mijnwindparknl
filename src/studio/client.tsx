// Projectstudio (intern.mijnwindpark.nl): projectenlijst, locatie, elektrolyser, windparken, stations, aanbod,
// vergelijken en windparkpagina's. Alleen Nederlands; alles achter het sitewachtwoord.
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import {CompareTab,useCalculator} from '../electrolyser-hub';
import {catalogueModels,DISABLED_MANUFACTURERS} from '../electrolyser-catalogue.mjs';
import {resolveSetup,newSetup,fillToTarget,stackPowerMW,defaultLimit,autoResolve,DEFAULT_TARGET_MW,MAX_MODULES} from '../electrolyser-setup.mjs';
import {describeStudio} from '../electrolyser-wind.mjs';
import {parkFromFeature,parkMW,kmBetween} from './park-model.mjs';
import {buildSupply,supplySummary,yearAxis,YEARS} from './supply.mjs';
import {suggestStations,stationWarnings} from './stations.mjs';
import {decodeSeries} from './wind-data.mjs';
import {BOLSWARD,blankProject,studioProfile,studioWindText,stationName,MAX_VARIANTS} from './project.mjs';

const BRT='https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png';
const KADASTER='https://service.pdok.nl/kadaster/kadastralekaart/wmts/v5_0/Kadastralekaart/EPSG:3857/{z}/{x}/{y}.png';
const LOCATIE='https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';
const STEPS=['Locatie','Elektrolyser','Windparken','KNMI-stations','Beschikbaar vermogen','Vergelijken'] as const;
const nl=(v:number|null|undefined,d=1)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('nl-NL',{minimumFractionDigits:d,maximumFractionDigits:d}):'–';
const letter=(i:number)=>String.fromCharCode(65+i);
const clone=<T,>(v:T):T=>structuredClone(v);
let idCounter=0;const makeId=()=>'v'+Date.now().toString(36)+(idCounter++);
async function getJSON(url:string,init?:RequestInit){const r=await fetch(url,init);const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Laden mislukt (HTTP ${r.status}).`);return d;}
function go(path:string){history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));window.scrollTo({top:0});}
function Link({href,children,className}:{href:string;children:any;className?:string}){return <a href={href} className={className} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;e.preventDefault();go(href);}}>{children}</a>;}
const Chip=({kind}:{kind?:string})=>kind?<span className={'status-chip '+(kind==='aanname'?'status-aanname':'status-bron')}>{kind==='osm'?'bron OSM':kind}</span>:null;

// ---------------------------------------------------------------- gedeelde gegevens (één keer per pagina)
const shared:{[k:string]:Promise<any>}={};
const once=(key:string,make:()=>Promise<any>)=>shared[key]||=make().catch(e=>{delete shared[key];throw e;});
const useData=(key:string,url:string)=>{const [s,set]=useState<{data:any;error:string}>({data:null,error:''});useEffect(()=>{once(key,()=>getJSON(url)).then(data=>set({data,error:''}),e=>set({data:null,error:e.message}));},[key,url]);return s;};
const windCache=new Map<string,Promise<Float64Array>>();
const windSeries=(id:string,year:number)=>{const k=id+'|'+year;if(!windCache.has(k))windCache.set(k,getJSON(`/api/studio/wind10/${id}/${year}`).then(decodeSeries).catch(e=>{windCache.delete(k);throw e;}));return windCache.get(k)!;};

// ---------------------------------------------------------------- kaart
function StudioMap({project,parks,onLocation,onPark,height=420}:{project:any;parks:any[]|null;onLocation?:(p:{lat:number;lon:number})=>void;onPark?:(f:any)=>void;height?:number}){
 const box=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null),marker=useRef<maplibregl.Marker|null>(null),handlers=useRef({onLocation,onPark});handlers.current={onLocation,onPark};
 useEffect(()=>{
  const m=new maplibregl.Map({container:box.current!,center:[project.locatie?.lon??5.5,project.locatie?.lat??52.6],zoom:project.locatie?10:7,attributionControl:{compact:true},
   style:{version:8,sources:{brt:{type:'raster',tiles:[BRT],tileSize:256,maxzoom:19,attribution:'Achtergrond en percelen © <a href="https://www.pdok.nl">Kadaster / PDOK</a> · windparken © OpenStreetMap'},kad:{type:'raster',tiles:[KADASTER],tileSize:256,minzoom:16,maxzoom:21},parks:{type:'geojson',data:{type:'FeatureCollection',features:[]}},chosen:{type:'geojson',data:{type:'FeatureCollection',features:[]}}},
    layers:[{id:'brt',type:'raster',source:'brt'},{id:'kad',type:'raster',source:'kad',minzoom:16},
     {id:'parks',type:'circle',source:'parks',paint:{'circle-radius':['interpolate',['linear'],['zoom'],6,3,12,7],'circle-color':'#00A6DE','circle-stroke-color':'#0C2340','circle-stroke-width':1}},
     {id:'chosen',type:'circle',source:'chosen',paint:{'circle-radius':['interpolate',['linear'],['zoom'],6,5,12,10],'circle-color':'#F5A800','circle-stroke-color':'#0C2340','circle-stroke-width':2}}]}});
  m.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  m.on('click',e=>{const hit=m.queryRenderedFeatures(e.point,{layers:['parks','chosen']})[0];if(hit&&handlers.current.onPark){handlers.current.onPark({type:'Feature',geometry:{type:'Point',coordinates:(hit.geometry as any).coordinates},properties:hit.properties});return;}handlers.current.onLocation?.({lat:e.lngLat.lat,lon:e.lngLat.lng});});
  m.on('mouseenter','parks',()=>{m.getCanvas().style.cursor='pointer';});m.on('mouseleave','parks',()=>{m.getCanvas().style.cursor='';});
  map.current=m;return()=>{m.remove();map.current=null;marker.current=null;};
 },[]);
 useEffect(()=>{const m=map.current;if(!m)return;const set=()=>{(m.getSource('parks') as any)?.setData({type:'FeatureCollection',features:parks||[]});(m.getSource('chosen') as any)?.setData({type:'FeatureCollection',features:project.parken.map((p:any)=>({type:'Feature',geometry:{type:'Point',coordinates:[p.lon,p.lat]},properties:{naam:p.naam,mw:parkMW(p),turbines:p.turbines}}))});};if(m.getSource('parks'))set();else m.once('load',set);},[parks,project.parken]);
 useEffect(()=>{const m=map.current;if(!m)return;if(!project.locatie){marker.current?.remove();marker.current=null;return;}
  if(!marker.current){marker.current=new maplibregl.Marker({color:'#0C2340',draggable:!!onLocation}).setLngLat([project.locatie.lon,project.locatie.lat]).addTo(m);marker.current.on('dragend',()=>{const p=marker.current!.getLngLat();handlers.current.onLocation?.({lat:p.lat,lon:p.lng});});}
  else marker.current.setLngLat([project.locatie.lon,project.locatie.lat]);},[project.locatie]);
 const [q,setQ]=useState(''),[hits,setHits]=useState<any[]>([]);
 const search=async()=>{if(!q.trim())return;try{const d=await getJSON(`${LOCATIE}?${new URLSearchParams({q,rows:'6',fl:'weergavenaam,centroide_ll,type'})}`);setHits(d.response?.docs||[]);}catch{setHits([]);}};
 const pick=(doc:any)=>{const m=/POINT\(([\d.]+) ([\d.]+)\)/.exec(doc.centroide_ll||'');if(!m)return;const lon=Number(m[1]),lat=Number(m[2]);map.current?.flyTo({center:[lon,lat],zoom:doc.type==='adres'?17:13});setHits([]);if(doc.type==='adres')handlers.current.onLocation?.({lat,lon});};
 return <div className="studio-map-wrap">{onLocation&&<form className="studio-search" onSubmit={e=>{e.preventDefault();void search();}}><input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Zoek een adres of plaats" aria-label="Zoek een adres of plaats"/><button type="submit" className="download">Zoeken</button>{hits.length>0&&<ul className="studio-hits">{hits.map(h=><li key={h.weergavenaam}><button type="button" onClick={()=>pick(h)}>{h.weergavenaam}</button></li>)}</ul>}</form>}<div ref={box} className="studio-map" style={{height}}/></div>;
}

// ---------------------------------------------------------------- projectenlijst
function ProjectList(){
 const [list,setList]=useState<{data:any;error:string}>({data:null,error:''});
 useEffect(()=>{getJSON('/api/studio/projects').then(data=>setList({data,error:''}),e=>setList({data:null,error:e.message}));},[]);
 return <section className="studio-panel"><h1>Projecten</h1>
  <div className="model-actions"><Link href="/nieuw" className="primary-button">Nieuw project</Link><Link href="/project/bolsward" className="download">Startinstelling Bolsward</Link></div>
  <p className="wind-note">Bolsward: Windpark Fryslân 10 % (38,3 van 382,7 MW) en Windpark Beabuorren 100 % (10,4 MW), KNMI Houtribdijk + Stavoren, WINS50. Dezelfde keten als op mijnwindpark.nl, nu met eigen keuzes.</p>
  {list.error&&<p className="live-error" role="alert">{list.error}</p>}
  {list.data&&(list.data.projecten.length?<table className="studio-table"><thead><tr><th>Naam</th><th>Locatie</th><th>Parken</th><th>Laatst gewijzigd</th></tr></thead><tbody>{list.data.projecten.map((p:any)=><tr key={p.id}><td><Link href={'/project/'+p.id}>{p.naam}</Link></td><td>{p.locatie?`${nl(p.locatie.lat,3)}° N ${nl(p.locatie.lon,3)}° E`:'–'}</td><td>{p.parken}</td><td>{new Date(p.gewijzigd).toLocaleString('nl-NL',{dateStyle:'medium',timeStyle:'short'})}</td></tr>)}</tbody></table>:<p>Nog geen bewaarde projecten.</p>)}
 </section>;
}

// ---------------------------------------------------------------- stap 2: elektrolyser
function VariantsStep({project,set,models,byId,catalogueError}:{project:any;set:(f:(p:any)=>any)=>void;models:any[];byId:Map<string,any>;catalogueError:string}){
 const [tech,setTech]=useState(''),[maker,setMaker]=useState(''),[minMW,setMin]=useState(''),[maxMW,setMax]=useState('');
 const target=project.algemeen.doel_mw||DEFAULT_TARGET_MW,limit=project.algemeen.limiet||defaultLimit();
 const techs=[...new Set(models.map(m=>m.technology).filter(Boolean))].sort(),makers=[...new Set(models.map(m=>m.manufacturer).filter(Boolean))].sort();
 const shown=models.filter(m=>(!tech||m.technology===tech)&&(!maker||m.manufacturer===maker)&&(!minMW||(m.power.value??0)>=Number(minMW.replace(',','.')))&&(!maxMW||(m.power.value??Infinity)<=Number(maxMW.replace(',','.'))));
 const moduleMW=(m:any)=>m?.power?.value?stackPowerMW(m.power.value,m.boundary?.value):null;
 const update=(id:string,change:any)=>set(p=>({...p,varianten:p.varianten.map((v:any)=>v.id===id?{...v,...change}:v)}));
 const fill=(v:any)=>{const f=fillToTarget(moduleMW(byId.get(v.modelId)),target);if(f)update(v.id,{modules:f.modules});};
 const resolve=(v:any)=>{const m=byId.get(v.modelId);if(!m)return;const r=autoResolve(m,v,project.algemeen,{target,limit});set(p=>({...p,varianten:p.varianten.map((x:any)=>x.id===v.id?r.setup:x)}));};
 return <section className="studio-panel"><h2>Elektrolyser: varianten</h2>
  <p className="wind-note">De hele catalogus van de Waterstofatlas (uitgeschakelde fabrikanten weg: {DISABLED_MANUFACTURERS.join(', ')}). Een variant is één model × aantal units; geen mix van modellen in één installatie.</p>
  {catalogueError&&<p className="live-error" role="alert">{catalogueError}</p>}
  <div className="model-grid"><label>Technologie<select value={tech} onChange={e=>setTech(e.target.value)}><option value="">Alle</option>{techs.map(t=><option key={t}>{t}</option>)}</select></label>
   <label>Fabrikant<select value={maker} onChange={e=>setMaker(e.target.value)}><option value="">Alle</option>{makers.map(t=><option key={t}>{t}</option>)}</select></label>
   <label>Modulevermogen vanaf (MW)<input inputMode="decimal" value={minMW} onChange={e=>setMin(e.target.value)}/></label><label>tot (MW)<input inputMode="decimal" value={maxMW} onChange={e=>setMax(e.target.value)}/></label>
   <label>Doelvermogen stack (MW)<input inputMode="decimal" value={String(target).replace('.',',')} onChange={e=>{const n=Number(e.target.value.replace(',','.'));if(n>0&&n<=100000)set(p=>({...p,algemeen:{...p.algemeen,doel_mw:n}}));}}/></label></div>
  <p className="wind-note">{shown.length} van {models.length} modellen.</p>
  <ol className="studio-variants">{project.varianten.map((v:any,i:number)=>{const m=byId.get(v.modelId),r=resolveSetup(m,v,project.algemeen,{target,limit});return <li key={v.id}>
   <div className="studio-variant-head"><strong>Variant {letter(i)}</strong><label className="inline-check"><input type="radio" name="referentie" checked={project.referentie===i} onChange={()=>set(p=>({...p,referentie:i}))}/> referentie</label>{project.varianten.length>1&&<button type="button" className="text-button" onClick={()=>set(p=>({...p,varianten:p.varianten.filter((x:any)=>x.id!==v.id),referentie:0}))}>Verwijderen</button>}</div>
   <div className="model-grid"><label>Model<select value={v.modelId} onChange={e=>{const nm=byId.get(e.target.value),f=fillToTarget(moduleMW(nm),target);update(v.id,{modelId:e.target.value,modules:f?.modules||1,choices:{}});}}><option value="">Kies een model…</option>{(m&&!shown.includes(m)?[m,...shown]:shown).map(x=><option key={x.id} value={x.id}>{x.manufacturer} · {x.name} · {nl(x.power.value,2)} MW</option>)}</select></label>
    <label>Aantal units<input type="number" min="1" max={MAX_MODULES} value={v.modules} onChange={e=>{const n=Math.round(Number(e.target.value));if(n>=1&&n<=MAX_MODULES)update(v.id,{modules:n});}}/></label>
    <div className="model-actions"><button type="button" className="download" disabled={!m} onClick={()=>fill(v)}>Vul aan tot {nl(target,1)} MW</button></div></div>
   {r.ready?<p className="wind-note">Klaar: {nl(r.nominalMW,2)} MW nominaal, {nl(r.intakeMW,2)} MW opname bij vollast (stack + BoP).</p>:<div className="wind-note"><ul>{r.problems.map((p:string)=><li key={p}>{p}</li>)}</ul>{m&&<button type="button" className="text-button" onClick={()=>resolve(v)}>Vul open punten in met voorzichtige aannames</button>}</div>}
  </li>;})}</ol>
  <div className="model-actions"><button type="button" className="download" disabled={project.varianten.length>=MAX_VARIANTS} onClick={()=>set(p=>({...p,varianten:[...p.varianten,newSetup(makeId())]}))}>Variant toevoegen</button></div>
 </section>;
}

// ---------------------------------------------------------------- stap 3: windparken
function ParksStep({project,set,parks}:{project:any;set:(f:(p:any)=>any)=>void;parks:any[]|null}){
 const [q,setQ]=useState('');
 const origin=project.locatie||{lat:53.066,lon:5.531};
 const list=useMemo(()=>(parks||[]).map(f=>({f,km:kmBetween(origin,{lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]})})).filter(x=>!q||`${x.f.properties.naam} ${x.f.properties.plaats} ${x.f.properties.gemeente}`.toLowerCase().includes(q.toLowerCase())).sort((a,b)=>a.km-b.km).slice(0,q?50:12),[parks,q,origin.lat,origin.lon]);
 const add=(f:any)=>{const park=parkFromFeature(f);set(p=>p.parken.some((x:any)=>x.id===park.id)?p:{...p,parken:[...p.parken,{...park,aandeel:0,stations:[]}]});};
 const update=(id:string,change:any)=>set(p=>({...p,parken:p.parken.map((x:any)=>x.id===id?{...x,...change,herkomst:{...x.herkomst,...Object.fromEntries(Object.keys(change).filter(k=>k!=='aandeel').map(k=>[k,'eigen invoer']))}}:x)}));
 const num=(t:string)=>Number(t.replace(',','.'));
 return <section className="studio-panel"><h2>Windparken en vermogen</h2>
  <p className="wind-note">Bestaande parken van de kaart (OpenStreetMap), heel Nederland. Klik een park op de kaart of in de lijst. Per park vul je in hoeveel MW de elektrolyser mag pakken: op elk moment hetzelfde deel van de productie, zonder aftopping.</p>
  <StudioMap project={project} parks={parks} onPark={add} height={340}/>
  <div className="model-grid"><label>Zoek op naam, plaats of gemeente<input type="search" value={q} onChange={e=>setQ(e.target.value)}/></label></div>
  <table className="studio-table"><thead><tr><th>Park</th><th>Plaats</th><th>MW</th><th>Afstand</th><th/></tr></thead><tbody>{list.map(({f,km})=><tr key={f.geometry.coordinates.join()}><td>{f.properties.naam}</td><td>{f.properties.plaats||f.properties.gemeente}</td><td>{nl(f.properties.mw)}</td><td>{nl(km)} km</td><td><button type="button" className="text-button" onClick={()=>add(f)}>Toevoegen</button></td></tr>)}</tbody></table>
  <h3>Gekozen parken</h3>{!project.parken.length&&<p>Nog geen parken gekozen.</p>}
  {project.parken.map((p:any)=>{const cap=parkMW(p),mw=p.aandeel*cap;return <fieldset key={p.id} className="studio-park"><legend>{p.naam}{p.model?` · ${p.model}`:''} · {nl(kmBetween(origin,p))} km</legend>
   <div className="model-grid"><label>MW voor de elektrolyser<input inputMode="decimal" defaultValue={nl(mw,1)} key={p.id+p.aandeel} onBlur={e=>{const v=num(e.target.value);if(v>=0&&v<=cap)set(x=>({...x,parken:x.parken.map((y:any)=>y.id===p.id?{...y,aandeel:v/cap}:y)}));}}/><small>{nl(p.aandeel*100,1)} % van {nl(cap,1)} MW</small></label>
    <label>Turbines <Chip kind={p.herkomst?.turbines}/><input type="number" min="1" value={p.turbines} onChange={e=>{const v=Math.round(num(e.target.value));if(v>=1&&v<=1000)update(p.id,{turbines:v});}}/></label>
    <label>Turbinevermogen (kW) <Chip kind={p.herkomst?.rated_kw}/><input type="number" min="100" value={p.rated_kw} onChange={e=>{const v=num(e.target.value);if(v>=100&&v<=20000)update(p.id,{rated_kw:v});}}/></label>
    <label>Ashoogte (m) <Chip kind={p.herkomst?.hub_height_m}/><input type="number" min="20" max="250" value={p.hub_height_m} disabled={p.hoogte==='wins50'} onChange={e=>{const v=num(e.target.value);if(v>=20&&v<=250)update(p.id,{hub_height_m:v});}}/>{p.hoogte==='wins50'&&<small>WINS50-maandfactor</small>}</label>
    <label>Zogverlies (%) <Chip kind={p.herkomst?.wake_pct}/><input type="number" min="0" max="30" value={p.wake_pct} onChange={e=>{const v=num(e.target.value);if(v>=0&&v<=30)update(p.id,{wake_pct:v});}}/></label></div>
   <p className="wind-note">{p.curve==='standaard'?'Standaardcurve: genormaliseerde SWT-DD-130 van Fryslân, geschaald naar het turbinevermogen (aanname). Hoogtevertaling seizoens-α 0,115 ± 0,065 (aanname, geijkt op Fryslân).':'Bekend parkmodel met eigen turbinecurve en WINS50-hoogtevertaling.'} {project.id&&!project.vast?<Link href={`/project/${project.id}/park/${encodeURIComponent(p.id)}`}>Windparkpagina →</Link>:project.vast?<Link href={`/project/bolsward/park/${p.id}`}>Windparkpagina →</Link>:'Bewaar het project voor de windparkpagina.'}</p>
   <button type="button" className="text-button" onClick={()=>set(x=>({...x,parken:x.parken.filter((y:any)=>y.id!==p.id)}))}>Park verwijderen</button></fieldset>;})}
 </section>;
}

// ---------------------------------------------------------------- stap 4: stations
function StationsStep({project,set,index}:{project:any;set:(f:(p:any)=>any)=>void;index:any}){
 if(!index)return <section className="studio-panel"><h2>KNMI-meetpunten</h2><p role="status">Stations laden…</p></section>;
 const choose=(id:string,stations:string[])=>set(p=>({...p,parken:p.parken.map((x:any)=>x.id===id?{...x,stations}:x)}));
 return <section className="studio-panel"><h2>KNMI-meetpunten</h2>
  <p className="wind-note">Voorstel: het dichtstbijzijnde station met minstens 90 % dekking in elk windjaar; ligt het tweede zulke station ook binnen 25 km, dan als alternatief het gemiddelde van die twee (zoals Houtribdijk + Stavoren bij Bolsward). Bij meer stations telt een moment alleen als alle stations meten.{index.voorlopig?' Van een deel van de stations is de dekking nog niet opgehaald.':''}</p>
  {!project.parken.length&&<p>Kies eerst windparken.</p>}
  {project.parken.map((p:any)=>{const s=suggestStations(p,index),warn=stationWarnings(s.lijst,p.stations);return <fieldset key={p.id} className="studio-park"><legend>{p.naam}</legend>
   <div className="model-actions">{s.voorstel.enkel.length>0&&<button type="button" className="download" onClick={()=>choose(p.id,s.voorstel.enkel)}>Voorstel: {stationName(s.voorstel.enkel[0])}</button>}{s.voorstel.paar&&<button type="button" className="download" onClick={()=>choose(p.id,s.voorstel.paar!)}>Alternatief: {s.voorstel.paar.map(stationName).join(' + ')}</button>}{p.stations.length>0&&project.parken.length>1&&<button type="button" className="text-button" onClick={()=>set(x=>({...x,parken:x.parken.map((y:any)=>({...y,stations:[...p.stations]}))}))}>Gebruik voor alle parken</button>}</div>
   <table className="studio-table"><thead><tr><th/><th>Station</th><th>Afstand</th>{index.jaren.map((y:number)=><th key={y}>{y}</th>)}<th>Gem. wind</th></tr></thead><tbody>{s.lijst.slice(0,10).map(st=><tr key={st.id}><td><input type="checkbox" aria-label={st.naam} checked={p.stations.includes(st.id)} onChange={e=>choose(p.id,e.target.checked?[...p.stations,st.id]:p.stations.filter((x:string)=>x!==st.id))}/></td><td>{st.naam}{st.zee?' (zee)':''}</td><td>{nl(st.km)} km</td>{index.jaren.map((y:number)=><td key={y}>{st.dekking[y]===undefined?'?':nl(st.dekking[y]*100,0)+' %'}</td>)}<td>{st.gemiddeld_ms===null?'–':nl(st.gemiddeld_ms,1)+' m/s'}</td></tr>)}</tbody></table>
   {warn.length>0&&<ul className="live-error">{warn.map(w=><li key={w}>{w}</li>)}</ul>}
  </fieldset>;})}
 </section>;
}

// ---------------------------------------------------------------- stap 5: beschikbaar vermogen
type Supplies={profile:string;supplies:any;summaries:any[];key:string}|null;
function useSupplies(project:any){
 const key=studioProfile(project),[state,setState]=useState<{result:Supplies;busy:boolean;error:string;done:number;total:number}>({result:null,busy:false,error:'',done:0,total:0});
 const run=useCallback(async()=>{
  const active=project.parken.filter((p:any)=>p.aandeel>0);
  if(!active.length){setState(s=>({...s,error:'Geef minstens één park vermogen voor de elektrolyser.'}));return;}
  if(active.some((p:any)=>!p.stations.length)){setState(s=>({...s,error:'Kies voor elk park met vermogen een KNMI-station.'}));return;}
  const ids=[...new Set(active.flatMap((p:any)=>p.stations))] as string[],tasks=YEARS.flatMap((y:number)=>ids.map(id=>[id,y] as [string,number]));
  setState({result:null,busy:true,error:'',done:0,total:tasks.length});
  try{
   const loaded=new Map<string,Float64Array>();let done=0;
   for(const [id,y] of tasks){loaded.set(id+'|'+y,await windSeries(id,y));setState(s=>({...s,done:++done}));}
   const supplies:any={},summaries:any[]=[];
   for(const y of YEARS){const s=buildSupply({jaar:y,parks:active,wind:Object.fromEntries(ids.map(id=>[id,loaded.get(id+'|'+y)])),axis:yearAxis(y)});supplies[y]={jaar:y,t:s.t,mw:s.mw};summaries.push({...supplySummary(s,active),park_mwh:s.park_mwh});}
   const profile=studioProfile(project);describeStudio(profile,studioWindText(project));
   setState({result:{profile,supplies,summaries,key},busy:false,error:'',done,total:tasks.length});
  }catch(e:any){setState(s=>({...s,busy:false,error:e.message||'Het aanbod kon niet worden berekend.'}));}
 },[key]);
 return {...state,result:state.result?.key===key?state.result:null,run};
}
function DurationChart({summaries,lines}:{summaries:any[];lines:{label:string;mw:number}[]}){
 const W=640,H=240,max=Math.max(1,...summaries.flatMap(s=>s.duurkromme),...lines.map(l=>l.mw))*1.05,colors=['#0C2340','#00A6DE','#F5A800','#7A9A01'];
 const x=(k:number)=>40+k/100*(W-50),y=(v:number)=>H-25-v/max*(H-35);
 return <svg viewBox={`0 0 ${W} ${H}`} className="studio-chart" role="img" aria-label="Duurkromme van het beschikbare vermogen per windjaar"><line x1="40" x2={W-10} y1={H-25} y2={H-25} stroke="currentColor" opacity=".4"/>
  {summaries.map((s,i)=><polyline key={s.jaar} fill="none" stroke={colors[i%4]} strokeWidth="2" points={s.duurkromme.map((v:number,k:number)=>`${x(k)},${y(v)}`).join(' ')}/>)}
  {lines.map((l,i)=><g key={l.label}><line x1="40" x2={W-10} y1={y(l.mw)} y2={y(l.mw)} stroke="#C00" strokeDasharray="4 3" opacity=".7"/><text x={W-12} y={y(l.mw)-3} textAnchor="end" fontSize="11">{l.label}: {nl(l.mw,1)} MW</text></g>)}
  {[0,0.5,1].map(f=><text key={f} x="36" y={y(max/1.05*f)+4} textAnchor="end" fontSize="11">{nl(max/1.05*f,0)}</text>)}
  <text x={W/2} y={H-6} textAnchor="middle" fontSize="11">deel van de tijd met minstens dit vermogen (0–100 %)</text>
  {summaries.map((s,i)=><text key={s.jaar} x={50+i*60} y="14" fontSize="12" fill={colors[i%4]}>■ {s.jaar}</text>)}</svg>;
}
function SupplyStep({project,supply,resolved}:{project:any;supply:ReturnType<typeof useSupplies>;resolved:any[]}){
 const allocated=project.parken.reduce((s:number,p:any)=>s+p.aandeel*parkMW(p),0);
 return <section className="studio-panel"><h2>Beschikbaar vermogen</h2>
  <p className="wind-note">Aanbod per tien minuten: de som over de parken van aandeel × gemodelleerd parkvermogen, uit de gekozen KNMI-stations. Toegewezen: {nl(allocated,1)} MW. Meetgaten vallen weg, ze tellen niet als nul.</p>
  <div className="model-actions"><button type="button" className="primary-button" disabled={supply.busy} onClick={()=>void supply.run()}>{supply.busy?`Winddata laden… ${supply.done} van ${supply.total}`:supply.result?'Opnieuw berekenen':'Bereken aanbod'}</button></div>
  {supply.error&&<p className="live-error" role="alert">{supply.error}</p>}
  {supply.result&&<><table className="studio-table"><thead><tr><th>Windjaar</th><th>Aanbod (MWh)</th><th>Vollasturen</th><th>Dekking</th><th>Momenten</th>{project.parken.filter((p:any)=>p.aandeel>0).map((p:any)=><th key={p.id}>{p.naam} (park, MWh)</th>)}</tr></thead>
   <tbody>{supply.result.summaries.map(s=><tr key={s.jaar}><td>{s.jaar}</td><td>{nl(s.mwh,0)}</td><td>{nl(s.vollasturen,0)}</td><td>{nl(s.dekking*100,1)} %</td><td>{s.momenten.toLocaleString('nl-NL')}</td>{project.parken.filter((p:any)=>p.aandeel>0).map((p:any)=><td key={p.id}>{nl(s.park_mwh[p.id],0)}</td>)}</tr>)}</tbody></table>
   <DurationChart summaries={supply.result.summaries} lines={resolved.map((r,i)=>r.ready?{label:`Variant ${letter(i)} (stack + BoP)`,mw:r.intakeMW}:null).filter(Boolean) as any}/>
   <p className="wind-note">Vollasturen = jaaraanbod ÷ toegewezen vermogen, omgerekend naar een heel jaar bij ontbrekende momenten. De stippellijnen tonen per variant de opname bij vollast.</p></>}
 </section>;
}

// ---------------------------------------------------------------- projecteditor
function Editor({initial}:{initial:any}){
 const [project,setProject]=useState<any>(initial),[step,setStep]=useState(0),[saving,setSaving]=useState(''),[dirty,setDirty]=useState(false);
 const set=useCallback((f:(p:any)=>any)=>{setProject((p:any)=>f(p));setDirty(true);},[]);
 const catalogue=useData('catalogue','/api/atlas/catalogue'),parks=useData('parks','/api/studio/parks'),index=useData('stations','/api/studio/stations');
 const interpreted=useMemo(()=>catalogueModels(catalogue.data) as any,[catalogue.data]);
 const byId=useMemo(()=>new Map<string,any>(interpreted.models.map((m:any)=>[m.id,m])),[interpreted]);
 const target=project.algemeen.doel_mw||DEFAULT_TARGET_MW,limit=project.algemeen.limiet||defaultLimit();
 const supply=useSupplies(project);
 const general=useMemo(()=>({...project.algemeen,years:project.jaren,wind:supply.result?.profile||studioProfile(project)}),[project.algemeen,project.jaren,supply.result]);
 const resolved=useMemo(()=>project.varianten.map((s:any)=>resolveSetup(byId.get(s.modelId),s,general,{target,limit})),[project.varianten,byId,general,target,limit]);
 const calc=useCalculator(supply.result?{profile:supply.result.profile,supplies:supply.result.supplies}:null);
 const save=async(copy=false)=>{
  setSaving('Bewaren…');
  try{const body=JSON.stringify({...project,naam:copy?project.naam+' (kopie)':project.naam});
   const saved=project.id&&!project.vast&&!copy?await getJSON('/api/studio/projects/'+project.id,{method:'PUT',headers:{'Content-Type':'application/json'},body}):await getJSON('/api/studio/projects',{method:'POST',headers:{'Content-Type':'application/json'},body});
   setProject(saved);setDirty(false);setSaving('Bewaard.');if(location.pathname!=='/project/'+saved.id)history.replaceState(null,'','/project/'+saved.id);}
  catch(e:any){setSaving(e.message);}
 };
 useEffect(()=>{if(step===5&&!supply.result&&!supply.busy&&project.parken.some((p:any)=>p.aandeel>0&&p.stations.length))void supply.run();},[step]);
 const link=project.id&&!project.vast?`${location.origin}/project/${project.id}`:'';
 return <>
  <section className="studio-panel studio-project-head"><div className="model-grid"><label>Projectnaam<input value={project.naam} onChange={e=>set(p=>({...p,naam:e.target.value}))}/></label></div>
   <div className="model-actions">{!project.vast&&<button type="button" className="primary-button" onClick={()=>void save()}>{project.id?'Bewaren':'Project bewaren'}</button>}{(project.id||project.vast)&&<button type="button" className="download" onClick={()=>void save(true)}>Kopie maken</button>}<span className="wind-note" role="status">{saving}{dirty&&!saving?' Niet bewaarde wijzigingen.':''}</span></div>
   {project.vast&&<p className="wind-note">Startinstelling Bolsward: vast in de code en niet in R2. Pas aan wat je wilt en maak een kopie om te bewaren. De elektrolyser staat voorlopig in het centrum van Bolsward; dat verandert de getallen niet, want de stations liggen vast.</p>}
   {link&&<p className="wind-note">Deelbare link (alleen met het wachtwoord): <a href={link}>{link}</a></p>}</section>
  <nav className="electrolyser-tabs studio-steps" aria-label="Stappen">{STEPS.map((s,i)=><a key={s} href="#" aria-current={step===i?'page':undefined} onClick={e=>{e.preventDefault();setStep(i);}}><span className="tab-step" aria-hidden="true">{i+1}</span>{s}</a>)}</nav>
  {step===0&&<section className="studio-panel"><h2>Locatie van de elektrolyser</h2><p className="wind-note">Klik op de kaart of zoek een adres; de marker is te verslepen. Percelen verschijnen vanaf zoom 16.</p><StudioMap project={project} parks={parks.data?.features||null} onLocation={loc=>set(p=>({...p,locatie:{lat:Math.round(loc.lat*1e5)/1e5,lon:Math.round(loc.lon*1e5)/1e5}}))}/><p>{project.locatie?`Gekozen: ${nl(project.locatie.lat,5)}° N ${nl(project.locatie.lon,5)}° E.`:'Nog geen locatie gekozen.'}</p></section>}
  {step===1&&<VariantsStep project={project} set={set} models={interpreted.models} byId={byId} catalogueError={catalogue.error}/>}
  {step===2&&<ParksStep project={project} set={set} parks={parks.data?.features||null}/>}
  {step===3&&<StationsStep project={project} set={set} index={index.data}/>}
  {step===4&&<SupplyStep project={project} supply={supply} resolved={resolved}/>}
  {step===5&&(supply.result?<CompareTab setups={project.varianten} resolved={resolved} byId={byId} general={general} setGeneral={(f:any)=>set(p=>{const next=f({...p.algemeen,years:p.jaren});return {...p,jaren:next.years||p.jaren,algemeen:{...next,wind:undefined}};})} reference={Math.min(project.referentie,Math.max(0,resolved.filter((r:any)=>r.ready).length-1))} setReference={(i:number)=>set(p=>({...p,referentie:i}))} calc={calc} catalogue={catalogue.data} target={target} setTarget={(n:number)=>set(p=>({...p,algemeen:{...p.algemeen,doel_mw:n}}))} update={(id:string,change:(s:any)=>any)=>set(p=>({...p,varianten:p.varianten.map((s:any)=>s.id===id?change(s):s)}))} go={()=>setStep(1)} setActive={()=>{}} limit={limit} setLimit={(l:any)=>set(p=>({...p,algemeen:{...p.algemeen,limiet:l}}))} fillOpen={()=>set(p=>({...p,varianten:p.varianten.map((s:any)=>{const m=byId.get(s.modelId);return m?autoResolve(m,s,general,{target,limit}).setup:s;})}))} studio={{lead:'Alle varianten draaien op hetzelfde aanbod uit de gekozen windparken en KNMI-stations, met dezelfde aannames.',wind:studioWindText(project)}}/>
   :<SupplyStep project={project} supply={supply} resolved={resolved}/>)}
 </>;
}

// ---------------------------------------------------------------- windparkpagina
function DayChart({rows,bands,max}:{rows:{label:string;color:string;points:{t:number;v:number|null}[]}[];bands?:{t:number;lo:number|null;hi:number|null}[];max:number}){
 const W=720,H=260,t0=Math.min(...rows.flatMap(r=>r.points.map(p=>p.t))),t1=Math.max(...rows.flatMap(r=>r.points.map(p=>p.t)));
 const x=(t:number)=>44+(t-t0)/Math.max(1,t1-t0)*(W-54),y=(v:number)=>H-24-v/Math.max(1e-9,max)*(H-40);
 const path=(pts:{t:number;v:number|null}[])=>pts.map((p,i)=>p.v===null?'':`${i&&pts[i-1].v!==null?'L':'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
 if(!isFinite(t0))return <p>Geen metingen voor deze dag.</p>;
 return <svg viewBox={`0 0 ${W} ${H}`} className="studio-chart" role="img" aria-label="Gemodelleerd parkvermogen per tien minuten">
  {bands&&<path d={bands.filter(b=>b.lo!==null).map((b,i)=>`${i?'L':'M'}${x(b.t)},${y(b.hi!)}`).join('')+bands.filter(b=>b.lo!==null).reverse().map(b=>`L${x(b.t)},${y(b.lo!)}`).join('')+'Z'} fill="#00A6DE" opacity=".15"/>}
  {rows.map(r=><path key={r.label} d={path(r.points)} fill="none" stroke={r.color} strokeWidth="2"/>)}
  {[0,0.5,1].map(f=><text key={f} x="40" y={y(max*f)+4} textAnchor="end" fontSize="11">{nl(max*f,0)}</text>)}
  {[0,6,12,18].map(h=><text key={h} x={x(t0+h*3600000)} y={H-6} fontSize="11" textAnchor="middle">{h}:00</text>)}
  {rows.map((r,i)=><text key={r.label} x={60+i*170} y="14" fontSize="12" fill={r.color}>■ {r.label}</text>)}</svg>;
}
function ParkPage({projectId,parkId}:{projectId:string;parkId:string}){
 const [project,setProject]=useState<any>(projectId==='bolsward'?clone(BOLSWARD):null),[error,setError]=useState('');
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Amsterdam'});
 const [day,setDay]=useState(today),[compare,setCompare]=useState(false),[data,setData]=useState<any>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{if(projectId!=='bolsward')getJSON('/api/studio/projects/'+projectId).then(setProject,e=>setError(e.message));},[projectId]);
 const park=project?.parken.find((p:any)=>p.id===parkId);
 useEffect(()=>{if(!park)return;setBusy(true);setData(null);setError('');getJSON(`/api/studio/park-dag?${new URLSearchParams({project:projectId,park:parkId,dag:day,...(compare?{vergelijking:'1'}:{})})}`).then(setData,e=>setError(e.message)).finally(()=>setBusy(false));},[park?.id,day,compare]);
 if(error&&!project)return <p className="live-error">{error}</p>;
 if(!project)return <p role="status">Project laden…</p>;
 if(!park)return <p className="live-error">Dit park staat niet in het project.</p>;
 const cap=parkMW(park),pts=(list:any[])=>list.map(p=>({t:Date.parse(p.start),v:typeof p.powerMW==='number'?p.powerMW:null}));
 const csv=()=>{if(!data?.hours)return;const rows=[['uur','model_MWh','minuten','ontbrekende_minuten'],...data.hours.map((h:any)=>[h.hour,h.modelMWh===null?'':String(h.modelMWh).replace('.',','),h.minutes,h.missingMinutes])];const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+rows.map(r=>r.join(';')).join('\n')],{type:'text/csv'}));a.download=`${park.naam}-${day}.csv`;a.click();};
 const total=data?.hours?.reduce((s:number,h:any)=>h.modelMWh===null?s:s+h.modelMWh,0);
 return <section className="studio-panel"><p><Link href={'/project/'+projectId}>← {project.naam}</Link></p><h1>{park.naam}</h1>
  <p className="wind-note">{park.turbines} × {nl(park.rated_kw/1000,2)} MW = {nl(cap,1)} MW · ashoogte {park.hub_height_m} m · zogverlies {park.wake_pct} % · KNMI {park.stations.map(stationName).join(' + ')||'geen station'} · {nl(park.aandeel*100,0)} % naar de elektrolyser.</p>
  <div className="model-grid"><label>Dag<input type="date" value={day} max={today} onChange={e=>e.target.value&&setDay(e.target.value)}/></label><label className="inline-check"><input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)}/> Stationsvergelijking</label></div>
  {busy&&<p role="status">Laden…</p>}{error&&<p className="live-error" role="alert">{error}</p>}
  {data&&!compare&&<><DayChart max={cap} rows={[{label:'Model',color:'#0C2340',points:pts(data.intervals)}]}/><p className="wind-note">{data.windSource}</p><p>Dagenergie (model): {nl(total,1)} MWh{data.hours.some((h:any)=>h.modelMWh===null)?' over de uren met volledige data':''}. <button type="button" className="text-button" onClick={csv}>CSV per uur</button></p>
   <table className="studio-table"><thead><tr><th>Uur</th><th>Model (MWh)</th><th>Ontbrekend</th></tr></thead><tbody>{data.hours.map((h:any)=><tr key={h.hour}><td>{h.hour}:00</td><td>{nl(h.modelMWh,2)}</td><td>{h.missingMinutes?h.missingMinutes+' min':''}</td></tr>)}</tbody></table></>}
  {data&&compare&&<><DayChart max={cap} bands={data.combination.map((p:any)=>({t:Date.parse(p.start),lo:p.minMW,hi:p.maxMW}))} rows={[...data.stations.map((s:any,i:number)=>({label:s.naam,color:['#00A6DE','#F5A800','#7A9A01','#A0522D'][i%4],points:pts(s.intervals)})),{label:'Combinatie',color:'#0C2340',points:pts(data.combination)}]}/>
   <p className="wind-note">Elk station apart door hetzelfde parkmodel; de band is het verschil tussen de stations. {data.windSource}{data.unavailable.length?` Niet beschikbaar: ${data.unavailable.join(', ')}.`:''}</p></>}
  <p className="wind-note">HARMONIE-voorspelling voor projectparken: nog niet gebouwd (zie README, Projectstudio).</p>
 </section>;
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
 else if(m&&m[2])body=<ParkPage projectId={m[1]} parkId={decodeURIComponent(m[2])}/>;
 else if(m&&m[1]==='bolsward')body=<Editor key="bolsward" initial={clone(BOLSWARD)}/>;
 else if(m)body=loaded?.id===m[1]?(loaded.project?<Editor key={m[1]} initial={loaded.project}/>:<p className="live-error">{loaded.error}</p>):<p role="status">Project laden…</p>;
 else body=<ProjectList/>;
 return <div className="studio-shell"><header className="studio-header"><Link href="/" className="studio-brand">Projectstudio</Link><span className="studio-tag">intern · mijnwindpark.nl</span><form method="post" action="/auth/logout"><button type="submit" className="text-button">Uitloggen</button></form></header><main id="inhoud">{body}</main></div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
