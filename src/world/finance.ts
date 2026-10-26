import { CONFIG } from '../config';
import type { StationId } from './map';
export type AccountCategory='investment'|'asset-sale'|'fare'|'fixed'|'mileage'|'maintenance'|'rent'|'upgrade';
export interface Posting { category:AccountCategory; day:number; cumulative?:boolean; operating?:boolean }
export interface DayReport { day:number; fare:number; fixed:number; mileage:number; maintenance:number; rent:number; investment:number; sale:number; net:number; simulatedMinutes:number }
export interface FinanceState {
  revision:number; fare:number; interval:120|180|240; startedAt:number; lastMinute:number; settledCount:number;
  remainder:{fixed:number;mileage:number;maintenance:number;rent:number};
  priceCarry:Record<string,number>; mileage:Record<string,number>;
  departures:Partial<Record<StationId,{minute:number;vehicleId:string}[]>>;
  days:DayReport[];
}
export const newFinance=(minute:number=CONFIG.clock.startMinutes):FinanceState=>({revision:0,fare:CONFIG.fare.base,interval:120,startedAt:minute,lastMinute:minute,settledCount:0,remainder:{fixed:0,mileage:0,maintenance:0,rent:0},priceCarry:{},mileage:{},departures:{},days:[]});
