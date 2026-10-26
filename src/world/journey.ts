import type { WorldState } from './state';
import { allTrains } from './fleet';
import { deploymentReadiness } from '../simulation/construction';
export const MILESTONES = ['service','transport','profit','upgrade','region'] as const;
export type Milestone = typeof MILESTONES[number];
export interface JourneyState { skipped:boolean; viewed:{waiting:boolean;business:boolean}; milestones:Partial<Record<Milestone,number>> }
export const newJourney=():JourneyState=>({skipped:false,viewed:{waiting:false,business:false},milestones:{}});
export const milestoneNames:Record<Milestone,string>={service:'首班通车',transport:'首趟运输',profit:'完整日运营盈利',upgrade:'首次车站升级',region:'枫泉区域开放'};
export function milestoneEvidence(w:WorldState):Record<Milestone,boolean>{return {
 service:Object.values(w.finance.departures).some(d=>d.length>0)||w.passengers.completed.length>0,
 transport:w.passengers.completed.length>0,
 profit:w.finance.days.some(d=>d.simulatedMinutes>=1440-1e-6&&d.net>0),
 upgrade:w.economy.ledger.some(e=>e.upgrade?.kind==='build'),region:w.development.unlockedD,
};}
export function syncJourney(w:WorldState){const proof=milestoneEvidence(w);for(const id of MILESTONES)if(proof[id]&&w.journey.milestones[id]===undefined)w.journey.milestones[id]=w.clock.minutes;}
export const GUIDE=[
 {id:'a',title:'在汐港建第一座车站',text:'选择 A 汐港候选点，查看 ¥8,000 工程，再确认建设。',target:'[data-route="A"]'},
 {id:'b',title:'让青溪也有车站',text:'选择 B 青溪，确认建设。青溪自带两个会让泊位。',target:'[data-route="B"]'},
 {id:'track',title:'连接 A—B 走廊',text:'在铺轨页选择汐港至青溪，预览 ¥12,000 后确认。',target:'button[data-mode="track"]'},
 {id:'buy',title:'购置一列轻型车',text:'在列车页购买轻型车 ¥22,000，初期保留经营周转金。',target:'button[data-mode="train"]'},
 {id:'dispatch',title:'投放首班列车',text:'在线路有效时投放列车；取消暂停，等待发车。',target:'#dispatch-train'},
 {id:'waiting',title:'看看谁在等车',text:'打开客流页。队列先进先上，24人满载后其余继续等候。',target:'button[data-mode="passengers"]'},
 {id:'business',title:'查看票款与成本',text:'打开经营页。票款到达后入账，成本按模拟时间和里程结算。',target:'button[data-mode="business"]'},
 {id:'trip',title:'完成首趟运输',text:'保持服务，等一批乘客到达目的地。之后可自行探索升级与支线。',target:'[data-speed="4"]'},
] as const;
export function guideIndex(w:WorldState){const done=[!!w.railway.stations.A,!!w.railway.stations.B,deploymentReadiness(w).ok,allTrains(w.fleet).length>0,allTrains(w.fleet).some(v=>v.route!==null),w.journey.viewed.waiting,w.journey.viewed.business,!!w.journey.milestones.transport];return done.findIndex(v=>!v);}
export function validateJourney(input:unknown,w:WorldState):JourneyState{
 const s=input as JourneyState;const bad=()=>{throw new Error('引导或里程碑数据无效，当前世界未更改。');};
 if(!s||typeof s.skipped!=='boolean'||!s.viewed||typeof s.viewed.waiting!=='boolean'||typeof s.viewed.business!=='boolean'||!s.milestones||Array.isArray(s.milestones))return bad();
 const j=newJourney();j.skipped=s.skipped;j.viewed={waiting:s.viewed.waiting,business:s.viewed.business};const proof=milestoneEvidence(w);
 for(const [id,time]of Object.entries(s.milestones)){if(!MILESTONES.includes(id as Milestone)||typeof time!=='number'||!Number.isFinite(time)||time<480||time>w.clock.minutes+1e-6||!proof[id as Milestone])return bad();j.milestones[id as Milestone]=time;}
 return j;
}
