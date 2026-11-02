import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({TextEncoder,Intl});
for(const file of ['report-model.js','report-moments.js','report-xlsx.js'])vm.runInContext(readFileSync(new URL('../src/opsplitsing/'+file,import.meta.url),'utf8'),context);
const fixture=JSON.parse(readFileSync(new URL('./fixtures/opsplitsing-2025-native.json',import.meta.url),'utf8'));
function report(input=fixture){return context.OpsReportModel.makeReport(input,{},2);}
function files(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),out={};let at=0;
  while(view.getUint32(at,true)===0x04034b50){
    assert.equal(view.getUint16(at+8,true),0,'stored ZIP entries need no decompressor');
    const size=view.getUint32(at+18,true),nameLen=view.getUint16(at+26,true),extra=view.getUint16(at+28,true);
    const name=new TextDecoder().decode(bytes.subarray(at+30,at+30+nameLen)),start=at+30+nameLen+extra;
    out[name]=new TextDecoder().decode(bytes.subarray(start,start+size));at=start+size;
  }
  assert.equal(view.getUint32(at,true),0x02014b50,'central directory follows entries');return out;
}
const decode=s=>s.replaceAll('&quot;','"').replaceAll('&gt;','>').replaceAll('&lt;','<').replaceAll('&amp;','&');
function cells(xml){return Object.fromEntries([...xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(([,attrs,body=''])=>{
  const ref=attrs.match(/r="([^"]+)"/)[1],type=attrs.match(/t="([^"]+)"/)?.[1],expression=body.match(/<f>([\s\S]*?)<\/f>/)?.[1],v=body.match(/<v>(.*?)<\/v>/)?.[1];
  const value=v===undefined?null:type==='str'||type==='e'?decode(v):type==='b'?v==='1':v===''?null:Number(v);
  return[ref,{expression:expression&&decode(expression),type,value,text:decode(body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1]||'')}];
}));}
function workbook(r){
  const entries=files(context.OpsReportExcel.build(r));
  const names=[...entries['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map(m=>decode(m[1]));
  return Object.fromEntries(names.map((name,i)=>[name,cells(entries['xl/worksheets/sheet'+(i+1)+'.xml'])]));
}
// Een onafhankelijke, eenvoudige vertaling van de Excel-formules naar JavaScript.
const col=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0),letters=n=>{let o='';for(;n;n=Math.floor((n-1)/26))o=String.fromCharCode(65+(n-1)%26)+o;return o;};
function evaluator(book,changes={}){
 const memo=new Map();
 const get=(sheet,ref)=>{
   const key=sheet+'!'+ref;
   if(Object.hasOwn(changes,key))return changes[key];
   const cell=book[sheet]?.[ref]; if(!cell)return 0;if(!cell.expression)return cell.value??(cell.text||0);
   if(memo.has(key))return memo.get(key);
   const tokens=[];
   let e=cell.expression.replace(/(?:'([^']+)'!)?\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?/g,(_,s,c1,r1,c2,r2)=>{
     const target=s||sheet;
     if(c2){const list=[];for(let r=+r1;r<=+r2;r++)for(let c=col(c1);c<=col(c2);c++)list.push(`get(${JSON.stringify(target)},"${letters(c)}${r}")`);tokens.push('['+list.join(',')+']');}
     else tokens.push(`get(${JSON.stringify(target)},"${c1}${r1}")`);
     return '@@'+(tokens.length-1)+'@@';});
   e=e.replaceAll('^','**').replaceAll('<>','!=').replace(/(?<![<>!])=/g,'==').replace(/@@(\d+)@@/g,(_,i)=>tokens[i]);
   const flat=args=>args.flat().map(Number);
   const value=Function('get','IF','MAX','MIN','SUM','AND','ABS','return '+e)(get,(c,a,b)=>c?a:b,(...a)=>Math.max(...flat(a)),(...a)=>Math.min(...flat(a)),(...a)=>flat(a).reduce((s,v)=>s+v,0),(...args)=>args.every(Boolean),Math.abs);
   memo.set(key,value);return value;
 };return get;
}
function rowFor(book,sheet,label,col='A',nth=0){const entries=Object.entries(book[sheet]).filter(([ref,c])=>ref.replace(/\d+$/,'')===col&&c.text===label);assert.ok(entries[nth],'missing '+label);return Number(entries[nth][0].slice(col.length));}
const close=(actual,expected,tolerance=1e-9,message='')=>assert.ok(Math.abs(actual-expected)<=tolerance*Math.max(1,Math.abs(expected)),`${message} ${actual} != ${expected}`);

