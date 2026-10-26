import type { WorldState } from './state';
import { STATIONS,type StationId } from './map';
export const CAMERA_MODES=['overview','follow','passenger','station'] as const;
export type CameraMode=typeof CAMERA_MODES[number];
export interface PresentationState {cameraMode:CameraMode;weather:'auto'|'clear'|'rain';muted:boolean;volume:number;station:StationId}
export const newPresentation=(follow=false):PresentationState=>({cameraMode:follow?'follow':'overview',weather:'auto',muted:false,volume:.35,station:'A'});
export function validatePresentation(raw:any):PresentationState{
 if(!raw||!CAMERA_MODES.includes(raw.cameraMode)||!['auto','clear','rain'].includes(raw.weather)||typeof raw.muted!=='boolean'||typeof raw.volume!=='number'||!Number.isFinite(raw.volume)||raw.volume<0||raw.volume>1||!STATIONS.some(s=>s.id===raw.station))throw new Error('旅行、天气或声音设置无效，当前世界未更改。');
 return {cameraMode:raw.cameraMode,weather:raw.weather,muted:raw.muted,volume:raw.volume,station:raw.station};
}
export function setPresentation(w:WorldState,patch:Partial<PresentationState>){
 const next=validatePresentation({...w.presentation,...patch});
 if(['follow','passenger'].includes(next.cameraMode)&&!w.fleet.vehicle?.route)return {ok:false,message:'先投放并选中列车，再开始旅行。'};
 w.presentation=next;if(patch.cameraMode)w.fleet.follow=next.cameraMode==='follow'||next.cameraMode==='passenger';return {ok:true,message:'旅行设置已保存。'};
}
export function weatherAt(p:PresentationState,minutes:number){return p.weather==='auto'?(Math.floor(minutes/360)%4===2?'rain':'clear'):p.weather;}
export function daylightAt(minutes:number){const t=((minutes%1440)+1440)%1440,smooth=(x:number)=>{const a=Math.max(0,Math.min(1,x));return a*a*(3-2*a);};return smooth((t-300)/180)*(1-smooth((t-1020)/180));}
