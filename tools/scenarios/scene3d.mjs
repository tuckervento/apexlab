import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';

export const options = {webgl:true};

export default async ctx=>{
  const {run,call}=ctx;
  await call('Emulation.setDeviceMetricsOverride',{width:800,height:600,deviceScaleFactor:1,mobile:false});
  const seen=await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send,settled}=await import('/src/app/client.js');
    const deadline=Date.now()+60000,wait=async test=>{while(!test()){if(Date.now()>=deadline)throw new Error('scene setup deadline');await new Promise(requestAnimationFrame);}};
    await wait(settled);send({type:'pause'});await wait(()=>!S.running);
    const rev=S.disp.lineRev;send({type:'setLine'});await wait(()=>S.disp.lineRev!==rev);
    document.querySelector('#replaySeg [data-v="0"]').click();S.animT=3;
    const {createScene3d}=await import('/src/views/scene3d/index.js');
    const {readColors}=await import('/src/views/map2d/colors.js');
    const orbit=await import('/src/views/scene3d/cameras/orbit.js');
    const {smoothPose}=await import('/src/playback/pose.js');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:800px;height:600px;z-index:99999';document.body.append(canvas);
    const pal=readColors(document.documentElement),events=[];
    const api=createScene3d(canvas,pal,{onLost:e=>events.push(e.type)});
    api.resize({width:800,height:600},1);api.setTrack(S.T);api.setLine(S.disp,'speed',pal);api.setGhost(S.disp);api.setCars({car:S.P,ghost:S.P});
    const input={car:smoothPose(S.disp,3),ghost:smoothPose(S.disp,6),view:orbit.view(orbit.init({T:S.T,aspect:800/600}))};
    const renderer=api._debug.renderer,render=renderer.renderBufferDirect,draws=new Set(),ribbons=new Set();
    renderer.renderBufferDirect=function(camera,scene,geometry,material,object,group){
      let name='';
      for(let o=object;o;o=o.parent){if(!name&&o.name)name=o.name;if(o.name==='lapCar'||o.name==='ghostCar'){name=o.name;break;}}
      if(name)draws.add(name);
      if(object.isMesh&&!object.name&&material.vertexColors)ribbons.add(object);
      return render.call(this,camera,scene,geometry,material,object,group);
    };
    try{api.frame(input);}finally{renderer.renderBufferDirect=render;}
    const first=api.info();for(let i=0;i<300;i++)api.frame(input);const afterFrames=api.info();
    const rebuilds=[];for(let i=0;i<5;i++){api.setTrack(S.T);api.frame(input);rebuilds.push(api.info().geometries);}
    // Every geometry in the scene (meshes sit in groups since 3.5), so a theme switch that rebuilds any of them fails.
    const geometries=()=>{const out=[];api._debug.scene.traverse(o=>{if(o.geometry)out.push(o.geometry);});return out;};
    const beforeTheme=geometries();
    api.setTheme(pal);api.frame(input);
    const afterTheme=geometries(),themeStable=beforeTheme.length>0&&afterTheme.length===beforeTheme.length&&afterTheme.every((g,i)=>g===beforeTheme[i]);
    // Ground past the shadow camera's far plane renders as shadowed: follow the light from each corner of the shadow box
    // down to the ground plane (an oblique sun makes flat ground deeper across the box) and compare with far.
    const shadowBox=sc=>{const sun=sc.children.find(o=>o.isDirectionalLight),cam=sun.shadow.camera,e=cam.matrixWorld.elements,
      gy=sc.getObjectByName('ground').geometry.attributes.position.array[1],p=sun.position,t=sun.target.position,
      uy=(t.y-p.y)/Math.hypot(t.x-p.x,t.y-p.y,t.z-p.z),depths=[];
      for(const x of [cam.left,cam.right])for(const y of [cam.bottom,cam.top])depths.push((gy-(e[1]*x+e[5]*y+e[13]))/uy);
      return {far:cam.far,deepest:Math.max(...depths)};};
    const shadow=shadowBox(api._debug.scene);
    const logCanvas=document.createElement('canvas'),log=createScene3d(logCanvas,pal,{forceLogDepth:true});
    log.resize({width:100,height:100},1);log.setTrack(S.T);log.frame(input);
    const fallback=log.info();log.dispose();
    window.sceneCheck={api,input,events};
    return {draws:[...draws],ribbons:ribbons.size,first,afterFrames,rebuilds,themeStable,fallback,shadow,frozen:!S.running&&S.replay===0};
  })()`);
  // Capture immediately after a render so the default non-preserved drawing buffer is populated.
  await run('sceneCheck.api.frame(sceneCheck.input)');
  const {png}=await screenshot(ctx);
  const reference=await compareToReference(ctx,png,fileURLToPath(new URL('./ref/scene3d.png',import.meta.url)));
  const context=await run(`(async()=>{
    const {api,input,events}=sceneCheck,gl=api._debug.renderer.getContext(),ext=gl.getExtension('WEBGL_lose_context');
    if(!ext)return {supported:false,events};
    const deadline=Date.now()+60000;
    const event=async type=>{
      /* Yield past event dispatch before requesting restoration. */
      do{await new Promise(requestAnimationFrame);}while(!events.includes(type)&&Date.now()<deadline);
      return events.includes(type);
    };
    ext.loseContext();const lost=await event('webglcontextlost');let restored=false;
    if(lost&&Date.now()<deadline){ext.restoreContext();restored=await event('webglcontextrestored');}
    if(restored)api.frame(input);api.dispose();
    return {supported:true,lost,restored,events};
  })()`);
  const drawn=Object.fromEntries(['road','ground','skirts','kerbs','startBand','gantry','boards','signs','markerPosts','labelBacks','lapCar','ghostCar'].map(n=>[n+'Drawn',seen.draws.includes(n)]));
  const checks={frozen:seen.frozen,reference:reference.ok,...drawn,lineRibbonsDrawn:seen.ribbons>=2,triangles:seen.first.triangles>0,
    depth:['reversed','log'].includes(seen.first.depth),logFallback:seen.fallback.depth==='log'&&seen.fallback.triangles>0,
    framesStable:seen.first.geometries===seen.afterFrames.geometries,
    rebuildsStable:seen.rebuilds.every(n=>n===seen.first.geometries),themeStable:seen.themeStable,
    shadowCoversGround:seen.shadow.deepest<=seen.shadow.far,contextLost:!!context.lost,contextRestored:!!context.restored};
  return {allTrue:Object.values(checks).every(Boolean),checks,seen:{...seen,reference,context}};
};
