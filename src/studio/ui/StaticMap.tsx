// Projectstudio: statische minikaart (PDOK-tegels met de punten als SVG erover). Geen WebGL, dus licht genoeg
// voor het projectoverzicht, elke projectkaart en de kop van een windparkpagina.
import {useMemo} from 'react';

const TILE='https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png';
const EARTH=40075016.686;
const mx=(lon:number)=>(lon+180)/360;
const my=(lat:number)=>{const r=lat*Math.PI/180;return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2;};
export type Pt={lat:number;lon:number};
export type MapPoint=Pt&{kind:'h2'|'chosen'|'park'|'station'|'station-on';r?:number;label?:string};

export function StaticMap({points=[],lines=[],rings=[],fit,width=320,height=170,pad=0.3,minKm=6,className,label='Kaart'}:{points?:MapPoint[];lines?:[Pt,Pt][];rings?:(Pt&{km:number})[];fit?:Pt[];width?:number;height?:number;pad?:number;minKm?:number;className?:string;label?:string}){
 const view=useMemo(()=>{
  const all=(fit&&fit.length?fit:points).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
  const base=all.length?all:[{lat:52.6,lon:5.4}];
  let x0=Math.min(...base.map(p=>mx(p.lon))),x1=Math.max(...base.map(p=>mx(p.lon))),y0=Math.min(...base.map(p=>my(p.lat))),y1=Math.max(...base.map(p=>my(p.lat)));
  const lat=base.reduce((s,p)=>s+p.lat,0)/base.length,min=(all.length?minKm:260)*1000/(EARTH*Math.cos(lat*Math.PI/180));
  let w=Math.max(x1-x0,min),h=Math.max(y1-y0,min);w*=1+pad*2;h*=1+pad*2;
  const aspect=width/height;if(w/h<aspect)w=h*aspect;else h=w/aspect;
  const cx=(x0+x1)/2,cy=(y0+y1)/2;x0=cx-w/2;x1=cx+w/2;y0=cy-h/2;y1=cy+h/2;
  const z=Math.max(4,Math.min(15,Math.ceil(Math.log2(width*1.3/(w*256))))),n=2**z,S=256*n;
  const tiles:{x:number;y:number}[]=[];
  for(let tx=Math.floor(x0*n);tx<=Math.floor(x1*n);tx++)for(let ty=Math.floor(y0*n);ty<=Math.floor(y1*n);ty++)if(ty>=0&&ty<n)tiles.push({x:tx,y:ty});
  return {z,S,tiles,box:[x0*S,y0*S,w*S,h*S],k:w*S/width};
 },[JSON.stringify(fit||points),width,height,pad,minKm]);
 const {z,S,tiles,box,k}=view,X=(p:Pt)=>mx(p.lon)*S,Y=(p:Pt)=>my(p.lat)*S;
 return <svg className={'s-static '+(className||'')} viewBox={box.join(' ')} preserveAspectRatio="xMidYMid slice" role="img" aria-label={label}>
  {tiles.map(t=><image key={t.x+'/'+t.y} href={TILE.replace('{z}',String(z)).replace('{x}',String(t.x)).replace('{y}',String(t.y))} x={t.x*256} y={t.y*256} width={256.5} height={256.5}/>)}
  <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} fill="#C3E4F2" opacity=".14"/>
  {rings.map((r,i)=>{const rad=r.km*1000/(EARTH*Math.cos(r.lat*Math.PI/180))*S;return <circle key={'r'+i} cx={X(r)} cy={Y(r)} r={rad} fill="#00A6DE" fillOpacity=".07" stroke="#00A6DE" strokeWidth={1.5*k} strokeDasharray={`${5*k} ${4*k}`}/>;})}
  {lines.map(([a,b],i)=><line key={'l'+i} x1={X(a)} y1={Y(a)} x2={X(b)} y2={Y(b)} stroke="#0C2340" strokeWidth={1.6*k} strokeDasharray={`${4*k} ${3*k}`}/>)}
  {points.filter(p=>p.kind==='park').map((p,i)=><circle key={'p'+i} cx={X(p)} cy={Y(p)} r={(p.r||3)*k} fill="#00A6DE" fillOpacity=".55" stroke="#0C2340" strokeWidth={.8*k}/>)}
  {points.filter(p=>p.kind==='station'||p.kind==='station-on').map((p,i)=><path key={'s'+i} transform={`translate(${X(p)} ${Y(p)}) scale(${k})`} d="M0 -7 L6.5 5 L-6.5 5Z" fill={p.kind==='station-on'?'#0C2340':'#fff'} stroke="#0C2340" strokeWidth="1.6"/>)}
  {points.filter(p=>p.kind==='chosen').map((p,i)=><circle key={'c'+i} cx={X(p)} cy={Y(p)} r={Math.max(5,p.r||6)*k} fill="#F5A800" stroke="#0C2340" strokeWidth={1.8*k}/>)}
  {points.filter(p=>p.kind==='h2').map((p,i)=><g key={'h'+i} transform={`translate(${X(p)} ${Y(p)}) scale(${k})`}><path d="M-8 -8 H5 Q8 -8 8 -5 V8 H-8Z" fill="#0C2340" stroke="#00A6DE" strokeWidth="1.6"/></g>)}
 </svg>;
}