const momentData=()=>{
  const a=fixture.aannames,moment=context.OpsReportMoments.moduleArithmetic;
  const make=(stacks,size,start,index)=>{const rows=stacks.map((stack,i)=>moment(stack,size,start?.[i]||0,a));
    return {t:1750000000+index*600,aanbod:[7,49,20,0][index],stack:stacks,opstart_min:start||stacks.map(()=>0),kg:rows.map(row=>Math.round(row.kg*1000)/1000),verbruik:0,redenen:['Verdelen'],passen:stacks.length,gewenst:stacks.length};};
  const park={v10:5,factor:1.2,alpha:0.14,hoogtevertaling:'wins50',ashoogte:100,v_as:6,zog:0.1,v_turbine:5.4,turbines:89,turbine_kw:500,mw:44.5,aandeel:0.1};
  return {datum:'2025-06-15',configuraties:{
    1:{module_mw:44,stappen:[[0],[44],[30],[0]].map((s,i)=>make(s,44,null,i))},
    2:{module_mw:22,stappen:[[5.7,0],[22,22],[8.2,8.2],[0,0]].map((s,i)=>make(s,22,i===2?[1,0]:null,i))}},
    wind:[0,1,2,3].map(()=>({knmi:{267:5,269:null},fryslan:{...park},beabuorren:{...park,hoogtevertaling:'alpha',turbines:4,mw:2,turbine_kw:500,dagfactor:1.1,mw_aanbod:2.2,aandeel:1}})),
    stations:{267:'Stavoren',269:'Houtribdijk'},parken:{fryslan:'Windpark Fryslân',beabuorren:'Windpark Beabuorren'},aandeel:{fryslan:0.1,beabuorren:1},regel_per_park:{fryslan:'gemiddelde',beabuorren:'gemiddelde'}};
};
function withMoments(r=report()){r.moments=context.OpsReportMoments.build(momentData(),r.result.aannames,1,2);return r;}

test('every formula in every sheet matches its cached value under an independent evaluation',()=>{
 const book=workbook(withMoments()),get=evaluator(book);
 assert.deepEqual(Object.keys(book),['Leeswijzer','Aannames','Jaarinvoer','Narekenen','Uitsplitsing','Toetsgevallen','Controle','Tienminuten']);
 let count=0;
 for(const [sheet,list] of Object.entries(book))for(const [ref,cell] of Object.entries(list)){
   if(!cell.expression)continue;count++;
   assert.notEqual(cell.type,'e',sheet+'!'+ref+' has an Excel error');
   const value=get(sheet,ref);
   if(typeof cell.value==='number')close(Number(value),cell.value,1e-9,sheet+'!'+ref);else assert.equal(value,cell.value??'',sheet+'!'+ref);
 }
 assert.ok(count>300,'expected formulas throughout the workbook, got '+count);
 assert.ok(Object.values(book.Tienminuten).some(c=>c.expression?.includes("'Aannames'!")),'ten-minute formulas reference the assumptions sheet');
});

