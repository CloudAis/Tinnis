import { transact } from '../src/simulation/economy';
import { board } from '../src/simulation/passengers';
import { boxesOverlap } from './support/geometry';
import test from 'node:test';import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { network,minutes } from './support/world';
import { executeTrainCommand as command,trainPose } from '../src/simulation/train';
import { executeCommand,previewTrack } from '../src/simulation/construction';
import { allTrains } from '../src/world/fleet';
import { executeUpgrade,patience,dwellMinutes,canUnlockD,stepDevelopment } from '../src/simulation/development';
import { Simulation } from '../src/simulation/clock';import { encodeSave,decodeSave } from '../src/storage/save';
import { passengerStats } from '../src/world/passengers';import { expireWaiting } from '../src/simulation/passengers';import { CONFIG } from '../src/config';
function start(){const w=network();command(w,{type:'buy',model:'light',revision:w.fleet.revision});command(w,{type:'dispatch',revision:w.fleet.revision});return w;}
export function earned(){const w=start();minutes(w,2400);assert.equal(canUnlockD(w),true);assert.equal(w.development.unlockedD,true);return w;}
function extend(w:ReturnType<typeof start>){assert.equal(executeCommand(w,{type:'build-station',station:'D',revision:w.railway.revision}).ok,true);assert.equal(executeCommand(w,{type:'build-track',from:'node-b',to:'node-d',revision:w.railway.revision}).ok,true);}
test('three upgrades cost once, change real patience/turnover/rent, charge maintenance, and remove/refund once',()=>{
 const w=start();for(const kind of ['shelter','service','shops'] as const){const c={station:'A',kind,revision:w.development.revision} as const,cash=w.economy.balance;assert.equal(executeUpgrade(w,c).ok,true);assert.equal(w.economy.balance,cash-CONFIG.upgrades[kind].cost);assert.equal(executeUpgrade(w,c).ok,false);assert.equal(executeUpgrade(w,{...c,revision:w.development.revision}).ok,false);}
 assert.equal(patience(w,'A'),360);assert.equal(dwellMinutes(w,'A'),6);assert.equal(w.fleet.vehicle!.dwellRemaining,6);assert.equal(executeCommand(w,{type:'remove-station',station:'A',revision:w.railway.revision}).ok,false);
 minutes(w,1200);assert.ok(w.economy.ledger.some(e=>e.posting?.category==='rent'));assert.ok(w.economy.ledger.filter(e=>e.posting?.category==='rent').every(e=>{const completion=w.passengers.completed.find(p=>`rent:${p.eventId}`===e.id);return completion?.to==='A'&&e.amount===completion.count*2;}));assert.equal(w.development.lastEvent,w.passengers.completed.length);assert.deepEqual(decodeSave(encodeSave(w)).world,w);
 const before=w.economy.balance,c={station:'A',kind:'shops',remove:true,revision:w.development.revision} as const;assert.equal(executeUpgrade(w,c).ok,true);assert.equal(w.economy.balance,before+3000);assert.equal(executeUpgrade(w,c).ok,false);assert.deepEqual(decodeSave(encodeSave(w)).world,w);
});
test('growth uses sustained arrivals/service, respects cooldown/level cap and no-service pause; load never awards twice',()=>{
 const w=start();for(let hour=0;hour<120;hour++){const before=structuredClone(w.towns),previous=structuredClone(w.development.towns);minutes(w,60);for(const id of ['town-shiokou','town-aokawa','town-kaede'] as const)if(w.towns[id].level!==before[id].level){assert.equal(w.towns[id].level,before[id].level+1);assert.ok(w.development.towns[id].lastGrowth-previous[id].lastGrowth>=1440-1e-6);}}assert.equal(w.towns['town-shiokou'].level,3);assert.equal(w.towns['town-aokawa'].level,3);assert.equal(w.development.towns['town-shiokou'].progress,0);assert.equal(w.towns['town-kaede'].level,1);assert.match(w.development.towns['town-kaede'].reason,/服务/);let r=decodeSave(encodeSave(w)).world;const before=structuredClone(r);stepDevelopment(r);assert.deepEqual(r,before);
 command(w,{type:'stop',revision:w.fleet.revision});minutes(w,400);assert.equal(w.fleet.vehicle!.status,'stopped');const levels=structuredClone(w.towns);minutes(w,1440);assert.deepEqual(w.towns,levels);
});
test('D stays locked until 200 completed plus full profitable day, then paid branch unlock persists without cash rewards',()=>{
 const w=start();minutes(w,1440);assert.ok(w.passengers.completed.reduce((n,e)=>n+e.count,0)>=200);assert.equal(w.development.unlockedD,false);assert.equal(previewTrack(w,'node-b','node-d').ok,false);const c={type:'build-station',station:'D',revision:w.railway.revision} as const;assert.equal(executeCommand(w,c).ok,false);
 minutes(w,960);assert.equal(w.development.unlockedD,true);const b=w.economy.balance;extend(w);assert.equal(w.economy.balance,b-16000);assert.deepEqual(decodeSave(encodeSave(w)).world,w);const saved=JSON.parse(encodeSave(w));saved.world.finance.days=[];assert.throws(()=>decodeSave(JSON.stringify(saved)));assert.equal(w.railway.stations.C,undefined);
});
test('shared AB and ABD two trains keep through passengers at B, complete D trips, and resume all phases without deadlock',()=>{
 let w=earned();extend(w);command(w,{type:'buy',model:'light',revision:w.fleet.revision});command(w,{type:'select',id:'train-0002',revision:w.fleet.revision});
 executeCommand(w,{type:'set-stops',stops:['A','B','D'],revision:w.railway.revision});assert.equal(command(w,{type:'dispatch',origin:'D',revision:w.fleet.revision}).ok,true);command(w,{type:'select',id:'train-0001',revision:w.fleet.revision});assert.equal(command(w,{type:'assign',stops:['A','B'],revision:w.fleet.revision}).ok,true);
 w.clock.speed=4;let sim=new Simulation(w);const initial=allTrains(w.fleet).map(v=>v.legsCompleted);const phases=new Set<string>();let through=false;let lastPoses=allTrains(w.fleet).map(v=>trainPose(w,v)!);
 for(let i=0;i<30000;i++){sim.advance(.05);const cars=allTrains(w.fleet);assert.ok(cars.filter(v=>v.authority?.section==='AB').length<=1);assert.ok(cars.filter(v=>v.authority?.section==='BD').length<=1);assert.ok(cars.filter(v=>v.authority).length<=1);assert.equal(passengerStats(w.passengers).conserved,true);
 for(const v of cars){assert.ok(w.passengers.onboard.filter(b=>b.vehicleId===v.id).reduce((n,b)=>n+b.count,0)<=24);if(v.currentStation==='B'&&w.passengers.onboard.some(b=>b.vehicleId===v.id&&b.to==='D'))through=true;}
 const poses=cars.map(v=>trainPose(w,v)!);assert.equal(boxesOverlap(poses[0],poses[1]),false,`shared B overlap ${w.clock.minutes}`);for(let j=0;j<2;j++)assert.ok(Math.hypot(poses[j].position[0]-lastPoses[j].position[0],poses[j].position[2]-lastPoses[j].position[2])<1,'no teleport on B route change');lastPoses=poses;
 const car=cars[1];if(car.authority?.section==='BD'&&['running','braking'].includes(car.status)&&!phases.has(car.status)||car.currentStation==='B'&&car.status==='dwelling'&&!phases.has('B-dwell')){phases.add(car.currentStation?'B-dwell':car.status);const original=structuredClone(w);w=decodeSave(encodeSave(w)).world;assert.deepEqual(w,original);sim=new Simulation(w);}
 }
 const legs=allTrains(w.fleet).map((v,i)=>v.legsCompleted-initial[i]);assert.ok(legs.every(n=>n>=20),JSON.stringify(legs));assert.ok(w.passengers.completed.some(e=>e.to==='D'));assert.equal(through,true);assert.equal(phases.size,3);assert.deepEqual(decodeSave(encodeSave(w)).world,w);console.log('shared AB/ABD completed legs',legs,'to D',w.passengers.completed.filter(e=>e.to==='D').reduce((n,e)=>n+e.count,0));
});
test('earned unlock fixture remains a normal audited save for browser use',()=>{const w=earned();w.clock.paused=true;w.clock.speed=4;assert.deepEqual(decodeSave(encodeSave(w)).world,w);const fixture=decodeSave(readFileSync(new URL('./fixtures/stage7-earned.json',import.meta.url),'utf8')).world;const {journey:oldJourney,...oldState}=fixture,{journey:newJourney,...newState}=w;assert.deepEqual(oldState,newState);assert.equal(oldJourney.skipped,true);assert.deepEqual(Object.keys(oldJourney.milestones).sort(),Object.keys(newJourney.milestones).sort());});

