import {theoreticalWindMW} from './wind-potential.mjs';
export const forecastColours={previous:'#B19ACA',latest:'#D99B7C'};
export const forecastDay=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
export function previousForecastRun(day){return new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10)+'T18';}
export function forecastPoints(data,day,settings,theoretical=false){
 return (data?.rows||[]).filter(row=>forecastDay(row.time)===day).flatMap(row=>{const p=row.parks.find(p=>p.id===settings?.park);const power=p?(theoretical?theoreticalWindMW(p.windSpeedMS,row.time,settings):p.powerMW):null;return p&&power!==null&&Number.isFinite(power)?[{time:row.time,powerMW:power,windSpeedMS:p.windSpeedMS}]:[];});
}
