import { allTrains } from '../world/fleet';
import { daylightAt,weatherAt } from '../world/presentation';
import type { WorldState } from '../world/state';
export class Soundscape {
 private context:AudioContext|null=null;private master:GainNode|null=null;private analyser:AnalyserNode|null=null;
 private ambient:GainNode|null=null;private rain:GainNode|null=null;private engine:GainNode|null=null;private motor:OscillatorNode|null=null;
 private sources:AudioScheduledSourceNode[]=[];private seen=new Map<string,number>();private voices=0;private hidden=false;private lastKey='';
 contextsCreated=0;arrivalChimes=0;unavailable=false;
 reset(w:WorldState){this.seen=new Map(allTrains(w.fleet).map(v=>[v.id,v.arrivalSerial]));this.lastKey='';}
 async unlock(w:WorldState){
  if(this.hidden)return;
  try{if(!this.context){this.context=new AudioContext();this.contextsCreated++;this.createGraph();this.reset(w);}if(this.context.state==='suspended')await this.context.resume();this.unavailable=false;this.update(w);}catch{this.unavailable=true;}
 }
 private createGraph(){const c=this.context!,master=c.createGain();master.gain.value=0;this.master=master;this.analyser=c.createAnalyser();this.analyser.fftSize=256;master.connect(this.analyser);this.analyser.connect(c.destination);
  const buffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate),data=buffer.getChannelData(0);let seed=72103,previous=0;for(let i=0;i<data.length;i++){seed=(1664525*seed+1013904223)>>>0;previous=.92*previous+.08*(seed/4294967296*2-1);data[i]=previous*3;}
  const noise=(frequency:number)=>{const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=frequency;gain.gain.value=0;source.connect(filter);filter.connect(gain);gain.connect(master);source.start();this.sources.push(source);return gain;};
  this.ambient=noise(500);this.rain=noise(2400);this.engine=c.createGain();this.engine.gain.value=0;this.engine.connect(master);this.motor=c.createOscillator();this.motor.type='triangle';this.motor.frequency.value=55;this.motor.connect(this.engine);this.motor.start();this.sources.push(this.motor);
 }
 update(w:WorldState){
  const cars=allTrains(w.fleet);for(const v of cars){const before=this.seen.get(v.id);if(before!==undefined&&v.arrivalSerial>before&&!w.presentation.muted&&!w.clock.paused&&this.context?.state==='running')this.chime();this.seen.set(v.id,v.arrivalSerial);}for(const id of this.seen.keys())if(!cars.some(v=>v.id===id))this.seen.delete(id);
  if(!this.context||!this.master)return;
  const moving=w.clock.paused?0:cars.filter(v=>['running','braking'].includes(v.status)).length,wet=weatherAt(w.presentation,w.clock.minutes)==='rain',night=daylightAt(w.clock.minutes)<.3;
  const key=JSON.stringify([moving,wet,night,w.presentation.muted,w.presentation.volume,this.hidden]);if(key===this.lastKey)return;this.lastKey=key;
  const t=this.context.currentTime;this.master.gain.cancelScheduledValues(t);this.master.gain.setValueAtTime(w.presentation.muted||this.hidden?0:w.presentation.volume,t);
  this.ambient!.gain.setTargetAtTime(night?.035:.06,t,.15);this.rain!.gain.setTargetAtTime(wet?.1:0,t,.15);this.engine!.gain.setTargetAtTime(moving*.035,t,.12);this.motor!.frequency.setTargetAtTime(54+moving*11,t,.2);
 }
 private chime(){if(!this.context||!this.master||this.voices>=4)return;const c=this.context;this.arrivalChimes++;for(const [i,hz] of [659.25,880].entries()){const osc=c.createOscillator(),gain=c.createGain(),t=c.currentTime+i*.16;this.voices++;osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.11,t+.025);gain.gain.exponentialRampToValueAtTime(.0001,t+.65);osc.connect(gain);gain.connect(this.master);osc.start(t);osc.stop(t+.7);osc.onended=()=>{osc.disconnect();gain.disconnect();this.voices=Math.max(0,this.voices-1);};}}
 setHidden(hidden:boolean){this.hidden=hidden;this.lastKey='';if(hidden&&this.context?.state==='running')void this.context.suspend().catch(()=>{});else if(!hidden&&this.context?.state==='suspended')void this.context.resume().catch(()=>{});}
 stats(){let rms=0;if(this.analyser){const values=new Float32Array(256);this.analyser.getFloatTimeDomainData(values);rms=Math.sqrt(values.reduce((n,x)=>n+x*x,0)/values.length);}return {state:this.context?.state??'locked',contextsCreated:this.contextsCreated,loopSources:this.sources.length,voices:this.voices,arrivalChimes:this.arrivalChimes,masterGain:this.master?.gain.value??0,rms,unavailable:this.unavailable};}
 dispose(){for(const s of this.sources){s.stop();s.disconnect();}this.sources=[];void this.context?.close();this.context=null;this.master=null;this.analyser=null;this.ambient=null;this.rain=null;this.engine=null;this.motor=null;this.voices=0;this.lastKey='';}
}
