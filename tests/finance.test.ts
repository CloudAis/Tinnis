import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld } from '../src/world/state';
import { executeCommand } from '../src/simulation/construction';
import { executeTrainCommand } from '../src/simulation/train';
import { Simulation } from '../src/simulation/clock';
import { stepFinance, settleCompleted, setBusiness, actualInterval, dayReport } from '../src/simulation/finance';
import { decodeSave, encodeSave } from '../src/storage/save';
import { transact } from '../src/simulation/economy';
export function setupFinance(){const w=createWorld();for(const station of ['A','B'] as const)executeCommand(w,{type:'build-station',station,revision:w.railway.revision});executeCommand(w,{type:'build-track',from:'node-a',to:'node-b',revision:w.railway.revision});executeTrainCommand(w,{type:'buy',model:'light',revision:0});executeTrainCommand(w,{type:'dispatch',revision:w.fleet.revision});return w;}
export function runMinutes(w:ReturnType<typeof createWorld>,minutes:number){const s=new Simulation(w);for(let i=0;i<Math.round(minutes/.4);i++){const old=w.clock.speed;w.clock.speed=4;s.advance(.05);w.clock.speed=old;}}
test('v4 pending fares credit once and survive reload; duplicate completion does not credit',()=>{
 const w=decodeSave(readFileSync(new URL('./fixtures/stage4-v4.json',import.meta.url),'utf8')).world;assert.equal(w.finance.settledCount,0);settleCompleted(w);assert.equal(w.economy.balance,63740);const b=w.economy.balance;settleCompleted(w);assert.equal(w.economy.balance,b);const r=decodeSave(encodeSave(w)).world;settleCompleted(r);assert.equal(r.economy.balance,b);
});
test('fixed and maintenance accrue by elapsed minute, fractional carry survives load; midnight only summarizes',()=>{
 let w=setupFinance();executeTrainCommand(w,{type:'stop',revision:w.fleet.revision});w.clock.minutes+=1440;stepFinance(w);assert.equal(w.economy.balance,50000-600-250);assert.equal(dayReport(w,0).fixed,400);assert.equal(w.finance.days.length,1);const b=w.economy.balance;stepFinance(w);assert.equal(w.economy.balance,b);
 // Demand cursor advances only through simulation; bring it to this isolated finance test clock.
 w.passengers.lastDemandMinute=Math.floor(w.clock.minutes);w=decodeSave(encodeSave(w)).world;stepFinance(w);assert.equal(w.economy.balance,b);assert.equal(w.finance.remainder.fixed,0);
});
test('FPS, speeds, pause, and reload have identical ledger for identical elapsed game time',()=>{
 const snapshots=[];for(const [fps,speed] of [[30,1],[60,2],[120,4]] as const){const w=setupFinance();w.clock.speed=speed;const s=new Simulation(w);for(let i=0;i<fps*120/speed;i++)s.advance(1/fps);w.clock.paused=true;const frozen=encodeSave(w);s.advance(60);assert.deepEqual(JSON.parse(encodeSave(w)).world,JSON.parse(frozen).world);snapshots.push({balance:w.economy.balance,amounts:w.economy.ledger.map(e=>[e.id,e.amount]),distance:w.fleet.vehicle!.totalDistance});}
 assert.deepEqual(snapshots[0].amounts,snapshots[1].amounts);assert.deepEqual(snapshots[1].amounts,snapshots[2].amounts);assert.ok(Math.abs(snapshots[0].distance-snapshots[2].distance)<1e-6);
});
test('debt blocks investment/departures, in-flight journey finishes, safe empty sale retains costs',()=>{
 const w=setupFinance();runMinutes(w,20);transact(w,'expense:fixture',-w.economy.balance+1,'验证耗尽前余额');runMinutes(w,100);assert.equal(w.fleet.vehicle!.status,'stopped');assert.equal(w.fleet.vehicle!.currentStation,'B');assert.equal(w.passengers.onboard.length,0);assert.ok(w.economy.ledger.some(e=>e.amount<0&&e.posting?.operating));const debt=w.economy.balance;
 // A recovered ticket receipt may make balance positive, but the already stopped train stays safe.
 const c={type:'sell',revision:w.fleet.revision} as const;assert.equal(executeTrainCommand(w,c).ok,true);assert.equal(w.economy.balance,debt+13200);assert.equal(executeTrainCommand(w,c).ok,false);
 const empty=createWorld();transact(empty,'debt',-100500,'欠款测试',undefined,undefined,{category:'fixed',day:0,operating:true});assert.equal(empty.economy.balance,-500);assert.equal(executeTrainCommand(empty,{type:'buy',model:'light',revision:0}).ok,false);assert.deepEqual(decodeSave(encodeSave(empty)).world,empty);
});
test('fares and intervals trade accepted demand against income and waits; ten-day operation is profitable',()=>{
 const results=[];for(const [fare,interval] of [[10,120],[20,120],[30,240]] as const){const w=setupFinance();assert.equal(setBusiness(w,fare,interval,0).ok,true);assert.equal(setBusiness(w,fare,interval,0).ok,false);runMinutes(w,14400);assert.equal(w.economy.balance,100000+w.economy.ledger.reduce((n,e)=>n+e.amount,0));assert.deepEqual(decodeSave(encodeSave(w)).world,w);results.push({fare,accepted:w.passengers.totals.accepted,completed:w.passengers.completed.reduce((n,e)=>n+e.count,0),net:w.finance.days.filter(d=>d.simulatedMinutes>1439).map(d=>d.net),interval:actualInterval(w).observed});}
 assert.ok(results[0].accepted>results[2].accepted);assert.ok(results[0].completed>results[2].completed);assert.ok(results[1].net.every(n=>n>0));assert.ok(Math.abs(results[1].interval!-200)<.5);assert.ok(Math.abs(results[2].interval!-240)<.5);
 console.log('10-day balance scenarios',JSON.stringify(results));
});
