import { DYN, dynNominal } from './bicycle.js';
import { createPlant, plantStep } from './plant.js';
import { observe } from './observe.js';
import { referenceDriver } from '../drivers/reference.js';

// One legacy dynamic-check lap; driver-relative judging is intentionally unchanged.
export function dynLap(T,car,dc,line,v,keepTrace,driver=referenceDriver){
  if(!T.flat&&!line.sn)throw new Error('dynLap: a hilly circuit needs its line\'s grades (grades(T))');
  const N=line.N,px=line.px,py=line.py,k=line.k,dt=DYN.dt,{p}=dc;
  const nom=dynNominal(car,dc,line,v),th=line.th;
  const driverState=driver.init({car:structuredClone(car),dc:{...dc},line:structuredClone(line),v:v.slice(),dt});
  const hwTrack=T.width/2-(p.track+0.25)/2;
  let i0=0;{let bk=Infinity;for(let i=0;i<N;i++){let s=0;for(let d=-3;d<=3;d++)s+=Math.abs(k[(i+d+N)%N]);if(s<bk){bk=s;i0=i;}}}
  let x=px[i0],y=py[i0],vx=v[i0],vy=nom.vy[i0],r=nom.r[i0],psi=th[i0]-Math.atan2(vy,vx),delta=nom.delta[i0];
  const axF=nom.ax[i0],ayF=vx*vx*k[i0];
  let idx=i0,prog=0,t=0,curG;
  const state=createPlant(car,{x,y,vx,vy,r,psi,delta,axF,ayF});
  // trace (every 6th step): position, speed v (=vx), line error e, time, station; and for playback (pose) the car's
  // state: heading psi, vy, yaw rate r, steering delta, slip angles alf/alr, body accelerations ax/ay, gear, path length s,
  // and the track height z under the car (level cross-section: the centreline heights interpolated by the observed fraction)
  const trouble=[],tr=keepTrace?{x:[],y:[],v:[],e:[],t:[],st:[],psi:[],vy:[],r:[],delta:[],alf:[],alr:[],ax:[],ay:[],gear:[],s:[],z:[]}:null,stV=new Float64Array(N),stE=new Float64Array(N);
  let maxOff=0,maxE=0,maxDB=0,maxAf=0,maxAr=0,spun=false,lastSt=-1,path=0;
  const steps=Math.ceil(900/dt);
  for(let it=0;it<steps;it++){
    let best=idx,bd=Infinity,bdd=0;
    for(let d=0;d<20;d++){const j=(idx+d)%N,dx=x-px[j],dy=y-py[j],q=dx*dx+dy*dy;if(q<bd){bd=q;best=j;bdd=d;}}
    prog+=bdd;if(prog>=N)break;idx=best;
    const obs=observe(state,line,idx,t),{seg,f,e}=obs,j=(seg+1)%N;
    const vt=v[seg]+(v[j]-v[seg])*f,vyN=nom.vy[seg]+(nom.vy[j]-nom.vy[seg])*f;
    const action=driver.step(driverState,obs);
    plantStep(state,action,car,dc,line,idx,dt);
    ({x,y,vx,vy,r,psi,delta,curG}=state);
    const {alf,alr,ax,ay}=state;
    t+=dt;if(tr)path+=Math.hypot(vx,vy)*dt;
    const o=(x-T.cx[idx])*T.nx[idx]+(y-T.cy[idx])*T.ny[idx],over=Math.abs(o)-hwTrack;
    const dB=Math.abs(Math.atan2(vy,vx)-Math.atan2(vyN,Math.max(1,vt)));
    if(over>maxOff)maxOff=over;if(Math.abs(e)>maxE)maxE=Math.abs(e);if(dB>maxDB)maxDB=dB;if(Math.abs(alf)>maxAf)maxAf=Math.abs(alf);if(Math.abs(alr)>maxAr)maxAr=Math.abs(alr);
    if(idx!==lastSt){stV[idx]=vx;stE[idx]=e;lastSt=idx;}
    if(over>DYN.tolOff||dB>0.1)trouble.push(idx);
    if(over>3||dB>0.45){spun=true;break;}
    if(tr&&it%6===0){tr.x.push(x);tr.y.push(y);tr.v.push(vx);tr.e.push(e);tr.t.push(t);tr.st.push(idx);
      tr.psi.push(psi);tr.vy.push(vy);tr.r.push(r);tr.delta.push(delta);tr.alf.push(alf);tr.alr.push(alr);tr.ax.push(ax);tr.ay.push(ay);tr.gear.push(curG);tr.s.push(path);tr.z.push(T.z[seg]+(T.z[j]-T.z[seg])*f);}
  }
  return {t,start:i0,spun,complete:!spun&&prog>=N,trouble,maxOff,maxE,maxDB,maxAf,maxAr,stV,stE,trace:tr,endIdx:idx,nom};
}
