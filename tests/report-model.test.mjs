import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../src/opsplitsing/report-model.js',import.meta.url),'utf8');
const context=vm.createContext({Intl});
vm.runInContext(source,context);
const {makeReport,costs}=context.OpsReportModel;
const fixture=JSON.parse(await readFile(new URL('./fixtures/opsplitsing-2025-native.json',import.meta.url),'utf8'));
const plain=v=>JSON.parse(JSON.stringify(v));
const close=(actual,expected,tolerance=1e-8)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance*Math.max(1,Math.abs(expected)),`${actual} differs from ${expected}`);
function deepFreeze(v){Object.values(v).forEach(x=>x&&typeof x==='object'&&deepFreeze(x));return Object.freeze(v);}

// This fixture contains independent native Python model output, not output from this report.
test('cost explanation reproduces native Python totals and exact four-part difference',()=>{
 const report=makeReport(deepFreeze(structuredClone(fixture)),{},2);
 assert.equal(report.checks.length,15);
 assert.ok(report.checks.every(c=>c.ok),JSON.stringify(report.checks.filter(c=>!c.ok)));
 close(report.economics.base.capex,45_000_000);
 close(report.economics.comparison.capex,46_000_000);
 close(report.economics.base.lcoh,8.02881956239917);
 close(report.economics.comparison.lcoh,7.965166072763748);
 close(report.delta,-0.0636534896354215);
 for(const part of report.parts)close(part.value,fixture.rijen[1].uitsplitsing[part.key]);
 close(report.parts.reduce((s,p)=>s+p.value,0),report.delta);
 assert.equal(report.context.coverage[0].hours,8650.333333333332);
 close(report.context.coverage[0].scale,8760/8650.333333333332);
 assert.match(report.context.annualisation,/niet door de kostprijzen per jaar te middelen/);
 assert.notEqual(report.result,fixture);
 assert.equal(report.base,report.result.rijen[0]);
});

test('tampered annual totals fail their controls; cached decomposition is never trusted',()=>{
 const input=structuredClone(fixture);
 input.rijen[1].kosten_meur_jaar+=0.1;
 input.rijen[1].uitsplitsing.meer_waterstof=999;
 const report=makeReport(input,{},2);
 assert.equal(report.checks.find(c=>c.label==='2 modules: totale jaarkosten').ok,false);
 close(report.parts.find(p=>p.key==='meer_waterstof').value,fixture.rijen[1].uitsplitsing.meer_waterstof);
 input.rijen[0].waterstof_t=1;
 assert.equal(report.base.waterstof_t,fixture.rijen[0].waterstof_t,'The report retains the result snapshot');
});

test('metadata reports changed percentages in shown units and does not invent provenance',()=>{
 const input={...structuredClone(fixture),technologie:'pem'};
 const meta={groepen:[{naam:'Rendement',velden:[{key:'minimumlast',label:'Minimumlast',schaal:100,eenheid:'%',bron:'plaatshouder',uitleg:'Uit datasheet te vervangen.'}]}],technologieen:{pem:{naam:'PEM',waarden:{minimumlast:10}}}};
 let report=makeReport(input,meta,2);
 assert.equal(report.assumptions.find(a=>a.key==='minimumlast').source,'plaatshouder');
 assert.equal(report.assumptions.find(a=>a.key==='minimumlast').value,10);
 input.aannames.minimumlast=0.4;
 report=makeReport(input,meta,2);
 const changed=report.assumptions.find(a=>a.key==='minimumlast');
 assert.equal(changed.source,'eigen aanname');assert.equal(changed.value,40);assert.equal(changed.rawValue,0.4);assert.equal(changed.scale,100);
 delete input.technologie;
 report=makeReport(input,meta,2);
 assert.equal(report.assumptions.find(a=>a.key==='minimumlast').source,'herkomst niet vastgelegd');
 assert.equal(report.assumptions.find(a=>a.key==='minimumlast').originalSource,'plaatshouder');
});

test('zero interest, capped levy discount, subsidies and oxygen sales follow model definitions',()=>{
 const a={...fixture.aannames,rente:0,korting_net_belasting_eur_mwh:1000,capex_subsidie_eur_kw:500,waterstofpremie_eur_kg:1,zuurstofprijs_eur_t:50};
 const r=costs(fixture.rijen[0],a);
 assert.equal(r.annuity,1/20);
 assert.equal(r.levies,0);
 assert.equal(r.powerPrice,88.91);
 assert.equal(r.subsidy,22_000_000);
 assert.equal(r.opex,900_000,'Fixed OPEX remains based on the gross investment');
 assert.equal(r.financing,(45_000_000-22_000_000)/20);
 assert.equal(r.revenue,1.4);
 close(r.net,r.lcoh-1.4);
});

