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
