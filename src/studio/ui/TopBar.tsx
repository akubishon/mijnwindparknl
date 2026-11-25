// Projectstudio: navy topbalk zoals op mijnwindpark.nl. In de editor: projectnaam (klik om te wijzigen), bewaarstatus,
// Bewaren, Link kopiëren en een menu (kopie, link, projecten, uitloggen).
import {useEffect,useRef,useState} from 'react';
import {Save,Link2,Ellipsis,Copy,FolderOpen,LogOut,Pencil} from 'lucide-react';
import {Link,go,clock} from '../lib';

function Brand(){return <Link href="/" className="s-brand" title="Naar de projecten"><span className="s-mark" aria-hidden="true">mw</span><span className="s-brand-name">Projectstudio</span><em>intern</em></Link>;}
function Logout({className}:{className?:string}){return <form method="post" action="/auth/logout" className="s-logout"><button type="submit" className={className||'s-btn s-btn-top'}><LogOut size={16}/><span>Uitloggen</span></button></form>;}

export function HomeTopBar(){return <header className="s-top"><Brand/><div className="s-doc"/><div className="s-acts"><span className="s-who">Team mijnwindpark</span><Logout/></div></header>;}

export function TopBar({project,onRename,dirty,saving,onSave,onCopy,onCopyLink}:{project:any;onRename:(n:string)=>void;dirty:boolean;saving:boolean;onSave:()=>void;onCopy:()=>void;onCopyLink:()=>void}){
 const [editing,setEditing]=useState(false),[name,setName]=useState(project.naam),[menu,setMenu]=useState(false),menuRef=useRef<HTMLDivElement>(null);
 useEffect(()=>setName(project.naam),[project.naam]);
 useEffect(()=>{if(!menu)return;const close=(e:Event)=>{if(!menuRef.current?.contains(e.target as Node))setMenu(false);};const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(false);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',esc);};},[menu]);
 const commit=()=>{setEditing(false);const n=name.trim();if(n&&n!==project.naam)onRename(n.slice(0,120));else setName(project.naam);};
 const saved=Boolean(project.id&&!project.vast);
 const state=project.vast?{dot:'s-dot-sky',text:'Startinstelling · bewaar een kopie'}:!project.id?{dot:'s-dot-let',text:'Nog niet bewaard'}:dirty?{dot:'s-dot-let',text:'Niet bewaarde wijzigingen'}:{dot:'s-dot-ok',text:`Bewaard · ${clock(project.gewijzigd)}`};
 return <header className="s-top">
  <Brand/>
  <div className="s-doc">
   {editing?<input className="s-docname-input" autoFocus value={name} maxLength={120} aria-label="Projectnaam" onChange={e=>setName(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape'){setName(project.naam);setEditing(false);}}}/>
   :<button type="button" className="s-docname" title="Projectnaam wijzigen" onClick={()=>setEditing(true)}><b>{project.naam}</b><Pencil size={13} aria-hidden="true"/><span className="s-sr">wijzigen</span></button>}
   <span className="s-saved" role="status"><i className={state.dot} aria-hidden="true"/>{saving?'Bewaren…':state.text}</span>
  </div>
  <div className="s-acts">
   {saved&&<button type="button" className="s-btn s-btn-top s-hide-small" onClick={onCopyLink}><Link2 size={16}/><span>Link kopiëren</span></button>}
   <button type="button" className="s-btn s-btn-cta" disabled={saving||(saved&&!dirty)} onClick={project.vast?onCopy:onSave} title="Bewaren (Ctrl+S)"><Save size={16}/><span>{project.vast?'Kopie bewaren':'Bewaren'}</span></button>
   <div className="s-menu" ref={menuRef}><button type="button" className="s-btn s-btn-top s-btn-icon" aria-label="Meer" aria-haspopup="menu" aria-expanded={menu} onClick={()=>setMenu(m=>!m)}><Ellipsis size={18}/></button>
    {menu&&<div className="s-menu-list" role="menu">
     {(project.id||project.vast)&&<button type="button" role="menuitem" onClick={()=>{setMenu(false);onCopy();}}><Copy size={16}/>Kopie maken</button>}
     {saved&&<button type="button" role="menuitem" onClick={()=>{setMenu(false);onCopyLink();}}><Link2 size={16}/>Link kopiëren</button>}
     <button type="button" role="menuitem" onClick={()=>{setMenu(false);go('/');}}><FolderOpen size={16}/>Naar projecten</button>
     <hr/><Logout className="s-menu-item"/>
    </div>}</div>
  </div>
 </header>;
}
