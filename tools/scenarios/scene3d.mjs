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
    document.querySelector('#replaySeg [data-v="0"]').click();S.animT=3;
    const {createScene3d}=await import('/src/views/scene3d/index.js');
    const {readColors}=await import('/src/views/map2d/colors.js');
    const orbit=await import('/src/views/scene3d/cameras/orbit.js');
    const {smoothPose}=await import('/src/playback/pose.js');
    const {stationFrames}=await import('/src/views/scene3d/frame.js');
    const {trackRibbon}=await import('/src/views/scene3d/meshes.js');
    const {findCorners}=await import('/src/views/map2d/map.js');
    const {startBand,gantry,boardPlacements,signPlacements,labelPlanes,markerPosts}=await import('/src/views/scene3d/markings.js');
    const {lineRibbon}=await import('/src/views/scene3d/line.js');
    const {buildCarModel,disposeCar}=await import('/src/views/scene3d/car.js');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:800px;height:600px;z-index:99999';document.body.append(canvas);
    const pal=readColors(document.documentElement),events=[];
    const api=createScene3d(canvas,pal,{onLost:e=>events.push(e.type)});
    api.resize({width:800,height:600},1);api.setTrack(S.T);api.setLine(S.disp,'speed',pal);api.setGhost(S.disp);api.setCars({car:S.P,ghost:S.P});
    const input={car:smoothPose(S.disp,3),ghost:smoothPose(S.disp,6),view:orbit.view(orbit.init({T:S.T,aspect:800/600}))};
    api.frame(input);
    const model=buildCarModel(S.P);let carTriangles=0;
    model.traverse(o=>{if(o.geometry)carTriangles+=o.geometry.index.count/3;});disposeCar(model);
    const expected=trackRibbon(S.T,stationFrames(S.T),{pal}).index.length/3+2*lineRibbon(S.disp).index.length/3+2*carTriangles
      +[startBand(S.T),gantry(S.T),markerPosts(S.T,[...boardPlacements(S.T,findCorners(S.T)),...signPlacements(S.T,findCorners(S.T))]),labelPlanes(boardPlacements(S.T,findCorners(S.T))),labelPlanes(signPlacements(S.T,findCorners(S.T)))].reduce((n,m)=>n+m.index.length/3,0);
    const first=api.info();for(let i=0;i<300;i++)api.frame(input);const afterFrames=api.info();
    const rebuilds=[];for(let i=0;i<5;i++){api.setTrack(S.T);api.frame(input);rebuilds.push(api.info().geometries);}
    const beforeTheme=api._debug.scene.children.filter(o=>o.geometry).map(o=>o.geometry);
    api.setTheme(pal);api.frame(input);
    const themeStable=api._debug.scene.children.filter(o=>o.geometry).every((o,i)=>o.geometry===beforeTheme[i]);
    const logCanvas=document.createElement('canvas'),log=createScene3d(logCanvas,pal,{forceLogDepth:true});
    log.resize({width:100,height:100},1);log.setTrack(S.T);log.frame(input);
    const fallback=log.info();log.dispose();
    window.sceneCheck={api,input,events};
    return {expected,first,afterFrames,rebuilds,themeStable,fallback,frozen:!S.running&&S.replay===0};
  })()`);
  // Capture immediately after a render so the default non-preserved drawing buffer is populated.
  await run('sceneCheck.api.frame(sceneCheck.input)');
  const {png}=await screenshot(ctx);
  const reference=await compareToReference(ctx,png,fileURLToPath(new URL('./ref/scene3d.png',import.meta.url)));
  const context=await run(`(async()=>{
    const {api,input,events}=sceneCheck,gl=api._debug.renderer.getContext(),ext=gl.getExtension('WEBGL_lose_context');
    if(!ext)return {supported:false,events};
    ext.loseContext();await new Promise(r=>setTimeout(r,100));
    const lost=events.includes('webglcontextlost');ext.restoreContext();await new Promise(r=>setTimeout(r,300));
    const restored=events.includes('webglcontextrestored');api.frame(input);api.dispose();
    return {supported:true,lost,restored,events};
  })()`);
  const checks={frozen:seen.frozen,reference:reference.ok,triangles:Math.abs(seen.first.triangles-seen.expected)<=seen.expected*0.05,
    depth:['reversed','log'].includes(seen.first.depth),logFallback:seen.fallback.depth==='log'&&seen.fallback.triangles>0,
    framesStable:seen.first.geometries===seen.afterFrames.geometries,
    rebuildsStable:seen.rebuilds.every(n=>n===seen.first.geometries),themeStable:seen.themeStable,contextLost:context.lost,contextRestored:context.restored};
  return {allTrue:Object.values(checks).every(Boolean),checks,seen,reference,context};
};
