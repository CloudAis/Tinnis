import { CONFIG } from '../config';
import { newFleet, type FleetState, type VehicleReceipt, STATUS_NAMES } from '../world/fleet';
import type { WorldState, LedgerEntry } from '../world/state';
import { routeSnapshot, travelFraction } from '../simulation/train';
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const int=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>=0;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
function bad():never {throw new Error('车辆存档、位置或购售凭据不一致，当前世界未更改。');}
export function copyVehicleReceipt(raw:unknown):VehicleReceipt|undefined {
  if(raw===undefined)return;
  if(!record(raw))return bad();
  if(raw.kind==='buy')return {kind:'buy',vehicleId:raw.vehicleId,type:raw.type,paid:raw.paid};
  if(raw.kind==='sell')return {kind:'sell',vehicleId:raw.vehicleId,purchaseId:raw.purchaseId};
  return bad();
}
export function validateFleet(raw:unknown,w:WorldState,ledger:LedgerEntry[]):FleetState {
  if(!record(raw)||!int(raw.revision)||!int(raw.nextSerial)||typeof raw.follow!=='boolean')return bad();
  let serial=1,mutations=0;let active:{id:string;type:'light'|'large';paid:number;purchaseId:string}|null=null;
  for(const e of ledger){
    const r=e.vehicle;
    if(!r){if(e.id.startsWith('fleet:'))return bad();continue;}
    if(r.kind==='buy'){
      const id=`train-${String(serial).padStart(4,'0')}`;
      if(active||r.vehicleId!==id||e.id!==`fleet:buy:${serial}`||!['light','large'].includes(r.type)||!int(r.paid)||!r.paid||e.amount!==-r.paid)return bad();
      active={id,type:r.type,paid:r.paid,purchaseId:e.id};serial++;
    }else{
      if(!active||r.vehicleId!==active.id||r.purchaseId!==active.purchaseId||e.id!==`fleet:sell:${active.id}`||e.amount!==Math.floor(active.paid*CONFIG.vehicleRefund))return bad();
      active=null;
    }
    mutations++;
  }
  if(raw.nextSerial!==serial||raw.revision<mutations)return bad();
  const result=newFleet();result.revision=raw.revision;result.nextSerial=serial;result.follow=raw.follow;
  if(!active){if(raw.vehicle!==null||raw.follow)return bad();return result;}
  const v=raw.vehicle;
  if(!record(v)||v.id!==active.id||v.type!==active.type||v.purchaseId!==active.purchaseId||v.paid!==active.paid||!Object.hasOwn(STATUS_NAMES,v.status)||![1,-1].includes(v.direction)||!finite(v.distance)||v.distance<0||!finite(v.legElapsed)||v.legElapsed<0||v.legElapsed>90.000001||!finite(v.dwellRemaining)||v.dwellRemaining<0||v.dwellRemaining>10.000001||typeof v.stopRequested!=='boolean'||!int(v.tripSerial)||!int(v.legsCompleted)||!int(v.arrivalSerial)||v.arrivalSerial!==v.legsCompleted)return bad();
  let route=null;
  if(v.status==='depot'){
    if(v.route!==null||v.currentStation!==null||v.pendingStops!==null||v.distance!==0||v.legElapsed!==0||v.dwellRemaining!==0||raw.follow)return bad();
  }else{
    if(!record(v.route)||!Array.isArray(v.route.stops)||v.route.stops.length!==2||new Set(v.route.stops).size!==2)return bad();
    const candidate=routeSnapshot({...w,railway:{...w.railway,line:{...w.railway.line,stops:v.route.stops}}});
    if(!candidate||JSON.stringify(candidate)!==JSON.stringify({lineId:v.route.lineId,stops:v.route.stops,nodes:v.route.nodes,edges:v.route.edges,length:v.route.length}))return bad();
    route=candidate;
    if(v.distance>route.length+1e-6)return bad();
    if(v.status==='running'||v.status==='braking'){
      const expected=route.length*(v.direction===1?travelFraction(v.legElapsed):1-travelFraction(v.legElapsed));
      if(v.currentStation!==null||Math.abs(expected-v.distance)>1e-6||v.tripSerial!==v.legsCompleted+1||v.dwellRemaining!==0)return bad();
      if(v.status==='running'&&v.legElapsed>=80.000001||v.status==='braking'&&v.legElapsed<80-1e-6)return bad();
    }else{
      if(!route.stops.includes(v.currentStation)||Math.abs(v.distance-(v.currentStation===route.stops[0]?0:route.length))>1e-6||v.tripSerial!==v.legsCompleted)return bad();
    }
    if(v.pendingStops!==null){
      if(!['running','braking'].includes(v.status)||JSON.stringify(v.pendingStops)!==JSON.stringify(w.railway.line.stops))return bad();
    }else if(JSON.stringify(route.stops)!==JSON.stringify(w.railway.line.stops))return bad();
  }
  result.vehicle={...active,status:v.status,route,pendingStops:v.pendingStops===null?null:[...v.pendingStops],direction:v.direction,distance:v.distance,legElapsed:v.legElapsed,dwellRemaining:v.dwellRemaining,currentStation:v.currentStation,stopRequested:v.stopRequested,tripSerial:v.tripSerial,legsCompleted:v.legsCompleted,arrivalSerial:v.arrivalSerial};
  return result;
}
