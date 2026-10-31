import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const modelSource=await readFile(new URL('../src/opsplitsing/report-model.js',import.meta.url),'utf8');
const uiSource=await readFile(new URL('../src/opsplitsing/report-ui.js',import.meta.url),'utf8');
const fixture=JSON.parse(await readFile(new URL('./fixtures/opsplitsing-2025-native.json',import.meta.url),'utf8'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const nodes=new Map(),requests=[],events=new Map(),downloads=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,hidden:true,disabled:false,value:id==='report-day'?'2025-05-14':'',attrs:{},classList:{add(){},remove(){}},setAttribute(key,v){this.attrs[key]=v;},replaceChildren(...children){this.children=children;},focus(){},scrollIntoView(){},querySelectorAll(){return [];},append(){},click(){},remove(){}});return nodes.get(id);};
 const docEvents=new Map();
 const document={getElementById:node,activeElement:node('explain-calculation'),addEventListener:(n,fn)=>docEvents.set(n,fn),body:{...node('body'),append(){}},createElement:()=>({...node('download')})};
 const scales=new Set(['minimumlast','deellastvoordeel','faradayverlies_10','bop_vast','bop_variabel','degradatie_jaar','standby','stack_aandeel','opex_aandeel','rente']);
 const meta={groepen:[{naam:'Test',velden:Object.keys(fixture.aannames).map(key=>({key,label:key,schaal:scales.has(key)?100:1,eenheid:scales.has(key)?'%':'',bron:'plaatshouder'}))}],technologieen:{pem:{naam:'PEM',waarden:Object.fromEntries(Object.entries(fixture.aannames).map(([k,v])=>[k,v*(scales.has(k)?100:1)]))}}};
 const ctx=vm.createContext({document,Intl,Date,JSON,Blob,URL:{createObjectURL:blob=>{downloads.push(blob);return '';},revokeObjectURL(){}},Option:function(text,value,def,selected){return {text,value,selected};},setTimeout(){},addEventListener:(n,fn)=>{if(!events.has(n))events.set(n,[]);events.get(n).push(fn);},fetch:(url,options)=>new Promise(resolve=>requests.push({url,body:JSON.parse(options.body),resolve})),OpsReportMoments:{build:(data,a,b,c)=>({date:data.datum,notes:[],moments:[],a,b,c})}});
 vm.runInContext(modelSource,ctx);vm.runInContext(uiSource,ctx);docEvents.get('DOMContentLoaded')();
 const result={...structuredClone(fixture),technologie:'pem',model_versie:17};
 return {ctx,ui:ctx.OpsReportUI,node,requests,meta,result,downloads};
}

