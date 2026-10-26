import * as THREE from 'three';
import { daylightAt,weatherAt } from '../world/presentation';
import type { WorldState } from '../world/state';
import { material } from './models';
import { PALETTE } from './style';
export class Atmosphere {
 readonly rain:THREE.LineSegments;readonly sky=new THREE.Color();
 daylight=1;weather='clear';private bucket='';private shadowBucket=-1;
 constructor(private scene:THREE.Scene,private renderer:THREE.WebGLRenderer,private sun:THREE.DirectionalLight,private ambient:THREE.HemisphereLight){
  const vertices=new Float32Array(384*6);let seed=72103;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<384;i++){const x=rand()*200-100,y=rand()*30,z=rand()*150-70;vertices.set([x,y,z,x+.12,y-1.2,z],i*6);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));
  const shader=new THREE.ShaderMaterial({uniforms:{time:{value:0},color:{value:new THREE.Color('#d6e8ef')}},transparent:true,depthWrite:false,vertexShader:'uniform float time;void main(){vec3 p=position;p.y=mod(p.y-time*17.0,30.0)+2.7;p.x+=(30.0-p.y)*0.11;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}',fragmentShader:'uniform vec3 color;void main(){gl_FragColor=vec4(color,0.43);}'});
  this.rain=new THREE.LineSegments(geometry,shader);this.rain.frustumCulled=false;this.rain.visible=false;this.rain.name='light-rain';scene.add(this.rain);
 }
 update(w:WorldState){
  this.weather=weatherAt(w.presentation,w.clock.minutes);this.daylight=daylightAt(w.clock.minutes);this.rain.visible=this.weather==='rain';
  (this.rain.material as THREE.ShaderMaterial).uniforms.time.value=w.clock.minutes/2;
  const key=`${Math.floor(w.clock.minutes/5)}:${this.weather}`;if(key===this.bucket)return this.rain.visible&&!w.clock.paused;this.bucket=key;
  const wet=this.weather==='rain',d=this.daylight;
  this.sky.set('#425c70').lerp(new THREE.Color(wet?'#aabfc2':'#c5d7ca'),d);this.renderer.setClearColor(this.sky);
  if(this.scene.fog instanceof THREE.Fog){this.scene.fog.color.copy(this.sky);this.scene.fog.near=wet?180:370;this.scene.fog.far=wet?530:700;}
  this.ambient.intensity=1.05+d*(wet?.7:1.15);this.ambient.color.set('#b7c8e5').lerp(new THREE.Color('#fdf8e4'),d);
  this.sun.intensity=.35+d*(wet?1.25:2.35);this.sun.color.set('#c7d9f6').lerp(new THREE.Color('#fff2cf'),d);
  const shadowBucket=Math.floor(w.clock.minutes/30);if(shadowBucket!==this.shadowBucket){this.shadowBucket=shadowBucket;const a=w.clock.minutes/1440*Math.PI*2;this.sun.position.set(Math.cos(a)*95,100+Math.sin(a)*35,65);this.renderer.shadowMap.needsUpdate=true;}
  const glass=material(PALETTE.glass);glass.emissive.set(PALETTE.lamp);glass.emissiveIntensity=(1-d)*.55;return true;
 }
 dispose(){this.rain.geometry.dispose();(this.rain.material as THREE.Material).dispose();this.scene.remove(this.rain);}
}
