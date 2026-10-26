import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {batchStatic,createHouse,box,material} from '../src/render/models';
test('shared roof palette batches custom roofs and box awnings without dropping any geometry',t=>{
 const errors:unknown[]=[];t.mock.method(console,'error',(...args:unknown[])=>errors.push(args));
 const root=new THREE.Group();root.add(createHouse(0));box(root,[2,.2,3],[0,8,0],'#718578');assert.equal(material('#718578'),material('#697b79'));
 let expected=0;root.traverse(o=>{if(o instanceof THREE.Mesh)expected+=o.geometry.index?.count??o.geometry.getAttribute('position').count;});
 const result=batchStatic(root);let actual=0;result.traverse(o=>{if(o instanceof THREE.Mesh)actual+=o.geometry.index?.count??o.geometry.getAttribute('position').count;});assert.equal(actual,expected);assert.deepEqual(errors,[]);
});
import {reconcileTrainModels} from '../src/render/train';
test('same-ID import switches real vehicle geometry, frees owned resources, and reuses unchanged models',()=>{
 const scene=new THREE.Scene(),models=new Map<string,THREE.Group>();reconcileTrainModels(scene,models,[{id:'train-0001',type:'light'}]);const first=models.get('train-0001')!,length=new THREE.Box3().setFromObject(first).getSize(new THREE.Vector3()).z;let disposed=0,shadowDisposed=0;first.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.addEventListener('dispose',()=>disposed++);if(o.userData.ownedMaterial)(o.material as THREE.Material).addEventListener('dispose',()=>shadowDisposed++);}});
 assert.equal(reconcileTrainModels(scene,models,[{id:'train-0001',type:'light'}]),false);assert.equal(models.get('train-0001'),first);reconcileTrainModels(scene,models,[{id:'train-0001',type:'large'}]);assert.ok(new THREE.Box3().setFromObject(models.get('train-0001')!).getSize(new THREE.Vector3()).z>length+2);assert.ok(disposed>0);assert.equal(shadowDisposed,1);assert.equal(scene.children.length,1);reconcileTrainModels(scene,models,[]);assert.equal(scene.children.length,0);
});
