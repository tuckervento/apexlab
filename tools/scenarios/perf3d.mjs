export const options = {webgl:true};

export default async ({run,call})=>{
  // Keep navigation local to this scenario; the shared driver's defaults stay unchanged.
  const url=await run('location.origin+"/?perf"');
  const nav=await call('Page.navigate',{url});
  if(nav.error||nav.result?.errorText)throw new Error('perf navigation failed');
  // Navigation replaces the execution context; poll boot state before importing app modules.
  let ready=false;
  for(let i=0;i<300&&!ready;i++){
    ready=await run('!!window.__perf&&!!document.querySelector("#runBtn")&&document.querySelector("#evals").textContent.includes("laps simulated")');
    if(!ready)await new Promise(r=>setTimeout(r,50));
  }
  if(!ready)throw new Error('perf app did not boot');
  return run(`(async()=>{
    const {S}=await import('/src/app/state.js'),{frameStats}=await import('/src/app/perf.js');
    const q=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async(fn,label)=>{for(let i=0;i<600;i++){if(fn())return;await wait(50);}throw new Error('Timed out: '+label);};
    const settle=async mode=>{
      await until(()=>S.view===(mode==='2d'?'2d':'3d')&&(mode==='2d'||(S.scene3d&&S.cam3d.mode===mode&&S.cam3d.state)),'view '+mode);
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    };
    await until(()=>S.T&&S.disp&&S.prog,'solver boot');
    const windows=[],checks={};
    for(const mode of ['2d','overview','chase']){
      if(mode!=='2d'){
        if(S.view!=='3d')q('#zView').click();
        q('#camera3d [data-v="'+mode+'"]').click();
      }
      await settle(mode);
      const restart=async()=>{
        const rev=S.disp.lineRev;q('#resetC').click();
        await until(()=>S.disp.lineRev!==rev&&S.running&&!S.prog.converged,'centreline restart');
      };
      await restart();
      let serial=window.__perf.flush().serial;
      const parts=[],start=performance.now();let noFrameError=S.frameErr===null,restarting=false;
      // Capture automatic windows as well as the tail: do not lose the first ten seconds.
      await new Promise((resolve,reject)=>{
        const tick=async()=>{try{
          noFrameError&&=S.frameErr===null;
          if(window.__perf.serial!==serial){parts.push(window.__perf);serial=window.__perf.serial;}
          if(performance.now()-start>=12000){parts.push(window.__perf.flush());resolve();}
          else{
            if(S.prog.converged&&!restarting){
              restarting=true;await restart();restarting=false;
            }
            requestAnimationFrame(tick);
          }
        }catch(e){reject(e);}};requestAnimationFrame(tick);
      });
      const intervals=parts.flatMap(p=>p.intervals),idleIntervals=parts.flatMap(p=>p.idleIntervals),expected=mode==='2d'?'2d':'3d '+mode;
      const active=frameStats(intervals),idle=frameStats(idleIntervals);
      const result={p50:active.p50,p95:active.p95,runningFrames:active.frames,idleFrames:idle.frames,
        idleP50:idle.p50,idleP95:idle.p95,mode:expected,
        longTasks:parts.reduce((s,p)=>s+p.longTasks,0),longTaskMs:parts.reduce((s,p)=>s+p.longTaskMs,0),
        idleLongTasks:parts.reduce((s,p)=>s+p.idleLongTasks,0),idleLongTaskMs:parts.reduce((s,p)=>s+p.idleLongTaskMs,0),
        longTaskSupported:parts.every(p=>p.longTaskSupported),durationMs:parts.at(-1).end-parts[0].start};
      checks[mode+'Frames']=result.runningFrames>=30;
      checks[mode+'NoFrameError']=noFrameError&&S.frameErr===null;
      checks[mode+'Mode']=parts.every(p=>p.mode===expected&&!p.mixed);
      windows.push(result);
    }
    return {allTrue:Object.values(checks).every(Boolean),checks,windows};
  })()`);
};
