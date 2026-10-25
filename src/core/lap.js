// Moved from prototype/apex-lab.html (migration step 2); module-level state removed (step 3); elevation (step 8).
import { G, RHO, VSTEP, NT, CRR, NQ, NL, NSTEP } from './constants.js';

// Corner speed at curvature |k| from a kcrit-style table: writes out[0]=v, out[1]=dv/d|k|, returns v.
export function vCorner(car,k,kc,out){
  k=k<0?-k:k;out[1]=0;
  if(k<1e-7)return out[0]=car.vTop;
  kc=kc||car.kcrit;
  if(kc[NT-1]>k)return out[0]=car.vTop;
  if(kc[1]<=k)return out[0]=VSTEP;
  let lo=1,hi=NT-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(kc[mid]>k)lo=mid;else hi=mid;}
  const den=kc[lo]-kc[hi],v=(lo+(kc[lo]-k)/den)*VSTEP;
  if(v>=car.vTop)return out[0]=car.vTop;
  out[1]=-VSTEP/den;return out[0]=v;
}
export function tabAt(a,v){let x=v/VSTEP;if(x>=NT-1)return a[NT-1];const i=x|0;return a[i]+(a[i+1]-a[i])*(x-i);}

export function makeScratch(N){const f=()=>new Float64Array(N);return {px:f(),py:f(),ds:f(),dh:f(),k:f(),vc:f(),dvc:f(),vf:f(),vb:f(),v:f(),
  ff:f(),fb:f(),fm:f(),wy:f(),dvy:f(),dk:f(),yc:f(),sh:new Uint8Array(N),gv:f(),gf:f(),gb:f(),gk:f(),gds:f(),gx:f(),gy:f(),i0:0,
  t0:new Float64Array(2),t1:new Float64Array(2),t2:new Float64Array(3),t3:new Float64Array(2), // vCorner/tab2/gg2 outputs
  tn:new Float64Array(3),tl:new Float64Array(3),tg:new Float64Array(4), // loadAt/tab3/gg3 outputs (hilly stations)
  stall:0,air:0,ntop:0};} // after lapEval: stations at the 0.1 m/s floor; pass steps read airborne (n <= 0) / above the load grid

// GGV lookup: value and partials (per m/s, per unit q) at speed v and lateral fraction q.
export function gg2(t,v,q,out){let x=v/VSTEP,ii=x|0;const top=NT-2;if(ii>top){ii=top;x=top+1;}const fx=x-ii;
  let qq=q<0?0:q,dq=1;if(qq>=1){qq=1;dq=0;}let y=qq*(NQ-1),qi=y|0;if(qi>NQ-2)qi=NQ-2;const fy=y-qi;
  const a=t[ii*NQ+qi],b=t[ii*NQ+qi+1],c=t[(ii+1)*NQ+qi],d=t[(ii+1)*NQ+qi+1];
  out[0]=a+(c-a)*fx+(b-a)*fy+(a-b-c+d)*fx*fy;out[1]=((c-a)+(a-b-c+d)*fy)/VSTEP;out[2]=dq*((b-a)+(a-b-c+d)*fx)*(NQ-1);}
// Interpolated table value and slope (per m/s) at speed v.
export function tab2(a,v,out){let x=v/VSTEP,ii=x|0;const top=NT-2;if(ii>top){ii=top;x=top+1;}const s=a[ii+1]-a[ii];out[0]=a[ii]+s*(x-ii);out[1]=s/VSTEP;}

