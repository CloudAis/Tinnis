import { CONFIG } from '../config';
import { STATIONS, type StationId } from '../world/map';
import { DEMAND_PAIRS, newPassengers, passengerStats, type PassengerState, type WaitingBatch, type RidingBatch, type CompletionEvent } from '../world/passengers';
import type { WorldState } from '../world/state';
const rec=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>=0;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const station=(id:unknown):id is StationId=>STATIONS.some(s=>s.id===id&&s.unlocked);
function bad():never {throw new Error('乘客存档、排队时间、容量或行程统计不一致，当前世界未更改。');}
export function validatePassengers(raw:unknown,w:WorldState):PassengerState {
  if(!rec(raw)||!integer(raw.nextBatchSerial)||raw.nextBatchSerial<1||!integer(raw.nextRideSerial)||raw.nextRideSerial<1||raw.lastDemandMinute!==Math.floor(w.clock.minutes+1e-7)||!rec(raw.carry)||!rec(raw.totals))return bad();
  const p=newPassengers(w.clock.minutes);p.nextBatchSerial=raw.nextBatchSerial;p.nextRideSerial=raw.nextRideSerial;
  if(Object.keys(raw.carry).sort().join()!==Object.keys(p.carry).sort().join())return bad();
  for(const key of Object.keys(p.carry)){if(!finite(raw.carry[key])||raw.carry[key]<0||raw.carry[key]>=1+1e-7)return bad();p.carry[key]=raw.carry[key];}
  for(const key of Object.keys(p.totals) as (keyof PassengerState['totals'])[]){if(!integer(raw.totals[key]))return bad();p.totals[key]=raw.totals[key];}
  const rides=new Set<string>(),waits=new Set<string>(),origins=new Map<string,string>();
  const vehicles=new Map(w.economy.ledger.flatMap(e=>e.vehicle?.kind==='buy'?[[e.vehicle.vehicleId,e.vehicle.type] as const]:[]));
  function batch(b:any):WaitingBatch {
    if(!rec(b)||typeof b.id!=='string'||!/^batch-[1-9]\d*$/.test(b.id)||!integer(Number(b.id.slice(6)))||Number(b.id.slice(6))>=p.nextBatchSerial||!station(b.from)||!station(b.to)||b.from===b.to||!finite(b.arrivedAt)||b.arrivedAt<CONFIG.clock.startMinutes||b.arrivedAt>w.clock.minutes+1e-6||!integer(b.count)||b.count<1)return bad();
    const origin=JSON.stringify([b.from,b.to,b.arrivedAt]);if(origins.has(b.id)&&origins.get(b.id)!==origin)return bad();origins.set(b.id,origin);
    return {id:b.id,from:b.from,to:b.to,arrivedAt:b.arrivedAt,count:b.count};
  }
  function rider(b:any):RidingBatch {
    const base=batch(b),type=vehicles.get(b.vehicleId);
    if(typeof b.rideId!=='string'||!/^ride-[1-9]\d*$/.test(b.rideId)||!integer(Number(b.rideId.slice(5)))||Number(b.rideId.slice(5))>=p.nextRideSerial||rides.has(b.rideId)||!type||b.count>CONFIG.vehicles[type].capacity||!finite(b.boardedAt)||b.boardedAt<b.arrivedAt||b.boardedAt>w.clock.minutes+1e-6||!integer(b.fare)||b.fare<CONFIG.fare.min||b.fare>CONFIG.fare.max*4)return bad();
    rides.add(b.rideId);return {...base,rideId:b.rideId,vehicleId:b.vehicleId,boardedAt:b.boardedAt,fare:b.fare};
  }
  if(!Array.isArray(raw.waiting)||!Array.isArray(raw.onboard)||!Array.isArray(raw.completed))return bad();
  let previous=-Infinity,previousSerial=0;
  p.waiting=raw.waiting.map((b:any)=>{
    const item=batch(b),serial=Number(b.id.slice(6));
    if(waits.has(b.id)||w.clock.minutes-b.arrivedAt>=CONFIG.patienceMinutes+1e-6||item.arrivedAt<previous||item.arrivedAt===previous&&serial<previousSerial)return bad();
    waits.add(b.id);previous=item.arrivedAt;previousSerial=serial;return item;
  });
  p.onboard=raw.onboard.map((b:any)=>{
    const item=rider(b);if(!w.fleet.vehicle?.route||w.fleet.vehicle.id!==item.vehicleId)return bad();return item;
  });
  p.completed=raw.completed.map((b:any):CompletionEvent=>{
    const item=rider(b);
    if(b.eventId!==`completion:${item.rideId}`||!finite(b.completedAt)||b.completedAt<item.boardedAt||b.completedAt>w.clock.minutes+1e-6||!integer(b.tripSerial)||b.tripSerial<1||!Number.isSafeInteger(b.amount)||b.amount!==item.count*item.fare)return bad();
    return {...item,eventId:b.eventId,completedAt:b.completedAt,tripSerial:b.tripSerial,amount:b.amount};
  });
  if(!Array.isArray(raw.released))return bad();
  p.released=raw.released.map((b:any)=>{const item=rider(b);if(!station(b.at)||!finite(b.releasedAt)||b.releasedAt<b.boardedAt||b.releasedAt>w.clock.minutes+1e-6||!['returned','cancelled'].includes(b.reason))return bad();return {...item,at:b.at,releasedAt:b.releasedAt,reason:b.reason};});
  const stats=passengerStats(p),v=w.fleet.vehicle;
  if(!stats.conserved||p.totals.potential!==p.totals.accepted+p.totals.noService+p.totals.priceRejected||p.nextBatchSerial-1>p.totals.accepted||p.nextRideSerial-1!==rides.size||p.nextRideSerial-1>p.totals.accepted||stats.onboard>(v?CONFIG.vehicles[v.type].capacity:0)||stats.onboard>0&&v?.status==='depot')return bad();
  return p;
}
