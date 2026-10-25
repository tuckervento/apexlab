import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';
export const options = {webgl: true};

export default async ctx=>{
  const {run,call}=ctx,checks={},references={};
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    const q=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async f=>{for(let i=0;i<400&&!f();i++)await wait(25);if(!f())throw new Error('height scenario state timeout');};
    const settle=async()=>{await until(()=>!!S.scene3d&&!!S.cam3d.state);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
    const old=S.T;q('#f-hills').value=40;q('#f-hills').dispatchEvent(new Event('input',{bubbles:true}));
    await until(()=>S.T!==old&&!S.T.flat);send({type:'pause'});await until(()=>!S.running);
    const rev=S.disp.lineRev;send({type:'setLine'});await until(()=>S.disp.lineRev!==rev);
    q('#replaySeg [data-v="0"]').click();S.animT=3;S.hist=[];S.prog.evals=0;
    q('#zView').click();await settle();{const select=q('#camera3d');select.value='overview';select.dispatchEvent(new Event('change',{bubbles:true}));};await settle();
    await document.fonts.ready;
    const core=await import('/vendor/three-0.186.1/build/three.core.js');
    const {smoothPose}=await import('/src/playback/pose.js'),{cornerAnchor}=await import('/src/views/scene3d/overlays.js');
    const scene=S.scene3d._debug.scene,world=scene.getObjectByName('heightWorld'),ground=scene.getObjectByName('ground');
    const road=world.children.find(o=>o.isMesh&&o.receiveShadow&&o!==ground&&o.name!=='skirts');
    const a=road.geometry.attributes.position;let crest=0;
    for(let i=1;i<a.count;i++)if(a.getY(i)>a.getY(crest))crest=i;
    const point=(m,i)=>new core.Vector3().fromBufferAttribute(m.geometry.attributes.position,i).applyMatrix4(m.matrixWorld);
    const base=point(ground,0).y,relief=()=>point(road,crest).y-base;
    const set=async e=>{q('#heightScale3d').value=e;q('#heightScale3d').dispatchEvent(new Event('input',{bubbles:true}));await until(()=>world.scale.y===e);await settle();};
    window.h3={S,q,until,settle,core,smoothPose,cornerAnchor,scene,world,ground,point,base,relief,set,one:relief(),memory:S.scene3d.info().geometries};
  })()`);
  for(const e of [1,3]){
    await run(`(async()=>{await h3.set(${e});})()`);
    references[e]=await compareToReference(ctx,(await screenshot(ctx)).png,fileURLToPath(new URL(`./ref/heights3d-${e}.png`,import.meta.url)));
    checks['reference'+e]=references[e].ok;
  }
  const seen=await run(`(async()=>{
    const {S,q,until,settle,core,smoothPose,cornerAnchor,scene,world,ground,point,base,relief,set,one,memory}=h3;
    const car=scene.getObjectByName('lapCar'),p=smoothPose(S.disp,S.animT,S.info);
    const crestTriple=Math.abs(relief()/one-3)<0.03,carScaled=Math.abs(car.position.y-(base+3*(p.z-base)))<0.03;
    const carShape=car.scale.x===1&&car.scale.y===1&&car.scale.z===1;
    // Reconstruct the camera independently and project the scaled label anchor.
    const orbit=await import('/src/views/scene3d/cameras/orbit.js'),v=orbit.view(S.cam3d.state),canvas=q('#view3d');
    const camera=new core.PerspectiveCamera(v.fovDeg,canvas.clientWidth/canvas.clientHeight,v.near,v.far);
    camera.position.fromArray(v.position);camera.up.fromArray(v.up);camera.lookAt(new core.Vector3().fromArray(v.target));camera.updateMatrixWorld();
    let labels=0,labelProjection=true;
    document.querySelectorAll('.corner3d').forEach((el,i)=>{
      if(el.hidden)return;labels++;
      const anchor=new core.Vector3().fromArray(cornerAnchor(S.T,S.corners[i]));anchor.y=base+3*(anchor.y-base);anchor.project(camera);
      labelProjection&&=Math.abs(parseFloat(el.style.left)-(anchor.x+1)*canvas.clientWidth/2)<1&&Math.abs(parseFloat(el.style.top)-(1-anchor.y)*canvas.clientHeight/2)<1;
    });
    {const select=q('#camera3d');select.value='chase';select.dispatchEvent(new Event('change',{bubbles:true}));};await until(()=>world.scale.y===1);await settle();
    const chaseUnit=Math.abs(car.position.y-p.z)<0.03&&q('#heightScale3d').value==='3'&&q('#height3d').hidden;
    {const select=q('#camera3d');select.value='overview';select.dispatchEvent(new Event('change',{bubbles:true}));};await until(()=>world.scale.y===3);await settle();
    const restored=!q('#height3d').hidden;
    await set(5);
    const sun=scene.children.find(o=>o.isDirectionalLight),cam=sun.shadow.camera,e=cam.matrixWorld.elements,t=sun.target.position,l=sun.position;
    const uy=(t.y-l.y)/t.distanceTo(l),depths=[];
    for(const x of [cam.left,cam.right])for(const y of [cam.bottom,cam.top])depths.push((point(ground,0).y-(e[1]*x+e[5]*y+e[13]))/uy);
    return {crestTriple,carScaled,carShape,labelProjection:labels>0&&labelProjection,chaseUnit,restored,
      shadowGround:Math.max(...depths)<=cam.far,geometryStable:memory===S.scene3d.info().geometries,depths,far:cam.far};
  })()`);
  for(const k of ['crestTriple','carScaled','carShape','labelProjection','chaseUnit','restored','shadowGround','geometryStable'])checks[k]=seen[k];
  return {allTrue:Object.values(checks).every(Boolean),checks,seen,references};
};
