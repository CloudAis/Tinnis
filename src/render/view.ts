import { stationUnlocked } from '../simulation/development';
import { createDevelopmentModels } from './development';
import { allTrains } from '../world/fleet';
import { PlatformCrowd } from './passengers';
import { createTrainModel } from './train';
import type { Pose } from '../simulation/train';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from '../config';
import { STATIONS, TOWNS, type StationId } from '../world/map';
import { DEFAULT_CAMERA, type CameraState } from '../world/state';
import type { WorldState } from '../world/state';
import { NODES, nearestNode, type NodeId, type EditorState } from '../world/railway';
import { previewTrack } from '../simulation/construction';
import { createRailwayModels, disposeGeometry } from './railway';
import { makeLandscape } from './landscape';
import { batchStatic, box } from './models';
export class WorldView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(37, 1, 1, 950);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly labels = document.createElement('div');
  private labelObjects: { element: HTMLElement; point: THREE.Vector3 }[] = [];
  private proxies: THREE.Object3D[] = [];
  private plots=new Map<StationId,THREE.Group>();
  private railwayModels=new THREE.Group();
  private developmentModels=new THREE.Group();
  private developmentKey='';
  private preview=new THREE.Group();
  private trainModels=new Map<string,THREE.Group>();
  private trainKey='';
  private crowd=new PlatformCrowd();
  private following=false;
  private networkKey='';
  private previewKey='';
  private editor:EditorState={mode:'inspect',from:null,to:null};
  private selection: THREE.Mesh;
  private down = { x: 0, y: 0, time: 0 };
  private pointers = new Set<number>();
  private dirty=true;
  private renderedFrames=0;
  private paintMs:number[]=[];
  private gesture = false;
  private resizeObserver: ResizeObserver;
  readonly modelInfo: { trees: number; houses: number };
  constructor(readonly container: HTMLElement, onSelect: (id: StationId | null) => void, onCamera: () => void, onNode: (id:NodeId|null)=>void = ()=>{}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    const gl=this.renderer.getContext();const ext=gl.getExtension('WEBGL_debug_renderer_info');
    const gpu=ext?String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)):'';
    const software=/swiftshader|llvmpipe|software/i.test(gpu);
    this.renderer.setPixelRatio(software ? 0.8 : Math.min(devicePixelRatio, 1.75));
    this.renderer.setClearColor('#c5d7ca');
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.setAttribute('aria-label','海岸山谷三维地图，可拖动旋转、右键平移、滚轮缩放');
    this.renderer.domElement.tabIndex = 0;
    container.append(this.renderer.domElement);
    this.labels.className = 'map-labels'; container.append(this.labels);
    this.scene.fog = new THREE.Fog('#c5d7ca', 370, 700);
    this.scene.add(new THREE.HemisphereLight('#fdf8e4','#8b9a80',2.2));
    const sun = new THREE.DirectionalLight('#fff2cf',2.7);sun.position.set(-80,140,70);
    sun.castShadow = true;sun.shadow.mapSize.set(software?1024:2048,software?1024:2048);
    Object.assign(sun.shadow.camera,{left:-145,right:145,top:120,bottom:-120,near:5,far:360});
    sun.shadow.normalBias=.12;sun.shadow.bias=-.0002;this.scene.add(sun);
    const landscape=makeLandscape();this.scene.add(landscape.scenery);
    this.modelInfo={trees:landscape.trees,houses:landscape.sourceModels};
    // Candidate plot foundations are dashed survey markings, never constructed stations.
    const plots=new THREE.Group();
    for(const station of STATIONS){
      if(station.optional)continue;
      const plot=new THREE.Group();plot.name=`candidate-${station.id}`;plot.position.fromArray(station.position);
      const color=station.unlocked?'#f0e5bf':'#b5baa1';
      for(const z of [-3.4,3.4])for(let x=-5;x<=5;x+=2)box(plot,[1.15,.07,.16],[x,.04,z],color);
      for(const x of [-6,6])for(let z=-2.4;z<=2.4;z+=1.6)box(plot,[.16,.07,.9],[x,.04,z],color);
      const sign=box(plot,[.27,4.8,.27],[0,2.4,0],'#8b8064');sign.castShadow=false;
      const panel=box(plot,[2.5,1.5,.25],[0,4.2,0],station.unlocked?'#eadfbd':'#bcbca4');panel.castShadow=false;
      const baked=batchStatic(plot);plots.add(baked);this.plots.set(station.id,baked);
      const proxy=new THREE.Mesh(new THREE.BoxGeometry(13,12,9),new THREE.MeshBasicMaterial({visible:false}));
      proxy.position.set(station.position[0],7,station.position[2]);proxy.userData.stationId=station.id;this.proxies.push(proxy);this.scene.add(proxy);
      const button=document.createElement('button');button.className=`station-pin ${station.unlocked?'':'locked'}`;
      button.dataset.station=station.id;button.setAttribute('aria-label',`选择${station.name}候选站位`);
      button.innerHTML=`<span class="pin-letter">${station.id}</span><span class="pin-caption">${station.unlocked?'候选站位':'尚未开放'}</span>`;
      button.addEventListener('click',()=>onSelect(station.id));
      this.addLabel(button,new THREE.Vector3(station.position[0],9,station.position[2]));
    }
    this.scene.add(plots);
    this.scene.add(this.railwayModels,this.preview,this.crowd.group);
    for(const node of NODES){
      const button=document.createElement('button');button.className='node-pin';button.dataset.node=node.id;
      button.setAttribute('aria-label',`选择轨道节点${node.name}`);button.title=node.name;button.innerHTML=`<span>${({'node-a':'A','node-b':'B','node-d':'D','node-c':'C','node-coast':'1','node-valley':'2','node-river':'3','node-forest':'4'} as Record<string,string>)[node.id]}</span><small>${node.name}</small>`;
      button.addEventListener('click',()=>onNode(node.id));
      this.addLabel(button,new THREE.Vector3(node.position[0],4.5,node.position[2]));
    }
    for(const town of TOWNS){
      const label=document.createElement('div');label.className='town-label';
      label.innerHTML=`<span>${town.name}</span><small>${town.kind}</small>`;
      this.addLabel(label,new THREE.Vector3(town.position[0],12,town.position[2]-7));
    }
    const sea=document.createElement('div');sea.className='sea-label';sea.innerHTML='汐 见 湾<small>SHIOMI BAY</small>';
    this.addLabel(sea,new THREE.Vector3(-25,-1,83));
    this.selection=new THREE.Mesh(new THREE.RingGeometry(7.5,8,64),new THREE.MeshBasicMaterial({color:'#fff7d9',side:THREE.DoubleSide,depthWrite:false}));
    this.selection.rotation.x=-Math.PI/2;this.selection.visible=false;this.scene.add(this.selection);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;this.controls.dampingFactor=.09;
    this.controls.minDistance=CONFIG.camera.minDistance;this.controls.maxDistance=CONFIG.camera.maxDistance;
    this.controls.minPolarAngle=CONFIG.camera.minPolar;this.controls.maxPolarAngle=CONFIG.camera.maxPolar;
    this.controls.screenSpacePanning=false;this.controls.maxTargetRadius=130;
    this.controls.zoomSpeed=.8;this.controls.panSpeed=.75;this.controls.rotateSpeed=.55;
    this.controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
    this.controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
    this.controls.addEventListener('change',()=>{this.dirty=true;this.clampTarget();onCamera();});
    this.setCamera(DEFAULT_CAMERA);
    const canvas=this.renderer.domElement;
    canvas.addEventListener('pointerdown',e=>{
      this.pointers.add(e.pointerId);
      if(this.pointers.size>1)this.gesture=true;
      this.down={x:e.clientX,y:e.clientY,time:performance.now()};
    });
    canvas.addEventListener('pointerup',e=>{
      this.pointers.delete(e.pointerId);
      if(!this.gesture&&e.button===0&&Math.hypot(e.clientX-this.down.x,e.clientY-this.down.y)<6&&performance.now()-this.down.time<450){
        const r=canvas.getBoundingClientRect();const ray=new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);
        if(this.editor.mode==='track'){
          const point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-2.2),new THREE.Vector3());
          onNode(point?nearestNode(point.toArray()):null);
        }else{const hit=ray.intersectObjects(this.proxies)[0];onSelect(hit?.object.userData.stationId??null);}
      }
      if(this.pointers.size===0)this.gesture=false;
    });
    canvas.addEventListener('pointercancel',e=>{this.pointers.delete(e.pointerId);if(!this.pointers.size)this.gesture=false;});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
  }
  private addLabel(element:HTMLElement,point:THREE.Vector3){this.labels.append(element);this.labelObjects.push({element,point});}
  private resize(){this.dirty=true;const {width,height}=this.container.getBoundingClientRect();this.camera.aspect=width/Math.max(1,height);
    this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(37/2))*Math.max(1,1.4/this.camera.aspect)));
    this.camera.fov=Math.min(85,this.camera.fov);this.camera.updateProjectionMatrix();this.renderer.setSize(width,height);}
  private clampTarget(){
    const old=this.controls.target.clone();
    this.controls.target.set(THREE.MathUtils.clamp(old.x,-CONFIG.camera.targetX,CONFIG.camera.targetX),0,THREE.MathUtils.clamp(old.z,-CONFIG.camera.targetZ,CONFIG.camera.targetZ));
    this.camera.position.add(this.controls.target.clone().sub(old));
  }
  getCamera():CameraState{return{position:this.camera.position.toArray(),target:this.controls.target.toArray()};}
  setCamera(value:CameraState){
    this.controls.enableDamping=false;this.controls.update();
    this.camera.position.fromArray(value.position);this.controls.target.fromArray(value.target);this.clampTarget();
    this.controls.update();this.controls.enableDamping=true;
  }
  resetCamera(){this.setCamera(DEFAULT_CAMERA);}
  focus(id:StationId){
    const s=STATIONS.find(s=>s.id===id)!;
    const direction=this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(110);
    const target=new THREE.Vector3(s.position[0],0,s.position[2]);
    this.setCamera({position:target.clone().add(direction).toArray(),target:target.toArray()});
  }
  zoom(factor:number){
    const offset=this.camera.position.clone().sub(this.controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,CONFIG.camera.minDistance,CONFIG.camera.maxDistance));
    this.setCamera({position:this.controls.target.clone().add(offset).toArray(),target:this.controls.target.toArray()});
  }
  setSelection(id:StationId|null){
    this.dirty=true;
    const s=STATIONS.find(s=>s.id===id);this.selection.visible=!!s;
    if(s)this.selection.position.set(s.position[0],2.25,s.position[2]);
    this.labels.querySelectorAll<HTMLButtonElement>('.station-pin').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.station===id)));
  }
  syncRailway(world:WorldState,editor:EditorState){
    const key=JSON.stringify(world.railway);
    if(key!==this.networkKey){
      this.networkKey=key;disposeGeometry(this.railwayModels);this.scene.remove(this.railwayModels);
      this.railwayModels=createRailwayModels(world.railway);this.scene.add(this.railwayModels);
      this.plots.forEach((plot,id)=>{plot.visible=!world.railway.stations[id];});
      this.labels.querySelectorAll<HTMLButtonElement>('.station-pin').forEach(b=>{
        const id=b.dataset.station as StationId;const built=world.railway.stations[id];
        b.classList.toggle('built',!!built);b.querySelector('.pin-caption')!.textContent=built?built.name:stationUnlocked(world,id)?'候选站位':'尚未开放';
        b.setAttribute('aria-label',`选择${built?.name??STATIONS.find(s=>s.id===id)!.name}${built?'':'候选站位'}`);
      });
      this.renderer.shadowMap.needsUpdate=true;this.dirty=true;
    }
    this.editor={...editor};this.labels.dataset.tool=editor.mode;
    const pkey=JSON.stringify([key,world.economy.balance,editor]);
    if(pkey!==this.previewKey){
      this.previewKey=pkey;this.preview.traverse(o=>{if((o instanceof THREE.Line||o instanceof THREE.Mesh)&&!Array.isArray(o.material))o.material.dispose();});disposeGeometry(this.preview);this.preview.clear();this.dirty=true;
      this.labels.querySelectorAll<HTMLButtonElement>('.node-pin').forEach(b=>{
        b.setAttribute('aria-pressed',String(b.dataset.node===editor.from||b.dataset.node===editor.to));
      });
      if(editor.mode==='track'){
        const plan=previewTrack(world,editor.from,editor.to);
        if(plan.path&&plan.path.points.length>1){
          const geo=new THREE.BufferGeometry().setFromPoints(plan.path.points.map(p=>new THREE.Vector3(p[0],2.85,p[2])));
          const color=plan.ok?'#426f50':plan.missing.length?'#b87855':'#759285';
          for(let i=1;i<plan.path.points.length;i++){
            const a=plan.path.points[i-1],b=plan.path.points[i],dx=b[0]-a[0],dz=b[2]-a[2];
            const ribbon=new THREE.Mesh(new THREE.BoxGeometry(.65,.04,Math.hypot(dx,dz)),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.6,depthTest:false}));
            ribbon.position.set((a[0]+b[0])/2,2.8,(a[2]+b[2])/2);ribbon.rotation.y=Math.atan2(dx,dz);ribbon.renderOrder=9;this.preview.add(ribbon);
          }
          const line=new THREE.Line(geo,new THREE.LineDashedMaterial({color:plan.ok?'#fff3bd':'#f3d3ae',dashSize:1.2,gapSize:.6,depthTest:false}));line.computeLineDistances();line.renderOrder=10;this.preview.add(line);
        }
      }
    }
  }
  updateDevelopment(world:WorldState){
    const key=JSON.stringify([world.towns,world.development.upgrades,world.development.unlockedD]);if(key===this.developmentKey)return;this.developmentKey=key;
    disposeGeometry(this.developmentModels);this.scene.remove(this.developmentModels);this.developmentModels=createDevelopmentModels(world);this.scene.add(this.developmentModels);this.dirty=true;this.renderer.shadowMap.needsUpdate=true;
    for(const b of this.labels.querySelectorAll<HTMLButtonElement>('[data-station]')){const id=b.dataset.station as StationId,unlocked=stationUnlocked(world,id);b.classList.toggle('locked',!unlocked);if(!world.railway.stations[id])b.querySelector('.pin-caption')!.textContent=unlocked?'候选站位':'尚未开放';}
  }
  updateTrain(world:WorldState,poses:Pose[]){
    this.updateDevelopment(world);
    if(this.crowd.update(world))this.dirty=true;
    const vehicles=allTrains(world.fleet),ids=new Set(vehicles.map(v=>v.id));
    for(const [id,model] of this.trainModels)if(!ids.has(id)){disposeGeometry(model);this.scene.remove(model);this.trainModels.delete(id);this.dirty=true;}
    for(const v of vehicles){
      let model=this.trainModels.get(v.id);if(!model){model=createTrainModel(v.type);this.trainModels.set(v.id,model);this.scene.add(model);this.dirty=true;}
      const p=poses.find(p=>p.id===v.id),visible=!!p;
      if(model.visible!==visible){model.visible=visible;this.dirty=true;}
      if(p){if(model.position.distanceToSquared(new THREE.Vector3(...p.position))>1e-9||Math.abs(model.rotation.y-p.heading)>1e-6)this.dirty=true;model.position.fromArray(p.position);model.rotation.y=p.heading;}
    }
    const pose=poses.find(p=>p.id===world.fleet.vehicle?.id);
    if(world.fleet.follow&&pose){
      const target=new THREE.Vector3(pose.position[0],0,pose.position[2]);
      if(!this.following){const nearSavedTarget=target.distanceTo(this.controls.target)<2;const offset=nearSavedTarget?this.camera.position.clone().sub(this.controls.target):new THREE.Vector3().setFromSpherical(new THREE.Spherical(70,.62,this.controls.getAzimuthalAngle()));this.setCamera({position:target.clone().add(offset).toArray(),target:target.toArray()});}
      else{const delta=target.clone().sub(this.controls.target);this.camera.position.add(delta);this.controls.target.copy(target);if(delta.lengthSq()>1e-9)this.dirty=true;}
    }
    this.following=world.fleet.follow;
  }
  render(){
    this.controls.update();this.clampTarget();
    if(!this.dirty)return;
    this.dirty=false;const started=performance.now();this.camera.updateMatrixWorld();
    const {width,height}=this.container.getBoundingClientRect();
    for(const {element,point} of this.labelObjects){
      const p=point.clone().project(this.camera);
      element.style.transform=`translate(-50%, -50%) translate(${(p.x+1)*width/2}px,${(1-p.y)*height/2}px)`;
      element.hidden=p.z>1||p.z< -1||Math.abs(p.x)>1.15||Math.abs(p.y)>1.1;
    }
    this.renderer.render(this.scene,this.camera);
    this.renderedFrames++;this.paintMs.push(performance.now()-started);if(this.paintMs.length>120)this.paintMs.shift();
  }
  stats(){const times=[...this.paintMs].sort((a,b)=>a-b);return{renderedFrames:this.renderedFrames,needsRender:this.dirty,previewSegments:this.preview.children.length,medianPaintCpuMs:times[Math.floor(times.length/2)]??0,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,objects:this.scene.children.length,railwayModels:this.railwayModels.children.length,developmentModels:this.developmentModels.children.length,trainModels:this.trainModels.size,trainVisible:[...this.trainModels.values()].some(m=>m.visible),visiblePeople:this.crowd.count,pixelRatio:this.renderer.getPixelRatio(),...this.modelInfo};}
}
