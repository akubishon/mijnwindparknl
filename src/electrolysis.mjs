// A source interval represents a ten-minute mean, not instantaneous power.
export function runtimeStats(intervals, thresholdMW) {
  if(!Number.isFinite(thresholdMW)||thresholdMW<=0)return null;
  let total=0,longest=0,run=0,lastEnd=null;
  for(const interval of intervals){
    const start=Date.parse(interval.start),end=Date.parse(interval.end);
    const valid=Number.isFinite(start)&&end-start===600000&&typeof interval.powerMW==='number'&&Number.isFinite(interval.powerMW);
    if(!valid||interval.powerMW<thresholdMW){run=0;lastEnd=null;continue;}
    run=lastEnd===start?run+10:10;total+=10;longest=Math.max(longest,run);lastEnd=end;
  }
  return {totalMinutes:total,longestMinutes:longest};
}
