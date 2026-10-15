export function chartValue(powerMW,hours,unit='MW'){
 if(powerMW===null||!Number.isFinite(powerMW)||!Number.isFinite(hours)||hours<0)return null;
 return unit==='MW'?powerMW:powerMW*hours*(unit==='kWh'?1000:1);
}
// Only the thousands-of-kWh display scales; all other display modes stay at 45.
export function chartCeiling(values,unit='MW'){
 if(unit!=='kWh')return 45;
 const maximum=Math.max(0,...values.filter(v=>typeof v==='number'&&Number.isFinite(v)));
 return Math.floor(maximum/10)*10+10;
}

// Aggregate electrical energy, not wind speed. Incomplete source hours stay absent.
export function knmiHourlyValues(points,day,share=1){
 const df=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
 const parts=t=>{const p=Object.fromEntries(df.formatToParts(new Date(t)).map(v=>[v.type,v.value]));return {day:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour)};};
 const base=Date.parse(day+'T00:00:00Z'),slots=new Map();
 for(let t=base-3*3600000;t<base+27*3600000;t+=600000){const p=parts(t);if(p.day===day)slots.set(t,p.hour);}
 const observed=new Map();
 for(const p of points){const start=Date.parse(p.start);if(slots.has(start)&&Date.parse(p.end)-start===600000)observed.set(start,p.powerMW);}
 const hours=new Map();
 for(const [start,hour] of slots){const bucket=hours.get(hour)||{hour,count:0,valid:0,energyMWh:0};bucket.count++;const power=observed.get(start);if(typeof power==='number'&&Number.isFinite(power)&&power>=0){bucket.valid++;bucket.energyMWh+=power*share/6;}hours.set(hour,bucket);}
 return [...hours.values()].filter(h=>h.count===h.valid).map(h=>({hour:h.hour,powerMW:h.energyMWh/(h.count/6),energyMWh:h.energyMWh})).sort((a,b)=>a.hour-b.hour);
}
