// Stap 1: locatie van de elektrolyser (kaartpodium). Klik, sleep of zoek een adres: PDOK Locatieserver in Nederland,
// Photon (OpenStreetMap) in de buurlanden.
import {useMemo,useState} from 'react';
import {Search,MapPin,ChevronLeft} from 'lucide-react';
import {StudioMap} from '../map';
import {Stage,useStagePadding} from './stage';
import {kmBetween} from '../park-model.mjs';
import {getJSON,nl,coords,Link} from '../lib';
import type {Step} from '../ui/StepRail';
import {photonSearch,type Hit} from '../geo';

const LOCATIE='https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';

export function LocationStep({project,set,parks,steps,onStep,kpis}:{project:any;set:(f:(p:any)=>any)=>void;parks:any[]|null;steps:Step[];onStep:(i:number)=>void;kpis:{allocated:number;stations:number;lets:number}}){
 const [q,setQ]=useState(''),[hits,setHits]=useState<Hit[]|null>(null),[busy,setBusy]=useState(false),[fly,setFly]=useState<any>(null);
 const loc=project.locatie,padding=useStagePadding();
 const place=(p:{lat:number;lon:number})=>set(x=>({...x,locatie:{lat:Math.round(p.lat*1e5)/1e5,lon:Math.round(p.lon*1e5)/1e5}}));
 const search=async()=>{if(!q.trim())return;setBusy(true);
  const pdok=getJSON(`${LOCATIE}?${new URLSearchParams({q,rows:'6',fl:'weergavenaam,centroide_ll,type'})}`).then((d:any)=>(d.response?.docs||[]).map((doc:any):Hit|null=>{const m=/POINT\(([\d.]+) ([\d.]+)\)/.exec(doc.centroide_ll||'');return m?{naam:doc.weergavenaam,lon:Number(m[1]),lat:Number(m[2]),adres:doc.type==='adres',soort:doc.type}:null;}).filter(Boolean) as Hit[]).catch(()=>[] as Hit[]);
  const abroad=photonSearch(q).catch(()=>[] as Hit[]);
  // Nederlandse treffers eerst; daarna de buurlanden, samen hoogstens acht.
  const [a,b]=await Promise.all([pdok,abroad]);setHits([...a.slice(0,b.length?5:6),...b].slice(0,8));setBusy(false);};
 const pick=(h:Hit)=>{setFly({lat:h.lat,lon:h.lon,zoom:h.adres?17:13,n:Date.now()});setHits(null);if(h.adres)place({lat:h.lat,lon:h.lon});};
 const nearest=useMemo(()=>loc&&parks?parks.map(f=>({f,km:kmBetween(loc,{lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]})})).sort((a,b)=>a.km-b.km).filter(x=>(x.f.properties.mw||0)>=5).slice(0,3):[],[loc?.lat,loc?.lon,parks]);
 return <Stage steps={steps} active={0} onStep={onStep} kpis={kpis} title="Waar komt de elektrolyser?"
  intro="Klik op de kaart of zoek een adres. De marker is te verslepen; percelen verschijnen vanaf zoom 16."
  prev={<Link href="/" className="s-btn s-btn-light"><ChevronLeft size={16}/>Projecten</Link>}
  next={{label:'Gebruik deze locatie',disabled:!loc,onClick:()=>onStep(1)}}
  map={<StudioMap mode="locatie" label="Kaart: klik om de elektrolyser te plaatsen" locatie={loc} chosen={project.parken} parks={null} onLocation={place} flyTo={fly} fitKey="locatie" padding={padding} className="s-map-fill"/>}>
  <form className="s-search s-search-dark" role="search" onSubmit={e=>{e.preventDefault();void search();}}>
   <Search size={16} aria-hidden="true"/><input type="search" value={q} onChange={e=>{setQ(e.target.value);if(!e.target.value)setHits(null);}} placeholder="Zoek een adres of plaats" aria-label="Zoek een adres of plaats"/><button type="submit" className="s-btn s-btn-mini" disabled={busy}>{busy?'Zoeken…':'Zoeken'}</button>
  </form>
  {hits&&<ul className="s-hits s-hits-dark">{hits.map(h=><li key={h.naam+h.lat}><button type="button" onClick={()=>pick(h)}><b>{h.naam}</b><span>{h.adres?'adres · zet de elektrolyser hier':h.soort}</span></button></li>)}{!hits.length&&<li className="s-hits-none">Niets gevonden.</li>}</ul>}
  {loc?<div className="s-place">
   <small>Gekozen plek</small><b><MapPin size={16} aria-hidden="true"/>{project.plaats||'Plaats opzoeken…'}</b><span>{coords(loc,5)}</span>
   {nearest.length>0&&<div className="s-nearest"><small>Dichtstbijzijnde parken (vanaf 5 MW)</small><ul>{nearest.map(({f,km})=><li key={f.geometry.coordinates.join()}><span>{f.properties.naam}</span><span className="num">{nl(f.properties.mw)} MW</span><span className="num">{nl(km)} km</span></li>)}</ul></div>}
  </div>:<div className="s-place s-place-empty"><MapPin size={18} aria-hidden="true"/><span>Nog geen plek gekozen. Klik op de kaart of zoek een adres.</span></div>}
  {project.vast&&<p className="s-sheet-note">Startinstelling Bolsward: de elektrolyser staat voorlopig in het centrum van Bolsward. Dat verandert de getallen niet, want de meetstations liggen vast.</p>}
 </Stage>;
}
