import test from 'node:test';
import assert from 'node:assert/strict';
import { transact } from '../src/simulation/economy';
import { network, minutes } from './support/world';
import { executeTrainCommand as command, trainPose } from '../src/simulation/train';
import { allTrains } from '../src/world/fleet';
import { Simulation } from '../src/simulation/clock';
import { resourcesFor, requestAuthority } from '../src/simulation/dispatch';
import { encodeSave,decodeSave } from '../src/storage/save';
import { passengerStats } from '../src/world/passengers';
function start(origins=['A','B']){const w=network();for(const origin of origins){assert.equal(command(w,{type:'buy',model:'light',revision:w.fleet.revision}).ok,true);const v=allTrains(w.fleet).at(-1)!;command(w,{type:'select',id:v.id,revision:w.fleet.revision});assert.equal(command(w,{type:'dispatch',origin:origin as 'A'|'B',revision:w.fleet.revision}).ok,true);}return w;}
function boxesOverlap(a:NonNullable<ReturnType<typeof trainPose>>,b:NonNullable<ReturnType<typeof trainPose>>,length=5){
 const center=[b.position[0]-a.position[0],b.position[2]-a.position[2]];
 const axes=(p:typeof a)=>[[Math.sin(p.heading),Math.cos(p.heading)],[Math.cos(p.heading),-Math.sin(p.heading)]];
 const aa=axes(a),bb=axes(b),dot=(x:number[],y:number[])=>x[0]*y[0]+x[1]*y[1];
 return [...aa,...bb].every(axis=>Math.abs(dot(center,axis))<(length+.15)/2*(Math.abs(dot(aa[0],axis))+Math.abs(dot(bb[0],axis)))+.95*(Math.abs(dot(aa[1],axis))+Math.abs(dot(bb[1],axis)))-.01);
}
test('two train upper bound and occupied dispatch platform are cash-safe; B has distinct physical berths',()=>{
 const w=start(['B','B']);const poses=allTrains(w.fleet).map(v=>trainPose(w,v)!);assert.ok(Math.hypot(poses[0].position[0]-poses[1].position[0],poses[0].position[2]-poses[1].position[2])>3.7);assert.equal(boxesOverlap(poses[0],poses[1],7.2),false);const before=structuredClone(w);assert.equal(command(w,{type:'buy',model:'light',revision:w.fleet.revision}).ok,false);assert.deepEqual(w,before);assert.deepEqual(decodeSave(encodeSave(w)).world,w);
 const a=start(['A']);command(a,{type:'buy',model:'light',revision:a.fleet.revision});command(a,{type:'select',id:'train-0002',revision:a.fleet.revision});const cash=a.economy.balance;assert.equal(command(a,{type:'dispatch',origin:'A',revision:a.fleet.revision}).ok,false);assert.equal(a.economy.balance,cash);
});
test('opposite and same direction trains alternate for at least ten rounds without overlap, ghost locks or starvation; waiting save resumes',()=>{
 for(const origins of [['A','B'],['B','B']]){let w=start(origins);w.clock.speed=4;let sim=new Simulation(w),saved=false;const reasons=new Set<string>();let snapshots=0;
 for(let i=0;i<16000;i++){sim.advance(.05);const trains=allTrains(w.fleet),moving=trains.filter(v=>v.authority);assert.ok(moving.length<=1);assert.deepEqual(w.fleet.resources,resourcesFor(trains));const poses=trains.map(v=>trainPose(w,v)!);assert.equal(boxesOverlap(poses[0],poses[1]),false,`physical overlap ${w.clock.minutes}`);assert.equal(passengerStats(w.passengers).conserved,true);for(const v of trains)if(v.waitReason)reasons.add(v.waitReason);
 if(!saved&&trains.some(v=>v.waitReason==='前方区段占用')){const old=structuredClone(w);w=decodeSave(encodeSave(w)).world;assert.deepEqual(w,old);sim=new Simulation(w);saved=true;}
 if(i%2000===0){assert.deepEqual(decodeSave(encodeSave(w)).world,w);snapshots++;}
 }
 const legs=allTrains(w.fleet).map(v=>v.legsCompleted);assert.ok(legs.every(n=>n>=20),JSON.stringify(legs));assert.ok(Math.abs(legs[0]-legs[1])<=2);assert.equal(saved,true);assert.ok(reasons.has('前方区段占用'));assert.equal(snapshots,8);console.log('two-train alternation',origins,legs);}
});
test('atomic full-section and target berth request handles shared branch throat without partial reservations',()=>{
 const resources={sections:{AB:'train-1'},platforms:{'B:2':'train-1','B:1':'train-2'},throats:{A:'train-1',B:'train-1'}};
 const before=structuredClone(resources);assert.equal(requestAuthority(resources,'train-2','B','D',1,1).reason,'站口道岔通行占用');assert.deepEqual(resources,before);assert.equal(requestAuthority({sections:{},platforms:{'A:1':'other'},throats:{}},'train-2','B','A',1,1).reason,'目标站台占用');
});
test('stopped train holds its actual berth until empty sale/withdraw; corrupt reserved resources reject atomically',()=>{
 const w=start(['A','B']);command(w,{type:'select',id:'train-0001',revision:w.fleet.revision});command(w,{type:'stop',revision:w.fleet.revision});const id=w.fleet.vehicle!.id;minutes(w,20);assert.equal(allTrains(w.fleet).find(t=>t.id!==id)!.waitReason,'目标站台占用');assert.ok(Object.values(w.fleet.resources.platforms).includes(id));assert.equal(command(w,{type:'sell',revision:w.fleet.revision}).ok,true);assert.equal(Object.values(w.fleet.resources.platforms).includes(id),false);assert.deepEqual(decodeSave(encodeSave(w)).world,w);
 const r=start();minutes(r,20);const save=JSON.parse(encodeSave(r));save.world.fleet.resources.sections.AB='ghost';assert.throws(()=>decodeSave(JSON.stringify(save)));save.world.fleet.resources=r.fleet.resources;save.world.fleet.vehicle.authority={section:'AB',from:'B',to:'A',berth:1,fromBerth:1};assert.throws(()=>decodeSave(JSON.stringify(save)));
});

test('large bodies clear B2 switch and parked B1 across repeated departures without deleting or teleporting cars',()=>{
 const w=network();transact(w,'test:capital',10000,'独立调度压力场景资本');
 for(let i=0;i<2;i++){command(w,{type:'buy',model:'large',revision:w.fleet.revision});command(w,{type:'select',id:`train-000${i+1}`,revision:w.fleet.revision});command(w,{type:'dispatch',origin:'B',revision:w.fleet.revision});}
 w.clock.speed=4;const sim=new Simulation(w);let last=allTrains(w.fleet).map(v=>trainPose(w,v)!);
 for(let n=0;n<6000;n++){sim.advance(.05);const now=allTrains(w.fleet).map(v=>trainPose(w,v)!);assert.equal(boxesOverlap(now[0],now[1],7.2),false);for(let i=0;i<2;i++)assert.ok(Math.hypot(now[i].position[0]-last[i].position[0],now[i].position[2]-last[i].position[2])<.5);last=now;}
 assert.ok(allTrains(w.fleet).every(v=>v.legsCompleted>=10));assert.equal(allTrains(w.fleet).length,2);
});
