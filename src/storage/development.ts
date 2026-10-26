import { CONFIG } from '../config';
import { STATIONS,TOWNS,type StationId } from '../world/map';
import { UPGRADE_KINDS,newDevelopment,type DevelopmentState,type UpgradeReceipt,type UpgradeAsset,type UpgradeKind } from '../world/development';
import type { WorldState,LedgerEntry } from '../world/state';
import { canUnlockD } from '../simulation/development';
const rec=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v),num=(v:any)=>typeof v==='number'&&Number.isFinite(v),int=(v:any)=>Number.isSafeInteger(v)&&v>=0;
function bad():never{throw new Error('升级、聚落成长或支线解锁存档不一致，当前世界未更改。');}
export function copyUpgrade(r:any):UpgradeReceipt|undefined{if(r===undefined)return;if(!rec(r)||!STATIONS.some(s=>s.id===r.station)||!UPGRADE_KINDS.includes(r.upgrade))return bad();if(r.kind==='build')return {kind:'build',station:r.station,upgrade:r.upgrade,stationPurchaseId:r.stationPurchaseId,paid:r.paid};if(r.kind==='remove')return {kind:'remove',station:r.station,upgrade:r.upgrade,purchaseId:r.purchaseId};return bad();}
export function validateUpgrades(raw:any,w:WorldState):DevelopmentState['upgrades']{
 if(!rec(raw))return bad();const stations=new Map<string,string>(),active=new Map<string,UpgradeAsset>();let serial=1,mutations=0;
 for(const e of w.economy.ledger){const c=e.construction;if(c?.kind==='build')for(const i of c.items)if(i.key.startsWith('station:'))stations.set(i.key.slice(8),e.id);if(c?.kind==='remove'&&c.key.startsWith('station:')){if([...active.keys()].some(k=>k.startsWith(c.key.slice(8)+':')))return bad();stations.delete(c.key.slice(8));}
  const r=e.upgrade;if(!r){if(e.id.startsWith('upgrade:'))return bad();continue;}const key=`${r.station}:${r.upgrade}`;
  if(r.kind==='build'){if(e.id!==`upgrade:buy:${serial}`||active.has(key)||!int(r.paid)||r.paid<1||e.amount!==-r.paid||e.posting?.category!=='upgrade'||stations.get(r.station)!==r.stationPurchaseId)return bad();active.set(key,{id:e.id,paid:r.paid,builtAtTick:e.tick,stationPurchaseId:r.stationPurchaseId});serial++;}
  else {const a=active.get(key);if(!a||r.purchaseId!==a.id||e.id!==`upgrade:remove:${a.id}`||e.amount!==Math.floor(a.paid*.5))return bad();active.delete(key);}mutations++;
 }
 if(w.development.nextSerial!==serial||w.development.revision<mutations)return bad();
 const result:DevelopmentState['upgrades']={};for(const [id,assets] of Object.entries(raw)){if(!STATIONS.some(s=>s.id===id)||!rec(assets)||!Object.keys(assets as object).length)return bad();for(const [kind,a] of Object.entries(assets as object)){const key=`${id}:${kind}`,expected=active.get(key);if(!UPGRADE_KINDS.includes(kind as UpgradeKind)||!rec(a)||!expected||Object.keys(expected).some(k=>(a as any)[k]!==expected[k as keyof UpgradeAsset]))return bad();(result[id as StationId]??={})[kind as UpgradeKind]=expected;active.delete(key);}}
 if(active.size)return bad();return result;
}
export function validateDevelopment(raw:any,w:WorldState):DevelopmentState{
 if(!rec(raw)||!int(raw.revision)||!int(raw.nextSerial)||!num(raw.lastMinute)||raw.lastMinute<480||raw.lastMinute>w.clock.minutes+1e-6||!int(raw.lastEvent)||raw.lastEvent!==w.passengers.completed.length||typeof raw.unlockedD!=='boolean'||raw.unlockedD&&(!num(raw.unlockedAt)||raw.unlockedAt<480||raw.unlockedAt>w.clock.minutes+1e-6)||!raw.unlockedD&&raw.unlockedAt!==null||!rec(raw.towns)||Object.keys(raw.towns).length!==TOWNS.length)return bad();
 const g=newDevelopment(raw.lastMinute);Object.assign(g,{revision:raw.revision,nextSerial:raw.nextSerial,lastEvent:raw.lastEvent,unlockedD:raw.unlockedD,unlockedAt:raw.unlockedAt});
 if(g.unlockedD&&!canUnlockD(w,raw.unlockedAt))return bad();
 for(const {id} of TOWNS){const t=raw.towns[id],level=w.towns[id].level;if(!rec(t)||!num(t.progress)||t.progress<0||t.progress>(level===3?0:CONFIG.growth.thresholds[level-1])+1e-6||!num(t.lastGrowth)||t.lastGrowth<480||t.lastGrowth>w.clock.minutes+1e-6||!int(t.delivered)||!num(t.windowMinutes)||t.windowMinutes<0||t.windowMinutes>60.000001||!num(t.serviceMinutes)||t.serviceMinutes<0||t.serviceMinutes>t.windowMinutes+1e-6||!num(t.waitExposure)||t.waitExposure<0||t.waitExposure>t.windowMinutes+1e-6||!int(t.windowDelivered)||t.windowDelivered>t.delivered||typeof t.reason!=='string'||t.reason.length>100)return bad();g.towns[id]={progress:t.progress,lastGrowth:t.lastGrowth,delivered:t.delivered,windowMinutes:t.windowMinutes,serviceMinutes:t.serviceMinutes,waitExposure:t.waitExposure,windowDelivered:t.windowDelivered,reason:t.reason};}
 const completions=new Map(w.passengers.completed.map(e=>[`rent:${e.eventId}`,e]));for(const e of w.economy.ledger)if(e.posting?.category==='rent'){const c=completions.get(e.id);if(!c||e.amount!==c.count*CONFIG.upgrades.shops.rentPerPassenger)return bad();}
 w.development=g;g.upgrades=validateUpgrades(raw.upgrades,w);return g;
}
