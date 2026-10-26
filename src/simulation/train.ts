import { stationDistance,legDuration,nextStation,sampleRoute,traveledDistance } from './route-distance';
import { dwellMinutes } from './development';
import { freeBerth, grant, syncResources } from './dispatch';
import { canDepart, recordDeparture } from './finance';
import { onboardCount } from '../world/passengers';
import { CONFIG } from '../config';
import type { WorldState } from '../world/state';
import { allTrains, type Train, type VehicleType, vehicleName, type RouteSnapshot } from '../world/fleet';
import { B_FRAME, nodeById, type EdgeId } from '../world/railway';
import type { StationId, Point } from '../world/map';
import { deploymentReadiness } from './route';
import { transact } from './economy';
export interface Pose { id:string; position:[number,number,number]; heading:number }
export type TrainCommand=({type:'buy';model:VehicleType}|{type:'assign';stops:StationId[]}|{type:'select';id:string}|{type:'sell'}|{type:'dispatch';origin?:StationId}|{type:'stop'}|{type:'withdraw'}|{type:'follow';enabled:boolean})&{revision:number};
export function routeSnapshot(world:WorldState,stops=world.railway.line.stops):RouteSnapshot|null {
  const p=deploymentReadiness(world,stops);
  return p.ok?{lineId:'line-main',stops:[...stops],nodes:p.nodes,edges:p.edges,length:p.length}:null;
}
export function operatingGuard(world:WorldState,d:{stations:StationId[];edges:EdgeId[]}) {
  for(const v of allTrains(world.fleet)){const pending=v.pendingStops?routeSnapshot(world,v.pendingStops):null;if(v.route&&(d.stations.some(id=>v.route!.stops.includes(id)||pending?.stops.includes(id))||d.edges.some(id=>v.route!.edges.includes(id)||pending?.edges.includes(id))))return '列车占用或仍依赖此线路，请先停运并回库再拆除。';}
  return null;
}
export function applyPendingRoute(world:WorldState,v:Train) {
  if(!v.pendingStops||!v.currentStation||v.status==='running'||v.status==='braking')return;
  const route=routeSnapshot(world,v.pendingStops);if(!route)return;
  if(!route.stops.includes(v.currentStation)||world.passengers.onboard.some(b=>b.vehicleId===v.id&&!route.stops.includes(b.to)))return;
  const rank={A:0,B:1,D:2,C:3},orientation=(r:RouteSnapshot)=>Math.sign(rank[r.stops.at(-1)!]-rank[r.stops[0]]);
  const oldDirection=v.direction*orientation(v.route!)*orientation(route) as 1|-1;
  v.route=route;v.pendingStops=null;v.distance=stationDistance(route,v.currentStation);v.direction=oldDirection;nextStation(v);v.legElapsed=0;

}
export function queueLineChange(world:WorldState,stops:StationId[]) {
  for(const v of allTrains(world.fleet))if(v.route){v.pendingStops=[...stops];applyPendingRoute(world,v);}
}
export function describeTrainCommand(w:WorldState,c:TrainCommand) {
  const fail=(message:string)=>({ok:false,message,amount:0});const f=w.fleet,v=f.vehicle;
  if(c.revision!==f.revision)return fail('车辆状态已变化，请重新操作。');
  if(c.type==='select')return allTrains(f).some(t=>t.id===c.id)?{ok:true,message:'已切换选中车辆。',amount:0}:fail('未知车辆。');
  if(c.type==='buy'){
    if(!['light','large'].includes(c.model))return fail('未知车型。');
    if(allTrains(f).length>=2)return fail('最多持有两列车。');
    const cost=CONFIG.vehicles[c.model].price;
    if(w.economy.balance<cost)return fail('购车资金不足，余额未改变。');
    return {ok:true,message:`购置${vehicleName(c.model)}，定员 ${CONFIG.vehicles[c.model].capacity} 人。`,amount:-cost};
  }
  if(!v)return fail('请先购置列车。');
  if(c.type==='assign'){if(!routeSnapshot(w,c.stops))return fail('所选线路未连通或停站顺序无效。');if(v.route&&!c.stops.includes(v.currentStation??v.authority?.to!))return fail('新线路须包含当前或下一安全停靠站。');if(w.passengers.onboard.some(b=>b.vehicleId===v.id&&!c.stops.includes(b.to)))return fail('新线路仍须服务车上乘客的目的地。');return {ok:true,message:'线路指派已排队，安全停站时应用。',amount:0};}
  if(c.type==='sell')return ['depot','stopped'].includes(v.status)&&onboardCount(w)===0?{ok:true,message:'出售安全停站或车库中的空车，返原购车价 60%。',amount:Math.floor(v.paid*CONFIG.vehicleRefund)}:fail('仅可出售车库或安全停站的空车。');
  if(c.type==='dispatch'){
    if(w.economy.balance<=0)return fail('资金已耗尽，请先通过安全售车或拆除恢复资金。');
    if(!['depot','stopped'].includes(v.status))return fail('列车已经投入运行，不重复投放。');
    const p=deploymentReadiness(w,v.route?.stops??w.railway.line.stops);if(!p.ok)return fail(p.reason);
    if(!v.route){const origin=c.origin??w.railway.line.stops[0];if(!w.railway.line.stops.includes(origin)||!freeBerth(w,origin))return fail('始发站台占用，选择其他始发站或等待空位。');}
    return {ok:true,message:'列车已投放，按停站时间等待发车。',amount:0};
  }
  if(c.type==='stop')return ['depot','stopped'].includes(v.status)?fail('列车已经停运。'):{ok:true,message:'运行中将在下一站停稳后收车；停站中可直接停运。',amount:0};
  if(c.type==='withdraw'&&onboardCount(w)>0)return fail('车上仍有乘客，请送达后再回库。');
  if(c.type==='withdraw')return v.status==='stopped'?{ok:true,message:'列车已回库，线路依赖已解除。',amount:0}:fail('请先在车站停运，不能从行驶途中回库。');
  return v.route?{ok:true,message:c.enabled?'跟车视角已开启。':'已退出跟车视角。',amount:0}:fail('请先投放列车再跟车。');
}
export function executeTrainCommand(w:WorldState,c:TrainCommand) {
  const d=describeTrainCommand(w,c);if(!d.ok)return d;
  const f=w.fleet,v=f.vehicle;
  if(c.type==='select'){const selected=allTrains(f).find(t=>t.id===c.id)!;f.others=allTrains(f).filter(t=>t.id!==c.id);f.vehicle=selected;f.follow=false;}else if(c.type==='buy'){
    const id=`train-${String(f.nextSerial).padStart(4,'0')}`,purchaseId=`fleet:buy:${f.nextSerial}`;
    if(!transact(w,purchaseId,d.amount,d.message,undefined,{kind:'buy',vehicleId:id,type:c.model,paid:-d.amount}))return {ok:false,message:'购车交易未完成。'};
    const bought:Train={id,type:c.model,purchaseId,paid:-d.amount,totalDistance:0,berth:null,authority:null,waitSince:null,waitReason:'',status:'depot',route:null,pendingStops:null,direction:1,distance:0,legElapsed:0,dwellRemaining:0,currentStation:null,stopRequested:false,tripSerial:0,legsCompleted:0,arrivalSerial:0};if(!f.vehicle)f.vehicle=bought;else f.others.push(bought);f.nextSerial++;
  }else if(c.type==='sell'){
    if(!transact(w,`fleet:sell:${v!.id}`,d.amount,d.message,undefined,{kind:'sell',vehicleId:v!.id,purchaseId:v!.purchaseId}))return {ok:false,message:'售车已处理，不重复退款。'};
    f.vehicle=f.others.shift()??null;f.follow=false;
  }else if(c.type==='assign'){if(v!.route){v!.pendingStops=[...c.stops];applyPendingRoute(w,v!);}else {return {ok:false,message:'先投放车辆，再指派独立线路。'};}
  }else if(c.type==='dispatch'){
    if(!v!.route){v!.route=routeSnapshot(w)!;v!.currentStation=c.origin??v!.route.stops[0];v!.direction=v!.currentStation===v!.route.stops[0]?1:-1;v!.distance=stationDistance(v!.route,v!.currentStation);v!.berth=freeBerth(w,v!.currentStation)!;}
    applyPendingRoute(w,v!);v!.stopRequested=false;v!.status='ready';v!.dwellRemaining=dwellMinutes(w,v!.currentStation!);v!.legElapsed=0;
  }else if(c.type==='stop'){
    v!.stopRequested=true;
    if(v!.currentStation&&onboardCount(w)===0){v!.status='stopped';v!.dwellRemaining=0;}
  }else if(c.type==='withdraw'){
    v!.berth=null;v!.authority=null;v!.waitReason='';v!.waitSince=null;v!.status='depot';v!.route=null;v!.pendingStops=null;v!.currentStation=null;v!.distance=0;v!.legElapsed=0;v!.dwellRemaining=0;v!.stopRequested=false;f.follow=false;
  }else if(c.type==='follow')f.follow=c.enabled;
  syncResources(w);f.revision++;return d;
}
export function travelFraction(minutes:number,duration:number=CONFIG.journey.abMinutes) {
  const brake=CONFIG.journey.brakeMinutes,cruise=duration-brake;
  const t=Math.min(duration,Math.max(0,minutes)),u=Math.max(0,t-cruise);
  return (Math.min(t,cruise)+u-u*u/(2*brake))/(cruise+brake/2);
}
export function stepTrain(w:WorldState,minutes:number,v=w.fleet.vehicle) {
  if(!v?.route||v.status==='depot'||v.status==='stopped')return;
  if(v.status==='running'||v.status==='braking'){
    const beforeDistance=v.distance,duration=legDuration(v),from=stationDistance(v.route,v.authority!.from),to=stationDistance(v.route,v.authority!.to);
    v.legElapsed=Math.min(duration,v.legElapsed+minutes);
    const fraction=travelFraction(v.legElapsed,duration);v.distance=from+(to-from)*fraction;
    v.totalDistance+=traveledDistance(v,beforeDistance,v.distance);
    if(v.legElapsed>=duration-1e-7){
      v.distance=to;v.currentStation=v.authority!.to;
      v.berth=v.authority?.berth??1;v.authority=null;v.waitSince=null;v.waitReason='';
      v.legsCompleted++;v.arrivalSerial++;const mustContinue=w.passengers.onboard.some(b=>b.vehicleId===v.id&&b.to!==v.currentStation);v.status=v.stopRequested&&!mustContinue?'stopped':'dwelling';v.dwellRemaining=v.status==='stopped'?0:dwellMinutes(w,v.currentStation!);
      applyPendingRoute(w,v);
    }else if(v.legElapsed>=duration-CONFIG.journey.brakeMinutes)v.status='braking';
    return;
  }
  applyPendingRoute(w,v);
  v.dwellRemaining=Math.max(0,v.dwellRemaining-minutes);
  if(v.dwellRemaining<=1e-7){
    // The next complete station-to-station section and destination berth are granted atomically.
    if(!v.route.edges.every(id=>w.railway.tracks[id])){v.status='requesting';return;}
    v.waitSince??=w.clock.minutes;
    const target=nextStation(v);
    const reason=canDepart(w,v.currentStation!,target,v);if(reason){v.waitReason=reason;v.status='requesting';return;}
    if(!grant(w,v,target)){v.status='requesting';return;}
    recordDeparture(w,v.currentStation!,v.id,target);
    nextStation(v);
    v.currentStation=null;v.status='running';v.legElapsed=0;v.dwellRemaining=0;v.tripSerial++;return;
  }
  if(v.dwellRemaining<=CONFIG.journey.permissionMinutes+1e-7){v.status='requesting';nextStation(v);}
  else if(v.status!=='ready'&&v.dwellRemaining<=CONFIG.journey.turnMinutes+CONFIG.journey.permissionMinutes+1e-7)v.status='turning';
}
export function trainPose(w:WorldState,v=w.fleet.vehicle):Pose|null {
  if(!v?.route)return null;
  const sample=sampleRoute(v.route,v.distance),position=sample.position;let heading=sample.heading+(v.direction===-1?Math.PI:0);
  if(v.route.stops.includes('B')){const atB=v.currentStation==='B'&&v.berth===2,fromB=v.authority?.from==='B'&&v.authority.fromBerth===2,toB=v.authority?.to==='B'&&v.authority.berth===2;
    if(atB||fromB||toB){const bd=stationDistance(v.route,'B'),bDistance=Math.abs(v.distance-bd),q=Math.min(1,Math.max(0,(B_FRAME.throat-bDistance)/(B_FRAME.throat-B_FRAME.parallel))),right=[B_FRAME.cos,-B_FRAME.sin];position[0]+=right[0]*B_FRAME.offset*q;position[2]+=right[1]*B_FRAME.offset*q;
      if(bDistance>B_FRAME.parallel&&bDistance<B_FRAME.throat){const towardB=toB?1:-1;heading=Math.atan2(Math.sin(heading)+right[0]*B_FRAME.offset/4*towardB,Math.cos(heading)+right[1]*B_FRAME.offset/4*towardB);}
    }
  }
  return {id:v.id,position,heading};
}

export function stepTrains(w:WorldState,minutes:number){
 const list=allTrains(w.fleet).sort((a,b)=>{const moving=(v:Train)=>v.status==='running'||v.status==='braking';return Number(moving(b))-Number(moving(a))||(a.waitSince??Infinity)-(b.waitSince??Infinity)||a.id.localeCompare(b.id);});
 for(const v of list)stepTrain(w,minutes,v);syncResources(w);
}