test('real v6 two-train save migrates position, reservations, money and directional headway history',()=>{
 const old=JSON.parse(readFileSync(new URL('./fixtures/stage6-v6.json',import.meta.url),'utf8')),w=decodeSave(JSON.stringify(old)).world;assert.deepEqual(w.fleet,old.world.fleet);assert.deepEqual(w.economy,old.world.economy);assert.deepEqual(w.finance.departures['A>B'],old.world.finance.departures.A);assert.equal(w.development.unlockedD,false);assert.equal(w.development.lastEvent,w.passengers.completed.length);assert.deepEqual(decodeSave(encodeSave(w)).world,w);
});
test('Kaede also reaches the same third-level cap through real paid BD service, with normal audited save',()=>{
 const w=earned();extend(w);executeCommand(w,{type:'set-stops',stops:['B','D'],revision:w.railway.revision});minutes(w,1440*18);assert.equal(w.towns['town-kaede'].level,3);assert.equal(w.development.towns['town-kaede'].progress,0);assert.ok(w.development.towns['town-kaede'].delivered>=280);assert.deepEqual(decodeSave(encodeSave(w)).world,w);console.log('Kaede grown through actual BD arrivals',w.development.towns['town-kaede'].delivered,w.economy.balance);
});

test('bankrupt tourist train finishes through riders at D without accepting or stranding new boardings at B',()=>{
 const w=earned();extend(w);command(w,{type:'assign',stops:['A','B','D'],revision:w.fleet.revision});const p=w.passengers;const id=`batch-${p.nextBatchSerial++}`;p.waiting.push({id,from:'A',to:'D',arrivedAt:w.clock.minutes,count:3});p.totals.accepted+=3;p.totals.potential+=3;board(w);assert.ok(p.onboard.some(b=>b.id===id));minutes(w,20);transact(w,'test:tourism-debt',-w.economy.balance-1000,'旅游线在途亏欠场景',undefined,undefined,{category:'fixed',day:Math.floor(w.clock.minutes/1440),operating:true});const accepted=p.totals.accepted;minutes(w,300);assert.equal(w.fleet.vehicle!.currentStation,'D');assert.equal(w.fleet.vehicle!.status,'stopped');assert.equal(p.onboard.length,0);assert.equal(p.totals.accepted,accepted);assert.equal(p.completed.filter(e=>e.id===id&&e.to==='D').reduce((n,e)=>n+e.count,0),3);assert.deepEqual(decodeSave(encodeSave(w)).world,w);
});

test('unbuilt tourism edit cannot create an unsaveable pending route; removing unused branch still permits AB recovery',()=>{
 const w=earned(),before=structuredClone(w);assert.equal(executeCommand(w,{type:'set-stops',stops:['A','B','D'],revision:w.railway.revision}).ok,false);assert.deepEqual(w,before);assert.deepEqual(decodeSave(encodeSave(w)).world,w);extend(w);executeCommand(w,{type:'set-stops',stops:['A','B','D'],revision:w.railway.revision});command(w,{type:'assign',stops:['A','B'],revision:w.fleet.revision});executeCommand(w,{type:'remove-track',edge:'bd-forest',revision:w.railway.revision});command(w,{type:'stop',revision:w.fleet.revision});minutes(w,300);assert.equal(w.fleet.vehicle!.status,'stopped');assert.equal(command(w,{type:'dispatch',revision:w.fleet.revision}).ok,true);assert.deepEqual(decodeSave(encodeSave(w)).world,w);
});
