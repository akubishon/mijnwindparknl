// A source interval represents a ten-minute mean, not instantaneous power.
export function runtimeStats(intervals, thresholdMW, share=1) {
  if(!Number.isFinite(thresholdMW)||thresholdMW<=0||!Number.isFinite(share)||share<=0||share>1)return null;
  let total=0,longest=0,run=0,lastEnd=null;
  for(const interval of intervals){
    const start=Date.parse(interval.start),end=Date.parse(interval.end);
    const valid=Number.isFinite(start)&&end-start===600000&&typeof interval.powerMW==='number'&&Number.isFinite(interval.powerMW);
    if(!valid||interval.powerMW*share<thresholdMW){run=0;lastEnd=null;continue;}
    run=lastEnd===start?run+10:10;total+=10;longest=Math.max(longest,run);lastEnd=end;
  }
  return {totalMinutes:total,longestMinutes:longest};
}

export function combinedSupply(fryslan, beabuorren) {
  const a=new Map(fryslan.map(i=>[i.start,i])),b=new Map(beabuorren.map(i=>[i.start,i]));
  return [...new Set([...a.keys(),...b.keys()])].sort().map(start=>{
    const x=a.get(start),y=b.get(start);
    const valid=x&&y&&x.end===y.end&&typeof x.powerMW==='number'&&Number.isFinite(x.powerMW)&&typeof y.powerMW==='number'&&Number.isFinite(y.powerMW);
    return {start,end:x?.end||y.end,powerMW:valid?(x.powerMW*.1+y.powerMW)/1.1:null};
  });
}

// Group near-equal model outputs instead of treating each decimal as a new value.
export function mostFrequentPower(intervals) {
  const buckets=new Map();let availableMinutes=0;
  for(const i of intervals){
    const v=i.powerMW,start=Date.parse(i.start),end=Date.parse(i.end);
    if(typeof v!=='number'||!Number.isFinite(v)||v<0||end-start!==600000)continue;
    const band=Math.floor(v);buckets.set(band,(buckets.get(band)||0)+10);availableMinutes+=10;
  }
  if(!buckets.size)return null;
  const [lowerMW,minutes]=[...buckets].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0];
  const tiedBands=[...buckets].filter(([,n])=>n===minutes).length;
  return {lowerMW,upperMW:lowerMW+1,lineMW:lowerMW+.5,minutes,availableMinutes,tiedBands};
}

export function researchResults(intervals) {
  const valid=intervals.filter(i=>typeof i.powerMW==='number'&&Number.isFinite(i.powerMW)&&i.powerMW>=0&&Date.parse(i.end)-Date.parse(i.start)===600000);
  if(!valid.length)return null;
  const availableHours=valid.length/6;
  const supplyEnergyMWh=valid.reduce((sum,i)=>sum+i.powerMW/6,0);
  const supplyHours=valid.filter(i=>i.powerMW>0).length/6;
  const descending=valid.map(i=>i.powerMW).sort((a,b)=>b-a);
  const reliable=fraction=>descending[Math.max(0,Math.ceil(descending.length*fraction)-1)];
  const sizes=[1,2,3,4,5,7.5,10,12.5,15,17.5,20,22.5,25,27.5,30,32.5,35,37.5,40,42.5,44,44.25];
  const rows=sizes.map(capacityMW=>{
    const energyMWh=valid.reduce((sum,i)=>sum+Math.min(capacityMW,Math.max(0,i.powerMW))/6,0);
    const stats=runtimeStats(intervals,capacityMW);
    return {capacityMW,energyMWh,captureFraction:supplyEnergyMWh>0?energyMWh/supplyEnergyMWh:0,equivalentFullLoadHours:energyMWh/capacityMW,utilisation:energyMWh/(capacityMW*availableHours),fullLoadHours:stats.totalMinutes/60,longestHours:stats.longestMinutes/60};
  });
  return {availableHours,supplyEnergyMWh,supplyHours,power90:reliable(.9),power50:reliable(.5),rows};
}

// kWh/kg is the electricity consumed at the electrolyser, excluding BoP already
// removed from the supply. A constant specific consumption is an explicit scenario.
export function hydrogenKg(energyMWh, kWhPerKg) {
  if(!Number.isFinite(energyMWh)||energyMWh<0||!Number.isFinite(kWhPerKg)||kWhPerKg<=0)return null;
  return energyMWh*1000/kWhPerKg;
}
