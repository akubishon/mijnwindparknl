// Stap 5: beschikbaar vermogen. De berekening is ongewijzigd (buildSupply + supplySummary); hier komen alleen
// extra weergaven bij: warmtekaart per uur, aanbod per maand per park en het deel van de tijd zonder wind.
import {useCallback,useMemo,useState} from 'react';
import {Download,RefreshCw} from 'lucide-react';
import {buildSupply,supplySummary,yearAxis,YEARS} from '../supply.mjs';
import {parkMW} from '../park-model.mjs';
import {studioProfile,studioWindText} from '../project.mjs';
import {sourceLabel} from '../station-catalog.mjs';
import {describeStudio} from '../../electrolyser-wind.mjs';
import {allocatedMW,canComputeSupply} from '../status.mjs';
import {windSeries,localParts,localStamp,download,nl,letter} from '../lib';
import {Card,Tile,Notice,Progress,StepHead,Details,Loading,Empty} from '../ui/kit';
import {DurationChart,Heatmap,HeatLegend,MonthlyBars,SERIES,shareAbove} from '../ui/Chart';

export type Extras={cells:Float32Array;days:number;monthly:number[][];series:{label:string;color:string}[];quiet:number;max:number;csv:{t:number[];mw:number[]}};
export type SupplyResult={profile:string;supplies:any;summaries:any[];key:string;extras:Extras};

function extrasFor(s:any,active:any[],year:number):Extras{
 const days=new Date(Date.UTC(year,1,29)).getUTCMonth()===1?366:365,sum=new Float64Array(days*24),count=new Uint16Array(days*24),monthly=Array.from({length:12},()=>active.map(()=>0));
 const allocated=active.reduce((a,p)=>a+p.aandeel*parkMW(p),0);
 let quiet=0,max=0;
 for(let i=0;i<s.t.length;i++){
  const {year:y,month,day,hour}=localParts(s.t[i]),v=s.mw[i];
  if(v>max)max=v;if(v<allocated*.05)quiet++;
  if(y!==year)continue;
  const c=day*24+hour;sum[c]+=v;count[c]++;
  active.forEach((p,k)=>{monthly[month][k]+=p.aandeel*s.park_mw[p.id][i]/6;});
 }
 const cells=new Float32Array(days*24);for(let c=0;c<cells.length;c++)cells[c]=count[c]?sum[c]/count[c]:NaN;
 return {cells,days,monthly,series:active.map((p,k)=>({label:`${p.naam.replace(/^Windpark /,'')} (${nl(p.aandeel*parkMW(p))} MW)`,color:SERIES[k%SERIES.length]})),quiet:s.t.length?quiet/s.t.length:0,max,csv:{t:s.t,mw:s.mw}};
}

export function useSupplies(project:any){
 const key=studioProfile(project);
 const [state,setState]=useState<{result:SupplyResult|null;busy:boolean;error:string;done:number;total:number;stage:string}>({result:null,busy:false,error:'',done:0,total:0,stage:''});
 const run=useCallback(async()=>{
  const active=project.parken.filter((p:any)=>p.aandeel>0);
  if(!active.length){setState(s=>({...s,error:'Geef minstens één park vermogen voor de elektrolyser.'}));return;}
  if(active.some((p:any)=>!p.stations.length)){setState(s=>({...s,error:'Kies voor elk park met vermogen een meetstation.'}));return;}
  const ids=[...new Set(active.flatMap((p:any)=>p.stations))] as string[],tasks=YEARS.flatMap((y:number)=>ids.map(id=>[id,y] as [string,number]));
  setState({result:null,busy:true,error:'',done:0,total:tasks.length,stage:'Winddata laden'});
  try{
   const loaded=new Map<string,Float64Array>();let done=0;
   for(const [id,y] of tasks){loaded.set(id+'|'+y,await windSeries(id,y));setState(s=>({...s,done:++done}));}
   setState(s=>({...s,stage:'Aanbod berekenen'}));
   await new Promise(r=>setTimeout(r,30));
   const supplies:any={},summaries:any[]=[];let extras:Extras|null=null;
   for(const y of YEARS){
    const s=buildSupply({jaar:y,parks:active,wind:Object.fromEntries(ids.map(id=>[id,loaded.get(id+'|'+y)])),axis:yearAxis(y)});
    supplies[y]={jaar:y,t:s.t,mw:s.mw};summaries.push({...supplySummary(s,active),park_mwh:s.park_mwh});
    extras=extrasFor(s,active,y);
   }
   const profile=studioProfile(project);describeStudio(profile,studioWindText(project));
   setState({result:{profile,supplies,summaries,key,extras:extras!},busy:false,error:'',done,total:tasks.length,stage:''});
  }catch(e:any){setState(s=>({...s,busy:false,stage:'',error:e.message||'Het aanbod kon niet worden berekend.'}));}
 },[key]);
 return {...state,result:state.result?.key===key?state.result:null,run};
}
export type Supply=ReturnType<typeof useSupplies>;

