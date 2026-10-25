// Moved from prototype/apex-lab.html (migration step 2); DYN frozen, reads car.spec (step 3).
import { G, RHO, FZ0, CRR } from '../core/constants.js';

// Dynamic check: a time-stepped bicycle model drives the optimised line.
// State: position, heading, body velocities (vx, vy) and yaw rate. Each axle has a Pacejka-style lateral curve
// Fy = D·sin(C·atan(B·α)) whose peak D comes from the same tyre/load model as the lap sim (load sensitivity,
// lateral transfer split by roll stiffness, longitudinal transfer over the wheelbase, downforce by aero balance);
// longitudinal force takes its share of each axle's friction circle first.
// The inverse-dynamics + feedback driver lives in src/drivers/reference.js; plant integration is in plant.js.
export const DYN=Object.freeze({C:1.45,dt:0.004,tolOff:0.5,steerRate:1.5,steerMax:0.6,lag:0.06});
export function dynSetup(car){
  const p=car.spec,m=car.m,wr=p.wr,wf=1-wr,a=car.aCG,b=car.bCG,L=p.wb,h=p.cg;
  const tireF=Fz=>{if(Fz<=0)return 0;let k=1-p.sens*(Fz/FZ0-1);if(k<0.25)k=0.25;return p.mu*k*Fz;};
  const apk=p.slipPeak,B=Math.tan(Math.PI/(2*DYN.C))/apk;
  const Izz=Math.max(0.3,p.yawDI)*m*a*b; // carSpec allows any yawDI > 0 (panel: 0.6–1.4); the lap model's yaw limit (car.js) isn't floored
  return {p,m,wr,wf,a,b,L,h,tireF,apk,B,Izz,aF:p.aF,rF:p.rF,bF:p.bF,awd:p.drive==='AWD'};
}
export function fyCurve(alpha,D,B){return D*Math.sin(DYN.C*Math.atan(B*alpha));}
export function alphaFor(F,D,B,apk){if(D<=1)return apk*Math.sign(F);const r=F/D;if(Math.abs(r)>=1)return apk*Math.sign(F);return Math.tan(Math.asin(r)/DYN.C)/B;}
// Quasi-static axle loads [Wf, Wr] at speed v and longitudinal acceleration ax (downforce by aero balance,
// longitudinal transfer over the wheelbase), and the downforce DF itself; all N. n: load factor (static weight counts
// n times: crests unload, compressions load; 1 on level ground).
export function axleLoads(dc,v,ax,n=1){
  const {m,wf,wr,h,L,aF,p}=dc,DF=0.5*RHO*p.cla*v*v;
  return [Math.max(0,m*G*n*wf+DF*aF-m*ax*h/L),Math.max(0,m*G*n*wr+DF*(1-aF)+m*ax*h/L),DF];
}
// Axle peaks for given accelerations (quasi-static loads) at load factor n.
export function axleCaps(dc,v,ax,ay,n=1){
  const {m,h,tireF,rF,p}=dc,[Wf,Wr]=axleLoads(dc,v,ax,n),dF=m*Math.abs(ay)*h/p.track;
  const df=Math.min(dF*rF,Wf/2),dr=Math.min(dF*(1-rF),Wr/2);
  return [tireF(Wf/2+df)+tireF(Wf/2-df),tireF(Wr/2+dr)+tireF(Wr/2-dr)];
}
// Split a total longitudinal force between the axles: brake bias when braking, driven axle(s) when driving.
// For AWD the drive goes where there is spare grip once each axle's cornering force is taken out (as the GGV assumes).
export function splitFx(dc,Fx,Df,Dr,Fyf,Fyr){
  if(Fx<0)return [Fx*dc.bF,Fx*(1-dc.bF)];
  if(dc.awd){const sf=Math.sqrt(Math.max(0,Df*Df-(Fyf||0)**2)),sr=Math.sqrt(Math.max(0,Dr*Dr-(Fyr||0)**2)),t=sf+sr||1;return [Fx*sf/t,Fx*sr/t];}
  return [0,Fx];
}