test('Excel reproduces published cost results and recalculates from numeric input cells',()=>{
 const r=report(),book=workbook(r),get=evaluator(book),row=rowFor(book,'Narekenen','Kostprijs waterstof (LCOH)');
 for(const [col,expected] of [['D',fixture.rijen[0].lcoh_eur_kg],['F',fixture.rijen[1].lcoh_eur_kg]]){
   const cell=book.Narekenen[col+row];assert.match(cell.expression,/IF\('Jaarinvoer'!/);close(cell.value,expected,1e-10);
 }
 const priceRow=rowFor(book,'Aannames','stroomprijs_eur_mwh'),changed=evaluator(book,{['Aannames!C'+priceRow]:188.91});
 const expected=fixture.rijen[0].lcoh_eur_kg+(fixture.rijen[0].verbruik_mwh+fixture.rijen[0].standby_mwh)*100/(fixture.rijen[0].waterstof_t*1000);
 close(changed('Narekenen','D'+row),expected,1e-10,'changing a price affects the formula result');
 // Slijtage-uren zijn een SUM over de uren per module.
 const eq=rowFor(book,'Jaarinvoer','eq');assert.match(book.Jaarinvoer['G'+eq].expression,/^SUM\(G\d+:G\d+\)$/);
 close(book.Jaarinvoer['G'+eq].value,fixture.rijen[1].eq_uren_per_module.reduce((s,v)=>s+v,0));
 for(const label of ['capex_meur','kapitaal_meur_jaar','lcoh_eur_kg']){const n=rowFor(book,'Controle',label);close(book.Controle['E'+n].value,0,1e-7);close(book.Controle['F'+n].value,0,1e-7);}
});

test('symbolic and filled formulas stand next to every formula, without cell addresses',()=>{
 const book=workbook(withMoments());
 const address=/(?:'[^']+'!)|\$?\b[A-Z]{1,3}\$?\d+\b/;
 let texts=0;
 for(const sheet of ['Jaarinvoer','Narekenen','Uitsplitsing','Toetsgevallen','Controle','Tienminuten']){
   const textColumns=Object.entries(book[sheet]).filter(([ref,c])=>/^[A-Z]+1$/.test(ref)&&/symbolisch|ingevulde formule/i.test(c.text)).map(([ref])=>ref.slice(0,-1));
   assert.ok(textColumns.length>=2,sheet+' has symbolic and filled columns');
   for(const [ref,cell] of Object.entries(book[sheet])){
     if(!textColumns.includes(ref.replace(/\d+$/,''))||ref.endsWith('1')&&/^[A-Z]+1$/.test(ref)||!cell.text||cell.text==='invoer uit de simulatie'||cell.text==='invoer uit het dagantwoord')continue;
     texts++;
     assert.doesNotMatch(cell.text,address,sheet+'!'+ref+' contains a cell address: '+cell.text);
     assert.doesNotMatch(cell.text,/\?/,sheet+'!'+ref+' has an unnamed reference: '+cell.text);
   }
   // Elke formulecel in een waardekolom heeft rechts ernaast (of in de symbolische kolom) een tekst.
 }
 assert.ok(texts>500,'texts checked: '+texts);
 const row=rowFor(book,'Narekenen','Kostprijs waterstof (LCOH)');
 assert.equal(book.Narekenen['C'+row].text,'lcoh = ALS(kg_waterstof > 0; jaarkosten / kg_waterstof; "")');
 assert.match(book.Narekenen['E'+row].text,/^ALS\(2\.982\.001,12 > 0; [\d.,]+ \/ 2\.982\.001,12; ""\)$/);
 const capex=rowFor(book,'Narekenen','Totale bruto investering');
 assert.equal(book.Narekenen['C'+capex].text,'capex = prijs_per_kw × capaciteit_mw × 1.000 + modules × vaste_kosten_module_meur × 1.000.000');
 assert.equal(book.Narekenen['G'+capex].text,'1.000 × 44 × 1.000 + 2 × 1 × 1.000.000');
 const delta=rowFor(book,'Narekenen','Verschil LCOH (vergelijking − basis)');
 assert.match(book.Narekenen['C'+delta].text,/lcoh\[vergelijking\] − lcoh\[basis\]/);
 // Een ingevulde formule zonder functies rekent terug naar de uitkomst van de cel.
 let checked=0;
 for(const [ref,cell] of Object.entries(book.Narekenen)){
   if(!/^[DF]\d+$/.test(ref)||!cell.expression||typeof cell.value!=='number')continue;
   const text=book.Narekenen[String.fromCharCode(ref.charCodeAt(0)+1)+ref.slice(1)].text;
   if(/[A-Za-z|]/.test(text))continue;
   const js=text.replaceAll('×','*').replaceAll('−','-').replace(/\d[\d.]*(?:,\d+)?/g,n=>n.replaceAll('.','').replace(',','.'));
   close(Function('return '+js.replaceAll('^','**'))(),cell.value,1e-4,ref+' '+text);checked++;
 }
 assert.ok(checked>=10);
});

test('zero interest, capped levies and subsidies follow the financial model',()=>{
 const input=structuredClone(fixture);Object.assign(input.aannames,{rente:0,korting_net_belasting_eur_mwh:999,capex_subsidie_eur_kw:500,waterstofpremie_eur_kg:1,zuurstofprijs_eur_t:50});
 const r=report(input),book=workbook(r);
 for(const [label,key] of [['Totale bruto investering','capex'],['Totale elektriciteitsprijs','powerPrice'],['Stackvervanging per jaar','stack'],['Kapitaal en vaste OPEX per jaar','capitalAnnual'],['Stroom per kilo waterstof','kwhPerKg'],['Kostprijs waterstof (LCOH)','lcoh'],['Netto kostprijs na opbrengsten','net']]){
  const row=rowFor(book,'Narekenen',label);
  for(const [col,model] of [['D',r.economics.base],['F',r.economics.comparison]])close(book.Narekenen[col+row].value,model[key],1e-9,label);
 }
});

test('the cost-difference breakdown is live and adds up to the LCOH difference',()=>{
 const r=report(),book=workbook(r);
 for(const [i,part] of r.parts.entries())close(book.Uitsplitsing['D'+(i+2)].value,part.value,1e-9,part.key);
 close(book.Uitsplitsing.D6.value,r.delta,1e-9);close(book.Uitsplitsing.D8.value,0,1e-9);
 assert.match(book.Uitsplitsing.D2.expression,/'Narekenen'!D\d+/);
});

test('test cases recompute the LCOH of every module count exactly as the conclusion does',()=>{
 const r=report(),book=workbook(r),sheet=book.Toetsgevallen,m=r.materiality;
 assert.ok(m.testCases.length>=10);
 const lcohCells=Object.entries(sheet).filter(([ref,c])=>ref.startsWith('C')&&c.text==='Kostprijs waterstof (LCOH)').map(([ref])=>Number(ref.slice(1)));
 assert.equal(lcohCells.length,(m.testCases.length+1)*m.testedModules.length);
 const expected=[r.result.rijen.map(row=>row.lcoh_eur_kg),...m.testCases.map(item=>item.lcoh)].flat();
 lcohCells.forEach((row,i)=>close(sheet['E'+row].value,expected[i],1e-9,'case '+i));
 const price=rowFor(book,'Aannames','stroomprijs_eur_mwh'),changed=evaluator(book,{['Aannames!C'+price]:100});
 assert.notEqual(changed('Toetsgevallen','E'+lcohCells[0]),sheet['E'+lcohCells[0]].value,'cases follow the assumptions sheet');
 const cheapest=Object.entries(sheet).filter(([ref,c])=>ref.startsWith('C')&&c.text.startsWith('Goedkoopste')).map(([ref])=>sheet['E'+ref.slice(1)].value);
 assert.equal(cheapest[0],m.lowest);
});

test('ten-minute moments are live formulas that match the moment arithmetic',()=>{
 const r=withMoments(),book=workbook(r),sheet=book.Tienminuten,get=evaluator(book);
 const kgRows=Object.entries(sheet).filter(([ref,c])=>ref.startsWith('C')&&c.text==='Waterstof in tien minuten').map(([ref])=>Number(ref.slice(1)));
 const modules=r.moments.moments.flatMap(m=>m.configurations.flatMap(c=>c.moduleRows));
 assert.equal(kgRows.length,modules.length);
 kgRows.forEach((row,i)=>close(sheet['E'+row].value,modules[i].kg,1e-9,'kg '+i));
 assert.ok(modules.some(m=>m.kg>0)&&modules.some(m=>m.productiveFraction<1));
 const supply=rowFor(book,'Tienminuten','Aanbod voor de elektrolyser','C');
 close(sheet['E'+supply].value,0.1*(500*89/1000)+1*(500*4/1000*1.1));
 const use=rowFor(book,'Aannames','systeemverbruik_vol'),changed=evaluator(book,{['Aannames!C'+use]:60});
 const active=kgRows.find(row=>sheet['E'+row].value>0);
 assert.ok(changed('Tienminuten','E'+active)<sheet['E'+active].value,'a higher system consumption lowers the kilos of a moment');
 assert.ok(Object.values(sheet).some(c=>c.value==='Sluit aan'));
});

test('without the technical assumptions the ten-minute audit stays readable text',()=>{
 const r=withMoments();delete r.result.aannames.deellastvoordeel;
 const entries=files(context.OpsReportExcel.build(r)),names=[...entries['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map(m=>m[1]);
 const xml=entries['xl/worksheets/sheet'+(names.indexOf('Tienminuten')+1)+'.xml'];
 assert.match(xml,/stackvermogen × \(1 \+ variabele BoP\)/);assert.doesNotMatch(xml,/<f>/);
});

test('zero hydrogen has blank undefined cost and literal user strings cannot become formulas',()=>{
 const input=structuredClone(fixture);input.rijen[0].waterstof_t=0;input.rijen[0].lcoh_eur_kg=null;input.sleutel='=HYPERLINK("bad") <&>';
 const r=report(input),entries=files(context.OpsReportExcel.build(r)),book=workbook(r),row=rowFor(book,'Narekenen','Kostprijs waterstof (LCOH)');
 assert.equal(book.Narekenen['D'+row].value,'');assert.equal(evaluator(book)('Narekenen','D'+row),'');
 assert.match(entries['xl/worksheets/sheet1.xml'],/=HYPERLINK\(&quot;bad&quot;\) &lt;&amp;&gt;/);
 assert.doesNotMatch(entries['xl/worksheets/sheet1.xml'],/<f>/);
 assert.match(entries['xl/workbook.xml'],/fullCalcOnLoad="1"/);
 for(const list of Object.values(book))for(const cell of Object.values(list))assert.notEqual(cell.type,'e');
});

test('the formula engine follows Excel precedence and reports undefined arithmetic',()=>{
 const {parse,evaluate}=context.OpsReportExcel.formula,run=src=>evaluate(parse(src),'S',()=>null);
 assert.equal(run('-2^2'),4);assert.equal(run('2+3*4^2/8'),8);assert.equal(run('IF(1>2,"a",IF(2>=2,"b","c"))'),'b');
 assert.equal(run('MIN(3,MAX(1,2))'),2);assert.equal(run('ABS(-0.5)'),0.5);assert.equal(run('(1>0)+(0>1)+(2>1)'),2);
 assert.throws(()=>run('1/0'),/DIV/);assert.throws(()=>parse('1+'),/verwacht/);
});

test('incomplete saved simulation output cannot silently become zero stack replacement',()=>{
 const r=report();delete r.base.eq_uren_per_module;
 assert.throws(()=>context.OpsReportExcel.build(r),/niet alle jaargegevens/);
});
