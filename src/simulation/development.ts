import { CONFIG } from '../config';
import { STATIONS,type StationId } from '../world/map';
import { allTrains } from '../world/fleet';
import { UPGRADE_KINDS,type UpgradeKind } from '../world/development';
import type { WorldState } from '../world/state';
import { transact } from './economy';
export function stationUnlocked(w:Pick<WorldState,'development'>,id:StationId){return id==='A'||id==='B'||id==='D'&&w.development.unlockedD;}
export const patience=(w:WorldState,id:StationId)=>CONFIG.patienceMinutes+(w.development.upgrades[id]?.shelter?CONFIG.upgrades.shelter.patienceBonus:0);
export const dwellMinutes=(w:WorldState,id:StationId)=>w.development.upgrades[id]?.service?CONFIG.upgrades.service.dwellMinutes:CONFIG.journey.dwellMinutes;
export const served=(w:WorldState,id:StationId)=>allTrains(w.fleet).some(v=>v.route?.stops.includes(id)&&!v.stopRequested&&!['stopped','depot'].includes(v.status));
export function canUnlockD(w:WorldState,until=w.clock.minutes){return w.passengers.completed.reduce((n,e)=>n+(e.completedAt<=until+1e-6?e.count:0),0)>=CONFIG.growth.unlockPassengers&&w.finance.days.some(d=>d.simulatedMinutes>=1440-1e-6&&d.net>0&&(d.day+1)*1440<=until+1e-6);}
export interface UpgradeCommand {station:StationId;kind:UpgradeKind;remove?:boolean;revision:number}
export function describeUpgrade(w:WorldState,c:UpgradeCommand){
 const fail=(message:string)=>({ok:false,message,amount:0});
 if(c.revision!==w.development.revision||!UPGRADE_KINDS.includes(c.kind))return fail('升级状态已变化，请重新操作。');
 if(!w.railway.stations[c.station])return fail('先建设车站，再改善站区。');
 const asset=w.development.upgrades[c.station]?.[c.kind],config=CONFIG.upgrades[c.kind];
 if(c.remove)return asset?{ok:true,message:`拆除${config.name}，效果停止，退原价 50%。`,amount:Math.floor(asset.paid*.5)}:fail('该升级不存在，不重复退款。');
 if(asset)return fail('该一级升级已建成，不重复扣费或叠加效果。');
 if(w.economy.balance<config.cost)return fail('升级资金不足。');
 return {ok:true,message:`建设${config.name}：${config.effect}；维护 ¥${config.maintenance}/日。`,amount:-config.cost};
}
export function executeUpgrade(w:WorldState,c:UpgradeCommand){
 const d=describeUpgrade(w,c);if(!d.ok)return d;const g=w.development,upgrades=g.upgrades[c.station]??={};
 if(c.remove){const a=upgrades[c.kind]!;if(!transact(w,`upgrade:remove:${a.id}`,d.amount,d.message,undefined,undefined,{category:'asset-sale',day:Math.floor((w.clock.minutes+1e-7)/1440)}, {kind:'remove',station:c.station,upgrade:c.kind,purchaseId:a.id}))return {ok:false,message:'拆除已结算。'};delete upgrades[c.kind];}
 else {const id=`upgrade:buy:${g.nextSerial}`,stationPurchaseId=w.railway.stations[c.station]!.purchaseId;if(!transact(w,id,d.amount,d.message,undefined,undefined,{category:'upgrade',day:Math.floor((w.clock.minutes+1e-7)/1440)}, {kind:'build',station:c.station,upgrade:c.kind,stationPurchaseId,paid:-d.amount}))return {ok:false,message:'升级交易未完成。'};upgrades[c.kind]={id,paid:-d.amount,builtAtTick:w.clock.tick,stationPurchaseId};g.nextSerial++;}
 if(c.kind==='service'&&!c.remove)for(const v of allTrains(w.fleet))if(v.currentStation===c.station)v.dwellRemaining=Math.min(v.dwellRemaining,CONFIG.upgrades.service.dwellMinutes);
 if(c.kind==='shelter'&&c.remove)w.passengers.waiting=w.passengers.waiting.filter(b=>{if(w.clock.minutes-b.arrivedAt>=patience(w,b.from)-1e-7){w.passengers.totals.abandoned+=b.count;return false;}return true;});
 if(!Object.keys(upgrades).length)delete g.upgrades[c.station];g.revision++;return d;
}
export function stepDevelopment(w:WorldState){
 const g=w.development,now=w.clock.minutes,elapsed=now-g.lastMinute;if(elapsed<=1e-8)return;
 while(g.lastEvent<w.passengers.completed.length){const e=w.passengers.completed[g.lastEvent++],station=STATIONS.find(s=>s.id===e.to)!;if(station.townId){g.towns[station.townId].delivered+=e.count;g.towns[station.townId].windowDelivered+=e.count;}
  if(g.upgrades[e.to]?.shops)transact(w,`rent:${e.eventId}`,e.count*CONFIG.upgrades.shops.rentPerPassenger,'商店按到达客流租金',undefined,undefined,{category:'rent',day:Math.floor((now+1e-7)/1440),operating:true});
 }
 for(const station of STATIONS){if(!station.townId)continue;const t=g.towns[station.townId],active=served(w,station.id),queue=w.passengers.waiting.filter(b=>b.from===station.id),count=queue.reduce((n,b)=>n+b.count,0);const pressure=count?queue.reduce((n,b)=>n+b.count*Math.min(1,(now-b.arrivedAt)/patience(w,station.id)),0)/count:0;
  t.windowMinutes+=elapsed;if(active)t.serviceMinutes+=elapsed;t.waitExposure+=pressure*elapsed;
  if(!active)t.reason='无直达服务，成长暂停';
  if(t.windowMinutes>=60-1e-7){const coverage=t.serviceMinutes/t.windowMinutes,waiting=t.waitExposure/t.windowMinutes,level=w.towns[station.townId].level;
    if(level===3){t.progress=0;t.reason='已达三级规模上限';}
    else if(coverage<.8)t.reason='本时段服务不稳定，成长暂停';
    else if(waiting>.75)t.reason='候车时间过长，改善班次与容量后成长';
    else if(t.windowDelivered<CONFIG.growth.minimumHourlyArrivals)t.reason='本时段到达运量不足，等待旅客';
    else {const threshold=CONFIG.growth.thresholds[level-1];t.progress=Math.min(threshold,t.progress+t.windowDelivered*(1-waiting*.5));t.reason=`稳定送达 ${t.windowDelivered} 人，积累发展进度`;if(t.progress>=threshold&&now-t.lastGrowth>=CONFIG.growth.cooldownMinutes-1e-7){w.towns[station.townId].level=(level+1) as 2|3;t.progress=0;t.lastGrowth=now;t.reason='聚落升级，新增住宅与商业需求';g.revision++;}}
    t.windowMinutes=0;t.serviceMinutes=0;t.waitExposure=0;t.windowDelivered=0;
  }
 }
 g.lastMinute=now;if(!g.unlockedD&&canUnlockD(w)){g.unlockedD=true;g.unlockedAt=now;g.revision++;}
}
