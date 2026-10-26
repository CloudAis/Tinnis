import { newDevelopment } from '../world/development';
import { copyUpgrade,validateDevelopment } from './development';
import { resourcesFor } from '../simulation/dispatch';
import { newFinance } from '../world/finance';
import { copyPosting, validateFinance } from './finance';
import { newPassengers } from '../world/passengers';
import { validatePassengers } from './passengers';
import { newFleet } from '../world/fleet';
import { copyVehicleReceipt, validateFleet } from './fleet';
import { copyReceipt, validateRailway } from './railway';
import { newRailway } from '../world/railway';
import { CONFIG } from '../config';
import { MAP, TOWNS } from '../world/map';
import { isStationId, type WorldState } from '../world/state';
export const SAVE_KEY = 'alongline-town.save.v7';
export const LEGACY_SAVE_KEY = 'alongline-town.save.v1';
export const SCHEMA_VERSION = 7;
export interface SaveFile { schemaVersion: number; savedAt: string; world: WorldState }
const fail = () => { throw new Error('存档内容不完整或数据越界，当前世界未更改。'); };
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
function vec(v: unknown): v is [number, number, number] { return Array.isArray(v) && v.length === 3 && v.every(n => finite(n) && Math.abs(n) <= 1000); }
// v1 had no constructed railway assets. Preserve its world and ledger, initialize an empty network.
export function decodeSave(raw: string): SaveFile {
  if (raw.length > 8_000_000) throw new Error('存档文件过大。');
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new Error('无法读取存档：不是有效的 JSON。'); }
  if (!record(data)) return fail();
  if (![1, 2, 3, 4, 5, 6, SCHEMA_VERSION].includes(data.schemaVersion)) throw new Error('不支持此存档版本，请使用兼容版本。');
  const w = data.world;
  if (!record(w) || !record(w.map) || !record(w.clock) || !record(w.economy) || !record(w.towns) || !record(w.camera)) return fail();
  if (w.map.id !== MAP.id || w.map.version !== MAP.version || w.map.seed !== MAP.seed) throw new Error('存档地图不兼容。');
  if (!integer(w.clock.tick) || !finite(w.clock.minutes) || w.clock.minutes < CONFIG.clock.startMinutes || w.clock.minutes > 1e9 || typeof w.clock.paused !== 'boolean' || ![1, 2, 4].includes(w.clock.speed)) return fail();
  if (!Number.isSafeInteger(w.economy.balance) || !Array.isArray(w.economy.ledger) || w.economy.ledger.length > 100_000) return fail();
  const ids = new Set(); let total = CONFIG.initialFunds as number;
  for (const entry of w.economy.ledger) {
    if (!record(entry) || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || !Number.isSafeInteger(entry.amount) || typeof entry.reason !== 'string' || !integer(entry.tick) || entry.tick > w.clock.tick) return fail();
    if(entry.minute!==undefined&&(!finite(entry.minute)||entry.minute<480||entry.minute>w.clock.minutes+1e-6))return fail();
    ids.add(entry.id); total += entry.amount;
    if (!Number.isSafeInteger(total)) return fail();
  }
  if (total !== w.economy.balance) return fail();
  if (Object.keys(w.towns).length !== TOWNS.length || TOWNS.some(t => !record(w.towns[t.id]) || ![1, 2, 3].includes(w.towns[t.id].level))) return fail();
  if (w.selected !== null && !isStationId(w.selected)) return fail();
  if (!vec(w.camera.position) || !vec(w.camera.target)) return fail();
  const [tx, ty, tz] = w.camera.target;
  const [x, y, z] = w.camera.position;
  const distance = Math.hypot(x - tx, y - ty, z - tz);
  const polar = Math.acos((y - ty) / distance);
  if (ty !== 0 || Math.abs(tx) > CONFIG.camera.targetX + 0.01 || Math.abs(tz) > CONFIG.camera.targetZ + 0.01 || distance < CONFIG.camera.minDistance - 0.1 || distance > CONFIG.camera.maxDistance + 0.1 || polar < CONFIG.camera.minPolar - 0.001 || polar > CONFIG.camera.maxPolar + 0.001) return fail();
  if (typeof data.savedAt !== 'string' || !Number.isFinite(Date.parse(data.savedAt))) return fail();
  const ledger = w.economy.ledger.map((e:any) => {
    if (data.schemaVersion===1 && (e.construction!==undefined || e.id.startsWith('rail:'))) return fail();
    if(data.schemaVersion<3&&(e.vehicle!==undefined||e.id.startsWith('fleet:')))return fail();
    const vehicle=copyVehicleReceipt(e.vehicle);
    const construction=copyReceipt(e.construction);
    return { id:e.id,amount:e.amount,reason:e.reason,tick:e.tick,...(e.minute!==undefined?{minute:e.minute}:{}),...(e.upgrade?{upgrade:copyUpgrade(e.upgrade)}:{}),...(e.posting?{posting:copyPosting(e.posting,w.clock.minutes)}:{}),...(construction?{construction}:{}),...(vehicle?{vehicle}:{}) };
  });
  const railway=validateRailway(data.schemaVersion===1?newRailway():w.railway,ledger,data.schemaVersion>=7&&w.development?.unlockedD===true);
  // Reconstruct only known fields; never merge arbitrary imported keys into live objects.
  const world:WorldState = {
    map: { ...MAP }, clock: { tick: w.clock.tick, minutes: w.clock.minutes, speed: w.clock.speed, paused: w.clock.paused },
    economy: { balance: w.economy.balance, ledger },
    railway,
    fleet:newFleet(),
    passengers:newPassengers(w.clock.minutes),
    finance:newFinance(w.clock.minutes),
    development:newDevelopment(w.clock.minutes),
    towns: Object.fromEntries(TOWNS.map(t => [t.id, { level: w.towns[t.id].level }])) as WorldState['towns'],
    selected: w.selected, camera: { position: [...w.camera.position], target: [...w.camera.target] },
  };
  if(data.schemaVersion<5){if(w.fleet?.vehicle)w.fleet.vehicle.totalDistance=0;if(w.passengers)w.passengers.released=[];}
  if(data.schemaVersion<6&&w.fleet){w.fleet.others=[];const v=w.fleet.vehicle;if(v){v.waitSince=null;v.waitReason='';v.berth=v.currentStation?1:null;v.authority=v.status==='running'||v.status==='braking'?{section:[...v.route.stops].sort().join(''),from:v.direction===1?v.route.stops[0]:v.route.stops.at(-1),to:v.direction===1?v.route.stops.at(-1):v.route.stops[0],fromBerth:1,berth:1}:null;}w.fleet.resources=resourcesFor(v?[v]:[]);}
  if(data.schemaVersion>=7){world.development.unlockedD=w.development?.unlockedD===true;world.development.upgrades=w.development?.upgrades??{};}
  world.fleet=validateFleet(data.schemaVersion<3?newFleet():w.fleet,world,ledger);
  world.passengers=validatePassengers(data.schemaVersion<4?newPassengers(w.clock.minutes):w.passengers,world);
  if(data.schemaVersion>=5)world.finance=validateFinance(w.finance,world);
  if(data.schemaVersion<7){for(const [from,to] of [['A','B'],['B','A']])if(world.finance.departures[from])world.finance.departures[`${from}>${to}`]=structuredClone(world.finance.departures[from]);}
  if(data.schemaVersion>=7)world.development=validateDevelopment(w.development,world);else world.development=newDevelopment(w.clock.minutes,world.passengers.completed.length);
  return {schemaVersion:SCHEMA_VERSION,savedAt:data.savedAt,world};
}
export function encodeSave(world: WorldState): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), world }, null, 2);
}
export function readLocal(): SaveFile | null {
  const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem('alongline-town.save.v6') ?? localStorage.getItem('alongline-town.save.v5') ?? localStorage.getItem('alongline-town.save.v4') ?? localStorage.getItem('alongline-town.save.v3') ?? localStorage.getItem('alongline-town.save.v2') ?? localStorage.getItem(LEGACY_SAVE_KEY);
  return raw ? decodeSave(raw) : null;
}
export function writeLocal(world: WorldState) { localStorage.setItem(SAVE_KEY, JSON.stringify({schemaVersion:SCHEMA_VERSION,savedAt:new Date().toISOString(),world})); }
