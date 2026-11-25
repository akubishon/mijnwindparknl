// Stap 5: beschikbaar vermogen. De berekening is ongewijzigd (buildSupply + supplySummary); hier komen alleen
// extra weergaven bij: warmtekaart per uur, aanbod per maand per park en het deel van de tijd zonder wind.
import {useCallback,useState} from 'react';
import {Download,RefreshCw} from 'lucide-react';
import {buildSupply,supplySummary,yearAxis,YEARS} from '../supply.mjs';
import {parkMW} from '../park-model.mjs';
import {studioProfile,studioWindText,stationName} from '../project.mjs';
import {describeStudio} from '../../electrolyser-wind.mjs';
import {allocatedMW,canComputeSupply} from '../status.mjs';
import {windSeries,localParts,localStamp,download,nl,letter} from '../lib';
import {Card,Tile,Notice,Progress,StepHead,Details,Loading,Empty} from '../ui/kit';
import {DurationChart,Heatmap,HeatLegend,MonthlyBars,SERIES} from '../ui/Chart';

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
  if(active.some((p:any)=>!p.stations.length)){setState(s=>({...s,error:'Kies voor elk park met vermogen een KNMI-station.'}));return;}
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
 const stations=[...new Set(active.flatMap((p:any)=>p.stations))].map(id=>stationName(id as string));
 const variants=resolved.map((v:any,i:number)=>v.ready?{label:letter(i),mw:v.intakeMW,color:['#F5A800','#00A6DE','#B5651D','#7FB8D6'][i%4],name:project.varianten[i].modelId?'stack + BoP bij vollast':''}:null).filter(Boolean) as any[];
 const csv=()=>{if(!x)return;const rows=['tijd (Nederlandse tijd);aanbod_MW',...x.csv.t.map((t,i)=>`${localStamp(t)};${String(x.csv.mw[i]).replace('.',',')}`)];download(`aanbod-${project.naam.replace(/[^\w-]+/g,'-')}-${s.jaar}.csv`,rows.join('\n'));};
 return <>
  <StepHead n={5} title="Beschikbaar vermogen" actions={r&&<button type="button" className="s-btn s-btn-ghost" onClick={csv}><Download size={16}/>CSV</button>}>
   {active.length?<>Het aanbod per tien minuten uit {active.map((p:any)=>p.naam.replace(/^Windpark /,'')).join(' en ')}, gemodelleerd met KNMI {stations.join(' + ')||'–'}. Windjaar {YEARS.join(', ')}.</>:'Kies eerst windparken en KNMI-stations.'}
  </StepHead>
  {supply.busy&&<Card className="s-pad"><Loading>{supply.stage}{supply.stage==='Winddata laden'?`: ${supply.done} van ${supply.total} station-jaren`:'…'}</Loading><Progress value={supply.stage==='Winddata laden'?supply.done:supply.total} max={supply.total||1} label="Voortgang"/><p className="s-muted">Een station-jaar dat nog niet in de opslag staat, haalt de worker eenmalig op bij KNMI. Dat kan even duren.</p></Card>}
  {supply.error&&<Notice kind="fout" title="Het aanbod kon niet worden berekend." action={<button type="button" className="s-btn s-btn-ghost" onClick={()=>void supply.run()}><RefreshCw size={15}/>Opnieuw proberen</button>}>{supply.error}</Notice>}
  {!r&&!supply.busy&&!supply.error&&<Card className="s-pad"><Empty title={canComputeSupply(project)?'Nog niet berekend':'Nog niet te berekenen'} action={<button type="button" className="s-btn s-btn-cta" disabled={!canComputeSupply(project)} onClick={()=>void supply.run()}>Bereken aanbod</button>}>{canComputeSupply(project)?'De studio haalt de tienminutenwind van de gekozen stations op en rekent het aanbod per tien minuten.':'Geef minstens één park vermogen en kies voor elk park een KNMI-station.'}</Empty></Card>}
  {r&&s&&x&&<>
   <div className="s-tiles">
    <Tile main label={`Aanbod ${s.jaar}`} value={nl(s.mwh/1000,1)} unit="GWh" note={`uit ${nl(allocated)} MW toegewezen`}/>
    <Tile label="Vollasturen" value={nl(s.vollasturen,0)} unit="uur" note={`capaciteitsfactor ${nl(s.vollasturen/87.6,0)} %`}/>
    <Tile label="Dekking" value={nl(s.dekking*100,1)} unit="%" note={`${s.momenten.toLocaleString('nl-NL')} momenten met data van alle stations`}/>
    <Tile label="Windstil" value={nl(x.quiet*100,0)} unit="%" note={`van de tijd onder 5 % vermogen · hoogste ${nl(x.max,1)} MW`}/>
   </div>
   <Card className="s-pad"><div className="s-cardhead"><div><h2>Wanneer is er wind?</h2><p className="s-sub">Elk vakje is één uur: dagen van links naar rechts, uren van boven naar beneden. Kleur: gemiddeld aanbod in dat uur.</p></div><HeatLegend max={allocated}/></div><Heatmap cells={x.cells} days={x.days} year={s.jaar} max={allocated}/></Card>
   <div className="s-two">
    <Card className="s-pad"><div className="s-cardhead"><div><h2>Duurkromme</h2><p className="s-sub">Hoe vaak is er minstens een bepaald vermogen? Stippellijnen: opname bij vollast (stack + BoP) per variant.</p></div></div><DurationChart curve={s.duurkromme} allocated={allocated} variants={variants.map(v=>({...v,label:'Variant '+v.label}))}/>{!variants.length&&<p className="s-muted">Kies in stap 2 een model om de vollast van een variant te zien.</p>}</Card>
    <Card className="s-pad"><div className="s-cardhead"><div><h2>Per maand</h2><p className="s-sub">Aanbod per park in GWh (het deel voor de elektrolyser).</p></div></div><MonthlyBars values={x.monthly} series={x.series}/></Card>
   </div>
   <Card className="s-pad s-flat"><Details summary="Cijfers per park en hoe de studio rekent">
    <div className="s-tablewrap"><table className="s-table"><thead><tr><th>Windjaar</th><th className="num">Aanbod (MWh)</th><th className="num">Vollasturen</th><th className="num">Dekking</th><th className="num">Momenten</th>{active.map((p:any)=><th key={p.id} className="num">{p.naam} (hele park, MWh)</th>)}</tr></thead>
     <tbody>{r.summaries.map((q:any)=><tr key={q.jaar}><td>{q.jaar}</td><td className="num">{nl(q.mwh,0)}</td><td className="num">{nl(q.vollasturen,0)}</td><td className="num">{nl(q.dekking*100,1)} %</td><td className="num">{q.momenten.toLocaleString('nl-NL')}</td>{active.map((p:any)=><td key={p.id} className="num">{nl(q.park_mwh[p.id],0)}</td>)}</tr>)}</tbody></table></div>
    <p className="s-muted">Aanbod per tien minuten: de som over de parken van aandeel × gemodelleerd parkvermogen, uit de gekozen KNMI-stations. Meetgaten vallen weg; ze tellen niet als nul. Vollasturen = jaaraanbod ÷ toegewezen vermogen, omgerekend naar een heel jaar bij ontbrekende momenten. Windstil = momenten met minder dan 5 % van het toegewezen vermogen.</p>
   </Details></Card>
  </>}
 </>;
}
