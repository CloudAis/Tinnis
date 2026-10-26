import { CONFIG } from '../config';
import { STATIONS,TOWNS,type StationId } from '../world/map';
import { UPGRADE_KINDS } from '../world/development';
import { stationName,type EditorState } from '../world/railway';
import type { WorldState } from '../world/state';
import type { UpgradeCommand } from '../simulation/development';
import type { Command } from '../simulation/construction';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class GrowthUI {
 private key='';private station:StationId='A';
 constructor(private upgrade:(c:UpgradeCommand)=>void,private command:(c:Command)=>void){}
 update(w:WorldState,e:EditorState){if(e.mode!=='growth'){this.key='';return;}const g=w.development,panel=document.getElementById('selection-panel')!,built=STATIONS.filter(s=>w.railway.stations[s.id]);if(!built.some(s=>s.id===this.station))this.station=built[0]?.id??'A';
 const key=JSON.stringify([g.revision,w.railway.revision,this.station]);
 if(key!==this.key){this.key=key;const assets=g.upgrades[this.station]??{};panel.innerHTML=`<div class="section-heading"><span>沿线发展手记</span><small>TOWN & STATION</small></div><div id="development-live"></div><div class="section-heading"><span>一级站区改善</span><small>ONE LEVEL EACH</small></div>${built.length?`<select id="upgrade-station" aria-label="升级车站">${built.map(s=>`<option value="${s.id}" ${this.station===s.id?'selected':''}>${s.id} · ${esc(stationName(w.railway,s.id))}</option>`).join('')}</select>${UPGRADE_KINDS.map(kind=>{const c=CONFIG.upgrades[kind],a=assets[kind];return `<article class="upgrade-card"><b>${c.name}${a?' · 已建成':''}</b><p>${c.effect}</p><small>建设 ¥${c.cost.toLocaleString()} · 维护 ¥${c.maintenance}/日</small><button class="${a?'subtle-button':'primary build-button'}" data-upgrade="${kind}" ${a?'data-remove="true"':''}>${a?'拆除 · 退 ¥'+Math.floor(a.paid*.5).toLocaleString():'建设 · ¥'+c.cost.toLocaleString()}</button></article>`;}).join('')}`:'<p>先建 A/B 车站，再投入站区改善。</p>'}<p class="reserved-note">每项只建一级；改良耐心、周转或按实际到达客流收取小额租金，仍需维护。拆站前先拆升级，分别退原价 50%。发展只在稳定服务与有效运量下累计，上限三级、每次升级至少间隔一游戏日。</p>`;
 document.getElementById('upgrade-station')?.addEventListener('change',event=>{this.station=(event.target as HTMLSelectElement).value as StationId;this.key='';this.update(w,e);});
 panel.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach(b=>b.onclick=()=>this.upgrade({station:this.station,kind:b.dataset.upgrade as UpgradeCommand['kind'],remove:b.dataset.remove==='true',revision:w.development.revision}));
 }
 const completed=w.passengers.completed.reduce((n,b)=>n+b.count,0),profitDays=w.finance.days.filter(d=>d.simulatedMinutes>=1440-1e-6&&d.net>0).length;
 document.getElementById('development-live')!.innerHTML=`<div class="unlock-card ${g.unlockedD?'unlocked':''}"><b>${g.unlockedD?'枫泉旅游线权限已开放':'枫泉旅游线 · 发展条件'}</b><p>累计送达 ${completed} / ${CONFIG.growth.unlockPassengers} 人<br>完整盈利运营日 ${profitDays} / 1 日</p><small>${g.unlockedD?'没有赠款；D 站 ¥8,000，B—D 轨道 ¥8,000，均须正常建设。':'初始 08:00 开始的部分日不计完整盈利日。'}</small>${g.unlockedD?'<button id="tourism-stops" class="primary build-button">设定 A—B—D 停站</button>':''}</div>${TOWNS.map((t,i)=>{const d=g.towns[t.id],level=w.towns[t.id].level,threshold=CONFIG.growth.thresholds[level-1]??1,base=CONFIG.demand.growthFactors[level-1];return `<article class="growth-card"><b>${t.name} · ${level} 级</b><span>累计到达 ${d.delivered} 人 · 需求规模 ×${base}</span><progress max="${threshold}" value="${level===3?1:d.progress}" aria-label="${t.name}成长进度"></progress><small>${level===3?'三级上限':`${d.progress.toFixed(1)} / ${threshold} · 冷却剩余 ${Math.max(0,Math.ceil(CONFIG.growth.cooldownMinutes-(w.clock.minutes-d.lastGrowth)))} 分钟`}</small><p>${d.reason}</p></article>`;}).join('')}`;
 document.getElementById('tourism-stops')?.addEventListener('click',()=>this.command({type:'set-stops',stops:['A','B','D'],revision:w.railway.revision}));
 }
}
