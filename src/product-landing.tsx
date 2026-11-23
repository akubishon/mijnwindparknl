// Startpagina in de productweergave: mijnwindpark.nl gepresenteerd als platform, voor verkoopgesprekken.
// De tekst staat in product-content.mjs; de live cijfers komen uit de bestaande API's van de site.
import {useEffect,useState} from 'react';
import {ArrowDown,ArrowRight,Cable,CircleCheck,ClipboardCheck,Cpu,Database,Gauge,Handshake,Landmark,Layers,LayoutDashboard,Network,Scale,Users,Zap} from 'lucide-react';
import {SiteHeader,SiteNavigation} from './site-navigation';
import {EnergyFlow} from './landing';
import {setView} from './view-mode.mjs';
import {formatSignificant} from './number-format.mjs';
import {isStale,measuredNote} from './live-reading.mjs';
import {isDisabled,isElectrolyser} from './electrolyser-catalogue.mjs';
import {STATUS,closing,democase,demo,generalise,hero,offerings,platform,proof,segments,strengths,why} from './product-content.mjs';

type Status=keyof typeof STATUS;
const SEGMENT_ICONS:Record<string,typeof Zap>={waterstof:Zap,energiehubs:Network,participatie:Users,overheid:Landmark,financiers:Scale,ketenpartners:Handshake};
const LAYER_ICONS=[Database,Cpu,LayoutDashboard];
const OFFER_ICONS=[ClipboardCheck,Layers,Gauge,Cable];
const LIVE_EVERY_MS=15000;
const runFormat=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});

function StatusChip({status,note}:{status:Status;note?:string}){
 return <span className={'product-status product-status-'+status}>{STATUS[status]}{note&&<span className="product-status-note">{note}</span>}</span>;
}
function SectionHead({eyebrow,title,intro,id}:{eyebrow:string;title:string;intro?:string;id:string}){
 return <div className="landing-section-head product-section-head"><div><span className="card-eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2></div>{intro&&<p>{intro}</p>}</div>;
}

