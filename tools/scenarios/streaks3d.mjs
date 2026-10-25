import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';

export const options = {webgl:true};

export default async ctx=>{
  const {run,call}=ctx;
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  const result=await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    const q=s=>document.querySelector(s),raf=()=>new Promise(r=>requestAnimationFrame(r));
    const until=async(f)=>{const end=performance.now()+120000;while(!f()){if(performance.now()>end)throw new Error('streaks3d state timeout');await raf();}};
    send({type:'pause'});await until(()=>!S.running);
    const rev=S.disp.lineRev;send({type:'setLine'});await until(()=>S.disp.lineRev!==rev);
    q('#replaySeg [data-v="0"]').click();S.animT=3;S.hist=[];S.prog.evals=0;await document.fonts.ready;
    q('#zView').click();await until(()=>!!S.scene3d);
    const select=q('#camera3d');select.value='chase';select.dispatchEvent(new Event('change',{bubbles:true}));
    await until(()=>!!S.cam3d.state);await raf();await raf();
    const mesh=S.scene3d._debug.scene.getObjectByName('speedStreaks'),checks={defaultOff:!q('#streaksOn3d').checked&&mesh.count===0,controlShown:!q('#streaks3d').hidden,instanced:mesh.isInstancedMesh&&!mesh.castShadow&&!mesh.receiveShadow};
    q('#streaksOn3d').click();q('#replaySeg [data-v="1"]').click();await until(()=>mesh.count>0);
    const geometries=S.scene3d.info().geometries,start=S.animT;
    checks.atSpeed=mesh.count>0;checks.memoryStable=true;checks.withinPool=true;
    for(let i=0;i<60;i++){await raf();checks.memoryStable&&=S.scene3d.info().geometries===geometries;checks.withinPool&&=mesh.count<=mesh.instanceMatrix.count;}
    checks.oneTimesRunning=S.replay===1&&S.animT>start;
    q('#streaksOn3d').click();await until(()=>mesh.count===0);checks.offClears=mesh.count===0;
    q('#streaksOn3d').click();await until(()=>mesh.count>0);
    window.streakCheck={S,q,raf,until,mesh};return {checks,geometries};
  })()`);
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  Object.assign(result.checks,await run(`(async()=>{const {S,q,raf,until,mesh}=streakCheck;await until(()=>S.reducedMotion&&q('#streaksOn3d').disabled&&mesh.count===0);await raf();return {reducedClears:mesh.count===0,reducedDisables:q('#streaksOn3d').disabled,reducedNote:!q('#streaksNote3d').hidden};})()`));
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await run(`(async()=>{
    const {S,q,raf,until}=streakCheck;await until(()=>!S.reducedMotion&&!q('#streaksOn3d').disabled);
    q('#replaySeg [data-v="0"]').click();S.animT=3;await raf();await raf();await raf();
    const {smoothPose}=await import('/src/playback/pose.js'),chase=await import('/src/views/scene3d/cameras/chase.js');
    const car=smoothPose(S.disp,3,S.info),cv=q('#view3d');
    const view=chase.view(chase.init({T:S.T,car,ghost:null,replay:0,aspect:cv.clientWidth/cv.clientHeight}));
    S.scene3d.frame({car,ghost:null,trace:null,view,attitude:null,streaks:{speed:70,tAnim:3,on:true}});
  })()`);
  const {png}=await screenshot(ctx);
  const reference=await compareToReference(ctx,png,fileURLToPath(new URL('./ref/streaks3d-chase.png',import.meta.url)));
  result.checks.chaseReference=reference.ok;
  return {...result,reference,allTrue:Object.values(result.checks).every(Boolean)};
};
