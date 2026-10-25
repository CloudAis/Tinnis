import * as THREE from 'three';
import { MAP, STATIONS, TOWNS, seededRandom } from '../world/map';
import { batchStatic, box, createHouse, createStationHouse, createTree, cylinder, material } from './models';
export const RIVER_POINTS = [[20,-68],[12,-44],[16,-27],[10,-10],[19,7],[11,27],[16,43],[10,65]];
export function curve(points: number[][]) { return new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], 0, p[1]))); }
function ribbon(parent: THREE.Group, points: number[][], width: number, y: number, color: string) {
  const path = curve(points); const pos: number[] = []; const indices: number[] = [];
  for (let i = 0; i <= 100; i++) {
    const t = i / 100, p = path.getPoint(t), tangent = path.getTangent(t);
    const nx = -tangent.z * width / 2, nz = tangent.x * width / 2;
    const level = y > 2 && p.z > 40.7 ? y - Math.min(1, (p.z-40.7)/3) * 4.24 : y;
    pos.push(p.x + nx, level, p.z + nz, p.x - nx, level, p.z - nz);
    if (i < 100) { const n = i * 2; indices.push(n,n+2,n+1,n+1,n+2,n+3); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); geo.setIndex(indices); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material(color)); m.receiveShadow = true; parent.add(m);
}
function island(parent: THREE.Group, points: number[][], top: number, depth: number, color: string, expansion = 1) {
  const s = new THREE.Shape();
  points.forEach((p,i) => { const x=p[0]*expansion,z=-p[1]*expansion; if(i===0)s.moveTo(x,z);else s.lineTo(x,z); }); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 1.2, bevelThickness: .7, bevelSegments: 1, steps: 1, curveSegments: 1 });
  geo.rotateX(-Math.PI/2); geo.translate(0,top-depth-.7,0);
  const mesh = new THREE.Mesh(geo,material(color)); mesh.receiveShadow=true; mesh.castShadow=true; parent.add(mesh);
}
export function makeLandscape() {
  const g = new THREE.Group(); const random = seededRandom(MAP.seed);
  const outline=[[-99,-38],[-78,-66],[-36,-76],[3,-73],[45,-78],[81,-62],[103,-31],[104,7],[87,34],[54,39],[27,34],[6,45],[-14,37],[-39,45],[-69,37],[-88,16],[-97,-9]];
  box(g,[800,.4,800],[0,-2.4,0],'#88b9b7');
  island(g,outline,-.4,6,'#b6af8c',1.02);
  island(g,outline,1.2,2,'#dfd2a6',1.012);
  island(g,outline,2,1,'#a8b88b');
  // Small sandy islands and tidal rocks.
  for (let i=0;i<15;i++) {
    const x=-95+random()*180,z=53+random()*25;
    const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(1+random()*2,0),material('#b5b9a5'));
    rock.position.set(x,-.6,z);rock.scale.y=.6;g.add(rock);
  }
  ribbon(g,RIVER_POINTS,8.5,2.06,'#d8d1ac');
  ribbon(g,RIVER_POINTS,5.8,2.1,'#75afb0');
  ribbon(g,[[12,27],[16,43],[10,65]],6.5,2.11,'#80b8b8');
  // Road links are walking roads, not built railways.
  ribbon(g,[[-76,15],[-53,9],[-33,0],[-20,-13],[-9,-20],[0,-24]],3.5,2.1,'#d5ccaa');
  ribbon(g,[[22,-25],[35,-27],[57,-24],[80,-19]],3.5,2.1,'#d5ccaa');
  ribbon(g,[[-53,9],[-51,29]],2.5,2.11,'#dfd3af');
  ribbon(g,[[-9,-20],[-12,2]],2.5,2.11,'#dfd3af');
  ribbon(g,[[57,-24],[58,-6]],2.5,2.11,'#dfd3af');
  // Pedestrian bridge across the stream; rail crossing is reserved for stage 2.
  box(g,[14,.6,3],[15,2.8,-25],'#c1a37b');
  for(const z of [-26.5,-23.5]) { box(g,[14,.2,.16],[15,3.8,z],'#786f52'); for(const x of [9,15,21])box(g,[.18,1.1,.18],[x,3.3,z],'#786f52'); }
  // Mountain ridges frame the inhabited valley.
  const hills=[[-74,-48,21,22],[-48,-56,27,32],[-22,-62,19,25],[36,-58,24,30],[63,-54,22,29],[83,-41,20,24],[94,-17,12,16]];
  hills.forEach(([x,z,r,h],i)=>{
    const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,7),material(['#78967c','#698c76','#88a080'][i%3]));
    m.position.set(x,2+h/2,z);m.rotation.y=i*.7;m.castShadow=true;m.receiveShadow=true;g.add(m);
    const cap=new THREE.Mesh(new THREE.ConeGeometry(r*.28,h*.23,7),material('#adb99c'));
    cap.position.set(x,2+h*.89,z);cap.rotation.y=i*.7;g.add(cap);
  });
  const placements=[
    [-73,3,0],[-63,2,1],[-51,-1,0],[-40,2,2],[-68,17,2],[-57,18,1],[-42,16,3],[-78,-10,2],[-65,-12,0],[-52,-12,1],[-42,-12,2],
    [-29,-22,0],[-18,-30,3],[-6,-33,0],[4,-28,2],[-31,-10,1],[-23,0,2],[0,-9,3],[-3,-22,2],
    [42,-20,1],[51,-31,0],[63,-33,2],[73,-25,1],[73,-11,0],[45,-9,3],
  ];
  placements.forEach(([x,z,style],i)=>{const h=createHouse(style,.8+random()*.27);h.position.set(x,2.1,z);h.rotation.y=i%4===0?Math.PI/2:0;g.add(h);});
  // Reusable station-style civic buildings; actual station plots remain empty.
  for(const [x,z] of [[-73,27],[-21,-40],[58,-23]]) {const h=createStationHouse();h.position.set(x,2.1,z);g.add(h);}
  // Port, lighthouse, fishing boat and timber quays.
  box(g,[28,1.3,3.4],[-65,1.4,42],'#aa9873');
  box(g,[3.8,1.3,15],[-70,1.4,48],'#b5a27c');
  for(let x=-78;x<=-52;x+=4)box(g,[.35,3,.35],[x,0,42],'#766d55');
  cylinder(g,1.4,2,8,[-84,5.3,23],'#f1ead4');
  cylinder(g,1.55,1.55,1,[-84,7.3,23],'#b86e4d');
  cylinder(g,1.8,1.8,1.8,[-84,10,23],'#5b7c7a');
  cylinder(g,0,2.2,1.5,[-84,11.7,23],'#646e60');
  const boat=new THREE.Group();
  const hull=new THREE.Mesh(new THREE.CylinderGeometry(1,1,7,5),material('#f3ead4'));hull.rotation.z=Math.PI/2;hull.scale.z=1.7;boat.add(hull);
  box(boat,[2.5,1.7,2],[.1,1,0],'#b67851');box(boat,[.12,6,.12],[0,3,0],'#7b705a');boat.position.set(-62,-.1,51);boat.rotation.y=.2;g.add(boat);
  // Rice paddies beside Aokawa, each divided into planting rows.
  for(let row=0;row<2;row++)for(let col=0;col<3;col++){
    const x=-40+col*9,z=-35-row*9;
    box(g,[8,.24,7],[x,2.15,z],'#d3cba0');box(g,[7.3,.3,6.3],[x,2.2,z],'#93aa76');
    for(let k=-2;k<=2;k++)box(g,[6.7,.25,.14],[x,2.5,z+k*1.1],'#bdc88d');
  }
  // Onsen pool and shrine gate identify Kaede village.
  cylinder(g,5.2,5.6,.8,[81,2.3,-3],'#aaa68a',14);cylinder(g,4.5,4.5,.85,[81,2.4,-3],'#93c1b6',14);
  for(let i=0;i<10;i++){
    const angle=i*Math.PI/5;const rock=new THREE.Mesh(new THREE.IcosahedronGeometry(.8,0),material('#a3a58f'));rock.position.set(81+Math.cos(angle)*5.1,3, -3+Math.sin(angle)*5.1);g.add(rock);
  }
  for(const x of [44,50])box(g,[.55,5.4,.55],[x,4.7,-34],'#b66e4c');
  box(g,[9,.55,1],[47,7.5,-34],'#ad6547');box(g,[7.8,.35,.7],[47,6.3,-34],'#bb7852');
  // Forests with deterministic placement, keeping buildings, river and station plots clear.
  let trees=0;
  for(let i=0;i<650 && trees<185;i++){
    const x=-88+random()*180,z=-58+random()*91;
    const awayTown=TOWNS.every(t=>Math.hypot(x-t.position[0],z-t.position[2])>21);
    const awayStation=STATIONS.every(s=>Math.hypot(x-s.position[0],z-s.position[2])>10);
    const awayRiver=Math.abs(x-(12+Math.sin(z*.1)*5))>10;
    if(!awayTown||!awayStation||!awayRiver||x<-35&&z<-25&&z>-49||x<-65&&z>17)continue;
    const tree=createTree(Math.floor(random()*9),.6+random()*.65);tree.position.set(x,2,z);g.add(tree);trees++;
  }
  // Fine surf strokes are geometry too: no remote textures.
  for(let i=0;i<75;i++){
    const x=-160+random()*310,z=49+random()*105;
    box(g,[2+random()*5,.025,.13],[x,-2.16,z],i%3===0?'#c4d9cd':'#9fc7c1');
  }
  return { scenery: batchStatic(g), trees, sourceModels: placements.length + 3 };
}
