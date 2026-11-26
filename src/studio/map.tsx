// Projectstudio: interactieve kaart (MapLibre; PDOK in Nederland, daarbuiten vectortegels van OpenFreeMap). Drie standen:
// 'locatie'  klik of sleep de elektrolyser; 'parken'  parken naar MW, klik om toe te voegen of te verwijderen;
// 'stations' het gekozen park met 25 km-cirkel en de meetstations, klik om een station aan of uit te zetten.
import {useEffect,useRef,useState,type ReactNode} from 'react';
import maplibregl from 'maplibre-gl';
import {Layers,Plus,Minus} from 'lucide-react';
import {parkMW,kmBetween,parkFromFeature} from './park-model.mjs';
import {nl} from './lib';
import {OFM_STYLE,inNL} from './geo';

const BRT='https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png';
const LUCHT='https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg';
const KADASTER='https://service.pdok.nl/kadaster/kadastralekaart/wmts/v5_0/Kadastralekaart/EPSG:3857/{z}/{x}/{y}.png';
const MAX_KM=25;
const esc=(s:any)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const fc=(features:any[])=>({type:'FeatureCollection',features});
const pt=(lon:number,lat:number,properties:any={})=>({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties});
function circle(lat:number,lon:number,km:number){
 const ring=[];for(let i=0;i<=72;i++){const a=i/72*2*Math.PI;ring.push([lon+km/(111.32*Math.cos(lat*Math.PI/180))*Math.cos(a),lat+km/110.57*Math.sin(a)]);}
 return {type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{}};
}
const mwOf=['max',0.5,['to-number',['get','mw'],3]];
const radius=(min:number)=>['interpolate',['linear'],['zoom'],6,['max',min*.6,['+',1.5,['*',0.3,['sqrt',mwOf]]]],11,['max',min,['+',3,['*',1.25,['sqrt',mwOf]]]],15,['max',min*1.4,['+',5,['*',2.2,['sqrt',mwOf]]]]];

export type StationPin={id:string;naam:string;lat:number;lon:number;on:boolean;km:number;zee:boolean};
type Props={mode:'locatie'|'parken'|'stations';locatie:{lat:number;lon:number}|null;chosen:any[];parks:any[]|null;stations?:StationPin[];focus?:any;
 onLocation?:(p:{lat:number;lon:number})=>void;onPark?:(f:any)=>void;onStation?:(id:string)=>void;flyTo?:{lat:number;lon:number;zoom:number;n:number}|null;
 fitKey?:string;padding?:{top:number;right:number;bottom:number;left:number};className?:string;children?:ReactNode;label:string};

function el(className:string,html:string){const d=document.createElement('div');d.className=className;d.innerHTML=html;return d;}

