import {loadPyodide} from 'pyodide';
import {readFileSync,readdirSync} from 'node:fs';
const p=await loadPyodide();
for(const file of readdirSync('src/opsplitsing/python'))if(file.endsWith('.py')){p.FS.mkdirTree('/app/windprofiel');p.FS.writeFile('/app/windprofiel/'+file,readFileSync('src/opsplitsing/python/'+file));}
p.FS.mkdirTree('/app/windprofiel/data');for(const file of readdirSync('src/opsplitsing/python/data'))p.FS.writeFile('/app/windprofiel/data/'+file,readFileSync('src/opsplitsing/python/data/'+file));
p.FS.mkdirTree('/app/zoneinfo/Europe');p.FS.writeFile('/app/zoneinfo/Europe/Amsterdam',readFileSync('src/opsplitsing/Amsterdam'));
p.runPython("import sys,zoneinfo\nsys.path.insert(0,'/app')\nzoneinfo.reset_tzpath(['/app/zoneinfo'])");
p.runPython(readFileSync('src/opsplitsing/browser-runtime.py','utf8'));
console.log(p.runPython("len(dispatch('/api/opsplitsing/aannames', {})['modules'])"));
p.FS.mkdirTree('/app/data');p.FS.writeFile('/app/data/2025.json',readFileSync('src/opsplitsing/data/2025.json'));
const result=JSON.parse(p.runPython("json.dumps(dispatch('/api/opsplitsing', {'jaren':[2025],'modules':[1,2],'strategie':'verdelen'}))"));
const expected=JSON.parse(p.runPython("json.dumps(model.run(model.parse_aannames({}), [2025], [1,2], 'verdelen', workers=1))"));
const metadata=JSON.parse(p.runPython("json.dumps(dispatch('/api/opsplitsing/aannames', {}))"));
assertBoPOnTop();
// 44 MW is stackvermogen; de BoP van het model (3 % vast + 7 % variabel) komt erbovenop: 48,4 MW bij vollast.
function assertBoPOnTop() {
 const fields=metadata.groepen.flatMap(g=>g.velden).filter(f=>f.key.startsWith('bop_'));
 if(fields.length!==2||fields.some(f=>f.bron!=='mijnwindpark.nl')) throw Error('BoP fields missing from the form');
 if(result.aannames.bop_vast!==0.03 || result.aannames.bop_variabel!==0.07) throw Error('BoP is not applied');
 const full=p.runPython("model.draw_mw(44, 44, model.Aannames())");
 if(Math.abs(full-48.4)>1e-9) throw Error('44 MW stack does not draw 48.4 MW at full load');
}
const {default:assert}=await import('node:assert/strict');
assert.deepEqual(result.rijen,expected.rijen);console.log('Browser Python results match the model with its own BoP exactly for 2025, modules 1 and 2.');
const trace=JSON.parse(p.runPython("json.dumps(dispatch('/api/opsplitsing/dag', {'datum':'2025-01-15','modules':[1,2]}))"));
assert.equal(trace.datum,'2025-01-15');assert.equal(Object.keys(trace.configuraties).length,2);assert.ok(trace.wind.length>0);console.log('Day trace includes wind attribution and both module configurations.');

// The /elektrolyser comparison uses a JavaScript port of simulate(); it must match this Python kernel.
const kernel=await import('../src/electrolyser-kernel.mjs');
const cases=[[10,{minimumlast:0.2},'verdelen'],[2,{minimumlast:0.2},'samen'],[4,{capaciteit_mw:30,storingen_per_jaar:5},'bijschakelen']];
p.globals.set('kernel_cases',JSON.stringify(cases));
const python=JSON.parse(p.runPython("from dataclasses import replace\njson.dumps([model.simulate_with_replacements(supply_year(2025), n, replace(model.Aannames(), **changes), strategy) for n, changes, strategy in json.loads(kernel_cases)], default=lambda o: None)"));
cases.forEach(([n,changes,strategy],i)=>{
 const js=kernel.simulate_with_replacements(JSON.parse(readFileSync('src/opsplitsing/data/2025.json','utf8')),n,{...kernel.DEFAULTS,...changes},strategy);
 for(const key of ['waterstof_t','verbruik_mwh','standby_mwh','benutting','bedrijfsuren_gem','productie_uur','starts_warm_per_module','starts_koud_per_module','dekking_uur','stackwissel_dagen'])
  assert.ok(Math.abs(js[key]-python[i][key])<=1e-9*Math.max(1,Math.abs(python[i][key])),`${strategy} ${n} modules ${key}: ${js[key]} ≠ ${python[i][key]}`);
});
console.log('JavaScript comparison kernel matches the browser Python kernel for 2025 (verdelen, samen, bijschakelen).');
