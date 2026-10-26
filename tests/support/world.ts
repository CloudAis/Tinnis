import { createWorld } from '../../src/world/state';
import { executeCommand, type Command } from '../../src/simulation/construction';
import { executeTrainCommand, type TrainCommand } from '../../src/simulation/train';
import { Simulation } from '../../src/simulation/clock';
export const cmd=(w:ReturnType<typeof createWorld>,c:Omit<TrainCommand,'revision'>)=>executeTrainCommand(w,{...c,revision:w.fleet.revision} as TrainCommand);
export function network(){const w=createWorld();for(const station of ['A','B'] as const)executeCommand(w,{type:'build-station',station,revision:w.railway.revision});executeCommand(w,{type:'build-track',from:'node-a',to:'node-b',revision:w.railway.revision});return w;}
export function minutes(w:ReturnType<typeof createWorld>,n:number){const old=w.clock.speed;w.clock.speed=4;const sim=new Simulation(w);for(let i=0;i<Math.round(n/.4);i++)sim.advance(.05);w.clock.speed=old;}
