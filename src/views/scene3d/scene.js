import * as THREE from '../../../vendor/three-0.186.1/build/three.module.js';
import { stationFrames } from './frame.js';
import { trackRibbon } from './meshes.js';
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
  scene.background=new THREE.Color(pal.colors.paper);
  scene.add(new THREE.HemisphereLight(0xffffff,0x606060,2));
  const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(200,500,100);scene.add(sun);
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
  function setTrack(value){
    T=value;remove(track);track=null;if(!T)return;
    const data=trackRibbon(T,stationFrames(T),{heightColors:!T.flat,pal});
    track=new THREE.Mesh(geometry(data),new THREE.MeshStandardMaterial({color:data.color?0xffffff:pal.colors.track,
      vertexColors:!!data.color,flatShading:true,side:THREE.DoubleSide}));scene.add(track);
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
    group.visible=false;group.traverse(o=>{if(o.isMesh){o.renderOrder=ghost?4:3;if(ghost)o.material.depthWrite=false;}});
    scene.add(group);return group;
  }
  function setCars(specs){removeCar(car);removeCar(ghostCar);car=makeCar(specs.car,false);ghostCar=makeCar(specs.ghost,true);}
  function setTheme(value){
    pal=value;scene.background.setStyle(pal.colors.paper);
    if(track){
      if(track.geometry.attributes.color)recolor(track,trackRibbon(T,stationFrames(T),{heightColors:true,pal}).color);
      else track.material.color.setStyle(pal.colors.track);
    }
    if(line)recolor(line,lineColors(disp,mode,pal));
    if(ghostLine)recolor(ghostLine,lineColors(g,'ghost',pal));
    tintCar(car,pal.colors.accent);tintCar(ghostCar,pal.colors.ghost);
  }
  function resize(rect,dpr){renderer.setPixelRatio(Math.min(2,dpr));renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}
  function frame(input){
    if(car){car.visible=!!input.car;if(input.car)placeCar(car,input.car);}
    if(ghostCar){ghostCar.visible=!!input.ghost;if(input.ghost)placeCar(ghostCar,input.ghost);}
    const v=input.view;camera.position.fromArray(v.position);camera.up.fromArray(v.up);target.fromArray(v.target);camera.lookAt(target);
    if(camera.fov!==v.fovDeg||camera.near!==v.near||camera.far!==v.far){camera.fov=v.fovDeg;camera.near=v.near;camera.far=v.far;camera.updateProjectionMatrix();}
    renderer.render(scene,camera);
  }
  function lost(event){event.preventDefault();onLost(event);}
  canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',lost);
  function info(){return {depth,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,programs:renderer.info.programs.length};}
  function dispose(){
    canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',lost);
    remove(track);remove(line);remove(ghostLine);removeCar(car);removeCar(ghostCar);renderer.dispose();
  }
  return {setTrack,setLine,setGhost,setCars,setTheme,resize,frame,info,dispose,_debug:{renderer,scene}};
}