test('no production is explicit and missing wear inputs never become zero cost',()=>{
 const input=structuredClone(fixture);
 for(const row of input.rijen){row.waterstof_t=0;row.lcoh_eur_kg=null;row.netto_eur_kg=null;}
 let report=makeReport(input,{},2);
 assert.equal(report.economics.base.lcoh,null);
 assert.equal(report.delta,null);
 assert.equal(report.parts.length,0);
 assert.ok(report.checks.filter(c=>c.label.includes('kostprijs')).every(c=>c.ok));
 assert.match(report.calculations.find(c=>c.key==='lcoh').baseExpression,/Geen productie/);
 delete input.rijen[1].eq_uren_per_module;
 report=makeReport(input,{},2);
 assert.equal(report.economics.comparison.stack,null);
 assert.equal(report.checks.find(c=>c.label==='2 modules: stackvervanging').ok,false);
 assert.equal(report.calculations.find(c=>c.key==='stack').comparison,null);
 assert.ok(!JSON.stringify(report).includes('NaN'));
});

test('base follows first chosen configuration even when one module was not selected',()=>{
 const input=structuredClone(fixture);
 input.rijen[0].modules=4;input.rijen[1].modules=8;
 const report=makeReport(input,{},8);
 assert.equal(report.base.modules,4);assert.equal(report.comparison.modules,8);
 assert.equal(makeReport({aannames:fixture.aannames,rijen:[fixture.rijen[0]]},{}).comparison.modules,1);
 assert.throws(()=>makeReport({aannames:{},rijen:[]}),/Bereken eerst/);
});

// ---------------------------------------------------------------- conclusie binnen de modelonzekerheid

const {materiality,describe,format}=context.OpsReportModel;
// Rijen met een andere productie: de kostprijs volgt uit dezelfde kostenformule, zodat opgeslagen en nagerekend gelijk blijven.
function scenario(scales){
 const input=structuredClone(fixture);
 input.rijen=scales.map(([modules,scale],i)=>{const row=structuredClone(fixture.rijen[Math.min(i,1)]);row.modules=modules;row.waterstof_t*=scale;
  row.eq_uren_per_module=Array(modules).fill(row.eq_uren_per_module[0]);row.lcoh_eur_kg=costs(row,input.aannames).lcoh;return row;});
 return input;
}
const lcohWith=(input,changes)=>input.rijen.map(row=>costs(row,{...input.aannames,...changes}).lcoh);

test('a clear winner stays cheapest in every test case and is reported with its margin',()=>{
 const m=materiality(fixture,{});
 assert.equal(m.clear,true);assert.equal(m.lowest,2);assert.deepEqual(plain(m.equivalent),[2]);assert.deepEqual(plain(m.dearer),[1]);
 assert.deepEqual(plain(m.band),[0.3,2],'Default fixed costs per module are tested over 0,3–2 M€');
 for(const f of m.band){const [one,two]=lcohWith(fixture,{vaste_kosten_module_meur:f});assert.ok(two<one,`2 modules cheaper at ${f} M€`);}
 close(m.margin,fixture.rijen[0].lcoh_eur_kg-fixture.rijen[1].lcoh_eur_kg);
 assert.ok(m.worstMargin>0&&m.worstMargin<m.margin);
 const v=describe(m);
 assert.equal(v.title,'2 modules: duidelijk het goedkoopst');
 assert.match(v.lines[0],/^7,97 €\/kg, 0,06 €\/kg goedkoper dan 1 module \(theoretische referentie\)\. In elk toetsgeval blijft het minstens 0,01 €\/kg goedkoper/);
 assert.ok(v.lines.some(line=>/^Regel: /.test(line)),'The rule is stated');
});

