import * as THREE from 'three';
import { STATIONS } from '../world/map';
import { edgePoints } from '../world/railway';
import type { WorldState } from '../world/state';
import { material } from './models';
export class PlatformCrowd {
  readonly group=new THREE.Group();
  private body=new THREE.InstancedMesh(new THREE.CylinderGeometry(.17,.22,.65,6),material('#ffffff'),12);
  private heads=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.18,0),material('#e7c9a5'),12);
  private key='';
  count=0;
  constructor(){this.body.count=0;this.heads.count=0;this.body.frustumCulled=false;this.heads.frustumCulled=false;this.group.name='platform-crowds';this.group.add(this.body,this.heads);}
  update(w:WorldState){
    const rows=STATIONS.filter(s=>s.unlocked).map(s=>({s,count:w.railway.stations[s.id]?Math.min(6,w.passengers.waiting.filter(b=>b.from===s.id).reduce((n,b)=>n+b.count,0)):0}));
    const key=rows.map(r=>r.count).join();if(key===this.key)return false;this.key=key;
    const dummy=new THREE.Object3D(),colors=['#778f68','#c38c63','#8e9e9c','#c6b17d'];let index=0;
    for(const {s,count} of rows){const [a,b]=edgePoints(s.id==='A'?'ab-coast':'ab-town'),length=Math.hypot(b[0]-a[0],b[2]-a[2]);const dx=(b[0]-a[0])/length,dz=(b[2]-a[2])/length;
      for(let i=0;i<count;i++){
        const z=(i-2.5)*.85,x=-2;
        const wx=s.position[0]+dz*x+dx*z,wz=s.position[2]-dx*x+dz*z;
        dummy.position.set(wx,2.8,wz);dummy.updateMatrix();this.body.setMatrixAt(index,dummy.matrix);this.body.setColorAt(index,new THREE.Color(colors[i%4]));
        dummy.position.y=3.3;dummy.updateMatrix();this.heads.setMatrixAt(index,dummy.matrix);index++;
      }
    }
    this.count=index;this.body.count=index;this.heads.count=index;this.body.instanceMatrix.needsUpdate=true;this.heads.instanceMatrix.needsUpdate=true;if(this.body.instanceColor)this.body.instanceColor.needsUpdate=true;return true;
  }
}
