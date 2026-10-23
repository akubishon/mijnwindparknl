import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {modelOptions,windPowerModel} from '../src/knmi.mjs';
const curve=JSON.parse(readFileSync(new URL('../src/opsplitsing/python/data/fryslan.json',import.meta.url)));
const options=(extra='')=>{const p=new URLSearchParams('park=fryslan&station=stavoren&hoogte=alpha&height=10&seasonal=0&wake=0');for(const [key,value] of new URLSearchParams(extra))p.set(key,value);return modelOptions(p);};
const power=(extra='')=>windPowerModel('2025-01-01',options(extra));
test('Fryslân defaults to digitized curve, including interpolation and storm reduction',()=>{
 assert.equal(options().cutOut,curve.cut_out);
 const model=power();
 for(const [speed,kw] of [[0,0],[3,20],[8,1920],[11.5,4070],[14,4300],[23,4300],[23.5,3955],[25,2930],[28,860],[28.005,860],[28.01,0],[30,0]]){
  assert.ok(Math.abs(model(speed)-kw*89/1000)<1e-9,`${speed} m/s`);
 }
 assert.equal(model(null),null);
});
test('user settings scale power and may lower the range limit without extending source coverage',()=>{
 assert.ok(Math.abs(power('&ratedKW=8600')(8)-1920*2*89/1000)<1e-9);
 assert.equal(power('&cutOut=25')(25),0);
 assert.equal(power('&cutOut=40')(30),0);
 // Start and nominal wind belong to the separate theoretical scenario.
 assert.equal(power('&cutIn=4&ratedSpeed=15')(8),power()(8));
 assert.equal(power('&wake=1')(28.01),0);
 assert.ok(Math.abs(power('&wake=1&wakePercent=5')(10)-power()(9.5))<1e-9);
});
