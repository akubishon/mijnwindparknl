import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const modelSource=await readFile(new URL('../src/opsplitsing/report-model.js',import.meta.url),'utf8');
const uiSource=await readFile(new URL('../src/opsplitsing/report-ui.js',import.meta.url),'utf8');
const fixture=JSON.parse(await readFile(new URL('./fixtures/opsplitsing-2025-native.json',import.meta.url),'utf8'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const nodes=new Map(),requests=[],events=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,hidden:true,disabled:false,value:id==='report-day'?'2025-05-14':'',attrs:{},classList:{add(){},remove(){}},setAttribute(key,v){this.attrs[key]=v;},replaceChildren(...children){this.children=children;},focus(){},scrollIntoView(){},querySelectorAll(){return [];},append(){},click(){},remove(){}});return nodes.get(id);};
 const docEvents=new Map();
 const document={getElementById:node,activeElement:node('explain-calculation'),addEventListener:(n,fn)=>docEvents.set(n,fn),body:{...node('body'),append(){}},createElement:()=>({...node('download')})};
 const scales=new Set(['minimumlast','deellastvoordeel','faradayverlies_10','bop_vast','bop_variabel','degradatie_1000h','standby','stack_aandeel','opex_aandeel','rente']);
 const meta={groepen:[{naam:'Test',velden:Object.keys(fixture.aannames).map(key=>({key,label:key,schaal:scales.has(key)?100:1,eenheid:scales.has(key)?'%':'',bron:'plaatshouder'}))}],technologieen:{pem:{naam:'PEM',waarden:Object.fromEntries(Object.entries(fixture.aannames).map(([k,v])=>[k,v*(scales.has(k)?100:1)]))}}};
 const ctx=vm.createContext({document,Intl,Date,JSON,Blob,URL:{createObjectURL:()=>'',revokeObjectURL(){}},Option:function(text,value,def,selected){return {text,value,selected};},setTimeout(){},addEventListener:(n,fn)=>{if(!events.has(n))events.set(n,[]);events.get(n).push(fn);},fetch:(url,options)=>new Promise(resolve=>requests.push({url,body:JSON.parse(options.body),resolve})),OpsReportMoments:{build:(data,a,b,c)=>({date:data.datum,notes:[],moments:[],a,b,c})}});
 vm.runInContext(modelSource,ctx);vm.runInContext(uiSource,ctx);docEvents.get('DOMContentLoaded')();
 const result={...structuredClone(fixture),technologie:'pem'};
 return {ctx,ui:ctx.OpsReportUI,node,requests,meta,result};
}

test('report UI and day request use the result snapshot and shown-unit scaling',async()=>{
 const h=harness();h.ui.setResult(h.result,h.meta);
 h.result.aannames.minimumlast=0.8;h.result.rijen[0].kosten_meur_jaar=999;
 h.meta.groepen[0].velden.find(v=>v.key==='minimumlast').schaal=1;
 h.ui.open();
 const request=h.requests[0];assert.equal(request.url,'/api/opsplitsing/dag');
 assert.equal(request.body.aannames.minimumlast,10);
 assert.equal(request.body.aannames.bop_vast,3);
 assert.equal(request.body.aannames.degradatie_1000h,0.19);
 assert.deepEqual(request.body.modules,[1,2]);
 assert.equal(h.ui.getReport().result.aannames.minimumlast,0.1);
 assert.equal(h.ui.getReport().base.kosten_meur_jaar,fixture.rijen[0].kosten_meur_jaar);
 request.resolve({ok:true,json:async()=>({datum:'2025-05-14'})});await tick();
 assert.equal(h.ui.getReport().moments.date,'2025-05-14');
 assert.equal(h.node('report-excel').disabled,false);
});

test('an old day response cannot attach moments after a newer result replaces the snapshot',async()=>{
 const h=harness();h.ui.setResult(h.result,h.meta);h.ui.open();const old=h.ui.getReport();
 const changed=structuredClone(h.result);changed.sleutel='new-result';h.ui.setResult(changed,h.meta);h.ui.open();
 const current=h.ui.getReport();assert.notEqual(current,old);
 h.requests[0].resolve({ok:true,json:async()=>({datum:'2025-05-13'})});await tick();
 assert.equal(current.moments,undefined);assert.equal(old.moments,undefined);
 assert.equal(h.node('report-excel').disabled,true);
 h.requests[1].resolve({ok:true,json:async()=>({datum:'2025-05-14'})});await tick();
 assert.equal(current.moments.date,'2025-05-14');assert.equal(h.node('report-excel').disabled,false);
});

test('a failed example request leaves annual arithmetic and export available',async()=>{
 const h=harness();h.ui.setResult(h.result,h.meta);h.ui.open();
 h.requests[0].resolve({ok:false,json:async()=>({error:'Geen windgegevens voor deze dag.'})});await tick();
 assert.equal(h.ui.getReport().moments,undefined);
 assert.equal(h.ui.getReport().checks.every(v=>v.ok),true);
 assert.match(h.node('report-day-status').textContent,/jaarrapport blijft beschikbaar/);
 assert.equal(h.node('report-excel').disabled,false);assert.equal(h.node('report-print').disabled,false);
});

test('old, unknown and different wind-model snapshots do not silently request current-model moments',()=>{
 for(const change of [{model_versie:11},{model_versie:undefined},{windmethode:'productie_hoogste'}]){
  const h=harness();Object.assign(h.result,change);h.ui.setResult(h.result,h.meta);h.ui.open();
  assert.equal(h.requests.length,0,'Incompatible snapshot must not call current Python runtime');
  assert.match(h.node('report-day-status').textContent,/oudere of andere modelbasis/);
  assert.equal(h.ui.getReport().moments,undefined);
  assert.equal(h.node('report-print').disabled,false);
  assert.equal(h.node('report-excel').disabled,false);
  assert.equal(h.node('report-json').disabled,false);
 }
});

test('retry clears the old example error and JSON waits for the complete example response',async()=>{
 const h=harness();h.ui.setResult(h.result,h.meta);h.ui.open();
 assert.equal(h.node('report-json').disabled,true);
 h.requests[0].resolve({ok:false,json:async()=>({error:'Tijdelijk geen daggegevens'})});await tick();
 assert.equal(h.ui.getReport().momentError,'Tijdelijk geen daggegevens');
 assert.equal(h.node('report-json').disabled,false);
 h.node('report-load-day').onclick();
 assert.equal(h.ui.getReport().momentError,undefined);
 assert.equal(h.node('report-json').disabled,true);
 h.requests[1].resolve({ok:true,json:async()=>({datum:'2025-05-14'})});await tick();
 assert.equal(h.ui.getReport().moments.date,'2025-05-14');
 assert.equal(h.ui.getReport().momentError,undefined);
 assert.equal(h.node('report-json').disabled,false);
});
