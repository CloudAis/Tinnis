import { GROWTH_PLOTS } from '../world/development';
import * as THREE from 'three';
import { batchStatic,box,createHouse } from './models';
import { STATIONS,TOWNS } from '../world/map';
import type { WorldState } from '../world/state';
import { B_FRAME,edgePoints } from '../world/railway';
// Three fixed parcels per town. A level change replaces this group instead of appending models.

export function createDevelopmentModels(w:WorldState){const root=new THREE.Group();
 TOWNS.forEach((town,i)=>{const level=w.towns[town.id].level;GROWTH_PLOTS[town.id].forEach(([x,z,style],j)=>{const g=createHouse(level===1?style:(style+level-1)%4,level===1?.9:level===2?1:1.1);g.position.set(x,2,z);g.rotation.y=j%2?Math.PI/2:0;if(level>=2)box(g,[4,.3,.9],[0,2.6,2.2],level===3?'#c48754':'#6d916c');if(level===3){box(g,[.12,3,.12],[2.6,1.5,0],'#8c765b');box(g,[.8,1.4,.08],[2.6,2,0],'#e4d8b5');}root.add(g);});});
 for(const s of STATIONS){const upgrades=w.development.upgrades[s.id];if(!upgrades||!w.railway.stations[s.id])continue;const g=new THREE.Group();g.position.fromArray(s.position);g.position.y=0;const [a,b]=edgePoints(s.id==='A'?'ab-coast':s.id==='B'?'ab-town':'bd-onsen');g.rotation.y=Math.atan2(b[0]-a[0],b[2]-a[2]);
  if(upgrades.shelter){for(const z of [-2,2])box(g,[.15,2,.15],[-2.1,3.4,z],'#8c765b');box(g,[2.1,.2,5],[-2.1,4.5,0],'#718578');}
  if(upgrades.service){box(g,[.12,3,.12],[-3.4,3.4,3.7],'#806e59');box(g,[1,.7,.1],[-3.4,4.6,3.7],'#e5e4c8');}
  if(upgrades.shops){const shop=createHouse(1,.55);shop.position.set(-7,2,4);box(shop,[4,.25,1.2],[0,2.5,2.5],'#b87e4b');g.add(shop);}root.add(g);
 }
 return batchStatic(root);
}
