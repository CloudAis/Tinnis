import type { WorldState } from '../world/state';
import type { PresentationState } from '../world/presentation';
import { daylightAt,weatherAt } from '../world/presentation';
import { STATIONS,type StationId } from '../world/map';
export interface TravelActions {presentation(p:Partial<PresentationState>):void;focus(id:StationId):void}
export class TravelUI {
 constructor(root:HTMLElement,actions:TravelActions){
  const bar=document.createElement('section');bar.className='travel-bar';bar.setAttribute('aria-label','旅行与声音');bar.innerHTML=`<div class="travel-views" role="group" aria-label="旅行视角"><button data-camera="overview" title="俯瞰全景">俯瞰</button><button data-camera="follow" title="选中列车的跟随视角">跟车</button><button data-camera="passenger" title="随车观景，自动避让遮挡">乘客观景</button></div><label class="weather-control"><span class="sr-only">天气观感</span><select id="weather" aria-label="天气观感"><option value="auto">天气自动</option><option value="clear">晴天</option><option value="rain">雨天</option></select></label><button id="sound-toggle" aria-label="总静音" aria-pressed="false">声音 开</button><details class="travel-more"><summary aria-label="音量与车站定位">更多</summary><div><label>音量 <input id="sound-volume" aria-label="总音量" type="range" min="0" max="100" value="35"></label><span>车站快速定位</span><div class="quick-stations">${STATIONS.filter(s=>!s.optional).map(s=>`<button data-quick-station="${s.id}" aria-label="快速定位${s.name}">${s.id} ${s.name.replace('站','')}</button>`).join('')}</div><small id="sound-state">首次操作后启用声音</small></div></details>`;
  root.append(bar);bar.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(b=>b.onclick=()=>actions.presentation({cameraMode:b.dataset.camera as PresentationState['cameraMode']}));
  bar.querySelector<HTMLSelectElement>('#weather')!.onchange=e=>actions.presentation({weather:(e.target as HTMLSelectElement).value as PresentationState['weather']});
  bar.querySelector<HTMLButtonElement>('#sound-toggle')!.onclick=()=>actions.presentation({muted:bar.querySelector('#sound-toggle')!.getAttribute('aria-pressed')!=='true'});
  bar.querySelector<HTMLInputElement>('#sound-volume')!.oninput=e=>actions.presentation({volume:Number((e.target as HTMLInputElement).value)/100});bar.querySelectorAll<HTMLButtonElement>('[data-quick-station]').forEach(b=>b.onclick=()=>{actions.focus(b.dataset.quickStation as StationId);bar.querySelector('details')!.open=false;});
  const caption=document.createElement('div');caption.className='journey-caption';caption.id='journey-caption';caption.setAttribute('aria-live','off');root.append(caption);
 }
 update(w:WorldState){const p=w.presentation,v=w.fleet.vehicle;document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.camera===p.cameraMode));b.disabled=b.dataset.camera!=='overview'&&!v?.route;});
  const weather=document.getElementById('weather') as HTMLSelectElement;if(document.activeElement!==weather)weather.value=p.weather;
  const sound=document.getElementById('sound-toggle')!;sound.setAttribute('aria-pressed',String(p.muted));sound.textContent=p.muted?'声音 关':'声音 开';const volume=document.getElementById('sound-volume') as HTMLInputElement;if(document.activeElement!==volume)volume.value=String(Math.round(p.volume*100));
  const caption=document.getElementById('journey-caption')!;caption.hidden=!['follow','passenger'].includes(p.cameraMode);caption.textContent=`${p.cameraMode==='passenger'?'车窗手记':'沿线旅行'} · ${v?.id??''} · ${v?.authority?`${v.authority.from} → ${v.authority.to}`:v?.currentStation??'车库'} · ${daylightAt(w.clock.minutes)<.3?'夜色':'日光'}${weatherAt(p,w.clock.minutes)==='rain'?' / 细雨':''}`;
  document.getElementById('viewport')!.classList.toggle('passenger-mode',p.cameraMode==='passenger');for(const id of ['zoom-in','zoom-out'])(document.getElementById(id) as HTMLButtonElement).disabled=p.cameraMode==='passenger';
 }
}
