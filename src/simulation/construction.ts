import { operatingGuard, queueLineChange } from './train';
export { deploymentReadiness } from './route';
import { CONFIG } from '../config';
import { STATIONS, type StationId } from '../world/map';
import { type AssetKey, type EdgeId, type NodeId, type Purchase, type ReceiptItem, assetUnlocked, edgeById, edgePrice, findPath, nodeById, STATION_NODES, stationName, validName } from '../world/railway';
import type { WorldState } from '../world/state';
import { transact } from './economy';

export type Command = (
  | { type: 'build-station'; station: StationId }
  | { type: 'build-track'; from: NodeId; to: NodeId }
  | { type: 'remove-station'; station: StationId }
  | { type: 'remove-track'; edge: EdgeId }
  | { type: 'rename-station'; station: StationId; name: string }
  | { type: 'set-stops'; stops: StationId[] }
) & { revision: number };
export type RemovalGuard = (dependencies: { stations: StationId[]; edges: EdgeId[] }) => string | null;
export interface Result { ok: boolean; message: string }
export function previewTrack(world: WorldState, from: string | null, to: string | null) {
  const path = from && to ? findPath(from,to,()=>true) : null;
  const missing = path?.edges.filter(id => !world.railway.tracks[id]) ?? [];
  const cost = missing.reduce((sum,id) => sum+edgePrice(id),0);
  let reason = '';
  if (!from || !to) reason = '请选择起点与终点，或点击地图候选节点。';
  else if (from === to) reason = '起点与终点不能相同。';
  else if (!path) reason = '两点不在同一预设走廊，不能自由铺设轨道。';
  else if (path.edges.some(id => !edgeById(id)!.unlocked)) reason = path.edges.includes('bc-overlook') ? 'C 河谷为可选支线，核心内容完成后再评估。' : 'B—D 预留走廊将在第 7 阶段解锁。';
  else if (!missing.length) reason = '所选走廊已全部建成，不重复扣费。';
  else if (world.economy.balance < cost) reason = `资金不足，还差 ¥ ${(cost-world.economy.balance).toLocaleString('en-US')}。`;
  return { ok: !reason, reason, path, missing, cost };
}
export function describeCommand(world:WorldState,c:Command): { ok:boolean; message:string; amount:number } {
  if (c.revision!==world.railway.revision) return {ok:false,message:'建设状态已变化，请重新预览后确认。',amount:0};
  const r=world.railway;
  let amount=0,message='';
  switch(c.type) {
    case 'build-station': {
      const s=STATIONS.find(s=>s.id===c.station);
      if (!s || !s.unlocked) return {ok:false,message:s?.optional?'C 河谷为可选站，本阶段尚未开放。':'D 枫泉站将在第 7 阶段解锁。',amount:0};
      if (r.stations[c.station]) return {ok:false,message:'车站已建成，不重复扣费。',amount:0};
      amount=-CONFIG.stationCosts[c.station];message=`建设${s.name}，保留 ${s.berths} 个泊位。`;break;
    }
    case 'build-track': {
      const p=previewTrack(world,c.from,c.to);
      if (!p.ok) return {ok:false,message:p.reason,amount:0};
      amount=-p.cost;message=`沿${nodeById(c.from)!.name} → ${nodeById(c.to)!.name}建设 ${p.missing.length} 段轨道，所选路径 ${p.path!.length.toFixed(1)} 米；已建段不重复计费。`;break;
    }
    case 'remove-station':
    case 'remove-track': {
      const asset=c.type==='remove-station'?r.stations[c.station]:r.tracks[c.edge];
      if (!asset) return {ok:false,message:'该资产已不存在，不重复退款。',amount:0};
      const blocked=operatingGuard(world,c.type==='remove-station'?{stations:[c.station],edges:[]}:{stations:[],edges:[c.edge]});
      if(blocked)return {ok:false,message:blocked,amount:0};
      amount=Math.floor(asset.paid*CONFIG.demolitionRefund);
      message=c.type==='remove-station'?`拆除${stationName(r,c.station)}，保留周围轨道；依赖此站的线路将失效。`:`拆除${edgeById(c.edge)!.name}；依赖它的线路将失效，不可投车。`;break;
    }
    case 'rename-station':
      if (!r.stations[c.station]) return {ok:false,message:'请先建成车站再改名。',amount:0};
      if (!validName(c.name)) return {ok:false,message:'站名须为 1–16 个字符，不能包含控制符或尖括号。',amount:0};
      message='站名已更新。';break;
    case 'set-stops':
      if (c.stops.length<2 || c.stops.length>4 || new Set(c.stops).size!==c.stops.length || c.stops.some(id=>!STATIONS.find(s=>s.id===id)?.unlocked)) return {ok:false,message:'请选择至少两个不同且已解锁的停站；D/C 暂未开放。',amount:0};
      message='停站顺序已保存，路径按已建轨道重新计算。';break;
  }
  if (world.economy.balance+amount<0) return {ok:false,message:'资金不足，资产与余额未更改。',amount:0};
  return {ok:true,message,amount};
}
// Synchronous command boundary: all validation precedes the only financial mutation.
// Future train allocation must consult deploymentReadiness and pass an occupancy guard here.
export function executeCommand(world:WorldState,c:Command,guard:RemovalGuard=()=>null):Result {
  const description=describeCommand(world,c);
  if (!description.ok) return description;
  const r=world.railway;
  if (c.type==='build-station' || c.type==='build-track') {
    const purchaseId=`rail:build:${r.nextSerial}`;
    const items:ReceiptItem[]=c.type==='build-station'?[{key:`station:${c.station}`,paid:-description.amount}]:previewTrack(world,c.from,c.to).missing.map(id=>({key:`track:${id}`,paid:edgePrice(id)}));
    if (!transact(world,purchaseId,description.amount,description.message,{kind:'build',items})) return {ok:false,message:'交易未完成，请重新预览。'};
    const purchase=(item:ReceiptItem):Purchase=>({purchaseId,paid:item.paid,builtAtTick:world.clock.tick});
    for (const item of items) {
      if (item.key.startsWith('station:')) { const id=item.key.slice(8) as StationId;r.stations[id]={...purchase(item),name:STATIONS.find(s=>s.id===id)!.name}; }
      else r.tracks[item.key.slice(6) as EdgeId]=purchase(item);
    }
    r.nextSerial++;
  } else if (c.type==='remove-station' || c.type==='remove-track') {
    const dependencies=c.type==='remove-station'?{stations:[c.station],edges:[]}:{stations:[],edges:[c.edge]};
    const blocked=guard(dependencies);
    if (blocked) return {ok:false,message:blocked};
    const key:AssetKey=c.type==='remove-station'?`station:${c.station}`:`track:${c.edge}`;
    const asset=c.type==='remove-station'?r.stations[c.station]!:r.tracks[c.edge]!;
    if (!transact(world,`rail:remove:${asset.purchaseId}:${key}`,description.amount,description.message,{kind:'remove',key,purchaseId:asset.purchaseId})) return {ok:false,message:'该拆除已处理，不重复退款。'};
    if (c.type==='remove-station') delete r.stations[c.station];else delete r.tracks[c.edge];
  } else if (c.type==='rename-station') r.stations[c.station]!.name=c.name.trim();
  else { r.line.stops=[...c.stops];queueLineChange(world,c.stops); }
  r.revision++;
  return {ok:true,message:description.message};
}
