export function chartValue(powerMW,hours,unit='MW'){
 if(powerMW===null||!Number.isFinite(powerMW)||!Number.isFinite(hours)||hours<0)return null;
 return unit==='MW'?powerMW:powerMW*hours*(unit==='kWh'?1000:1);
}
// Round upwards to a multiple of ten, then leave one additional ten-unit step.
export function chartCeiling(values){
 const maximum=Math.max(0,...values.filter(v=>typeof v==='number'&&Number.isFinite(v)));
 return Math.ceil(maximum/10)*10+10;
}
