import {Wind} from 'lucide-react';
export const sitePages = [
  {href:'/',label:'Start'},
  {href:'/fryslan',label:'Fryslân'},
  {href:'/beabuorren',label:'Beabuorren'},
  {href:'/elektrolyser',label:'Elektrolyser'},
  {href:'/onderzoek',label:'Onderzoek'},
];
export function SiteHeader(){return <header className="topbar"><a className="brand site-brand" href="/" aria-label="Mijnwindpark.nl · startpagina"><span className="brand-symbol"><Wind size={25} aria-hidden="true"/></span><span>mijnwindpark<span className="brand-domain">.nl</span><span className="brand-sub">WINDENERGIE & WATERSTOF</span></span></a><span className="zone">Van wind naar inzicht</span></header>;}
export function SiteNavigation({current}:{current:string}){return <nav className="park-nav" aria-label="Hoofdnavigatie">{sitePages.map(page=><a key={page.href} href={page.href} aria-current={current===page.href?'page':undefined}>{page.label}</a>)}</nav>;}
