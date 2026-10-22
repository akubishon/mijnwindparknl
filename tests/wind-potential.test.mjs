import test from 'node:test';
import assert from 'node:assert/strict';
import {theoreticalWindMW,potentialPoints,potentialComparison} from '../src/wind-potential.mjs';
import {modelOptions,windPowerModel} from '../src/knmi.mjs';
const settings={park:'fryslan',height:'10',alpha:'0.115',wake:'0',wakePercent:'5',ratedKW:'4300',cutIn:'3',ratedSpeed:'11.5',cutOut:'25',seasonal:'0'};
const date='2026-10-22T12:00:00Z';
test('theoretical curve agrees below rated, rises above nominal and stays separate from physical cut-out',()=>{
 const physical=windPowerModel(date.slice(0,10),modelOptions(new URLSearchParams(settings)));
 assert.ok(Math.abs(theoreticalWindMW(8,date,settings)-physical(8))<1e-9);
 assert.equal(theoreticalWindMW(11.5,date,settings),89*4300/1000);
 assert.ok(theoreticalWindMW(15,date,settings)>89*4300/1000);
 assert.equal(physical(15),89*4300/1000);
 assert.equal(physical(30),0);assert.ok(theoreticalWindMW(30,date,settings)>theoreticalWindMW(15,date,settings));
});
test('missing wind remains unknown, and theoretical display never mutates original model points',()=>{
 assert.equal(theoreticalWindMW(null,date,settings),null);assert.equal(theoreticalWindMW(NaN,date,settings),null);assert.equal(theoreticalWindMW(0,date,settings),0);
 const source=[{start:date,end:'2026-10-22T12:10:00Z',windSpeedMS:15,powerMW:382.7}];
 const scenario=potentialPoints(source,settings);assert.ok(scenario[0].powerMW>source[0].powerMW);assert.equal(source[0].powerMW,382.7);
 const c=potentialComparison({stavoren:source,houtribdijk:[{...source[0],windSpeedMS:18}],combination:[{...source[0],windSpeedMS:18,highestStation:'Houtribdijk'}]},settings);
 assert.equal(c.combination[0].powerMW,c.houtribdijk[0].powerMW);assert.ok(c.combination[0].differenceMW>0);assert.equal(c.combination[0].highestStation,'Houtribdijk');
});
