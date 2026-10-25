import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../src/opsplitsing/report-moments.js', import.meta.url), 'utf8');
const sandbox = vm.createContext({});
vm.runInContext(source, sandbox);
const {build, moduleArithmetic} = sandbox.OpsReportMoments;
const a = {capaciteit_mw:44, minimumlast:0.1, systeemverbruik_vol:53.3,
  faradayverlies_10:0.03, bop_variabel:0.07, bop_vast:0.03,
  degradatie_1000h:0.0019, stack_levensduur_uur:60000, deellastvoordeel:0.1};
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('per-module arithmetic matches native Python reference, including startup and BoP', () => {
  // Generated with Aannames(), stack_kg_h(), draw_mw() in opsplitsing.py.
  const first = moduleArithmetic(5.7, 11, 1, a);
  close(first.kg, 17.489838759276743);
  close(first.powerMw, 6.429);
  close(first.rows.find(row => row.key === 'secFull').value, 48.30918181818181);
  const second = moduleArithmetic(8.2, 11, 0, a);
  close(second.kg, 27.352972920111153);
  close(second.powerMw, 9.104);
  assert.equal(moduleArithmetic(2.2, 11, 10, a).kg, 0);
  assert.equal(moduleArithmetic(1.0996, 11, 0, a).kg, 0);
  assert.equal(moduleArithmetic(0, 11, 0, a).powerMw, 0);
});

function fixture() {
  const make = (stacks, size, start, index) => {
    const rows = stacks.map((stack, i) => moduleArithmetic(stack,size,start?.[i] || 0,a));
    return {t:1750000000 + index*600, aanbod:[7,49,20,0][index], stack:stacks,
      opstart_min:start || stacks.map(() => 0),
      kg: rows.map(row => Math.round(row.kg*1000)/1000),
      verbruik:Math.round(rows.reduce((s,row) => s+row.powerMw,0)*1000)/1000,
      redenen:[], passen:stacks.length, gewenst:stacks.length};
  };
  const config = {
    2:{module_mw:22, stappen:[[0,0],[22,22],[15,0],[0,0]].map((stack,i)=>make(stack,22,null,i))},
    4:{module_mw:11, stappen:[[5.7,0,0,0],[11,11,11,11],[8.2,8.2,0,0],[0,0,0,0]].map((stack,i)=>make(stack,11,i===2?[1,0,0,0]:null,i))}
  };
  const park = {v10:5, factor:1.2, alpha:0.14, hoogtevertaling:'wins50', ashoogte:100,
    v_as:6,zog:0.1,v_turbine:5.4,turbines:89,turbine_kw:500,mw:44.5,aandeel:0.1};
  return {datum:'2025-06-15', configuraties:config,
    wind:[0,1,2,3].map(()=>({knmi:{267:5,269:5},fryslan:{...park},beabuorren:{...park,turbines:4,mw:2,aandeel:1}})),
    stations:{267:'Stavoren',269:'Houtribdijk'},parken:{fryslan:'Windpark Fryslân',beabuorren:'Wynpark Beabuorren'},
    aandeel:{fryslan:0.1,beabuorren:1},regel_per_park:{fryslan:'gemiddelde',beabuorren:'gemiddelde'}};
}

test('three moments follow documented criteria and retain per-module mixed startup loads', () => {
  const data = fixture(), original = JSON.stringify(data);
  const report = build(data,a,2,4);
  assert.deepEqual(Array.from(report.moments, moment => moment.index), [0,1,2]);
  assert.equal(report.moments[0].configurations[0].modules, 2);
  assert.equal(report.moments[0].configurations[0].traceKg, 0);
  assert.equal(report.moments[0].configurations[1].check.ok, true);
  const modules = report.moments[2].configurations[1].moduleRows;
  assert.equal(modules[0].productiveFraction,0.9);
  assert.equal(modules[1].productiveFraction,1);
  assert.notEqual(modules[0].kg,modules[1].kg);
  assert.match(report.moments[0].wind.find(row=>row.key==='supply').expression,/44.5 × 0.1 \+ 2 × 1/);
  assert.equal(JSON.stringify(data),original,'report must not mutate trace data');
});

test('no startup day says so, and missing traces remain usable explanatory output', () => {
  const data = fixture();
  for (const config of Object.values(data.configuraties)) {
    config.stappen = config.stappen.slice(0,2);
    config.stappen.forEach(step => {step.stack = step.stack.map(()=>0);step.kg = step.kg.map(()=>0);step.opstart_min = step.opstart_min.map(()=>0);});
  }
  const report = build(data,a,2,4);
  assert.equal(report.moments[2].available,false);
  assert.match(report.moments[2].criterion,/geen zichtbaar start/);
  assert.equal(build(null,a,2,4).moments.length,0);
  assert.equal(build({configuraties:{}},a,2,4).moments.length,0);
});

test('rounded values at minimum load are marked inconclusive rather than falsely exact', () => {
  const data=fixture();
  data.configuraties[4].stappen[0].stack=[1.1,0,0,0];
  data.configuraties[4].stappen[0].kg=[3,0,0,0];
  const report=build(data,a,2,4);
  assert.equal(report.moments[0].configurations[1].check.ok,null);
  assert.match(report.moments[0].configurations[1].check.detail,/minimumlast/);
});

test('a genuine arithmetic discrepancy is not presented as a successful trace control', () => {
  const data=fixture();
  data.configuraties[4].stappen[0].kg=[1000,0,0,0];
  const report=build(data,a,2,4);
  assert.equal(report.moments[0].configurations[1].check.ok,false);
  assert.ok(Math.abs(report.moments[0].configurations[1].check.deltaKg)>900);
});
