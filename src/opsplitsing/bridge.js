// Preserve the upstream UI's request interface while computing locally.
const originalFetch=window.fetch.bind(window);
const calculator=new Worker('/opsplitsing-assets/calculator-worker.js');
let serial=0;const pending=new Map();
calculator.onmessage=({data})=>{const callback=pending.get(data.id);if(callback){pending.delete(data.id);callback(data);}};
calculator.onerror=()=>{for(const callback of pending.values())callback({error:'Het rekenmodel kon niet starten. Controleer de verbinding en herlaad de pagina.'});pending.clear();};
window.fetch=async function(input,options){
 const path=typeof input==='string'?input:input.url;
 if(!path.startsWith('/api/opsplitsing'))return originalFetch(input,options);
 if(path.includes('/scenarios')){
  let saved=[];try{saved=JSON.parse(localStorage.getItem('opsplitsing-saved-v1')||'[]');}catch{}
  if(path==='/api/opsplitsing/scenarios')return Response.json({scenarios:saved.map(item=>{
   const rows=item.resultaat.rijen,one=rows.find(r=>r.modules===1)||rows[0];
   const best=rows.reduce((a,b)=>(b.lcoh_eur_kg??Infinity)<(a.lcoh_eur_kg??Infinity)?b:a);
   return {...item,resultaat:undefined,strategie:item.resultaat.strategie,jaren:item.resultaat.jaren,modules:rows.map(r=>r.modules),beste:best,een_module:one};
  })});
  const item=saved.find(x=>x.id===decodeURIComponent(path.split('/').pop()));
  return Response.json(item||{error:'Scenario niet gevonden.'},{status:item?200:404});
 }
 const id=++serial;
 const data=await new Promise(resolve=>{pending.set(id,resolve);calculator.postMessage({id,path,body:options?.body?JSON.parse(options.body):{}});});
 return Response.json(data.error?{error:data.error}:data.result,{status:data.error?400:200});
};

document.addEventListener('DOMContentLoaded',()=>{
 const saveButton=document.createElement('button');saveButton.type='button';saveButton.className='secondary-button';saveButton.textContent='Uitkomst bewaren op dit apparaat';
 document.querySelector('.saved-actions').prepend(saveButton);
 saveButton.onclick=()=>{
  const status=document.getElementById('saved-status');
  if(!lastResult){status.textContent='Bereken eerst een scenario.';return;}
  try{
   const saved=JSON.parse(localStorage.getItem('opsplitsing-saved-v1')||'[]');
   const resultTechnology=lastResult.technologie;
   const naam=(meta.technologieen[resultTechnology]?.naam||'Eigen aannames')+' · '+lastResult.strategie+' · '+lastResult.jaren.join(', ');
   saved.unshift({id:crypto.randomUUID(),naam,technologie:resultTechnology,eigen_aannames:{},gemaakt:new Date().toISOString(),resultaat:lastResult});
   localStorage.setItem('opsplitsing-saved-v1',JSON.stringify(saved));loadSaved();status.textContent='Scenario bewaard op dit apparaat.';
  }catch{status.textContent='Bewaren is niet gelukt. Mogelijk is de browseropslag vol of geblokkeerd.';}
 };
});
