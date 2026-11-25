// Projectstudio: grafieken in eigen SVG/canvas (geen grafiekbibliotheek). Assen, raster, legenda en tooltip in één stijl.
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {nl} from '../lib';

export const SERIES=['#0B7FAE','#00A6DE','#8A9FB0','#C5D1DB','#0C2340'];
// Deel van de tijd (0–1) dat het aanbod minstens `mw` is, uit de duurkromme (101 punten).
export function shareAbove(curve:number[],mw:number){for(let k=0;k<curve.length;k++)if(curve[k]<mw){if(!k)return 0;const a=curve[k-1],b=curve[k];return (k-1+(a-mw)/Math.max(1e-9,a-b))/100;}return 1;}
const MONTHS=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const MONTHS_LONG=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

// Ronde stappen voor de y-as (ongeveer `count` lijnen).
export function niceTicks(max:number,count=4){
 if(!(max>0))return [0,1];
 const raw=max/count,mag=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].map(f=>f*mag).find(s=>s>=raw)!;
 const out=[];for(let v=0;v<=max+step*.001;v+=step)out.push(Math.round(v*1e6)/1e6);
 if(out[out.length-1]<max)out.push(out[out.length-1]+step);
 return out;
}
function useWidth(){
 const ref=useRef<HTMLDivElement>(null),[w,setW]=useState(720);
 useEffect(()=>{const el=ref.current;if(!el)return;const ro=new ResizeObserver(([e])=>setW(Math.max(280,Math.round(e.contentRect.width))));ro.observe(el);return()=>ro.disconnect();},[]);
 return [ref,w] as const;
}
function svgX(e:React.PointerEvent<SVGElement>){const svg=(e.currentTarget as SVGElement).ownerSVGElement||e.currentTarget as SVGSVGElement;const pt=(svg as SVGSVGElement).createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform((svg as SVGSVGElement).getScreenCTM()!.inverse());}
function Tip({x,y,w,children}:{x:number;y:number;w:number;children:ReactNode}){
 return <div className="s-tip" style={{left:`${Math.min(Math.max(x/w*100,8),92)}%`,top:y}} role="status">{children}</div>;
}
export function Legend({items}:{items:{label:ReactNode;color:string;dash?:boolean}[]}){
 return <div className="s-legend">{items.map((it,i)=><span key={i}><i style={{background:it.dash?`repeating-linear-gradient(90deg,${it.color} 0 6px,transparent 6px 10px)`:it.color}}/>{it.label}</span>)}</div>;
}

