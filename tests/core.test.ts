import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config';
import { Simulation, clockText } from '../src/simulation/clock';
import { transact } from '../src/simulation/economy';
import { createWorld } from '../src/world/state';
import { STATIONS, TOWNS, CANDIDATE_NODES, seededRandom } from '../src/world/map';
import { decodeSave, encodeSave } from '../src/storage/save';

test('fixed step is independent of 30/60/120 fps; 1/2/4 speeds',()=>{
  for(const speed of [1,2,4] as const)for(const fps of [30,60,120]){
    const world=createWorld();world.clock.speed=speed;const sim=new Simulation(world);
    for(let i=0;i<fps*10;i++)sim.advance(1/fps);
    assert.equal(world.clock.tick,200);assert.ok(Math.abs(world.clock.minutes-(480+20*speed))<1e-7);
  }
});
test('pause freezes clock and clears partial step; long frame bounded',()=>{
  const world=createWorld();const sim=new Simulation(world);sim.advance(.04);world.clock.paused=true;sim.advance(50);assert.equal(world.clock.minutes,480);
  world.clock.paused=false;sim.advance(.01);assert.equal(world.clock.tick,0);sim.advance(100);assert.equal(world.clock.tick,5);
});
test('clock rolls through midnight',()=>assert.deepEqual(clockText(1440),{day:'02',time:'00:00'}));
test('ledger applies a unique event once; no overdraft or fractional money',()=>{
  const w=createWorld();assert.equal(transact(w,'station-A',-8000,'建站'),true);
  assert.equal(transact(w,'station-A',-8000,'重复'),false);assert.equal(transact(w,'too-much',-100_000,'不足'),false);assert.equal(transact(w,'fraction',.1,'小数'),false);
  assert.equal(w.economy.balance,92_000);assert.equal(w.economy.ledger.length,1);
  assert.deepEqual(decodeSave(encodeSave(w)).world,w);
});
test('save roundtrip restores map/camera/clock/towns/selection, no duplication',()=>{
  const w=createWorld();w.selected='B';w.clock.paused=true;w.clock.speed=4;
  let current=w;for(let i=0;i<8;i++)current=decodeSave(encodeSave(current)).world;
  assert.deepEqual(current,w);assert.equal(Object.keys(current.towns).length,3);
});
test('reject malformed/future/foreign maps/duplicate ledger/unsafe camera without mutation',()=>{
  const base=createWorld(),original=structuredClone(base);
  assert.throws(()=>decodeSave('{bad'));assert.throws(()=>decodeSave('null'));
  const mutate=[(d:any)=>d.schemaVersion=99,(d:any)=>d.world.map.seed=4,(d:any)=>d.world.clock.speed=5,(d:any)=>d.world.economy.balance=1,(d:any)=>d.world.camera.position=[0,-2,0],(d:any)=>d.world.camera.target=[999,0,0],(d:any)=>d.world.towns={},(d:any)=>d.world.selected='X',(d:any)=>d.world.economy.ledger=[{id:'x',amount:0,tick:0,reason:''},{id:'x',amount:0,tick:0,reason:''}]];
  for(const m of mutate){const d=JSON.parse(encodeSave(base));m(d);assert.throws(()=>decodeSave(JSON.stringify(d)));}
  assert.deepEqual(base,original);
});
test('stable IDs and required map contract',()=>{
  const ids=[...STATIONS,...TOWNS,...CANDIDATE_NODES].map(x=>x.id);assert.equal(new Set(ids).size,ids.length);
  assert.deepEqual(STATIONS.filter(s=>s.unlocked).map(s=>s.id),['A','B']);assert.equal(STATIONS.find(s=>s.id==='B')!.berths,2);assert.equal(TOWNS.length,3);
  assert.equal(CONFIG.initialFunds,100000);assert.equal(CONFIG.clock.dayMinutes/CONFIG.clock.minutesPerSecond,720);
  const a=seededRandom(72103),b=seededRandom(72103);for(let i=0;i<50;i++)assert.equal(a(),b());
});
