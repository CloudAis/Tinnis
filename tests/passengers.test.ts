import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world/state';
import { executeCommand } from '../src/simulation/construction';
import { executeTrainCommand } from '../src/simulation/train';
import { Simulation } from '../src/simulation/clock';
import { passengerStats, newPassengers } from '../src/world/passengers';
import { demandWeight, demandRate, generateDemand, board, alight, expireWaiting, stepPassengers } from '../src/simulation/passengers';
import { decodeSave, encodeSave } from '../src/storage/save';
import { CONFIG } from '../src/config';
function setup(model:'light'|'large'='light'){const w=createWorld();for(const station of ['A','B'] as const)executeCommand(w,{type:'build-station',station,revision:w.railway.revision});executeCommand(w,{type:'build-track',from:'node-a',to:'node-b',revision:w.railway.revision});executeTrainCommand(w,{type:'buy',model,revision:0});executeTrainCommand(w,{type:'dispatch',revision:1});return w;}
function add(w:ReturnType<typeof setup>,count:number,at=w.clock.minutes,from:'A'|'B'='A',to:'A'|'B'='B'){
  w.passengers.waiting.push({id:`batch-${w.passengers.nextBatchSerial++}`,from,to,arrivedAt:at,count});w.passengers.totals.accepted+=count;w.passengers.totals.potential+=count;
}
function advance(sim:Simulation,n:number){for(let i=0;i<Math.round(n/.1);i++)sim.advance(.05);}
test('no direct service creates no passengers; full-day potential is 360 and rejected separately',()=>{
  const w=createWorld();w.clock.minutes+=1440;generateDemand(w);const s=passengerStats(w.passengers);assert.equal(s.accepted,0);assert.equal(s.waiting,0);assert.equal(s.potential,360);assert.equal(s.noService,360);assert.equal(s.priceRejected,0);
  assert.ok(demandWeight('tourism',12*60)>demandWeight('tourism',2*60));
  const baseline=CONFIG.demandAB;try{(CONFIG as any).demandAB=720;const adjusted=createWorld();adjusted.clock.minutes+=1440;generateDemand(adjusted);assert.equal(adjusted.passengers.totals.potential,720);}finally{(CONFIG as any).demandAB=baseline;}
  assert.ok(demandRate(w,'A','B',8*60)>demandRate(w,'A','B',2*60));assert.equal(demandRate(w,'A','D',12*60),0);
  w.towns['town-shiokou'].level=2;assert.ok(demandRate(w,'A','B',8*60)>demandRate(createWorld(),'A','B',8*60));
});
test('FIFO and capacity split batches while preserving original queue age',()=>{
  const w=setup();w.clock.minutes=500;w.passengers.lastDemandMinute=500;add(w,20,480);add(w,12,490);board(w);
  assert.equal(passengerStats(w.passengers).onboard,24);assert.equal(w.passengers.onboard[0].count,20);assert.equal(w.passengers.onboard[1].count,4);assert.equal(w.passengers.waiting[0].count,8);assert.equal(w.passengers.waiting[0].arrivedAt,490);assert.equal(passengerStats(w.passengers).conserved,true);
  assert.deepEqual(decodeSave(encodeSave(w)).world,w);
});
test('alighting preserves other destinations and other vehicles; repeat arrival creates no event twice',()=>{
  const p=newPassengers(600);p.onboard=[{id:'batch-1',rideId:'ride-1',from:'A',to:'B',arrivedAt:480,boardedAt:490,count:8,fare:20,vehicleId:'train-0001'},{id:'batch-2',rideId:'ride-2',from:'A',to:'D',arrivedAt:480,boardedAt:490,count:5,fare:20,vehicleId:'train-0001'},{id:'batch-3',rideId:'ride-3',from:'A',to:'B',arrivedAt:480,boardedAt:490,count:2,fare:20,vehicleId:'other-train'}];
  p.totals.accepted=15;p.totals.potential=15;p.nextBatchSerial=4;p.nextRideSerial=4;assert.equal(passengerStats(p).conserved,true);
  assert.equal(alight(p,'B','train-0001',600,1).length,1);assert.equal(p.onboard.length,2);assert.equal(p.onboard.find(b=>b.to==='D')!.count,5);assert.equal(alight(p,'B','train-0001',600,1).length,0);assert.equal(p.completed.length,1);assert.equal(p.completed[0].amount,160);assert.equal(passengerStats(p).conserved,true);
});
test('fare locks on boarding; arrival records unique completion and does not credit stage 5 money yet',()=>{
  const w=setup();add(w,4);board(w);const fare=CONFIG.fare.base;
  try{(CONFIG.fare as any).base=30;w.clock.minutes=580;w.passengers.lastDemandMinute=580;w.fleet.vehicle!.currentStation='B';alight(w.passengers,'B',w.fleet.vehicle!.id,580,1);assert.equal(w.passengers.completed[0].fare,20);assert.equal(w.passengers.completed[0].amount,80);assert.equal(w.economy.balance,50000);}finally{(CONFIG.fare as any).base=fare;}
});
test('patience expires only waiting remainder, not onboard riders; age survives load',()=>{
  const w=setup();add(w,30);board(w);w.clock.minutes=719.9;w.passengers.lastDemandMinute=719;let restored=decodeSave(encodeSave(w)).world;
  assert.equal(restored.passengers.waiting[0].arrivedAt,480);expireWaiting(restored.passengers,720);assert.equal(restored.passengers.totals.abandoned,6);assert.equal(restored.passengers.onboard[0].count,24);assert.equal(passengerStats(restored.passengers).conserved,true);
});
test('two game days conserve accepted demand, never exceed 24, and saves continue identically',()=>{
  let w=setup(),sim=new Simulation(w);const stages=new Set<string>();
  for(let i=0;i<28800;i++){
    sim.advance(.05);const s=passengerStats(w.passengers);assert.ok(s.onboard<=24);assert.equal(s.conserved,true);assert.equal(s.potential,s.accepted+s.noService+s.priceRejected);
    const status=w.fleet.vehicle!.status;
    if(['running','braking','dwelling'].includes(status)&&!stages.has(status)&&w.passengers.nextRideSerial>1){stages.add(status);const old=structuredClone(w);w=decodeSave(encodeSave(w)).world;assert.deepEqual(w,old);sim=new Simulation(w);}
  }
  assert.equal(stages.size,3);assert.ok(passengerStats(w.passengers).completed>0);assert.equal(w.economy.balance,50000);assert.equal(new Set(w.passengers.completed.map(e=>e.eventId)).size,w.passengers.completed.length);
  assert.deepEqual(decodeSave(encodeSave(w)).world,w);
});
test('station stop does not strand onboard passengers, unloads before any new boarding, and stops generating accepted demand',()=>{
  const w=setup(),sim=new Simulation(w);add(w,24);board(w);executeTrainCommand(w,{type:'stop',revision:w.fleet.revision});assert.equal(w.fleet.vehicle!.stopRequested,true);assert.notEqual(w.fleet.vehicle!.status,'stopped');
  const accepted=w.passengers.totals.accepted;advance(sim,100);assert.equal(w.fleet.vehicle!.status,'stopped');assert.equal(passengerStats(w.passengers).onboard,0);assert.equal(passengerStats(w.passengers).completed,24);assert.equal(w.passengers.totals.accepted,accepted);
  executeTrainCommand(w,{type:'withdraw',revision:w.fleet.revision});assert.equal(w.fleet.vehicle!.status,'depot');
});
test('v3 migration retains train, adds empty demand at current clock, corrupt capacity/events/mass rejected',()=>{
  const golden=decodeSave(readFileSync(new URL('./fixtures/stage4-v4.json',import.meta.url),'utf8'));assert.equal(golden.world.fleet.vehicle,null);assert.equal(passengerStats(golden.world.passengers).pendingRevenue,540);assert.equal(passengerStats(golden.world.passengers).conserved,true);assert.equal(golden.world.economy.balance,63200);
  const old=setup();const legacy=JSON.parse(encodeSave(old));legacy.schemaVersion=3;delete legacy.world.passengers;const migrated=decodeSave(JSON.stringify(legacy));assert.equal(migrated.world.passengers.totals.accepted,0);assert.deepEqual(migrated.world.fleet,old.fleet);
  add(old,30);board(old);const base=JSON.parse(encodeSave(old));for(const change of [(d:any)=>d.world.passengers.totals.accepted++,(d:any)=>d.world.passengers.onboard[0].count=25,(d:any)=>d.world.passengers.waiting[0].arrivedAt=1000,(d:any)=>d.world.passengers.nextRideSerial=1]){const d=structuredClone(base);change(d);assert.throws(()=>decodeSave(JSON.stringify(d)));}
});

test('large train capacity is 48 and passenger simulation remains independent of render frequency',()=>{
  const large=setup('large');add(large,60);board(large);assert.equal(passengerStats(large.passengers).onboard,48);assert.equal(large.passengers.waiting[0].count,12);assert.deepEqual(decodeSave(encodeSave(large)).world,large);
  const snapshots=[];for(const fps of [30,60,120]){const w=setup();w.clock.speed=4;const sim=new Simulation(w);for(let i=0;i<fps*30;i++)sim.advance(1/fps);snapshots.push(w.passengers);}
  assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);
});
