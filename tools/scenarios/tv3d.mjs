import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';
export const options = {webgl: true};
export default async ctx=>{
  const {run,call}=ctx,checks={},references={},seen=[];
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    const q=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async f=>{for(let i=0;i<300;i++){if(f())return;await wait(20);}throw Error('TV state timeout');};
    const settle=async()=>{await until(()=>S.cam3d.state&&S.scene3d);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
    send({type:'pause'});await until(()=>!S.running);
    q('#replaySeg [data-v="0"]').click();await document.fonts.ready;
    window.tvcheck={S,send,q,until,settle};
  })()`);
  for(let i=0;i<4;i++){
    const shot=await run(`(async()=>{
      const {S,send,q,until,settle}=tvcheck,old=S.T;
      q('#trackPreset').value='${i}';q('#trackPreset').dispatchEvent(new Event('change'));
      await until(()=>S.T!==old&&S.disp.trackRev===S.T.trackRev);
      send({type:'pause'});await until(()=>!S.running);
      const rev=S.disp.lineRev;send({type:'setLine'});await until(()=>S.disp.lineRev!==rev);
      S.animT=3;S.hist=[];S.prog.evals=0;
      if(S.view!=='3d')q('#zView').click();
      {const select=q('#camera3d');select.value='tv';select.dispatchEvent(new Event('change',{bubbles:true}));};await settle();
      const tv=await import('/src/views/scene3d/cameras/tv.js'),core=await import('/vendor/three-0.186.1/build/three.core.js');
      const {smoothPose}=await import('/src/playback/pose.js'),{dataToThree}=await import('/src/views/scene3d/frame.js');
      const v=tv.view(S.cam3d.state),c=new core.PerspectiveCamera(v.fovDeg,q('#view3d').clientWidth/q('#view3d').clientHeight,v.near,v.far);
      c.position.fromArray(v.position);c.up.fromArray(v.up);c.lookAt(new core.Vector3().fromArray(v.target));c.updateMatrixWorld();
      const p=smoothPose(S.disp,S.animT),ndc=new core.Vector3(...dataToThree(p.x,p.y,p.z)).project(c);
      return {inside:[ndc.x,ndc.y,ndc.z].every(x=>Number.isFinite(x)&&Math.abs(x)<=1),ndc:ndc.toArray(),
        zoomDisabled:['#zIn','#zOut','#zFit','#zFollow'].every(s=>q(s).disabled),
        selected:q('#camera3d').value==='tv',frozen:!S.running&&S.replay===0&&!S.frameErr};
    })()`);
    seen.push(shot);for(const k of ['inside','zoomDisabled','selected','frozen'])checks[i+' '+k]=shot[k];
    references[i]=await compareToReference(ctx,(await screenshot(ctx)).png,fileURLToPath(new URL(`./ref/tv3d-${i}.png`,import.meta.url)));
    checks[i+' reference']=references[i].ok;
  }
  return {allTrue:Object.values(checks).every(Boolean),checks,seen,references};
};
