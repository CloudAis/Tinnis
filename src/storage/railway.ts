import { CONFIG } from '../config';
import { STATIONS, type StationId } from '../world/map';
import { assetExists, assetUnlocked, newRailway, validName, type AssetKey, type ConstructionReceipt, type EdgeId, type Purchase, type RailwayState } from '../world/railway';
import type { LedgerEntry } from '../world/state';
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const int=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>=0;
function invalid():never { throw new Error('铁路存档、购建凭据或退款记录不一致，当前世界未更改。'); }

// Replay receipt allocation, including sold assets. Historical prices are never replaced by new config prices.
export function validateRailway(raw:unknown,ledger:LedgerEntry[]):RailwayState {
  if (!record(raw)||!int(raw.revision)||raw.revision>1e9||!int(raw.nextSerial)||!record(raw.stations)||!record(raw.tracks)||!record(raw.line)) return invalid();
  const active=new Map<AssetKey,Purchase>();
  let serial=1,mutations=0;
  for (const entry of ledger) {
    const receipt=entry.construction;
    if (!receipt) { if (entry.id.startsWith('rail:')) return invalid();continue; }
    if (!record(receipt)) return invalid();
    if (receipt.kind==='build') {
      if (entry.id!==`rail:build:${serial}`||!Array.isArray(receipt.items)||!receipt.items.length||receipt.items.length>11) return invalid();
      const seen=new Set<string>();let total=0;
      for (const item of receipt.items) {
        if (!record(item)||!assetExists(item.key)||!assetUnlocked(item.key)||!int(item.paid)||item.paid<=0||active.has(item.key)||seen.has(item.key)) return invalid();
        seen.add(item.key);total+=item.paid;
        active.set(item.key,{purchaseId:entry.id,paid:item.paid,builtAtTick:entry.tick});
      }
      if (!Number.isSafeInteger(total)||entry.amount!==-total) return invalid();
      serial++;
    } else if (receipt.kind==='remove') {
      if (!assetExists(receipt.key)) return invalid();
      const previous=active.get(receipt.key);
      if (!previous||previous.purchaseId!==receipt.purchaseId||entry.id!==`rail:remove:${previous.purchaseId}:${receipt.key}`||entry.amount!==Math.floor(previous.paid*CONFIG.demolitionRefund)) return invalid();
      active.delete(receipt.key);
    } else return invalid();
    mutations++;
  }
  if (raw.nextSerial!==serial||raw.revision<mutations) return invalid();
  const result=newRailway();result.nextSerial=serial;result.revision=raw.revision;
  for (const [kind,entries] of [['station',raw.stations],['track',raw.tracks]] as const) {
    for (const [id,a] of Object.entries(entries)) {
      const key=`${kind}:${id}`;
      if (!assetExists(key)||!record(a)) return invalid();
      const expected=active.get(key);
      if (!expected||a.purchaseId!==expected.purchaseId||a.paid!==expected.paid||a.builtAtTick!==expected.builtAtTick) return invalid();
      if (kind==='station') {
        if (typeof a.name!=='string'||!validName(a.name)||a.name!==a.name.trim()) return invalid();
        result.stations[id as StationId]={...expected,name:a.name};
      } else result.tracks[id as EdgeId]={...expected};
      active.delete(key);
    }
  }
  if (active.size) return invalid();
  const line=raw.line;
  if (line.id!=='line-main'||typeof line.name!=='string'||!validName(line.name)||!Array.isArray(line.stops)||line.stops.length<2||line.stops.length>4||new Set(line.stops).size!==line.stops.length||line.stops.some((id:unknown)=>!STATIONS.find(s=>s.id===id)?.unlocked)) return invalid();
  result.line={id:'line-main',name:line.name,stops:[...line.stops]};
  return result;
}
export function copyReceipt(raw:unknown):ConstructionReceipt|undefined {
  if (raw===undefined) return undefined;
  if (!record(raw)) return invalid();
  if (raw.kind==='build'&&Array.isArray(raw.items)) return {kind:'build',items:raw.items.map((i:any)=>{
    if(!record(i)) return invalid();return {key:i.key,paid:i.paid};
  })};
  if (raw.kind==='remove') return {kind:'remove',key:raw.key,purchaseId:raw.purchaseId};
  return invalid();
}
