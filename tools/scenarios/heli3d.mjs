import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';
export const options = {webgl: true};
export default async ctx=>{
  const {run,call}=ctx,checks={},seen={},references={};
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    const q=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async f=>{for(let n=0;n<600;n++){if(f())return;await wait(20);}throw Error('heli/pair state timeout');};
    const settle=async()=>{await until(()=>S.scene3d&&S.cam3d.state);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
    send({type:'pause'});await until(()=>!S.running);
    q('#replaySeg [data-v="0"]').click();
    let rev=S.disp.lineRev;send({type:'setLine'});await until(()=>S.disp.lineRev!==rev&&!q('#pinBtn').disabled);
    q('#pinBtn').click();await until(()=>!!S.ghost);
    // A second lap that doesn't depend on how far a search got (that made the screenshots differ run to run): the
    // ghost is GT racer's centreline, the car the Road car's centreline (a car change keeps the ghost).
    const carRev=S.disp.carRev;q('#carPreset').value='Road car';q('#carPreset').dispatchEvent(new Event('change'));
    await until(()=>S.disp.carRev!==carRev&&!!S.ghost);
    send({type:'pause'});await until(()=>!S.running);
    rev=S.disp.lineRev;send({type:'setLine'});await until(()=>S.disp.lineRev!==rev);
    send({type:'pause'});await until(()=>!S.running);
    S.animT=Math.min(S.disp.t,S.ghost.t)*0.55;S.hist=[];S.prog.evals=0;
    await document.fonts.ready;if(S.view!=='3d')q('#zView').click();
    window.hpcheck={S,q,until,settle};
  })()`);
  for(const mode of ['heli','pair']){
    seen[mode]=await run(`(async()=>{
      const {S,q,settle}=hpcheck;q('#camera3d [data-v="${mode}"]').click();await settle();
      const cam=await import('/src/views/scene3d/cameras/${mode}.js'),core=await import('/vendor/three-0.186.1/build/three.core.js');
      const v=cam.view(S.cam3d.state),c=new core.PerspectiveCamera(v.fovDeg,q('#view3d').clientWidth/q('#view3d').clientHeight,v.near,v.far);
      c.position.fromArray(v.position);c.up.fromArray(v.up);c.lookAt(new core.Vector3(...v.target));c.updateMatrixWorld();
      const cars=['lapCar','ghostCar'].map(name=>S.scene3d._debug.scene.getObjectByName(name));
      const ndc=cars.map(o=>o.position.clone().project(c).toArray());
      return {selected:S.cam3d.mode==='${mode}'&&q('#camera3d [data-v="${mode}"]').getAttribute('aria-pressed')==='true',
        zoomDisabled:['#zIn','#zOut','#zFit','#zFollow'].every(s=>q(s).disabled),
        frozen:!S.running&&S.replay===0&&!S.frameErr,distinct:Math.abs(S.disp.t-S.ghost.t)>0.2,
        inside:cars.every(o=>o.visible)&&ndc.every(p=>p.every(Number.isFinite)&&Math.abs(p[0])<=0.9&&Math.abs(p[1])<=0.9&&Math.abs(p[2])<=1),ndc};
    })()`);
    for(const k of ['selected','zoomDisabled','frozen','distinct'])checks[mode+' '+k]=seen[mode][k];
    if(mode==='pair')checks.pairInside=seen[mode].inside;
    references[mode]=await compareToReference(ctx,(await screenshot(ctx)).png,fileURLToPath(new URL(`./ref/heli3d-${mode}.png`,import.meta.url)));
    checks[mode+' reference']=references[mode].ok;
  }
  return {allTrue:Object.values(checks).every(Boolean),checks,seen,references};
};
