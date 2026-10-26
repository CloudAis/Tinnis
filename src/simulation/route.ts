import type { WorldState } from '../world/state';
import { STATION_NODES, stationName, findPath, nodeById, type NodeId, type EdgeId } from '../world/railway';
export function deploymentReadiness(world: WorldState) {
  const r=world.railway;
  const stops=r.line.stops;
  const fail=(reason:string) => ({ ok:false, reason, nodes:[] as NodeId[], edges:[] as EdgeId[], points:[] as (readonly [number,number,number])[], length:0 });
  if (stops.length<2 || new Set(stops).size!==stops.length) return fail('至少需要两个不同的停靠站，暂不可投车。');
  for (const id of stops) if (!r.stations[id]) return fail(`${stationName(r,id)}尚未建成，暂不可投车。`);
  const nodes:NodeId[]=[],edges:EdgeId[]=[];
  let length=0;
  for (let i=1;i<stops.length;i++) {
    const path=findPath(STATION_NODES[stops[i-1]],STATION_NODES[stops[i]],id=>!!r.tracks[id]);
    if (!path) return fail(`${stationName(r,stops[i-1])}—${stationName(r,stops[i])}轨道断开，暂不可投车。`);
    nodes.push(...(i===1 ? path.nodes : path.nodes.slice(1)));edges.push(...path.edges);length+=path.length;
  }
  // Positions come directly from the same edge/node geometry used by rendering.
  return { ok:true, reason:'线路已连通，可以投放列车。', nodes, edges, points:nodes.map(id=>nodeById(id)!.position), length };
}
