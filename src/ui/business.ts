import { actualInterval, dayReport } from '../simulation/finance';
import { passengerStats } from '../world/passengers';
import { CONFIG } from '../config';
import type { WorldState } from '../world/state';
import type { EditorState } from '../world/railway';
export class BusinessUI {
  private key='';
  constructor(private apply:(fare:number,interval:number,revision:number)=>void){}
  update(w:WorldState,e:EditorState){
    if(e.mode!=='business'){this.key='';return;}
    const f=w.finance,panel=document.getElementById('selection-panel')!;
    if(this.key!==String(f.revision)){this.key=String(f.revision);panel.innerHTML=`<div class="section-heading"><span>铁路经营手账</span><small>BUSINESS</small></div><p class="editor-explainer">完成运输才能获得票款。固定费、维护费随模拟时间分摊，运行费依据实际里程。</p><label class="editor-label" for="base-fare">基础票价 · ¥10—30</label><input id="base-fare" aria-label="基础票价" type="number" min="10" max="30" step="1" value="${f.fare}"><label class="editor-label" for="target-interval">同方向目标发车间隔</label><select id="target-interval" aria-label="目标发车间隔">${[120,180,240].map(n=>`<option value="${n}" ${f.interval===n?'selected':''}>${n} 游戏分钟</option>`).join('')}</select><button class="primary build-button" id="apply-business">保存经营设置</button><div id="business-live"></div><p class="reserved-note">票价按站对路程系数计算，上车锁价。低价接受率较高，高价可能拒绝新需求。购建属于投资现金流，不计运营净收益；午夜汇总，不另扣一天费用。</p>`;
      document.getElementById('apply-business')!.onclick=()=>this.apply(Number((document.getElementById('base-fare') as HTMLInputElement).value),Number((document.getElementById('target-interval') as HTMLSelectElement).value),f.revision);
    }
    const r=dayReport(w,Math.floor((w.clock.minutes+1e-7)/1440)),a=actualInterval(w),s=passengerStats(w.passengers),v=w.fleet.vehicle;
    document.getElementById('business-live')!.innerHTML=`<div class="section-heading"><span>今日收支</span><small>DAY ${r.day+1}</small></div><div class="finance-grid">${[['余额 / 欠款',w.economy.balance],['已完成票款',r.fare],['固定费',-r.fixed],['里程费',-r.mileage],['站轨维护',-r.maintenance],['站区租金',r.rent],['运营净收益',r.net],['投资支出',-r.investment],['资产出售',r.sale]].map(([k,n])=>`<div><span>${k}</span><b>¥ ${Number(n).toLocaleString('en-US')}</b></div>`).join('')}</div><p id="interval-status">目标 ${f.interval} 分钟 · 当前周转下限 ${a.minimum} 分钟<br>最近实际间隔 ${a.observed===null?'等待两次同方向发车':a.observed.toFixed(1)+' 分钟'}</p><p>候车 ${s.waiting} 人 · 车上 ${s.onboard} 人<br>${v&&s.onboard>=CONFIG.vehicles[v.type].capacity?'列车满载，剩余旅客继续按原到站时间排队。':s.waiting?'候车取决于方向、班次与停站窗口。':'暂无积压候车。'}</p>${w.economy.balance<=0?'<p class="invalid">资金耗尽：停止新发车，在途列车到站停运。出售安全停站空车可恢复资金，欠款不会清零。</p>':''}<div class="section-heading"><span>最近日结</span><small>OPERATING NET</small></div>${f.days.slice(-3).map(d=>`<p>第 ${d.day+1} 日 · ${d.simulatedMinutes>=1439.99?'完整运营日':'部分运营日'} · ¥ ${d.net}</p>`).join('')||'<p>尚未跨过午夜。</p>'}`;
  }
}
