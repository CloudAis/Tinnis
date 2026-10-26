import { stepPassengers } from './passengers';
import { stepTrain, trainPose, type Pose } from './train';
import { CONFIG } from '../config';
import type { WorldState } from '../world/state';
export class Simulation {
  private accumulator = 0;
  private previousPose:Pose|null=null;
  constructor(public state: WorldState) {}
  advance(realSeconds: number) {
    if (this.state.clock.paused) { this.accumulator = 0; return; }
    this.accumulator += Math.min(0.25, Math.max(0, realSeconds));
    const step = CONFIG.clock.stepSeconds;
    while (this.accumulator + 1e-9 >= step) {
      this.previousPose=trainPose(this.state);
      this.state.clock.tick++;
      this.state.clock.minutes += step * CONFIG.clock.minutesPerSecond * this.state.clock.speed;
      stepTrain(this.state,step*CONFIG.clock.minutesPerSecond*this.state.clock.speed);
      stepPassengers(this.state);
      this.accumulator = Math.max(0, this.accumulator - step);
    }
  }
  resetElapsed() { this.accumulator = 0; this.previousPose=null; }
  visualPose():Pose|null {
    const current=trainPose(this.state),previous=this.previousPose;
    if(!current||!previous||previous.id!==current.id||this.state.clock.paused)return current;
    const alpha=this.accumulator/CONFIG.clock.stepSeconds;
    const angle=Math.atan2(Math.sin(current.heading-previous.heading),Math.cos(current.heading-previous.heading));
    return {id:current.id,position:current.position.map((n,i)=>previous.position[i]+(n-previous.position[i])*alpha) as [number,number,number],heading:previous.heading+angle*alpha};
  }
}
export function clockText(minutes: number) {
  const whole = Math.floor(minutes + 1e-7);
  const day = Math.floor(whole / CONFIG.clock.dayMinutes) + 1;
  const hours = Math.floor(whole / 60) % 24;
  return { day: String(day).padStart(2, '0'), time: `${String(hours).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}` };
}