type Live={powerKW:number;timestamp:string}|null;
type Proof={live:Live|'error';years:number[]|null|'error';atlas:{models:number;makers:number}|null|'error';run:string|null|'error'};
// Vier onafhankelijke aanvragen; een mislukte aanvraag laat alleen die regel zien als niet beschikbaar.
function useProof():Proof{
 const [state,setState]=useState<Proof>({live:null,years:null,atlas:null,run:null});
 useEffect(()=>{
  const control=new AbortController();
  const put=(key:keyof Proof,value:any)=>{if(!control.signal.aborted)setState(s=>({...s,[key]:value}));};
  const get=(url:string)=>fetch(url,{signal:control.signal,headers:{Accept:'application/json'}}).then(r=>r.ok?r.json():Promise.reject(new Error(String(r.status))));
  get('/api/catalog').then(d=>{const years=(d?.values||[]).filter(Number.isInteger);put('years',years.length?years:'error');}).catch(()=>put('years','error'));
  get('/api/atlas/catalogue').then(d=>{const models=(d?.models||[]).filter((m:any)=>isElectrolyser(m)&&!isDisabled(m));put('atlas',models.length?{models:models.length,makers:new Set(models.map((m:any)=>m.manufacturer)).size}:'error');}).catch(()=>put('atlas','error'));
  get('/api/harmonie?model=p1').then(d=>put('run',typeof d?.run==='string'&&Number.isFinite(Date.parse(d.run))?d.run:'error')).catch(()=>put('run','error'));
  const live=()=>{if(document.hidden)return;get('/api/live').then(d=>put('live',Number.isFinite(d?.powerKW)&&typeof d?.timestamp==='string'?{powerKW:d.powerKW,timestamp:d.timestamp}:'error')).catch(()=>put('live','error'));};
  live();const timer=setInterval(live,LIVE_EVERY_MS);
  const visible=()=>{if(!document.hidden)live();};document.addEventListener('visibilitychange',visible);
  return()=>{control.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[]);
 return state;
}

function ProofRow({label,value,unit,note,live=false}:{label:string;value:string;unit?:string;note:string;live?:boolean}){
 return <div className={'product-proof-row'+(live?' product-proof-live':'')}><dt>{live&&<span className="product-pulse" aria-hidden="true"/>}{label}</dt><dd><span className="product-proof-value">{value}</span>{unit&&<>{' '}<span className="product-proof-unit">{unit}</span></>}</dd><dd className="product-proof-note">{note}</dd></div>;
}
function ProofPanel(){
 const p=useProof();
 const pending=(v:unknown)=>v===null,failed=(v:unknown)=>v==='error';
 const shown=(v:unknown,text:()=>string)=>pending(v)?proof.loading:failed(v)?'—':text();
 const live=p.live&&p.live!=='error'?p.live:null,stale=live?isStale(live.timestamp):false;
 const years=Array.isArray(p.years)?p.years:null,atlas=p.atlas&&p.atlas!=='error'?p.atlas:null,run=typeof p.run==='string'&&p.run!=='error'?p.run:null;
 return <aside className="product-proof" aria-labelledby="product-proof-title"><p className="product-proof-title" id="product-proof-title">{proof.title}</p><dl>
  <ProofRow live={!!live&&!stale} label={stale?proof.liveLast:proof.liveNow} value={shown(p.live,()=>formatSignificant(live!.powerKW/1000))} unit={live?'MW':undefined} note={live?measuredNote(live.timestamp):failed(p.live)?proof.unavailable:proof.loading}/>
  <ProofRow label={proof.years} value={shown(p.years,()=>years!.length>1?`${Math.min(...years!)}–${Math.max(...years!)}`:String(years![0]))} note={failed(p.years)?proof.unavailable:proof.yearsNote}/>
  <ProofRow label={proof.catalogue} value={shown(p.atlas,()=>String(atlas!.models))} note={atlas?proof.catalogueNote.replace('{0}',String(atlas.makers)):failed(p.atlas)?proof.unavailable:proof.loading}/>
  <ProofRow label={proof.forecast} value={shown(p.run,()=>runFormat.format(Date.parse(run!)))} note={failed(p.run)?proof.unavailable:proof.forecastNote}/>
  <ProofRow label={proof.windYears} value={proof.windYearsValue} note={proof.windYearsNote}/>
  <ProofRow label={proof.stations} value={proof.stationsValue} note={proof.stationsNote}/>
 </dl></aside>;
}

function Hero(){
 return <section className="landing-hero product-hero" aria-labelledby="product-title"><div className="landing-hero-copy"><div className="eyebrow">{hero.eyebrow}</div><h1 id="product-title">{hero.titleStart} <span>{hero.titleEnd}</span></h1><p>{hero.lead}</p><div className="product-actions"><a className="product-button" href={hero.primary.href}>{hero.primary.label}<ArrowRight size={18} aria-hidden="true"/></a><a className="landing-jump" href={hero.secondary.href}>{hero.secondary.label}<ArrowDown size={18} aria-hidden="true"/></a></div><p className="product-hero-note">{hero.note}</p></div><ProofPanel/></section>;
}

function WhyNow(){
 return <section className="product-section" aria-labelledby="why-title"><SectionHead id="why-title" eyebrow={why.eyebrow} title={why.title} intro={why.intro}/>
  <div className="product-facts">{why.facts.map(f=><article className="product-fact" key={f.figure}><p className="product-fact-figure">{f.figure}</p><p className="product-fact-text">{f.text}</p><p className="product-fact-implication">{f.implication}</p><p className="product-fact-source"><span>{why.sourceLabel}</span> <a href={f.url} target="_blank" rel="noopener noreferrer">{f.source}</a></p></article>)}</div>
  <p className="product-law">{why.law}</p>
 </section>;
}

function Platform(){
 return <section className="product-section" aria-labelledby="platform-title"><SectionHead id="platform-title" eyebrow={platform.eyebrow} title={platform.title} intro={platform.intro}/>
  <p className="product-legend"><span><CircleCheck size={16} aria-hidden="true"/>{STATUS.live}</span><StatusChip status="next"/><StatusChip status="roadmap"/></p>
  <div className="product-layers">{platform.layers.map((layer,i)=>{const Icon=LAYER_ICONS[i];return <article className="product-layer" key={layer.title}><div className="product-layer-head"><span className="product-layer-step" aria-hidden="true">{i+1}</span><Icon size={22} strokeWidth={1.6} aria-hidden="true"/><h3>{layer.title}</h3></div><ul>{layer.items.map(item=><li key={item.text} className={'product-item-'+item.status}><span>{item.text}</span>{item.status==='live'?<span className="product-check"><CircleCheck size={18} aria-hidden="true"/><span className="product-sr">{STATUS.live}</span></span>:<StatusChip status={item.status as Status}/>}</li>)}</ul></article>;})}</div>
 </section>;
}

function Segments(){
 return <section className="product-section" id="doelgroepen" aria-labelledby="segments-title"><SectionHead id="segments-title" eyebrow={segments.eyebrow} title={segments.title} intro={segments.intro}/>
  <div className="product-segments">{segments.items.map(s=>{const Icon=SEGMENT_ICONS[s.id]||Zap;return <article className="product-segment" key={s.id}><div className="destination-top"><span className="destination-icon"><Icon size={24} strokeWidth={1.5} aria-hidden="true"/></span><span>{s.tag}</span></div><h3>{s.title}</h3><p className="product-question">{s.question}</p><p className="product-label">{segments.deliverLabel}</p><ul>{s.deliver.map(d=><li key={d}>{d}</li>)}</ul><div className="product-segment-foot"><StatusChip status={s.status as Status} note={s.statusNote}/><p className="product-label">{segments.demoLabel}</p><div className="product-demo-links">{s.demo.map(d=><a key={d.href} href={d.href}>{d.label}<ArrowRight size={15} aria-hidden="true"/></a>)}</div></div></article>;})}</div>
 </section>;
}

function Offerings(){
 return <section className="product-section" aria-labelledby="offer-title"><SectionHead id="offer-title" eyebrow={offerings.eyebrow} title={offerings.title}/>
  <div className="product-offers">{offerings.items.map((o,i)=>{const Icon=OFFER_ICONS[i];return <article className="product-offer" key={o.title}><Icon size={24} strokeWidth={1.5} aria-hidden="true"/><h3>{o.title}</h3><p>{o.text}</p><dl><div><dt>{offerings.forLabel}</dt><dd>{o.for}</dd></div><div><dt>{offerings.formLabel}</dt><dd>{o.form}</dd></div></dl></article>;})}</div>
 </section>;
}

function Strengths(){
 return <section className="product-section" aria-labelledby="strength-title"><SectionHead id="strength-title" eyebrow={strengths.eyebrow} title={strengths.title}/>
  <ol className="product-strengths">{strengths.items.map(s=><li key={s.title}><h3>{s.title}</h3><p>{s.text}</p></li>)}</ol>
 </section>;
}

function DemoRoute(){
 return <section className="product-section product-demo" id="demo" aria-labelledby="demo-title"><SectionHead id="demo-title" eyebrow={demo.eyebrow} title={demo.title} intro={demo.intro}/>
  <ol className="product-steps">{demo.steps.map((s,i)=><li key={s.href}><span className="product-step-number" aria-hidden="true">{i+1}</span><div><h3>{s.title}</h3><p>{s.text}</p><p className="product-ask"><span>{demo.askLabel}</span>{s.ask}</p></div><a className="product-step-open" href={s.href} aria-label={`${demo.openLabel}: ${s.title}`}>{demo.openLabel}<ArrowRight size={16} aria-hidden="true"/></a></li>)}</ol>
 </section>;
}

function Generalise(){
 return <section className="product-section" aria-labelledby="general-title"><SectionHead id="general-title" eyebrow={generalise.eyebrow} title={generalise.title}/>
  <table className="product-table"><thead><tr><th scope="col">{generalise.nowLabel}</th><th scope="col">{generalise.nextLabel}</th><th scope="col">{generalise.statusLabel}</th></tr></thead><tbody>{generalise.rows.map(r=><tr key={r.now}><td><span className="product-cell-label">{generalise.nowLabel}</span>{r.now}</td><td><span className="product-cell-label">{generalise.nextLabel}</span>{r.next}</td><td><span className="product-cell-label">{generalise.statusLabel}</span><StatusChip status={r.status as Status}/></td></tr>)}</tbody></table>
 </section>;
}

export default function ProductLanding(){
 return <div className="shell landing-shell product-shell"><SiteHeader/><main id="inhoud"><SiteNavigation current="/"/>
  <Hero/>
  <WhyNow/>
  <Platform/>
  <Segments/>
  <Offerings/>
  <Strengths/>
  <DemoRoute/>
  <Generalise/>
  <div className="product-democase" id="democase"><p className="product-democase-intro"><span className="card-eyebrow">{democase.eyebrow}</span><span>{democase.intro}</span></p><EnergyFlow/></div>
  <section className="product-closing" id="volgende-stap" aria-labelledby="closing-title"><div><span className="card-eyebrow">{closing.eyebrow}</span><h2 id="closing-title">{closing.title}</h2><p>{closing.text}</p></div><div className="product-actions"><a className="product-button" href={hero.primary.href}>{hero.primary.label}<ArrowRight size={18} aria-hidden="true"/></a><a className="product-button product-button-light" href="#demo">{closing.back}</a><button type="button" className="product-button product-button-light" onClick={()=>{setView('project');window.scrollTo({top:0});}}>{closing.project}</button></div></section>
  <footer className="landing-footer"><a href="/" aria-label="Mijnwindpark.nl startpagina">mijnwindpark.nl</a><span>{closing.footer}</span><a href="#inhoud">Terug naar boven <ArrowDown size={14} aria-hidden="true"/></a></footer>
 </main></div>;
}
