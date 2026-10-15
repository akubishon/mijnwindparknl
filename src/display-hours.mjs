// Future source slots can contain zero placeholders; retain real zero production.
export function displayedHours(hours,day,now=Date.now()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));
 const today=`${parts.year}-${parts.month}-${parts.day}`;
 return hours.filter(h=>Number.isInteger(h.hour)&&h.hour>=0&&h.hour<24&&Number.isFinite(h.kWh)&&day<=today&&(day<today||h.hour<=Number(parts.hour)));
}
