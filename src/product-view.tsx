// Knop en notities van de productweergave voor de React-pagina's. De losse pagina /opsplitsing gebruikt
// dezelfde inhoud via product-note-dom.mjs.
import {useEffect,useState} from 'react';
import {Presentation} from 'lucide-react';
import {getView,onView,setView,VIEW_HINT,VIEW_LABEL} from './view-mode.mjs';
import {nextDemoStep,note,noteFor} from './product-content.mjs';

export function useView(){
 const [view,setCurrent]=useState(getView());
 useEffect(()=>onView(setCurrent),[]);
 return view;
}

export function ViewToggle(){
 const on=useView()==='product';
 return <button type="button" className="view-toggle" aria-pressed={on} title={VIEW_HINT} onClick={()=>setView(on?'project':'product')}><Presentation size={14} aria-hidden="true"/>{VIEW_LABEL}</button>;
}

// Notitie bovenaan een pagina in de productweergave: wat je ziet, waarom het telt, voor wie, en een vraag.
export function ProductNote(){
 const view=useView();
 const path=location.pathname,content=noteFor(path);
 if(view!=='product'||!content)return null;
 const next=nextDemoStep(path);
 return <aside className="product-note" aria-labelledby="product-note-title">
  <div className="product-note-head"><span className="product-note-eyebrow">{note.eyebrow}</span><p className="product-note-title" id="product-note-title">{content.title}</p></div>
  <dl className="product-note-grid">
   <div><dt>{note.showsLabel}</dt><dd>{content.shows}</dd></div>
   <div><dt>{note.whyLabel}</dt><dd>{content.why}</dd></div>
   <div><dt>{note.whoLabel}</dt><dd>{content.who}</dd></div>
   <div className="product-note-ask"><dt>{note.askLabel}</dt><dd>{content.ask}</dd></div>
  </dl>
  <div className="product-note-links"><a href="/">{note.overview}</a>{next&&<a href={next.href}><span>{note.nextLabel}</span><strong>{next.title}</strong></a>}</div>
 </aside>;
}
