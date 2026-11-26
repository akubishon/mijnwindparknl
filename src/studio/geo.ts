// Projectstudio buiten Nederland: welke achtergrondkaart en welke zoekdienst.
// Binnen Nederland PDOK (BRT-achtergrondkaart, Locatieserver); daarbuiten OpenFreeMap-vectortegels (OSM-gegevens, geen
// sleutel of tegellimiet) en Photon (komoot) voor zoeken en plaatsnamen. PDOK-tegels zijn buiten Nederland leeg of wit.
// Niet tile.openstreetmap.org: die tegelserver staat zwaar of commercieel gebruik niet toe.
export const OFM_STYLE='https://tiles.openfreemap.org/styles/positron';
export const PHOTON='https://photon.komoot.io';
// Ruwe omtrek van Europees Nederland (lon, lat), genoeg om de kaartbron te kiezen.
const NL:[number,number][]=[[3.36,51.37],[3.9,51.21],[4.25,51.37],[4.53,51.48],[4.85,51.42],[5.03,51.48],[5.24,51.27],[5.56,51.22],[5.85,51.15],[5.64,50.85],[5.7,50.76],[6.02,50.75],[6.08,50.92],[5.87,51.05],[6.17,51.18],[6.07,51.45],[6.22,51.51],[5.95,51.75],[6.4,51.83],[6.83,51.97],[6.69,52.03],[7.06,52.23],[7.03,52.63],[7.2,53.0],[7.21,53.24],[6.9,53.45],[6.0,53.6],[4.7,53.4],[4.4,52.9],[3.9,52.0],[3.3,51.6]];
export function inNL(lat:number,lon:number){
 let inside=false;
 for(let i=0,j=NL.length-1;i<NL.length;j=i++){const [xi,yi]=NL[i],[xj,yj]=NL[j];if((yi>lat)!==(yj>lat)&&lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;}
 return inside;
}
// Zoekresultaat in de vorm die de locatiestap gebruikt.
export type Hit={naam:string;lat:number;lon:number;adres:boolean;soort:string};
const LANDEN:Record<string,string>={DE:'Duitsland',BE:'België',DK:'Denemarken',LU:'Luxemburg',FR:'Frankrijk',NL:'Nederland'};
export async function photonSearch(q:string):Promise<Hit[]>{
 const r=await fetch(`${PHOTON}/api/?${new URLSearchParams({q,limit:'6',bbox:'-5.5,41,15.5,58'})}`);if(!r.ok)return [];
 return ((await r.json()).features||[]).filter((f:any)=>f.properties?.countrycode!=='NL'&&['DE','BE','DK','LU','FR'].includes(f.properties?.countrycode)).map((f:any)=>{const p=f.properties,[lon,lat]=f.geometry.coordinates,adres=p.type==='house'||!!p.housenumber;
  const naam=[p.name||[p.street,p.housenumber].filter(Boolean).join(' '),p.city&&p.city!==p.name?p.city:'',LANDEN[p.countrycode]||p.country].filter(Boolean).join(', ');
  return {naam,lat,lon,adres,soort:adres?'adres':p.type||p.osm_value||'plaats'};});
}
export async function photonPlace(lat:number,lon:number){
 const r=await fetch(`${PHOTON}/reverse?${new URLSearchParams({lat:String(lat),lon:String(lon)})}`);if(!r.ok)return '';
 const p=(await r.json()).features?.[0]?.properties;if(!p)return '';
 const plaats=p.city||p.town||p.village||p.county||p.name||'';
 return plaats&&p.countrycode&&p.countrycode!=='NL'?`${plaats} (${LANDEN[p.countrycode]||p.country})`:plaats;
}
