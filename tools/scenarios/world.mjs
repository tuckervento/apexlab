import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';

export const options = {webgl: true};

export default async ctx=>{
  const {run,call}=ctx;
  await call('Emulation.setDeviceMetricsOverride',{width:800,height:600,deviceScaleFactor:1,mobile:false});
  const seen=await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),old=S.T;
    const slider=document.querySelector('#f-hills');slider.value=40;slider.dispatchEvent(new Event('input',{bubbles:true}));
    for(let i=0;i<200&&S.T===old;i++)await wait(50);
    if(S.T===old||S.T.flat)throw new Error('40 m hill track did not arrive');
    send({type:'pause'});for(let i=0;i<100&&S.running;i++)await wait(50);
    const rev=S.disp.lineRev;send({type:'setLine'});
    for(let i=0;i<100&&S.disp.lineRev===rev;i++)await wait(50);
    if(S.disp.lineRev===rev)throw new Error('centreline did not arrive');
    document.querySelector('#replaySeg [data-v="0"]').click();S.animT=3;
    document.documentElement.dataset.theme='light';
    const {createScene3d}=await import('/src/views/scene3d/index.js');
    const {readColors}=await import('/src/views/map2d/colors.js');
    const orbit=await import('/src/views/scene3d/cameras/orbit.js');
    const {smoothPose}=await import('/src/playback/pose.js');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:800px;height:600px;z-index:99999';document.body.append(canvas);
    const pal=readColors(document.documentElement),api=createScene3d(canvas,pal);
    api.resize({width:800,height:600},1);api.setTrack(S.T);api.setLine(S.disp,'speed',pal);api.setCars({car:S.P});
    const input={car:smoothPose(S.disp,3),view:orbit.view(orbit.init({T:S.T,aspect:800/600}))};api.frame(input);
    const scene=api._debug.scene,ground=scene.getObjectByName('ground'),road=scene.children.find(o=>o.geometry?.attributes.color);
    const minY=m=>{const p=m.geometry.attributes.position.array;let y=Infinity;for(let j=1;j<p.length;j+=3)y=Math.min(y,p[j]);return y;};
    window.worldCheck={api,input,readColors};
    return {belowRoad:!!ground&&!!road&&minY(ground)+ground.position.y<minY(road)+road.position.y,
      geometries:api.info().geometries,frozen:!S.running&&S.replay===0};
  })()`);
  await run('worldCheck.api.frame(worldCheck.input)');
  const light=await compareToReference(ctx,(await screenshot(ctx)).png,fileURLToPath(new URL('./ref/world-light.png',import.meta.url)));
  const darkSeen=await run(`(()=>{
    document.documentElement.dataset.theme='dark';const {api,input,readColors}=worldCheck;
    api.setTheme(readColors(document.documentElement));api.frame(input);
    return {geometries:api.info().geometries,fogMatches:api._debug.scene.fog.color.equals(api._debug.scene.background)};
  })()`);
  await run('worldCheck.api.frame(worldCheck.input)');
  const dark=await compareToReference(ctx,(await screenshot(ctx)).png,fileURLToPath(new URL('./ref/world-dark.png',import.meta.url)));
  await run('worldCheck.api.dispose()');
  const checks={belowRoad:seen.belowRoad,frozen:seen.frozen,themeStable:seen.geometries===darkSeen.geometries,
    fogMatches:darkSeen.fogMatches,light:light.ok,dark:dark.ok};
  return {allTrue:Object.values(checks).every(Boolean),checks,seen,darkSeen,light,dark};
};
