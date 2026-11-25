// Startpagina van intern.mijnwindpark.nl: projecten als kaarten met minikaart (concept C).
import {useEffect,useMemo,useState} from 'react';
import {Plus,Search,TriangleAlert} from 'lucide-react';
import {StaticMap,type MapPoint} from './ui/StaticMap';
import {Card,Chip,Eyebrow,Empty,Notice,Skeleton,Seg} from './ui/kit';
import {BOLSWARD} from './project.mjs';
import {allocatedMW} from './status.mjs';
import {parkMW} from './park-model.mjs';
import {getJSON,Link,nl,since,coords} from './lib';

const bolswardPoints:MapPoint[]=[...BOLSWARD.parken.map((p:any)=>({lat:p.lat,lon:p.lon,kind:'chosen' as const,r:4+Math.sqrt(parkMW(p))*.5})),{...BOLSWARD.locatie,kind:'h2'}];
const bolswardLines=BOLSWARD.parken.map((p:any)=>[BOLSWARD.locatie,p] as any);

export function ProjectList(){
 const [list,setList]=useState<{data:any;error:string}>({data:null,error:''}),[q,setQ]=useState(''),[sort,setSort]=useState<'recent'|'naam'>('recent');
 useEffect(()=>{document.title='Projecten · Projectstudio';getJSON('/api/studio/projects').then(data=>setList({data,error:''}),e=>setList({data:null,error:e.message}));},[]);
 const projects:any[]=list.data?.projecten||[];
 const shown=useMemo(()=>projects.filter(p=>!q||`${p.naam} ${p.plaats||''}`.toLowerCase().includes(q.toLowerCase())).sort((a,b)=>sort==='naam'?a.naam.localeCompare(b.naam,'nl'):String(b.gewijzigd).localeCompare(String(a.gewijzigd))),[projects,q,sort]);
 const hero:MapPoint[]=[...bolswardPoints,...projects.filter(p=>p.locatie).map(p=>({...p.locatie,kind:'h2' as const}))];
 return <main id="inhoud" className="s-home">
  <section className="s-hero">
   <div><Eyebrow>Projectstudio</Eyebrow><h1>Waar komt de volgende elektrolyser?</h1><p>Kies een plek, een elektrolyser en de windparken die leveren. De studio rekent het aanbod per tien minuten uit de KNMI-metingen en vergelijkt de varianten, zoals bij Bolsward.</p>
    <div className="s-hero-acts"><Link href="/nieuw" className="s-btn s-btn-cta s-btn-big"><Plus size={18}/>Nieuw project</Link><Link href="/project/bolsward" className="s-btn s-btn-ghost s-btn-big">Bolsward openen</Link></div></div>
   <div className="s-hero-map"><StaticMap points={hero} lines={bolswardLines} width={560} height={320} pad={0.35} label="Kaart met de projecten"/></div>
  </section>
  <div className="s-sectionhead"><h2>Projecten <span className="s-count">{projects.length+1}</span></h2>
   {projects.length>0&&<div className="s-tools"><span className="s-search s-search-small"><Search size={15} aria-hidden="true"/><input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Zoek project" aria-label="Zoek project"/></span><Seg label="Sorteren" value={sort} onChange={setSort} options={[{value:'recent',label:'Recent'},{value:'naam',label:'Naam'}]}/></div>}</div>
  {list.error&&<Notice kind="fout" title="De projectenlijst kon niet worden geladen.">{list.error}</Notice>}
  <div className="s-pgrid">
   {!q&&<Link href="/project/bolsward" className="s-pcard"><div className="s-thumb"><StaticMap points={bolswardPoints} lines={bolswardLines} width={340} height={150} label="Minikaart Bolsward"/><span className="s-badge">startinstelling</span></div>
    <div className="s-pbody"><h3>Bolsward</h3><p>Fryslân 10 % en Beabuorren 100 % · KNMI Houtribdijk + Stavoren</p><div className="s-pstats"><span><b>{nl(allocatedMW(BOLSWARD))}</b> MW</span><span><b>2</b> parken</span><span><b>2</b> varianten</span></div><Chip tone="dark">Startinstelling</Chip></div></Link>}
   {!list.data&&!list.error&&[0,1,2].map(i=><Card key={i} className="s-pcard s-pcard-loading"><Skeleton height={150}/><div className="s-pbody"><Skeleton lines={3}/></div></Card>)}
   {shown.map(p=>{const pts:MapPoint[]=[...(p.punten||[]).map(([lat,lon]:number[])=>({lat,lon,kind:'chosen' as const,r:5})),...(p.locatie?[{...p.locatie,kind:'h2' as const}]:[])];
    return <Link key={p.id} href={'/project/'+p.id} className="s-pcard"><div className="s-thumb">{pts.length?<StaticMap points={pts} lines={p.locatie?(p.punten||[]).map(([lat,lon]:number[])=>[p.locatie,{lat,lon}]):[]} width={340} height={150} label={`Minikaart ${p.naam}`}/>:<span className="s-thumb-none">Nog geen locatie</span>}</div>
     <div className="s-pbody"><h3>{p.naam}</h3><p>{p.plaats||coords(p.locatie)} · {since(p.gewijzigd)}</p><div className="s-pstats"><span><b>{typeof p.mw==='number'?nl(p.mw):'–'}</b> MW</span><span><b>{p.parken}</b> {p.parken===1?'park':'parken'}</span>{typeof p.varianten==='number'&&<span><b>{p.varianten}</b> {p.varianten===1?'variant':'varianten'}</span>}</div>
      {p.compleet===true?<Chip tone="dark">Klaar om te rekenen</Chip>:p.compleet===false?<Chip tone="let"><TriangleAlert size={12}/>Onvolledig</Chip>:null}</div></Link>;})}
   {!q&&<Link href="/nieuw" className="s-pcard s-pcard-new"><span><Plus size={22}/></span><b>Nieuw project</b><small>Begin leeg of maak een kopie van Bolsward</small></Link>}
  </div>
  {list.data&&!projects.length&&<Card className="s-pad s-home-empty"><Empty title="Nog geen bewaarde projecten">Begin met Bolsward of een nieuw project. Bewaarde projecten ziet iedereen met het wachtwoord.</Empty></Card>}
  {q&&!shown.length&&<Notice kind="info">Geen project gevonden voor “{q}”.</Notice>}
 </main>;
}
