import * as THREE from '../../../vendor/three-0.186.1/build/three.module.js';
import { findCorners } from '../map2d/map.js';
import { startBand, gantry, boardPlacements, signPlacements, labelPlanes, labelAtlas, markerPosts } from './markings.js';
import { stationFrames } from './frame.js';
import { trackRibbon, groundPlane, skirts } from './meshes.js';
import { fogRange, worldSize } from './fog.js';
import { kerbs, kerbColors } from './kerbs.js';
import { lineRibbon, lineColors } from './line.js';
import { buildCarModel, placeCar, disposeCar } from './car.js';

// forceLogDepth exercises the fallback even on GPUs with EXT_clip_control.
// onLost receives the context event (both lost and restored). _debug is for browser checks only.
export function createScene3d(canvas,pal,{onLost=()=>{},forceLogDepth=false}={}){
  const context=canvas.getContext('webgl2',{antialias:true});
  if(!context)throw new Error('3D view requires WebGL2');
  const depth=!forceLogDepth&&context.getExtension('EXT_clip_control')?'reversed':'log';
  const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,
    reversedDepthBuffer:depth==='reversed',logarithmicDepthBuffer:depth==='log'});
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),target=new THREE.Vector3();
  scene.background=new THREE.Color(pal.colors.sky3d);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  // Neutral fill keeps dark palettes readable; oblique sun separates slopes without washing out the road.
  scene.add(new THREE.HemisphereLight(0xffffff,0x607080,1.6));
  const sun=new THREE.DirectionalLight(0xffffff,2.2),sunOffset=new THREE.Vector3(20,35,15);
  sun.position.copy(sunOffset);sun.castShadow=true;scene.add(sun,sun.target);
  const shadow=sun.shadow;shadow.mapSize.set(512,512);
  Object.assign(shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:80});
  shadow.camera.updateProjectionMatrix();shadow.normalBias=0.03;
  let track=null,line=null,ghostLine=null,car=null,ghostCar=null,T=null,disp=null,g=null,mode='speed';
  function geometry(data){
    const geo=new THREE.BufferGeometry();
    for(const name of ['position','normal','color'])if(data[name])geo.setAttribute(name,new THREE.BufferAttribute(data[name],3));
    geo.setIndex(new THREE.BufferAttribute(data.index,1));return geo;
  }
  function remove(mesh){if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}}
  function ribbon(data,ghost){
    const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
      transparent:ghost,opacity:ghost?0.4:1,depthWrite:!ghost,forceSinglePass:true});
    const mesh=new THREE.Mesh(geometry(data),material);mesh.renderOrder=ghost?2:1;scene.add(mesh);return mesh;
  }
  function recolor(mesh,colors){mesh.geometry.attributes.color.array.set(colors);mesh.geometry.attributes.color.needsUpdate=true;}
  function tintCar(group,color){if(group)group.traverse(o=>{if(o.isMesh&&o.name==='body')o.material.color.setStyle(color);});}
  let ground=null,skirt=null,size=1;
  function disposeWorld(){remove(ground);remove(skirt);ground=skirt=null;scene.fog=null;}
  function buildWorld(){
    disposeWorld();if(!T)return;
    size=worldSize(track.geometry.attributes.position.array);
    function mesh(data,name){
      const m=new THREE.Mesh(geometry(data),new THREE.MeshStandardMaterial({color:pal.colors.ground3d,flatShading:true,side:THREE.DoubleSide}));
      m.name=name;m.receiveShadow=true;scene.add(m);return m;
    }
    ground=mesh(groundPlane(T,8*size),'ground');skirt=mesh(skirts(T,stationFrames(T)),'skirts');
    scene.fog=new THREE.Fog(scene.background,size,2*size);scene.fog.color.copy(scene.background);
  }
  function themeWorld(){
    for(const m of [ground,skirt])if(m)m.material.color.setStyle(pal.colors.ground3d);
    if(scene.fog)scene.fog.color.copy(scene.background);
  }
  let kerbMesh=null,corners=[];
  function disposeKerbs(){remove(kerbMesh);kerbMesh=null;}
  function buildKerbs(){
    disposeKerbs();corners=T?findCorners(T):[];if(!T)return;
    kerbMesh=new THREE.Mesh(geometry(kerbs(T,stationFrames(T),corners,{pal})),
      new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,
        polygonOffset:true,polygonOffsetFactor:-0.5,polygonOffsetUnits:-0.5}));
    kerbMesh.name='kerbs';kerbMesh.renderOrder=0.5;scene.add(kerbMesh);
  }
  function recolorKerbs(){
    if(!kerbMesh)return;
    const attr=kerbMesh.geometry.attributes.color;kerbColors(T,corners,attr.array,{pal});attr.needsUpdate=true;
  }
  let markings=null;
  function disposeMarkings(){
    if(!markings)return;
    markings.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});
    scene.remove(markings);markings=null;
  }
  function paintLabels(mesh){
    const {canvas,labels,tiles}=mesh.userData,g=canvas.getContext('2d');
    g.fillStyle=pal.colors.paper;g.fillRect(0,0,canvas.width,canvas.height);
    g.textAlign='center';g.textBaseline='middle';
    labels.forEach((label,i)=>{
      const {x,y,size}=tiles[i];g.fillStyle=pal.colors.ink;g.fillRect(x,y,size,size);
      g.fillStyle=pal.colors.paper;g.fillRect(x+6,y+6,size-12,size-12);
      g.fillStyle=pal.colors.ink;g.font='bold 72px monospace';g.fillText(label,x+size/2,y+size/2,size-20);
    });mesh.material.map.needsUpdate=true;
  }
  function themeMarkings(){
    if(!markings)return;
    markings.traverse(o=>{if(!o.isMesh)return;
      if(o.userData.labels){paintLabels(o);return;}
      if(o.name==='gantry'||o.name==='markerPosts'){o.material.color.setStyle(pal.colors.ink);return;}
      const ink=new THREE.Color(pal.colors.ink),paper=new THREE.Color(pal.colors.paper),a=o.geometry.attributes.color;
      for(let i=0;i<a.count;i++){const c=o.userData.checks[i]?paper:ink;a.setXYZ(i,c.r,c.g,c.b);}a.needsUpdate=true;
    });
  }
  function buildMarkings(){
    disposeMarkings();if(!T)return;
    markings=new THREE.Group();scene.add(markings);
    const corners=findCorners(T),f=stationFrames(T);
    for(const [name,data] of [['startBand',startBand(T,f)],['gantry',gantry(T,f)]]){
      const mesh=new THREE.Mesh(geometry(data),new THREE.MeshBasicMaterial({vertexColors:name==='startBand',side:THREE.DoubleSide}));
      mesh.name=name;mesh.userData.checks=Array.from(data.color).filter((_,i)=>i%3===0);markings.add(mesh);
    }
    const boards=boardPlacements(T,corners),signs=signPlacements(T,corners);
    const posts=new THREE.Mesh(geometry(markerPosts(T,[...boards,...signs])),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    posts.name='markerPosts';markings.add(posts);
    for(const [name,records] of [['boards',boards],['signs',signs]]){
      const group=new THREE.Group();group.name=name;group.userData.count=records.length;markings.add(group);if(!records.length)continue;
      for(const page of labelAtlas(records.length).pages){
        const subset=records.slice(page.start,page.start+page.count);
        const data=labelPlanes(subset,{tiles:page.tiles}),geo=geometry(data);geo.setAttribute('uv',new THREE.BufferAttribute(data.uv,2));
        const canvas=document.createElement('canvas');canvas.width=page.width;canvas.height=page.height;
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
        const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
        mesh.userData={canvas,tiles:page.tiles,labels:subset.map(r=>String(r.distance??r.number))};group.add(mesh);
      }
    }
    themeMarkings();
  }
  function setTrack(value){
    T=value;remove(track);track=null;if(!T){disposeWorld();disposeKerbs();disposeMarkings();return;}
    const data=trackRibbon(T,stationFrames(T),{heightColors:!T.flat,pal});
    track=new THREE.Mesh(geometry(data),new THREE.MeshStandardMaterial({color:data.color?0xffffff:pal.colors.track,
      vertexColors:!!data.color,flatShading:true,side:THREE.DoubleSide}));track.receiveShadow=true;scene.add(track);
    buildWorld();
    buildKerbs();
    buildMarkings();
  }
  function setLine(value,colorMode=mode,palette=pal){
    disp=value;mode=colorMode;pal=palette;remove(line);line=null;
    if(disp)line=ribbon({...lineRibbon(disp),color:lineColors(disp,mode,pal)},false);
  }
  function setGhost(value){
    g=value;remove(ghostLine);ghostLine=null;
    if(g)ghostLine=ribbon({...lineRibbon(g,{lift:0.08}),color:lineColors(g,'ghost',pal)},true);
  }
  function removeCar(group){if(group){scene.remove(group);disposeCar(group);}}
  function makeCar(spec,ghost){
    if(!spec)return null;
    const group=buildCarModel(spec,{color:ghost?pal.colors.ghost:pal.colors.accent,opacity:ghost?0.4:1});
    group.visible=false;group.traverse(o=>{if(o.isMesh){o.renderOrder=ghost?4:3;o.castShadow=!ghost;if(ghost)o.material.depthWrite=false;}});
    scene.add(group);return group;
  }
  function setCars(specs){removeCar(car);removeCar(ghostCar);car=makeCar(specs.car,false);ghostCar=makeCar(specs.ghost,true);}
  function setTheme(value){
    pal=value;scene.background.setStyle(pal.colors.sky3d);
    themeWorld();
    if(track){
      if(track.geometry.attributes.color)recolor(track,trackRibbon(T,stationFrames(T),{heightColors:true,pal}).color);
      else track.material.color.setStyle(pal.colors.track);
    }
    recolorKerbs();
    if(line)recolor(line,lineColors(disp,mode,pal));
    if(ghostLine)recolor(ghostLine,lineColors(g,'ghost',pal));
    themeMarkings();
    tintCar(car,pal.colors.accent);tintCar(ghostCar,pal.colors.ghost);
  }
  function resize(rect,dpr){renderer.setPixelRatio(Math.min(2,dpr));renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}
  function frame(input){
    if(car){car.visible=!!input.car;if(input.car){placeCar(car,input.car);sun.target.position.copy(car.position);sun.position.copy(car.position).add(sunOffset);}}
    if(ghostCar){ghostCar.visible=!!input.ghost;if(input.ghost)placeCar(ghostCar,input.ghost);}
    const v=input.view;camera.position.fromArray(v.position);camera.up.fromArray(v.up);target.fromArray(v.target);camera.lookAt(target);
    if(camera.fov!==v.fovDeg||camera.near!==v.near||camera.far!==v.far){camera.fov=v.fovDeg;camera.near=v.near;camera.far=v.far;camera.updateProjectionMatrix();}
    if(scene.fog)fogRange(track.geometry.attributes.position.array,size,v,scene.fog);
    renderer.render(scene,camera);
  }
  function lost(event){event.preventDefault();onLost(event);}
  canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',lost);
  function info(){return {depth,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,programs:renderer.info.programs.length};}
  function dispose(){
    canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',lost);
    disposeWorld();
    disposeKerbs();
    disposeMarkings();
    remove(track);remove(line);remove(ghostLine);removeCar(car);removeCar(ghostCar);sun.shadow.dispose();renderer.dispose();
  }
  return {setTrack,setLine,setGhost,setCars,setTheme,resize,frame,info,dispose,_debug:{renderer,scene}};
}
