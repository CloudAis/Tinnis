import { newFinance, type FinanceState, type Posting } from '../world/finance';
import type { WorldState } from '../world/state';
import { dayReport } from '../simulation/finance';
const rec=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v);
const num=(v:any)=>typeof v==='number'&&Number.isFinite(v);
const int=(v:any)=>Number.isSafeInteger(v)&&v>=0;
function bad():never{throw new Error('经营账本、票款或班次状态不一致，当前世界未更改。');}
export function copyPosting(p:any,now:number):Posting{
  if(!rec(p)||!['investment','asset-sale','fare','fixed','mileage','maintenance','rent','upgrade'].includes(p.category)||!int(p.day)||p.day>Math.floor((now+1e-6)/1440)||p.operating!==undefined&&typeof p.operating!=='boolean'||p.cumulative!==undefined&&typeof p.cumulative!=='boolean')return bad();
  return {category:p.category,day:p.day,...(p.operating!==undefined?{operating:p.operating}:{}),...(p.cumulative!==undefined?{cumulative:p.cumulative}:{})};
}
export function validateFinance(raw:any,w:WorldState):FinanceState{
  if(!rec(raw)||!int(raw.revision)||!int(raw.fare)||raw.fare<10||raw.fare>30||![120,180,240].includes(raw.interval)||!num(raw.startedAt)||raw.startedAt<480||raw.startedAt>w.clock.minutes||!num(raw.lastMinute)||raw.lastMinute<raw.startedAt||raw.lastMinute>w.clock.minutes+1e-6||!int(raw.settledCount)||raw.settledCount>w.passengers.completed.length)return bad();
  const f=newFinance(raw.startedAt);Object.assign(f,{revision:raw.revision,fare:raw.fare,interval:raw.interval,lastMinute:raw.lastMinute,settledCount:raw.settledCount});
  for(const key of ['remainder','priceCarry','mileage','departures'])if(!rec(raw[key]))return bad();
  for(const k of Object.keys(f.remainder) as (keyof typeof f.remainder)[]){if(!num(raw.remainder[k])||raw.remainder[k]<0||raw.remainder[k]>=1+1e-7)return bad();f.remainder[k]=raw.remainder[k];}
  for(const [k,v] of Object.entries(raw.priceCarry)){if(!['A>B','B>A','A>D','D>A','B>D','D>B'].includes(k)||!num(v)||(v as number)<0||(v as number)>=1+1e-7)return bad();f.priceCarry[k]=v as number;}
  const knownVehicles=new Set(w.economy.ledger.flatMap(e=>e.vehicle?.kind==='buy'?[e.vehicle.vehicleId]:[]));
  for(const [k,v] of Object.entries(raw.mileage)){if(!knownVehicles.has(k)||!num(v)||(v as number)<0)return bad();f.mileage[k]=v as number;}
  for(const [k,v] of Object.entries(raw.departures)){if(!['A','B','C','D','A>B','B>A','B>D','D>B'].includes(k)||!Array.isArray(v)||v.length>256)return bad();let last=-Infinity;f.departures[k as 'A']=v.map((d:any)=>{if(!rec(d)||!num(d.minute)||d.minute<last||d.minute>w.clock.minutes+1e-6||!knownVehicles.has(d.vehicleId))return bad();last=d.minute;return {minute:d.minute,vehicleId:d.vehicleId};});}
  const ledgerById=new Map(w.economy.ledger.map(e=>[e.id,e]));
  for(let i=0;i<w.passengers.completed.length;i++){const e=w.passengers.completed[i],entry=ledgerById.get(`fare:${e.eventId}`);if(i<f.settledCount?entry?.amount!==e.amount||entry?.posting?.category!=='fare':!!entry)return bad();}
  const completionIds=new Set(w.passengers.completed.slice(0,f.settledCount).map(e=>`fare:${e.eventId}`));
  if(w.economy.ledger.some(e=>e.posting?.category==='fare'&&!completionIds.has(e.id)))return bad();
  if(!Array.isArray(raw.days))return bad();const seen=new Set<number>();const shadow={...w,finance:f};
  f.days=raw.days.map((d:any)=>{if(!rec(d)||!int(d.day)||seen.has(d.day)||(d.day+1)*1440>w.clock.minutes+1e-6)return bad();seen.add(d.day);const expected=dayReport(shadow,d.day);for(const k of Object.keys(expected) as (keyof typeof expected)[])if(!num(d[k])||Math.abs(d[k]-expected[k])>1e-5)return bad();return expected;});
  return f;
}
