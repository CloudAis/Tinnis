import { GUIDE,guideIndex,MILESTONES,milestoneNames } from '../world/journey';
import type { WorldState } from '../world/state';
export interface JourneyActions { guide(action:'go'|'skip'|'restart'):void; newGame():void; recover(solvent:boolean):void }
export class JourneyUI {
 private key='';
 constructor(private actions:JourneyActions){document.querySelector('.intro')!.insertAdjacentHTML('afterend','<section id="journey-guide" aria-label="铁路入门引导"></section>');}
 update(w:WorldState){
  const i=guideIndex(w),j=w.journey,key=JSON.stringify([i,j,w.economy.balance<=0]);if(key===this.key)return;this.key=key;
  document.querySelectorAll('.guide-target').forEach(e=>e.classList.remove('guide-target'));
  const panel=document.getElementById('journey-guide')!,step=i<0?null:GUIDE[i];
  panel.innerHTML=`${!j.skipped&&step?`<div class="guide-card"><small>铁路入门 ${i+1} / ${GUIDE.length}</small><strong>${step.title}</strong><p>${step.text}</p><div><button id="guide-go" class="primary">去看看 ↗</button><button id="guide-skip">跳过引导</button></div></div>`:`<div class="guide-compact">${i<0?'✓ 入门运输已完成':'已跳过入门引导'} <button id="guide-restart">${i<0?'查看操作':'恢复引导'}</button></div>`}<details class="milestones"><summary>沿线里程碑 ${Object.keys(j.milestones).length} / ${MILESTONES.length}</summary><p>按真实经营记录留念，无现金奖励。</p>${MILESTONES.map(id=>`<span data-milestone="${id}" data-complete="${j.milestones[id]!==undefined}">${j.milestones[id]!==undefined?'✓':'○'} ${milestoneNames[id]}</span>`).join('')}</details>${w.economy.balance<=0?'<div class="recovery-note"><strong>资金耗尽，仍可继续经营</strong><p>在途车送达后停运。可出售安全空车、拆除闲置资产，或回退至正余额存档。</p><button id="guide-recover">打开恢复入口</button></div>':''}`;
  if(!j.skipped&&step)document.querySelector(step.target)?.classList.add('guide-target');
  panel.querySelector('#guide-go')?.addEventListener('click',()=>this.actions.guide('go'));
  panel.querySelector('#guide-skip')?.addEventListener('click',()=>this.actions.guide('skip'));
  panel.querySelector('#guide-restart')?.addEventListener('click',()=>i<0?(document.getElementById('help-dialog') as HTMLDialogElement).showModal():this.actions.guide('restart'));
  panel.querySelector('#guide-recover')?.addEventListener('click',()=>{(document.getElementById('save-dialog') as HTMLDialogElement).showModal();document.getElementById('recover-solvent')?.focus();});
 }
}