// Hill data for a line on circuit T, or null when T is flat: per station the sine of the grade (central, over the two
// 3D steps either side), its cosine (cth) and the vertical curvature (kv), all from the centreline as in lapEval.
export function grades(T){
  if(T.flat)return null;
  const N=T.N,dz=T.dz,sn=new Float64Array(N);
  for(let i=0;i<N;i++){const a=(i-1+N)%N;sn[i]=(dz[a]+dz[i])/(Math.hypot(T.ds,dz[a])+Math.hypot(T.ds,dz[i]));}
  return {sn,cth:T.cth,kv:T.kv};
}

// Inverse dynamics along the line at speeds v (per station): nominal inputs and per-axle grip utilisation, plus the
// forces on the car for telemetry: axle tyre forces Fxf, Fxr, Fyf, Fyr, axle loads Wf, Wr, downforce and drag (N), and
// the load factor nz. On a hilly line (line.sn, cth, kv from grades(), and ds3, the 3D steps, for the speed derivative)
// the tyres also hold the car against gravity, and the static weight counts n = cth + v²·kv/g times. ax (output) is the
// tyre-force acceleration less drag, which sets the load transfer: on level ground the path acceleration itself.
export function dynNominal(car,dc,line,v){
  const N=line.N,{m,a,b,L,Izz,B,apk,p}=dc,k=line.k,ds=line.ds3||line.ds,F=()=>new Float64Array(N),hs=line.sn,hc=line.cth,hk=line.kv;
  const o={delta:F(),vy:F(),r:F(),Fx:F(),ax:F(),uf:F(),ur:F(),af:F(),ar:F(),Fxf:F(),Fxr:F(),Fyf:F(),Fyr:F(),Wf:F(),Wr:F(),down:F(),drag:F(),nz:F()};
  for(let i=0;i<N;i++){
    const ip=(i-1+N)%N,jn=(i+1)%N,u=Math.max(1,v[i]);
    const ax0=(v[jn]*v[jn]-v[ip]*v[ip])/(2*(ds[ip]+ds[i])),ay=u*u*k[i],r=u*k[i];
    const rd=u*(v[jn]*k[jn]-v[ip]*k[ip])/(ds[ip]+ds[i]); // yaw acceleration
    const Fyf=(m*ay*b+Izz*rd)/L,Fyr=(m*ay*a-Izz*rd)/L;
    const n=hs?hc[i]+u*u*hk[i]/G:1,ax=hs?ax0+G*hs[i]:ax0;
    const drag=0.5*RHO*p.cda*u*u+m*G*CRR,Fx=m*ax+drag;
    const [Df,Dr]=axleCaps(dc,u,ax,ay,n),[Fxf,Fxr]=splitFx(dc,Fx,Df,Dr,Fyf,Fyr);
    const Dfl=Math.sqrt(Math.max(0,Df*Df-Fxf*Fxf)),Drl=Math.sqrt(Math.max(0,Dr*Dr-Fxr*Fxr));
    o.uf[i]=Math.hypot(Fxf,Fyf)/(Df||1);o.ur[i]=Math.hypot(Fxr,Fyr)/(Dr||1);
    // an axle with almost no lateral grip left still has its cornering stiffness: floor the curve's peak so the
    // inverse gives a small slip angle for a small force instead of jumping to the peak
    const af=alphaFor(Fyf,Math.max(Dfl,0.25*Df),B,apk),ar=alphaFor(Fyr,Math.max(Drl,0.25*Dr),B,apk);
    const vy=b*r-u*ar; // from αr = −(vy − b·r)/v
    o.delta[i]=af+(vy+a*r)/u;o.vy[i]=vy;o.r[i]=r;o.Fx[i]=Fx;o.ax[i]=ax;o.af[i]=af;o.ar[i]=ar;
    const [Wf,Wr,DF]=axleLoads(dc,u,ax,n);
    o.Fxf[i]=Fxf;o.Fxr[i]=Fxr;o.Fyf[i]=Fyf;o.Fyr[i]=Fyr;o.Wf[i]=Wf;o.Wr[i]=Wr;o.down[i]=DF;o.drag[i]=drag;o.nz[i]=n;
  }
  return o;
}
