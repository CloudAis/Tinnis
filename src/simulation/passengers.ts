import { quoteFare, priceAcceptance } from './finance';
import { CONFIG } from '../config';
import { STATIONS, type StationId } from '../world/map';
import { DEMAND_PAIRS, pairKey, onboardCount, type PassengerState, type CompletionEvent } from '../world/passengers';
import type { WorldState } from '../world/state';
export function demandWeight(kind:'commute'|'tourism',minute:number){
  const profile=kind==='commute'?CONFIG.demand.commuteWeights:CONFIG.demand.tourismWeights;
  return profile[Math.floor(((minute%1440)+1440)%1440/60)]/(profile.reduce((s,n)=>s+n,0)*60);
}
export function demandRate(world:WorldState,from:StationId,to:StationId,minute:number){
  const pair=DEMAND_PAIRS.find(p=>p.from===from&&p.to===to);
  const origin=STATIONS.find(s=>s.id===from),destination=STATIONS.find(s=>s.id===to);
  if(!pair||!origin?.unlocked||!destination?.unlocked)return 0;
  const level=(id:typeof origin)=>id?.townId?world.towns[id.townId].level:1;
  const scale=CONFIG.demand.growthFactors;const growth=Math.sqrt(scale[level(origin)-1]*scale[level(destination)-1]);
  const daily=pair.market==='AB'?CONFIG.demandAB:pair.market==='AD'?CONFIG.demand.tourismAD:CONFIG.demand.tourismBD;
  return daily/2*growth*demandWeight(pair.kind,minute);
}
export function hasDirectService(w:WorldState,from:StationId,to:StationId){
  const v=w.fleet.vehicle;
  return !!(v?.route&&!v.stopRequested&&!['depot','stopped'].includes(v.status)&&from!==to&&v.route.stops.includes(from)&&v.route.stops.includes(to)&&v.route.edges.every(id=>!!w.railway.tracks[id])&&v.route.stops.every(id=>!!w.railway.stations[id]));
}
export function generateDemand(w:WorldState){
  const p=w.passengers,now=Math.floor(w.clock.minutes+1e-7);
  while(p.lastDemandMinute<now){
    const minute=p.lastDemandMinute++;
    for(const pair of DEMAND_PAIRS){
      const key=pairKey(pair.from,pair.to);p.carry[key]+=demandRate(w,pair.from,pair.to,minute);
      const count=Math.floor(p.carry[key]+1e-9);p.carry[key]=Math.max(0,p.carry[key]-count);if(!count)continue;
      p.totals.potential+=count;
      if(!hasDirectService(w,pair.from,pair.to)){p.totals.noService+=count;continue;}
      const carried=(w.finance.priceCarry[key]??0)+count*priceAcceptance(w.finance.fare);
      const accepted=Math.floor(carried+1e-9);w.finance.priceCarry[key]=Math.max(0,carried-accepted);p.totals.priceRejected+=count-accepted;if(!accepted)continue;
      p.totals.accepted+=accepted;
      p.waiting.push({id:`batch-${p.nextBatchSerial++}`,from:pair.from,to:pair.to,arrivedAt:Math.min(minute+1,w.clock.minutes),count:accepted});
    }
  }
}
export function expireWaiting(p:PassengerState,now:number){
  p.waiting=p.waiting.filter(b=>{if(now-b.arrivedAt>=CONFIG.patienceMinutes-1e-7){p.totals.abandoned+=b.count;return false;}return true;});
}
export function alight(p:PassengerState,station:StationId,vehicleId:string,now:number,tripSerial:number){
  const events:CompletionEvent[]=[];
  p.onboard=p.onboard.filter(b=>{
    if(b.vehicleId!==vehicleId||b.to!==station)return true;
    const eventId=`completion:${b.rideId}`;
    if(!p.completed.some(e=>e.eventId===eventId))events.push({...b,eventId,completedAt:now,tripSerial,amount:b.count*b.fare});
    return false;
  });
  p.completed.push(...events);return events;
}
export function board(w:WorldState){
  const v=w.fleet.vehicle;if(w.economy.balance<=0||!v?.route||!v.currentStation||v.stopRequested||!['ready','dwelling'].includes(v.status))return;
  const index=v.route.stops.indexOf(v.currentStation),forward=index===0||index!==v.route.stops.length-1&&v.direction===1;
  const destinations=forward?v.route.stops.slice(index+1):v.route.stops.slice(0,index);
  let space=CONFIG.vehicles[v.type].capacity-onboardCount(w,v.id);
  const p=w.passengers;
  // Stable FIFO by accepted arrival time, then original batch serial. Splits retain the original timestamp.
  p.waiting.sort((a,b)=>a.arrivedAt-b.arrivedAt||Number(a.id.slice(6))-Number(b.id.slice(6)));
  for(const b of p.waiting){
    if(space<=0)break;
    if(b.from!==v.currentStation||!destinations.includes(b.to))continue;
    const count=Math.min(space,b.count);
    p.onboard.push({...b,count,rideId:`ride-${p.nextRideSerial++}`,vehicleId:v.id,boardedAt:w.clock.minutes,fare:quoteFare(w,b.from,b.to)});
    b.count-=count;space-=count;
  }
  p.waiting=p.waiting.filter(b=>b.count>0);
}
export function stepPassengers(w:WorldState){
  generateDemand(w);expireWaiting(w.passengers,w.clock.minutes);
  const v=w.fleet.vehicle;
  if(v?.route&&v.currentStation){alight(w.passengers,v.currentStation,v.id,w.clock.minutes,v.tripSerial);board(w);}
}
