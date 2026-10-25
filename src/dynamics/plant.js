// Vehicle state and one fixed-time integration step. No driver imports or callbacks.
import { G, RHO, VSTEP, NT, CRR } from '../core/constants.js';
import { tabAt } from '../core/lap.js';
import { DYN, axleCaps, splitFx, fyCurve } from './bicycle.js';

// Initial conditions are supplied by the caller (the legacy lap uses its nominal plan).
export function createPlant(car, initial){
  const vx=initial.vx;
  return {alf:0,alr:0,ax:0,ay:0,axF:0,ayF:0,FyfP:0,FyrP:0,shiftLeft:0,
    curG:car.gear[Math.min(NT-1,Math.round(vx/VSTEP))],...initial};
}

// action: {steer: target radians, fx: requested longitudinal force in N}.
// idx is track localisation supplied by the simulation, never by the driver.
// Mutates only state; gearbox, steering-rate limit and force limits belong to the plant.
export function plantStep(state,action,car,dc,line,idx,dt=DYN.dt){
  if(!Number.isFinite(action?.steer)||!Number.isFinite(action?.fx))throw new Error('plantStep: expected finite steer and fx');
  const {m,a,b,B,Izz,p}=dc,hs=line.sn,hc=line.cth,hk=line.kv;
  let {x,y,vx,vy,r,psi,delta,axF,ayF,shiftLeft,curG,FyfP,FyrP}=state;
  const vxs=Math.max(3,vx);
  const dmax=DYN.steerRate*dt,steer=Math.max(-DYN.steerMax,Math.min(DYN.steerMax,action.steer));
  delta+=Math.max(-dmax,Math.min(dmax,steer-delta));
  let Fx=action.fx;
  if(Fx>0&&car.shiftT>0){const gb=car.gear[Math.min(NT-1,Math.round(vx/VSTEP))];if(gb>curG&&curG>0){shiftLeft=car.shiftT;curG=gb;}}
  if(Fx<=0||car.shiftT<=0){const gb=car.gear[Math.min(NT-1,Math.round(vx*1.05/VSTEP))];if(gb<curG)curG=gb;}
  if(Fx>0){const eng=shiftLeft>0?0:tabAt(car.drv,vx)*m;Fx=Math.min(Fx,eng);}
  if(shiftLeft>0)shiftLeft-=dt;
  const [Df,Dr]=axleCaps(dc,vx,axF,ayF,hs?hc[idx]+vx*vx*hk[idx]/G:1);let [Fxf,Fxr]=splitFx(dc,Fx,Df,Dr,FyfP,FyrP);
  // a tyre can't give more than its peak: excess longitudinal demand is wheelspin or lock-up
  if(Math.abs(Fxf)>Df*0.999)Fxf=Math.sign(Fxf)*Df*0.999;if(Math.abs(Fxr)>Dr*0.999)Fxr=Math.sign(Fxr)*Dr*0.999;
  const Dfl=Math.sqrt(Math.max(0,Df*Df-Fxf*Fxf)),Drl=Math.sqrt(Math.max(0,Dr*Dr-Fxr*Fxr));
  const alf=delta-Math.atan2(vy+a*r,vxs),alr=-Math.atan2(vy-b*r,vxs);
  const Fyf=fyCurve(alf,Dfl,B),Fyr=fyCurve(alr,Drl,B);FyfP=Fyf;FyrP=Fyr;
  const cd=Math.cos(delta),sd=Math.sin(delta),drag=0.5*RHO*p.cda*vx*vx+m*G*CRR;
  const FX=Fxf*cd-Fyf*sd+Fxr-drag,FY=Fxf*sd+Fyf*cd+Fyr,MZ=a*(Fxf*sd+Fyf*cd)-b*Fyr;
  // at: from the tyres less drag (sets the load transfer, filtered); ax: along the road, gravity included
  const at=FX/m,ax=hs?at-G*hs[idx]:at,ay=FY/m,kf=Math.min(1,dt/DYN.lag);axF+=(at-axF)*kf;ayF+=(ay-ayF)*kf;
  vx+=(ax+vy*r)*dt;vy+=(ay-vx*r)*dt;r+=MZ/Izz*dt;if(vx<1)vx=1;
  psi+=r*dt;const c=Math.cos(psi),s=Math.sin(psi);
  if(hs){const ch=hc[idx];x+=(vx*c-vy*s)*dt*ch;y+=(vx*s+vy*c)*dt*ch;}else{x+=(vx*c-vy*s)*dt;y+=(vx*s+vy*c)*dt;}

  state.x=x;state.y=y;state.vx=vx;state.vy=vy;state.r=r;state.psi=psi;state.delta=delta;
  state.axF=axF;state.ayF=ayF;state.shiftLeft=shiftLeft;state.curG=curG;state.FyfP=FyfP;state.FyrP=FyrP;
  state.alf=alf;state.alr=alr;state.ax=ax;state.ay=ay;
  return state;
}
