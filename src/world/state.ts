import { newFleet, type FleetState, type VehicleReceipt } from './fleet';
import { newRailway, type RailwayState, type ConstructionReceipt } from './railway';
import { CONFIG } from '../config';
import { MAP, STATIONS, TOWNS, type StationId, type TownId } from './map';
export type Speed = 1 | 2 | 4;
export interface CameraState { position: [number, number, number]; target: [number, number, number] }
export interface LedgerEntry { id: string; amount: number; reason: string; tick: number; construction?: ConstructionReceipt; vehicle?: VehicleReceipt }
export interface WorldState {
  map: { id: string; version: number; seed: number };
  clock: { tick: number; minutes: number; paused: boolean; speed: Speed };
  economy: { balance: number; ledger: LedgerEntry[] };
  towns: Record<TownId, { level: 1 | 2 | 3 }>;
  selected: StationId | null;
  camera: CameraState;
  railway: RailwayState;
  fleet: FleetState;
}
export const DEFAULT_CAMERA: CameraState = { position: [148, 145, 180], target: [0, 0, -3] };
export function createWorld(): WorldState {
  return {
    map: { ...MAP },
    clock: { tick: 0, minutes: CONFIG.clock.startMinutes, paused: false, speed: 1 },
    economy: { balance: CONFIG.initialFunds, ledger: [] },
    towns: Object.fromEntries(TOWNS.map(t => [t.id, { level: 1 }])) as WorldState['towns'],
    selected: null,
    camera: structuredClone(DEFAULT_CAMERA),
    railway: newRailway(),
    fleet: newFleet(),
  };
}
export function isStationId(id: unknown): id is StationId { return STATIONS.some(s => s.id === id); }
