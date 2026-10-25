import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';

export const options = {webgl: true};

export default async ctx=>{
  const {run,call}=ctx;
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  const seen=await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    const {raceClock,traceClock,smoothPose}=await import('/src/playback/pose.js');
    const {dataToThree,yawFromHeading}=await import('/src/views/scene3d/frame.js');
    const q=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async(f,label)=>{const end=performance.now()+120000;while(!f()){if(performance.now()>end)throw new Error(label);await wait(25);}};
    const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const settle=async()=>{await until(()=>S.cam3d.state,'camera state');await frames();};
    send({type:'pause'});await until(()=>!S.running,'pause');
    // Fix the line for reproducible checks and screenshots regardless of startup worker timing.
    const rev=S.disp.lineRev;send({type:'setLine'});await until(()=>S.disp.lineRev!==rev,'centreline');
    q('#replaySeg [data-v="0"]').click();S.hist=[];S.prog.evals=0;document.documentElement.dataset.theme='light';q('#dynBtn').click();
    await until(()=>S.dynRes&&!S.dynRunning,'dynamic check');
    if(S.dynStale||!S.dynRes.dyn?.trace)throw new Error('No current passing trace');
    const R=S.dynRes,d=S.disp,dyn=R.dyn,tr=dyn.trace;
    S.animT=d.tc[dyn.start]+tr.t[0]+1e-9;q('#zView').click();
    await until(()=>S.scene3d,'3D open');q('#trace3d [data-v="both"]').click();await settle();
    const api=S.scene3d,scene=api._debug.scene,group=n=>scene.getObjectByName(n);
    let last=null;const original=api.frame;api.frame=input=>{last=input;return original(input);};
    const seek=async t=>{last=null;S.animT=t;S.traceDirty=true;await until(()=>last!==null,'seek rendered');await settle();};
    await seek(S.animT);
    const rt=raceClock([d.t],S.animT),clock=traceClock(d,dyn,rt),lap=smoothPose(d,rt),p=smoothPose(tr,clock.t);
    const delta=Math.abs(lap.station-p.station);
    const aligned=Math.min(delta,d.px.length-delta)<=1&&Math.abs(clock.t-tr.t[0])<1e-7;
    const placed=(g,p)=>g.visible&&g.position.distanceTo({x:dataToThree(p.x,p.y,p.z)[0],y:dataToThree(p.x,p.y,p.z)[1],z:dataToThree(p.x,p.y,p.z)[2]})<1e-6;
    const bothVisible=placed(group('lapCar'),lap)&&placed(group('traceCar'),p);
    // Find peak lap-model lateral acceleration, then its nearest recorded trace station.
    let corner=0;for(let i=1;i<d.v.length;i++)if(d.v[i]**2*Math.abs(d.k[i])>d.v[corner]**2*Math.abs(d.k[corner]))corner=i;
    const dist=i=>{const n=Math.abs(tr.st[i]-corner);return Math.min(n,d.v.length-n);};
    let j=0;for(let i=1;i<tr.t.length;i++)if(dist(i)<dist(j))j=i;
    const cornerTime=d.tc[dyn.start]+tr.t[j],reachable=cornerTime<d.t;
    if(reachable)await seek(cornerTime);
    const beta=Math.abs(Math.atan2(tr.vy[j],tr.v[j]));
    // A corner after the lap clock wraps may be outside this visible interval; its recorded body velocity still
    // measures sideslip directly. Check rendered heading at an accessible time separately.
    const sideslip=beta>0.001&&Math.abs(smoothPose(tr,tr.t[j]).beta)>0.001;
    await seek(d.tc[dyn.start]+tr.t[0]+0.8);
    const renderedHeading=Math.abs(group('traceCar').rotation.y-yawFromHeading(last.trace.heading))<1e-6;
    q('#trace3d [data-v="dynamic"]').click();await settle();
    const dynamicOnly=!group('lapCar').visible&&group('traceCar').visible;
    const THREE=await import('/vendor/three-0.186.1/build/three.core.js');
    const tagMatches=name=>{
      const v=last.view,canvas=q('#view3d'),c=new THREE.PerspectiveCamera(v.fovDeg,canvas.clientWidth/canvas.clientHeight,v.near,v.far);
      c.position.fromArray(v.position);c.up.fromArray(v.up);c.lookAt(new THREE.Vector3().fromArray(v.target));c.updateMatrixWorld();
      const p=group(name).position.clone().project(c),tag=q('#overlay3d .car3d');
      return !tag.hidden&&Math.abs(parseFloat(tag.style.left)-(p.x+1)*canvas.clientWidth/2)<3&&Math.abs(parseFloat(tag.style.top)-(1-p.y)*canvas.clientHeight/2)<3;
    };
    q('#tagSeg [data-v="speed"]').click();await settle();
    const dynamicTag=tagMatches('traceCar');
    q('#tagSeg [data-v="g"]').click();await settle();
    const dynamicG=tagMatches('traceCar')&&!q('#overlay3d .car3d').textContent.includes('NaN');
    q('#tagSeg [data-v="grip"]').click();await settle();
    const dynamicGrip=tagMatches('traceCar')&&q('#overlay3d .car3d').textContent==='grip: lap model only';
    q('#tagSeg [data-v="speed"]').click();await settle();
    const visibleTime=S.animT;
    await seek(d.tc[dyn.start]+tr.t[0]-0.01);
    const tagBeforeHidden=q('#overlay3d .car3d').hidden&&!group('traceCar').visible;
    let tagAfterHidden=null;
    if(d.tc[dyn.start]+tr.t.at(-1)+0.01<d.t){
      await seek(d.tc[dyn.start]+tr.t.at(-1)+0.01);
      tagAfterHidden=q('#overlay3d .car3d').hidden&&!group('traceCar').visible;
    }
    await seek(visibleTime);
    q('#trace3d [data-v="lap"]').click();await settle();const lapTag=tagMatches('lapCar');
    q('#trace3d [data-v="both"]').click();await settle();const bothTag=tagMatches('lapCar');
    q('#trace3d [data-v="dynamic"]').click();await settle();

    const chase=await import('/src/views/scene3d/cameras/chase.js');
    {const select=q('#camera3d');select.value='chase';select.dispatchEvent(new Event('change',{bubbles:true}));};await settle();
    const expected=chase.view(chase.init({T:S.T,car:last.trace})),actual=chase.view(S.cam3d.state);
    const chaseFollowsTrace=expected.position.every((v,i)=>Math.abs(v-actual.position[i])<1e-6);
    q('#trace3d [data-v="both"]').click();await seek(d.tc[dyn.start]+Math.min(tr.t.at(-1),tr.t[0]+0.8));
    const geometries=api.info().geometries,counts=[];
    for(let i=0;i<3;i++){api.setCars({car:S.P,ghost:null,trace:S.P});api.frame(last);counts.push(api.info().geometries);}
    const geometryStable=counts.every(n=>n===geometries);
    const {readColors}=await import('/src/views/map2d/colors.js');
    const trace=group('traceCar'),geo=trace.children[0].geometry;let themeTrace=true;
    for(const theme of ['dark','light']){
      document.documentElement.dataset.theme=theme;const pal=readColors(document.documentElement);api.setTheme(pal);api.frame(last);
      const color=new (await import('/vendor/three-0.186.1/build/three.core.js')).Color(pal.colors.ink);
      themeTrace&&=trace.getObjectByName('body').material.color.equals(color)&&trace.children[0].geometry===geo&&api.info().geometries===geometries;
    }
    let opaqueNoShadow=true;trace.traverse(o=>{if(o.isMesh)opaqueNoShadow&&=!o.castShadow&&!o.material.transparent&&o.material.opacity===1;});
    let replayFailure=null;
    if(R.fail){
      q('#replayFailure').click();await settle();const t=raceClock(S.ghost?[d.t,S.ghost.t]:[d.t],S.animT);
      const before=(d.tc[R.fail.at]-t+d.t)%d.t;replayFailure=before>0&&before<=2&&S.replay===0;
      q('#zView').click();q('#replaySeg [data-v="4"]').click();q('#replayFailure').click();
      const t2=raceClock([d.t],S.animT),before2=(d.tc[R.fail.at]-t2+d.t)%d.t;
      replayFailure&&=before2>0&&before2<=2&&S.replay===4;
      q('#replaySeg [data-v="0"]').click();q('#zView').click();
      await seek(d.tc[dyn.start]+tr.t[0]+0.8);
    }
    await document.fonts.ready;
    window.traceCheck={S,q,until,settle,api,group,trace,render:()=>original(last)};
    return {dynamicG,dynamicGrip,tagBeforeHidden,tagAfterHidden,dynamicTag,lapTag,bothTag,aligned,bothVisible,sideslip,renderedHeading,themeTrace,beta,corner,traceCorner:tr.st[j],reachable,dynamicOnly,chaseFollowsTrace,geometryStable,counts,opaqueNoShadow,replayFailure,
      failure:R.fail,cleanSetup:R.fail?null:'Default GT racer / Harrow Ring centreline passed cleanly; failure replay needs coordinator follow-up with a failing setup.'};
  })()`);
  await run('traceCheck.render()');
  const reference=await compareToReference(ctx,(await screenshot(ctx)).png,fileURLToPath(new URL('./ref/trace3d-both.png',import.meta.url)));
  const stale=await run(`(async()=>{
    const {S,q,until,settle,group,trace}=traceCheck;
    const f=q('#f-wb');f.value=Number(f.value)+0.1;f.dispatchEvent(new Event('input',{bubbles:true}));
    await until(()=>S.dynStale,'stale result');await settle();
    return {traceHidden:!trace.visible&&!group('traceCar'),controlHidden:q('#trace3d').hidden,failureHidden:!q('#replayFailure')};
  })()`);
  const checks={dynamicG:seen.dynamicG,dynamicGrip:seen.dynamicGrip,tagBeforeHidden:seen.tagBeforeHidden,dynamicTag:seen.dynamicTag,lapTag:seen.lapTag,bothTag:seen.bothTag,renderedHeading:seen.renderedHeading,themeTrace:seen.themeTrace,aligned:seen.aligned,bothVisible:seen.bothVisible,sideslip:seen.sideslip,dynamicOnly:seen.dynamicOnly,chaseFollowsTrace:seen.chaseFollowsTrace,
    geometryStable:seen.geometryStable,opaqueNoShadow:seen.opaqueNoShadow,reference:reference.ok,...stale};
  if(seen.tagAfterHidden!==null)checks.tagAfterHidden=seen.tagAfterHidden;
  if(seen.replayFailure!==null)checks.replayFailure=seen.replayFailure;
  return {allTrue:Object.values(checks).every(Boolean),checks,seen,reference};
};
