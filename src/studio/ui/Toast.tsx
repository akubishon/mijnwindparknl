// Projectstudio: korte meldingen rechtsonder ("Project bewaard", "Link gekopieerd").
import {useEffect,useState} from 'react';
import {Check,CircleAlert} from 'lucide-react';

type Item={id:number;text:string;kind:'ok'|'fout'};
let listeners:((items:Item[])=>void)[]=[],items:Item[]=[],next=1;
const emit=()=>listeners.forEach(l=>l(items));
export function toast(text:string,kind:'ok'|'fout'='ok'){
 const id=next++;items=[...items,{id,text,kind}].slice(-3);emit();
 setTimeout(()=>{items=items.filter(i=>i.id!==id);emit();},kind==='fout'?6000:3200);
}
export function Toasts(){
 const [list,setList]=useState<Item[]>(items);
 useEffect(()=>{listeners.push(setList);return()=>{listeners=listeners.filter(l=>l!==setList);};},[]);
 return <div className="s-toasts" aria-live="polite">{list.map(t=><div key={t.id} className={'s-toast s-toast-'+t.kind} role={t.kind==='fout'?'alert':'status'}>{t.kind==='ok'?<Check size={16}/>:<CircleAlert size={16}/>}{t.text}</div>)}</div>;
}
