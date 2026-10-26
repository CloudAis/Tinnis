import { patience,stationUnlocked } from '../simulation/development';
import { allTrains } from '../world/fleet';
import { CONFIG } from '../config';
import { STATIONS } from '../world/map';
import { stationName, type EditorState } from '../world/railway';
import { passengerStats } from '../world/passengers';
import { hasDirectService } from '../simulation/passengers';
import { clockText } from '../simulation/clock';
import type { WorldState } from '../world/state';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class PassengerUI {
  update(w:WorldState,editor:EditorState){
    const s=passengerStats(w.passengers),v=w.fleet.vehicle,capacity=allTrains(w.fleet).reduce((n,t)=>n+CONFIG.vehicles[t.type].capacity,0);
    const load=capacity?Math.round(s.onboard/capacity*100):0;
    const waiting=(id:string)=>w.passengers.waiting.filter(b=>b.from===id).reduce((n,b)=>n+b.count,0);
    document.querySelectorAll<HTMLButtonElement>('[data-station]').forEach(b=>{const id=b.dataset.station!;b.title=`${stationName(w.railway,id as any)} · 候车 ${waiting(id)} 人`;});
    if(editor.mode==='train'){
      const dashboard=document.getElementById('passenger-dashboard');
      if(dashboard)dashboard.innerHTML=`<div class="section-heading"><span>车上与沿线</span><small>PASSENGERS</small></div><div class="load-summary"><strong id="train-load">${s.onboard} / ${capacity} 人</strong><span>载客率 ${load}%</span></div><meter min="0" max="${capacity||1}" value="${s.onboard}" aria-label="列车载客率"></meter><p class="editor-explainer">候车 ${s.waiting} · 完成 ${s.completed} · 放弃 ${s.abandoned}</p>`;
    }
    if(editor.mode==='inspect'&&w.selected){
      const detail=document.querySelector('.station-detail');if(detail){let label=document.getElementById('station-pax-status');if(!label){label=document.createElement('p');label.id='station-pax-status';label.className='station-pax-status';detail.append(label);}label.textContent=`当前候车 ${waiting(w.selected)} 人 · 候车耐心 ${patience(w,w.selected??'A')} 游戏分钟`;}
    }
    if(editor.mode!=='passengers')return;
    const panel=document.getElementById('selection-panel')!;
    const live=hasDirectService(w,'A','B');
    panel.innerHTML=`<div class="section-heading"><span>沿线客流手记</span><small>PEOPLE & JOURNEYS</small></div><div class="service-status ${live?'active':''}"><span></span>${live?'A ↔ B 双向直达服务中':'暂无直达服务，不生成旅客'}</div><div class="pax-stats">${[['waiting','候车',s.waiting],['onboard','车上',s.onboard],['completed','完成',s.completed],['abandoned','放弃',s.abandoned]].map(([id,name,value])=>`<div><span>${name}</span><b id="pax-${id}">${value}</b></div>`).join('')}</div><div class="load-summary"><strong>${s.onboard} / ${capacity} 人</strong><span>载客率 ${load}%</span></div><meter min="0" max="${capacity||1}" value="${s.onboard}" aria-label="列车载客率"></meter><p class="mass-balance" id="pax-conservation">已接受 ${s.accepted} = 候车 ${s.waiting} + 车上 ${s.onboard} + 完成 ${s.completed} + 放弃 ${s.abandoned}</p><div class="section-heading"><span>站台上的日常</span><small>PLATFORMS</small></div><div class="platform-list">${STATIONS.filter(t=>stationUnlocked(w,t.id)).map(t=>{
      const batches=w.passengers.waiting.filter(b=>b.from===t.id),oldest=batches.length?Math.floor(w.clock.minutes-Math.min(...batches.map(b=>b.arrivedAt))):0;
      return `<div><b>${t.id} · ${esc(stationName(w.railway,t.id))}</b><strong>${waiting(t.id)} 人</strong><small>前往 ${esc(stationName(w.railway,t.id==='A'?'B':'A'))} · 最久等候 ${oldest} 分钟</small></div>`;
    }).join('')}</div><div class="demand-summary"><span>潜在需求 <b>${s.potential}</b></span><span>无直达服务 <b id="pax-no-service">${s.noService}</b></span><span>价格拒绝 <b>${s.priceRejected}</b></span></div><p class="reserved-note">无服务与价格拒绝不计入已接受需求。当前票价 ¥ ${w.finance.fare}，调整票价仅影响新需求与后续上车；候车耐心 ${patience(w,w.selected??'A')} 游戏分钟。</p><div class="completion-summary"><span>待结算票款</span><b id="pax-pending-fares">¥ ${w.passengers.completed.slice(w.finance.settledCount).reduce((n,e)=>n+e.amount,0).toLocaleString('en-US')}</b><small>抵达目的地按唯一行程入账；车上乘客已锁定票价。</small></div><div class="recent-journeys">${w.passengers.completed.slice(-4).reverse().map(e=>`<div><span>${esc(stationName(w.railway,e.from))} → ${esc(stationName(w.railway,e.to))}</span><small>${clockText(e.completedAt).time} · ${e.count} 人 · 票价 ¥ ${e.fare}</small></div>`).join('')}</div>`;
  }
}
