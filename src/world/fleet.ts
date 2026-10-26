import type { StationId } from './map';
import type { NodeId, EdgeId } from './railway';
export type VehicleType = 'light' | 'large';
export type TrainStatus = 'depot' | 'ready' | 'requesting' | 'running' | 'braking' | 'dwelling' | 'turning' | 'stopped';
export interface RouteSnapshot { lineId:'line-main'; stops:StationId[]; nodes:NodeId[]; edges:EdgeId[]; length:number }
export interface Train {
  id:string; type:VehicleType; purchaseId:string; paid:number;
  status:TrainStatus; route:RouteSnapshot|null; pendingStops:StationId[]|null;
  direction:1|-1; distance:number; legElapsed:number; dwellRemaining:number;
  currentStation:StationId|null; stopRequested:boolean;
  totalDistance:number;
  tripSerial:number; legsCompleted:number; arrivalSerial:number;
}
export interface FleetState { revision:number; nextSerial:number; follow:boolean; vehicle:Train|null }
export type VehicleReceipt = { kind:'buy'; vehicleId:string; type:VehicleType; paid:number } | { kind:'sell'; vehicleId:string; purchaseId:string };
export const newFleet=():FleetState=>({revision:0,nextSerial:1,follow:false,vehicle:null});
export const vehicleName=(type:VehicleType)=>type==='light'?'青叶号 · 轻型车':'夕凪号 · 大容量车';
export const STATUS_NAMES:Record<TrainStatus,string>={depot:'车库待命',ready:'待发车',requesting:'申请行车许可',running:'沿线行驶',braking:'进站制动',dwelling:'停站上下客',turning:'端点折返',stopped:'停运留站'};
