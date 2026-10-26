import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {batchStatic,createHouse,box,material} from '../src/render/models';
test('shared roof palette batches custom roofs and box awnings without dropping any geometry',t=>{
 const errors:unknown[]=[];t.mock.method(console,'error',(...args:unknown[])=>errors.push(args));
 const root=new THREE.Group();root.add(createHouse(0));box(root,[2,.2,3],[0,8,0],'#718578');assert.equal(material('#718578'),material('#697b79'));
 let expected=0;root.traverse(o=>{if(o instanceof THREE.Mesh)expected+=o.geometry.index?.count??o.geometry.getAttribute('position').count;});
 const result=batchStatic(root);let actual=0;result.traverse(o=>{if(o instanceof THREE.Mesh)actual+=o.geometry.index?.count??o.geometry.getAttribute('position').count;});assert.equal(actual,expected);assert.deepEqual(errors,[]);
});
