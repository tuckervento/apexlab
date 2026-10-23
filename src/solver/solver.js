// Solver behind the worker protocol (ARCHITECTURE.md §10.1). No DOM and no worker APIs: src/solver/worker.js adapts
// it to postMessage, and tests drive it directly. It owns the car, track, bounds, working line, optimiser and dynamic
// check. Everything it emits is a fresh copy, listed as transferable, so no receiver shares its memory.
// A command or slice that throws emits {type:'error'} and pauses the solver, which stays usable.
import { buildCar, describeCar, buildTrack, makeBounds, makeScratch, lapEval, Optimizer } from '../core/index.js';
import { dynSetup, dynNominal, DynCheck } from '../dynamics/index.js';

const PUBLISH_MS=50; // snapshots and progress at most ~20 Hz while searching

export class Solver{
  constructor(emit,now=()=>performance.now()){
    this.emit=emit;this.now=now;this.opt=new Optimizer();
    this.car=null;this.T=null;this.B=null;this.off=null;this.pub=null;this.ref=null;this.refDirty=false;
    this.carRev=0;this.trackRev=0;this.lineRev=0;this.running=false;this.util=false;this.dyn=null;this.dynRevs=null;
    this.pending=false;this.lastPub=-Infinity;this.lastProg=-Infinity;this.lap=NaN;
  }
  handle(c){return this.guard(()=>{
    switch(c.type){
      case 'setCar':this.setCar(c);break;
      case 'setTrack':this.setTrack(c);break;
      case 'setLine':this.need();this.resetLine(null);break; // centreline
      case 'run':this.need();if(c.fresh){this.off.set(this.pub);this.opt.setup(this.T,this.car,this.B,this.off);}this.running=true;this.progress();break;
      case 'pause':this.running=false;this.progress();break;
      case 'view':this.util=!!c.util;if(this.pub)this.publish(false);break;
      case 'dynCheck': // pauses the search and checks the current published line, republished so views show exactly it
        this.need();this.running=false;this.publish(false);
        this.dyn=new DynCheck(this.T,this.car,this.pub);
        this.dynRevs={carRev:this.carRev,trackRev:this.trackRev,lineRev:this.lineRev};break;
      default:throw new Error(`Unknown command type "${c.type}"`);
    }
  });}
  // One slice of work: dynamic-check laps if one is in progress, else optimiser steps. Returns whether work remains.
  tick(budget){return this.guard(()=>{
    const t0=this.now();
    if(this.dyn){
      const d=this.dyn;while(!d.done&&this.now()-t0<budget)d.step();
      if(d.done){this.dyn=null;this.emit({type:'dynResult',...this.dynRevs,result:d.result});}
      else this.emit({type:'dynProgress',lap:d.iter});
      return !!this.dyn;
    }
    if(!this.running)return false;
    const opt=this.opt;
    if(opt.converged){this.running=false;this.progress();return false;} // nothing to do; the line is unchanged
    while(!opt.converged&&this.now()-t0<budget){if(opt.step())this.pending=true;}
    if(opt.converged){this.running=false;this.publish(true);return false;} // clamped final line
    const now=this.now();
    if(this.pending&&now-this.lastPub>=PUBLISH_MS)this.publish(true);
    else if(now-this.lastProg>=PUBLISH_MS)this.progress();
    return true;
  });}
  guard(fn){
    try{return fn();}
    catch(e){this.running=false;this.dyn=null;this.emit({type:'error',message:String(e&&e.message||e),stack:String(e&&e.stack||'')});return false;}
  }
  need(){if(!this.car||!this.T)throw new Error('Solver needs setCar and setTrack before this command');}