export function SupplyStep({project,supply,resolved}:{project:any;supply:Supply;resolved:any[]}){
 const active=project.parken.filter((p:any)=>p.aandeel>0),allocated=allocatedMW(project),r=supply.result,s=r?.summaries[0],x=r?.extras;
 const stations=[...new Set(active.flatMap((p:any)=>p.stations))].map(id=>sourceLabel(id as string));
 const variants=resolved.map((v:any,i:number)=>v.ready?{label:letter(i),mw:v.intakeMW,color:['#0B7FAE','#8A9FB0','#00A6DE','#C5D1DB'][i%4],name:`${v.modules} × ${nl(v.moduleMW,v.moduleMW%1?2:0)} MW`,r:v}:null).filter(Boolean) as any[];
 // Opstelling tegenover het aanbod: hoe vaak haalt het aanbod de minimumlast en de vollast, en wat is overschot.
 const table=useMemo(()=>!x||!s?[]:variants.map(v=>{
  const minMW=(v.r.stackModuleMW||v.r.moduleMW)*(v.r.aannames?.minimumlast||0);
  let over=0;for(let i=0;i<x.csv.mw.length;i++)if(x.csv.mw[i]>v.mw)over+=(x.csv.mw[i]-v.mw)/6;
  return {label:v.label,name:v.name,intake:v.mw,minMW,aboveMin:shareAbove(s.duurkromme,minMW),aboveFull:shareAbove(s.duurkromme,v.mw),over};
 }),[x,s,resolved]);
 const csv=()=>{if(!x)return;const rows=['tijd (Nederlandse tijd);aanbod_MW',...x.csv.t.map((t,i)=>`${localStamp(t)};${String(x.csv.mw[i]).replace('.',',')}`)];download(`aanbod-${project.naam.replace(/[^\w-]+/g,'-')}-${s.jaar}.csv`,rows.join('\n'));};
 return <>
  <StepHead n={5} title="Beschikbaar vermogen" actions={r&&<button type="button" className="s-btn s-btn-ghost" onClick={csv}><Download size={16}/>CSV</button>}>
   {active.length?<>Het aanbod per tien minuten uit {active.map((p:any)=>p.naam.replace(/^Windpark /,'')).join(' en ')}, gemodelleerd met {stations.join(' + ')||'–'}. Windjaar {YEARS.join(', ')}. Dit is wat je opstelling per jaar te eten krijgt.</>:'Kies eerst windparken en KNMI-stations.'}
  </StepHead>
  {supply.busy&&<Card className="s-pad"><Loading>{supply.stage}{supply.stage==='Winddata laden'?`: ${supply.done} van ${supply.total} station-jaren`:'…'}</Loading><Progress value={supply.stage==='Winddata laden'?supply.done:supply.total} max={supply.total||1} label="Voortgang"/><p className="s-muted">Een station-jaar dat nog niet in de opslag staat, haalt de worker eenmalig op bij KNMI. Dat kan even duren.</p></Card>}
  {supply.error&&<Notice kind="fout" title="Het aanbod kon niet worden berekend." action={<button type="button" className="s-btn s-btn-ghost" onClick={()=>void supply.run()}><RefreshCw size={15}/>Opnieuw proberen</button>}>{supply.error}</Notice>}
  {!r&&!supply.busy&&!supply.error&&<Card className="s-pad"><Empty title={canComputeSupply(project)?'Nog niet berekend':'Nog niet te berekenen'} action={<button type="button" className="s-btn s-btn-cta" disabled={!canComputeSupply(project)} onClick={()=>void supply.run()}>Bereken aanbod</button>}>{canComputeSupply(project)?'De studio haalt de tienminutenwind van de gekozen stations op en rekent het aanbod per tien minuten.':'Geef minstens één park vermogen en kies voor elk park een KNMI-station.'}</Empty></Card>}
  {r&&s&&x&&<>
   <div className="s-tiles">
    <Tile main label={`Aanbod ${s.jaar}`} value={nl(s.mwh/1000,1)} unit="GWh" note={`uit ${nl(allocated)} MW toegewezen`}/>
    <Tile label="Vollasturen" value={nl(s.vollasturen,0)} unit="h" note="aanbod ÷ toegewezen vermogen"/>
    <Tile label="Piekvermogen" value={nl(x.max,1)} unit="MW" note="hoogste tienminutenwaarde"/>
    <Tile label="Gemiddeld vermogen" value={nl(s.mwh/(s.momenten/6),1)} unit="MW" note="over de momenten met data"/>
   </div>
   {table.length>0&&<Card className="s-pad"><div className="s-cardhead"><div><h2>Opstelling tegenover het aanbod</h2><p className="s-sub">Hoe vaak het aanbod de opstelling kan voeden. Indicatief: de volledige bedrijfsvoering (start, stop, stand-by, onderhoud) rekent stap 6.</p></div></div>
    <div className="s-tablewrap"><table className="s-table"><thead><tr><th>Variant</th><th className="num">Opname<small>MW, vollast</small></th><th className="num">Minimumlast<small>MW, 1 module</small></th><th className="num">≥ minimumlast<small>% van de tijd</small></th><th className="num">≥ vollast<small>% van de tijd</small></th><th className="num">Overschot<small>MWh per jaar</small></th></tr></thead>
     <tbody>{table.map(t=><tr key={t.label}><td style={{whiteSpace:'nowrap'}}><b>Variant {t.label}</b><small className="s-muted">{t.name}</small></td><td className="num">{nl(t.intake,1)}</td><td className="num">{nl(t.minMW,2)}</td><td className="num">{nl(t.aboveMin*100,0)}</td><td className="num">{nl(t.aboveFull*100,0)}</td><td className="num">{nl(t.over,0)}</td></tr>)}</tbody></table></div></Card>}
   <Card className="s-pad"><div className="s-cardhead"><div><h2>Duurkromme</h2><p className="s-sub">Hoe vaak is er minstens een bepaald vermogen? Stippellijnen: opname bij vollast (stack + BoP) per variant.</p></div></div><DurationChart curve={s.duurkromme} allocated={allocated} variants={variants.map(v=>({...v,label:'Variant '+v.label}))}/>{!variants.length&&<p className="s-muted">Kies in stap 2 een model om de vollast van een variant te zien.</p>}</Card>
   <Card className="s-pad s-flat"><Details summary="Meer weergaven" meta="warmtekaart per uur, aanbod per maand">
    <div className="s-cardhead"><div><h3>Wanneer is er wind?</h3><p className="s-sub">Elk vakje is één uur: dagen van links naar rechts, uren van boven naar beneden.</p></div><HeatLegend max={allocated}/></div><Heatmap cells={x.cells} days={x.days} year={s.jaar} max={allocated}/>
    <div className="s-cardhead s-gap"><div><h3>Per maand</h3><p className="s-sub">Aanbod per park in GWh (het deel voor de elektrolyser).</p></div></div><MonthlyBars values={x.monthly} series={x.series}/>
   </Details></Card>
   <Card className="s-pad s-flat"><Details summary="Cijfers per park, dekking en rekenwijze">
    <div className="s-tablewrap"><table className="s-table"><thead><tr><th>Windjaar</th><th className="num">Aanbod (MWh)</th><th className="num">Vollasturen</th><th className="num">Dekking</th><th className="num">Momenten</th><th className="num">Windstil</th>{active.map((p:any)=><th key={p.id} className="num">{p.naam} (hele park, MWh)</th>)}</tr></thead>
     <tbody>{r.summaries.map((q:any)=><tr key={q.jaar}><td>{q.jaar}</td><td className="num">{nl(q.mwh,0)}</td><td className="num">{nl(q.vollasturen,0)}</td><td className="num">{nl(q.dekking*100,1)} %</td><td className="num">{q.momenten.toLocaleString('nl-NL')}</td><td className="num">{nl(x.quiet*100,0)} %</td>{active.map((p:any)=><td key={p.id} className="num">{nl(q.park_mwh[p.id],0)}</td>)}</tr>)}</tbody></table></div>
    <p className="s-muted">Aanbod per tien minuten: de som over de parken van aandeel × gemodelleerd parkvermogen, uit de gekozen meetstations (KNMI, DWD, KMI of DMI, omgerekend naar 10 m). Meetgaten vallen weg; ze tellen niet als nul. Vollasturen = jaaraanbod ÷ toegewezen vermogen, omgerekend naar een heel jaar bij ontbrekende momenten. Windstil = momenten met minder dan 5 % van het toegewezen vermogen.</p>
   </Details></Card>
  </>}
 </>;
}