// ---- elevation (hilly stations only; a flat station never reaches these)
// Load factor at speed v on a station with cos-grade c and vertical curvature kvz: n = c + v²·kvz/g, clamped to the
// load tables' range [nf, (NL−1)·NSTEP], nf = car.load.nf <= 0 the car's floor (both axles unloaded: no grip at all).
// Writes n, dn/dv (0 where clamped) and the clamp (−1: airborne, at or below the floor; +1: above the grid; 0: neither)
// into out, returns n.
const NTOP=(NL-1)*NSTEP;
export function loadAt(c,kvz,v,out,nf=0){const n=c+v*v*kvz/G;if(n<=nf){out[1]=0;out[2]=-1;return out[0]=nf;}if(n>=NTOP){out[1]=0;out[2]=1;return out[0]=NTOP;}out[1]=2*v*kvz/G;out[2]=0;return out[0]=n;}
// Level l and fraction of load factor n on the grid (n already in range).
function nLevel(n){let y=n/NSTEP,l=Math.floor(y);if(l>NL-2)l=NL-2;return l;} // floor: levels go below 0
// kcrit-style load table Kt (levels from l0, ×NT) at speed node ii, at the load the station gives at that node's speed.
function kN(Kt,ii,c,kvz,l0){const v=ii*VSTEP,nf=l0*NSTEP;let n=c+v*v*kvz/G;n=n<nf?nf:n>NTOP?NTOP:n;const l=nLevel(n),f=n/NSTEP-l,o=(l-l0)*NT+ii,a=Kt[o];return a+(Kt[o+NT]-a)*f;}
// Corner speed on a hilly station: vCorner's search on Kt (load.kcrit, kcF or kcR) where every speed node is read at
// the load the station gives at that speed (crests unload faster cars more). The linear interpolant between nodes is
// the model, so out[1] = dv/d|k| is its exact slope. The search stops at the node above top speed (the result is capped
// at vTop anyway, and the tables reach their floor only up to there): with K never rising with speed the bracket around
// the crossing is unique, so this is the full search's answer.
export function vCornerN(car,k,Kt,c,kvz,out){
  const l0=car.load.l0,top=Math.floor(car.vTop/VSTEP)+1;
  k=k<0?-k:k;out[1]=0;
  if(k<1e-7)return out[0]=car.vTop;
  if(kN(Kt,top,c,kvz,l0)>k)return out[0]=car.vTop;
  if(kN(Kt,1,c,kvz,l0)<=k)return out[0]=VSTEP;
  let lo=1,hi=top;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(kN(Kt,mid,c,kvz,l0)>k)lo=mid;else hi=mid;}
  const Kl=kN(Kt,lo,c,kvz,l0),den=Kl-kN(Kt,hi,c,kvz,l0),v=(lo+(Kl-k)/den)*VSTEP;
  if(v>=car.vTop)return out[0]=car.vTop;
  out[1]=-VSTEP/den;return out[0]=v;
}
// Load-table lookups at speed v and load factor n (clamped to the grid, from the car's floor level l0 = car.load.l0): tab3 on an NL×NT table writes value, ∂/∂v,
// ∂/∂n; gg3 on an NL×NT×NQ GGV writes value, ∂/∂v, ∂/∂q, ∂/∂n. Linear in n between levels, as gg2/tab2 elsewhere.
// (the load-grid lookup is written out in both rather than shared: they run millions of times per search)
export function tab3(t,v,n,out,l0=0){let x=v/VSTEP,ii=x|0;const top=NT-2;if(ii>top){ii=top;x=top+1;}const fx=x-ii;
  let z=n/NSTEP,dn=1/NSTEP;if(z<=l0){z=l0;dn=0;}else if(z>=NL-1){z=NL-1;dn=0;}let l=Math.floor(z);if(l>NL-2)l=NL-2;const fz=z-l;
  const o0=(l-l0)*NT,o1=o0+NT,a0=t[o0+ii],b0=t[o0+ii+1],a1=t[o1+ii],b1=t[o1+ii+1],v0=a0+(b0-a0)*fx,v1=a1+(b1-a1)*fx;
  out[0]=v0+(v1-v0)*fz;out[1]=((b0-a0)+((b1-a1)-(b0-a0))*fz)/VSTEP;out[2]=(v1-v0)*dn;}
