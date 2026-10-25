import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';

export const options = {webgl:true};

export default async ctx=>{
  const {run,call}=ctx;
  await call('Emulation.setDeviceMetricsOverride',{width:800,height:600,deviceScaleFactor:1,mobile:false});
  await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    send({type:'pause'});for(let i=0;i<100&&S.running;i++)await wait(50);
    const rev=S.disp.lineRev;send({type:'setLine'});
    for(let i=0;i<100&&S.disp.lineRev===rev;i++)await wait(50);
    document.querySelector('#replaySeg [data-v="0"]').click();S.animT=3;
    const {createScene3d}=await import('/src/views/scene3d/index.js');
    const {readColors}=await import('/src/views/map2d/colors.js');
    const orbit=await import('/src/views/scene3d/cameras/orbit.js');
    const chase=await import('/src/views/scene3d/cameras/chase.js');
    const {smoothPose}=await import('/src/playback/pose.js');
    document.documentElement.dataset.theme='light';
    const pal=readColors(document.documentElement),canvas=document.createElement('canvas');
    canvas.style.cssText='position:fixed;inset:0;width:800px;height:600px;z-index:99999';document.body.append(canvas);
    const api=createScene3d(canvas,pal);
    api.resize({width:800,height:600},1);api.setTrack(S.T);api.setLine(S.disp,'speed',pal);
    api.setGhost(S.disp);api.setCars({car:S.P,ghost:S.P});
    const input={T:S.T,car:smoothPose(S.disp,3),ghost:smoothPose(S.disp,6),aspect:800/600};
    input.view=orbit.view(orbit.init(input));api.frame(input);
    const {scene,renderer}=api._debug,objects=[];
    scene.traverse(o=>{if(o.geometry)objects.push([o,o.geometry]);});
    window.themeCheck={api,input,readColors,chase,objects,count:renderer.info.memory.geometries,
      background:scene.background.getHex(),frozen:!S.running&&S.replay===0};
  })()`);
  const references={};
  async function capture(name){
    await run('themeCheck.api.frame(themeCheck.input)');
    const {png}=await screenshot(ctx);
    references[name]=await compareToReference(ctx,png,fileURLToPath(new URL('./ref/theme3d-'+name+'.png',import.meta.url)));
  }
  await capture('light');
  const checks=await run(`(()=>{
    const c=themeCheck,{api,input,objects}=c,{scene,renderer}=api._debug;
    document.documentElement.dataset.theme='dark';api.setTheme(c.readColors(document.documentElement));api.frame(input);
    const after=[];scene.traverse(o=>{if(o.geometry)after.push(o);});
    // The opaque car is the group containing a body mesh with an opaque material.
    const car=scene.children.find(o=>o.isGroup&&o.children.some(m=>m.name==='body'&&!m.material.transparent));
    let casters=0,carOnly=true,carMeshes=0;
    scene.traverse(o=>{
      if(o.isLight||!o.castShadow)return;
      casters++;let p=o;while(p&&p!==car)p=p.parent;if(!car||p!==car)carOnly=false;
    });
    if(car)car.traverse(o=>{if(o.isMesh)carMeshes++;});
    const sun=scene.children.find(o=>o.isDirectionalLight);
    return {frozen:c.frozen,geometryCount:renderer.info.memory.geometries===c.count,
      geometryIdentity:after.length===objects.length&&objects.every(([o,g])=>after.includes(o)&&o.geometry===g),
      shadows:renderer.shadowMap.enabled,carOnly:carOnly&&casters>0&&casters===carMeshes,
      shadowFollowsCar:!!car&&sun.target.position.distanceTo(car.position)<1e-9,
      backgroundChanged:scene.background.getHex()!==c.background};
  })()`);
  await capture('dark');
  await run(`(()=>{
    const c=themeCheck;document.documentElement.dataset.theme='light';
    c.api.setTheme(c.readColors(document.documentElement));c.input.view=c.chase.view(c.chase.init(c.input));
  })()`);
  await capture('chase');
  await run('themeCheck.api.dispose()');
  checks.references=Object.values(references).every(r=>r.ok);
  return {allTrue:Object.values(checks).every(Boolean),checks,references};
};
