const clockParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
// Use the same Dutch 00:00–24:00 clock axis as the source's hourly bars.
export function clockDayFraction(timestamp,day){
 const t=Date.parse(timestamp);if(!Number.isFinite(t))return null;
 const p=Object.fromEntries(clockParts.formatToParts(new Date(t)).map(v=>[v.type,v.value]));
 const date=`${p.year}-${p.month}-${p.day}`;
 if(date===day)return (Number(p.hour)*60+Number(p.minute))/1440;
 const next=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 return date===next&&p.hour==='00'&&p.minute==='00'?1:null;
}