export function gg3(t,v,q,n,out,l0=0){let x=v/VSTEP,ii=x|0;const top=NT-2;if(ii>top){ii=top;x=top+1;}const fx=x-ii;
  let qq=q<0?0:q,dq=1;if(qq>=1){qq=1;dq=0;}let y=qq*(NQ-1),qi=y|0;if(qi>NQ-2)qi=NQ-2;const fy=y-qi;
  let z=n/NSTEP,dn=1/NSTEP;if(z<=l0){z=l0;dn=0;}else if(z>=NL-1){z=NL-1;dn=0;}let l=Math.floor(z);if(l>NL-2)l=NL-2;const fz=z-l;
  const o0=(l-l0)*NT*NQ+ii*NQ+qi,o1=o0+NT*NQ;
  const a0=t[o0],b0=t[o0+1],c0=t[o0+NQ],d0=t[o0+NQ+1],a1=t[o1],b1=t[o1+1],c1=t[o1+NQ],d1=t[o1+NQ+1];
  const v0=a0+(c0-a0)*fx+(b0-a0)*fy+(a0-b0-c0+d0)*fx*fy,v1=a1+(c1-a1)*fx+(b1-a1)*fy+(a1-b1-c1+d1)*fx*fy;
  const gv0=((c0-a0)+(a0-b0-c0+d0)*fy)/VSTEP,gv1=((c1-a1)+(a1-b1-c1+d1)*fy)/VSTEP;
  const gq0=dq*((b0-a0)+(a0-b0-c0+d0)*fx)*(NQ-1),gq1=dq*((b1-a1)+(a1-b1-c1+d1)*fx)*(NQ-1);
  out[0]=v0+(v1-v0)*fz;out[1]=gv0+(gv1-gv0)*fz;out[2]=gq0+(gq1-gq0)*fz;out[3]=(v1-v0)*dn;}

