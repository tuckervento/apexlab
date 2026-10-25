// Usable edge includes the car's half width and the existing 0.25 m allowance.
// Count excursions, rather than counting each 4 ms sample outside the edge.
export function createJudge({warnings=3,penalty=5}={}){
  return {outside:false,violations:0,incidents:[],penalties:0,warnings,penalty};
}

export function judgeStep(judge,state,T,car,station,t){
  const j=(station+1)%T.N;
  const dx=T.cx[j]-T.cx[station],dy=T.cy[j]-T.cy[station];
  const f=Math.max(0,Math.min(1,((state.x-T.cx[station])*dx+(state.y-T.cy[station])*dy)/(dx*dx+dy*dy)));
  const nx=T.nx[station]+f*(T.nx[j]-T.nx[station]),ny=T.ny[station]+f*(T.ny[j]-T.ny[station]);
  const offset=((state.x-T.cx[station]-f*dx)*nx+(state.y-T.cy[station]-f*dy)*ny)/Math.hypot(nx,ny);
  const over=Math.abs(offset)-(T.width/2-(car.spec.track+0.25)/2);
  const outside=over>0.5;
  if(outside&&!judge.outside){
    judge.violations++;
    if(judge.violations%judge.warnings===0)judge.penalties+=judge.penalty;
  }
  judge.outside=outside;
  const beta=Math.atan2(state.vy,state.vx),velocity=state.psi+beta;
  const angle=Math.abs(Math.atan2(Math.sin(velocity-Math.atan2(dy,dx)),Math.cos(velocity-Math.atan2(dy,dx))));
  const type=over>3?'off':Math.abs(beta)>0.45||angle>0.45?'spin':null;
  if(!type)return null;
  const incident={type,station,t,over};
  judge.incidents.push(incident);
  return incident;
}
