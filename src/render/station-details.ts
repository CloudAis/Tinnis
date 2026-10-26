import * as THREE from 'three';
import { STATIONS } from '../world/map';
import type { RailwayState } from '../world/railway';
import { edgePoints } from '../world/railway';
import { batchStatic,box,material } from './models';
import { disposeGeometry } from './railway';
import { PALETTE } from './style';
export class StationDetails {
 readonly group=new THREE.Group();private fixtures=new THREE.Group();private signs:THREE.Mesh[]=[];private key='';
 private bulbs=new THREE.InstancedMesh(new THREE.SphereGeometry(.24,7,5),new THREE.MeshBasicMaterial({color:PALETTE.lamp}),8);
 private pools=new THREE.InstancedMesh(new THREE.CircleGeometry(2.5,16),new THREE.MeshBasicMaterial({color:PALETTE.lamp,transparent:true,opacity:.2,depthWrite:false}),8);
 count=0;
 constructor(){this.group.name='station-furniture';this.bulbs.count=0;this.pools.count=0;this.bulbs.frustumCulled=false;this.pools.frustumCulled=false;this.group.add(this.bulbs,this.pools);}
 update(r:RailwayState,daylight:number){
  const key=JSON.stringify(r.stations);if(key!==this.key){this.key=key;disposeGeometry(this.fixtures);this.group.remove(this.fixtures);for(const sign of this.signs){const m=sign.material as THREE.MeshBasicMaterial;m.map?.dispose();m.dispose();}this.signs=[];
   const root=new THREE.Group(),dummy=new THREE.Object3D();let lamps=0;
   for(const s of STATIONS){const built=r.stations[s.id];if(!built)continue;const g=new THREE.Group();g.position.set(s.position[0],0,s.position[2]);const [a,b]=edgePoints(s.id==='A'?'ab-coast':s.id==='B'?'ab-town':'bd-onsen'),theta=Math.atan2(b[0]-a[0],b[2]-a[2]);g.rotation.y=theta;
    for(const x of s.id==='B'?[-2.4,6.1]:[-2.4])for(const z of [-3.7,3.7]){box(g,[.12,3.3,.12],[x,4.05,z],PALETTE.wood);box(g,[.65,.12,.45],[x,5.75,z],PALETTE.roof);
     dummy.position.set(s.position[0]+Math.cos(theta)*x+Math.sin(theta)*z,5.6,s.position[2]-Math.sin(theta)*x+Math.cos(theta)*z);dummy.rotation.set(0,0,0);dummy.updateMatrix();this.bulbs.setMatrixAt(lamps,dummy.matrix);dummy.position.y=2.56;dummy.rotation.x=-Math.PI/2;dummy.updateMatrix();this.pools.setMatrixAt(lamps,dummy.matrix);lamps++;}
    // Furniture stays clear of both railway berths and the passing-track throat.
    for(const z of [-1.8,1.8]){box(g,[.85,.15,1.4],[-2.4,2.95,z],PALETTE.wood);for(const dz of [-.5,.5])box(g,[.12,.45,.12],[-2.4,2.7,z+dz],PALETTE.ink);}
    box(g,[.09,.95,8.4],[-3.05,3.05,0],PALETTE.roof);for(const z of [-4,0,4])box(g,[.14,1.1,.14],[-3.05,3.1,z],PALETTE.wood);
    box(g,[.09,2,.09],[-2.4,3.5,0],PALETTE.wood);root.add(g);
    const canvas=document.createElement('canvas');canvas.width=384;canvas.height=144;const ctx=canvas.getContext('2d')!;ctx.fillStyle=PALETTE.paper;ctx.fillRect(0,0,384,144);ctx.fillStyle=PALETTE.green;ctx.fillRect(0,103,384,25);ctx.fillStyle=PALETTE.ink;ctx.font='bold 35px sans-serif';ctx.textAlign='center';ctx.fillText(`${s.id}  ${built.name}`,192,66,355);ctx.font='16px sans-serif';ctx.fillText('ALONGLINE LOCAL RAILWAY',192,93);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sign=new THREE.Mesh(new THREE.BoxGeometry(2.6,1,.06),new THREE.MeshBasicMaterial({map:texture}));sign.position.set(s.position[0]+Math.cos(theta)*-2.4,4.65,s.position[2]-Math.sin(theta)*-2.4);sign.rotation.y=theta;this.signs.push(sign);
    // Small crossing boards at the ends use the same cream/cedar palette.
    for(const z of [-7,7])box(g,[.15,.75,.15],[-3.4,2.6,z],PALETTE.cream);
   }
   this.fixtures=batchStatic(root);for(const sign of this.signs)this.fixtures.add(sign);this.group.add(this.fixtures);this.count=lamps;this.bulbs.count=lamps;this.pools.count=lamps;this.bulbs.instanceMatrix.needsUpdate=true;this.pools.instanceMatrix.needsUpdate=true;
  }
  this.bulbs.visible=daylight<.75;this.pools.visible=daylight<.75;(this.pools.material as THREE.MeshBasicMaterial).opacity=(1-daylight)*.22;
 }
}
