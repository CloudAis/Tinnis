import type { UpgradeReceipt } from '../world/development';
import type { VehicleReceipt } from '../world/fleet';
import type { ConstructionReceipt } from '../world/railway';
import type { Posting } from '../world/finance';
import type { WorldState } from '../world/state';
// Investment, income and cumulative operating costs all pass this integer-money boundary.
export function transact(state:WorldState,id:string,amount:number,reason:string,construction?:ConstructionReceipt,vehicle?:VehicleReceipt,posting?:Posting,upgrade?:UpgradeReceipt):boolean {
  if(!id||!Number.isSafeInteger(amount))return false;
  const existing=state.economy.ledger.find(e=>e.id===id);
  if(existing){
    if(!posting?.cumulative||!existing.posting?.cumulative||existing.posting.category!==posting.category||existing.posting.day!==posting.day)return false;
    const delta=amount-existing.amount;
    if(delta>0||!Number.isSafeInteger(state.economy.balance+delta))return false;
    existing.amount=amount;existing.tick=state.clock.tick;existing.minute=state.clock.minutes;state.economy.balance+=delta;return true;
  }
  if(!Number.isSafeInteger(state.economy.balance+amount)||amount<0&&state.economy.balance+amount<0&&!posting?.operating)return false;
  const inferred:Posting={category:amount<0?'investment':'asset-sale',day:Math.floor((state.clock.minutes+1e-7)/1440)};
  state.economy.balance+=amount;
  state.economy.ledger.push({id,amount,reason,tick:state.clock.tick,minute:state.clock.minutes,posting:posting??inferred,...(construction?{construction:structuredClone(construction)}:{}),...(vehicle?{vehicle:structuredClone(vehicle)}:{}),...(upgrade?{upgrade:structuredClone(upgrade)}:{})});return true;
}
