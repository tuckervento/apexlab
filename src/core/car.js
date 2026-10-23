// Moved from prototype/apex-lab.html (migration step 2); units normalised by carSpec (step 3).
import { G, RHO, FZ0, VSTEP, VMAX, NT, CRR, NQ } from './constants.js';
import { buildPowertrain } from './powertrain.js';
import { carSpec } from './units.js';

// Largest a in [0,hi] with fn(a)>=0, for fn decreasing in a.
export function solveDec(fn,hi,n){let lo=0;if(fn(hi)>=0)return hi;for(let k=0,K=n||46;k<K;k++){const mid=(lo+hi)/2;if(fn(mid)>=0)lo=mid;else hi=mid;}return lo;}

// params: CarParams in UI units. Everything below reads the SI CarSpec p, stored as car.spec.
export function buildCar(params){
  const p=carSpec(params);
  const m=p.mass,wr=p.wr,wf=1-wr,aF=p.aF,rF=p.rF,bF=p.bF,awd=p.drive==='AWD',h=p.cg;
  const tireF=Fz=>{if(Fz<=0)return 0;let k=1-p.sens*(Fz/FZ0-1);if(k<0.25)k=0.25;return p.mu*k*Fz;};
  const alat=new Float64Array(NT),brk=new Float64Array(NT),trc=new Float64Array(NT),kcrit=new Float64Array(NT),limF=new Uint8Array(NT),brkF=new Uint8Array(NT);
  const ayFt=new Float64Array(NT),ayRt=new Float64Array(NT),kcF=new Float64Array(NT),kcR=new Float64Array(NT);
  const AMAX=8*G;
  for(let i=0;i<NT;i++){
    const v=i*VSTEP,DF=0.5*RHO*p.cla*v*v,Wf=m*G*wf+DF*aF,Wr=m*G*wr+DF*(1-aF);
    // Lateral: in steady state each axle must carry the lateral force for the mass it supports.
    const lat=(W,share,roll)=>solveDec(ay=>{const d=Math.min(m*ay*h/p.track*roll,W/2);return tireF(W/2+d)+tireF(W/2-d)-m*ay*share;},AMAX);
    const ayF=lat(Wf,wf,rF),ayR=lat(Wr,wr,1-rF);
    alat[i]=Math.min(ayF,ayR);limF[i]=ayF<ayR?1:0;ayFt[i]=ayF;ayRt[i]=ayR;kcF[i]=v>0?ayF/(v*v):Infinity;kcR[i]=v>0?ayR/(v*v):Infinity;
    // Braking: fixed brake bias, so the first axle to saturate sets the limit.
    const bf=ax=>{const d=m*ax*h/p.wb,f=Wf+d,r=Wr-d;return 2*tireF(f/2)-bF*m*ax;};
    const br=ax=>{const d=m*ax*h/p.wb,r=Wr-d;return 2*tireF(r/2)-(1-bF)*m*ax;};
    const axF=solveDec(bf,AMAX),axR=solveDec(br,AMAX);
    brk[i]=Math.min(axF,axR);brkF[i]=axF<axR?1:0;
    // Traction: driven axle(s), with load moving rearward under acceleration.
    trc[i]=awd?solveDec(ax=>{const d=Math.min(m*ax*h/p.wb,Wf);return tireF((Wf-d)/2)*2+tireF((Wr+d)/2)*2-m*ax;},AMAX)
              :solveDec(ax=>2*tireF((Wr+m*ax*h/p.wb)/2)-m*ax,AMAX);
    kcrit[i]=v>0?alat[i]/(v*v):Infinity;
  }
  // GGV: for every speed and lateral load (q = ay / lateral limit), the largest braking decel and drive accel
  // that keep BOTH axles inside their own friction circles, with longitudinal load transfer, lateral transfer
  // split by roll stiffness, fixed brake bias, and drive on the driven axle(s).
  const ggB=new Float64Array(NT*NQ),ggT=new Float64Array(NT*NQ);
  for(let i=0;i<NT;i++){
    const v=i*VSTEP,DF=0.5*RHO*p.cla*v*v,Wf0=m*G*wf+DF*aF,Wr0=m*G*wr+DF*(1-aF);
    for(let qi=0;qi<NQ;qi++){
      const ay=alat[i]*qi/(NQ-1),dF=m*ay*h/p.track,Fyf=m*wf*ay,Fyr=m*wr*ay;
      const cap=(W,dl)=>{if(W<=0)return 0;const d=Math.min(dl,W/2);return tireF(W/2+d)+tireF(W/2-d);};
      ggB[i*NQ+qi]=solveDec(ax=>{const d=m*ax*h/p.wb,Wf=Wf0+d,Wr=Wr0-d;const Df=cap(Wf,dF*rF),Dr=cap(Wr,dF*(1-rF));
        return Math.min(Df-Math.hypot(bF*m*ax,Fyf),Dr-Math.hypot((1-bF)*m*ax,Fyr));},AMAX,24);
      ggT[i*NQ+qi]=solveDec(ax=>{const d=Math.min(m*ax*h/p.wb,Wf0),Wf=Wf0-d,Wr=Wr0+d;const Df=cap(Wf,dF*rF),Dr=cap(Wr,dF*(1-rF));
        if(awd)return Math.min(Math.sqrt(Math.max(0,Df*Df-Fyf*Fyf))+Math.sqrt(Math.max(0,Dr*Dr-Fyr*Fyr))-m*ax,Df-Fyf,Dr-Fyr);
        return Math.min(Dr-Math.hypot(m*ax,Fyr),Df-Fyf);},AMAX,24);
    }
  }
  for(const kc of [kcrit,kcF,kcR])for(let i=2;i<NT;i++)if(kc[i]>=kc[i-1])kc[i]=kc[i-1]*(1-1e-9);
  // Yaw: Izz = DI·m·a·b. Changing yaw rate needs a yaw moment, which only the spare grip on one axle can supply:
  // the front axle when tightening into a turn, the rear when unwinding. That turns into an effective curvature
  // |k| + l·|dk/ds| checked against that axle's own limit, with l = DI·(CG-to-axle distance).
  const aCG=p.wb*wr,bCG=p.wb*wf,DI=p.yawDI,lF=DI*aCG,lR=DI*bCG;
  // Powertrain: tractive force envelope at the wheels, as an acceleration (m/s²).
  const pt=buildPowertrain(p),drv=pt.drv;
  // Top speed: highest speed where drive still beats drag + rolling resistance.
  const res=v=>(0.5*RHO*p.cda*v*v+m*G*CRR)/m;
  let vTop=VSTEP;
  for(let i=1;i<NT;i++){const v=i*VSTEP;if(drv[i]>=res(v))vTop=v;else if(i>4&&drv[i-1]>=res(v-VSTEP)){const a=drv[i-1]-res(v-VSTEP),b=drv[i]-res(v);vTop=v-VSTEP+VSTEP*a/(a-b);break;}}
  vTop=Math.min(vTop,VMAX-1);
  const shiftT=p.pt==='EV'?0:p.shiftT;
  return {spec:p,m,cda:p.cda,alat,brk,trc,ggB,ggT,kcrit,kcF,kcR,ayF:ayFt,ayR:ayRt,lF,lR,aCG,bCG,Izz:DI*m*aCG*bCG,limF,brkF,drv,gear:pt.gear,rpm:pt.rpm,gearF:pt.gearF,vTop,shiftT};
}
