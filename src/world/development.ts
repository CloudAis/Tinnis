import type { StationId,TownId } from './map';
import { TOWNS } from './map';
export const UPGRADE_KINDS=['shelter','service','shops'] as const;
export type UpgradeKind=typeof UPGRADE_KINDS[number];
export interface UpgradeAsset {id:string;paid:number;builtAtTick:number;stationPurchaseId:string}
export type UpgradeReceipt={kind:'build';station:StationId;upgrade:UpgradeKind;stationPurchaseId:string;paid:number}|{kind:'remove';station:StationId;upgrade:UpgradeKind;purchaseId:string};
export interface TownDevelopment {progress:number;lastGrowth:number;delivered:number;windowMinutes:number;serviceMinutes:number;waitExposure:number;windowDelivered:number;reason:string}
export interface DevelopmentState {revision:number;nextSerial:number;upgrades:Partial<Record<StationId,Partial<Record<UpgradeKind,UpgradeAsset>>>>;unlockedD:boolean;unlockedAt:number|null;lastMinute:number;lastEvent:number;towns:Record<TownId,TownDevelopment>}
export function newDevelopment(minute=480,eventCursor=0):DevelopmentState{return {revision:0,nextSerial:1,upgrades:{},unlockedD:false,unlockedAt:null,lastMinute:minute,lastEvent:eventCursor,towns:Object.fromEntries(TOWNS.map(t=>[t.id,{progress:0,lastGrowth:minute,delivered:0,windowMinutes:0,serviceMinutes:0,waitExposure:0,windowDelivered:0,reason:'等待稳定直达服务'}])) as DevelopmentState['towns']};}

// Existing scenery parcels promoted to replaceable development lots; coordinates are stable.
export const GROWTH_PLOTS:Record<TownId,readonly (readonly [number,number,number])[]>={
 'town-shiokou':[[-73,3,0],[-63,2,1],[-51,-1,0]],
 'town-aokawa':[[-29,-22,0],[-18,-30,3],[-6,-33,0]],
 'town-kaede':[[42,-20,1],[51,-31,0],[63,-33,2]],
};
