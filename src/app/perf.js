// Nearest-rank percentiles; retain acquisition order for combining adjacent windows.
export function frameStats(intervals){
  const sorted=intervals.slice().sort((a,b)=>a-b),n=sorted.length;
  return {p50:n?sorted[Math.ceil(n*0.5)-1]:null,p95:n?sorted[Math.ceil(n*0.95)-1]:null,frames:n};
}

export function perfWindow(start){
  const intervals=[],idleIntervals=[],samples=[];let prev=null,mode=null,mixed=false;
  return {
    sample(ts,view,search){
      if(prev!==null)(search?intervals:idleIntervals).push(ts-prev);prev=ts;
      samples.push({ts,search:!!search});
      if(mode!==null&&mode!==view)mixed=true;mode=view;
    },
    close(end,tasks=[]){
      let longTasks=0,longTaskMs=0,idleLongTasks=0,idleLongTaskMs=0;
      for(const e of tasks){
        if(e.startTime<start||e.startTime>=end)continue;
        // Sampled state holds until the next frame; the first sample also covers window setup.
        let search=samples[0]?.search??false;
        for(const s of samples){if(s.ts>e.startTime)break;search=s.search;}
        if(search){longTasks++;longTaskMs+=e.duration;}
        else{idleLongTasks++;idleLongTaskMs+=e.duration;}
      }
      const active=frameStats(intervals),idle=frameStats(idleIntervals);
      return {p50:active.p50,p95:active.p95,runningFrames:active.frames,idleFrames:idle.frames,
        idleP50:idle.p50,idleP95:idle.p95,intervals:intervals.slice(),idleIntervals:idleIntervals.slice(),
        start,end,mode,mixed,longTasks,longTaskMs,idleLongTasks,idleLongTaskMs};
    }
  };
}
