import { freeBerth, grant, syncResources } from './dispatch';
import { canDepart, recordDeparture } from './finance';
import { onboardCount } from '../world/passengers';
import { CONFIG } from '../config';
import type { WorldState } from '../world/state';
import { allTrains, type Train, type VehicleType, vehicleName, type RouteSnapshot } from '../world/fleet';
import { nodeById, type EdgeId } from '../world/railway';
import type { StationId, Point } from '../world/map';
import { deploymentReadiness } from './route';
import { transact } from './economy';
export interface Pose { id:string; position:[number,number,number]; heading:number }
export type TrainCommand=({type:'buy';model:VehicleType}|{type:'select';id:string}|{type:'sell'}|{type:'dispatch';origin?:StationId}|{type:'stop'}|{type:'withdraw'}|{type:'follow';enabled:boolean})&{revision:number};
export function routeSnapshot(world:WorldState):RouteSnapshot|null {
  const p=deploymentReadiness(world);
  return p.ok?{lineId:'line-main',stops:[...world.railway.line.stops],nodes:p.nodes,edges:p.edges,length:p.length}:null;
}
export function operatingGuard(world:WorldState,d:{stations:StationId[];edges:EdgeId[]}) {
  const pending=routeSnapshot(world);
  for(const v of allTrains(world.fleet))if(v.route&&(d.stations.some(id=>v.route!.stops.includes(id)||pending?.stops.includes(id))||d.edges.some(id=>v.route!.edges.includes(id)||pending?.edges.includes(id))))return '列车占用或仍依赖此线路，请先停运并回库再拆除。';
  return null;
}
export function applyPendingRoute(world:WorldState,v:Train) {
  if(!v.pendingStops||!v.currentStation||v.status==='running'||v.status==='braking')return;
  const route=routeSnapshot(world);if(!route)return;
  const atStart=route.stops[0]===v.currentStation;
  if(!atStart&&route.stops.at(-1)!==v.currentStation)return;
  v.route=route;v.pendingStops=null;v.distance=atStart?0:route.length;v.direction=atStart?1:-1;v.legElapsed=0;
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
  if(c.type==='sell')return ['depot','stopped'].includes(v.status)&&onboardCount(w)===0?{ok:true,message:'出售车库中的空车，返原购车价 60%。',amount:Math.floor(v.paid*CONFIG.vehicleRefund)}:fail('仅可出售车库或安全停站的空车。');
  if(c.type==='dispatch'){
    if(w.economy.balance<=0)return fail('资金已耗尽，请先通过安全售车或拆除恢复资金。');
    if(!['depot','stopped'].includes(v.status))return fail('列车已经投入运行，不重复投放。');
    const p=deploymentReadiness(w);if(!p.ok)return fail(p.reason);
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
  }else if(c.type==='dispatch'){
    if(!v!.route){v!.route=routeSnapshot(w)!;v!.currentStation=c.origin??v!.route.stops[0];v!.direction=v!.currentStation===v!.route.stops[0]?1:-1;v!.distance=v!.direction===1?0:v!.route.length;v!.berth=freeBerth(w,v!.currentStation)!;}
    applyPendingRoute(w,v!);v!.stopRequested=false;v!.status='ready';v!.dwellRemaining=CONFIG.journey.dwellMinutes;v!.legElapsed=0;
  }else if(c.type==='stop'){
    v!.stopRequested=true;
    if(v!.currentStation&&onboardCount(w)===0){v!.status='stopped';v!.dwellRemaining=0;}
  }else if(c.type==='withdraw'){
    v!.berth=null;v!.authority=null;v!.waitReason='';v!.waitSince=null;v!.status='depot';v!.route=null;v!.pendingStops=null;v!.currentStation=null;v!.distance=0;v!.legElapsed=0;v!.dwellRemaining=0;v!.stopRequested=false;f.follow=false;
  }else if(c.type==='follow')f.follow=c.enabled;
  syncResources(w);f.revision++;return d;
}
export function travelFraction(minutes:number) {
  const duration=CONFIG.journey.abMinutes,brake=CONFIG.journey.brakeMinutes,cruise=duration-brake;
  const t=Math.min(duration,Math.max(0,minutes)),u=Math.max(0,t-cruise);
  return (Math.min(t,cruise)+u-u*u/(2*brake))/(cruise+brake/2);
}
export function stepTrain(w:WorldState,minutes:number,v=w.fleet.vehicle) {
  if(!v?.route||v.status==='depot'||v.status==='stopped')return;
  if(v.status==='running'||v.status==='braking'){
    const beforeDistance=v.distance;
    v.legElapsed=Math.min(CONFIG.journey.abMinutes,v.legElapsed+minutes);
    const fraction=travelFraction(v.legElapsed);v.distance=v.route.length*(v.direction===1?fraction:1-fraction);
    v.totalDistance+=Math.abs(v.distance-beforeDistance);
    if(v.legElapsed>=CONFIG.journey.abMinutes-1e-7){
      v.distance=v.direction===1?v.route.length:0;v.currentStation=v.direction===1?v.route.stops.at(-1)!:v.route.stops[0];
      v.berth=v.authority?.berth??1;v.authority=null;v.waitSince=null;v.waitReason='';
      v.legsCompleted++;v.arrivalSerial++;v.status=v.stopRequested?'stopped':'dwelling';v.dwellRemaining=v.stopRequested?0:CONFIG.journey.dwellMinutes;
      applyPendingRoute(w,v);
    }else if(v.legElapsed>=CONFIG.journey.abMinutes-CONFIG.journey.brakeMinutes)v.status='braking';
    return;
  }
  applyPendingRoute(w,v);
  v.dwellRemaining=Math.max(0,v.dwellRemaining-minutes);
  if(v.dwellRemaining<=1e-7){
    // A single train is granted the whole path; phase 6 will arbitrate competing requests.
    if(!v.route.edges.every(id=>w.railway.tracks[id])){v.status='requesting';return;}
    v.waitSince??=w.clock.minutes;
    const reason=canDepart(w,v.currentStation!);if(reason){v.waitReason=reason;v.status='requesting';return;}
    const target=v.currentStation===v.route.stops[0]?v.route.stops.at(-1)!:v.route.stops[0];
    if(!grant(w,v,target)){v.status='requesting';return;}
    recordDeparture(w,v.currentStation!,v.id);
    v.direction=v.currentStation===v.route.stops[0]?1:-1;
    v.currentStation=null;v.status='running';v.legElapsed=0;v.dwellRemaining=0;v.tripSerial++;return;
  }
  if(v.dwellRemaining<=CONFIG.journey.permissionMinutes+1e-7){v.status='requesting';v.direction=v.currentStation===v.route.stops[0]?1:-1;}
  else if(v.status!=='ready'&&v.dwellRemaining<=CONFIG.journey.turnMinutes+CONFIG.journey.permissionMinutes+1e-7)v.status='turning';
}
export function trainPose(w:WorldState,v=w.fleet.vehicle):Pose|null {
  if(!v?.route)return null;
  let left=v.distance;
  for(let i=1;i<v.route.nodes.length;i++){
    const a=nodeById(v.route.nodes[i-1])!.position,b=nodeById(v.route.nodes[i])!.position;
    const length=Math.hypot(b[0]-a[0],b[2]-a[2]);
    if(left<=length||i===v.route.nodes.length-1){const t=Math.min(1,Math.max(0,left/length));const position:[number,number,number]=[a[0]+(b[0]-a[0])*t,2.2,a[2]+(b[2]-a[2])*t];
      let heading=Math.atan2((b[0]-a[0])*v.direction,(b[2]-a[2])*v.direction);
      // B's second berth shares its apron geometry; the full station throat is reserved while moving.
      const bi=v.route.stops.indexOf('B');
      if(bi>=0){const atB=v.currentStation==='B'&&v.berth===2,fromB=v.authority?.from==='B'&&v.authority.fromBerth===2,toB=v.authority?.to==='B'&&v.authority.berth===2;
        if(atB||fromB||toB){const bDistance=v.route.stops[0]==='B'?v.distance:v.route.length-v.distance;const q=Math.min(1,Math.max(0,(9-bDistance)/4));const theta=Math.atan2(11,-7),right:[number,number]=[Math.cos(theta),-Math.sin(theta)];position[0]+=right[0]*3.8*q;position[2]+=right[1]*3.8*q;
          if(bDistance>5&&bDistance<9){const towardB=v.authority?.to==='B'?1:-1;const dx=Math.sin(heading)+right[0]*3.8/4*towardB,dz=Math.cos(heading)+right[1]*3.8/4*towardB;heading=Math.atan2(dx,dz);}
        }
      }
      return {id:v.id,position,heading};}
    left-=length;
  }
  return null;
}

export function stepTrains(w:WorldState,minutes:number){
 const list=allTrains(w.fleet).sort((a,b)=>{const moving=(v:Train)=>v.status==='running'||v.status==='braking';return Number(moving(b))-Number(moving(a))||(a.waitSince??Infinity)-(b.waitSince??Infinity)||a.id.localeCompare(b.id);});
 for(const v of list)stepTrain(w,minutes,v);syncResources(w);
}