test('report UI and day request use the result snapshot and shown-unit scaling',async()=>{
 const h=harness();h.ui.setResult(h.result,h.meta);
 h.result.aannames.minimumlast=0.8;h.result.rijen[0].kosten_meur_jaar=999;
 h.meta.groepen[0].velden.find(v=>v.key==='minimumlast').schaal=1;
 h.ui.open();
 const request=h.requests[0];assert.equal(request.url,'/api/opsplitsing/dag');
 assert.equal(request.body.aannames.minimumlast,10);
 assert.equal(request.body.aannames.bop_vast,3);
 assert.equal(request.body.aannames.degradatie_jaar,1);
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
 for(const change of [{model_versie:16},{model_versie:12},{model_versie:11},{model_versie:undefined},{windmethode:'productie_hoogste'}]){
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

function exampleMoments(startAvailable=true){
 const configuration=(modules,active,traceKg)=>({modules,size:44/modules,active,traceKg,
  rows:[],moduleRows:[],reasons:[],check:{detail:'Afgeronde dagwaarden gecontroleerd.'}});
 const moment=(kind,title,available,windSpeed,power,kg)=>({kind,title,available,
  criterion:available?`Selectiecriterium ${kind}`:'Deze dag bevat geen zichtbaar start- of stopmoment.',
  timestamp:1750000000,
  wind:[{key:'fryslan-v10',label:'Wind op 10 m',value:windSpeed,unit:'m/s'},
   {key:'supply',label:'Beschikbaar vermogen',value:power,unit:'MW'}],
  configurations:[configuration(1,kg?1:0,kg),configuration(2,1,kg+1)]});
 return {date:'2025-05-14',notes:['De jaaruitkomst gebruikt alle beschikbare tienminutenstappen.'],
  moments:[moment('low','Weinig wind',true,4,7,0),
   moment('high','Veel wind',true,12,44,120),
   moment('start','Starten of stoppen',startAvailable,6,20,10)]};
}

test('example picker shows one moment and switches locally without discarding export data',async()=>{
 const h=harness(),data=exampleMoments();
 h.ctx.OpsReportMoments.build=()=>data;
 h.ui.setResult(h.result,h.meta);h.ui.open();
 h.requests[0].resolve({ok:true,json:async()=>({datum:data.date})});await tick();
 const displayed=()=>h.node('report-moments').innerHTML;
 const articleCount=()=>[...displayed().matchAll(/<article class="report-moment">/g)].length;
 assert.equal(articleCount(),1);
 assert.match(displayed(),/<h4>Weinig wind/);
 assert.doesNotMatch(displayed(),/<h4>Veel wind|<h4>Opstarten/);
 assert.match(displayed(),/Van wind naar waterstof/);
 assert.ok(displayed().indexOf('report-chain')<displayed().indexOf('Bekijk de berekening van dit moment'));

 h.node('report-moment-choice').value='high';h.node('report-moment-choice').onchange();
 assert.equal(articleCount(),1);
 assert.match(displayed(),/<h4>Veel wind/);
 assert.doesNotMatch(displayed(),/<h4>Weinig wind|<h4>Opstarten/);
 assert.match(displayed(),/120 kg/);
 assert.equal(h.requests.length,1,'Switching example type must reuse the fetched day');

 h.node('report-json').onclick();
 const exported=JSON.parse(await h.downloads.at(-1).text());
 assert.deepEqual(exported.moments,data,'JSON retains all three example moments, regardless of selection');
 let excelReport;
 h.ctx.OpsReportExcel={build:report=>{excelReport=report;return new Uint8Array();}};
 h.node('report-excel').onclick();
 assert.deepEqual(excelReport.moments,data,'Excel receives the full example data');
});

test('an unavailable startup is stated explicitly and cannot show invented production',async()=>{
 const h=harness(),data=exampleMoments(false);
 h.ctx.OpsReportMoments.build=()=>data;
 h.ui.setResult(h.result,h.meta);h.ui.open();
 h.requests[0].resolve({ok:true,json:async()=>({datum:data.date})});await tick();
 h.node('report-moment-choice').value='start';h.node('report-moment-choice').onchange();
 const shown=h.node('report-moments').innerHTML;
 assert.match(shown,/<h4>Opstarten<\/h4>/);
 assert.match(shown,/geen zichtbaar start- of stopmoment/);
 assert.match(shown,/andere voorbeelddag/);
 assert.doesNotMatch(shown,/report-chain|Kilo’s waterstof|Bekijk de berekening van dit moment/);
 assert.equal(h.requests.length,1);
 assert.equal(h.ui.getReport().moments.moments.length,3);
 assert.equal(h.node('report-json').disabled,false);
});

test('missing wear data leaves known production visible and never becomes zero annual cost',()=>{
 const h=harness();
 h.result.rijen.forEach(row=>{delete row.eq_uren_per_module;});
 h.ui.setResult(h.result,h.meta);
 const shown=h.node('result-conclusion').innerHTML;
 assert.match(shown,/kostengegevens/);
 assert.doesNotMatch(shown,/geen waterstof produceert/);
 assert.match(shown,/2\.980 ton waterstof per jaar/,'Known physical production remains readable');
 assert.doesNotMatch(shown,/(?:>|\s)0(?:,00)? miljoen euro/,'Missing stack and annual costs must not become zero');
 assert.match(shown,/Niet beschikbaar/);
 h.ui.open();
 assert.equal(h.ui.getReport().economics.base.annual,null);
 assert.equal(h.ui.getReport().economics.comparison.annual,null);
 assert.ok(h.ui.getReport().economics.base.kg>0);
});

test('self-comparison distinguishes choosing the basis twice from a single-configuration result',()=>{
 const h=harness();h.ui.setResult(h.result,h.meta);h.ui.open();
 h.node('report-count').value=String(h.result.rijen[0].modules);
 h.node('report-count').onchange();
 const self=h.node('report-body').innerHTML;
 assert.match(self,/basis met zichzelf|andere opstelling/i);
 assert.doesNotMatch(self,/Er is één opstelling gekozen/);
 const single=harness();single.result.rijen=single.result.rijen.slice(0,1);
 single.ui.setResult(single.result,single.meta);
 assert.match(single.node('result-conclusion').innerHTML,/één opstelling/i);
 assert.doesNotMatch(single.node('result-conclusion').innerHTML,/basis met zichzelf/i);
});

test('visible euro-per-kilo prices retain exactly two decimals even for a round tenth',()=>{
 const h=harness(),base=h.result.rijen[0];
 const annual=h.ctx.OpsReportModel.costs(base,h.result.aannames).annual;
 base.waterstof_t=annual/8.5/1000;
 h.ui.setResult(h.result,h.meta);h.ui.open();
 for(const shown of [h.node('result-conclusion').innerHTML,h.node('report-body').innerHTML]){
  assert.match(shown,/<strong>8,50 <small>€\/kg bruto<\/small>/);
  assert.match(shown,/van 8,50 naar/);
  assert.match(shown,/<strong>8,50 €\/kg<\/strong>/);
 }
});

test('sensitivity summary uses saved provenance, explains both signs and resets for a new result',()=>{
 const h=harness();
 h.ui.setResult(h.result,h.meta);
 assert.equal(h.node('result-sensitivity').hidden,true);
 h.meta.groepen[0].velden.find(field=>field.key==='minimumlast').bron='live gewijzigde bron';
 h.meta.technologieen.pem.waarden.minimumlast=80;
 h.ui.showSensitivity({aannames:[{key:'minimumlast',label:'Minimumlast',eenheid:'%',nu:10,
  laag:{waarde:7.5,voordeel:0.03},hoog:{waarde:12.5,voordeel:-0.02}}]},2);
 const shown=h.node('result-sensitivity');
 assert.equal(shown.hidden,false);
 assert.match(shown.innerHTML,/Minimumlast/);
 assert.match(shown.innerHTML,/plaatshouder/,'Provenance follows the calculated snapshot');
 assert.doesNotMatch(shown.innerHTML,/live gewijzigde bron|eigen aanname/);
 assert.match(shown.innerHTML,/0,03 €\/kg goedkoper/);
 assert.match(shown.innerHTML,/0,02 €\/kg duurder/);
 assert.match(shown.innerHTML,/2 modules tegenover 1 module/);
 const newer=structuredClone(h.result);newer.sleutel='newer-sensitivity-result';
 h.ui.setResult(newer,h.meta);
 assert.equal(shown.hidden,true,'A new result must hide the previous sensitivity conclusion');
});

test('the result opens with the conclusion within the model uncertainty, scope notes and starts',()=>{
 const h=harness();h.ui.setResult(h.result,h.meta);
 const shown=h.node('result-conclusion').innerHTML;
 assert.match(shown,/<div class="report-robust"><h4>2 modules: duidelijk het goedkoopst<\/h4>/);
 assert.match(shown,/Regel: een aantal heet pas duidelijk goedkoper/);
 assert.match(shown,/Basis · 1 × 44 MW \(theoretische referentie\)/);
 assert.match(shown,/Met 2 modules: 120 ton waterstof per jaar meer dan met 1 module \(theoretische referentie\)\./,'3.100 t − 2.980 t');
 assert.match(shown,/1\.180 starts per jaar \(592 per module\)/);
 assert.match(shown,/alleen mee als ze in de ingevoerde offerte zitten/);
 assert.match(shown,/Start\/stop-slijtage zit niet in de kosten/);
 assert.match(shown,/Verschil: −0,06 €\/kg/);
 assert.doesNotMatch(shown,/2\.980,8|3\.097,8/,'No full-precision tonnes');
});
