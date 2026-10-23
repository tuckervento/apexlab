// Moved verbatim from prototype/apex-lab.html (migration step 2).
import { mulberry32 } from './rng.js';
import { makeScratch, lapEval } from './lap.js';

// Coarse-to-fine solver. The line is a periodic cubic B-spline of lateral offsets; each stage runs
// L-BFGS on the control points against a smoothed lap time (soft-min, soft track edges), then
// refines the knots and sharpens the smoothing. The last stage is the exact (hard) lap model.
// Track edges are a stiffening quadratic penalty rather than a clamp, so the line stays a smooth (C²) spline
// that meets the kerb tangentially instead of being cut off with a kink at each apex.
export const STAGES=[
  {knot:48,tau:3,  pen:2},
  {knot:24,tau:1,  pen:10},
  {knot:12,tau:0.3,pen:50},
  {knot:8, tau:0.08,pen:300},
  {knot:6, tau:0,  pen:2000}
];
export class Optimizer{
  setup(T,car,B,off){
    this.T=T;this.car=car;this.B=B;this.off=off;const N=T.N;
    this.S=makeScratch(N);this.go=new Float64Array(N);this.dodx=new Float64Array(N);this.raw=new Float64Array(N);
    this.iters=0;this.evals=0;this.done=false;this.polish=null;this.target=Float64Array.from(off);this.startStage(0,true);
  }
  rescore(car,B){this.car=car;this.B=B;this.target=Float64Array.from(this.off);this.done=false;this.polish=null;this.startStage(2,false);}
  get best(){return this.lap;}
  get converged(){return this.done;}
  get stageInfo(){return this.polish?{n:STAGES.length+1,of:STAGES.length+1,knot:0}:{n:this.stage+1,of:STAGES.length+1,knot:STAGES[this.stage].knot};}
  startStage(k,fresh){
    const T=this.T,N=T.N,st=STAGES[k];this.stage=k;this.st=st;
    const M=this.M=Math.max(8,Math.round(T.L/st.knot));
    this.j0=new Int32Array(N);this.w=new Float64Array(N*4);
    for(let i=0;i<N;i++){const u=i*M/N,j=Math.floor(u),t=u-j,t2=t*t,t3=t2*t;this.j0[i]=j;const b=i*4;
      this.w[b]=(1-t)**3/6;this.w[b+1]=(3*t3-6*t2+4)/6;this.w[b+2]=(-3*t3+3*t2+3*t+1)/6;this.w[b+3]=t3/6;}
    // fit control points to the current line (least squares by gradient iterations)
    const c=this.c=new Float64Array(M),tgt=this.target,r=new Float64Array(M),cnt=new Float64Array(M);
    for(let i=0;i<N;i++)cnt[this.j0[i]]++;
    for(let it=0;it<(fresh&&!tgt.some(v=>v!==0)?0:80);it++){
      r.fill(0);
      for(let i=0;i<N;i++){const e=tgt[i]-this.spl(i,c),b=i*4,j=this.j0[i];for(let q=0;q<4;q++)r[(j-1+q+M)%M]+=this.w[b+q]*e;}
      for(let j=0;j<M;j++)c[j]+=1.5*r[j]/Math.max(1,cnt[j]);
    }
    this.mem=[];this.stall=0;this.g=new Float64Array(M);this.f=this.evalc(c,this.g);
  }
  spl(i,c){const b=i*4,j=this.j0[i],M=this.M,w=this.w;return w[b]*c[(j-1+M)%M]+w[b+1]*c[j%M]+w[b+2]*c[(j+1)%M]+w[b+3]*c[(j+2)%M];}
  evalc(c,g){
    const T=this.T,N=T.N,M=this.M,w=this.w,j0=this.j0,off=this.off,lo=this.B.lo,hi=this.B.hi,W=this.st.pen;
    for(let i=0;i<N;i++)off[i]=this.spl(i,c);
    const t=lapEval(T,this.car,off,this.S,g?this.go:null,this.st.tau);this.evals++;
    let pen=0;
    for(let i=0;i<N;i++){const x=off[i],d=x>hi[i]?x-hi[i]:x<lo[i]?x-lo[i]:0;if(d!==0){pen+=W*d*d;if(g)this.go[i]+=2*W*d;}}
    if(!g){this.lap=this.st.tau>0?NaN:t;return t+pen;}
    g.fill(0);
    for(let i=0;i<N;i++){const gi=this.go[i];if(gi===0)continue;const b=i*4,j=j0[i];for(let q=0;q<4;q++)g[(j-1+q+M)%M]+=w[b+q]*gi;}
    // keep control points from drifting far outside the track where they no longer matter
    const hw=this.B.hw+0.5,lam=2e-3;
    for(let j=0;j<M;j++){const d=Math.abs(c[j])-hw;if(d>0){pen+=lam*d*d;g[j]+=2*lam*d*Math.sign(c[j]);}}
    this.lap=this.st.tau>0?NaN:t;this.smooth=t;return t+pen;
  }
  exactLap(){return lapEval(this.T,this.car,this.off,makeScratch(this.T.N));}
  // The line the optimiser has accepted, written into out. Not `off`: during the polish, `off` still holds the last
  // candidate tried even when it was rejected. Once converged, the clamped final line.
  current(out){if(this.done){out.set(this.off);return out;}for(let i=0;i<out.length;i++)out[i]=this.spl(i,this.c);return out;}
  clamp(x){const lo=this.B.lo,hi=this.B.hi;for(let i=0;i<x.length;i++)x[i]=x[i]<lo[i]?lo[i]:x[i]>hi[i]?hi[i]:x[i];}
  advance(){
    this.target=Float64Array.from(this.off);
    if(this.stage<STAGES.length-1){this.startStage(this.stage+1,false);return true;}
    if(!this.polish){this.polish={tries:0,scale:0.05,rnd:mulberry32(777)};this.sigBest=this.f;this.sigTry=0;return true;}
    this.done=true;return false;
  }
  step(){
    if(this.done)return false;
    if(this.polish){ // local search on the spline knots: a smooth bump across neighbouring control points
      const P=this.polish,M=this.M,c=this.c,r=P.rnd,j=(r()*M)|0,wd=0.6+r()*3,amp=(r()+r()+r()-1.5)*P.scale*this.T.width/2,span=Math.ceil(wd*3),old=[];
      for(let d=-span;d<=span;d++){const q=(j+d+M)%M;old.push(c[q]);c[q]+=amp*Math.exp(-d*d/(2*wd*wd));}
      const f=this.evalc(c,null);P.tries++;
      if(f<this.f-1e-9){this.f=f;P.scale=Math.min(0.3,P.scale*1.1);if(this.sigBest-f>0.001){this.sigBest=f;this.sigTry=P.tries;}}
      else{for(let d=-span,k=0;d<=span;d++,k++)c[(j+d+M)%M]=old[k];P.scale=Math.max(0.002,P.scale*0.99);}
      if(P.tries-this.sigTry>3000){this.evalc(c,null);this.clamp(this.off);this.done=true;}
      return f<=this.f;
    }
    const M=this.M,g=this.g,c=this.c,mem=this.mem,d=new Float64Array(M),al=[];
    for(let i=0;i<M;i++)d[i]=-g[i];
    for(let j=mem.length-1;j>=0;j--){const {s,y,rho}=mem[j];let a=0;for(let i=0;i<M;i++)a+=s[i]*d[i];a*=rho;al[j]=a;for(let i=0;i<M;i++)d[i]-=a*y[i];}
    if(mem.length){const {s,y}=mem[mem.length-1];let sy=0,yy=0;for(let i=0;i<M;i++){sy+=s[i]*y[i];yy+=y[i]*y[i];}const gm=sy/yy;for(let i=0;i<M;i++)d[i]*=gm;}
    for(let j=0;j<mem.length;j++){const {s,y,rho}=mem[j];let b=0;for(let i=0;i<M;i++)b+=y[i]*d[i];b*=rho;for(let i=0;i<M;i++)d[i]+=s[i]*(al[j]-b);}
    let gd=0;for(let i=0;i<M;i++)gd+=g[i]*d[i];
    if(gd>=0){mem.length=0;for(let i=0;i<M;i++)d[i]=-g[i];gd=0;for(let i=0;i<M;i++)gd+=g[i]*d[i];}
    let dmax=0;for(let i=0;i<M;i++)dmax=Math.max(dmax,Math.abs(d[i]));
    if(dmax<1e-9)return this.advance();
    let a=mem.length?1:Math.min(1,1/dmax);const cn=new Float64Array(M),gn=new Float64Array(M);let fn=0,ok=false;
    for(let ls=0;ls<25;ls++){for(let i=0;i<M;i++)cn[i]=c[i]+a*d[i];fn=this.evalc(cn,gn);if(fn<=this.f+1e-4*a*gd){ok=true;break;}a*=0.5;}
    this.iters++;
    if(!ok){this.evalc(c,g);if(mem.length){mem.length=0;return false;}return this.advance();}
    const s=new Float64Array(M),y=new Float64Array(M);let sy=0;
    for(let i=0;i<M;i++){s[i]=cn[i]-c[i];y[i]=gn[i]-g[i];sy+=s[i]*y[i];}
    if(sy>1e-12){mem.push({s,y,rho:1/sy});if(mem.length>20)mem.shift();}
    const imp=this.f-fn;c.set(cn);g.set(gn);this.f=fn;
    this.stall=imp<2e-5?this.stall+1:0;
    if(this.stall>12)this.advance();
    return true;
  }
}
