// 3D view controls: the MAP button collapses and restores the 2D inset without leaving 3D (sized for the stage after a
// resize while collapsed); under reduced motion Bonnet keeps its short label, disabled, with the reason as a tooltip (the
// longer label widened the select to ~235 px; Chrome doesn't re-measure a select whose option text changes after layout,
// so the width is guarded by effects3d's reduced-motion reference, which lays the select out fresh); Streaks are offered
// in Bonnet.
// SHOTS=<prefix> saves the collapsed view and bonnet-with-streaks screenshots for review (no references).
import { writeFileSync } from 'node:fs';
import { screenshot } from '../shot.mjs';

export const options = {webgl:true};

export default async ctx=>{
  const {run,call}=ctx,SHOTS=process.env.SHOTS;
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  const result=await run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{send}=await import('/src/app/client.js');
    const q=s=>document.querySelector(s),raf=()=>new Promise(r=>requestAnimationFrame(r)),frames=async n=>{for(let i=0;i<n;i++)await raf();};
    const until=async(f,label)=>{const end=performance.now()+60000;while(!f()){if(S.frameErr)throw new Error(String(S.frameErr));if(performance.now()>end)throw new Error('ui3d timeout: '+label);await raf();}};
    send({type:'pause'});await until(()=>!S.running,'pause');
    const toggle=q('#miniToggle'),inset=q('#view'),checks={};
    checks.hiddenIn2d=toggle.hidden;
    q('#zView').click();await until(()=>!!S.scene3d&&!!S.cam3d.state,'3D open');await frames(2);
    checks.shownIn3d=!toggle.hidden&&toggle.getAttribute('aria-pressed')==='true'&&inset.clientWidth>0;
    const openWidth=inset.clientWidth;
    toggle.click();await frames(3);
    checks.collapses=!S.miniOpen&&S.view==='3d'&&getComputedStyle(inset).display==='none'&&toggle.getAttribute('aria-pressed')==='false'&&!toggle.hidden;
    const lap=q('#lapTime').textContent;
    window.ui3d={S,q,raf,frames,until,openWidth};
    return {checks,lap};
  })()`);
  if(SHOTS)writeFileSync(SHOTS+'-collapsed.png',(await screenshot(ctx)).png);
  // Resize while collapsed: the inset has no box then, so expanding must size it for the new stage.
  await call('Emulation.setDeviceMetricsOverride',{width:1000,height:800,deviceScaleFactor:1,mobile:false});
  Object.assign(result.checks,await run(`(async()=>{
    const {S,q,frames,until,openWidth}=ui3d,toggle=q('#miniToggle'),inset=q('#view');
    await until(()=>innerWidth===1000,'resize');await frames(3);
    const noError=!S.frameErr;
    toggle.click();await frames(3);
    const w=inset.getBoundingClientRect().width; // fractional, as Camera.resize reads it (clientWidth rounds)
    const restores=S.miniOpen&&S.view==='3d'&&getComputedStyle(inset).display!=='none'&&w>0&&Math.round(w)!==openWidth
      &&S.camMini.cw===w&&inset.width===Math.round(w*S.camMini.dpr)&&toggle.getAttribute('aria-pressed')==='true';
    q('#zView').click();await frames(2);
    const backTo2d=S.view==='2d'&&toggle.hidden&&!q('#stage').classList.contains('mini-off');
    q('#zView').click();await frames(2);
    return {collapsedNoError:noError,restores,backTo2d};
  })()`));
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  Object.assign(result.checks,await run(`(async()=>{
    const {S,q,frames,until}=ui3d;await until(()=>S.reducedMotion,'reduced motion');await frames(2);
    const option=q('#camera3d option[value="bonnet"]');
    return {bonnetLabel:option.textContent==='Bonnet',bonnetDisabled:option.disabled,
      bonnetTooltip:option.title.includes('reduced motion')&&q('#camera3d').title.includes('reduced motion')};
  })()`));
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  Object.assign(result.checks,await run(`(async()=>{
    const {S,q,frames,until}=ui3d;await until(()=>!S.reducedMotion,'motion back');await frames(2);
    const option=q('#camera3d option[value="bonnet"]'),cleared=!option.disabled&&option.title===''&&q('#camera3d').title==='';
    const select=q('#camera3d');select.value='bonnet';select.dispatchEvent(new Event('change',{bubbles:true}));
    await until(()=>S.cam3d.mode==='bonnet'&&!!S.cam3d.state,'bonnet');await frames(2);
    const offered=!q('#streaks3d').hidden,mesh=S.scene3d._debug.scene.getObjectByName('speedStreaks');
    if(!q('#streaksOn3d').checked)q('#streaksOn3d').click();
    q('#replaySeg [data-v="1"]').click();await until(()=>mesh.count>0,'streaks in bonnet');
    q('#replaySeg [data-v="0"]').click();await frames(2);
    return {bonnetRestored:cleared,streaksOfferedInBonnet:offered,streaksRunInBonnet:mesh.count>0};
  })()`));
  if(SHOTS)writeFileSync(SHOTS+'-bonnet-streaks.png',(await screenshot(ctx)).png);
  return {...result,allTrue:Object.values(result.checks).every(Boolean)};
};
