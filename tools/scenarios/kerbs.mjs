import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';

export const options = {webgl:true};
export default async ctx=>{
  const {run,call}=ctx;
  await call('Emulation.setDeviceMetricsOverride',{width:800,height:600,deviceScaleFactor:1,mobile:false});
  const seen=await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    send({type:'pause'});for(let i=0;i<100&&S.running;i++)await wait(50);
    const rev=S.disp.lineRev;send({type:'setLine'});
    for(let i=0;i<100&&S.disp.lineRev===rev;i++)await wait(50);
    document.querySelector('#replaySeg [data-v="0"]').click();
    const {createScene3d}=await import('/src/views/scene3d/index.js');
    const {readColors}=await import('/src/views/map2d/colors.js');
    const {findCorners}=await import('/src/views/map2d/map.js');
    const {smoothPose}=await import('/src/playback/pose.js');
    const chase=await import('/src/views/scene3d/cameras/chase.js');
    const corner=findCorners(S.T).reduce((a,b)=>a.peak>b.peak?a:b);
    const car=smoothPose(S.disp,S.disp.tc[corner.apex]);
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:800px;height:600px;z-index:99999';document.body.append(canvas);
    const pal=readColors(document.documentElement),api=createScene3d(canvas,pal);
    api.resize({width:800,height:600},1);api.setTrack(S.T);api.setLine(S.disp,'speed',pal);api.setCars({car:S.P});
    const cameraInput={T:S.T,car,aspect:800/600},state=chase.init(cameraInput);
    chase.step(state,cameraInput,1/60);
    const input={car,view:chase.view(state)};api.frame(input);
    const mesh=api._debug.scene.getObjectByName('kerbs'),triangles=mesh?mesh.geometry.index.count/3:0;
    const first=api.info().geometries,rebuilds=[];
    for(let i=0;i<5;i++){api.setTrack(S.T);api.frame(input);rebuilds.push(api.info().geometries);}
    window.kerbCheck={api,input};
    return {triangles,first,rebuilds,apex:corner.apex};
  })()`);
  await run('kerbCheck.api.frame(kerbCheck.input)');
  const {png}=await screenshot(ctx);
  const reference=await compareToReference(ctx,png,fileURLToPath(new URL('./ref/kerbs-chase.png',import.meta.url)));
  await run('kerbCheck.api.dispose()');
  const checks={mesh:seen.triangles>0,rebuildsStable:seen.rebuilds.length===5&&seen.rebuilds.every(n=>n===seen.first),reference:reference.ok};
  return {allTrue:Object.values(checks).every(Boolean),checks,seen,reference};
};
