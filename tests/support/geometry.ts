import type { Pose } from '../../src/simulation/train';
export function boxesOverlap(a:Pose,b:Pose,length=5){
 const center=[b.position[0]-a.position[0],b.position[2]-a.position[2]];
 const axes=(p:typeof a)=>[[Math.sin(p.heading),Math.cos(p.heading)],[Math.cos(p.heading),-Math.sin(p.heading)]];
 const aa=axes(a),bb=axes(b),dot=(x:number[],y:number[])=>x[0]*y[0]+x[1]*y[1];
 return [...aa,...bb].every(axis=>Math.abs(dot(center,axis))<(length+.15)/2*(Math.abs(dot(aa[0],axis))+Math.abs(dot(bb[0],axis)))+.95*(Math.abs(dot(aa[1],axis))+Math.abs(dot(bb[1],axis)))-.01);
}
