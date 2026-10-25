import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';

export const options={webgl:true};
export default async ctx=>{
  const {run,call}=ctx,checks={},references={};
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  Object.assign(checks,await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send,settled}=await import('/src/app/client.js');
    const q=s=>document.querySelector(s),wait=async f=>{for(let i=0;i<2400;i++){if(f())return;await new Promise(r=>setTimeout(r,25));}throw new Error('overlay state timed out');};
    const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const settle=async()=>{await wait(()=>S.cam3d.state);await frames();};
    send({type:'pause'});await wait(()=>!S.running&&settled());
    const rev=S.disp.lineRev;send({type:'setLine'});await wait(()=>S.disp.lineRev!==rev);
    q('#replaySeg [data-v="0"]').click();S.animT=3;S.hist=[];S.prog.evals=0;
    await document.fonts.ready;q('#zView').click();await wait(()=>S.scene3d);await settle();
    window.ov3={S,q,wait,frames,settle,send};
    return {labelCount:q('#overlay3d').querySelectorAll('.corner3d').length===S.corners.length};
  })()`));
  for(const mode of ['overview','chase']){
    await run(`(async()=>{const {q,settle}=ov3;q('#camera3d [data-v="${mode}"]').click();await settle();})()`);
    references[mode]=await compareToReference(ctx,(await screenshot(ctx)).png,fileURLToPath(new URL('./ref/overlay3d-'+mode+'.png',import.meta.url)));
    checks[mode+'Reference']=references[mode].ok;
  }
  Object.assign(checks,await run(`(async()=>{
    const {S,q,settle,frames}=ov3,{cornerAnchor}=await import('/src/views/scene3d/overlays.js');
    const chase=await import('/src/views/scene3d/cameras/chase.js');
    let behind=false,shown=false;
    for(let j=0;j<24&&!(behind&&shown);j++){
      S.animT=S.disp.t*j/24;S.cam3d.state=null;await settle();
      const v=chase.view(S.cam3d.state),forward=v.target.map((x,k)=>x-v.position[k]);
      const els=q('#overlay3d').querySelectorAll('.corner3d'),rect=q('#view3d').getBoundingClientRect();
      S.corners.forEach((c,i)=>{const p=cornerAnchor(S.T,c),dot=p.reduce((sum,x,k)=>sum+(x-v.position[k])*forward[k],0),out={};S.scene3d.project(p,out);
        if(dot<0)behind ||= els[i].hidden&&!out.visible;
        if(out.visible&&!els[i].hidden)shown ||= out.x>=0&&out.x<=rect.width&&out.y>=0&&out.y<=rect.height;
      });
    }
    const {pose,stationPose,raceClock}=await import('/src/playback/pose.js'),{tagText}=await import('/src/app/telemetry.js');
    q('#tagSeg [data-v="speed"]').click();await frames();
    const d=S.disp,g=S.ghost,rt=raceClock(g?[d.t,g.t]:[d.t],S.animT),cs=pose(d,rt,S.info),text=tagText(S.tagMode,cs,g?stationPose(g,cs.station,cs.frac):null);
    const tagMatches=q('.car3d').textContent===text.main+(text.delta?'\\n'+text.delta:'');
    q('#tagSeg [data-v="off"]').click();await frames();const tagsOff=q('.car3d').hidden&&q('.ghost3d').hidden;
    q('#camera3d [data-v="overview"]').click();await settle();
    const el=[...q('#overlay3d').querySelectorAll('.corner3d')].find(e=>!e.hidden),r=el?.getBoundingClientRect();
    ov3.drag=r?{x:r.x+r.width/2,y:r.y+r.height/2}:null;ov3.before=JSON.stringify(S.cam3d.state);
    return {behindHidden:behind,inViewShown:shown,tagMatches,tagsOff,pointerTransparent:getComputedStyle(q('#overlay3d')).pointerEvents==='none',dragAnchor:!!r};
  })()`));
  const drag=await run('ov3.drag');
  if(drag){
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...drag,button:'left',clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:drag.x+35,y:drag.y+15,button:'left',buttons:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:drag.x+35,y:drag.y+15,button:'left',clickCount:1});
  }
  const seen=await run(`(async()=>{
    const {S,q,wait,frames,send}=ov3;await frames();const dragOrbits=JSON.stringify(S.cam3d.state)!==ov3.before;
    q('#dynBtn').click();await wait(()=>S.dynRes&&!S.dynRunning);await frames();
    const fail=S.dynRes.fail,scene=S.scene3d._debug.scene,m=scene.getObjectByName('failMarker');
    const {dataToThree}=await import('/src/views/scene3d/frame.js');
    const point=fail?dataToThree(S.T.cx[fail.at],S.T.cy[fail.at],S.T.z[fail.at]):null;
    const markerAtFail=!!m&&!!point&&Math.hypot(...point.map((x,i)=>x-m.position.getComponent(i)))<0.03;
    let markerMemory=false;
    if(fail){
      const orbit=await import('/src/views/scene3d/cameras/orbit.js'),{smoothPose}=await import('/src/playback/pose.js');
      const input={car:smoothPose(S.disp,S.animT,S.info),ghost:null,view:orbit.view(S.cam3d.state)};
      S.scene3d.frame(input);const count=S.scene3d.info().geometries;markerMemory=true;
      for(let i=0;i<5;i++){S.scene3d.setFailMarker(fail.at);S.scene3d.frame(input);markerMemory&&=S.scene3d.info().geometries===count;}
    }
    // Change the worker car without clearing the result, exercising the stale-result path directly.
    const info=S.info;send({type:'setCar',params:{...S.P,mass:S.P.mass+20},resume:false});await wait(()=>S.info!==info);await wait(()=>S.dynStale);await frames();
    const staleClears=!scene.getObjectByName('failMarker');
    const old=S.T,slider=q('#f-hills');slider.value=40;slider.dispatchEvent(new Event('input',{bubbles:true}));await wait(()=>S.T!==old);await frames();
    const road=scene.children.find(o=>o.isMesh&&o.receiveShadow&&o.material.vertexColors);
    return {dragOrbits,markerAtFail,markerMemory,staleClears,heightColors:!S.T.flat&&!!road?.geometry.attributes.color,fail:fail??null,
      note:fail?null:'Centreline dynamic check passed cleanly; a failing setup still needs coordinator verification.'};
  })()`);
  for(const k of ['dragOrbits','markerAtFail','markerMemory','staleClears','heightColors'])checks[k]=seen[k];
  return {allTrue:Object.values(checks).every(Boolean),checks,seen,references};
};
