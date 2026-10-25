import { fileURLToPath } from 'node:url';
import { compareToReference, diffPng, screenshot } from '../shot.mjs';

export const options = {webgl: true};

export default async ctx=>{
  const {run,call}=ctx;
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  const result=await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    const {smoothPose,raceClock}=await import('/src/playback/pose.js');
    const q=s=>document.querySelector(s),raf=()=>new Promise(r=>requestAnimationFrame(r));
    const until=async(test)=>{const end=performance.now()+60000;while(!test()){if(S.frameErr||S.view3dMsg)throw new Error(String(S.frameErr||S.view3dMsg));if(performance.now()>end)throw new Error('wheels3d state timeout');await raf();}};
    const settle=async()=>{await until(()=>!!S.cam3d.state);await raf();await raf();};
    const replay=n=>q('#replaySeg [data-v="'+n+'"]').click();
    replay(0);send({type:'pause'});await until(()=>!S.running);
    const old=S.info;q('#carPreset').value='GT racer';q('#carPreset').dispatchEvent(new Event('change',{bubbles:true}));
    await until(()=>S.info!==old&&S.P.wb===2.65);
    send({type:'pause'});await until(()=>!S.running);
    const rev=S.disp.lineRev;send({type:'setLine'});await until(()=>S.disp.lineRev!==rev);
    S.hist=[];S.prog.evals=0;await document.fonts.ready;
    q('#zView').click();await until(()=>!!S.scene3d);
    q('#camera3d').value='chase';q('#camera3d').dispatchEvent(new Event('change',{bubbles:true}));await settle();
    const api=S.scene3d,scene=api._debug.scene,car=scene.getObjectByName('lapCar'),d=S.disp,r=api.carRadii().car;
    const limit=Math.PI/4*r*60,names=['wheelFL','wheelFR','wheelRL','wheelRR'];
    const visible=on=>car.visible&&names.every(n=>{const w=car.getObjectByName(n).children[0];return w.getObjectByName('wheelBlur').visible===on&&w.getObjectByName('wheelFace').visible===!on;});
    let slow=-1,fast=-1;
    for(let i=0;i<d.v.length;i++){
      if(d.v[i]<limit&&Math.abs(d.k[i])>0.02&&(slow<0||d.v[i]<d.v[slow]))slow=i;
      if(Math.abs(d.k[i])<0.002&&d.v[i]*12>limit&&(fast<0||d.v[i]>d.v[fast]))fast=i;
    }
    if(slow<0||fast<0)throw new Error('snapshot lacks a slow corner or fast straight');
    const geometryCount=()=>api._debug.renderer.info.memory.geometries;
    const before=geometryCount(),counts=[],seen=[];
    for(let i=0;i<6;i++){
      const on=i%2===0,index=on?fast:slow,n=on?12:1;
      replay(0);S.animT=d.tc[index];S.cam3d.state=null;await settle();
      const start=S.animT;replay(n);
      await until(()=>{
        const p=smoothPose(d,raceClock([d.t],S.animT));
        return S.animT>start&&(on?Math.abs(d.k[p.station])<0.002&&p.speed*12>limit:Math.abs(d.k[p.station])>0.02&&p.speed<limit);
      });
      const p=smoothPose(d,raceClock([d.t],S.animT));
      seen.push({replay:n,speed:p.speed,station:p.station,k:d.k[p.station],disc:visible(true),spokes:visible(false)});
      counts.push(geometryCount());
      replay(0);await raf();await raf();
      if(!visible(false))throw new Error('pause did not restore wheel faces');
    }
    window.wheelsShot={slow:d.tc[slow],fast:d.tc[fast],settle};
    return {checks:{straightDisc:seen.filter(s=>s.replay===12).every(s=>s.disc&&!s.spokes),
      cornerSpokes:seen.filter(s=>s.replay===1).every(s=>s.spokes&&!s.disc),pausedSpokes:visible(false),
      geometriesStable:before>0&&counts.every(n=>n===before),noFrameError:!S.frameErr&&S.view==='3d'},seen,counts,before,radius:r,threshold:limit};
  })()`);
  const references={},shots={};
  for(const [name,on] of [['spokes',false],['blur',true]]){
    await run(`(async()=>{
      const {S}=await import('/src/app/state.js'),{smoothPose}=await import('/src/playback/pose.js');
      const chase=await import('/src/views/scene3d/cameras/chase.js');
      const {Vector3}=await import('/vendor/three-0.186.1/build/three.core.js');
      S.animT=wheelsShot.slow;S.cam3d.state=null;await wheelsShot.settle();
      const car=smoothPose(S.disp,S.animT,S.info),cv=document.querySelector('#view3d');
      const view=chase.view(chase.init({T:S.T,car,ghost:null,replay:0,aspect:cv.clientWidth/cv.clientHeight}));
      const input={car,ghost:null,trace:null,view,attitude:{car:{roll:0,pitch:0,steer:0,spin:1}},wheelBlur:{car:${on},ghost:false,trace:false}};
      S.scene3d.frame(input);
      const lapCar=S.scene3d._debug.scene.getObjectByName('lapCar');
      input.view={position:lapCar.localToWorld(new Vector3(0,0.5,5)).toArray(),
        target:lapCar.localToWorld(new Vector3(0,0.3,0)).toArray(),up:[0,1,0],fovDeg:50,near:0.1,far:5000};
      S.scene3d.frame(input);
    })()`);
    const {png}=await screenshot(ctx);
    shots[name]=png;
    references[name]=await compareToReference(ctx,png,fileURLToPath(new URL('./ref/wheels3d-'+name+'.png',import.meta.url)));
    result.checks[name+'Reference']=references[name].ok;
  }
  const wheelDifference=await diffPng(ctx,shots.spokes,shots.blur,{threshold:16});
  result.checks.wheelImagesDiffer=wheelDifference>0;
  return {...result,references,wheelDifference,allTrue:Object.values(result.checks).every(Boolean)};
};
