import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world/state';
import { executeCommand } from '../src/simulation/construction';
import { executeTrainCommand, trainPose } from '../src/simulation/train';
import { Simulation } from '../src/simulation/clock';
import { decodeSave, encodeSave } from '../src/storage/save';
export function railwayWorld(){const w=createWorld();for(const station of ['A','B'] as const)executeCommand(w,{type:'build-station',station,revision:w.railway.revision});executeCommand(w,{type:'build-track',from:'node-a',to:'node-b',revision:w.railway.revision});return w;}
function started(){const w=railwayWorld();executeTrainCommand(w,{type:'buy',model:'light',revision:0});executeTrainCommand(w,{type:'dispatch',revision:1});return w;}
function minutes(sim:Simulation,n:number){for(let i=0;i<Math.round(n/.1);i++)sim.advance(.05);}

test('one train purchase/deploy/sale is idempotent, paid once and refunds original 60%',()=>{
  const w=railwayWorld();const buy={type:'buy',model:'light',revision:0} as const;assert.equal(executeTrainCommand(w,buy).ok,true);assert.equal(executeTrainCommand(w,buy).ok,false);assert.equal(w.economy.balance,50000);
  executeTrainCommand(w,{type:'sell',revision:1});assert.equal(w.economy.balance,63200);assert.equal(w.fleet.vehicle,null);assert.deepEqual(decodeSave(encodeSave(w)).world,w);
  executeTrainCommand(w,{type:'buy',model:'large',revision:2});assert.equal(w.economy.balance,25200);assert.equal(w.fleet.vehicle!.type,'large');assert.equal(w.fleet.vehicle!.id,'train-0002');
});
test('three complete round trips, exact 90 minute legs and 10 minute station dwell, braking and reversal',()=>{
  const w=started(),sim=new Simulation(w);let count=0,lastDeparture=0,lastArrival=0;const visits:string[]=[];
  for(let i=0;i<6100;i++){
    const before=w.fleet.vehicle!.status,legs=w.fleet.vehicle!.legsCompleted;sim.advance(.05);const v=w.fleet.vehicle!;
    if(v.status==='running'&&before==='requesting'){if(lastArrival)assert.ok(Math.abs(w.clock.minutes-lastArrival-10)<1e-6);lastDeparture=w.clock.minutes;}
    if(v.legsCompleted!==legs){assert.ok(Math.abs(w.clock.minutes-lastDeparture-90)<1e-6);lastArrival=w.clock.minutes;visits.push(v.currentStation!);count++;}
  }
  assert.equal(count,6);assert.deepEqual(visits,['B','A','B','A','B','A']);assert.equal(w.economy.balance,100000+w.economy.ledger.reduce((n,e)=>n+e.amount,0));
});
test('pause and 30/60/120 FPS give matching train state at 1/2/4x; smooth pose stays on track',()=>{
  for(const speed of [1,2,4] as const){const snapshots=[];for(const fps of [30,60,120]){
    const w=started();w.clock.speed=speed;const sim=new Simulation(w);for(let i=0;i<fps*30;i++)sim.advance(1/fps);snapshots.push(w.fleet.vehicle);
    const pose=sim.visualPose()!;assert.ok(pose.position.every(Number.isFinite));w.clock.paused=true;const frozen=structuredClone(w);sim.advance(100);assert.deepEqual(w,frozen);
  }assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);}
});
test('running/braking/dwelling save roundtrips retain exact position, counters and remaining dwell, no duplicate charge',()=>{
  let w=started();let sim=new Simulation(w);const seen=new Set();
  for(let i=0;i<1150;i++){
    sim.advance(.05);const v=w.fleet.vehicle!;
    if(['running','braking','dwelling'].includes(v.status)&&!seen.has(v.status)){
      seen.add(v.status);const before=structuredClone(w),p=trainPose(w);w=decodeSave(encodeSave(w)).world;assert.deepEqual(w,before);assert.deepEqual(trainPose(w),p);assert.equal(w.economy.ledger.filter(e=>e.vehicle?.kind==='buy').length,1);sim=new Simulation(w);
    }
  }assert.equal(seen.size,3);
});
test('operational dependencies protected through stop until depot; route edits apply only at safe station',()=>{
  const w=started(),sim=new Simulation(w);minutes(sim,30);const before=structuredClone(w);
  assert.equal(executeCommand(w,{type:'remove-track',edge:'ab-valley',revision:w.railway.revision}).ok,false);assert.deepEqual(w,before);
  const pose=trainPose(w);executeCommand(w,{type:'set-stops',stops:['B','A'],revision:w.railway.revision});assert.deepEqual(trainPose(w),pose);assert.deepEqual(w.fleet.vehicle!.route!.stops,['A','B']);assert.deepEqual(w.fleet.vehicle!.pendingStops,['B','A']);
  assert.deepEqual(decodeSave(encodeSave(w)).world,w);minutes(sim,70);assert.equal(w.fleet.vehicle!.currentStation,'B');assert.deepEqual(w.fleet.vehicle!.route!.stops,['B','A']);assert.equal(w.fleet.vehicle!.pendingStops,null);
  executeTrainCommand(w,{type:'stop',revision:w.fleet.revision});if(w.fleet.vehicle!.status!=='stopped')minutes(sim,100);assert.equal(w.fleet.vehicle!.status,'stopped');assert.equal(executeCommand(w,{type:'remove-station',station:'A',revision:w.railway.revision}).ok,false);
  executeTrainCommand(w,{type:'withdraw',revision:w.fleet.revision});assert.equal(executeCommand(w,{type:'remove-track',edge:'ab-valley',revision:w.railway.revision}).ok,true);
});
test('v2 migrates empty fleet; invalid train position/receipt/future capacity rejected',()=>{
  const w=started(),s=new Simulation(w);minutes(s,20);const base=JSON.parse(encodeSave(w));
  for(const change of [(d:any)=>d.world.fleet.vehicle.distance=100,(d:any)=>d.world.fleet.vehicle.type='unknown',(d:any)=>d.world.fleet.nextSerial=1,(d:any)=>d.world.fleet.vehicle.dwellRemaining=99]){const d=structuredClone(base);change(d);assert.throws(()=>decodeSave(JSON.stringify(d)));}
  const old=JSON.parse(encodeSave(railwayWorld()));old.schemaVersion=2;delete old.world.fleet;assert.equal(decodeSave(JSON.stringify(old)).world.fleet.vehicle,null);
});
