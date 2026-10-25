import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, type WorldState } from '../src/world/state';
import { EDGES, edgePrice, nearestNode, newRailway } from '../src/world/railway';
import { executeCommand, previewTrack, deploymentReadiness, type Command } from '../src/simulation/construction';
import { transact } from '../src/simulation/economy';
import { decodeSave, encodeSave } from '../src/storage/save';
import { CONFIG } from '../src/config';
const run=(w:WorldState,c:Omit<Command,'revision'>|any)=>executeCommand(w,{...c,revision:w.railway.revision} as Command);
function built(){const w=createWorld();run(w,{type:'build-station',station:'A'});run(w,{type:'build-station',station:'B'});run(w,{type:'build-track',from:'node-a',to:'node-b'});return w;}
function unchanged(w:WorldState,c:any){const before=structuredClone(w);assert.equal(run(w,c).ok,false);assert.deepEqual(w,before);}

test('A/B two stations and three tracks cost exactly 28000; shared graph yields directed path',()=>{
  assert.equal(EDGES.filter(e=>e.corridor==='AB').reduce((s,e)=>s+edgePrice(e.id),0),12000);
  assert.equal(EDGES.filter(e=>e.corridor==='BD').reduce((s,e)=>s+edgePrice(e.id),0),8000);
  const w=built();assert.equal(w.economy.balance,72000);assert.equal(w.economy.ledger.length,3);
  const line=deploymentReadiness(w);assert.equal(line.ok,true);assert.deepEqual(line.nodes,['node-a','node-coast','node-valley','node-b']);assert.equal(line.points.length,4);assert.ok(line.length>47);
  run(w,{type:'set-stops',stops:['B','A']});const reversed=deploymentReadiness(w);assert.deepEqual(reversed.nodes,[...line.nodes].reverse());assert.deepEqual(reversed.points,[...line.points].reverse());
});
test('repeat/stale/locked/unknown/same-node construction is an exact no-op',()=>{
  const w=built();unchanged(w,{type:'build-station',station:'A'});unchanged(w,{type:'build-station',station:'D'});unchanged(w,{type:'build-station',station:'C'});
  unchanged(w,{type:'build-track',from:'node-a',to:'node-b'});unchanged(w,{type:'build-track',from:'node-a',to:'node-a'});unchanged(w,{type:'build-track',from:'node-b',to:'node-d'});unchanged(w,{type:'build-track',from:'node-b',to:'node-c'});unchanged(w,{type:'build-track',from:'outside-map',to:'node-b'});
  const before=structuredClone(w);assert.equal(executeCommand(w,{type:'remove-track',edge:'ab-coast',revision:0}).ok,false);assert.deepEqual(w,before);
});
test('insufficient funds and cancelled previews do not mutate; partial route charges only missing edges',()=>{
  const w=createWorld();const before=structuredClone(w);previewTrack(w,'node-a','node-b');assert.deepEqual(w,before);
  transact(w,'test-spend',-97000,'测试余额');unchanged(w,{type:'build-station',station:'A'});unchanged(w,{type:'build-track',from:'node-a',to:'node-b'});
  const p=createWorld();run(p,{type:'build-track',from:'node-a',to:'node-coast'});assert.equal(previewTrack(p,'node-a','node-b').cost,7400);run(p,{type:'build-track',from:'node-a',to:'node-b'});assert.equal(p.economy.balance,88000);assert.equal(Object.keys(p.railway.tracks).length,3);
});
test('demolition refunds original price once, rebuild has new receipt, disconnected route cannot dispatch',()=>{
  const w=built();run(w,{type:'remove-track',edge:'ab-valley'});assert.equal(w.economy.balance,74000);assert.equal(deploymentReadiness(w).ok,false);assert.match(deploymentReadiness(w).reason,/断开/);
  unchanged(w,{type:'remove-track',edge:'ab-valley'});run(w,{type:'build-track',from:'node-coast',to:'node-valley'});assert.equal(w.economy.balance,70000);assert.equal(deploymentReadiness(w).ok,true);
  const original=CONFIG.stationCosts.A;
  try{(CONFIG.stationCosts as any).A=11000;run(w,{type:'remove-station',station:'A'});assert.equal(w.economy.balance,74000);}finally{(CONFIG.stationCosts as any).A=original;}
  assert.equal(deploymentReadiness(w).ok,false);assert.equal(Object.keys(w.railway.tracks).length,3);unchanged(w,{type:'remove-station',station:'A'});
  assert.deepEqual(decodeSave(encodeSave(w)).world,w);
});
test('rename/order validation, occupancy protection and nearest-node radius',()=>{
  const w=built();run(w,{type:'rename-station',station:'A',name:' 海风始发站 '});assert.equal(w.railway.stations.A!.name,'海风始发站');
  unchanged(w,{type:'rename-station',station:'A',name:'<script>'});unchanged(w,{type:'set-stops',stops:['A','A']});unchanged(w,{type:'set-stops',stops:['A','D']});
  const before=structuredClone(w);const blocked=executeCommand(w,{type:'remove-track',edge:'ab-coast',revision:w.railway.revision},d=>d.edges.includes('ab-coast')?'该区间有车辆，不可拆除。':null);assert.equal(blocked.ok,false);assert.deepEqual(w,before);
  assert.equal(nearestNode([-50,2,28]),'node-a');assert.equal(nearestNode([100,2,50]),null);
});
test('v2 roundtrip preserves names, topology, directions, purchase receipts and funds without duplicate assets',()=>{
  let w=built();run(w,{type:'rename-station',station:'B',name:'青溪中央'});run(w,{type:'set-stops',stops:['B','A']});run(w,{type:'remove-track',edge:'ab-town'});run(w,{type:'build-track',from:'node-valley',to:'node-b'});
  const original=structuredClone(w);for(let i=0;i<10;i++)w=decodeSave(encodeSave(w)).world;assert.deepEqual(w,original);assert.deepEqual(deploymentReadiness(w),deploymentReadiness(original));
});
test('v1 migrates without guessing past construction; v2 forged assets/refunds/costs/locked objects are rejected',()=>{
  const old=createWorld();old.selected='B';old.clock.paused=true;const doc=JSON.parse(encodeSave(old));doc.schemaVersion=1;delete doc.world.railway;
  const migrated=decodeSave(JSON.stringify(doc));assert.equal(migrated.schemaVersion,2);assert.deepEqual(migrated.world.railway,newRailway());assert.equal(migrated.world.economy.balance,100000);assert.equal(migrated.world.selected,'B');
  const base=built();const corrupt=[(d:any)=>d.world.railway.stations.A.paid=16000,(d:any)=>d.world.railway.nextSerial=1,(d:any)=>delete d.world.railway.tracks['ab-coast'],(d:any)=>d.world.railway.line.stops=['A','D'],(d:any)=>d.world.railway.stations.A.name='<img>',(d:any)=>d.world.economy.ledger[2].construction.items[0].paid=1];
  for(const change of corrupt){const d=JSON.parse(encodeSave(base));change(d);assert.throws(()=>decodeSave(JSON.stringify(d)));}
});
