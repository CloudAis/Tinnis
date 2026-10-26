import { allTrains } from '../world/fleet';
import { CONFIG } from '../config';
import type { WorldState } from '../world/state';
import type { StationId } from '../world/map';
import { findPath, STATION_NODES } from '../world/railway';
import type { AccountCategory, DayReport } from '../world/finance';
import { transact } from './economy';
export function quoteFare(w:WorldState,from:StationId,to:StationId){
  const base=findPath('node-a','node-b',()=>true)!.length;
  const path=findPath(STATION_NODES[from],STATION_NODES[to],()=>true);
  const factor=Math.min(4,Math.max(.5,(path?.length??base)/base));
  return Math.round(w.finance.fare*factor);
}
export function priceAcceptance(fare:number){return Math.max(.1,Math.min(1,fare<=20?1-(fare-10)*.01:.9-(fare-20)*.045));}
export function dayReport(w:WorldState,day:number):DayReport {
  const result:DayReport={day,fare:0,fixed:0,mileage:0,maintenance:0,rent:0,investment:0,sale:0,net:0,simulatedMinutes:Math.max(0,Math.min(w.clock.minutes,(day+1)*1440)-Math.max(w.finance.startedAt,day*1440))};
  for(const e of w.economy.ledger){const d=e.posting?.day??Math.floor((e.minute??480)/1440);if(d!==day)continue;const c=e.posting?.category??(e.amount<0?'investment':'asset-sale');if(c==='asset-sale')result.sale+=e.amount;else if(c==='investment'||c==='upgrade')result.investment-=e.amount;else result[c]+=c==='fare'||c==='rent'?e.amount:-e.amount;}
  result.simulatedMinutes=Math.round(result.simulatedMinutes*1e6)/1e6;
  result.net=result.fare+result.rent-result.fixed-result.mileage-result.maintenance;return result;
}
export function settleCompleted(w:WorldState){
  while(w.finance.settledCount<w.passengers.completed.length){const e=w.passengers.completed[w.finance.settledCount];transact(w,`fare:${e.eventId}`,e.amount,`${e.from}→${e.to} ${e.count}人锁定票款`,undefined,undefined,{category:'fare',day:Math.floor((w.clock.minutes+1e-7)/1440),operating:true});w.finance.settledCount++;}
}
function accrue(w:WorldState,category:'fixed'|'mileage'|'maintenance'|'rent',value:number,day:number){
  const f=w.finance;f.remainder[category]+=value;const units=Math.floor(f.remainder[category]+1e-8);f.remainder[category]=Math.max(0,f.remainder[category]-units);if(!units)return;
  const id=`operating:${category}:${day}`,old=w.economy.ledger.find(e=>e.id===id)?.amount??0;
  const amount=category==='rent'?old+units:old-units;
  // Rent is posted as unique minute income in stage 7; costs are cumulative per day.
  if(category==='rent')transact(w,`rent:${w.clock.tick}`,units,'站区商店租金',undefined,undefined,{category,day,operating:true});
  else transact(w,id,amount,{fixed:'车辆固定费',mileage:'实际里程运行费',maintenance:'站轨维护费'}[category],undefined,undefined,{category,day,operating:true,cumulative:true});
}
export function financialHalt(w:WorldState,v=w.fleet.vehicle){
  if(!v?.route||w.economy.balance>0)return;
  v.stopRequested=true;
  if(v.currentStation){
    // Before departure, return accepted boardings to their original queue, retaining age and identity history.
    const returned=w.passengers.onboard.filter(b=>b.vehicleId===v.id&&b.to!==v.currentStation);
    for(const b of returned){const same=b.from===v.currentStation;if(same){const batch=w.passengers.waiting.find(q=>q.id===b.id);if(batch)batch.count+=b.count;else w.passengers.waiting.push({id:b.id,from:b.from,to:b.to,arrivedAt:b.arrivedAt,count:b.count});}else w.passengers.totals.abandoned+=b.count;
      w.passengers.released.push({...b,at:v.currentStation,releasedAt:w.clock.minutes,reason:same?'returned':'cancelled'});
    }
    w.passengers.onboard=w.passengers.onboard.filter(b=>b.vehicleId!==v.id||b.to===v.currentStation);w.passengers.waiting.sort((a,b)=>a.arrivedAt-b.arrivedAt||Number(a.id.slice(6))-Number(b.id.slice(6)));
    v.status='stopped';v.dwellRemaining=0;
  }
}
export function stepFinance(w:WorldState){
  const f=w.finance,now=w.clock.minutes,elapsed=now-f.lastMinute;if(elapsed<=1e-8)return;
  const vehicles=allTrains(w.fleet);let mileage=0;for(const v of vehicles){mileage+=Math.max(0,v.totalDistance-(f.mileage[v.id]??0))*CONFIG.vehicles[v.type].mileageFactor;f.mileage[v.id]=v.totalDistance;}
  let cursor=f.lastMinute;
  while(cursor<now-1e-8){const day=Math.floor((cursor+1e-7)/1440),end=Math.min(now,(day+1)*1440),portion=end-cursor;
    const fixed=vehicles.reduce((n,v)=>n+CONFIG.vehicles[v.type].dailyCost,0);
    const maintenance=Object.keys(w.railway.stations).length*CONFIG.maintenance.stationDaily+Object.keys(w.railway.tracks).length*CONFIG.maintenance.trackPerSegmentDaily;
    accrue(w,'fixed',fixed*portion/1440,day);accrue(w,'maintenance',maintenance*portion/1440,day);
    accrue(w,'mileage',mileage/1000*CONFIG.operating.mileagePerKilometer*portion/elapsed,day);
    cursor=end;
    if(end>= (day+1)*1440-1e-7&&!f.days.some(d=>d.day===day))f.days.push(dayReport(w,day));
  }
  f.lastMinute=now;for(const v of vehicles)financialHalt(w,v);
}
export function canDepart(w:WorldState,station:StationId){
  if(w.economy.balance<=0)return '资金已耗尽，停止新发车';
  const last=w.finance.departures[station]?.at(-1)?.minute;
  if(last!==undefined&&w.clock.minutes+1e-7<last+w.finance.interval)return `目标发车间隔未到，还需 ${(last+w.finance.interval-w.clock.minutes).toFixed(1)} 分钟`;
  return '';
}
export function recordDeparture(w:WorldState,station:StationId,id:string){const list=w.finance.departures[station]??=[];list.push({minute:w.clock.minutes,vehicleId:id});if(list.length>256)list.shift();}
export function setBusiness(w:WorldState,fare:number,interval:number,revision:number){
  if(revision!==w.finance.revision||!Number.isInteger(fare)||fare<10||fare>30||![120,180,240].includes(interval))return {ok:false,message:'票价或班次无效，设置未更改。'};
  w.finance.fare=fare;w.finance.interval=interval as 120|180|240;w.finance.revision++;return {ok:true,message:'票价与目标班次已保存，车上乘客保留上车票价。'};
}
export function actualInterval(w:WorldState){const departures=w.finance.departures.A??[];return {minimum:Math.max(w.finance.interval,(allTrains(w.fleet).filter(v=>v.route&&!v.stopRequested).length>1?2*CONFIG.journey.abMinutes+CONFIG.journey.dwellMinutes:2*(CONFIG.journey.abMinutes+CONFIG.journey.dwellMinutes))),observed:departures.length>1?departures.at(-1)!.minute-departures.at(-2)!.minute:null};}
