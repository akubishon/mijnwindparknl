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