  setCar(c){
    const car=buildCar(c.params),info=describeCar(car); // throws on invalid params, leaving the solver unchanged
    this.car=car;this.carRev=c.rev;this.dyn=null;
    const cv=info.curves;
    this.emit({type:'carInfo',carRev:c.rev,info},[cv.drive.buffer,cv.traction.buffer,cv.resist.buffer,cv.gear.buffer,...cv.gears.map(g=>g.buffer)]);
    if(!this.T)return;
    this.B=makeBounds(this.T,car);
    if(!this.off){this.resetLine(null);return;}
    this.opt.rescore(car,this.B);this.computeRef();this.publish(true);
  }
  setTrack(c){
    const T=buildTrack(c.ctrl,c.width);
    this.T=T;this.trackRev=c.rev;this.dyn=null;
    const f=a=>Float64Array.from(a),ev={type:'track',trackRev:c.rev,N:T.N,L:T.L,ds:T.ds,cx:f(T.cx),cy:f(T.cy),nx:f(T.nx),ny:f(T.ny),kc:f(T.kc),width:T.width,issue:T.issue};
    this.emit(ev,[ev.cx.buffer,ev.cy.buffer,ev.nx.buffer,ev.ny.buffer,ev.kc.buffer]);
    if(!this.car)return;
    this.B=makeBounds(T,this.car);this.resetLine(c.keepLine?this.pub:null);
  }
  // Fresh optimiser run from the previous published line resampled to the new stations, or from the centreline;
  // either way clamped to the bounds.
  resetLine(from){
    const N=this.T.N,off=new Float64Array(N);
    if(from){const oN=from.length;for(let i=0;i<N;i++){const x=i*oN/N,a=x|0,f=x-a;off[i]=from[a%oN]*(1-f)+from[(a+1)%oN]*f;}}
    for(let i=0;i<N;i++)off[i]=Math.min(this.B.hi[i],Math.max(this.B.lo[i],off[i]));
    this.off=off;this.opt.setup(this.T,this.car,this.B,off);this.computeRef();this.publish(true);
  }
  computeRef(){const N=this.T.N,S=makeScratch(N),t=lapEval(this.T,this.car,new Float64Array(N),S);this.ref={t,v:Float64Array.from(S.v)};this.refDirty=true;}

  // Snapshot of the line for views. bump: the working line changed, so copy it and take a new line revision.
  publish(bump){
    const T=this.T,N=T.N,car=this.car;
    if(bump){this.pub=this.opt.current(new Float64Array(N));this.lineRev++;} // accepted line, never a rejected trial
    const S=makeScratch(N),t=lapEval(T,car,this.pub,S),tc=new Float64Array(N+1);
    for(let i=0;i<N;i++){const j=(i+1)%N;tc[i+1]=tc[i]+2*S.ds[i]/(S.v[i]+S.v[j]+1e-9);}
    let vmin=1e9,vmax=0;for(let i=0;i<N;i++){vmin=Math.min(vmin,S.v[i]);vmax=Math.max(vmax,S.v[i]);}
    const line={px:S.px,py:S.py,v:S.v,ds:S.ds,k:S.k,tc,u:null},tr=[S.px.buffer,S.py.buffer,S.v.buffer,S.ds.buffer,S.k.buffer,tc.buffer];
    if(this.util){ // per-axle grip utilisation from inverse dynamics (tyre-use colouring)
      const th=new Float64Array(N);for(let i=0;i<N;i++){const j=(i+1)%N;th[i]=Math.atan2(S.py[j]-S.py[i],S.px[j]-S.px[i]);}
      const n=dynNominal(car,dynSetup(car),{N,px:S.px,py:S.py,k:S.k,th,ds:S.ds},S.v);line.u=Float64Array.from(n.uf,(x,i)=>Math.max(x,n.ur[i]));tr.push(line.u.buffer);
    }
    const ev={type:'snapshot',carRev:this.carRev,trackRev:this.trackRev,lineRev:this.lineRev,lap:t,line,vmin,vmax};
    if(this.refDirty){ev.ref={t:this.ref.t,v:Float64Array.from(this.ref.v)};tr.push(ev.ref.v.buffer);this.refDirty=false;}
    this.lap=t;this.pending=false;this.lastPub=this.now();
    this.emit(ev,tr);this.progress();
  }
  progress(){
    const o=this.opt,si=o.T?o.stageInfo:{n:0,of:0,knot:0};this.lastProg=this.now();
    this.emit({type:'progress',stage:si.n,of:si.of,knot:si.knot,polish:!!o.polish,evals:o.evals||0,lap:this.lap,running:this.running,converged:!!o.converged});
  }
}
