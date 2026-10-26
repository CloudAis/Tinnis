import * as THREE from 'three';
import { batchStatic, box, cylinder } from './models';
import type { VehicleType } from '../world/fleet';
export function createTrainModel(type:VehicleType) {
  const g=new THREE.Group(),length=type==='light'?5:7.2;
  box(g,[1.8,1.7,length],[0,1.55,0],'#eee6cd');
  box(g,[1.85,.32,length+.08],[0,1.15,0],type==='light'?'#577f66':'#b87e4b');
  box(g,[1.9,.25,length+.15],[0,2.52,0],'#718578');
  for(const x of [-.92,.92])for(let z=-length/2+.8;z<length/2-.4;z+=1.1)box(g,[.05,.7,.75],[x,1.95,z],'#587f82');
  for(const z of [-length/2-.02,length/2+.02]){
    box(g,[1.4,.75,.06],[0,1.95,z],'#577d80');
    for(const x of [-.55,.55])box(g,[.2,.15,.08],[x,1.2,z],z>0?'#f7e5a6':'#b66c4e');
  }
  for(const x of [-.85,.85])for(const z of [-length*.32,length*.32]){const wheel=cylinder(g,.32,.32,.17,[x,.55,z],'#50615a',10);wheel.rotation.z=Math.PI/2;}
  const model=batchStatic(g);model.name='passenger-train';model.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=false;});
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.4,length+.5),new THREE.MeshBasicMaterial({color:'#344738',transparent:true,opacity:.13,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.29;model.add(shadow);return model;
}
