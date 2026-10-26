import type { WorldState } from '../world/state';
import { STATION_NODES, stationName, findPath, pathPoints, nodeById, type NodeId, type EdgeId } from '../world/railway';
export function deploymentReadiness(world: WorldState,stops=world.railway.line.stops) {
  const r=world.railway;

  const fail=(reason:string) => ({ ok:false, reason, nodes:[] as NodeId[], edges:[] as EdgeId[], points:[] as (readonly [number,number,number])[], length:0 });
  if (stops.length<2 || new Set(stops).size!==stops.length) return fail('至少需要两个不同的停靠站，暂不可投车。');
  for (const id of stops) if (!r.stations[id]) return fail(`${stationName(r,id)}尚未建成，暂不可投车。`);
  const nodes:NodeId[]=[],edges:EdgeId[]=[];
  let length=0;
  for (let i=1;i<stops.length;i++) {
    const path=findPath(STATION_NODES[stops[i-1]],STATION_NODES[stops[i]],id=>!!r.tracks[id]);
    if (!path) return fail(`${stationName(r,stops[i-1])}—${stationName(r,stops[i])}轨道断开，暂不可投车。`);
    if(path.nodes.slice(1,-1).some(n=>Object.entries(STATION_NODES).some(([id,node])=>node===n&&r.stations[id as keyof typeof STATION_NODES])))return fail('必须停靠途经车站，不能跳过青溪申请跨越区段。');
    nodes.push(...(i===1 ? path.nodes : path.nodes.slice(1)));edges.push(...path.edges);length+=path.length;
  }
  if(new Set(nodes).size!==nodes.length)return fail('停站顺序不能折回或重复经过区段。');
  // Positions come directly from the same edge/node geometry used by rendering.
  return { ok:true, reason:'线路已连通，可以投放列车。', nodes, edges, points:pathPoints(nodes,edges), length };
}
