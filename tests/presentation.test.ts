import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import { network,minutes } from './support/world';import {executeTrainCommand} from '../src/simulation/train';import { Simulation } from '../src/simulation/clock';
import {newPresentation,setPresentation,daylightAt,weatherAt} from '../src/world/presentation';import {encodeSave,decodeSave} from '../src/storage/save';
function operating(){const w=network();executeTrainCommand(w,{type:'buy',model:'light',revision:0});executeTrainCommand(w,{type:'dispatch',revision:1});return w;}
function business(w:ReturnType<typeof operating>){const {camera,presentation,selected,...rest}=structuredClone(w);rest.fleet.follow=false;return rest;}
test('presentation switches, rain, mute and volume leave money, demand, dispatch and elapsed simulation identical',()=>{
 const a=operating(),b=structuredClone(a),sa=new Simulation(a),sb=new Simulation(b);for(let i=0;i<6000;i++){if(i%100===0)setPresentation(b,{cameraMode:i%200?'passenger':'follow',weather:i%300?'rain':'clear',muted:i%200===0,volume:.6});sa.advance(.05);sb.advance(.05);}assert.deepEqual(business(a),business(b));assert.deepEqual(decodeSave(encodeSave(b)).world,b);
});
test('v7 migration preserves earned state and adds only presentation defaults; invalid settings/camera rejected',()=>{
 const raw=readFileSync(new URL('./fixtures/stage7-earned.json',import.meta.url),'utf8'),old=JSON.parse(raw),w=decodeSave(raw).world;assert.deepEqual(w.presentation,newPresentation(old.world.fleet.follow));for(const key of ['economy','fleet','passengers','finance','development'])assert.deepEqual(w[key as 'fleet'],old.world[key]);
 for(const patch of [{weather:'storm'},{volume:NaN},{cameraMode:'driver'},{muted:0}])assert.throws(()=>setPresentation(w,patch as any));
 const s=JSON.parse(encodeSave(w));s.world.camera.position=[0,1,0];assert.throws(()=>decodeSave(JSON.stringify(s)));
});
test('day/night and auto rain are pure clock functions; pause freezes presentation time and all costs',()=>{
 assert.equal(daylightAt(480),1);assert.equal(daylightAt(0),0);assert.equal(daylightAt(1440),0);assert.equal(weatherAt(newPresentation(),720),'rain');assert.equal(weatherAt({...newPresentation(),weather:'clear'},720),'clear');
 const w=operating();setPresentation(w,{weather:'rain',muted:true,cameraMode:'follow'});w.clock.paused=true;const before=structuredClone(w);new Simulation(w).advance(300);assert.deepEqual(w,before);
});
test('unavailable travel does not mutate a depot; traveling camera bounds and preference roundtrip work',()=>{
 const w=network(),before=structuredClone(w);assert.equal(setPresentation(w,{cameraMode:'passenger'}).ok,false);assert.deepEqual(w,before);const v=operating();setPresentation(v,{cameraMode:'passenger'});v.camera={position:[-49,5.8,29],target:[-38,4.2,25]};assert.deepEqual(decodeSave(encodeSave(v)).world,v);
});
