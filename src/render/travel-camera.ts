import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Pose } from '../simulation/train';
import type { WorldState,CameraState } from '../world/state';
import type { CameraMode } from '../world/presentation';
import { CONFIG } from '../config';
export class TravelCamera {
 private mode:CameraMode='overview';private car='';private heading=0;private offset=new THREE.Vector3(24,28,30);
 private transition:{from:CameraState;to:CameraState;elapsed:number;duration:number}|null=null;
 private ray=new THREE.Raycaster();occluded=false;lifts=0;
 constructor(private camera:THREE.PerspectiveCamera,private controls:OrbitControls,private obstacles:()=>THREE.Object3D[]){}
 bounds(mode:CameraMode){this.controls.enabled=mode!=='passenger';this.controls.minDistance=this.transition?3:mode==='passenger'?3:mode==='follow'?18:CONFIG.camera.minDistance;this.controls.maxDistance=this.transition?285:mode==='passenger'?110:mode==='follow'?140:CONFIG.camera.maxDistance;this.controls.minPolarAngle=mode==='passenger'?.05:CONFIG.camera.minPolar;this.controls.maxPolarAngle=this.transition?Math.PI/2:mode==='passenger'?Math.PI/2:mode==='follow'?1.32:CONFIG.camera.maxPolar;}
 set(value:CameraState,mode:CameraMode){this.mode=mode;this.car='';this.transition=null;this.bounds(mode);this.apply(value);}
 snapshot():CameraState{return {position:this.camera.position.toArray(),target:this.controls.target.toArray()};}
 request(to:CameraState,duration=.22){this.transition={from:this.snapshot(),to,elapsed:0,duration};}
 private apply(value:CameraState){const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.camera.position.fromArray(value.position);this.controls.target.fromArray(value.target);if(this.camera.position.distanceTo(this.controls.target)<3.1)this.camera.position.y=this.controls.target.y+4;this.camera.position.y=Math.max(3.6,this.camera.position.y);this.controls.update();this.controls.enableDamping=damping;}
 private blocked(position:THREE.Vector3,target:THREE.Vector3){const direction=position.clone().sub(target),length=direction.length();this.ray.set(target,direction.normalize());this.ray.near=.7;this.ray.far=Math.max(.8,length-.4);return this.ray.intersectObjects(this.obstacles(),true).some(hit=>hit.distance<length-.4);}
 update(w:WorldState,poses:Pose[],delta:number){
  const mode=w.presentation.cameraMode,pose=poses.find(p=>p.id===w.fleet.vehicle?.id),moving=(mode==='follow'||mode==='passenger')&&pose;
  const changed=mode!==this.mode||!!moving&&this.car!==pose.id;
  this.bounds(mode);if(changed){this.mode=mode;if(moving){const near=this.controls.target.distanceTo(new THREE.Vector3(pose.position[0],4,pose.position[2]))<7;if(mode==='follow')this.offset=near?this.camera.position.clone().sub(this.controls.target):new THREE.Vector3(24,28,30);this.car=pose.id;this.request(this.snapshot(),.55);}}
  let goal:CameraState|null=null;
  if(moving){
   if(mode==='follow'){if(!this.transition)this.offset.copy(this.camera.position).sub(this.controls.target);this.offset.setLength(THREE.MathUtils.clamp(this.offset.length(),24,110));this.offset.y=Math.max(18,this.offset.y);const target=new THREE.Vector3(pose.position[0],4,pose.position[2]);goal={position:target.clone().add(this.offset).toArray(),target:target.toArray()};}
   else {if(Math.abs(Math.atan2(Math.sin(pose.heading-this.heading),Math.cos(pose.heading-this.heading)))>1.5&&!this.transition)this.request(this.snapshot(),.65);const forward=new THREE.Vector3(Math.sin(pose.heading),0,Math.cos(pose.heading)),right=new THREE.Vector3(Math.cos(pose.heading),0,-Math.sin(pose.heading)),p=new THREE.Vector3(...pose.position);
    const position=p.clone().addScaledVector(right,-1.7);position.y=5.8;const target=p.clone().addScaledVector(forward,18).addScaledVector(right,-3);target.y=4.2;goal={position:position.toArray(),target:target.toArray()};this.heading=pose.heading;}
  }
  if(this.transition){const t=this.transition;t.elapsed+=Math.min(.25,Math.max(0,delta));if(goal)t.to=goal;const u=Math.min(1,t.elapsed/t.duration),a=u*u*(3-2*u);goal={position:t.from.position.map((n,i)=>n+(t.to.position[i]-n)*a) as [number,number,number],target:t.from.target.map((n,i)=>n+(t.to.target[i]-n)*a) as [number,number,number]};if(u>=1){goal={position:[...t.to.position],target:[...t.to.target]};this.transition=null;}}
  if(!goal)return false;
  const position=new THREE.Vector3(...goal.position),target=new THREE.Vector3(...goal.target);this.occluded=false;
  if(moving){let attempts=0;while(this.blocked(position,target)&&attempts++<8){position.y+=mode==='passenger'?4:7;this.lifts++;}this.occluded=this.blocked(position,target);}
  const changedPose=this.camera.position.distanceToSquared(position)>1e-8||this.controls.target.distanceToSquared(target)>1e-8;this.apply({position:position.toArray(),target:target.toArray()});return changedPose;
 }
 stats(){return {mode:this.mode,transitioning:!!this.transition,occluded:this.occluded,collisionLifts:this.lifts,distance:this.camera.position.distanceTo(this.controls.target),height:this.camera.position.y};}
}
