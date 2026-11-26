// Stap 3: windparken en vermogen (concept A). Kaart met alle parken, gekozen parken als kaarten, parken in de buurt als lijst.
import {useMemo,useState} from 'react';
import {Search,Plus,Trash2,ChevronRight} from 'lucide-react';
import {StudioMap} from '../map';
import {parkFromFeature,parkMW,kmBetween} from '../park-model.mjs';
import {allocatedMW} from '../status.mjs';
import {nl,Link} from '../lib';
import {Card,Chip,NumberField,Slider,StepHead,Details,Empty,Seg,Skeleton,Notice,Info} from '../ui/kit';

// Landnaam achter de plaats, alleen buiten Nederland.
const LANDEN:Record<string,string>={NL:'Nederland',DE:'Duitsland',BE:'België',DK:'Denemarken',LU:'Luxemburg'};
const where=(p:any)=>[p.plaats||p.gemeente||(p.provincie==='Zee'?'op zee':''),p.land&&p.land!=='NL'?LANDEN[p.land]:''].filter(Boolean).join(', ');

const featureKey=(f:any)=>`${f.geometry.coordinates[0].toFixed(4)},${f.geometry.coordinates[1].toFixed(4)}`;
// Id zoals de studio het park bewaart (Fryslân en Beabuorren worden herkend aan hun parkmidden).
const idOf=(f:any)=>f.properties?.id||parkFromFeature(f).id;

function ParkCard({park,origin,set,remove,link}:{park:any;origin:{lat:number;lon:number}|null;set:(change:any,mark?:boolean)=>void;remove:()=>void;link:string}){
 const cap=parkMW(park),mw=park.aandeel*cap,known=park.curve!=='standaard';
 const setMW=(v:number)=>set({aandeel:cap?Math.min(1,Math.max(0,Math.round(v*10)/10/cap)):0},false);
 return <article className={'s-park'+(park.aandeel>0?'':' s-park-off')}>
  <header><div><h3>{park.naam}</h3><p>{[where(park),origin?`${nl(kmBetween(origin,park))} km van de elektrolyser`:''].filter(Boolean).join(' · ')}</p></div>
   <div className="s-chips"><Chip tone={known?'dark':undefined}>{known?'bekend parkmodel':'standaardmodel'}</Chip><Chip tone={park.hoogte==='wins50'?undefined:'let'}>{park.hoogte==='wins50'?'WINS50':'seizoens-α'}</Chip></div>
   <button type="button" className="s-iconbtn" aria-label={`${park.naam} verwijderen`} onClick={remove}><Trash2 size={16}/></button></header>
  <div className="s-alloc">
   <div className="s-alloc-num"><small>Voor de elektrolyser</small><b>{nl(mw)}<i>MW</i></b><span>{nl(park.aandeel*100,park.aandeel*100%1?1:0)} % van {nl(cap)} MW</span></div>
   <Slider value={Math.round(mw*10)/10} min={0} max={Math.round(cap*10)/10} step={0.1} onChange={setMW} label={`MW voor de elektrolyser uit ${park.naam}`} marks={['0',nl(cap/2,0),`${nl(cap)} MW`]}/>
   <NumberField value={Math.round(mw*10)/10} min={0} max={Math.round(cap*10)/10} step={1} decimals={1} unit="MW" onChange={setMW} label={`MW voor de elektrolyser uit ${park.naam}`}/>
  </div>
  <Details summary="Parkgegevens" meta={`${park.turbines} × ${nl(park.rated_kw/1000,park.rated_kw%1000?1:0)} MW · ${park.hub_height_m} m · zog ${nl(park.wake_pct,park.wake_pct%1?1:0)} %`}>
   <div className="s-facts">
    <label><span>Turbines <Chip kind={park.herkomst?.turbines}/></span><NumberField value={park.turbines} min={1} max={1000} decimals={0} stepper={false} onChange={v=>set({turbines:v})} label="Aantal turbines"/></label>
    <label><span>Turbinevermogen <Chip kind={park.herkomst?.rated_kw}/></span><NumberField value={park.rated_kw} min={100} max={20000} decimals={0} step={100} unit="kW" stepper={false} onChange={v=>set({rated_kw:v})} label="Turbinevermogen in kW"/></label>
    <label><span>Ashoogte <Chip kind={park.herkomst?.hub_height_m}/></span><NumberField value={park.hub_height_m} min={20} max={250} decimals={0} unit="m" stepper={false} disabled={park.hoogte==='wins50'} onChange={v=>set({hub_height_m:v})} label="Ashoogte in meter"/></label>
    <label><span>Zogverlies <Chip kind={park.herkomst?.wake_pct}/></span><NumberField value={park.wake_pct} min={0} max={30} decimals={1} unit="%" stepper={false} onChange={v=>set({wake_pct:v})} label="Zogverlies in procent"/></label>
   </div>
   <p className="s-muted">{known?`Bekend parkmodel (${park.model||'eigen curve'}) met eigen turbinecurve en WINS50-hoogtevertaling; de ashoogte volgt uit WINS50.`:'Standaardcurve: de genormaliseerde SWT-DD-130-curve van Fryslân, geschaald naar het turbinevermogen (aanname). Hoogtevertaling met de seizoens-α 0,115 ± 0,065 (aanname, geijkt op Fryslân).'}</p>
  </Details>
  <div className="s-park-foot">{link?<Link href={link} className="s-textlink">Windparkpagina<ChevronRight size={15}/></Link>:<span className="s-muted">Bewaar het project voor de windparkpagina.</span>}</div>
 </article>;
}

