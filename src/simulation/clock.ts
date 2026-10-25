import { CONFIG } from '../config';
import type { WorldState } from '../world/state';
export class Simulation {
  private accumulator = 0;
  constructor(public state: WorldState) {}
  advance(realSeconds: number) {
    if (this.state.clock.paused) { this.accumulator = 0; return; }
    this.accumulator += Math.min(0.25, Math.max(0, realSeconds));
    const step = CONFIG.clock.stepSeconds;
    while (this.accumulator + 1e-9 >= step) {
      this.state.clock.tick++;
      this.state.clock.minutes += step * CONFIG.clock.minutesPerSecond * this.state.clock.speed;
      this.accumulator = Math.max(0, this.accumulator - step);
    }
  }
  resetElapsed() { this.accumulator = 0; }
}
export function clockText(minutes: number) {
  const whole = Math.floor(minutes + 1e-7);
  const day = Math.floor(whole / CONFIG.clock.dayMinutes) + 1;
  const hours = Math.floor(whole / 60) % 24;
  return { day: String(day).padStart(2, '0'), time: `${String(hours).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}` };
}
