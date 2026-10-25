import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';

export const options = {webgl:true};
export default async ctx=>{
  const {run,call}=ctx;
  await call('Emulation.setDeviceMetricsOverride',{width:800,height:600,deviceScaleFactor:1,mobile:false});
  const seen=await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    send({type:'pause'});for(let i=0;i<100&&S.running;i++)await new Promise(r=>setTimeout(r,50));
    document.querySelector('#replaySeg [data-v="0"]').click();
    const {createScene3d}=await import('/src/views/scene3d/index.js');
    const {readColors}=await import('/src/views/map2d/colors.js');
    const {findCorners}=await import('/src/views/map2d/map.js');
    const {stationFrames}=await import('/src/views/scene3d/frame.js');
    const {boardPlacements}=await import('/src/views/scene3d/markings.js');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:800px;height:600px;z-index:99999';document.body.append(canvas);
    const api=createScene3d(canvas,readColors(document.documentElement));api.resize({width:800,height:600},1);api.setTrack(S.T);
    const f=stationFrames(S.T),corners=findCorners(S.T),boards=boardPlacements(S.T,corners);
    function view(station,target){
      const i=3*Math.floor(station);
      return {position:[0,1,2].map(k=>f.origin[i+k]-18*f.tangent[i+k]+3*f.up[i+k]),
        target,up:[0,1,0],fovDeg:60,near:0.2,far:10000};
    }
    const start=view(0,[0,1,2].map(k=>f.origin[k]+3*f.up[k]));
    const board=boards[0],corner=view(board.station,board.position);
    const input={car:null,ghost:null,view:start};api.frame(input);
    const scene=api._debug.scene,renderer=api._debug.renderer;
    const named=['startBand','gantry','boards','signs','markerPosts'].every(n=>!!scene.getObjectByName(n));
    const counts=scene.getObjectByName('boards').userData.count===3*corners.length&&scene.getObjectByName('signs').userData.count===corners.length;
    const memory=()=>({geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures});
    const first=memory(),rebuilds=[];
    for(let i=0;i<5;i++){api.setTrack(S.T);api.frame(input);rebuilds.push(memory());}
    const before=[];scene.traverse(o=>{if(o.geometry)before.push(o.geometry);});
    const original=readColors(document.documentElement),alternate={...original,colors:{...original.colors,ink:'#ff0000',paper:'#ffffff'}};
    api.setTheme(alternate);api.frame(input);
    const after=[];scene.traverse(o=>{if(o.geometry)after.push(o.geometry);});
    const themeStable=before.length===after.length&&before.every((g,i)=>g===after[i])&&memory().textures===first.textures;
    api.setTheme(original);api.frame(input);
    const THREE=await import('/vendor/three-0.186.1/build/three.core.js');
    let frontOnly=true,plainBacks=true;
    scene.traverse(o=>{if(o.userData.labels)frontOnly&&=o.material.side===THREE.FrontSide;
      if(o.name==='labelBacks')plainBacks&&=!o.material.map&&o.material.side===THREE.FrontSide;});
    // Isolate one real board and sample its interior, excluding the ink border and silhouettes.
    const group=scene.getObjectByName('boards'),saved=[];
    scene.traverse(o=>{if(o.isMesh){saved.push([o,o.visible]);o.visible=o.parent===group;}});
    const pixelVariance=side=>{
      const n=[Math.sin(board.yaw),0,Math.cos(board.yaw)],v={position:board.position.map((x,k)=>x+side*5*n[k]),target:board.position,up:[0,1,0],fovDeg:35,near:0.1,far:10000};
      input.view=v;api.frame(input);
      const gl=renderer.getContext(),values=[];
      for(let y=-35;y<=35;y+=2)for(let x=-55;x<=55;x+=2){
        const px=new Uint8Array(4);gl.readPixels(400+x,300+y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);values.push(px[0]+px[1]+px[2]);
      }
      const mean=values.reduce((a,b)=>a+b,0)/values.length;
      return values.reduce((a,b)=>a+(b-mean)**2,0)/values.length;
    };
    const frontVariance=pixelVariance(1),backVariance=pixelVariance(-1);
    for(const [o,visible] of saved)o.visible=visible;
    input.view=start;api.frame(input);
    window.markingsCheck={api,input,start,corner};
    return {frontOnly,plainBacks,frontVariance,backVariance,named,counts,themeStable,corners:corners.length,first,rebuilds};
  })()`);
  const references={};
  for(const [name,view] of [['start','start'],['boards','corner']]){
    await run(`markingsCheck.input.view=markingsCheck.${view};markingsCheck.api.frame(markingsCheck.input)`);
    const {png}=await screenshot(ctx);
    references[name]=await compareToReference(ctx,png,fileURLToPath(new URL(`./ref/markings-${name}.png`,import.meta.url)));
  }
  await run('markingsCheck.api.dispose()');
  const checks={frontOnly:seen.frontOnly,plainBacks:seen.plainBacks,blankBack:seen.backVariance<1&&seen.frontVariance>100,themeStable:seen.themeStable,named:seen.named,counts:seen.counts,rebuilds:seen.rebuilds.every(m=>m.geometries===seen.first.geometries&&m.textures===seen.first.textures),start:references.start.ok,boards:references.boards.ok};
  return {allTrue:Object.values(checks).every(Boolean),checks,seen,references};
};
