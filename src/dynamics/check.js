// Moved verbatim from prototype/apex-lab.html (migration step 2).
import { makeScratch, lapEval } from '../core/lap.js';
import { dynSetup, dynNominal, grades } from './bicycle.js';
import { dynLap } from './lap.js';

// The check: (1) inverse dynamics along the line at the lap sim's speeds gives each axle's grip use, yaw inertia
// included; (2) the time-stepped car drives the line at a uniform fraction of the lap sim's speeds, and a bisection
// finds the highest fraction it completes cleanly (on track, no slide). The first place it fails just above that
// fraction is the line's dynamic weak spot.
export class DynCheck{
  constructor(T,car,off){
    const N=T.N;this.T=T;this.car=car;this.dc=dynSetup(car);this.N=N;
    const S=makeScratch(N);this.qss=lapEval(T,car,off,S);this.vq=Float64Array.from(S.v);
    const px=S.px,py=S.py,th=new Float64Array(N),ds=new Float64Array(N);
    for(let i=0;i<N;i++){const j=(i+1)%N;th[i]=Math.atan2(py[j]-py[i],px[j]-px[i]);ds[i]=Math.hypot(px[j]-px[i],py[j]-py[i]);}
    this.line={N,px:Float64Array.from(px),py:Float64Array.from(py),k:Float64Array.from(S.k),th,ds}; // ds: plan-view steps (geometry)
    const hl=grades(T);if(hl)Object.assign(this.line,hl,{ds3:Float64Array.from(S.ds)}); // hilly: grades, and the 3D steps for speed changes
    const n0=dynNominal(car,this.dc,this.line,this.vq);this.uf=n0.uf;this.ur=n0.ur;
    this.lo=0.80;this.hi=1.0;this.iter=0;this.done=false;this.result=null;this.fail=null;this.loRes=null;
  }
  lap(fr,trace){return dynLap(this.T,this.car,this.dc,this.line,Float64Array.from(this.vq,x=>x*fr),trace);}
  step(){
    if(this.done)return;
    this.iter++;
    if(this.iter===1){const r=this.lap(1,false);if(!r.spun&&!r.trouble.length){this.lo=1;this.loRes=r;this.finish();return;}this.fail={fr:1,at:r.trouble.length?r.trouble[0]:r.endIdx,spun:r.spun};return;}
    if(this.iter===2){const r=this.lap(this.lo,false);if(r.spun||r.trouble.length){this.lo=0;this.finish();return;}return;}
    const mid=(this.lo+this.hi)/2,r=this.lap(mid,false);
    if(!r.spun&&!r.trouble.length)this.lo=mid;else{this.hi=mid;this.fail={fr:mid,at:r.trouble.length?r.trouble[0]:r.endIdx,spun:r.spun};}
    if(this.hi-this.lo<0.004)this.finish();
  }
  finish(){
    const N=this.N,fin=this.lo>0?this.lap(this.lo,true):null;let umax=0,uat=0,ufr=0;
    for(let i=0;i<N;i++){const u=Math.max(this.uf[i],this.ur[i]);if(u>umax){umax=u;uat=i;ufr=this.uf[i]>this.ur[i]?'front':'rear';}}
    this.result={qss:this.qss,frac:this.lo,dyn:fin,fail:this.fail,umax,uat,uaxle:ufr,uf:this.uf,ur:this.ur,iters:this.iter};this.done=true;
  }
}
