import {Wind} from 'lucide-react';
export const sitePages = [
  {href:'/',label:'Start'},
  {href:'/fryslan',label:'Fryslân'},
  {href:'/beabuorren',label:'Beabuorren'},
  {href:'/elektrolyser',label:'Elektrolyser'},
];
export function SiteHeader(){return <header className="topbar"><a className="brand site-brand" href="/" aria-label="Mijnwindpark.nl · startpagina"><span className="brand-symbol"><Wind size={25} aria-hidden="true"/></span><span>mijnwindpark<span className="brand-domain">.nl</span><span className="brand-sub">WINDENERGIE & WATERSTOF</span></span></a><a className="mini-flow" href="/#stroom" aria-label="Bekijk hoe de windstroom naar waterstof gaat"><svg viewBox="0 0 230 30" aria-hidden="true"><path className="flow-track flow-power" d="M24 15H104"/><path className="flow-dash flow-power" d="M24 15H104"/><path className="flow-track flow-h2" d="M150 15H206"/><path className="flow-dash flow-h2" d="M150 15H206"/><g className="mini-turbine"><path d="M12 28V12"/><g className="mini-rotor"><path d="M12 12V2M12 12L20 17M12 12L4 17"/></g></g><text x="64" y="11" textAnchor="middle">44 MW</text><rect x="106" y="5" width="42" height="20" rx="4"/><text className="mini-node" x="127" y="19" textAnchor="middle">ELY</text><text x="218" y="19" textAnchor="middle">H₂</text></svg><span>Van wind naar waterstof</span></a></header>;}
export function SiteNavigation({current}:{current:string}){return <nav className="park-nav" aria-label="Hoofdnavigatie">{sitePages.map(page=><a key={page.href} href={page.href} aria-current={current===page.href?'page':undefined}>{page.label}</a>)}</nav>;}
