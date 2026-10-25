import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';

export const options = {webgl:true};

export default async ctx=>{
  const {run,call,sleep}=ctx,checks={},seen={},references={};
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  // Stub before the first open, then restore it: this is a fresh page with no renderer yet.
  Object.assign(checks,await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    const q=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
    const lazyBefore=!performance.getEntriesByType('resource').some(e=>e.name.includes('/vendor/three'));
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};
    const before=q('#view').toDataURL();q('#zView').click();
    for(let i=0;i<100&&!S.view3dMsg;i++)await wait(50);await wait(100);
    const missingWebgl=S.view==='2d'&&q('#status').textContent.includes('3D off:')&&!S.frameErr;
    S.animT+=2;await wait(100);const mapAlive=q('#view').toDataURL()!==before;
    HTMLCanvasElement.prototype.getContext=original;
    send({type:'pause'});for(let i=0;i<100&&S.running;i++)await wait(50);
    const rev=S.disp.lineRev;send({type:'setLine'});for(let i=0;i<100&&S.disp.lineRev===rev;i++)await wait(50);
    q('#replaySeg [data-v="0"]').click();S.animT=3;S.hist=[];S.prog.evals=0;await document.fonts.ready;
    q('#zView').click();for(let i=0;i<100&&!S.scene3d;i++)await wait(50);await wait(100);
    // A selector click clears S.cam3d.state and the next frame re-inits it; SwiftShader frames take ~100 ms, so wait for
    // the state and then two frames (one rendered with it) instead of a fixed time.
    const settle=async()=>{for(let i=0;i<100&&!S.cam3d.state;i++)await wait(20);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
    window.v3check={S,q,wait,settle};
    return {lazyBefore,missingWebgl,mapAlive,lazyAfter:performance.getEntriesByType('resource').some(e=>e.name.includes('/vendor/three')),opensAfterFailure:!!S.scene3d&&S.view3dMsg===null};
  })()`));
  for(const mode of ['overview','chase']){
    await run(`(async()=>{const {q,settle}=v3check;q('#camera3d [data-v="${mode}"]').click();await settle();})()`);
    const {png}=await screenshot(ctx);
    references[mode]=await compareToReference(ctx,png,fileURLToPath(new URL(`./ref/view3d-${mode}.png`,import.meta.url)));
    checks[mode+'Reference']=references[mode].ok;
  }
  await run(`(async()=>{const {S,q,settle}=v3check;q('#camera3d [data-v="overview"]').click();await settle();v3check.fitBefore=JSON.stringify(S.cam3d.state);})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:300,y:200,button:'left',clickCount:1});
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:360,y:230,button:'left',buttons:1});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:360,y:230,button:'left',clickCount:1});
  await run(`(async()=>{const {S,q,wait,settle,fitBefore}=v3check;const moved=JSON.stringify(S.cam3d.state)!==fitBefore;q('#zFit').click();await wait(50);v3check.fitRestores=moved&&JSON.stringify(S.cam3d.state)===fitBefore;q('#camera3d [data-v="chase"]').click();await settle();})()`);
  Object.assign(checks,await run(`(async()=>{
    const {S,q,wait,settle}=v3check;
    const core=await import('/vendor/three-0.186.1/build/three.core.js');
    const orbit=await import('/src/views/scene3d/cameras/orbit.js'),chase=await import('/src/views/scene3d/cameras/chase.js');
    const {stationFrames}=await import('/src/views/scene3d/frame.js');
    const buttons=expected=>['#zIn','#zOut','#zFit','#zFollow'].every((s,i)=>q(s).disabled===expected[i]);
    const camera=()=>{const v=(S.cam3d.mode==='overview'?orbit:chase).view(S.cam3d.state),c=new core.PerspectiveCamera(v.fovDeg,q('#view3d').clientWidth/q('#view3d').clientHeight,v.near,v.far);
      c.position.fromArray(v.position);c.up.fromArray(v.up);c.lookAt(new core.Vector3().fromArray(v.target));c.updateMatrixWorld();return c;};
    const car=()=>S.scene3d._debug.scene.children.find(o=>o.children.some(c=>c.name==='body'));
    const position=()=>car().position.clone().project(camera()).toArray();
    const size=()=>new core.Box3().setFromObject(car()).getSize(new core.Vector3()).length();
    const chaseDisabled=buttons([true,true,true,true]),a=position();
    q('#replaySeg [data-v="4"]').click();await wait(1000);q('#replaySeg [data-v="0"]').click();await wait(50);
    const b=position(),chaseMoves=Math.hypot(a[0]-b[0],a[1]-b[1])>0.001;
    const oldSize=size(),oldInfo=S.info;q('#carPreset').value='Kart';q('#carPreset').dispatchEvent(new Event('change'));
    for(let i=0;i<100&&S.info===oldInfo;i++)await wait(50);await wait(100);
    const kartSmaller=size()<oldSize;
    q('#camera3d [data-v="overview"]').click();await settle();
    const overviewEnabled=buttons([false,false,false,true]);
    const canvas=q('#view3d'),fitRestores=v3check.fitRestores;
    orbit.orbit(S.cam3d.state,0.6,0.1);const oldTrack=S.T,oldState=S.cam3d.state;
    q('#trackPreset').value='1';q('#trackPreset').dispatchEvent(new Event('change'));
    for(let i=0;i<100&&S.T===oldTrack;i++)await wait(50);await wait(150);
    const frames=stationFrames(S.T),c=camera();let inside=true;
    for(let i=0;i<S.T.N;i++)for(const sign of [-1,1]){
      const p=new core.Vector3(...[0,1,2].map(k=>frames.origin[3*i+k]+sign*S.T.width/2*frames.lateral[3*i+k])).project(c);
      inside&&=Math.abs(p.x)<=1&&Math.abs(p.y)<=1&&Math.abs(p.z)<=1;
    }
    const trackRefits=S.T!==oldTrack&&S.cam3d.state!==oldState&&inside;
    const {send}=await import('/src/app/client.js');send({type:'pause'});
    for(let i=0;i<100&&S.running;i++)await wait(50);await wait(150);
    let renders=0;const api=S.scene3d,original=api.frame;api.frame=input=>{renders++;return original(input);};
    await wait(150);const count=renders;await wait(150);const pausedSkips=renders===count;api.frame=original;
    const oldCanvas=canvas,ext=api._debug.renderer.getContext().getExtension('WEBGL_lose_context');
    if(ext)ext.loseContext();await wait(200);
    const contextFallback=!!ext&&S.view==='2d'&&S.scene3d===null&&q('#status').textContent.includes('3D off:')&&!S.frameErr&&q('#view3d')!==oldCanvas;
    const twoDEnabled=buttons([false,false,false,false]);q('#zView').click();
    for(let i=0;i<100&&!S.scene3d;i++)await wait(50);await wait(100);
    return {chaseDisabled,chaseMoves,kartSmaller,overviewEnabled,fitRestores,trackRefits,pausedSkips,contextFallback,twoDEnabled,reopensAfterLoss:S.view==='3d'&&!!S.scene3d&&S.view3dMsg===null};
  })()`));
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await sleep(200);
  seen.phone=await run(`(()=>{
    const q=s=>document.querySelector(s),r=s=>q(s).getBoundingClientRect(),selector=r('#camera3d');
    const hit=b=>selector.left<b.right&&b.left<selector.right&&selector.top<b.bottom&&b.top<selector.bottom;
    return {visible:!q('#camera3d').hidden,clear:['#view','.zoom','.lapblock'].every(s=>!hit(r(s))),inStage:selector.left>=r('#stage').left&&selector.right<=r('#stage').right&&selector.top>=r('#stage').top&&selector.bottom<=r('#stage').bottom};
  })()`);
  checks.phoneSelector=seen.phone.visible&&seen.phone.clear&&seen.phone.inStage;
  return {allTrue:Object.values(checks).every(Boolean),checks,seen,references,projection:'Reconstruct PerspectiveCamera from active public view(); project the live car group world position.'};
};
