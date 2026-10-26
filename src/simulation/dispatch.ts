import { STATIONS, type StationId } from '../world/map';
import { allTrains, type Train, type Authority, type Resources } from '../world/fleet';
import type { WorldState } from '../world/state';
export function sectionId(a:StationId,b:StationId){return [a,b].sort().join('');}
export const newResources=():Resources=>({sections:{},platforms:{},throats:{}});
export function resourcesFor(trains:Train[]):Resources{
 const r=newResources();
 function claim(map:Record<string,string>,key:string,id:string){if(map[key]&&map[key]!==id)throw new Error('调度资源重复占用');map[key]=id;}
 for(const v of trains){
  if(v.currentStation&&v.berth)claim(r.platforms,`${v.currentStation}:${v.berth}`,v.id);
  if(v.authority){const a=v.authority;claim(r.sections,a.section,v.id);claim(r.platforms,`${a.to}:${a.berth}`,v.id);claim(r.throats,a.from,v.id);claim(r.throats,a.to,v.id);}
 }
 return r;
}
export function syncResources(w:WorldState){w.fleet.resources=resourcesFor(allTrains(w.fleet));}
export function freeBerth(w:WorldState,station:StationId){const r=resourcesFor(allTrains(w.fleet));for(let i=1;i<=(STATIONS.find(s=>s.id===station)?.berths??0);i++)if(!r.platforms[`${station}:${i}`])return i;return null;}
export function requestAuthority(r:Resources,id:string,from:StationId,to:StationId,fromBerth:number,berths:number):{authority:Authority|null;reason:string}{
 const section=sectionId(from,to);
 if(r.sections[section])return {authority:null,reason:'前方区段占用'};
 if(r.throats[from]||r.throats[to])return {authority:null,reason:'站口道岔通行占用'};
 let berth=0;for(let n=1;n<=berths;n++)if(!r.platforms[`${to}:${n}`]){berth=n;break;}
 if(!berth)return {authority:null,reason:'目标站台占用'};
 return {authority:{section,from,to,fromBerth,berth},reason:''};
}
export function grant(w:WorldState,v:Train,to:StationId){
 const result=requestAuthority(resourcesFor(allTrains(w.fleet)),v.id,v.currentStation!,to,v.berth!,STATIONS.find(s=>s.id===to)!.berths);
 if(!result.authority){v.waitReason=result.reason;return false;}
 v.authority=result.authority;v.berth=null;v.waitReason='';v.waitSince=null;return true;
}
