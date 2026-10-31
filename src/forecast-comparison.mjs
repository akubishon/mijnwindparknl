import {theoreticalWindMW} from './wind-potential.mjs';
import {forecastFactor,modelOptions} from './knmi.mjs';
export const forecastColours={previous:'#B19ACA',latest:'#D99B7C'};
export const forecastDay=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
export function previousForecastRun(day){return new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10)+'T18';}
// Modeluren zijn UTC ('JJJJ-MM-DDTUU'); de parkpagina's tonen en vragen ze in Nederlandse tijd.
const localParts=t=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t)).map(p=>[p.type,p.value]));
export function runToLocal(run){const p=localParts(Date.parse(run+':00:00Z'));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
export const runClock=run=>runToLocal(run).slice(11);
// Terug naar het UTC-modeluur. 02:00 bij de overgang naar wintertijd bestaat twee keer: het eerste telt. Een uur dat niet bestaat geeft null.
export function localToRun(value){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value||''))return null;
 const hour=value.slice(0,13),base=Date.parse(hour+':00:00Z');
 for(const offset of [2,1]){const run=new Date(base-offset*3600000).toISOString().slice(0,13);if(runToLocal(run)===hour+':00')return run;}
 return null;
}
export function forecastPoints(data,day,settings,theoretical=false){
 return (data?.rows||[]).filter(row=>forecastDay(row.time)===day).flatMap(row=>{const p=row.parks.find(p=>p.id===settings?.park);const power=p?(theoretical?theoreticalWindMW(p.windSpeedMS,row.time,settings,forecastFactor(day,modelOptions(new URLSearchParams(settings)))):p.powerMW):null;return p&&power!==null&&Number.isFinite(power)?[{time:row.time,powerMW:power,windSpeedMS:p.windSpeedMS}]:[];});
}
