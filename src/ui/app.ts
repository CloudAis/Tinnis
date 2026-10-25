import { CONFIG } from '../config';
import { clockText } from '../simulation/clock';
import { STATIONS, TOWNS, type StationId } from '../world/map';
import type { WorldState } from '../world/state';
export interface Actions {
  pause():void;speed(n:1|2|4):void;select(id:StationId|null):void;focus(id:StationId):void;
  home():void;zoom(f:number):void;save():void;load():void;export():void;import(file:File):Promise<void>;
}
const svg=(paths:string)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
export const icons={
  train:svg('<rect x="6" y="3" width="12" height="15" rx="3"/><path d="M6 10h12M12 3v7M8 18l-2 4m10-4 2 4M7 21h10"/><path d="M9 14h.01M15 14h.01" stroke-width="3"/>'),
  save:svg('<path d="M4 4h13l3 3v13H4zM8 4v6h8V4M8 20v-6h8v6"/>'),
  home:svg('<path d="m3 11 9-8 9 8M6 9v11h12V9M10 20v-7h4v7"/>'),
  compass:svg('<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5z"/>'),
  help:svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 16h.01"/>'),
  leaf:svg('<path d="M20 3C6 2 1 10 6 16s15 1 14-13ZM4 21 15 9"/>'),
  sun:svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>'),
  pin:svg('<path d="M18 9c0 5-6 11-6 11S6 14 6 9a6 6 0 1 1 12 0Z"/><circle cx="12" cy="9" r="2"/>'),
};
export class UI {
  private actions: Actions;
  private toastTimer=0;
  private lastSelection:StationId|null|undefined=undefined;
  constructor(root:HTMLElement,actions:Actions){
    this.actions=actions;
    root.innerHTML=`
      <header class="topbar">
        <a class="brand" href="#" aria-label="沿线小镇返回全景"><span class="brand-icon">${icons.train}</span><span class="brand-title">沿线小镇<small>ALONGLINE TOWN</small></span></a>
        <div class="place-title"><span class="tiny-label">地方铁路物语</span><span>海岸山谷 <i>／</i> 初夏</span></div>
        <div class="top-stats"><div class="time-block"><span class="tiny-label" id="day">第 01 日</span><b id="time">08:00</b></div><div class="balance-block"><span class="tiny-label">可用资金</span><b><small>¥</small> <span id="balance">100,000</span></b></div></div>
        <button class="save-trigger" id="save-menu">${icons.save}<span>存档</span></button>
      </header>
      <aside class="sidebar">
        <div class="chapter"><span>01</span><div><small>第一章</small><h1>海风始发的地方</h1></div></div>
        <p class="intro">从海边到山间，<br>让小镇的日常，沿铁路相遇。</p>
        <div class="section-heading"><span>沿线聚落</span><small>3 PLACES</small></div>
        <nav class="town-list" aria-label="沿线聚落">${TOWNS.map((t,i)=>`<button class="town-card" data-town="${STATIONS[i].id}" aria-label="查看${t.name}"><span class="town-art art-${i}">${icons[i===0?'sun':i===1?'leaf':'compass']}</span><span class="town-copy"><strong>${t.name}<small>${t.kind}</small></strong><span>${t.subtitle}</span></span><span class="town-arrow">↗</span></button>`).join('')}</nav>
        <div class="selection-panel" id="selection-panel"></div>
        <div class="sidebar-note">${icons.leaf}<p>一条铁路的故事，<br>从认识这片土地开始。</p></div>
      </aside>
      <main id="viewport" aria-label="三维地图"><div class="map-topline"><span class="survey-tag"><span></span> 地形勘察</span><span>海岸山谷 <i>MAP 01</i></span></div><div class="loading" id="loading">正在展开海岸山谷…</div></main>
      <div class="view-tools" aria-label="视角工具"><div class="north">N<span>↑</span></div><button id="home-view" title="全景视角 (Home)" aria-label="全景视角">${icons.home}</button><button id="zoom-in" title="拉近" aria-label="拉近">＋</button><button id="zoom-out" title="拉远" aria-label="拉远">−</button><span class="tool-divider"></span><button id="help" title="操作说明" aria-label="操作说明">${icons.help}</button></div>
      <div class="map-caption"><span class="caption-line"></span><span>慢一点，风景就在沿线。</span></div>
      <footer class="bottom-bar">
        <div class="route-title"><span class="tiny-label">线路展望</span><strong>海岸与山谷之间</strong><span class="route-state">尚未建设</span></div>
        <div class="route-map" aria-label="规划线路 A汐港—B青溪—D枫泉，尚未建设"><button data-route="A"><span>A</span><b>汐港</b></button><div class="route-line"><small>主线规划</small></div><button data-route="B"><span>B</span><b>青溪</b></button><div class="route-line future"><small>第 7 阶段</small></div><button class="future" data-route="D"><span>D</span><b>枫泉</b></button></div>
        <div class="time-controls"><span class="tiny-label" id="simulation-status">时间流逝中</span><div><button id="pause" aria-label="暂停" aria-pressed="false">Ⅱ</button><span class="control-divider"></span>${[1,2,4].map(n=>`<button data-speed="${n}" aria-label="${n}倍速" aria-pressed="${n===1}">${n}×</button>`).join('')}</div></div>
      </footer>
      <div class="hint-bar"><span class="desktop-hint">拖动旋转 <i>·</i> 右键平移 <i>·</i> 滚轮缩放 <i>·</i> 点击站位查看 <i>·</i> Esc 取消</span><span class="touch-hint">一指旋转 · 双指平移与缩放 · 点击站位查看</span><span id="save-status">本地自动存档</span></div>
      <div class="toast" role="status" aria-live="polite" id="toast" hidden></div>
      <dialog id="save-dialog" aria-labelledby="save-title"><div class="dialog-heading"><div><span class="tiny-label">CONTINUE THE JOURNEY</span><h2 id="save-title">留住这段沿线时光</h2></div><button class="dialog-close" aria-label="关闭存档面板">×</button></div><p>地图、时间、资金与视角保存在当前浏览器。<br>导出一份文件，也能带到下一次旅程。</p><div class="save-actions"><button id="save-now" class="primary">保存当前进度</button><button id="load-save">读取本地存档</button><button id="export-save">导出 JSON</button><button id="import-save">导入 JSON</button></div><input type="file" id="import-file" accept="application/json,.json" hidden/><small class="dialog-footnote">每 15 秒自动保存；载入先校验，不重复生成场景。<br>离线可用 · 存档格式 v1 · 阶段 1</small></dialog>
      <dialog id="help-dialog" aria-labelledby="help-title"><div class="dialog-heading"><h2 id="help-title">自在地，看看小镇</h2><button class="dialog-close" aria-label="关闭操作说明">×</button></div><dl><dt>旋转</dt><dd>鼠标左键拖动 / 触屏一指拖动</dd><dt>平移</dt><dd>鼠标右键拖动 / 触屏双指拖动</dd><dt>缩放</dt><dd>滚轮 / 双指捏合 / 右侧 ＋ −</dd><dt>选择</dt><dd>点击地图站位或聚落卡片；Esc 或点击空地取消</dd><dt>快捷键</dt><dd>Space 暂停与继续，Home 回到全景</dd></dl><p>目前是第 1 阶段的地形勘察。A、B 是可建设候选站，D 将在第 7 阶段解锁。正式建站与铺轨从第 2 阶段开始。</p></dialog>
      <div class="webgl-error" id="webgl-error" hidden></div>`;
    root.querySelector('.brand')!.addEventListener('click',e=>{e.preventDefault();actions.home();});
    root.querySelectorAll<HTMLButtonElement>('[data-town]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.town as StationId;actions.select(id);actions.focus(id);}));
    root.querySelectorAll<HTMLButtonElement>('[data-route]').forEach(b=>b.addEventListener('click',()=>{actions.select(b.dataset.route as StationId);}));
    root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b=>b.addEventListener('click',()=>actions.speed(Number(b.dataset.speed) as 1|2|4)));
    this.click('pause',actions.pause);this.click('home-view',actions.home);this.click('zoom-in',()=>actions.zoom(.8));this.click('zoom-out',()=>actions.zoom(1.25));
    this.click('save-menu',()=>this.open('save-dialog'));this.click('help',()=>this.open('help-dialog'));
    document.querySelectorAll<HTMLDialogElement>('dialog').forEach(d=>{
      d.querySelector('.dialog-close')!.addEventListener('click',()=>d.close());
      d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
    });
    this.click('save-now',actions.save);this.click('load-save',actions.load);this.click('export-save',actions.export);
    this.click('import-save',()=>document.getElementById('import-file')!.click());
    document.getElementById('import-file')!.addEventListener('change',async e=>{const input=e.target as HTMLInputElement;if(input.files?.[0])await actions.import(input.files[0]);input.value='';});
    this.selection(null);
  }
  private click(id:string,fn:()=>void){document.getElementById(id)!.addEventListener('click',fn);}
  private open(id:string){(document.getElementById(id) as HTMLDialogElement).showModal();}
  selection(id:StationId|null){
    if(this.lastSelection===id)return;this.lastSelection=id;
    const panel=document.getElementById('selection-panel')!;const s=STATIONS.find(s=>s.id===id);
    document.querySelectorAll<HTMLButtonElement>('[data-town]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.town===id)));
    if(!s){panel.innerHTML=`<div class="section-heading"><span>勘察手记</span><small>FIELD NOTES</small></div><div class="field-note">${icons.pin}<h2>下一站，在哪里？</h2><p>点击地图上的候选站位，<br>认识小镇与未来的线路。</p><span class="stage-badge">第 1 阶段 · 基础场景</span></div>`;return;}
    panel.innerHTML=`<div class="section-heading"><span>站位档案</span><button id="deselect" aria-label="取消选择">×</button></div><div class="station-detail"><div class="station-detail-title"><span class="detail-letter">${s.id}</span><h2>${s.name}<small>${s.unlocked?'初期可建 · 尚未建设':'第 7 阶段开放'}</small></h2></div><p>${s.description}</p><div class="detail-meta"><span>建站预算 <b>¥ ${CONFIG.stationCosts[s.id as 'A'|'B'|'D']?.toLocaleString('en-US')??'—'}</b></span><span>会让泊位 <b>${s.berths}</b></span></div><button id="focus-station" class="focus-button">${icons.pin} 定位此处 <span>↗</span></button><small class="stage-badge">建造功能将于第 2 阶段开放</small></div>`;
    this.click('deselect',()=>this.actions.select(null));this.click('focus-station',()=>this.actions.focus(s.id));
  }
  update(world:WorldState){
    const {day,time}=clockText(world.clock.minutes);
    document.getElementById('day')!.textContent=`第 ${day} 日`;
    document.getElementById('time')!.textContent=time;
    document.getElementById('balance')!.textContent=world.economy.balance.toLocaleString('en-US');
    const pause=document.getElementById('pause')!;pause.textContent=world.clock.paused?'▶':'Ⅱ';pause.setAttribute('aria-pressed',String(world.clock.paused));pause.setAttribute('aria-label',world.clock.paused?'继续':'暂停');
    document.getElementById('simulation-status')!.textContent=world.clock.paused?'时光暂停中':'时间流逝中';
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.speed)===world.clock.speed)));
    this.selection(world.selected);
  }
  toast(message:string,error=false){const t=document.getElementById('toast')!;clearTimeout(this.toastTimer);t.textContent=message;t.classList.toggle('error',error);t.hidden=false;this.toastTimer=window.setTimeout(()=>{t.hidden=true;},4500);}
  saved(text:string){document.getElementById('save-status')!.textContent=text;}
}