// Lijngrafiek over de tijd (ms). `band`: verschilband (lo–hi). `yLabel`: eenheid boven de y-as.
export type Series={label:string;color:string;points:{t:number;v:number|null}[];width?:number};
export function LineChart({series,band,yMax,yLabel='MW',xTicks,height=260,format=(v:number)=>nl(v,1)+' MW',timeLabel,label}:{series:Series[];band?:{t:number;lo:number|null;hi:number|null}[];yMax?:number;yLabel?:string;xTicks:{t:number;label:string}[];height?:number;format?:(v:number)=>string;timeLabel:(t:number)=>string;label:string}){
 const [ref,W]=useWidth(),H=height,L=44,R=12,T=26,B=26;
 const all=series.flatMap(s=>s.points.map(p=>p.t));
 const t0=Math.min(...all),t1=Math.max(...all),max=yMax??Math.max(1,...series.flatMap(s=>s.points.map(p=>p.v??0)),...(band||[]).map(b=>b.hi??0)),ticks=niceTicks(max),top=ticks[ticks.length-1];
 const x=(t:number)=>L+(t-t0)/Math.max(1,t1-t0)*(W-L-R),y=(v:number)=>H-B-v/top*(H-B-T);
 const [hover,setHover]=useState<number|null>(null);
 if(!all.length||!Number.isFinite(t0))return <p className="s-muted">Geen gegevens voor deze periode.</p>;
 const path=(pts:{t:number;v:number|null}[])=>pts.map((p,i)=>p.v===null?'':`${i&&pts[i-1].v!==null?'L':'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
 const near=hover===null?null:series[0].points.reduce((b,p)=>Math.abs(p.t-hover)<Math.abs(b.t-hover)?p:b,series[0].points[0]);
 return <div className="s-chartwrap" ref={ref}>
  <svg viewBox={`0 0 ${W} ${H}`} className="s-chart" role="img" aria-label={label}>
   {ticks.map(v=><g key={v}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} className="s-grid"/><text x={L-8} y={y(v)+4} textAnchor="end">{nl(v,v%1?1:0)}</text></g>)}
   <text x={L-8} y={11} textAnchor="end" className="s-axis-unit">{yLabel}</text>
   {xTicks.filter(k=>k.t>=t0&&k.t<=t1).map(k=><g key={k.t}><line x1={x(k.t)} x2={x(k.t)} y1={H-B} y2={H-B+4} className="s-axis"/><text x={x(k.t)} y={H-8} textAnchor="middle">{k.label}</text></g>)}
   <line x1={L} x2={W-R} y1={H-B} y2={H-B} className="s-axis"/>
   {band&&band.some(b=>b.lo!==null)&&<path d={band.filter(b=>b.lo!==null&&b.hi!==null).map((b,i)=>`${i?'L':'M'}${x(b.t)},${y(b.hi!)}`).join('')+band.filter(b=>b.lo!==null&&b.hi!==null).reverse().map(b=>`L${x(b.t)},${y(b.lo!)}`).join('')+'Z'} fill="#00A6DE" opacity=".16"/>}
   {series.map(s=><path key={s.label} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={s.width||2.2} strokeLinejoin="round"/>)}
   {near&&<g><line x1={x(near.t)} x2={x(near.t)} y1={T} y2={H-B} className="s-crosshair"/>{series.map(s=>{const p=s.points.find(q=>q.t===near.t);return p&&p.v!==null?<circle key={s.label} cx={x(p.t)} cy={y(p.v)} r="4" fill="#fff" stroke={s.color} strokeWidth="2"/>:null;})}</g>}
   <rect x={L} y={T} width={W-L-R} height={H-B-T} fill="transparent" onPointerMove={e=>{const p=svgX(e);setHover(t0+(p.x-L)/(W-L-R)*(t1-t0));}} onPointerLeave={()=>setHover(null)}/>
  </svg>
  {near&&<Tip x={x(near.t)} y={6} w={W}><b>{timeLabel(near.t)}</b>{series.map(s=>{const p=s.points.find(q=>q.t===near.t);return <span key={s.label}><i style={{background:s.color}}/>{s.label}: {p&&p.v!==null?format(p.v):'geen meting'}</span>;})}</Tip>}
  {series.length>1&&<Legend items={series.map(s=>({label:s.label,color:s.color}))}/>}
 </div>;
}

// Duurkromme: `curve[k]` = vermogen dat k % van de tijd minstens beschikbaar is (k = 0…100).
export function DurationChart({curve,allocated,variants}:{curve:number[];allocated:number;variants:{label:string;mw:number;color:string;name:string}[]}){
 const [ref,W]=useWidth(),H=280,L=44,R=14,T=26,B=30;
 const ticks=niceTicks(Math.max(allocated,curve[0]||0,...variants.map(v=>v.mw))*1.02),top=ticks[ticks.length-1];
 const x=(k:number)=>L+k/100*(W-L-R),y=(v:number)=>H-B-v/top*(H-B-T);
 const line=curve.map((v,k)=>`${k?'L':'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join('');
 const share=(mw:number)=>shareAbove(curve,mw);
 const [hover,setHover]=useState<number|null>(null);
 // Labels boven hun lijn, of eronder vlak onder de bovenrand; nooit over elkaar of over het label 'toegewezen'.
 const taken=[y(allocated)+14];
 const marks=[...variants].sort((a,b)=>b.mw-a.mw).map(v=>{const f=share(v.mw);let ly=y(v.mw)-8;if(ly<T+14)ly=y(v.mw)+20;while(taken.some(o=>Math.abs(o-ly)<21))ly+=21;taken.push(ly);return {...v,f,ly};});
 return <div className="s-chartwrap" ref={ref}>
  <svg viewBox={`0 0 ${W} ${H}`} className="s-chart" role="img" aria-label="Duurkromme van het beschikbare vermogen">
   {ticks.map(v=><g key={v}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} className="s-grid"/><text x={L-8} y={y(v)+4} textAnchor="end">{nl(v,0)}</text></g>)}
   <text x={L-8} y={11} textAnchor="end" className="s-axis-unit">MW</text>
   {[0,25,50,75,100].map(k=><text key={k} x={x(k)} y={H-10} textAnchor="middle">{k} %</text>)}
   <path d={`${line}L${x(100)},${y(0)}L${x(0)},${y(0)}Z`} fill="#00A6DE" opacity=".16"/>
   <path d={line} fill="none" stroke="#0B7FAE" strokeWidth="2.5"/>
   <line x1={L} x2={W-R} y1={y(allocated)} y2={y(allocated)} stroke="#0C2340" opacity=".45"/><text x={W-R-4} y={y(allocated)+14} textAnchor="end" className="s-axis-unit">toegewezen {nl(allocated)} MW</text>
   {marks.map(v=><g key={v.label}><line x1={L} x2={W-R} y1={y(v.mw)} y2={y(v.mw)} stroke={v.color} strokeWidth="2" strokeDasharray="6 4"/><circle cx={x(v.f*100)} cy={y(v.mw)} r="5" fill={v.color} stroke="#0C2340" strokeWidth="1.5"/>
    <g transform={`translate(${Math.min(x(v.f*100)+10,W-R-190)} ${v.ly})`}><rect x="0" y="-13" width="186" height="19" fill="#fff" stroke={v.color}/><text x="7" y="1" className="s-strong">{v.label}: vollast {nl(v.f*100,0)} % van de tijd</text></g></g>)}
   {hover!==null&&<g><line x1={x(hover)} x2={x(hover)} y1={T} y2={H-B} className="s-crosshair"/><circle cx={x(hover)} cy={y(curve[hover])} r="4.5" fill="#fff" stroke="#0B7FAE" strokeWidth="2"/></g>}
   <rect x={L} y={T} width={W-L-R} height={H-B-T} fill="transparent" onPointerMove={e=>{const p=svgX(e);setHover(Math.max(0,Math.min(100,Math.round((p.x-L)/(W-L-R)*100))));}} onPointerLeave={()=>setHover(null)}/>
  </svg>
  {hover!==null&&<Tip x={x(hover)} y={8} w={W}><b>{hover} % van de tijd</b><span>minstens {nl(curve[hover],1)} MW</span></Tip>}
  <Legend items={[{label:'Beschikbaar vermogen',color:'#0B7FAE'},...variants.map(v=>({label:<><b>{v.label}</b> {v.name} · {nl(v.mw,1)} MW</>,color:v.color,dash:true}))]}/>
 </div>;
}

// Warmtekaart: één vakje per uur (dagen × uren), kleur = gemiddeld vermogen in dat uur.
const STOPS:[number,number[]][]=[[0,[244,246,248]],[.3,[195,228,242]],[.65,[0,166,222]],[1,[8,92,128]]];
export function heatColor(f:number){
 for(let i=1;i<STOPS.length;i++)if(f<=STOPS[i][0]){const [a,ca]=STOPS[i-1],[b,cb]=STOPS[i],t=(f-a)/(b-a);return ca.map((c,j)=>Math.round(c+(cb[j]-c)*t));}
 return STOPS[STOPS.length-1][1];
}
export function Heatmap({cells,days,year,max}:{cells:Float32Array;days:number;year:number;max:number}){
 const [ref,W]=useWidth(),canvas=useRef<HTMLCanvasElement>(null),H=216,L=44,B=24,plotW=W-L-8,plotH=H-B;
 const [hover,setHover]=useState<{d:number;h:number}|null>(null);
 useEffect(()=>{
  const c=canvas.current;if(!c)return;const dpr=window.devicePixelRatio||1;c.width=Math.round(plotW*dpr);c.height=Math.round(plotH*dpr);
  const g=c.getContext('2d')!,img=g.createImageData(days,24);
  for(let d=0;d<days;d++)for(let h=0;h<24;h++){const v=cells[d*24+h],o=(h*days+d)*4;if(Number.isNaN(v)){img.data.set([214,219,225,255],o);continue;}const [r,gg,b]=heatColor(Math.min(1,Math.max(0,v/max)));img.data.set([r,gg,b,255],o);}
  const tmp=document.createElement('canvas');tmp.width=days;tmp.height=24;tmp.getContext('2d')!.putImageData(img,0,0);
  g.imageSmoothingEnabled=false;g.drawImage(tmp,0,0,c.width,c.height);
 },[cells,days,max,plotW,plotH]);
 const start=Date.UTC(year,0,1),monthX=(m:number)=>L+(Date.UTC(year,m,1)-start)/864e5/days*plotW;
 const label=hover?`${new Date(start+hover.d*864e5).toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'long',timeZone:'UTC'})}, ${String(hover.h).padStart(2,'0')}:00–${String(hover.h+1).padStart(2,'0')}:00`:'';
 const v=hover?cells[hover.d*24+hover.h]:NaN;
 return <div className="s-chartwrap s-heat" ref={ref}>
  <canvas ref={canvas} style={{left:L,width:plotW,height:plotH}} aria-hidden="true"/>
  <svg viewBox={`0 0 ${W} ${H}`} className="s-chart" role="img" aria-label={`Warmtekaart van het aanbod per uur in ${year}`}>
   {[0,6,12,18,24].map(h=><text key={h} x={L-8} y={Math.min(h/24*plotH+4,plotH)} textAnchor="end">{String(h).padStart(2,'0')}:00</text>)}
   {MONTHS.map((m,i)=><g key={m}><line x1={monthX(i)} x2={monthX(i)} y1={plotH} y2={plotH+5} className="s-axis"/><text x={monthX(i)+3} y={H-6}>{m}</text></g>)}
   {hover&&<rect x={L+hover.d/days*plotW-1} y={hover.h/24*plotH-1} width={plotW/days+2} height={plotH/24+2} fill="none" stroke="#F5A800" strokeWidth="2"/>}
   <rect x={L} y={0} width={plotW} height={plotH} fill="transparent" onPointerMove={e=>{const p=svgX(e);const d=Math.floor((p.x-L)/plotW*days),h=Math.floor(p.y/plotH*24);setHover(d>=0&&d<days&&h>=0&&h<24?{d,h}:null);}} onPointerLeave={()=>setHover(null)}/>
  </svg>
  {hover&&<Tip x={L+hover.d/days*plotW} y={hover.h/24*plotH>plotH/2?8:plotH-60} w={W}><b>{label}</b><span>{Number.isNaN(v)?'geen meting':`gemiddeld ${nl(v,1)} MW`}</span></Tip>}
 </div>;
}
export function HeatLegend({max}:{max:number}){
 return <div className="s-heatlegend"><span>0</span><i/><span>{nl(max,1)} MW</span><span className="s-heatlegend-na"><i/>geen meting</span></div>;
}

// Staafjes per maand, gestapeld per reeks. `values[m][s]` in MWh.
export function MonthlyBars({values,series}:{values:number[][];series:{label:string;color:string}[]}){
 const [ref,W]=useWidth(),H=260,L=44,R=10,T=26,B=26;
 const totals=values.map(v=>v.reduce((a,b)=>a+b,0)),ticks=niceTicks(Math.max(1,...totals)/1000),top=ticks[ticks.length-1]*1000;
 const bw=(W-L-R)/12,y=(v:number)=>H-B-v/top*(H-B-T);
 const [hover,setHover]=useState<number|null>(null);
 return <div className="s-chartwrap" ref={ref}>
  <svg viewBox={`0 0 ${W} ${H}`} className="s-chart" role="img" aria-label="Aanbod per maand per park">
   {ticks.map(v=><g key={v}><line x1={L} x2={W-R} y1={y(v*1000)} y2={y(v*1000)} className="s-grid"/><text x={L-8} y={y(v*1000)+4} textAnchor="end">{nl(v,v%1?1:0)}</text></g>)}
   <text x={L-8} y={11} textAnchor="end" className="s-axis-unit">GWh</text>
   {values.map((v,m)=>{let acc=0;const x=L+m*bw+bw*.18,w=bw*.64;return <g key={m} onPointerEnter={()=>setHover(m)} onPointerLeave={()=>setHover(null)}>
    <rect x={L+m*bw} y={T} width={bw} height={H-B-T} fill={hover===m?'#C3E4F2':'transparent'} opacity=".45"/>
    {v.map((val,s)=>{const y0=y(acc);acc+=val;return <rect key={s} x={x} y={y(acc)} width={w} height={Math.max(0,y0-y(acc))} fill={series[s].color}/>;})}
    <text x={x+w/2} y={H-8} textAnchor="middle">{W<520?'JFMAMJJASOND'[m]:MONTHS[m]}</text></g>;})}
  </svg>
  {hover!==null&&<Tip x={L+hover*bw+bw/2} y={6} w={W}><b>{MONTHS_LONG[hover]}</b>{series.map((s,i)=><span key={s.label}><i style={{background:s.color}}/>{s.label}: {nl(values[hover][i]/1000,2)} GWh</span>)}<span>Totaal: {nl(totals[hover]/1000,2)} GWh</span></Tip>}
  <Legend items={series.map(s=>({label:s.label,color:s.color}))}/>
 </div>;
}
export const monthName=(m:number)=>MONTHS_LONG[m];
