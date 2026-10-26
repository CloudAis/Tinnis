import { CONFIG } from '../config';
import { CANDIDATE_NODES, STATIONS, type Point, type StationId } from './map';

export const NODES = [
  ...CANDIDATE_NODES.map((n, i) => ({ ...n, name: ['A · 汐港', '海岸节点', '谷口节点', 'B · 青溪', '河畔节点', '林间节点', 'D · 枫泉'][i] })),
  { id: 'node-c', position: STATIONS[3].position, name: 'C · 河谷（可选）' },
] as const;
export type NodeId = typeof NODES[number]['id'];
export const STATION_NODES: Record<StationId, NodeId> = { A: 'node-a', B: 'node-b', D: 'node-d', C: 'node-c' };
export const EDGES = [
  { id: 'ab-coast', from: 'node-a', to: 'node-coast', name: '汐港海岸段', corridor: 'AB', share: 46 / 120, unlocked: true },
  { id: 'ab-valley', from: 'node-coast', to: 'node-valley', name: '谷口沿线段', corridor: 'AB', share: 40 / 120, unlocked: true },
  { id: 'ab-town', from: 'node-valley', to: 'node-b', name: '青溪进站段', corridor: 'AB', share: 34 / 120, unlocked: true },
  { id: 'bd-river', from: 'node-b', to: 'node-river', name: '河畔预留段', corridor: 'BD', share: 27 / 80, unlocked: false },
  { id: 'bd-forest', from: 'node-river', to: 'node-forest', name: '林间预留段', corridor: 'BD', share: 25 / 80, unlocked: false },
  { id: 'bd-onsen', from: 'node-forest', to: 'node-d', name: '枫泉预留段', corridor: 'BD', share: 28 / 80, unlocked: false },
  { id: 'bc-overlook', from: 'node-river', to: 'node-c', name: '河谷可选段', corridor: 'BC', share: 1, unlocked: false },
] as const;
export type EdgeId = typeof EDGES[number]['id'];
export type AssetKey = `station:${StationId}` | `track:${EdgeId}`;
export interface ReceiptItem { key: AssetKey; paid: number }
export type ConstructionReceipt = { kind: 'build'; items: ReceiptItem[] } | { kind: 'remove'; key: AssetKey; purchaseId: string };
export interface Purchase { purchaseId: string; paid: number; builtAtTick: number }
export interface BuiltStation extends Purchase { name: string }
export interface RailwayState {
  revision: number;
  nextSerial: number;
  stations: Partial<Record<StationId, BuiltStation>>;
  tracks: Partial<Record<EdgeId, Purchase>>;
  line: { id: 'line-main'; name: string; stops: StationId[] };
}
export interface EditorState { mode: 'inspect' | 'track' | 'line' | 'train'; from: NodeId | null; to: NodeId | null }
export const newEditor = (): EditorState => ({ mode: 'inspect', from: null, to: null });
export const newRailway = (): RailwayState => ({ revision: 0, nextSerial: 1, stations: {}, tracks: {}, line: { id: 'line-main', name: '海风线', stops: ['A', 'B'] } });
export const nodeById = (id: string) => NODES.find(n => n.id === id);
export const edgeById = (id: string) => EDGES.find(e => e.id === id);
export const edgePrice = (id: EdgeId) => { const e = edgeById(id)!; return Math.round(CONFIG.trackCosts[e.corridor] * e.share); };
export const edgePoints = (id: EdgeId): readonly Point[] => { const e = edgeById(id)!; return [nodeById(e.from)!.position, nodeById(e.to)!.position]; };
export const edgeLength = (id: EdgeId) => { const [a,b] = edgePoints(id); return Math.hypot(...a.map((n,i) => n-b[i])); };
export function assetExists(key: string): key is AssetKey {
  return STATIONS.some(s => `station:${s.id}` === key) || EDGES.some(e => `track:${e.id}` === key);
}
export function assetUnlocked(key: AssetKey) {
  return key.startsWith('station:') ? STATIONS.find(s => s.id === key.slice(8))!.unlocked : edgeById(key.slice(6))!.unlocked;
}
export function stationName(r: RailwayState, id: StationId) { return r.stations[id]?.name ?? STATIONS.find(s => s.id === id)!.name; }
export function validName(raw: string) {
  const name = raw.trim();
  return name.length >= 1 && [...name].length <= 16 && !/[\u0000-\u001f\u007f<>]/u.test(name);
}
export function nearestNode(point: Point, radius = 7): NodeId | null {
  const candidates = NODES.map(n => ({ id: n.id, distance: Math.hypot(n.position[0]-point[0], n.position[2]-point[2]) })).sort((a,b) => a.distance-b.distance);
  return candidates[0].distance <= radius ? candidates[0].id : null;
}
// The renderer, construction preview and later train movement all consume this same graph.
export function findPath(from: string, to: string, accept: (id: EdgeId) => boolean): { nodes: NodeId[]; edges: EdgeId[]; points: Point[]; length: number } | null {
  if (!nodeById(from) || !nodeById(to)) return null;
  const queue: { node: NodeId; nodes: NodeId[]; edges: EdgeId[]; length: number }[] = [{ node: from as NodeId, nodes: [from as NodeId], edges: [], length: 0 }];
  const visited = new Set<string>();
  while (queue.length) {
    queue.sort((a,b) => a.length-b.length);
    const current = queue.shift()!;
    if (visited.has(current.node)) continue;
    visited.add(current.node);
    if (current.node === to) return { ...current, points: current.nodes.map(id => nodeById(id)!.position) };
    for (const e of EDGES) {
      if (!accept(e.id) || e.from !== current.node && e.to !== current.node) continue;
      const next = e.from === current.node ? e.to : e.from;
      if (!visited.has(next)) queue.push({ node: next, nodes: [...current.nodes, next], edges: [...current.edges,e.id], length: current.length+edgeLength(e.id) });
    }
  }
  return null;
}
