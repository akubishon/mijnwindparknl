// Preserve the upstream UI's request interface while computing locally.
// bridge.js and opsplitsing.js are classic scripts in one global scope: keep this file's names out of it.
(()=>{
const originalFetch=window.fetch.bind(window);
const calculator=new Worker('/opsplitsing-assets/calculator-worker.js');
let serial=0;
// The worker computes one request at a time and cannot be interrupted: runPython is synchronous, so a calculation that has
// started always runs to the end. Requests therefore wait here, not in the worker's message queue, which makes it possible to
// (1) drop a request that has not started when a newer one of the same kind arrives and (2) let /dag overtake the long
// /gevoeligheid and /omslagkaart. A dropped request rejects with an AbortError; the UI ignores that silently.
// Progress: fetch(path, {voortgang}) takes a callback. It receives the worker's {fase, ...} messages for the running request
// (calculator-worker.js, browser-runtime.py) and {fase:'wachten', na:kind} while the request waits for another one.
const queue=[];let running=null;
const PRIORITY={aannames:0,run:0,dag:1,gevoeligheid:2,omslagkaart:2};
const kindOf=path=>{const kind=path.slice('/api/opsplitsing/'.length);return Object.hasOwn(PRIORITY,kind)?kind:'run';};
function next(){
 if(running||!queue.length)return;
 queue.sort((a,b)=>PRIORITY[a.kind]-PRIORITY[b.kind]||a.id-b.id);
 running=queue.shift();
 calculator.postMessage({id:running.id,path:running.path,body:running.body});
 for(const item of queue)item.voortgang?.({fase:'wachten',na:running.kind});
}
function enqueue(path,body,voortgang){
 const kind=kindOf(path);
 return new Promise((resolve,reject)=>{
  // Nothing newer than a queued request of the same kind is wanted any more. The meta request is never replaced.
  if(kind!=='aannames')for(let i=queue.length-1;i>=0;i--)if(queue[i].kind===kind){
   queue.splice(i,1)[0].reject(new DOMException('Vervangen door een nieuwer verzoek.','AbortError'));
  }
  const item={id:++serial,kind,path,body,resolve,reject,voortgang};
  queue.push(item);
  next();
  if(running!==item)voortgang?.({fase:'wachten',na:running.kind});
 });
}
calculator.onmessage=({data})=>{
 if(!running||running.id!==data.id)return;
 // Progress does not settle the request; only a message with result or error does.
 if(data.voortgang){running.voortgang?.(data.voortgang);return;}
 const done=running;running=null;done.resolve(data);next();
};
calculator.onerror=()=>{
 const failure={error:'Het rekenmodel kon niet starten. Controleer de verbinding en herlaad de pagina.'};
 const waiting=running?[running,...queue]:[...queue];
 running=null;queue.length=0;
 for(const request of waiting)request.resolve(failure);
};
window.fetch=async function(input,options){
 const path=typeof input==='string'?input:input.url;
 if(!path.startsWith('/api/opsplitsing'))return originalFetch(input,options);
 if(path.includes('/scenarios')){
  let saved=[];try{saved=JSON.parse(localStorage.getItem('opsplitsing-saved-v1')||'[]');}catch{}
  if(path==='/api/opsplitsing/scenarios')return Response.json({scenarios:saved.map(item=>{
   const rows=item.resultaat.rijen,one=rows.find(r=>r.modules===1)||rows[0];
   const best=rows.reduce((a,b)=>(b.lcoh_eur_kg??Infinity)<(a.lcoh_eur_kg??Infinity)?b:a);
   // Vóór modelversie 11 rekende de opsplitsing met de oude, op productie geijkte windmethode; 13–16 zonder BoP bovenop het stackvermogen.
   const version=item.resultaat.model_versie??0,windmethode=item.resultaat.windmethode||'productie_hoogste';
   return {...item,resultaat:undefined,strategie:item.resultaat.strategie,jaren:item.resultaat.jaren,modules:rows.map(r=>r.modules),beste:best,een_module:one,
    windmethode,model_versie:version,verouderd:version<17,reden:version<13?windmethode:'zonder BoP'};
  })});
  const item=saved.find(x=>x.id===decodeURIComponent(path.split('/').pop()));
  return Response.json(item||{error:'Scenario niet gevonden.'},{status:item?200:404});
 }
 const data=await enqueue(path,options?.body?JSON.parse(options.body):{},options?.voortgang);
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
   // Een ander windprofiel of één windpark staat in de naam; het resultaat zelf bewaart beide keuzes.
   const profile=lastResult.windprofiel&&lastResult.windprofiel!=='onafhankelijk'?' · '+(meta.windkeuze?.profielen?.[lastResult.windprofiel]?.naam||lastResult.windprofiel):'';
   const parks=lastResult.parken?.length===1?' · alleen '+({fryslan:'Fryslân',beabuorren:'Beabuorren'}[lastResult.parken[0]]||lastResult.parken[0]):'';
   const naam=(meta.technologieen[resultTechnology]?.naam||'Eigen aannames')+' · '+lastResult.strategie+' · '+lastResult.jaren.join(', ')+profile+parks;
   saved.unshift({id:crypto.randomUUID(),naam,technologie:resultTechnology,eigen_aannames:{},gemaakt:new Date().toISOString(),resultaat:lastResult});
   localStorage.setItem('opsplitsing-saved-v1',JSON.stringify(saved));loadSaved();status.textContent='Scenario bewaard op dit apparaat.';
  }catch{status.textContent='Bewaren is niet gelukt. Mogelijk is de browseropslag vol of geblokkeerd.';}
 };
});
})();
