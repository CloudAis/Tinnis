import { CONFIG } from '../config';
import { B_FRAME, edgeLength, STATION_NODES,pathPoints,findPath } from '../world/railway';
import type { StationId } from '../world/map';
import type { RouteSnapshot,Train } from '../world/fleet';
export function stationDistance(route:RouteSnapshot,station:StationId){const index=route.nodes.indexOf(STATION_NODES[station]);return route.edges.slice(0,index).reduce((n,id)=>n+edgeLength(id),0);}
export function legDuration(v:Train){if(!v.route||!v.authority)return CONFIG.journey.abMinutes;const a=v.authority;const length=Math.abs(stationDistance(v.route,a.to)-stationDistance(v.route,a.from));return CONFIG.journey.abMinutes*length/findPath('node-a','node-b',()=>true)!.length;}
export function nextStation(v:Train):StationId{const r=v.route!,i=r.stops.indexOf(v.currentStation!);if(i===0)v.direction=1;else if(i===r.stops.length-1)v.direction=-1;return r.stops[i+v.direction];}
export function sampleRoute(route:RouteSnapshot,distance:number){const points=pathPoints(route.nodes,route.edges);let left=distance;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b[0]-a[0],b[2]-a[2]);if(left<=len||i===points.length-1){const t=Math.max(0,Math.min(1,left/len));return {position:[a[0]+(b[0]-a[0])*t,2.2,a[2]+(b[2]-a[2])*t] as [number,number,number],heading:Math.atan2(b[0]-a[0],b[2]-a[2])};}left-=len;}throw new Error('运行路径缺失');}
// Exact length on the piecewise linear passing-track geometry, independent of step size.
export function traveledDistance(v:Train,from:number,to:number){
 const route=v.route!,a=v.authority,b2=a&&(a.from==='B'&&a.fromBerth===2||a.to==='B'&&a.berth===2);
 if(!b2)return Math.abs(to-from);
 const bd=stationDistance(route,'B'),lo=Math.min(from,to),hi=Math.max(from,to),breaks=[lo,hi,...[-9,-5,0,5,9].map(n=>bd+n)];
 let d=0;const points=pathPoints(route.nodes,route.edges);for(let i=1;i<points.length;i++){d+=Math.hypot(points[i][0]-points[i-1][0],points[i][2]-points[i-1][2]);breaks.push(d);}
 const position=(n:number)=>{const p=sampleRoute(route,n).position,q=Math.min(1,Math.max(0,(9-Math.abs(n-bd))/4));return [p[0]+B_FRAME.cos*3.8*q,p[2]-B_FRAME.sin*3.8*q];};
 const cuts=[...new Set(breaks.filter(n=>n>=lo&&n<=hi))].sort((a,b)=>a-b);let sum=0;for(let i=1;i<cuts.length;i++){const a=position(cuts[i-1]),b=position(cuts[i]);sum+=Math.hypot(a[0]-b[0],a[1]-b[1]);}return sum;
}
