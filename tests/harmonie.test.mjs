import test from 'node:test';
import assert from 'node:assert/strict';
import {gribWindPoints,extractHarmonie,readHarmonie,forecastWindow} from '../src/harmonie.mjs';
function message(component=33,hour=0){
 const a=new Uint8Array(8+28+32+15+4),p=8,g=36,b=68;
 const str=(p,s)=>a.set(new TextEncoder().encode(s),p),u16=(p,v)=>{a[p]=v>>8;a[p+1]=v&255;},u24=(p,v)=>{a[p]=v>>16;a[p+1]=v>>8&255;a[p+2]=v&255;};
 str(0,'GRIB');u24(4,a.length);a[7]=1;u24(p,28);a[p+7]=128;a[p+8]=component;a[p+9]=105;u16(p+10,10);a.set([26,10,22,6,0,1,hour,0,0],p+12);a[p+24]=21;
 u24(g,32);a[g+4]=255;u16(g+6,2);u16(g+8,2);u24(g+10,52000);u24(g+13,5000);u24(g+17,54000);u24(g+20,6000);u16(g+23,1000);u16(g+25,2000);a[g+27]=64;
 u24(b,15);a[b+10]=8;a.set(component===33?[1,2,3,4]:[4,5,6,7],b+11);str(a.length-4,'7777');return a;
}
function tar(){const files=[];for(let hour=0;hour<9;hour++){const u=message(33,hour),v=message(34,hour),head=new Uint8Array(512);head.set(new TextEncoder().encode(`HA43_N20_202610220600_${String(hour*100).padStart(5,'0')}_GB`));head.set(new TextEncoder().encode((u.length+v.length).toString(8).padStart(11,'0')+'\0'),124);head[156]=48;files.push(head,u,v,new Uint8Array((512-(u.length+v.length)%512)%512));}return new ReadableStream({start(c){for(const x of files)c.enqueue(x);c.enqueue(new Uint8Array(1024));c.close();}});}
test('GRIB1 point extraction respects latitude scan and time, preserves zero, rejects incompatible fields',()=>{const a=message();let d=gribWindPoints(a);assert.equal(d.run,'2026-10-22T06:00:00.000Z');assert.equal(d.values[0].value,3);assert.equal(d.values[0].latitude,54);a[79+2]=0;assert.equal(gribWindPoints(a).values[0].value,0);a[17]=100;assert.equal(gribWindPoints(a),null);const bad=message();bad[71]=128;assert.throws(()=>gribWindPoints(bad),/PACKING/);});
test('TAR stream joins u/v from one run, extracts future hours and cancels early',async()=>{const d=await extractHarmonie(tar(),Date.parse('2026-10-22T06:30:00Z'));assert.equal(d.rows.length,7);assert.equal(d.rows[0].time,'2026-10-22T07:00:00.000Z');assert.equal(d.rows[0].parks[0].windSpeedMS,Math.hypot(3,6));});
test('missing key is explicit and authorization failures do not fetch signed downloads',async()=>{await assert.rejects(readHarmonie({}),/NOT_CONFIGURED/);const old=globalThis.fetch;let calls=0;globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response('{}',{status:403});};try{await assert.rejects(readHarmonie({KNMI_OPEN_DATA_API_KEY:'test-key'}),/AUTH/);assert.equal(calls,1);}finally{globalThis.fetch=old;}});

test('unordered future hours do not make a gap look like a complete planning horizon',()=>{
 const row=h=>({time:`2026-10-22T${String(h).padStart(2,'0')}:00:00Z`,u:[1],v:[1]});
 const now=Date.parse('2026-10-22T06:30:00Z');
 assert.deepEqual(forecastWindow([row(10),row(7),row(9),row(11),row(12),row(13),row(14)],now).map(x=>x.time),[row(7).time]);
 assert.equal(forecastWindow([row(10),row(7),row(9),row(8),row(11),row(12),row(13),row(14)],now).length,7);
 assert.equal(forecastWindow([{time:row(7).time,u:[1]},row(8)],now).length,1);
});