export function ParksStep({project,set,parks}:{project:any;set:(f:(p:any)=>any)=>void;parks:{data:any;error:string}}){
 const [q,setQ]=useState(''),[land,setLand]=useState<string>('alle'),[sort,setSort]=useState<'km'|'mw'>('km'),[more,setMore]=useState(8),[fly,setFly]=useState<any>(null);
 const origin=project.locatie,features:any[]=parks.data?.features||[];
 const chosenIds=new Set(project.parken.map((p:any)=>p.id));
 const list=useMemo(()=>{
  const needle=q.trim().toLowerCase(),o=origin||{lat:52.6,lon:5.4};
  return features.map(f=>({f,km:kmBetween(o,{lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]})}))
   .filter(x=>!chosenIds.has(idOf(x.f))&&(land==='alle'||(x.f.properties.land||'NL')===land)&&(!needle||`${x.f.properties.naam} ${x.f.properties.plaats||''} ${x.f.properties.gemeente||''} ${x.f.properties.provincie||''} ${LANDEN[x.f.properties.land]||''}`.toLowerCase().includes(needle)))
   .sort((a,b)=>sort==='km'||needle?a.km-b.km:(b.f.properties.mw||0)-(a.f.properties.mw||0)||a.km-b.km);
 },[features,q,land,sort,origin?.lat,origin?.lon,project.parken]);
 const perLand=useMemo(()=>{const c:Record<string,{n:number;mw:number}>={};for(const f of features){const k=f.properties.land||'NL';c[k]||={n:0,mw:0};c[k].n++;c[k].mw+=f.properties.mw||0;}return c;},[features]);
 const shownList=sort==='mw'&&!q?list.filter(x=>x.km<=40):list;
 const add=(f:any)=>{const park=parkFromFeature(f);set(p=>p.parken.some((x:any)=>x.id===park.id)?p:{...p,parken:[...p.parken,{...park,aandeel:0,stations:[]}]});};
 const toggle=(f:any)=>{const id=idOf(f);if(chosenIds.has(id))set(p=>({...p,parken:p.parken.filter((x:any)=>x.id!==id)}));else add(f);};
 const update=(id:string,change:any,mark=true)=>set(p=>({...p,parken:p.parken.map((x:any)=>x.id===id?{...x,...change,herkomst:mark?{...x.herkomst,...Object.fromEntries(Object.keys(change).map(k=>[k,'eigen invoer']))}:x.herkomst}:x)}));
 const allocated=allocatedMW(project),active=project.parken.filter((p:any)=>p.aandeel>0).length;
 const linkFor=(p:any)=>project.vast?`/project/bolsward/park/${p.id}`:project.id?`/project/${project.id}/park/${encodeURIComponent(p.id)}`:'';
 return <>
  <StepHead n={3} title="Welke windparken leveren?">Kies bestaande parken op de kaart of in de lijst. Per park geef je aan hoeveel MW de elektrolyser mag pakken: op elk moment hetzelfde deel van de productie, zonder aftopping.</StepHead>
  {parks.error&&<Notice kind="fout" title="De parken konden niet worden geladen.">{parks.error}</Notice>}
  <Card className="s-mapcard">
   <StudioMap mode="parken" label="Kaart met windparken" locatie={origin} chosen={project.parken} parks={features} onPark={toggle} flyTo={fly} fitKey={'parken:'+project.parken.length} className="s-map-big">
    <div className="s-mapsearch"><Search size={16} aria-hidden="true"/><input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Zoek een park, plaats, regio of land" aria-label="Zoek een park, plaats, regio of land"/>
     {q.trim().length>1&&<ul className="s-hits">{list.slice(0,6).map(({f,km})=><li key={featureKey(f)}><button type="button" onClick={()=>{add(f);setFly({lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0],zoom:11,n:Date.now()});setQ('');}}><b>{f.properties.naam}</b><span>{where(f.properties)} · {f.properties.mw?nl(f.properties.mw)+' MW':'vermogen onbekend'} · {nl(km)} km</span></button></li>)}{!list.length&&<li className="s-hits-none">Geen park gevonden.</li>}</ul>}</div>
    <div className="s-maplegend"><span><i className="s-lg s-lg-h2"/>Elektrolyser</span><span><i className="s-lg s-lg-chosen"/>Gekozen park</span><span><i className="s-lg s-lg-park"/>Park (grootte = MW)</span></div>
   </StudioMap>
  </Card>
  <div className="s-sectionhead"><h2>Gekozen parken<Info label="Hoe het vermogen per park werkt">Je vult in hoeveel MW de elektrolyser van een park mag pakken. Dat is een vast deel van het park: aandeel = MW ÷ parkvermogen, op elk moment hetzelfde percentage van de productie, zonder aftopping. Bolsward: Fryslân 10 % (38,3 van 382,7 MW), Beabuorren 100 % (10,4 MW). Herkomst van de parkgegevens: <b>bron</b> = bekend parkmodel, <b>bron OSM</b> = OpenStreetMap, <b>aanname</b> = standaardwaarde, <b>eigen invoer</b> = door jou aangepast.</Info></h2><div className="s-total"><small>Totaal toegewezen</small><b>{nl(allocated)} MW</b><span>uit {active} {active===1?'park':'parken'}</span></div></div>
  {!project.parken.length&&<Card className="s-pad"><Empty title="Nog geen parken gekozen">Klik een park op de kaart of gebruik + in de lijst hieronder. Het voorstel begint bij de dichtstbijzijnde parken.</Empty></Card>}
  {project.parken.map((p:any)=><ParkCard key={p.id} park={p} origin={origin} set={(c,mark)=>update(p.id,c,mark)} remove={()=>set(x=>({...x,parken:x.parken.filter((y:any)=>y.id!==p.id)}))} link={linkFor(p)}/>)}
  <Card className="s-pad s-list">
   <div className="s-cardhead"><div><h2>{q?'Gevonden parken':'Meer parken in de buurt'}</h2><p className="s-sub">{q?`Zoekresultaten voor “${q}” in ${land==='alle'?'Nederland en de buurlanden':LANDEN[land]}.`:'Bestaande parken van de kaart (OpenStreetMap), in Nederland en de buurlanden. Geen afstandsgrens: de afstand is informatie.'}</p></div><Seg label="Sorteren" value={sort} onChange={setSort} options={[{value:'km',label:'Afstand'},{value:'mw',label:'Vermogen'}]}/></div>
   <div className="s-chips s-chips-left s-landen" role="group" aria-label="Land">{['alle','NL','DE','BE','DK','LU'].filter(k=>k==='alle'||perLand[k]).map(k=><button key={k} type="button" className={'s-landchip'+(land===k?' on':'')} aria-pressed={land===k} onClick={()=>{setLand(k);setMore(8);}}>{k==='alle'?'Alle landen':LANDEN[k]}{k!=='alle'&&<small>{nl(perLand[k].n,0)} parken · {nl(perLand[k].mw/1000,1)} GW</small>}</button>)}</div>
   {!parks.data&&!parks.error?<Skeleton lines={5}/>:<ul>{shownList.slice(0,more).map(({f,km})=><li key={featureKey(f)}><span className="s-size" style={{'--s':`${8+Math.sqrt(f.properties.mw||3)*1.6}px`} as any} aria-hidden="true"/><div><b>{f.properties.naam}</b><small>{where(f.properties)}{f.properties.turbines?` · ${f.properties.turbines} ${f.properties.turbines===1?'turbine':'turbines'}`:''}</small></div><span className="num">{f.properties.mw?nl(f.properties.mw)+' MW':'–'}</span><span className="num s-muted">{nl(km)} km</span><button type="button" className="s-addbtn" aria-label={`${f.properties.naam} toevoegen`} onClick={()=>add(f)}><Plus size={16}/></button></li>)}</ul>}
   {shownList.length>more&&<button type="button" className="s-btn s-btn-ghost s-btn-wide" onClick={()=>setMore(m=>m+8)}>Meer tonen ({shownList.length-more} over)</button>}
  </Card>
 </>;
}
