import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';

export const options = {webgl:true};

export default async ctx=>{
  const {run,call}=ctx;
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  const result=await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    const {smoothPose}=await import('/src/playback/pose.js');
    const q=s=>document.querySelector(s),raf=()=>new Promise(r=>requestAnimationFrame(r));
    const until=async(test)=>{const end=performance.now()+120000;while(!test()){if(performance.now()>end)throw new Error('attitude3d state timeout');await raf();}};
    send({type:'pause'});await until(()=>!S.running);
    const rev=S.disp.lineRev;send({type:'setLine'});await until(()=>S.disp.lineRev!==rev);
    q('#replaySeg [data-v="0"]').click();S.hist=[];S.prog.evals=0;await document.fonts.ready;
    // Pick the strongest sustained right bend, with 0.9 animation seconds for the springs to settle.
    const d=S.disp;let end=0,best=-Infinity;
    for(let t=1;t<d.t-0.2;t+=0.05){
      let score=Infinity;
      for(let u=t-0.9;u<=t+0.15;u+=0.05){const p=smoothPose(d,u);score=Math.min(score,d.k[p.station]);}
      if(score>best){best=score;end=t;}
    }
    if(!(best>0))throw new Error('no sustained right-hand bend');
    S.animT=end-0.9;q('#zView').click();await until(()=>!!S.scene3d);
    q('#camera3d [data-v="chase"]').click();await until(()=>!!S.cam3d.state);await raf();await raf();
    q('#replaySeg [data-v="1"]').click();await until(()=>S.animT>=end);
    q('#replaySeg [data-v="0"]').click();await raf();await raf();
    const car=S.scene3d._debug.scene.getObjectByName('lapCar');
    const transforms=()=>[...car.rotation.toArray().slice(0,3),...['wheelFL','wheelFR','wheelRL','wheelRR'].flatMap(n=>{const w=car.getObjectByName(n);return [w.rotation.y,w.children[0].rotation.z];})];
    const before=transforms(),p=smoothPose(d,S.animT);
    const checks={rightCorner:d.k[p.station]>0,outwardRoll:car.rotation.x>1e-4,
      frontRight:['wheelFL','wheelFR'].every(n=>car.getObjectByName(n).rotation.y<0),
      rearStraight:['wheelRL','wheelRR'].every(n=>car.getObjectByName(n).rotation.y===0),
      wheelsSpinning:['wheelFL','wheelFR','wheelRL','wheelRR'].every(n=>car.getObjectByName(n).children[0].rotation.z<0)};
    for(let i=0;i<8;i++)await raf();
    checks.pausedFrozen=JSON.stringify(before)===JSON.stringify(transforms());
    checks.noFrameError=!S.frameErr&&S.view==='3d';
    window.attitudeShot={end};
    return {checks,transforms:before,station:p.station,k:d.k[p.station],animationTime:S.animT};
  })()`);
  // The live run stops within a frame (~0.1 s) of \`end\`, so its image differs run to run. The screenshot instead shows
  // a fixed pose at \`end\` from a freshly initialised chase view, with a fixed attitude (outward roll, right steer), drawn
  // with the scene's own frame(); paused, the app doesn't render over it. The live wiring is covered by the checks above.
  await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{smoothPose}=await import('/src/playback/pose.js');
    const chase=await import('/src/views/scene3d/cameras/chase.js'),raf=()=>new Promise(r=>requestAnimationFrame(r));
    S.animT=attitudeShot.end;await raf();await raf();await raf();
    const car=smoothPose(S.disp,attitudeShot.end,S.info),cv=document.querySelector('#view3d');
    const view=chase.view(chase.init({T:S.T,car,ghost:null,replay:0,aspect:cv.clientWidth/cv.clientHeight}));
    S.scene3d.frame({car,ghost:null,trace:null,view,attitude:{car:{roll:-0.05,pitch:0.01,steer:0.1,spin:1},ghost:null,trace:null}});
  })()`);
  const {png}=await screenshot(ctx);
  const reference=await compareToReference(ctx,png,fileURLToPath(new URL('./ref/attitude3d-chase.png',import.meta.url)));
  result.checks.chaseReference=reference.ok;
  const trace=await run(`(async()=>{
    const {S}=await import('/src/app/state.js');
    const {raceClock,traceClock,smoothPose}=await import('/src/playback/pose.js');
    const q=s=>document.querySelector(s),raf=()=>new Promise(r=>requestAnimationFrame(r));
    const until=async(test)=>{const end=performance.now()+120000;while(!test()){if(performance.now()>end)throw new Error('trace attitude state timeout');await raf();}};
    q('#dynBtn').click();await until(()=>S.dynRes&&!S.dynRunning);
    if(S.dynStale||!S.dynRes.dyn?.trace)throw new Error('No current passing trace');
    const d=S.disp,dyn=S.dynRes.dyn,tr=dyn.trace,offset=d.tc[dyn.start];
    // Pick visible nonzero recorded steer that differs from the lap's kinematic fallback.
    let chosen=null,best=-Infinity;
    for(let i=0;i<tr.t.length;i++){
      const t=tr.t[i];if(t<tr.t[0]+0.2||t+0.4>=tr.t.at(-1)||offset+t+0.4>=d.t)continue;
      let score=Infinity;
      for(let u=t;u<=t+0.3;u+=0.025){
        const p=smoothPose(tr,u);if(Math.abs(p.steer)<=0.001){score=-Infinity;break;}
        score=Math.min(score,Math.abs(p.steer-Math.atan(S.P.wb*d.k[p.station])));
      }
      if(score>1e-5&&score>best){best=score;chosen=t;}
    }
    if(chosen===null)throw new Error('No accessible nonzero trace steering');
    S.animT=offset+chosen;q('#trace3d [data-v="both"]').click();
    await until(()=>!!S.cam3d.state);await raf();await raf();
    const start=S.animT;q('#replaySeg [data-v="1"]').click();await until(()=>S.animT>=start+0.15);
    q('#replaySeg [data-v="0"]').click();await raf();await raf();
    const rt=raceClock(S.ghost?[d.t,S.ghost.t]:[d.t],S.animT),clock=traceClock(d,dyn,rt),p=smoothPose(tr,clock.t);
    const scene=S.scene3d._debug.scene,car=scene.getObjectByName('traceCar');
    const pivots=['wheelFL','wheelFR'].map(n=>car.getObjectByName(n).rotation.y);
    const fallback=Math.atan(S.P.wb*d.k[p.station]);
    const checks={bothCarsVisible:scene.getObjectByName('lapCar').visible&&car.visible,
      traceStationInRange:Number.isInteger(p.station)&&p.station>=0&&p.station<d.k.length,
      traceSteerRecorded:Math.abs(p.steer)>0.001&&pivots.every(v=>Math.abs(v+p.steer)<1e-6&&Math.sign(v)===-Math.sign(p.steer)),
      traceSteerDistinct:Math.abs(p.steer-fallback)>1e-6,
      traceNoFrameError:S.view==='3d'&&!S.frameErr};
    const before=[car.rotation.x,car.rotation.z,...pivots,car.getObjectByName('wheelFL').children[0].rotation.z];
    for(let i=0;i<8;i++)await raf();
    checks.tracePausedFrozen=JSON.stringify(before)===JSON.stringify([car.rotation.x,car.rotation.z,
      ...['wheelFL','wheelFR'].map(n=>car.getObjectByName(n).rotation.y),car.getObjectByName('wheelFL').children[0].rotation.z]);
    return {checks,steer:p.steer,pivots,fallback,station:p.station,traceTime:clock.t};
  })()`);
  Object.assign(result.checks,trace.checks);
  return {...result,trace,reference,allTrue:Object.values(result.checks).every(Boolean)};
};
