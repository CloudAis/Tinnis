import { CONFIG } from '../config';
import { STATIONS, type StationId } from '../world/map';
import { EDGES, NODES, edgeLength, edgePrice, stationName, type EditorState, type NodeId } from '../world/railway';
import { deploymentReadiness, previewTrack, type Command } from '../simulation/construction';
import type { WorldState } from '../world/state';
export interface ConstructionActions {
  mode(mode:EditorState['mode']):void;
  endpoint(slot:'from'|'to',id:NodeId|null):void;
  command(c:Command):void;
  confirm():void;
  select(id:StationId|null):void;
  focus(id:StationId):void;
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const money=(n:number)=>n.toLocaleString('en-US');
export class ConstructionUI {
  private key='';
  constructor(private actions:ConstructionActions){
    document.querySelectorAll<HTMLButtonElement>('button[data-mode]').forEach(b=>b.addEventListener('click',()=>{document.querySelector('.sidebar')!.classList.remove('collapsed');const toggle=document.getElementById('collapse-tools')!;toggle.textContent='⌄';toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','收起建设面板');actions.mode(b.dataset.mode as EditorState['mode']);}));
  }
  update(world:WorldState,editor:EditorState){
    const key=JSON.stringify([world.selected,world.railway,world.economy.balance,editor]);
    if(key===this.key)return;this.key=key;
    const r=world.railway,ready=deploymentReadiness(world);
    document.querySelectorAll<HTMLButtonElement>('button[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===editor.mode)));
    (document.querySelector('.town-list') as HTMLElement).hidden=editor.mode!=='inspect';
    document.querySelector('.sidebar')!.setAttribute('data-tool',editor.mode);
    document.querySelector('.survey-tag')!.innerHTML=`<span></span> ${editor.mode==='track'?'走廊铺轨':editor.mode==='line'?'线路规划':editor.mode==='train'?'地方列车':'站点建设'}`;
    document.querySelector('.route-title strong')!.textContent=r.line.name;
    document.querySelector('.route-state')!.textContent=ready.ok?'线路已连通':'线路未就绪';
    document.querySelector('.route-map')!.setAttribute('aria-label',`主线 A—B；停站顺序 ${r.line.stops.map(id=>stationName(r,id)).join('—')}；预留 B—D 未开放；${ready.reason}`);
    const ab=document.querySelectorAll<HTMLButtonElement>('.route-map button:not(.future)');
    (['A','B'] as const).forEach((id,i)=>{const b=ab[i];b.dataset.route=id;b.querySelector('span')!.textContent=id;b.querySelector('b')!.textContent=stationName(r,id).replace(/站$/u,'');});
    const line=document.querySelector('.route-line:not(.future)')!;line.classList.toggle('complete',ready.ok);line.querySelector('small')!.textContent=ready.ok?`${ready.length.toFixed(1)} 米 · 连通`:'主线待连通';
    const panel=document.getElementById('selection-panel')!;
    if(editor.mode==='track')this.trackPanel(panel,world,editor);
    else if(editor.mode==='line')this.linePanel(panel,world);
    else if(editor.mode==='inspect')this.stationPanel(panel,world);
  }
  private bind(id:string,fn:()=>void){document.getElementById(id)?.addEventListener('click',fn);}
  private stationPanel(panel:HTMLElement,world:WorldState){
    const id=world.selected,s=STATIONS.find(s=>s.id===id),r=world.railway;
    document.querySelectorAll<HTMLButtonElement>('[data-town]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.town===id)));
    if(!s){
      panel.innerHTML=`<div class="section-heading"><span>建设手记</span><small>BUILD YOUR RAILWAY</small></div><div class="field-note"><h2>让第一条铁路，连接日常</h2><p>先点击 A、B 候选站位建站，再切到「铺轨」选择起终点。两站一线预算 ¥ 28,000。</p><span class="stage-badge">已建 ${Object.keys(r.stations).length} 站 · ${Object.keys(r.tracks).length} 段轨道</span></div><button class="subtle-button" id="optional-c">C 河谷观景站 · 可选预留 ↗</button>`;
      this.bind('optional-c',()=>this.actions.select('C'));return;
    }
    const built=r.stations[s.id],name=built?.name??s.name;
    panel.innerHTML=`<div class="section-heading"><span>站位档案</span><button id="deselect" aria-label="取消选择">×</button></div><div class="station-detail"><div class="station-detail-title"><span class="detail-letter">${s.id}</span><h2>${escape(name)}<small>${built?'车站已建成':s.unlocked?'初期可建 · 尚未建设':s.optional?'可选支线 · 本阶段未开放':'第 7 阶段开放'}</small></h2></div><p>${s.description}</p><div class="detail-meta"><span>${built?'原购建价':'建站预算'} <b>¥ ${money(built?.paid??CONFIG.stationCosts[s.id])}</b></span><span>会让泊位 <b>${s.berths}</b></span></div><button id="focus-station" class="focus-button">定位此处 ↗</button>${built?`<label class="editor-label" for="station-name">车站名称</label><div class="name-editor"><input id="station-name" value="${escape(built.name)}" maxlength="32" autocomplete="off" aria-label="车站名称"/><button id="rename-station">保存</button></div><button class="danger-button" id="remove-station">拆除车站 · 退 ¥ ${money(Math.floor(built.paid*CONFIG.demolitionRefund))}</button>`:`<button class="primary build-button" id="build-station" ${s.unlocked?'':'disabled'}>${s.unlocked?`建设车站 · ¥ ${money(CONFIG.stationCosts[s.id])}`:'尚未解锁'}</button>`}</div>`;
    this.bind('deselect',()=>this.actions.select(null));this.bind('focus-station',()=>this.actions.focus(s.id));
    this.bind('build-station',()=>this.actions.command({type:'build-station',station:s.id,revision:r.revision}));
    this.bind('remove-station',()=>this.actions.command({type:'remove-station',station:s.id,revision:r.revision}));
    this.bind('rename-station',()=>this.actions.command({type:'rename-station',station:s.id,name:(document.getElementById('station-name') as HTMLInputElement).value,revision:r.revision}));
  }
  private trackPanel(panel:HTMLElement,world:WorldState,editor:EditorState){
    const p=previewTrack(world,editor.from,editor.to),r=world.railway;
    const options=(selected:string|null)=>`<option value="">选择节点…</option>${NODES.map(n=>`<option value="${n.id}" ${selected===n.id?'selected':''}>${n.name}</option>`).join('')}`;
    panel.innerHTML=`<div class="section-heading"><span>预设走廊铺轨</span><small>A—B MAINLINE</small></div><p class="editor-explainer">点击地图节点，或选择起终点。靠近节点的地面点击会自动吸附；仅沿预设走廊铺轨。</p><div class="endpoint-grid"><label>起点<select id="track-from" aria-label="轨道起点">${options(editor.from)}</select></label><span>→</span><label>终点<select id="track-to" aria-label="轨道终点">${options(editor.to)}</select></label></div><div class="preview-summary ${p.ok?'valid':'invalid'}"><div><span>新增工程预算</span><b id="preview-cost">¥ ${money(p.cost)}</b></div><p id="preview-reason">${p.reason||`${p.path!.length.toFixed(1)} 米 · ${p.missing.length} 段待建 · 确认后扣费`}</p></div><button id="preview-build" class="primary build-button" ${p.ok?'':'disabled'}>预览并确认建设</button><button id="clear-preview" class="subtle-button">清空端点</button><div class="section-heading track-heading"><span>主线资产</span><small>${Object.keys(r.tracks).length} / 3 BUILT</small></div><div class="track-assets">${EDGES.filter(e=>e.unlocked).map(e=>`<div class="track-asset ${r.tracks[e.id]?'built':''}"><div><b>${e.name}</b><small>${edgeLength(e.id).toFixed(1)} 米 · ¥ ${money(r.tracks[e.id]?.paid??edgePrice(e.id))}</small></div>${r.tracks[e.id]?`<button data-remove-edge="${e.id}" aria-label="拆除${e.name}">拆除<br><small>退 ${money(Math.floor(r.tracks[e.id]!.paid*CONFIG.demolitionRefund))}</small></button>`:'<span>未建</span>'}</div>`).join('')}</div><p class="reserved-note">B—D 预留 ¥ 8,000，第 7 阶段开放。C 河谷为可选支线，本阶段不建设。</p>`;
    for(const slot of ['from','to'] as const)document.getElementById(`track-${slot}`)!.addEventListener('change',e=>this.actions.endpoint(slot,(e.target as HTMLSelectElement).value as NodeId||null));
    this.bind('preview-build',()=>{if(editor.from&&editor.to)this.actions.command({type:'build-track',from:editor.from,to:editor.to,revision:r.revision});});
    this.bind('clear-preview',()=>this.actions.endpoint('from',null));
    panel.querySelectorAll<HTMLButtonElement>('[data-remove-edge]').forEach(b=>b.addEventListener('click',()=>this.actions.command({type:'remove-track',edge:b.dataset.removeEdge as any,revision:r.revision})));
  }
  private linePanel(panel:HTMLElement,world:WorldState){
    const r=world.railway,ready=deploymentReadiness(world);
    panel.innerHTML=`<div class="section-heading"><span>${escape(r.line.name)}</span><small>LINE 01</small></div><div id="line-readiness" class="line-readiness ${ready.ok?'valid':'invalid'}"><strong>${ready.ok?'两镇之间，已然相连':'线路尚未就绪'}</strong><p>${escape(ready.reason)}</p></div><label class="editor-label">停站顺序（保存后生效）</label><small id="stop-draft-note">当前：${r.line.stops.map(id=>escape(stationName(r,id))).join(' → ')}</small><div class="stop-order">${r.line.stops.map((id,i)=>`<label><span>${i+1}</span><select data-stop-index="${i}" aria-label="第${i+1}停靠站">${STATIONS.map(s=>`<option value="${s.id}" ${s.id===id?'selected':''} ${s.unlocked?'':'disabled'}>${s.id} · ${escape(stationName(r,s.id))}${s.unlocked?'':'（锁定）'}</option>`).join('')}</select></label>`).join('')}</div><div class="order-actions"><button id="save-stops" class="primary">保存顺序</button><button id="reverse-stops">反向停靠 ⇄</button></div><div class="line-metrics"><span>已建车站<b>${Object.keys(r.stations).length}</b></span><span>有效路径<b>${ready.ok?ready.length.toFixed(1)+' m':'—'}</b></span></div><p class="route-node-list">${ready.ok?ready.nodes.map(id=>NODES.find(n=>n.id===id)!.name).join(' → '):'车站和沿途每段轨道都齐备后，才有可用运行路径。'}</p><button id="can-dispatch" class="dispatch-status" disabled data-ready="${ready.ok}">${ready.ok?'线路就绪 · 前往列车页投放':'线路无效 · 不可投车'}</button><p class="reserved-note">拆除站或轨道后立即重算路径。已投放车辆依赖的线路受到保护，停运并回库后才可拆除。</p>`;
    panel.querySelectorAll('[data-stop-index]').forEach(s=>s.addEventListener('change',()=>{document.getElementById('stop-draft-note')!.textContent='有未保存的顺序；保存后才更新运行路径。';}));
    this.bind('save-stops',()=>this.actions.command({type:'set-stops',stops:[...panel.querySelectorAll<HTMLSelectElement>('[data-stop-index]')].map(s=>s.value as StationId),revision:r.revision}));
    this.bind('reverse-stops',()=>this.actions.command({type:'set-stops',stops:[...r.line.stops].reverse(),revision:r.revision}));
  }
}
