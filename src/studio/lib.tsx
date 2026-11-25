// Projectstudio: gedeelde hulpfuncties voor de interface (opmaak, ophalen, navigatie, tijd).
import {useEffect,useState,type ReactNode} from 'react';
import {decodeSeries} from './wind-data.mjs';

export const nl=(v:number|null|undefined,d=1)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('nl-NL',{minimumFractionDigits:d,maximumFractionDigits:d}):'–';
export const letter=(i:number)=>String.fromCharCode(65+i);
export const clone=<T,>(v:T):T=>structuredClone(v);
let idCounter=0;
export const makeId=()=>'v'+Date.now().toString(36)+(idCounter++);
// "38,3" en "38.3" → 38,3; met een komma erin is een punt een duizendtal ("1.234,5").
export function parseNumber(text:string){
 let s=String(text).trim().replace(/\s/g,'');
 if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
 const v=Number(s);
 return s&&Number.isFinite(v)?v:null;
}
export const plain=(v:number,d:number)=>v.toLocaleString('nl-NL',{useGrouping:false,minimumFractionDigits:0,maximumFractionDigits:d});

export async function getJSON(url:string,init?:RequestInit){
 const r=await fetch(url,init);const d=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(d.error||`Laden mislukt (HTTP ${r.status}).`);
 return d;
}

// Navigatie binnen de studio. `guard.dirty` waarschuwt voordat niet bewaarde wijzigingen verloren gaan.
export const guard={dirty:false};
export const LEAVE='Er zijn niet bewaarde wijzigingen. Toch weggaan?';
export function go(path:string){
 if(guard.dirty&&!confirm(LEAVE))return;
 guard.dirty=false;history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));window.scrollTo({top:0});
}
export function Link({href,children,className,title}:{href:string;children:ReactNode;className?:string;title?:string}){
 return <a href={href} className={className} title={title} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;e.preventDefault();go(href);}}>{children}</a>;
}

// Gedeelde gegevens: één keer per pagina ophalen.
const shared:{[k:string]:Promise<any>}={};
export const once=(key:string,make:()=>Promise<any>)=>shared[key]||=make().catch(e=>{delete shared[key];throw e;});
export function useData(key:string,url:string){
 const [s,set]=useState<{data:any;error:string}>({data:null,error:''});
 useEffect(()=>{once(key,()=>getJSON(url)).then(data=>set({data,error:''}),e=>set({data:null,error:e.message}));},[key,url]);
 return s;
}
const windCache=new Map<string,Promise<Float64Array>>();
export function windSeries(id:string,year:number){
 const k=id+'|'+year;
 if(!windCache.has(k))windCache.set(k,getJSON(`/api/studio/wind10/${id}/${year}`).then(decodeSeries).catch(e=>{windCache.delete(k);throw e;}));
 return windCache.get(k)!;
}
export const windLoaded=(id:string,year:number)=>windCache.get(id+'|'+year);

// Tijd: Nederlandse kalender (Europe/Amsterdam) zonder Intl per meetpunt; zomertijd van de laatste zondag van maart
// tot de laatste zondag van oktober, telkens om 01:00 UTC.
const dstCache=new Map<number,[number,number]>();
function dst(year:number){
 let v=dstCache.get(year);
 if(!v){const last=(m:number)=>{const d=new Date(Date.UTC(year,m+1,0,1));return d.getTime()/1000-d.getUTCDay()*86400;};v=[last(2),last(9)];dstCache.set(year,v);}
 return v;
}
// Unix-seconden → {jaar, maand (0–11), dag van het jaar (0–365), uur} in Nederlandse tijd.
export function localParts(t:number){
 const y0=new Date(t*1000).getUTCFullYear(),[a,b]=dst(y0),offset=t>=a&&t<b?7200:3600,d=new Date((t+offset)*1000);
 const year=d.getUTCFullYear();
 return {year,month:d.getUTCMonth(),day:Math.floor((Date.UTC(year,d.getUTCMonth(),d.getUTCDate())-Date.UTC(year,0,1))/86400000),hour:d.getUTCHours()};
}
// Unix-seconden → "JJJJ-MM-DD UU:MM" in Nederlandse tijd (voor CSV).
export function localStamp(t:number){
 const [a,b]=dst(new Date(t*1000).getUTCFullYear()),d=new Date((t+(t>=a&&t<b?7200:3600))*1000);
 return d.toISOString().slice(0,16).replace('T',' ');
}
export function since(iso:string|null|undefined){
 if(!iso)return '';
 const ms=Date.now()-Date.parse(iso),min=Math.round(ms/60000);
 if(!Number.isFinite(ms))return '';
 if(min<1)return 'zojuist';
 if(min<60)return `${min} ${min===1?'minuut':'minuten'} geleden`;
 const h=Math.round(min/60);if(h<24)return `${h} uur geleden`;
 const d=Math.round(h/24);if(d===1)return 'gisteren';if(d<7)return `${d} dagen geleden`;
 return new Date(iso).toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:new Date(iso).getFullYear()===new Date().getFullYear()?undefined:'numeric'});
}
export const clock=(iso:string|null|undefined)=>iso?new Date(iso).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'}):'';
export const coords=(p:{lat:number;lon:number}|null|undefined,d=3)=>p?`${nl(p.lat,d)}° N ${nl(p.lon,d)}° E`:'–';

export function download(name:string,text:string,type='text/csv;charset=utf-8'){
 const url=URL.createObjectURL(new Blob(['﻿'+text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
