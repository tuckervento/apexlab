import { fileURLToPath } from 'node:url';
import { compareToReference, screenshot } from '../shot.mjs';
export const options = {webgl:true};

export default async ctx=>{
  const {run,call}=ctx,checks={},seen={},references={};
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  Object.assign(checks,await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    const {dataToThree}=await import('/src/views/scene3d/frame.js');
    const bonnet=await import('/src/views/scene3d/cameras/bonnet.js'),free=await import('/src/views/scene3d/cameras/free.js'),{smoothPose}=await import('/src/playback/pose.js');
    const q=s=>document.querySelector(s),raf=()=>new Promise(r=>requestAnimationFrame(r));
    const until=async f=>{const end=performance.now()+120000;while(!f()){if(performance.now()>end)throw Error('bonnet3d state timeout');await raf();}};
    const settle=async()=>{await until(()=>!!S.cam3d.state);await raf();await raf();};
    const select=async mode=>{q('#camera3d').value=mode;q('#camera3d').dispatchEvent(new Event('change',{bubbles:true}));await settle();};
    send({type:'pause'});await until(()=>!S.running);const rev=S.disp.lineRev;send({type:'setLine'});await until(()=>S.disp.lineRev!==rev);
    q('#replaySeg [data-v="0"]').click();S.animT=3;S.hist=[];S.prog.evals=0;await document.fonts.ready;
    q('#zView').click();await until(()=>!!S.scene3d);await settle();await select('bonnet');
    const v=bonnet.view(S.cam3d.state),p=smoothPose(S.disp,S.animT,S.info),origin=dataToThree(p.x,p.y,p.z);
    window.b3={S,q,raf,until,settle,select,bonnet,free,smoothPose};
    return {near:v.near===0.1,nearCar:Math.hypot(...v.position.map((n,i)=>n-origin[i]))<2,zoomDisabled:['#zIn','#zOut','#zFit'].every(s=>q(s).disabled)};
  })()`));
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  Object.assign(checks,await run(`(async()=>{const {S,q,until,settle}=b3;await until(()=>S.reducedMotion&&S.cam3d.mode==='chase');await settle();const o=q('#camera3d option[value="bonnet"]');return {reducedDisabled:o.disabled&&o.title.includes('reduced motion'),reducedFallback:q('#camera3d').value==='chase'};})()`));
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  const point=await run(`(async()=>{const {S,q,until,select,free}=b3;await until(()=>!S.reducedMotion);await select('free');b3.before=structuredClone(S.cam3d.state);const r=q('#view3d').getBoundingClientRect();return {x:Math.round(r.left+r.width*0.5),y:Math.round(r.top+r.height*0.4)};})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+40,y:point.y-20,button:'left',buttons:1});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+40,y:point.y-20,button:'left',buttons:0,clickCount:1});
  for(const [code,key] of [['KeyW','w'],['KeyD','d'],['KeyE','e']]){
    await call('Input.dispatchKeyEvent',{type:'keyDown',code,key});await call('Input.dispatchKeyEvent',{type:'keyUp',code,key});
  }
  Object.assign(checks,await run(`(async()=>{const {S,free,settle}=b3;await settle();const expected=structuredClone(b3.before);free.look(expected,40,-20);free.move(expected,1);free.move(expected,0,1);free.move(expected,0,0,1);return {freeEvents:Math.abs(S.cam3d.state.yaw-expected.yaw)<1e-10&&Math.abs(S.cam3d.state.pitch-expected.pitch)<1e-10&&S.cam3d.state.position.every((v,i)=>Math.abs(v-expected.position[i])<1e-9),freeMoved:Math.hypot(...S.cam3d.state.position.map((v,i)=>v-b3.before.position[i]))>1,noFrameError:S.view==='3d'&&!S.frameErr};})()`));
  // After the drag and the key presses the canvas has keyboard focus (:focus-visible): a quiet 1 px accent inset, not the browser's ring.
  const focus=await run(`(()=>{const c=document.querySelector('#view3d');const cs=getComputedStyle(c),accent=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),probe=document.createElement('i');probe.style.color=accent;document.body.append(probe);const rgb=getComputedStyle(probe).color;probe.remove();return {keyboardFocused:document.activeElement===c&&c.matches(':focus-visible'),quietRing:cs.outlineStyle==='solid'&&cs.outlineWidth==='1px'&&cs.outlineColor===rgb,ring:{style:cs.outlineStyle,width:cs.outlineWidth,color:cs.outlineColor,accent:rgb}};})()`);
  const {ring,...focusChecks}=focus;seen.ring=ring;Object.assign(checks,focusChecks);
  for(const mode of ['bonnet','free']){
    await run(`(async()=>{
      const {S,select,smoothPose,bonnet,free,q}=b3;await select('${mode}');
      const car=smoothPose(S.disp,3,S.info),attitude={roll:-0.04,pitch:0.01,steer:0.08,spin:1};
      const v=bonnet.view(bonnet.init({car,attitude}));
      const state=free.init({car,view:v});free.move(state,-8,2,3);free.look(state,-30,10);
      const view='${mode}'==='bonnet'?v:free.view(state);
      S.scene3d.frame({car,ghost:null,trace:null,view,attitude:{car:attitude}});
    })()`);
    const {png}=await screenshot(ctx);
    references[mode]=await compareToReference(ctx,png,fileURLToPath(new URL(`./ref/bonnet3d-${mode}.png`,import.meta.url)));
    checks[mode+'Reference']=references[mode].ok;
  }
  return {allTrue:Object.values(checks).every(Boolean),checks,seen,references};
};
