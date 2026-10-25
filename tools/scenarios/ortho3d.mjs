import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';

export const options = {webgl: true};

export default async ctx=>{
  const {run,call}=ctx,checks={},references={};
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  Object.assign(checks,await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    const q=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async f=>{for(let i=0;i<300;i++){if(f())return;await wait(20);}throw new Error('state did not settle');};
    const settle=async()=>{await until(()=>!!S.cam3d.state);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
    // Hills first: a new circuit restarts the search, so pausing before it leaves the line moving under the screenshots.
    const old=S.T;q('#f-hills').value=40;q('#f-hills').dispatchEvent(new Event('input',{bubbles:true}));await until(()=>S.T!==old&&!S.T.flat);
    send({type:'pause'});await until(()=>!S.running);
    const rev=S.disp.lineRev;send({type:'setLine'});await until(()=>S.disp.lineRev!==rev);
    q('#replaySeg [data-v="0"]').click();S.animT=3;S.hist=[];S.prog.evals=0;await document.fonts.ready;
    const hidden2d=q('#orthoControls').hidden;q('#zView').click();await until(()=>!!S.scene3d);await settle();
    const hiddenOverview=q('#orthoControls').hidden;
    q('#camera3d [data-v="ortho"]').click();await settle();
    window.orthoCheck={S,q,until,settle};
    return {frozen:!S.running&&S.replay===0,hidden2d,hiddenOverview,shownMap:!q('#orthoControls').hidden,zoomEnabled:['#zIn','#zOut','#zFit'].every(s=>!q(s).disabled)};
  })()`));
  for(const tilt of [0,45]){
    await run(`(async()=>{const {q,settle}=orthoCheck;q('#orthoTilt').value=${tilt};q('#orthoTilt').dispatchEvent(new Event('input'));await settle();})()`);
    const {png}=await screenshot(ctx);
    references[tilt]=await compareToReference(ctx,png,fileURLToPath(new URL(`./ref/ortho3d-${tilt}.png`,import.meta.url)));
    checks['reference'+tilt]=references[tilt].ok;
  }
  Object.assign(checks,await run(`(async()=>{
    const {S,q,settle}=orthoCheck,{Camera}=await import('/src/views/map2d/camera.js'),{dataToThree}=await import('/src/views/scene3d/frame.js');
    q('#orthoTilt').value=0;q('#orthoTilt').dispatchEvent(new Event('input'));q('#zFit').click();await settle();
    const r=q('#view3d').getBoundingClientRect(),map=new Camera();map.cw=r.width;map.ch=r.height;map.fit(S.T,S.T.width);
    let projectionMatches=true;const out={};
    for(const i of [0,Math.floor(S.T.N/4),Math.floor(S.T.N/2),S.T.N-1]){
      S.scene3d.project(dataToThree(S.T.cx[i],S.T.cy[i],S.T.z[i]),out);
      projectionMatches&&=Math.abs(out.x-map.sx(S.T.cx[i]))<1&&Math.abs(out.y-map.sy(S.T.cy[i]))<1&&out.visible;
    }
    const h=S.cam3d.state.halfHeight,target=JSON.stringify(S.cam3d.state.target);
    q('#zIn').click();await settle();const zoomIn=S.cam3d.state.halfHeight<h&&JSON.stringify(S.cam3d.state.target)===target;
    q('#zOut').click();await settle();const zoomOut=Math.abs(S.cam3d.state.halfHeight-h)<1e-8;
    q('#zIn').click();q('#zFit').click();await settle();const fitRestores=Math.abs(S.cam3d.state.halfHeight-h)<1e-8;
    q('#camera3d [data-v="chase"]').click();await settle();const hiddenChase=q('#orthoControls').hidden;
    q('#camera3d [data-v="ortho"]').click();await settle();
    return {projectionMatches,zoomIn,zoomOut,fitRestores,hiddenChase};
  })()`));
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  Object.assign(checks,await run(`(async()=>{
    const {q,until,settle}=orthoCheck;await until(()=>{const s=q('#stage').getBoundingClientRect();return s.width<400&&Math.abs(q('#view3d').clientWidth-s.width)<1;}); // the stage, not the viewport: the page has marginsq('#zFit').click();await settle();
    const a=q('#orthoControls').getBoundingClientRect(),stage=q('#stage').getBoundingClientRect();
    const hit=b=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
    return {phoneClear:['#view','.zoom','.lapblock','#camera3d','#trace3d'].every(s=>q(s).hidden||!hit(q(s).getBoundingClientRect())),phoneInStage:a.left>=stage.left&&a.right<=stage.right&&a.top>=stage.top&&a.bottom<=stage.bottom};
  })()`));
  return {allTrue:Object.values(checks).every(Boolean),checks,references};
};
