// Visual scenario only: cubic power-equivalent extrapolation, not deliverable turbine power.
// Same reference, hub-height and wake assumptions as the park model, without rated/cut-out caps.
export function theoreticalWindMW(windSpeedMS,timestamp,settings){
 if(typeof windSpeedMS!=='number'||!Number.isFinite(windSpeedMS)||windSpeedMS<0||!settings)return null;
 const height=Number(settings.height),alpha0=Number(settings.alpha),wake=Number(settings.wakePercent),ratedKW=Number(settings.ratedKW),cutIn=Number(settings.cutIn),ratedSpeed=Number(settings.ratedSpeed);
 const date=Date.parse(timestamp),year=new Date(date).getUTCFullYear();
 if(!Number.isFinite(date)||![height,alpha0,wake,ratedKW,cutIn,ratedSpeed].every(Number.isFinite)||height<=0||ratedKW<=0||ratedSpeed<=cutIn)return null;
 const doy=Math.floor((Date.UTC(year,new Date(date).getUTCMonth(),new Date(date).getUTCDate())-Date.UTC(year,0,1))/86400000)+1;
 const alpha=alpha0+(settings.seasonal==='1'?.065*Math.cos(2*Math.PI*(doy-1)/365):0);
 const hub=windSpeedMS*(height/10)**alpha;
 const effective=hub*(settings.wake==='1'?1-wake/100:1);
 const equivalent=ratedKW*Math.max(0,(effective**3-cutIn**3)/(ratedSpeed**3-cutIn**3))*(settings.park==='beabuorren'?8:89)/1000;
 return Number.isFinite(equivalent)?equivalent:null;
}
export function potentialPoints(points,settings){return points.map(p=>({...p,powerMW:theoreticalWindMW(p.windSpeedMS,p.timestamp||p.end,settings)}));}
export function potentialComparison(comparison,settings){
 if(!comparison)return null;
 const stavoren=potentialPoints(comparison.stavoren,settings),houtribdijk=potentialPoints(comparison.houtribdijk,settings);
 return {...comparison,stavoren,houtribdijk,combination:potentialPoints(comparison.combination,settings).map((p,i)=>({...p,stavorenPowerMW:stavoren[i]?.powerMW??null,houtribdijkPowerMW:houtribdijk[i]?.powerMW??null,differenceMW:stavoren[i]?.powerMW==null||houtribdijk[i]?.powerMW==null?null:Math.abs(stavoren[i].powerMW-houtribdijk[i].powerMW)}))};
}
