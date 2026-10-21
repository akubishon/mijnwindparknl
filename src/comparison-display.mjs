import {knmiHourlyValues} from './chart-units.mjs';

export function comparisonHours(comparison,day,share=1){
 const aggregate=rows=>new Map(knmiHourlyValues(rows,day,share).map(h=>[h.hour,h]));
 const a=aggregate(comparison.stavoren),b=aggregate(comparison.houtribdijk),c=aggregate(comparison.combination);
 const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',hour:'2-digit',hourCycle:'h23'});
 const localHour=t=>Number(clock.format(new Date(t)));
 return Array.from({length:24},(_,hour)=>{
  const points=comparison.combination.filter(p=>localHour(p.start)===hour);
  const names=[...new Set(points.map(p=>p.highestStation).filter(Boolean))];
  return {hour,stavoren:a.get(hour)||null,houtribdijk:b.get(hour)||null,combination:c.get(hour)||null,
   highestStation:names.length===1?names[0]:names.length?'Wisselend':null,
   fallback:points.some(p=>p.fallbackStation)};
 });
}

// Split a crossing exactly, so each part of the band has the correct station colour.
export function differencePolygons(left,right){
 if([left.a,left.b,right.a,right.b].some(v=>v===null||!Number.isFinite(v))||right.x<=left.x)return [];
 const d0=left.a-left.b,d1=right.a-right.b;
 if(d0===0&&d1===0)return [];
 if(d0*d1<0){
  const f=d0/(d0-d1),cross={x:left.x+(right.x-left.x)*f,a:left.a+(right.a-left.a)*f,b:left.b+(right.b-left.b)*f};
  return [...differencePolygons(left,cross),...differencePolygons(cross,right)];
 }
 return [{station:(d0||d1)>0?'Stavoren':'Houtribdijk',points:[[left.x,left.a],[right.x,right.a],[right.x,right.b],[left.x,left.b]]}];
}

export function comparisonCoverage(points){
 const valid=points.filter(p=>p.powerMW!==null);
 return {validMinutes:valid.length*10,missingMinutes:(points.length-valid.length)*10,fallbackPoints:valid.filter(p=>p.fallbackStation).length,
 energyMWh:valid.reduce((sum,p)=>sum+p.powerMW*(Date.parse(p.end)-Date.parse(p.start))/3600000,0)};
}

export function downloadCSV(filename,headers,rows){
 const cell=v=>v==null?'':typeof v==='number'?String(v).replace('.',','):'"'+String(v).replaceAll('"','""')+'"';
 const url=URL.createObjectURL(new Blob(['\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