test('options whose order flips in a test case are equivalent; the headline crowns none of them',()=>{
 // 3 modules is iets goedkoper bij 1 M€, maar bij 2 M€ vaste kosten zijn 2 modules en zelfs de referentie van 1 module goedkoper.
 const input=scenario([[1,1],[2,1],[3,1.006],[8,1.006]]);
 const m=materiality(input,{});
 const [,two,three]=input.rijen.map(row=>row.lcoh_eur_kg);
 assert.ok(three<two,'3 modules has the lowest calculated cost price');
 const atTwo=lcohWith(input,{vaste_kosten_module_meur:2});
 assert.ok(atTwo[1]<atTwo[2],'but 2 modules is cheaper at 2 M€');
 assert.equal(m.clear,false);
 assert.deepEqual(plain(m.equivalent),[1,2,3]);assert.deepEqual(plain(m.dearer),[8]);
 for(const n of m.dearer){
  const i=input.rijen.findIndex(row=>row.modules===n),best=input.rijen.findIndex(row=>row.modules===m.lowest);
  for(const f of [0.3,2]){const l=lcohWith(input,{vaste_kosten_module_meur:f});assert.ok(l[i]>l[best],`${n} modules dearer at ${f} M€`);}
 }
 const v=describe(m);
 assert.match(v.title,/modules: gelijkwaardig binnen de modelonzekerheid$/);
 assert.doesNotMatch([v.title,...v.lines].join(' '),/duidelijk het goedkoopst/);
 assert.match(v.lines[0],/^Kostprijs \d,\d(–\d,\d)? €\/kg, onderling verschil ≤ 0,\d\d €\/kg\.$/);
 assert.equal(v.title,'1–3 modules: gelijkwaardig binnen de modelonzekerheid');
 assert.ok(v.lines.includes('De groep bevat de theoretische referentie van 1 module.'));
 assert.ok(v.lines.includes('In elk toetsgeval duurder: 8 modules.'));
 assert.ok(v.lines.some(line=>/de stroomprijs en de investering/.test(line)),'The heavier cost assumptions are named');
});

test('own fixed costs per module are varied by 25 %, not over the default 0,3–2 M€ band',()=>{
 const meta={groepen:[{naam:'Kosten',velden:[{key:'vaste_kosten_module_meur',schaal:1,min:0,max:50,bron:'onzekere aanname'}]}],technologieen:{pem:{waarden:{vaste_kosten_module_meur:1}}}};
 const input={...structuredClone(fixture),technologie:'pem'};
 assert.deepEqual(plain(materiality(input,meta).band),[0.3,2]);
 input.aannames.vaste_kosten_module_meur=0.8;input.rijen.forEach(row=>{row.lcoh_eur_kg=costs(row,input.aannames).lcoh;});
 const m=materiality(input,meta);
 assert.equal(m.band,null);assert.equal(m.ownFixedCost,true);
 assert.match(describe(m).lines.at(-1),/bij elke kostenaanname 25 % lager en hoger/);
 assert.equal(materiality({...fixture,rijen:fixture.rijen.slice(0,1)},{}),null,'One configuration: nothing to compare');
});

test('results get three significant figures, €/kg at most two decimals, differences the resolution of their values',()=>{
 assert.equal(format.sig(255.37),'255');assert.equal(format.sig(1608),'1.610');assert.equal(format.sig(24),'24,0');assert.equal(format.sig(0),'0');
 assert.equal(format.price(131.52),'132');assert.equal(format.price(7.95),'7,95');assert.equal(format.price(8.5),'8,50');assert.equal(format.price(13.24),'13,2');
 assert.equal(format.diff(3128.4,2873),'+260','Tonnes: 3.130 − 2.870');
 assert.equal(format.diff(24.689,22.974),'+1,7');
 assert.equal(format.diff(7.9531,7.892,'price'),'+0,06');
 assert.equal(format.diff(3260.6,3259.7),'+<10','A change below the resolution is not shown as zero');
 assert.equal(format.diff(7.892,7.9531,'price',false),'0,06');
 const report=makeReport(fixture,{},2);
 assert.equal(report.calculations.find(c=>c.key==='kg').baseExpression,'2.980 ton');
 assert.match(report.calculations.find(c=>c.key==='powerPrice').baseExpression,/^88,91 \+ MAX\(0; 18,2 \+ 3,8 − 0\)$/,'Electricity prices stay as entered');
 assert.doesNotMatch(JSON.stringify(report.calculations.map(c=>[c.baseExpression,c.comparisonExpression])),/\.\d{3},\d|,\d{5}/,'No full-precision numbers in filled-in formulas');
 assert.ok(report.context.limitations.some(text=>/Start\/stop-slijtage zit niet in de kosten/.test(text)));
 assert.ok(report.context.limitations.some(text=>/alleen mee als ze in de ingevoerde offerte zitten/.test(text)));
 assert.ok(report.context.limitations.some(text=>/1 module is een theoretische referentie/.test(text)));
});
