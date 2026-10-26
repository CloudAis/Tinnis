import type { StationId } from './map';
import type { WorldState } from './state';
export interface WaitingBatch { id:string; from:StationId; to:StationId; arrivedAt:number; count:number }
export interface RidingBatch extends WaitingBatch { rideId:string; vehicleId:string; boardedAt:number; fare:number }
export interface CompletionEvent extends RidingBatch { eventId:string; completedAt:number; tripSerial:number; amount:number }
export interface PassengerState {
  nextBatchSerial:number; nextRideSerial:number; lastDemandMinute:number;
  carry:Record<string,number>;
  totals:{potential:number;accepted:number;noService:number;priceRejected:number;abandoned:number};
  released:(RidingBatch & {at:StationId;releasedAt:number;reason:'returned'|'cancelled'})[];
  waiting:WaitingBatch[]; onboard:RidingBatch[]; completed:CompletionEvent[];
}
export const DEMAND_PAIRS=[
  {from:'A',to:'B',market:'AB',kind:'commute'}, {from:'B',to:'A',market:'AB',kind:'commute'},
  {from:'A',to:'D',market:'AD',kind:'tourism'}, {from:'D',to:'A',market:'AD',kind:'tourism'},
  {from:'B',to:'D',market:'BD',kind:'tourism'}, {from:'D',to:'B',market:'BD',kind:'tourism'},
] as const;
export const pairKey=(from:StationId,to:StationId)=>`${from}>${to}`;
export const newPassengers=(minutes=480):PassengerState=>({nextBatchSerial:1,nextRideSerial:1,lastDemandMinute:Math.floor(minutes+1e-7),carry:Object.fromEntries(DEMAND_PAIRS.map(p=>[pairKey(p.from,p.to),0])),totals:{potential:0,accepted:0,noService:0,priceRejected:0,abandoned:0},released:[],waiting:[],onboard:[],completed:[]});
export const onboardCount=(w:WorldState,id=w.fleet.vehicle?.id)=>w.passengers.onboard.reduce((n,b)=>n+(b.vehicleId===id?b.count:0),0);
export function passengerStats(p:PassengerState){
  const waiting=p.waiting.reduce((n,b)=>n+b.count,0),onboard=p.onboard.reduce((n,b)=>n+b.count,0),completed=p.completed.reduce((n,b)=>n+b.count,0);
  return {waiting,onboard,completed,abandoned:p.totals.abandoned,accepted:p.totals.accepted,potential:p.totals.potential,noService:p.totals.noService,priceRejected:p.totals.priceRejected,pendingRevenue:p.completed.reduce((n,e)=>n+e.amount,0),conserved:p.totals.accepted===waiting+onboard+completed+p.totals.abandoned};
}
