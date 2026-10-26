import type { VehicleReceipt } from '../world/fleet';
import type { ConstructionReceipt } from '../world/railway';
import type { WorldState } from '../world/state';
// Future construction and trip-arrival events must use stable event IDs here.
export function transact(state: WorldState, id: string, amount: number, reason: string, construction?: ConstructionReceipt, vehicle?: VehicleReceipt): boolean {
  if (!id || !Number.isSafeInteger(amount) || state.economy.ledger.some(e => e.id === id)) return false;
  if (state.economy.balance + amount < 0 || !Number.isSafeInteger(state.economy.balance + amount)) return false;
  state.economy.balance += amount;
  state.economy.ledger.push({ id, amount, reason, tick: state.clock.tick, ...(construction ? { construction: structuredClone(construction) } : {}), ...(vehicle ? { vehicle: structuredClone(vehicle) } : {}) });
  return true;
}
