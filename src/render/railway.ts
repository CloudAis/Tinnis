import * as THREE from 'three';
import { STATIONS, type Point } from '../world/map';
import { EDGES, edgePoints, type RailwayState } from '../world/railway';
import { batchStatic, box, createStationHouse } from './models';

function segment(root:THREE.Group,a:Point,b:Point,offset=0) {
  const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
  const g=new THREE.Group();g.position.set((a[0]+b[0])/2,0,(a[2]+b[2])/2);g.rotation.y=Math.atan2(dx,dz);
  box(g,[2.8,.16,length],[offset,2.15,0],'#9d9a83');
  for(let z=-length/2+.25;z<length/2;z+=1.05)box(g,[2.2,.14,.28],[offset,2.31,z],'#81705b');
  for(const x of [-.58,.58])box(g,[.12,.15,length],[x+offset,2.45,0],'#d1d4c3');
  root.add(g);
}
export function createRailwayModels(r:RailwayState) {
  const root=new THREE.Group();
  for(const e of EDGES)if(r.tracks[e.id]) {
    const [a,b]=edgePoints(e.id);const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
    // The station owns its apron; trim the matching straight connector to avoid coplanar rails.
    const start=e.from==='node-a'&&r.stations.A?5:0;
    const end=e.to==='node-b'&&r.stations.B?9:0;
    segment(root,[a[0]+dx/length*start,a[1],a[2]+dz/length*start],[b[0]-dx/length*end,b[1],b[2]-dz/length*end]);
  }
  for(const s of STATIONS){
    if(!r.stations[s.id])continue;
    const g=new THREE.Group();g.position.fromArray(s.position);g.position.y=0;
    const edge=s.id==='A'?edgePoints('ab-coast'):s.id==='B'?edgePoints('ab-town'):edgePoints('bd-onsen');
    g.rotation.y=Math.atan2(edge[1][0]-edge[0][0],edge[1][2]-edge[0][2]);
    segment(g,[0,2.2,s.id==='B'?-9:-5],[0,2.2,s.id==='B'?9:5]);
    box(g,[1.6,.45,10],[-2,2.25,0],'#d8caac');
    box(g,[.15,.05,9.8],[-1.18,2.5,0],'#f1dd9b');
    const house=createStationHouse();house.scale.multiplyScalar(.65);house.rotation.y=-Math.PI/2;house.position.set(-5.4,2.05,-1);g.add(house);
    for(const z of [-3,3]) {box(g,[.18,3,.18],[-2.2,4,z],'#8d7d62');box(g,[.6,.9,.1],[-2.2,5.3,z],'#e8ddbb');}
    // Two physical berths are part of the B asset; train allocation remains a later-stage concern.
    if(s.berths===2){
      segment(g,[0,2.2,-9],[3.8,2.2,-5]);segment(g,[3.8,2.2,-5],[3.8,2.2,5]);segment(g,[3.8,2.2,5],[0,2.2,9]);
      box(g,[1.3,.45,10],[5.2,2.25,0],'#d8caac');
    }
    root.add(g);
  }
  const result=batchStatic(root);result.name='built-railway';return result;
}
export function disposeGeometry(root:THREE.Object3D){root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line)o.geometry.dispose();});}
