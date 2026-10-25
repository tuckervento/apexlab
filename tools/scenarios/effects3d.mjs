import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';
export const options = {webgl:true};

export default async ctx=>{
  const {run,call}=ctx;
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const result=await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js'),chase=await import('/src/views/scene3d/cameras/chase.js');
    const q=s=>document.querySelector(s),raf=()=>new Promise(r=>requestAnimationFrame(r));
    const until=async f=>{const end=performance.now()+120000;while(!f()){if(performance.now()>end)throw Error('effects3d state timeout');await raf();}};
    send({type:'pause'});await until(()=>!S.running);const rev=S.disp.lineRev;send({type:'setLine'});await until(()=>S.disp.lineRev!==rev);
    q('#replaySeg [data-v="0"]').click();S.animT=2;S.hist=[];S.prog.evals=0;await document.fonts.ready;
    q('#zView').click();await until(()=>!!S.scene3d);
    q('#camera3d').value='chase';q('#camera3d').dispatchEvent(new Event('change',{bubbles:true}));await until(()=>!!S.cam3d.state);await raf();await raf();
    await until(()=>S.reducedMotion);
    const api=S.scene3d,frame=api.frame,render=api._debug.renderer.render;
    window.effectsSeen={frames:0,base:true,offset:true,rendered:true,renderedOffset:true,fovs:[]};
    api._debug.renderer.render=function(scene,camera){effectsSeen.rendered&&=camera.fov===effectsSeen.expectedFov;effectsSeen.renderedOffset&&=JSON.stringify(camera.position.toArray())===JSON.stringify(effectsSeen.expectedPosition);return render.call(this,scene,camera);};
    api.frame=input=>{
      const base=chase.view(S.cam3d.state);effectsSeen.expectedFov=input.view.fovDeg;effectsSeen.expectedPosition=[...input.view.position];
      if(S.reducedMotion){effectsSeen.frames++;effectsSeen.base&&=input.view.fovDeg===base.fovDeg;effectsSeen.offset&&=JSON.stringify(input.view.position)===JSON.stringify(base.position);}
      else effectsSeen.fovs.push(input.view.fovDeg);
      return frame(input);
    };
    const start=S.animT;q('#replaySeg [data-v="1"]').click();await until(()=>S.animT>=start+2&&effectsSeen.frames>=3);
    q('#replaySeg [data-v="0"]').click();await raf();await raf();
    return {checks:{reducedObserved:S.reducedMotion,reducedBaseFov:effectsSeen.base,reducedZeroOffset:effectsSeen.offset,renderedFov:effectsSeen.rendered,renderedOffsets:effectsSeen.renderedOffset},reducedFrames:effectsSeen.frames};
  })()`);
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  Object.assign(result.checks,await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),raf=()=>new Promise(r=>requestAnimationFrame(r)),q=s=>document.querySelector(s);
    const end=performance.now()+120000;while(S.reducedMotion){if(performance.now()>end)throw Error('reduced motion listener timeout');await raf();}
    const start=S.animT;q('#replaySeg [data-v="1"]').click();while(S.animT<start+2||effectsSeen.fovs.length<3){if(performance.now()>end)throw Error('normal effects timeout');await raf();}
    q('#replaySeg [data-v="0"]').click();await raf();await raf();
    return {liveFovChanges:Math.max(...effectsSeen.fovs)-Math.min(...effectsSeen.fovs)>0.01,liveRenderedFov:effectsSeen.rendered,noFrameError:S.view==='3d'&&!S.frameErr};
  })()`));
  const fixed=await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{smoothPose}=await import('/src/playback/pose.js');
    const chase=await import('/src/views/scene3d/cameras/chase.js'),effects=await import('/src/views/scene3d/effects.js');
    const raf=()=>new Promise(r=>requestAnimationFrame(r));let slow=0,fast=0;
    for(let i=1;i<S.disp.v.length;i++){if(S.disp.v[i]<S.disp.v[slow])slow=i;if(S.disp.v[i]>S.disp.v[fast])fast=i;}
    const d=S.disp;S.animT=d.tc[fast];await raf();await raf();await raf();
    document.querySelector('#overlay3d').style.visibility='hidden';
    const api=S.scene3d,cv=document.querySelector('#view3d'),values=[];
    for(const i of [slow,fast]){
      const car=smoothPose(d,d.tc[i],S.info),input={T:S.T,car,aspect:cv.clientWidth/cv.clientHeight},state=effects.init();
      effects.step(state,car,S.T,5,{replay:1});const view=effects.apply(state,chase.view(chase.init(input)));
      api.frame({car,ghost:null,trace:null,view,attitude:{car:{roll:0,pitch:0,steer:0,spin:0}}});values.push({speed:car.speed,fov:view.fovDeg});
    }
    return {values,checks:{frozenFovRises:values[1].speed>values[0].speed&&values[1].fov>values[0].fov,fovCapped:values.every(v=>v.fov<=72)}};
  })()`);
  Object.assign(result.checks,fixed.checks);result.frozen=fixed.values;
  const {png}=await screenshot(ctx);
  const reference=await compareToReference(ctx,png,fileURLToPath(new URL('./ref/effects3d-chase.png',import.meta.url)));
  result.checks.chaseReference=reference.ok;
  return {...result,reference,allTrue:Object.values(result.checks).every(Boolean)};
};
