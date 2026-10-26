import { guideIndex,syncJourney } from './world/journey';
import { Soundscape } from './audio/soundscape';
import { setPresentation,type PresentationState } from './world/presentation';
import { describeUpgrade,executeUpgrade,type UpgradeCommand } from './simulation/development';
import { setBusiness } from './simulation/finance';
import { passengerStats } from './world/passengers';
import { describeTrainCommand, executeTrainCommand, type TrainCommand } from './simulation/train';
import './ui/style.css';
import { UI } from './ui/app';
import { WorldView } from './render/view';
import { newEditor, type EditorState, type NodeId } from './world/railway';
import { describeCommand, executeCommand, deploymentReadiness, type Command } from './simulation/construction';
import { Simulation } from './simulation/clock';
import { createWorld, type Speed } from './world/state';
import { type StationId } from './world/map';
import { decodeSave, encodeSave, readLocal, readLocalStatus,readRecovery, writeLocal } from './storage/save';

let world=createWorld();
let initialNotice='';
try { const status=readLocalStatus();if(status.save){world=status.save.world;initialNotice=status.recovered?'主存档损坏，已回到有效备份。建议导出备份。':'已回到上次停留的沿线时光。';} } catch(e){initialNotice=`${(e as Error).message} 将使用初始世界，原存档保留至下次成功保存。`;}
let view:WorldView|undefined;
let editor:EditorState=newEditor();
let pending:Command|null=null;
let pendingTrain:TrainCommand|null=null;
let pendingUpgrade:UpgradeCommand|null=null;
let saveBlocked=!!initialNotice&&initialNotice.includes('初始世界');
const simulation=new Simulation(world);
const soundscape=new Soundscape();soundscape.reset(world);
function refresh(){syncJourney(world);view?.syncRailway(world,editor);ui.update(world,editor);const a=soundscape.stats();document.getElementById('sound-state')!.textContent=a.unavailable?'当前浏览器未能启用声音':a.state==='locked'?'首次操作后启用声音':world.presentation.muted?'已总静音':'行车 · 到站 · 环境声已启用';}
function select(id:StationId|null){
  if(id!==null)editor.mode='inspect';
  else if(editor.mode==='track'){editor.from=null;editor.to=null;}
  world.selected=id;view?.setSelection(id);refresh();
}
function nodeSelect(id:NodeId|null){
  if(!id){ui.toast('请靠近候选节点点击；轨道只能沿预设走廊建设。');return;}
  if(!editor.from||editor.to){editor.from=id;editor.to=null;}else editor.to=id;
  refresh();
}
function commit(c:Command){const result=executeCommand(world,c);refresh();ui.toast(result.message,!result.ok);if(result.ok)store();}
function request(c:Command){
  const d=describeCommand(world,c);
  if(!d.ok){ui.toast(d.message,true);return;}
  if(c.type==='rename-station'||c.type==='set-stops'){commit(c);return;}
  pendingTrain=null;pendingUpgrade=null;pending=c;ui.confirmation(d.message,d.amount,c.type.startsWith('remove'));
}
function requestTrain(c:TrainCommand){
  if(c.type==='follow'){present({cameraMode:c.enabled?'follow':'overview'});return;}
  const d=describeTrainCommand(world,c);if(!d.ok){ui.toast(d.message,true);return;}
  if(c.type==='buy'||c.type==='sell'){pendingTrain=c;pending=null;pendingUpgrade=null;ui.confirmation(d.message,d.amount,c.type==='sell',c.type==='buy'?'确认购车':'确认出售');}
  else commitTrain(c);
}
function commitTrain(c:TrainCommand){const before=world.presentation.cameraMode;const d=executeTrainCommand(world,c);if(c.type!=='select')simulation.resetElapsed();if(before!==world.presentation.cameraMode&&world.presentation.cameraMode==='overview')view?.resetCamera();refresh();ui.toast(d.message,!d.ok);if(d.ok)store();}
function present(p:Partial<PresentationState>){const d=setPresentation(world,p);if(!d.ok){ui.toast(d.message,true);return;}if(p.cameraMode==='overview')view?.resetCamera();soundscape.update(world);refresh();store();}
function syncCamera(){if(view)world.camera=view.getCamera();}
function store(manual=false){
  if(saveBlocked&&!manual)return false;
  try{syncCamera();writeLocal(world);saveBlocked=false;ui.saved(`已保存 · ${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`);if(manual)ui.toast('进度已保存，小镇会在这里等你。');return true;}
  catch{ui.saved('本地保存不可用');ui.toast('无法写入浏览器存储，请导出 JSON 备份。',true);return false;}
}
function restore(raw:string){
  const saved=decodeSave(raw); // Atomic validation before replacing any live state.
  world=saved.world;simulation.state=world;simulation.resetElapsed();editor=newEditor();pending=null;pendingTrain=null;pendingUpgrade=null;ui.closeConfirmation();
  soundscape.reset(world);view?.setCamera(world.camera,world.presentation.cameraMode);view?.setSelection(world.selected);refresh();saveBlocked=false;
}
const ui=new UI(document.getElementById('app')!,{
  pause(){world.clock.paused=!world.clock.paused;simulation.resetElapsed();refresh();},
  speed(n:Speed){world.clock.speed=n;simulation.resetElapsed();refresh();},
  select,
  guide(action){
    if(action==='skip')world.journey.skipped=true;
    else if(action==='restart')world.journey.skipped=false;
    else{const i=guideIndex(world);if(i===0||i===1)select(i===0?'A':'B');else{const mode=i===2?'track':i===3||i===4?'train':i===5?'passengers':i===6?'business':'train';editor.mode=mode;if(mode==='passengers')world.journey.viewed.waiting=true;if(mode==='business')world.journey.viewed.business=true;document.querySelector('.sidebar')!.classList.remove('collapsed');}}
    refresh();document.getElementById('journey-guide')!.scrollIntoView({block:'nearest'});store();
  },
  newGame(){if(!store(true))return;restore(encodeSave(createWorld()));if(store())ui.toast('新旅程已开始，上次有效进度可在存档面板恢复。');},
  recover(solvent){try{const saved=readRecovery(solvent);if(!saved){ui.toast('还没有可用恢复点，请导入备份或出售安全空车恢复资金。',true);return;}restore(JSON.stringify(saved));if(store())ui.toast(solvent?'已回到最近正余额存档，时间与账目一并回退。':'已恢复上次有效存档。');}catch(e){ui.toast((e as Error).message,true);}},
  mode(mode){editor.mode=mode;if(mode==='passengers')world.journey.viewed.waiting=true;if(mode==='business')world.journey.viewed.business=true;if(['track','line'].includes(mode)&&['follow','passenger'].includes(world.presentation.cameraMode)){setPresentation(world,{cameraMode:'overview'});view?.resetCamera();}refresh();},
  endpoint(slot,id){editor[slot]=id;if(slot==='from'&&!id)editor.to=null;refresh();},
  command:request,
  trainCommand:requestTrain,
  business(fare,interval,revision){const result=setBusiness(world,fare,interval,revision);ui.toast(result.message,!result.ok);refresh();if(result.ok)store();},
  upgrade(c){const d=describeUpgrade(world,c);if(!d.ok){ui.toast(d.message,true);return;}pending=null;pendingTrain=null;pendingUpgrade=c;ui.confirmation(d.message,d.amount,!!c.remove,c.remove?'确认拆除升级':'确认站区升级');},
  confirm(){const c=pending,t=pendingTrain,u=pendingUpgrade;pending=null;pendingTrain=null;pendingUpgrade=null;ui.closeConfirmation();if(c)commit(c);if(t)commitTrain(t);if(u){const d=executeUpgrade(world,u);refresh();ui.toast(d.message,!d.ok);if(d.ok)store();}},
  presentation:present,
  focus(id){setPresentation(world,{cameraMode:'station',station:id});view?.focus(id);refresh();},home(){setPresentation(world,{cameraMode:'overview'});view?.resetCamera();select(null);},zoom(f){view?.zoom(f);},
  save(){store(true);},
  load(){try{const saved=readLocal();if(!saved){ui.toast('还没有本地存档，可以先保存当前进度。');return;}restore(JSON.stringify(saved));ui.toast('已读取存档，地图与视角已恢复。');}catch(e){ui.toast((e as Error).message,true);}},
  export(){
    syncCamera();const blob=new Blob([encodeSave(world)],{type:'application/json'});const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download='沿线小镇-进度.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);ui.toast('已导出进度文件。');
  },
  async import(file){
    try{if(file.size>8_000_000)throw new Error('存档文件过大。');restore(await file.text());if(store())ui.toast('导入成功，欢迎回到沿线。');}
    catch(e){ui.toast((e as Error).message,true);}
  },
});
document.getElementById('construction-dialog')!.addEventListener('close',()=>{if(!(document.getElementById('construction-dialog') as HTMLDialogElement).open){pending=null;pendingTrain=null;pendingUpgrade=null;}});
refresh();
try{
  view=new WorldView(document.getElementById('viewport')!,select,()=>{},nodeSelect);
  view.setCamera(world.camera,world.presentation.cameraMode);view.setSelection(world.selected);refresh();
  document.getElementById('loading')!.remove();
  if(initialNotice)ui.toast(initialNotice,saveBlocked);
  view.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();world.clock.paused=true;simulation.resetElapsed();refresh();ui.toast('图形上下文已丢失，模拟已暂停。请保存后刷新页面。',true);});
}catch(e){
  const error=document.getElementById('webgl-error')!;error.hidden=false;
  error.innerHTML='<h2>暂时无法展开三维地图</h2><p>此游戏需要 WebGL2。请启用浏览器硬件加速，或使用支持 WebGL2 的较新浏览器。你的已有存档不会被覆盖。</p><button id="retry">重新加载</button>';
  document.getElementById('retry')!.onclick=()=>location.reload();
  console.error('三维场景初始化失败',e);saveBlocked=true;
}
let previous=performance.now(),lastUI=0;
const frames:number[]=[];
function frame(now:number){
  const delta=(now-previous)/1000;previous=now;
  if(!document.hidden&&view){
    simulation.advance(delta);view.updateTrain(world,simulation.visualPoses(),delta);soundscape.update(world);view.render();
    frames.push(delta*1000);if(frames.length>180)frames.shift();
    if(now-lastUI>160){refresh();lastUI=now;}
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(()=>{if(view&&!document.hidden)store();},60_000);
document.addEventListener('visibilitychange',()=>{soundscape.setHidden(document.hidden);previous=performance.now();simulation.resetElapsed();if(document.hidden&&view)store();});
window.addEventListener('pagehide',()=>{if(view)store();soundscape.dispose();});
document.addEventListener('pointerdown',e=>{if(e.isTrusted)void soundscape.unlock(world);},{capture:true});
document.addEventListener('keydown',e=>{if(e.isTrusted&&!e.repeat)void soundscape.unlock(world);},{capture:true});
document.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLElement&&(e.target.matches('input,textarea,select,button,a')||e.target.isContentEditable))return;
  if(document.querySelector('dialog[open]'))return;
  if(e.code==='Space'){e.preventDefault();world.clock.paused=!world.clock.paused;simulation.resetElapsed();refresh();}
  if(e.code==='Home'){e.preventDefault();setPresentation(world,{cameraMode:'overview'});view?.resetCamera();select(null);}
  if(e.code==='Escape')select(null);
});
if(import.meta.env.PROD&&'serviceWorker'in navigator){
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(()=>{
    navigator.serviceWorker.ready.then(()=>{ui.saved('离线资源已缓存 · 自动存档');});
  }).catch(()=>{ui.saved('离线缓存不可用 · 可用本地发行包');});
}
// Opt-in, read-only diagnostics for repeatable browser acceptance and performance baselines.
if(new URLSearchParams(location.search).has('diagnostics')){
  Object.defineProperty(window,'__ALONGLINE__',{value:{snapshot(){
    syncCamera();const sorted=[...frames].sort((a,b)=>a-b);
    return {world:structuredClone(world),editor:structuredClone(editor),line:deploymentReadiness(world),passengerStats:passengerStats(world.passengers),render:view?.stats(),audio:soundscape.stats(),performance:{samples:frames.length,medianFrameMs:sorted[Math.floor(sorted.length/2)]??0,p95FrameMs:sorted[Math.floor(sorted.length*.95)]??0},webgl:view?.renderer.getContext().getParameter(WebGL2RenderingContext.RENDERER)};
  }},writable:false});
}
