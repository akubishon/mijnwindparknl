// Future source slots can contain zero placeholders; retain real zero production.
export function displayedHours(hours,day,now=Date.now()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));
 const today=`${parts.year}-${parts.month}-${parts.day}`;
 return hours.filter(h=>Number.isInteger(h.hour)&&h.hour>=0&&h.hour<24&&Number.isFinite(h.kWh)&&day<=today&&(day<today||h.hour<=Number(parts.hour)));
}

// Real elapsed time, including the shorter/longer day at Dutch DST transitions.
export function elapsedHoursToday(day,now=Date.now()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));
 if(day!==`${parts.year}-${parts.month}-${parts.day}`)return null;
 const base=Date.parse(day+'T00:00:00Z');
 const offset=new Intl.DateTimeFormat('en',{timeZone:'Europe/Amsterdam',timeZoneName:'longOffset'}).formatToParts(new Date(base)).find(p=>p.type==='timeZoneName').value;
 const match=offset.match(/GMT([+-])(\d{2}):(\d{2})/);
 const offsetHours=match?(Number(match[2])+Number(match[3])/60)*(match[1]==='+'?1:-1):0;
 return Math.max(0,(now-(base-offsetHours*3600000))/3600000);
}
