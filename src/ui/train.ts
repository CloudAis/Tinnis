import { CONFIG } from '../config';
import { STATUS_NAMES, vehicleName } from '../world/fleet';
import { stationName, type EditorState } from '../world/railway';
import type { WorldState } from '../world/state';
import type { TrainCommand } from '../simulation/train';
export class TrainUI {
  private key='';
  constructor(private command:(c:TrainCommand)=>void){}
  update(w:WorldState,editor:EditorState){
    if(editor.mode!=='train'){this.key='';return;}
    const v=w.fleet.vehicle;
    const key=JSON.stringify([w.fleet.revision,w.fleet.follow,v?.status,v?.pendingStops,v?.stopRequested,v?.route?.stops]);
    const panel=document.getElementById('selection-panel')!;
    if(key!==this.key){
      this.key=key;
      if(!v){
        panel.innerHTML=`<div class="section-heading"><span>地方铁路车辆所</span><small>ROLLING STOCK</small></div><p class="editor-explainer">挑一列车，让沿线的日常动起来。当前仅开放一列车。</p>${(['light','large'] as const).map(type=>`<article class="vehicle-card ${type}"><div class="train-illustration"><span></span><span></span><span></span><i></i><i></i></div><h2>${vehicleName(type)}</h2><p>定员 ${CONFIG.vehicles[type].capacity} 人 · 单节双端驾驶室</p><button class="primary build-button" data-buy="${type}">购置 · ¥ ${CONFIG.vehicles[type].price.toLocaleString('en-US')}</button></article>`).join('')}<p class="reserved-note">购车与线路建设费用通过统一账本结算。列车回库后可按原价 60% 出售。</p>`;
        panel.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(b=>b.onclick=()=>this.command({type:'buy',model:b.dataset.buy as 'light'|'large',revision:w.fleet.revision}));return;
      }
      panel.innerHTML=`<div class="section-heading"><span>${v.id.toUpperCase()}</span><small>FLEET 01</small></div><div class="vehicle-card ${v.type}"><div class="train-illustration"><span></span><span></span><span></span><i></i><i></i></div><h2>${vehicleName(v.type)}</h2><p>定员 ${CONFIG.vehicles[v.type].capacity} 人 · <b id="train-status">${STATUS_NAMES[v.status]}</b></p></div><div class="train-metrics"><span>线路进度<b id="train-distance"></b></span><span>已完成往返<b id="train-rounds"></b></span></div><div class="journey-progress"><span id="train-progress"></span></div><p class="train-live" id="train-live"></p><p class="pending-route" ${v.pendingStops?'':'hidden'}>新停站顺序已排队，将在下一次安全停站时生效。</p><div class="train-actions">${v.status==='depot'||v.status==='stopped'?'<button id="dispatch-train" class="primary">'+(v.status==='depot'?'投放到线路':'恢复运行')+'</button>':'<button id="stop-train">到站停运</button>'}${v.status==='stopped'?'<button id="withdraw-train">收车回库</button>':''}${v.status==='depot'?`<button id="sell-train">出售空车 · ¥ ${Math.floor(v.paid*.6).toLocaleString('en-US')}</button>`:`<button id="follow-train" aria-pressed="${w.fleet.follow}">${w.fleet.follow?'退出跟车':'跟车旅行'} ↗</button>`}</div><p class="reserved-note">A—B 单程 90 游戏分钟，停站 10 分钟。请先停运并回库，再拆除运营依赖的站与轨道。单车行车许可独占线路；双车会让留待阶段 6。</p><div id="passenger-dashboard"></div>`;
      const bind=(id:string,c:TrainCommand['type'])=>{const b=document.getElementById(id);if(b)b.onclick=()=>this.command({type:c,revision:w.fleet.revision,...(c==='follow'?{enabled:!w.fleet.follow}:{})} as TrainCommand);};
      bind('dispatch-train','dispatch');bind('stop-train','stop');bind('withdraw-train','withdraw');bind('sell-train','sell');bind('follow-train','follow');
    }
    if(v){
      document.getElementById('train-distance')!.textContent=v.route?`${v.distance.toFixed(1)} m`:'车库';
      document.getElementById('train-rounds')!.textContent=String(Math.floor(v.legsCompleted/2));
      document.getElementById('train-progress')!.style.width=`${v.route?v.distance/v.route.length*100:0}%`;
      document.getElementById('train-live')!.textContent=v.currentStation?`${stationName(w.railway,v.currentStation)} · ${v.status==='stopped'?'已停运':`离站剩余 ${v.dwellRemaining.toFixed(1)} 分钟`}`:v.route?`${v.direction===1?v.route.stops[0]:v.route.stops.at(-1)} → ${v.direction===1?v.route.stops.at(-1):v.route.stops[0]} · 本程 ${v.legElapsed.toFixed(1)} / 90 分钟`:'请先将车投放到一条有效线路。';
    }
  }
}
