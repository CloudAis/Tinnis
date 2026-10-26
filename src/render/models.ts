import { COLOR_ALIASES } from './style';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const materials = new Map<string, THREE.MeshLambertMaterial>();
const boxes = new Map<string, THREE.BoxGeometry>();
export function material(color: string) {
  color=COLOR_ALIASES[color]??color;
  if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  return materials.get(color)!;
}
export function box(parent: THREE.Group, size: number[], pos: number[], color: string) {
  const key = size.join(',');
  if (!boxes.has(key)) boxes.set(key, new THREE.BoxGeometry(size[0], size[1], size[2]));
  const mesh = new THREE.Mesh(boxes.get(key), material(color));
  mesh.position.set(pos[0], pos[1], pos[2]); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
export function cylinder(parent: THREE.Group, top: number, bottom: number, height: number, pos: number[], color: string, segments = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), material(color));
  m.position.set(pos[0], pos[1], pos[2]); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function roof(width: number, depth: number, height: number, color: string) {
  const a = width / 2, b = depth / 2;
  const verts = [-a,0,-b, a,0,-b, 0,height,-b, -a,0,b, a,0,b, 0,height,b];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex([0,2,1,3,4,5,0,3,5,0,5,2,1,2,5,1,5,4,0,1,4,0,4,3]); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material(color)); mesh.castShadow = true; return mesh;
}
export function createHouse(style = 0, scale = 1) {
  const g = new THREE.Group();
  const colors = ['#eee2c8', '#d9c3a1', '#f2e8d4', '#c9d1be'];
  const roofs = ['#697b79', '#a1634a', '#66746d', '#a58d6b'];
  const height = style % 3 === 0 ? 5.2 : 3.3;
  box(g, [5.8, 0.4, 5.1], [0, .2, 0], '#bab59b');
  box(g, [5.1, height, 4.5], [0, height / 2 + .4, 0], colors[style % 4]);
  const r = roof(6.5, 5.6, 2.1, roofs[style % 4]); r.position.y = height + .4; g.add(r);
  box(g, [1.0, 2.1, .14], [0, 1.45, 2.3], '#6a6c5d');
  for (const x of [-1.65, 1.65]) {
    box(g, [1.1, 1.1, .16], [x, 2.2, 2.3], '#526f6e');
    box(g, [.09, 1.1, .19], [x, 2.2, 2.32], '#ddd0b4');
    if (height > 4) box(g, [1.2, 1.1, .16], [x, 4.45, 2.3], '#526f6e');
  }
  box(g, [.16, 1.1, 1.1], [2.6, 2.2, 0], '#526f6e');
  if (style % 2 === 0) {
    box(g, [4.8, .25, 1.2], [0, 2.9, 2.8], '#b17b56');
    box(g, [.16, 2.6, .16], [-2.15, 1.5, 3.15], '#8b7e64');
    box(g, [.16, 2.6, .16], [2.15, 1.5, 3.15], '#8b7e64');
  }
  g.scale.setScalar(scale); return g;
}
export function createStationHouse() {
  const g = createHouse(2, 1.25);
  box(g, [8.2, .35, 2.8], [0, .25, 4], '#d4c6a6');
  box(g, [8.7, .2, 2.4], [0, 3.2, 3.8], '#69827c');
  for (const x of [-3.8, 3.8]) box(g, [.2, 3, .2], [x, 1.7, 4.6], '#776e57');
  return g;
}
export function createTree(style = 0, scale = 1) {
  const g = new THREE.Group();
  cylinder(g, .28, .4, 3, [0, 1.5, 0], '#8d785c', 5);
  if (style % 4 === 0) {
    cylinder(g, 0, 2.1, 5, [0, 4.7, 0], '#58816b', 7);
    cylinder(g, 0, 1.7, 4, [0, 6.4, 0], '#739478', 7);
  } else {
    const palette = ['#7b9b70', '#86a67a', '#a4b37d', '#c18758', '#c8a268'];
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2.7, 0), material(palette[style % palette.length]));
    m.position.y = 4.6; m.scale.set(1, 1.25, 1); m.castShadow = true; g.add(m);
  }
  g.scale.setScalar(scale); return g;
}
// Bake static decorations by material: hundreds of reusable models, a few dozen draw calls.
export function batchStatic(source: THREE.Group) {
  source.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const originals = new Set<THREE.BufferGeometry>();
  source.traverse(o => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
    // Shared flat colors can combine custom roofs (no UV) and cached boxes (with UV).
    if(o.material instanceof THREE.MeshLambertMaterial&&!o.material.map)geometry.deleteAttribute('uv');
    const list = groups.get(o.material) ?? []; list.push(geometry.index ? geometry.toNonIndexed() : geometry);
    if (geometry.index) geometry.dispose(); originals.add(o.geometry); groups.set(o.material, list);
  });
  const result = new THREE.Group(); result.name = 'static-scenery';
  for (const [mat, geometries] of groups) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    if (geometry) { const mesh = new THREE.Mesh(geometry, mat); mesh.castShadow = true; mesh.receiveShadow = true; result.add(mesh); }
  }
  // Do not dispose shared cached boxes; reused by later-stage model previews.
  for (const geo of originals) if (![...boxes.values()].includes(geo as THREE.BoxGeometry)) geo.dispose();
  return result;
}
