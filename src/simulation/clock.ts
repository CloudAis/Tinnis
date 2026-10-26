import { syncJourney } from '../world/journey';
import { stepDevelopment } from './development';
import { allTrains } from '../world/fleet';
import { stepFinance, settleCompleted,settleMovement } from './finance';
import { stepPassengers } from './passengers';
import { stepTrains, trainPose, type Pose } from './train';
import { CONFIG } from '../config';
import type { WorldState } from '../world/state';
export class Simulation {
  private accumulator = 0;
  private previousPoses=new Map<string,Pose>();
  constructor(public state: WorldState) {}
  advance(realSeconds: number) {
    if (this.state.clock.paused) { this.accumulator = 0; return; }
    this.accumulator += Math.min(0.25, Math.max(0, realSeconds));
    const step = CONFIG.clock.stepSeconds;
    while (this.accumulator + 1e-9 >= step) {
      this.previousPoses=new Map(allTrains(this.state.fleet).flatMap(v=>{const p=trainPose(this.state,v);return p?[[v.id,p] as const]:[];}));
      const fromMinute=this.state.clock.minutes;
      this.state.clock.tick++;
      this.state.clock.minutes += step * CONFIG.clock.minutesPerSecond * this.state.clock.speed;
      stepFinance(this.state,true);
      stepTrains(this.state,step*CONFIG.clock.minutesPerSecond*this.state.clock.speed);
      settleMovement(this.state,fromMinute);
      stepPassengers(this.state);
      settleCompleted(this.state);
      stepDevelopment(this.state);
      syncJourney(this.state);
      this.accumulator = Math.max(0, this.accumulator - step);
    }
  }
  visualPoses(){return allTrains(this.state.fleet).flatMap(v=>{const p=this.visualPose(v);return p?[p]:[];});}
  resetElapsed() { this.accumulator = 0; this.previousPoses.clear(); }
  visualPose(v=this.state.fleet.vehicle):Pose|null {
    const current=trainPose(this.state,v),previous=v?this.previousPoses.get(v.id):null;
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
