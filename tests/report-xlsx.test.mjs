import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({TextEncoder,Intl});
vm.runInContext(readFileSync(new URL('../src/opsplitsing/report-model.js',import.meta.url),'utf8'),context);
vm.runInContext(readFileSync(new URL('../src/opsplitsing/report-xlsx.js',import.meta.url),'utf8'),context);
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
function cells(xml){return Object.fromEntries([...xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(([,attrs,body])=>{
  const ref=attrs.match(/r="([^"]+)"/)[1],expression=body.match(/<f>([\s\S]*?)<\/f>/)?.[1],v=body.match(/<v>(.*?)<\/v>/)?.[1];
  return[ref,{expression:expression&&decode(expression),value:v!==undefined&&v!==''?Number(v):null,text:decode(body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1]||'')}];
}));}
function workbook(r){const entries=files(context.OpsReportExcel.build(r));return Object.fromEntries(['Leeswijzer','Aannames','Jaarinvoer','Narekenen','Controle'].map((name,i)=>[name,cells(entries['xl/worksheets/sheet'+(i+1)+'.xml'])]));}
function evaluator(book,changes={}){
 const get=(sheet,ref)=>{
   if(Object.hasOwn(changes,sheet+'!'+ref))return changes[sheet+'!'+ref];
   const cell=book[sheet]?.[ref]; if(!cell)return 0;if(!cell.expression)return cell.value;
   const tokens=[];let e=cell.expression.replace(/(?:'([^']+)'!)?(\$?[A-Z]+\$?\d+)/g,(_,s,r)=>{tokens.push(`get(${JSON.stringify(s||sheet)},${JSON.stringify(r.replaceAll('$',''))})`);return '@@'+(tokens.length-1)+'@@';});
   e=e.replaceAll('^','**').replaceAll('=','===').replace(/@@(\d+)@@/g,(_,i)=>tokens[i]);
   return Function('get','IF','MAX','AND','return '+e)(get,(c,a,b)=>c?a:b,Math.max,(...args)=>args.every(Boolean));
 };return get;
}
function rowFor(book,sheet,label,col='A'){const entry=Object.entries(book[sheet]).find(([ref,c])=>ref.startsWith(col)&&c.text===label);assert.ok(entry,'missing '+label);return Number(entry[0].slice(col.length));}

test('Excel contains genuine formulas and reproduces published cost results from numeric input cells',()=>{
 const r=report(),book=workbook(r),get=evaluator(book),row=rowFor(book,'Narekenen','Kostprijs waterstof (LCOH)');
 for(const [col,expected] of [['D',fixture.rijen[0].lcoh_eur_kg],['E',fixture.rijen[1].lcoh_eur_kg]]){
   const cell=book.Narekenen[col+row];assert.match(cell.expression,/IF\('Jaarinvoer'!/);
   assert.ok(Math.abs(cell.value-expected)<1e-10);assert.ok(Math.abs(get('Narekenen',col+row)-expected)<1e-10);
 }
 for(const [ref,cell] of Object.entries(book.Narekenen))if(cell.expression&&typeof cell.value==='number')assert.ok(Math.abs(get('Narekenen',ref)-cell.value)<1e-7,ref+' has matching formula and cached output');
 const priceRow=rowFor(book,'Aannames','stroomprijs_eur_mwh'),changed=evaluator(book,{['Aannames!C'+priceRow]:188.91});
 const expected=fixture.rijen[0].lcoh_eur_kg+(fixture.rijen[0].verbruik_mwh+fixture.rijen[0].standby_mwh)*100/(fixture.rijen[0].waterstof_t*1000);
 assert.ok(Math.abs(changed('Narekenen','D'+row)-expected)<1e-10,'changing a price affects the formula result');
});

test('zero interest, capped levies and subsidies follow the financial model',()=>{
 const input=structuredClone(fixture);Object.assign(input.aannames,{rente:0,korting_net_belasting_eur_mwh:999,capex_subsidie_eur_kw:500,waterstofpremie_eur_kg:1,zuurstofprijs_eur_t:50});
 const r=report(input),book=workbook(r),get=evaluator(book);
 for(const [label,key] of [['Totale bruto investering','capex'],['Totale elektriciteitsprijs','powerPrice'],['Stackvervanging per jaar','stack'],['Kostprijs waterstof (LCOH)','lcoh'],['Netto kostprijs na opbrengsten','net']]){
  const row=rowFor(book,'Narekenen',label);
  for(const [col,model] of [['D',r.economics.base],['E',r.economics.comparison]])assert.ok(Math.abs(get('Narekenen',col+row)-model[key])<1e-7,label);
 }
});

test('zero hydrogen has blank undefined cost and literal user strings cannot become formulas',()=>{
 const input=structuredClone(fixture);input.rijen[0].waterstof_t=0;input.rijen[0].lcoh_eur_kg=null;input.sleutel='=HYPERLINK("bad") <&>';
 const r=report(input),entries=files(context.OpsReportExcel.build(r)),book=workbook(r),row=rowFor(book,'Narekenen','Kostprijs waterstof (LCOH)');
 assert.equal(book.Narekenen['D'+row].value,null);assert.equal(evaluator(book)('Narekenen','D'+row),'');
 assert.match(entries['xl/worksheets/sheet1.xml'],/=HYPERLINK\(&quot;bad&quot;\) &lt;&amp;&gt;/);
 assert.doesNotMatch(entries['xl/worksheets/sheet1.xml'],/<f>/);
 assert.match(entries['xl/workbook.xml'],/fullCalcOnLoad="1"/);
});

test('optional ten-minute audit is preserved as readable formulas and literal trace values',()=>{
 const r=report();r.moments={date:'2025-05-14',notes:['Rounded trace.'],moments:[{title:'Weinig wind',available:true,timestamp:1747198800,criterion:'Lowest supply',wind:[{label:'Parkvermogen',formula:'turbine × aantal',expression:'1500 × 10',value:15,unit:'MW'}],configurations:[{modules:2,rows:[],moduleRows:[{module:1,rows:[{label:'Waterstof',formula:'kW / SEC / 6',expression:'1000 / 50 / 6',value:3.333,unit:'kg'}]}],check:{ok:true,detail:'Within tolerance',deltaKg:0}}]}]};
 const entries=files(context.OpsReportExcel.build(r));
 assert.match(entries['xl/workbook.xml'],/name="Tienminuten"/);
 assert.match(entries['xl/worksheets/sheet6.xml'],/1000 \/ 50 \/ 6/);
 assert.match(entries['xl/worksheets/sheet6.xml'],/<v>3.333<\/v>/);
 assert.doesNotMatch(entries['xl/worksheets/sheet6.xml'],/<f>/);
});

test('incomplete saved simulation output cannot silently become zero stack replacement',()=>{
 const r=report();delete r.base.eq_uren_per_module;
 assert.throws(()=>context.OpsReportExcel.build(r),/niet alle jaargegevens/);
});
