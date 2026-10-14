export function atlasDraft(model){
 const value=key=>String(model?.values?.[key]||'');
 const parse=(text,unit)=>{const m=text.match(new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*'+unit));return m?m[1].replace(',','.'):'';};
 const minimumText=value('minimum');
 return {modelId:model.id,modules:'1',powerMW:parse(value('power'),'MW\\b'),kWhPerKg:parse(value('systemEnergy'),'kWh/kg'),minimumPct:/H[₂2]|Nm|referentie|niet expliciet/i.test(minimumText)?'':parse(minimumText,'%'),maximumPct:'100'};
}
export function evaluateAtlasConfiguration(intervals,config){
 const n=v=>typeof v==='string'&&v.trim()===''?NaN:Number(String(v).replace(',','.'));
 const modules=n(config.modules),powerMW=n(config.powerMW),kWhPerKg=n(config.kWhPerKg),minimumPct=n(config.minimumPct),maximumPct=n(config.maximumPct);
 if(!Number.isInteger(modules)||modules<1||modules>1000||!Number.isFinite(powerMW)||powerMW<=0||!Number.isFinite(kWhPerKg)||kWhPerKg<=0||!Number.isFinite(minimumPct)||minimumPct<0||!Number.isFinite(maximumPct)||maximumPct<=0||maximumPct>100||minimumPct>maximumPct)return null;
 const nominalMW=modules*powerMW,minimumMW=nominalMW*minimumPct/100,maximumMW=nominalMW*maximumPct/100;
 let availableHours=0,supplyMWh=0,energyMWh=0,operatingHours=0,belowMinimumMWh=0,aboveMaximumMWh=0;
 for(const i of intervals){if(typeof i.powerMW!=='number'||!Number.isFinite(i.powerMW)||i.powerMW<0||Date.parse(i.end)-Date.parse(i.start)!==600000)continue;
  const supply=i.powerMW*1.1; // Restore gross allocation; system consumption already includes auxiliaries.
  availableHours+=1/6;supplyMWh+=supply/6;
  const used=supply>0&&supply>=minimumMW?Math.min(supply,maximumMW):0;
  if(used>0)operatingHours+=1/6;energyMWh+=used/6;
  if(supply<minimumMW)belowMinimumMWh+=supply/6;
  aboveMaximumMWh+=Math.max(0,supply-maximumMW)/6;
 }
 if(!availableHours)return null;
 return {modules,powerMW,kWhPerKg,minimumPct,maximumPct,nominalMW,minimumMW,maximumMW,availableHours,supplyMWh,energyMWh,operatingHours,belowMinimumMWh,aboveMaximumMWh,hydrogenKg:energyMWh*1000/kWhPerKg,captureFraction:supplyMWh>0?energyMWh/supplyMWh:0};
}
