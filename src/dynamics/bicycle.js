// Moved from prototype/apex-lab.html (migration step 2); DYN frozen, reads car.spec (step 3).
import { G, RHO, FZ0, VSTEP, NT, CRR } from '../core/constants.js';
import { tabAt } from '../core/lap.js';

// Dynamic check: a time-stepped bicycle model drives the optimised line.
// State: position, heading, body velocities (vx, vy) and yaw rate. Each axle has a Pacejka-style lateral curve
// Fy = D·sin(C·atan(B·α)) whose peak D comes from the same tyre/load model as the lap sim (load sensitivity,
// lateral transfer split by roll stiffness, longitudinal transfer over the wheelbase, downforce by aero balance);
// longitudinal force takes its share of each axle's friction circle first.
// The driver is inverse dynamics plus feedback: for every point on the line the bicycle model is solved backwards
// (axle forces from the lateral and yaw-moment balance, slip angles from the tyre curve, then steering and
// sideslip from the kinematics). That nominal steering and longitudinal force drive the car, with small
// corrections for path, heading and speed error. Where the line asks for more than an axle has, the car slides;
// the driver then eases off before that point and tries again.
export const DYN=Object.freeze({C:1.45,dt:0.004,tolOff:0.5,steerRate:1.5,lag:0.06,ke:15,kpsi:2.5,kr:0.3,ki:0.01});
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
    const n=hs?Math.max(0,hc[i]+u*u*hk[i]/G):1,ax=hs?ax0+G*hs[i]:ax0;
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

