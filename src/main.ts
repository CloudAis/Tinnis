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
import { decodeSave, encodeSave, readLocal, writeLocal } from './storage/save';

let world=createWorld();
let initialNotice='';
try { const saved=readLocal();if(saved){world=saved.world;initialNotice='已回到上次停留的沿线时光。';} } catch(e){initialNotice=`${(e as Error).message} 将使用初始世界，原存档保留至下次成功保存。`;}
let view:WorldView|undefined;
let editor:EditorState=newEditor();
let pending:Command|null=null;
let pendingTrain:TrainCommand|null=null;
let saveBlocked=!!initialNotice&&initialNotice.includes('初始世界');
const simulation=new Simulation(world);
function refresh(){view?.syncRailway(world,editor);ui.update(world,editor);}
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
  pendingTrain=null;pending=c;ui.confirmation(d.message,d.amount,c.type.startsWith('remove'));
}
function requestTrain(c:TrainCommand){
  const d=describeTrainCommand(world,c);if(!d.ok){ui.toast(d.message,true);return;}
  if(c.type==='buy'||c.type==='sell'){pendingTrain=c;pending=null;ui.confirmation(d.message,d.amount,c.type==='sell',c.type==='buy'?'确认购车':'确认出售');}
  else commitTrain(c);
}
function commitTrain(c:TrainCommand){const d=executeTrainCommand(world,c);simulation.resetElapsed();refresh();ui.toast(d.message,!d.ok);if(d.ok)store();}
function syncCamera(){if(view)world.camera=view.getCamera();}
function store(manual=false){
  if(saveBlocked&&!manual)return;
  try{syncCamera();writeLocal(world);saveBlocked=false;ui.saved(`已保存 · ${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`);if(manual)ui.toast('进度已保存，小镇会在这里等你。');}
  catch{ui.saved('本地保存不可用');ui.toast('无法写入浏览器存储，请导出 JSON 备份。',true);}
}
function restore(raw:string){
  const saved=decodeSave(raw); // Atomic validation before replacing any live state.
  world=saved.world;simulation.state=world;simulation.resetElapsed();editor=newEditor();pending=null;pendingTrain=null;ui.closeConfirmation();
  view?.setCamera(world.camera);view?.setSelection(world.selected);refresh();saveBlocked=false;
}
const ui=new UI(document.getElementById('app')!,{
  pause(){world.clock.paused=!world.clock.paused;simulation.resetElapsed();refresh();},
  speed(n:Speed){world.clock.speed=n;simulation.resetElapsed();refresh();},
  select,
  mode(mode){editor.mode=mode;refresh();},
  endpoint(slot,id){editor[slot]=id;if(slot==='from'&&!id)editor.to=null;refresh();},
  command:request,
  trainCommand:requestTrain,
  business(fare,interval,revision){const result=setBusiness(world,fare,interval,revision);ui.toast(result.message,!result.ok);refresh();if(result.ok)store();},
  confirm(){const c=pending,t=pendingTrain;pending=null;pendingTrain=null;ui.closeConfirmation();if(c)commit(c);if(t)commitTrain(t);},
  focus(id){world.fleet.follow=false;view?.focus(id);},home(){world.fleet.follow=false;view?.resetCamera();select(null);},zoom(f){view?.zoom(f);},
  save(){store(true);},
  load(){try{const saved=readLocal();if(!saved){ui.toast('还没有本地存档，可以先保存当前进度。');return;}restore(JSON.stringify(saved));ui.toast('已读取存档，地图与视角已恢复。');}catch(e){ui.toast((e as Error).message,true);}},
  export(){
    syncCamera();const blob=new Blob([encodeSave(world)],{type:'application/json'});const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download='沿线小镇-进度.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);ui.toast('已导出进度文件。');
  },
  async import(file){
    try{if(file.size>8_000_000)throw new Error('存档文件过大。');restore(await file.text());store();ui.toast('导入成功，欢迎回到沿线。');}
    catch(e){ui.toast((e as Error).message,true);}
  },
});
document.getElementById('construction-dialog')!.addEventListener('close',()=>{if(!(document.getElementById('construction-dialog') as HTMLDialogElement).open){pending=null;pendingTrain=null;}});
refresh();
try{
  view=new WorldView(document.getElementById('viewport')!,select,()=>{},nodeSelect);
  view.setCamera(world.camera);view.setSelection(world.selected);refresh();
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
    simulation.advance(delta);view.updateTrain(world,simulation.visualPose());view.render();
    frames.push(delta*1000);if(frames.length>180)frames.shift();
    if(now-lastUI>160){refresh();lastUI=now;}
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(()=>{if(view&&!document.hidden)store();},15_000);
document.addEventListener('visibilitychange',()=>{previous=performance.now();simulation.resetElapsed();if(document.hidden&&view)store();});
window.addEventListener('pagehide',()=>{if(view)store();});
document.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLElement&&(e.target.matches('input,textarea,select,button,a')||e.target.isContentEditable))return;
  if(document.querySelector('dialog[open]'))return;
  if(e.code==='Space'){e.preventDefault();world.clock.paused=!world.clock.paused;simulation.resetElapsed();refresh();}
  if(e.code==='Home'){e.preventDefault();world.fleet.follow=false;view?.resetCamera();select(null);}
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
    return {world:structuredClone(world),editor:structuredClone(editor),line:deploymentReadiness(world),passengerStats:passengerStats(world.passengers),render:view?.stats(),performance:{samples:frames.length,medianFrameMs:sorted[Math.floor(sorted.length/2)]??0,p95FrameMs:sorted[Math.floor(sorted.length*.95)]??0},webgl:view?.renderer.getContext().getParameter(WebGL2RenderingContext.RENDERER)};
  }},writable:false});
}