// tau>0 replaces each hard min() with a soft-min of width tau (m/s) so the lap time is smooth for the gradient solver.
export function smin(a,b,tau,W,i){if(tau<=0){if(a<b){W[i]=1;return a;}W[i]=0;return b;}const d=(a-b)/tau;if(d>30){W[i]=0;return b;}if(d<-30){W[i]=1;return a;}const e=Math.exp(-Math.abs(d)),w=a<b?1/(1+e):e/(1+e);W[i]=w;return Math.min(a,b)-tau*Math.log1p(e);}
// Quasi-steady-state lap. Returns lap time; fills S. If grad is given, also writes dT/d(offset) into it.
// lim (optional, no gradient): {cap, bs, ts} per-station speed ceiling and braking/traction scale, used by the
// dynamic check to ease off in specific places.
// Elevation (T.flat false; needs car.load): steps are 3D (ds; curvature keeps the horizontal step dh), gravity does
// work m·g·dz over each step, and a station's grip limits are read at its load factor n = cth + v²·kv/g. A step uses
// its own start station's grade and load. Flat stations run exactly the flat code.
export function lapEval(T,car,off,S,grad,tau,lim){
  const cap=lim&&lim.cap,bs=lim&&lim.bs,ts=lim&&lim.ts,t0=S.t0,_t1=S.t1,_t2=S.t2,_t3=S.t3,tn=S.tn,tl=S.tl,tg=S.tg;
  tau=tau||0;
  const N=T.N,cx=T.cx,cy=T.cy,nx=T.nx,ny=T.ny,px=S.px,py=S.py,ds=S.ds,dh=S.dh,k=S.k,vc=S.vc,dvc=S.dvc,vf=S.vf,vb=S.vb,v=S.v;
  const flat=T.flat,dz=T.dz,cth=T.cth,kv=T.kv,L=car.load;
  if(!flat&&!L)throw new Error('lapEval: a hilly circuit needs a car built with {loads: true}');
  const level=i=>flat||(cth[i]===1&&kv[i]===0),still=i=>flat||(cth[i]===1&&kv[i]===0&&dz[i]===0); // n ≡ 1 / and no rise either
  for(let i=0;i<N;i++){px[i]=cx[i]+nx[i]*off[i];py[i]=cy[i]+ny[i]*off[i];}
  for(let i=0;i<N;i++){const j=i+1===N?0:i+1,dx=px[j]-px[i],dy=py[j]-py[i];dh[i]=Math.sqrt(dx*dx+dy*dy);ds[i]=flat?dh[i]:Math.sqrt(dx*dx+dy*dy+dz[i]*dz[i]);}
  let i0=0,vmin=1e9;
  for(let i=0;i<N;i++){
    const a=i===0?N-1:i-1,b=i+1===N?0:i+1;
    const d1x=px[i]-px[a],d1y=py[i]-py[a],d2x=px[b]-px[i],d2y=py[b]-py[i],cr=d1x*d2y-d1y*d2x;
    const ex=px[b]-px[a],ey=py[b]-py[a],den=dh[a]*dh[i]*Math.sqrt(ex*ex+ey*ey);
    k[i]=den>1e-9?2*cr/den:0;
  }
  const lF=car.lF,lR=car.lR,wy=S.wy,dvy=S.dvy,dkA=S.dk,yc=S.yc;
  for(let i=0;i<N;i++){
    const a=i===0?N-1:i-1,b=i+1===N?0:i+1,ak=k[i]<0?-k[i]:k[i],lv=level(i);
    const v0=lv?vCorner(car,ak,null,t0):vCornerN(car,ak,L.kcrit,cth[i],kv[i],t0),d0=t0[1];
    // rate of change of |k| along the line; >0 tightening (front-limited), <0 unwinding (rear-limited)
    const dk=((k[b]<0?-k[b]:k[b])-(k[a]<0?-k[a]:k[a]))/(ds[a]+ds[i]);dkA[i]=dk;
    const c=dk>0?lF:-lR,ke=ak+c*dk,v1=lv?vCorner(car,ke,dk>0?car.kcF:car.kcR,t0):vCornerN(car,ke,dk>0?L.kcF:L.kcR,cth[i],kv[i],t0),d1=t0[1];yc[i]=c;
    let vv=smin(v0,v1,tau,wy,i);if(cap&&cap[i]<vv)vv=cap[i];vc[i]=vv;dvc[i]=d0;dvy[i]=d1;
    if(vv<vmin){vmin=vv;i0=i;}
  }
  S.i0=i0;
  const ggB=car.ggB,ggT=car.ggT,shT=car.shiftT,gearT=car.gear,m=car.m,drv=car.drv,kd=0.5*RHO*car.cda/m,rr=G*CRR,alat=car.alat,trc=car.trc,brk=car.brk,inv=1/VSTEP,top=NT-2;
  vf[i0]=vc[i0];let curG=gearT[Math.min(NT-1,Math.round(vc[i0]*inv))],air=0,ntop=0,stall=0;
  for(let s=0;s<N-1;s++){
    const i=(i0+s)%N,j=i+1===N?0:i+1,u=vf[i];
    let x=u*inv,ii=x|0;if(ii>top){ii=top;x=top+1;}const f=x-ii;
    // each step must respect the more heavily loaded of its two ends
    const ki=k[i]<0?-k[i]:k[i],kj=k[j]<0?-k[j]:k[j],st=still(i);
    let grip;
    if(st){const al=alat[ii]+(alat[ii+1]-alat[ii])*f,q=u*u*(ki>kj?ki:kj)/al;gg2(ggT,u,q,_t2);grip=_t2[0];}
    else{ // airborne with no downforce: no lateral limit (al = 0) and no grip, so the lateral fraction q is moot (0)
      const n=loadAt(cth[i],kv[i],u,tn,L.nf);if(tn[2]<0)air++;else if(tn[2]>0)ntop++;
      tab3(L.alat,u,n,tl,L.l0);const al=tl[0],q=al>0?u*u*(ki>kj?ki:kj)/al:0;gg3(L.ggT,u,q,n,tg,L.l0);grip=tg[0];}
    const tr=ts?grip*ts[i]:grip,pw=drv[ii]+(drv[ii+1]-drv[ii])*f,ad=tr<pw?tr:pw;
    let v2=u*u+2*(ad-kd*u*u-rr)*ds[i];
    if(!st)v2-=2*G*dz[i]; // work against gravity over the step
    // upshift: drive is cut for shiftT seconds, losing the work drive would have done (≈ F·u·shiftT)
    S.sh[j]=0;
    if(shT>0&&v2>u*u){const gn=gearT[Math.min(NT-1,Math.round(Math.sqrt(v2)*inv))];if(gn>curG&&curG>0){v2-=2*ad*u*shT;S.sh[j]=1;curG=gn;}}
    const vn=v2>0?Math.sqrt(v2):0;
    vf[j]=smin(vn,vc[j],tau,S.ff,j);
    // free downshifts only when not accelerating, so a shift's own speed loss can't trigger a second shift
    if(shT>0){const gb=gearT[Math.min(NT-1,Math.round(vf[j]*1.05*inv))];if(gb<curG&&vf[j]<=u+1e-9&&!S.sh[j])curG=gb;else if(curG===0)curG=gearT[Math.min(NT-1,Math.round(vf[j]*inv))];}
  }
  vb[i0]=vc[i0];
  for(let s=0;s<N-1;s++){
    const i=(i0-s+N)%N,j=i===0?N-1:i-1,u=vb[i];
    let x=u*inv,ii=x|0;if(ii>top){ii=top;x=top+1;}const f=x-ii;
    const ki=k[i]<0?-k[i]:k[i],kj=k[j]<0?-k[j]:k[j];
    if(still(j)){
      const al=alat[ii]+(alat[ii+1]-alat[ii])*f,q=u*u*(ki>kj?ki:kj)/al;
      gg2(ggB,u,q,_t2);const a=(bs?_t2[0]*bs[j]:_t2[0])+kd*u*u+rr,vn=Math.sqrt(u*u+2*a*ds[j]);
      vb[j]=smin(vn,vc[j],tau,S.fb,j);
    }else{ // braking from j into i: gravity helps uphill (dz[j] > 0)
      const n=loadAt(cth[j],kv[j],u,tn,L.nf);if(tn[2]<0)air++;else if(tn[2]>0)ntop++;
      tab3(L.alat,u,n,tl,L.l0);const al=tl[0],q=al>0?u*u*(ki>kj?ki:kj)/al:0;
      gg3(L.ggB,u,q,n,tg,L.l0);const a=(bs?tg[0]*bs[j]:tg[0])+kd*u*u+rr,v2=u*u+2*a*ds[j]+2*G*dz[j],vn=v2>0?Math.sqrt(v2):0;
      vb[j]=smin(vn,vc[j],tau,S.fb,j);
    }
  }
  for(let i=0;i<N;i++){const r=smin(vf[i],vb[i],tau,S.fm,i);if(r<0.1)stall++;v[i]=Math.max(0.1,r);}
  S.stall=stall;S.air=air;S.ntop=ntop; // reported, not hidden: a floored or airborne lap is not a real lap time
  let t=0;
  for(let i=0;i<N;i++){const j=i+1===N?0:i+1;t+=2*ds[i]/(v[i]+v[j]+1e-9);}
  if(!grad)return t;

  // ---- reverse pass (adjoint)
  const gv=S.gv,gf=S.gf,gb=S.gb,gk=S.gk,gds=S.gds,gx=S.gx,gy=S.gy;
  gv.fill(0);gf.fill(0);gb.fill(0);gk.fill(0);gds.fill(0);gx.fill(0);gy.fill(0);
  const gvc=grad;gvc.fill(0); // reuse grad as dT/dvc scratch first
  for(let i=0;i<N;i++){const j=i+1===N?0:i+1,sv=v[i]+v[j]+1e-9;gds[i]+=2/sv;const g=-2*ds[i]/(sv*sv);gv[i]+=g;gv[j]+=g;}
  for(let i=0;i<N;i++){const w=S.fm[i];gf[i]+=gv[i]*w;gb[i]+=gv[i]*(1-w);}
  const CL=60;
  // backward pass, reversed
  for(let s=N-2;s>=0;s--){
    const i=(i0-s+N)%N,j=i===0?N-1:i-1,w=S.fb[j];
    if(gb[j]===0)continue;
    gvc[j]+=gb[j]*(1-w);const g=gb[j]*w;if(g===0)continue;
    const u=vb[i],ki=k[i]<0?-k[i]:k[i],kj=k[j]<0?-k[j]:k[j],ks=ki>kj?i:j,ak=ki>kj?ki:kj,sg=k[ks]<0?-1:1;
    let B,dBv,dBk,vn;
    if(still(j)){
      tab2(alat,u,_t1);
      const al=_t1[0],dal=_t1[1],q=u*u*ak/al;
      const dqv=2*u*ak/al-u*u*ak*dal/(al*al),dqk=sg*u*u/al;
      gg2(ggB,u,q,_t2);
      B=_t2[0]+kd*u*u+rr;dBv=_t2[1]+_t2[2]*dqv+2*kd*u;dBk=_t2[2]*dqk;
      vn=Math.sqrt(u*u+2*B*ds[j]);
    }else{ // as above, with the load factor's dependence on speed (dn/du) and the gravity term (no offset dependence)
      const n=loadAt(cth[j],kv[j],u,tn,L.nf),dn=tn[1];tab3(L.alat,u,n,tl,L.l0);
      const al=tl[0],dal=tl[1]+tl[2]*dn,up=al>0,q=up?u*u*ak/al:0; // up: not airborne without downforce (q = 0 there, as above)
      const dqv=up?2*u*ak/al-u*u*ak*dal/(al*al):0,dqk=up?sg*u*u/al:0;
      gg3(L.ggB,u,q,n,tg,L.l0);
      B=tg[0]+kd*u*u+rr;dBv=tg[1]+tg[2]*dqv+tg[3]*dn+2*kd*u;dBk=tg[2]*dqk;
      const v2=u*u+2*B*ds[j]+2*G*dz[j];vn=v2>0?Math.sqrt(v2):0;
    }
    if(vn<=1e-9)continue;
    gb[i]+=g*(u+ds[j]*dBv)/vn;gk[ks]+=g*ds[j]*dBk/vn;gds[j]+=g*B/vn;
  }
  gvc[i0]+=gb[i0];
  // forward pass, reversed
  for(let s=N-2;s>=0;s--){
    const i=(i0+s)%N,j=i+1===N?0:i+1,w=S.ff[j];
    if(gf[j]===0)continue;
    gvc[j]+=gf[j]*(1-w);const g=gf[j]*w;if(g===0)continue;
    const u=vf[i],ki=k[i]<0?-k[i]:k[i],kj=k[j]<0?-k[j]:k[j],ks=ki>kj?i:j,ak=ki>kj?ki:kj,sg=k[ks]<0?-1:1,st=still(i);
    let A,dAv,dAk;
    if(st){
      tab2(alat,u,_t1);
      const al=_t1[0],dal=_t1[1],q=u*u*ak/al;
      const dqv=2*u*ak/al-u*u*ak*dal/(al*al),dqk=sg*u*u/al;
      gg2(ggT,u,q,_t2);tab2(drv,u,_t3);const grip=_t2[0],pw=_t3[0];
      if(grip<pw){A=grip;dAv=_t2[1]+_t2[2]*dqv;dAk=_t2[2]*dqk;}else{A=pw;dAv=_t3[1];dAk=0;}
    }else{
      const n=loadAt(cth[i],kv[i],u,tn,L.nf),dn=tn[1];tab3(L.alat,u,n,tl,L.l0);
      const al=tl[0],dal=tl[1]+tl[2]*dn,up=al>0,q=up?u*u*ak/al:0; // up: not airborne without downforce (q = 0 there, as above)
      const dqv=up?2*u*ak/al-u*u*ak*dal/(al*al):0,dqk=up?sg*u*u/al:0;
      gg3(L.ggT,u,q,n,tg,L.l0);tab2(drv,u,_t3);const grip=tg[0],pw=_t3[0];
      if(grip<pw){A=grip;dAv=tg[1]+tg[2]*dqv+tg[3]*dn;dAk=tg[2]*dqk;}else{A=pw;dAv=_t3[1];dAk=0;}
    }
    const ad=A,dadv=dAv,dadk=dAk;
    A+=-kd*u*u-rr;dAv+=-2*kd*u;
    let v2=u*u+2*A*ds[i],xv=0,xk=0;
    if(!st)v2-=2*G*dz[i];
    if(S.sh[j]){v2-=2*ad*u*shT;xv=-shT*(ad+u*dadv);xk=-shT*u*dadk;}
    if(v2<=1e-12)continue;const vn=Math.sqrt(v2);
    gf[i]+=g*(u+ds[i]*dAv+xv)/vn;gk[ks]+=g*(ds[i]*dAk+xk)/vn;gds[i]+=g*A/vn;
  }
  gvc[i0]+=gf[i0];
  for(let i=0;i<N;i++){
    const g=gvc[i];if(g===0)continue;
    const a=i===0?N-1:i-1,b=i+1===N?0:i+1,w=wy[i],sg=x=>x<0?-1:1;
    gk[i]+=g*w*dvc[i]*sg(k[i]);
    const gke=g*(1-w)*dvy[i];if(gke===0)continue;
    gk[i]+=gke*sg(k[i]);
    const den=ds[a]+ds[i],gdk=gke*yc[i];
    gk[b]+=gdk/den*sg(k[b]);gk[a]-=gdk/den*sg(k[a]);
    gds[a]-=gdk*dkA[i]/den;gds[i]-=gdk*dkA[i]/den;
  }
  // curvature -> points (horizontal steps dh)
  for(let i=0;i<N;i++){
    const g=gk[i];if(g===0)continue;
    const a=i===0?N-1:i-1,b=i+1===N?0:i+1;
    const d1x=px[i]-px[a],d1y=py[i]-py[a],d2x=px[b]-px[i],d2y=py[b]-py[i],ex=px[b]-px[a],ey=py[b]-py[a];
    const l1=dh[a],l2=dh[i],le=Math.sqrt(ex*ex+ey*ey),den=l1*l2*le;if(den<=1e-9)continue;
    const kk=k[i],c=2/den;
    // dk/dd1, dk/dd2, dk/de
    const g1x=c*d2y-kk*d1x/(l1*l1),g1y=-c*d2x-kk*d1y/(l1*l1);
    const g2x=-c*d1y-kk*d2x/(l2*l2),g2y=c*d1x-kk*d2y/(l2*l2);
    const gex=-kk*ex/(le*le),gey=-kk*ey/(le*le);
    gx[i]+=g*(g1x-g2x);gy[i]+=g*(g1y-g2y);
    gx[a]+=g*(-g1x-gex);gy[a]+=g*(-g1y-gey);
    gx[b]+=g*(g2x+gex);gy[b]+=g*(g2y+gey);
  }
  // step lengths -> points: d(ds)/d(dx) = dx/ds also for 3D steps (dz doesn't depend on the line)
  for(let i=0;i<N;i++){
    const j=i+1===N?0:i+1,g=gds[i];if(g===0||ds[i]<=1e-12)continue;
    const ux=(px[j]-px[i])/ds[i],uy=(py[j]-py[i])/ds[i];
    gx[j]+=g*ux;gy[j]+=g*uy;gx[i]-=g*ux;gy[i]-=g*uy;
  }
  for(let i=0;i<N;i++)grad[i]=gx[i]*nx[i]+gy[i]*ny[i];
  return t;
}