// One lap at target speeds v (per station). Returns time, trouble stations and a trace.
// On a hilly line (line.sn, cth, kv from grades()): gravity pulls along the road (−g·sinθ at the car's station), the
// static weight counts n = cth + vx²·kv/g times in the tyres' loads, and the car covers ground in plan at v·cosθ.
export function dynLap(T,car,dc,line,v,keepTrace){
  if(!T.flat&&!line.sn)throw new Error('dynLap: a hilly circuit needs its line\'s grades (grades(T))');
  const N=line.N,px=line.px,py=line.py,k=line.k,dt=DYN.dt,{m,a,b,L,B,Izz,p}=dc,hs=line.sn,hc=line.cth,hk=line.kv;
  const nom=dynNominal(car,dc,line,v),th=line.th,dsL=line.ds;
  const hwTrack=T.width/2-(p.track+0.25)/2;
  let i0=0;{let bk=Infinity;for(let i=0;i<N;i++){let s=0;for(let d=-3;d<=3;d++)s+=Math.abs(k[(i+d+N)%N]);if(s<bk){bk=s;i0=i;}}}
  let x=px[i0],y=py[i0],vx=v[i0],vy=nom.vy[i0],r=nom.r[i0],psi=th[i0]-Math.atan2(vy,vx),delta=nom.delta[i0];
  let axF=nom.ax[i0],ayF=vx*vx*k[i0],idx=i0,prog=0,t=0,eI=0,shiftLeft=0,curG=car.gear[Math.min(NT-1,Math.round(vx/VSTEP))];
  // trace (every 6th step): position, speed v (=vx), line error e, time, station; and for playback (pose) the car's
  // state: heading psi, vy, yaw rate r, steering delta, slip angles alf/alr, body accelerations ax/ay, gear, path length s
  const trouble=[],tr=keepTrace?{x:[],y:[],v:[],e:[],t:[],st:[],psi:[],vy:[],r:[],delta:[],alf:[],alr:[],ax:[],ay:[],gear:[],s:[]}:null,stV=new Float64Array(N),stE=new Float64Array(N);
  let maxOff=0,maxE=0,maxDB=0,maxAf=0,maxAr=0,spun=false,lastSt=-1,FyfP=0,FyrP=0,path=0;
  const steps=Math.ceil(900/dt);
  for(let it=0;it<steps;it++){
    let best=idx,bd=Infinity,bdd=0;
    for(let d=0;d<20;d++){const j=(idx+d)%N,dx=x-px[j],dy=y-py[j],q=dx*dx+dy*dy;if(q<bd){bd=q;best=j;bdd=d;}}
    prog+=bdd;if(prog>=N)break;idx=best;
    let seg=idx,ux=Math.cos(th[seg]),uy=Math.sin(th[seg]),sx=(x-px[seg])*ux+(y-py[seg])*uy;
    if(sx<0){seg=(idx-1+N)%N;ux=Math.cos(th[seg]);uy=Math.sin(th[seg]);sx=(x-px[seg])*ux+(y-py[seg])*uy;}
    const j=(seg+1)%N,f=Math.max(0,Math.min(1,sx/(dsL[seg]||1))),lp=(A)=>A[seg]+(A[j]-A[seg])*f;
    const e=-(x-px[seg])*uy+(y-py[seg])*ux; // + = left of line
    const thl=th[seg]+f*Math.atan2(Math.sin(th[j]-th[seg]),Math.cos(th[j]-th[seg]));
    const vt=v[seg]+(v[j]-v[seg])*f,vyN=lp(nom.vy),rN=lp(nom.r),FxN=lp(nom.Fx);
    // steering feedforward: nominal steering interpolated at the car's position along the line
    let dN;{const sa=seg+f,i1=Math.floor(sa),fr=sa-i1,a0=nom.delta[i1%N],a1=nom.delta[(i1+1)%N];dN=a0+(a1-a0)*fr;}
    let eps=psi-(thl-Math.atan2(vyN,Math.max(1,vt)));eps=Math.atan2(Math.sin(eps),Math.cos(eps));
    const vxs=Math.max(3,vx);
    // steering: nominal + path/heading/yaw corrections
    eI=Math.max(-3,Math.min(3,eI+e*dt));
    let dCmd=dN-DYN.ke/vxs*e-DYN.kpsi*eps-DYN.kr*(r-rN)-DYN.ki*eI;
    dCmd=Math.max(-0.6,Math.min(0.6,dCmd));
    const dmax=DYN.steerRate*dt;delta+=Math.max(-dmax,Math.min(dmax,dCmd-delta));
    // longitudinal: nominal force + speed correction, with upshift interruption
    let Fx=FxN+m*1.5*(vt-vx);
    if(Fx>0&&car.shiftT>0){const gb=car.gear[Math.min(NT-1,Math.round(vx/VSTEP))];if(gb>curG&&curG>0){shiftLeft=car.shiftT;curG=gb;}}
    if(Fx<=0||car.shiftT<=0){const gb=car.gear[Math.min(NT-1,Math.round(vx*1.05/VSTEP))];if(gb<curG)curG=gb;}
    if(Fx>0){const eng=shiftLeft>0?0:tabAt(car.drv,vx)*m;Fx=Math.min(Fx,eng);}
    if(shiftLeft>0)shiftLeft-=dt;
    const [Df,Dr]=axleCaps(dc,vx,axF,ayF,hs?Math.max(0,hc[idx]+vx*vx*hk[idx]/G):1);let [Fxf,Fxr]=splitFx(dc,Fx,Df,Dr,FyfP,FyrP);
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
    t+=dt;if(tr)path+=Math.hypot(vx,vy)*dt;
    const o=(x-T.cx[idx])*T.nx[idx]+(y-T.cy[idx])*T.ny[idx],over=Math.abs(o)-hwTrack;
    const dB=Math.abs(Math.atan2(vy,vx)-Math.atan2(vyN,Math.max(1,vt)));
    if(over>maxOff)maxOff=over;if(Math.abs(e)>maxE)maxE=Math.abs(e);if(dB>maxDB)maxDB=dB;if(Math.abs(alf)>maxAf)maxAf=Math.abs(alf);if(Math.abs(alr)>maxAr)maxAr=Math.abs(alr);
    if(idx!==lastSt){stV[idx]=vx;stE[idx]=e;lastSt=idx;}
    if(over>DYN.tolOff||dB>0.1)trouble.push(idx);
    if(over>3||dB>0.45){spun=true;break;}
    if(tr&&it%6===0){tr.x.push(x);tr.y.push(y);tr.v.push(vx);tr.e.push(e);tr.t.push(t);tr.st.push(idx);
      tr.psi.push(psi);tr.vy.push(vy);tr.r.push(r);tr.delta.push(delta);tr.alf.push(alf);tr.alr.push(alr);tr.ax.push(ax);tr.ay.push(ay);tr.gear.push(curG);tr.s.push(path);}
  }
  return {t,start:i0,spun,complete:!spun&&prog>=N,trouble,maxOff,maxE,maxDB,maxAf,maxAr,stV,stE,trace:tr,endIdx:idx,nom};
}
