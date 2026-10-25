// Original inverse-dynamics + feedback driver. Each init owns its plan and integral.
import { dynNominal } from '../dynamics/bicycle.js';
const GAINS=Object.freeze({ke:15,kpsi:2.5,kr:0.3,ki:0.01});
export const referenceDriver=Object.freeze({
  name:'reference-v1',
  init({car,dc,line,v,dt}){
    const geometry=Object.fromEntries(Object.entries(line).map(([k,a])=>[k,ArrayBuffer.isView(a)?a.slice():a]));
    return {nom:dynNominal(car,dc,geometry,v),line:geometry,v:v.slice(),m:dc.m,dt,eI:0};
  },
  step(state,obs){
    const {nom,line,v,m,dt}=state,{N}=line;
    const {seg,f,e,thl,psi,vx,r}=obs,j=(seg+1)%N;
    const lp=A=>A[seg]+(A[j]-A[seg])*f;
    let eI=state.eI;
    const vt=v[seg]+(v[j]-v[seg])*f,vyN=lp(nom.vy),rN=lp(nom.r),FxN=lp(nom.Fx);
    // steering feedforward: nominal steering interpolated at the car's position along the line
    let dN;{const sa=seg+f,i1=Math.floor(sa),fr=sa-i1,a0=nom.delta[i1%N],a1=nom.delta[(i1+1)%N];dN=a0+(a1-a0)*fr;}
    let eps=psi-(thl-Math.atan2(vyN,Math.max(1,vt)));eps=Math.atan2(Math.sin(eps),Math.cos(eps));
    const vxs=Math.max(3,vx);
    // steering: nominal + path/heading/yaw corrections
    eI=Math.max(-3,Math.min(3,eI+e*dt));
    let dCmd=dN-GAINS.ke/vxs*e-GAINS.kpsi*eps-GAINS.kr*(r-rN)-GAINS.ki*eI;
    dCmd=Math.max(-0.6,Math.min(0.6,dCmd));

    state.eI=eI;
    return {steer:dCmd,fx:FxN+m*1.5*(vt-vx)};
  },
});
