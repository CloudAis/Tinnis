import { CONFIG } from '../config';
import { MAP, TOWNS } from '../world/map';
import { isStationId, type WorldState } from '../world/state';
export const SAVE_KEY = 'alongline-town.save.v1';
export const SCHEMA_VERSION = 1;
export interface SaveFile { schemaVersion: number; savedAt: string; world: WorldState }
const fail = () => { throw new Error('存档内容不完整或数据越界，当前世界未更改。'); };
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
function vec(v: unknown): v is [number, number, number] { return Array.isArray(v) && v.length === 3 && v.every(n => finite(n) && Math.abs(n) <= 1000); }
// Schema v1 is the initial format. Add explicit migrations here when a later stage changes it.
export function decodeSave(raw: string): SaveFile {
  if (raw.length > 2_000_000) throw new Error('存档文件过大。');
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new Error('无法读取存档：不是有效的 JSON。'); }
  if (!record(data)) return fail();
  if (data.schemaVersion !== SCHEMA_VERSION) throw new Error('不支持此存档版本，请使用兼容版本。');
  const w = data.world;
  if (!record(w) || !record(w.map) || !record(w.clock) || !record(w.economy) || !record(w.towns) || !record(w.camera)) return fail();
  if (w.map.id !== MAP.id || w.map.version !== MAP.version || w.map.seed !== MAP.seed) throw new Error('存档地图不兼容。');
  if (!integer(w.clock.tick) || !finite(w.clock.minutes) || w.clock.minutes < CONFIG.clock.startMinutes || w.clock.minutes > 1e9 || typeof w.clock.paused !== 'boolean' || ![1, 2, 4].includes(w.clock.speed)) return fail();
  if (!integer(w.economy.balance) || !Array.isArray(w.economy.ledger) || w.economy.ledger.length > 10_000) return fail();
  const ids = new Set(); let total = CONFIG.initialFunds as number;
  for (const entry of w.economy.ledger) {
    if (!record(entry) || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || !Number.isSafeInteger(entry.amount) || typeof entry.reason !== 'string' || !integer(entry.tick) || entry.tick > w.clock.tick) return fail();
    ids.add(entry.id); total += entry.amount;
    if (!Number.isSafeInteger(total) || total < 0) return fail();
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
  // Reconstruct only known fields; never merge arbitrary imported keys into live objects.
  return { schemaVersion: SCHEMA_VERSION, savedAt: data.savedAt, world: {
    map: { ...MAP }, clock: { tick: w.clock.tick, minutes: w.clock.minutes, speed: w.clock.speed, paused: w.clock.paused },
    economy: { balance: w.economy.balance, ledger: w.economy.ledger.map((e: any) => ({ id: e.id, amount: e.amount, reason: e.reason, tick: e.tick })) },
    towns: Object.fromEntries(TOWNS.map(t => [t.id, { level: w.towns[t.id].level }])) as WorldState['towns'],
    selected: w.selected, camera: { position: [...w.camera.position], target: [...w.camera.target] },
  } };
}
export function encodeSave(world: WorldState): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), world }, null, 2);
}
export function readLocal(): SaveFile | null {
  const raw = localStorage.getItem(SAVE_KEY);
  return raw ? decodeSave(raw) : null;
}
export function writeLocal(world: WorldState) { localStorage.setItem(SAVE_KEY, encodeSave(world)); }
