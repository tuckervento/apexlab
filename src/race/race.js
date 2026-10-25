import { DYN, dynNominal } from '../dynamics/bicycle.js';
import { createPlant, plantStep } from '../dynamics/plant.js';
import { observe } from '../dynamics/observe.js';
import { referenceDriver } from '../drivers/reference.js';
import { createJudge, judgeStep } from './judge.js';

// Times exclude formation; penalties are charged to the lap in which they occur.
// Reset jumps across station zero score at incident time. All state belongs to this run.
export function race(T,car,dc,line,v,{laps=3,driver=referenceDriver,incidentPolicy='reset',incidentPenalty=5,
  resetStations=3,resetSpeed=0.7,maxTime=900*(laps+1),warnings=3,trackPenalty=5}={}){
  if(!Number.isInteger(laps)||laps<1)throw new Error('race: laps must be a positive integer');
  if(!['reset','dnf'].includes(incidentPolicy))throw new Error('race: unknown incident policy');
  if(!T.flat&&!line.sn)throw new Error('race: hilly circuit needs line grades');
  const {N}=line,dt=DYN.dt,nom=dynNominal(car,dc,line,v);
  let start=0,best=Infinity;
  for(let i=0;i<N;i++){
    let score=0;for(let d=-3;d<=3;d++)score+=Math.abs(line.k[(i+d+N)%N]);
    if(score<best){best=score;start=i;}
  }
  function initial(i,scale=1){
    const vx=v[i]*scale,vy=nom.vy[i]*scale;
    // Retain curvature steering, but clear full-speed longitudinal load transfer on reset.
    return createPlant(car,{x:line.px[i],y:line.py[i],vx,vy,r:nom.r[i]*scale,
      psi:line.th[i]-Math.atan2(vy,vx),delta:nom.delta[i],axF:scale===1?nom.ax[i]:0,ayF:vx*vx*line.k[i]});
  }
  const state=initial(start),judge=createJudge({warnings,penalty:trackPenalty});
  const driverState=driver.init({car:structuredClone(car),dc:{...dc},line:structuredClone(line),v:v.slice(),dt,laps});
  const lapTimes=[],crossings=[];
  let idx=start,t=0,lapStart=null,penaltyAtStart=0,incident=null,dnf=false,incidentAtStart=0,crossingReady=true;
  // A directed finish plane through station zero, normal to its outgoing tangent.
  const ux=Math.cos(line.th[0]),uy=Math.sin(line.th[0]);
  const distance=()=> (state.x-line.px[0])*ux+(state.y-line.py[0])*uy;
  function locate(){
    let nearest=idx,bd=Infinity;
    for(let d=-2;d<20;d++){
      const j=(idx+d+N)%N,q=(state.x-line.px[j])**2+(state.y-line.py[j])**2;
      if(q<bd){bd=q;nearest=j;}
    }
    idx=nearest;
  }
  function cross(crossing){
    crossingReady=false;
    crossings.push(crossing);
    if(lapStart!==null){
      const summary={lap:lapTimes.length+1,time:crossing-lapStart+judge.penalties-penaltyAtStart,
        elapsed:crossing-crossings[0]+judge.penalties,incidents:structuredClone(judge.incidents.slice(incidentAtStart))};
      lapTimes.push(summary.time);
      driver.lap?.(driverState,summary);
      penaltyAtStart=judge.penalties;
      incidentAtStart=judge.incidents.length;
    }
    lapStart=crossing;
  }
  const steps=Math.ceil(maxTime/dt);
  for(let it=0;it<steps&&lapTimes.length<laps;it++){
    locate();
    const before=distance(),near=idx<3||idx>N-4;
    if(!near)crossingReady=true;
    const obs={...observe(state,line,idx,t),lap:lapStart===null?0:lapTimes.length+1,incident:incident?1:0};
    incident=null;
    plantStep(state,driver.step(driverState,obs),car,dc,line,idx,dt);
    t=(it+1)*dt;locate();
    const after=distance();
    if(crossingReady&&near&&before<=0&&after>0){
      cross(t-dt+dt*(-before)/(after-before));
      if(lapTimes.length===laps)break;
    }
    incident=judgeStep(judge,state,T,car,idx,t);
    if(incident){
      if(incidentPolicy==='dnf'){dnf=true;break;}
      judge.penalties+=incidentPenalty;
      const wraps=idx+resetStations>=N;
      idx=(idx+resetStations)%N;
      Object.assign(state,initial(idx,resetSpeed));
      judge.outside=false;
      if(wraps)cross(t);
    }
  }
  const complete=lapTimes.length===laps;
  const drivingTime=crossings.length? (complete?crossings.at(-1):t)-crossings[0]:0;
  return {complete,dnf:dnf||!complete,start,lapTimes,crossings,drivingTime,
    total:drivingTime+judge.penalties,penalties:judge.penalties,violations:judge.violations,
    incidents:judge.incidents,state:{...state}};
}
