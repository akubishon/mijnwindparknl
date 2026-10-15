import {useEffect,useState} from 'react';
type DirectionPoint={windDirectionDeg?:number|null;windSpeedMS?:number|null};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export default function WindIntro(){
 const [current,setCurrent]=useState<DirectionPoint[]>([]);
 useEffect(()=>{
  const controller=new AbortController();
  const refresh=()=>fetch('/api/wind?'+new URLSearchParams({day:today(),park:'fryslan',station:'0-20000-0-06267'}),{signal:controller.signal})
   .then(r=>{if(!r.ok)throw Error('Wind unavailable');return r.json();})
   .then(d=>setCurrent(d.intervals||[])).catch(()=>{});
  refresh();
  const timer=setInterval(refresh,10000);
  return()=>{controller.abort();clearInterval(timer);};
 },[]);
 const latest=[...current].reverse().find(p=>typeof p.windDirectionDeg==='number'&&Number.isFinite(p.windDirectionDeg)&&p.windDirectionDeg>=0&&p.windDirectionDeg<=360&&(p.windSpeedMS??0)>0);
 if(!latest)return null;
 // KNMI gives the direction wind comes FROM. A downward arrow at 0° flows south.
 return <div className="intro-wind" aria-hidden="true"><svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMid slice" focusable="false">
 {Array.from({length:65},(_,i)=>{const x=(i%13)*100+15,y=Math.floor(i/13)*65-10;return <g key={i} transform={`translate(${x} ${y}) rotate(${latest.windDirectionDeg})`}><path className="intro-wind-arrow" d="M0 -14V14M-5 8L0 14L5 8"><animateTransform attributeName="transform" type="translate" from="0 -65" to="0 65" dur={`${4+(i%3)}s`} begin={`-${(i*1.7)%6}s`} repeatCount="indefinite"/></path></g>;})}
 </svg></div>;
}