export function StudioMap(props:Props){
 const {mode,locatie,chosen,parks,stations,focus,flyTo,fitKey,padding,className,children,label}=props;
 const box=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null),ready=useRef(false),h=useRef(props);h.current=props;
 const h2=useRef<maplibregl.Marker|null>(null),labels=useRef(new Map<string,maplibregl.Marker>()),kms=useRef<maplibregl.Marker[]>([]),pins=useRef<maplibregl.Marker[]>([]),names=useRef(new Map<string,maplibregl.Marker>());
 const [photo,setPhoto]=useState(false),[loaded,setLoaded]=useState(false);

 // Kaart één keer opbouwen.
 useEffect(()=>{
  const m=new maplibregl.Map({container:box.current!,center:[locatie?.lon??5.45,locatie?.lat??52.75],zoom:locatie?10:6.6,attributionControl:{compact:true},dragRotate:false,pitchWithRotate:false,
   style:{version:8,sources:{
     brt:{type:'raster',tiles:[BRT],tileSize:256,maxzoom:19,attribution:'Kaart, luchtfoto en percelen © <a href="https://www.pdok.nl">Kadaster / PDOK</a> · windparken © OpenStreetMap'},
     lucht:{type:'raster',tiles:[LUCHT],tileSize:256,maxzoom:19},kad:{type:'raster',tiles:[KADASTER],tileSize:256,minzoom:16,maxzoom:21},
     tint:{type:'geojson',data:fc([{type:'Feature',geometry:{type:'Polygon',coordinates:[[[-20,40],[30,40],[30,65],[-20,65],[-20,40]]]},properties:{}}]) as any},
     ring:{type:'geojson',data:fc([]) as any},lines:{type:'geojson',data:fc([]) as any},parks:{type:'geojson',data:fc([]) as any},chosen:{type:'geojson',data:fc([]) as any}},
    layers:[{id:'brt',type:'raster',source:'brt'},{id:'lucht',type:'raster',source:'lucht',layout:{visibility:'none'}},{id:'kad',type:'raster',source:'kad',minzoom:16},
     {id:'tint',type:'fill',source:'tint',paint:{'fill-color':'#C3E4F2','fill-opacity':.14}},
     {id:'ring-fill',type:'fill',source:'ring',paint:{'fill-color':'#00A6DE','fill-opacity':.07}},
     {id:'ring-line',type:'line',source:'ring',paint:{'line-color':'#00A6DE','line-width':1.6,'line-dasharray':[3,2]}},
     {id:'lines',type:'line',source:'lines',paint:{'line-color':['get','kleur'],'line-width':2,'line-dasharray':[2.5,2]}},
     {id:'parks',type:'circle',source:'parks',paint:{'circle-radius':radius(2) as any,'circle-color':'#00A6DE','circle-opacity':.35,'circle-stroke-color':'#0B7FAE','circle-stroke-width':.8}},
     {id:'chosen',type:'circle',source:'chosen',paint:{'circle-radius':radius(7) as any,'circle-color':['case',['get','actief'],'#0B7FAE','#bfdceb'],'circle-stroke-color':'#fff','circle-stroke-width':2}}]}});
  const popup=new maplibregl.Popup({closeButton:false,closeOnClick:false,offset:12,className:'s-popup'});
  const hover=(e:any)=>{if(h.current.mode!=='parken')return;const f=e.features?.[0];if(!f)return;m.getCanvas().style.cursor='pointer';const p=f.properties;popup.setLngLat(f.geometry.coordinates).setHTML(`<b>${esc(p.naam)}</b><span>${esc([p.plaats||p.gemeente||'',({DE:'Duitsland',BE:'België',DK:'Denemarken',LU:'Luxemburg',FR:'Frankrijk'} as any)[p.land]||''].filter(Boolean).join(', '))}${p.plaats||p.gemeente||(p.land&&p.land!=='NL')?' · ':''}${p.mw?nl(Number(p.mw))+' MW':'vermogen onbekend'}${p.turbines?` · ${esc(p.turbines)} turbines`:''}</span><small>${p.gekozen?'Klik om te verwijderen':'Klik om toe te voegen'}</small>`).addTo(m);};
  const leave=()=>{m.getCanvas().style.cursor='';popup.remove();};
  for(const layer of ['parks','chosen']){m.on('mousemove',layer,hover);m.on('mouseleave',layer,leave);}
  m.on('click',e=>{
   const mode=h.current.mode;
   if(mode==='parken'){const hit=m.queryRenderedFeatures(e.point,{layers:['chosen','parks']})[0];if(hit){popup.remove();h.current.onPark?.(pt((hit.geometry as any).coordinates[0],(hit.geometry as any).coordinates[1],hit.properties));}return;}
   if(mode==='locatie')h.current.onLocation?.({lat:e.lngLat.lat,lon:e.lngLat.lng});
  });
  m.on('moveend',()=>{syncNames();syncBase();});
  // Op de telefoon start de bronvermelding ingeklapt (de i-knop klapt hem uit).
  m.on('load',()=>{ready.current=true;setLoaded(true);void addAbroad(m);if(innerWidth<=760)m.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');});
  map.current=m;
  return()=>{popup.remove();m.remove();map.current=null;ready.current=false;h2.current=null;labels.current.clear();names.current.clear();kms.current=[];pins.current=[];};
 },[]);

 // PDOK alleen als het kaartbeeld in Nederland ligt en niet breder is dan ~150 km; anders OSM (ook buurlanden).
 // Buiten Nederland: OpenFreeMap 'positron' (vectortegels, geen sleutel of tegellimiet) onder de PDOK-laag. De
 // OSM-tegelserver (tile.openstreetmap.org) is niet bedoeld voor zwaar of commercieel gebruik en blokkeert de studio.
 const abroad=useRef<string[]>([]),onBase=useRef<boolean|null>(null);
 async function addAbroad(m:maplibregl.Map){
  try{
   const style=await (await fetch(OFM_STYLE)).json();if(map.current!==m)return;
   for(const [id,src] of Object.entries<any>(style.sources))m.addSource('ofm-'+id,{...src,attribution:'Kaart buiten Nederland © <a href="https://openfreemap.org">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-bijdragers</a>'});
   if(style.glyphs)m.setGlyphs(style.glyphs);if(style.sprite)m.setSprite(style.sprite);
   for(const layer of style.layers){const id='ofm-'+layer.id;m.addLayer({...layer,id,...(layer.source?{source:'ofm-'+layer.source}:{}),layout:{...(layer.layout||{}),visibility:'none'}},'brt');abroad.current.push(id);}
  }catch{/* zonder OpenFreeMap blijft alleen PDOK over */}
  onBase.current=null;syncBase();
 }
 function syncBase(){
  const m=map.current;if(!m)return;
  const c=m.getCenter(),b=m.getBounds(),wide=kmBetween({lat:c.lat,lon:b.getWest()},{lat:c.lat,lon:b.getEast()})>150;
  const nl=inNL(c.lat,c.lng)&&!wide;
  if(onBase.current===nl)return;onBase.current=nl;
  m.setLayoutProperty('brt','visibility',nl||!abroad.current.length?'visible':'none');for(const id of abroad.current)m.setLayoutProperty(id,'visibility',nl?'none':'visible');
 }
 // Namen van andere parken vanaf zoom 10 (alleen wat in beeld is, hoogstens 60).
 function syncNames(){
  const m=map.current;if(!m)return;
  const show=h.current.mode==='parken'&&m.getZoom()>=10,b=m.getBounds(),want=new Map<string,any>();
  if(show){const chosen=new Set(h.current.chosen.map((p:any)=>p.id)),generic=m.getZoom()<12;
   (h.current.parks||[]).filter((f:any)=>b.contains(f.geometry.coordinates)&&!(generic&&/^Windturbines \(\d+\)$/.test(f.properties.naam||''))).sort((a:any,c:any)=>(c.properties.mw||0)-(a.properties.mw||0)).slice(0,80).filter((f:any)=>!chosen.has(parkFromFeature(f).id)).slice(0,60).forEach((f:any)=>want.set(f.geometry.coordinates.join(),f));}
  for(const [k,mk] of names.current)if(!want.has(k)){mk.remove();names.current.delete(k);}
  for(const [k,f] of want)if(!names.current.has(k))names.current.set(k,new maplibregl.Marker({element:el('s-plabel',esc(f.properties.naam)),anchor:'top',offset:[0,6]}).setLngLat(f.geometry.coordinates).addTo(m));
 }

 // Parken, gekozen parken, lijnen naar de elektrolyser en labels.
 useEffect(()=>{
  const m=map.current;if(!m||!loaded)return;
  const key=(p:any)=>`${p.lon.toFixed(4)},${p.lat.toFixed(4)}`,taken=new Set(chosen.map(key));
  (m.getSource('parks') as any).setData(fc((parks||[]).map((f:any)=>({...f,properties:{...f.properties,gekozen:taken.has(`${f.geometry.coordinates[0].toFixed(4)},${f.geometry.coordinates[1].toFixed(4)}`)}}))));
  (m.getSource('chosen') as any).setData(fc(chosen.map((p:any)=>pt(p.lon,p.lat,{naam:p.naam,mw:parkMW(p),turbines:p.turbines,plaats:p.plaats||'',actief:p.aandeel>0||mode!=='parken',gekozen:true,id:p.id}))));
  const lines=mode==='stations'&&focus?(stations||[]).filter(s=>s.on).map(s=>({type:'Feature',geometry:{type:'LineString',coordinates:[[focus.lon,focus.lat],[s.lon,s.lat]]},properties:{kleur:'#00A6DE'}}))
   :locatie&&mode==='parken'?chosen.filter((p:any)=>p.aandeel>0).map((p:any)=>({type:'Feature',geometry:{type:'LineString',coordinates:[[locatie.lon,locatie.lat],[p.lon,p.lat]]},properties:{kleur:'#0C2340'}})):[];
  (m.getSource('lines') as any).setData(fc(lines));
  (m.getSource('ring') as any).setData(fc(mode==='stations'&&focus?[circle(focus.lat,focus.lon,MAX_KM)]:[]));
  // Afstandslabels halverwege de lijn (niet bij parken vlak naast de elektrolyser).
  kms.current.forEach(k=>k.remove());kms.current=[];
  if(mode==='parken'&&locatie)for(const p of chosen.filter((p:any)=>p.aandeel>0)){const km=kmBetween(locatie,p);if(km>=4)kms.current.push(new maplibregl.Marker({element:el('s-kmlabel',`${nl(km)} km`)}).setLngLat([(locatie.lon+p.lon)/2,(locatie.lat+p.lat)/2]).addTo(m));}
  // Namen van de gekozen parken.
  for(const [,mk] of labels.current)mk.remove();labels.current.clear();
  for(const p of chosen)labels.current.set(p.id,new maplibregl.Marker({element:el('s-plabel s-plabel-chosen'+(focus?.id===p.id?' s-plabel-focus':''),esc(p.naam.replace(/^Windpark /,''))),anchor:'top',offset:[0,10]}).setLngLat([p.lon,p.lat]).addTo(m));
  syncNames();
 },[loaded,parks,chosen,locatie?.lat,locatie?.lon,mode,focus?.id,stations]);

 // Stations (stand 'stations').
 useEffect(()=>{
  const m=map.current;if(!m||!loaded)return;
  pins.current.forEach(p=>p.remove());pins.current=[];
  if(mode!=='stations')return;
  for(const s of stations||[]){
   const d=el('s-station'+(s.on?' on':'')+(s.km>MAX_KM?' far':''),`<i aria-hidden="true"></i><span>${esc(s.naam)}</span>`);
   d.setAttribute('role','button');d.tabIndex=0;d.setAttribute('aria-pressed',String(s.on));d.setAttribute('aria-label',`${s.naam}, ${nl(s.km)} km, ${s.on?'gekozen':'niet gekozen'}`);
   const toggle=(e:Event)=>{e.stopPropagation();h.current.onStation?.(s.id);};
   d.addEventListener('click',toggle);d.addEventListener('keydown',e=>{if((e as KeyboardEvent).key==='Enter'||(e as KeyboardEvent).key===' '){e.preventDefault();toggle(e);}});
   pins.current.push(new maplibregl.Marker({element:d,anchor:'bottom-left',offset:[-8,8]}).setLngLat([s.lon,s.lat]).addTo(m));
  }
 },[loaded,mode,stations]);

 // Elektrolyser.
 useEffect(()=>{
  const m=map.current;if(!m)return;
  if(!locatie){h2.current?.remove();h2.current=null;return;}
  if(!h2.current){
   const d=el('s-h2','<span>H₂</span>');d.title='Elektrolyser';
   h2.current=new maplibregl.Marker({element:d,draggable:mode==='locatie'}).setLngLat([locatie.lon,locatie.lat]).addTo(m);
   h2.current.on('dragend',()=>{const p=h2.current!.getLngLat();h.current.onLocation?.({lat:p.lat,lon:p.lng});});
  }else h2.current.setLngLat([locatie.lon,locatie.lat]);
  h2.current.setDraggable(mode==='locatie');
 },[locatie?.lat,locatie?.lon,mode]);

 // Beeld passend maken bij een nieuwe stap, park of keuze.
 useEffect(()=>{
  const m=map.current;if(!m||!loaded)return;
  const pts:[number,number][]=[];
  if(mode==='stations'&&focus){pts.push([focus.lon,focus.lat]);for(const s of stations||[])if(s.on)pts.push([s.lon,s.lat]);const r=circle(focus.lat,focus.lon,MAX_KM).geometry.coordinates[0];pts.push(r[0] as any,r[18] as any,r[36] as any,r[54] as any);}
  else if(mode==='parken'){if(locatie)pts.push([locatie.lon,locatie.lat]);for(const p of chosen)pts.push([p.lon,p.lat]);}
  const pad=padding||{top:80,right:80,bottom:80,left:80};
  if(mode==='locatie'){if(locatie)m.jumpTo({center:[locatie.lon,locatie.lat],zoom:Math.max(m.getZoom(),11.5),padding:pad});else m.jumpTo({center:[5.45,52.4],zoom:6.8,padding:pad});return;}
  if(!pts.length)return;
  const b=new maplibregl.LngLatBounds(pts[0],pts[0]);pts.forEach(p=>b.extend(p));
  m.fitBounds(b,{padding:pad,maxZoom:mode==='parken'&&pts.length<2?11:12.5,duration:0});
 },[loaded,fitKey]);

 useEffect(()=>{if(flyTo&&map.current)map.current.flyTo({center:[flyTo.lon,flyTo.lat],zoom:flyTo.zoom});},[flyTo?.n]);
 useEffect(()=>{const m=map.current;if(!m||!loaded)return;m.setLayoutProperty('lucht','visibility',photo?'visible':'none');m.setPaintProperty('tint','fill-opacity',photo?0:.14);},[photo,loaded]);

 return <div className={'s-mapbox '+(className||'')}>
  <div ref={box} className="s-map" role="region" aria-label={label}/>
  {children}
  <div className="s-maptools"><button type="button" aria-label="Inzoomen" onClick={()=>map.current?.zoomIn()}><Plus size={16}/></button><button type="button" aria-label="Uitzoomen" onClick={()=>map.current?.zoomOut()}><Minus size={16}/></button><button type="button" aria-label={photo?'Kaart tonen':'Luchtfoto tonen'} aria-pressed={photo} title={photo?'Kaart':'Luchtfoto'} onClick={()=>setPhoto(p=>!p)}><Layers size={16}/></button></div>
 </div>;
}
