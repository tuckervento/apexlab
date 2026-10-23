// Moved from prototype/apex-lab.html (migration step 2); module-level state removed (step 3).
import { G, RHO, VSTEP, NT, CRR, NQ } from './constants.js';

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

export function makeScratch(N){const f=()=>new Float64Array(N);return {px:f(),py:f(),ds:f(),k:f(),vc:f(),dvc:f(),vf:f(),vb:f(),v:f(),
  ff:f(),fb:f(),fm:f(),wy:f(),dvy:f(),dk:f(),yc:f(),sh:new Uint8Array(N),gv:f(),gf:f(),gb:f(),gk:f(),gds:f(),gx:f(),gy:f(),i0:0,
  t0:new Float64Array(2),t1:new Float64Array(2),t2:new Float64Array(3),t3:new Float64Array(2)};} // t0..t3: vCorner/tab2/gg2 outputs

// GGV lookup: value and partials (per m/s, per unit q) at speed v and lateral fraction q.
export function gg2(t,v,q,out){let x=v/VSTEP,ii=x|0;const top=NT-2;if(ii>top){ii=top;x=top+1;}const fx=x-ii;
  let qq=q<0?0:q,dq=1;if(qq>=1){qq=1;dq=0;}let y=qq*(NQ-1),qi=y|0;if(qi>NQ-2)qi=NQ-2;const fy=y-qi;
  const a=t[ii*NQ+qi],b=t[ii*NQ+qi+1],c=t[(ii+1)*NQ+qi],d=t[(ii+1)*NQ+qi+1];
  out[0]=a+(c-a)*fx+(b-a)*fy+(a-b-c+d)*fx*fy;out[1]=((c-a)+(a-b-c+d)*fy)/VSTEP;out[2]=dq*((b-a)+(a-b-c+d)*fx)*(NQ-1);}
// Interpolated table value and slope (per m/s) at speed v.
export function tab2(a,v,out){let x=v/VSTEP,ii=x|0;const top=NT-2;if(ii>top){ii=top;x=top+1;}const s=a[ii+1]-a[ii];out[0]=a[ii]+s*(x-ii);out[1]=s/VSTEP;}

// tau>0 replaces each hard min() with a soft-min of width tau (m/s) so the lap time is smooth for the gradient solver.
export function smin(a,b,tau,W,i){if(tau<=0){if(a<b){W[i]=1;return a;}W[i]=0;return b;}const d=(a-b)/tau;if(d>30){W[i]=0;return b;}if(d<-30){W[i]=1;return a;}const e=Math.exp(-Math.abs(d)),w=a<b?1/(1+e):e/(1+e);W[i]=w;return Math.min(a,b)-tau*Math.log1p(e);}
// Quasi-steady-state lap. Returns lap time; fills S. If grad is given, also writes dT/d(offset) into it.
// lim (optional, no gradient): {cap, bs, ts} per-station speed ceiling and braking/traction scale, used by the
// dynamic check to ease off in specific places.
export function lapEval(T,car,off,S,grad,tau,lim){
  const cap=lim&&lim.cap,bs=lim&&lim.bs,ts=lim&&lim.ts,t0=S.t0,_t1=S.t1,_t2=S.t2,_t3=S.t3;
  tau=tau||0;
  const N=T.N,cx=T.cx,cy=T.cy,nx=T.nx,ny=T.ny,px=S.px,py=S.py,ds=S.ds,k=S.k,vc=S.vc,dvc=S.dvc,vf=S.vf,vb=S.vb,v=S.v;
  for(let i=0;i<N;i++){px[i]=cx[i]+nx[i]*off[i];py[i]=cy[i]+ny[i]*off[i];}
  for(let i=0;i<N;i++){const j=i+1===N?0:i+1,dx=px[j]-px[i],dy=py[j]-py[i];ds[i]=Math.sqrt(dx*dx+dy*dy);}
  let i0=0,vmin=1e9;
  for(let i=0;i<N;i++){
    const a=i===0?N-1:i-1,b=i+1===N?0:i+1;
    const d1x=px[i]-px[a],d1y=py[i]-py[a],d2x=px[b]-px[i],d2y=py[b]-py[i],cr=d1x*d2y-d1y*d2x;
    const ex=px[b]-px[a],ey=py[b]-py[a],den=ds[a]*ds[i]*Math.sqrt(ex*ex+ey*ey);
    k[i]=den>1e-9?2*cr/den:0;
  }
  const lF=car.lF,lR=car.lR,wy=S.wy,dvy=S.dvy,dkA=S.dk,yc=S.yc;
  for(let i=0;i<N;i++){
    const a=i===0?N-1:i-1,b=i+1===N?0:i+1,ak=k[i]<0?-k[i]:k[i];
    const v0=vCorner(car,ak,null,t0),d0=t0[1];
    // rate of change of |k| along the line; >0 tightening (front-limited), <0 unwinding (rear-limited)
    const dk=((k[b]<0?-k[b]:k[b])-(k[a]<0?-k[a]:k[a]))/(ds[a]+ds[i]);dkA[i]=dk;
    const c=dk>0?lF:-lR,ke=ak+c*dk,v1=vCorner(car,ke,dk>0?car.kcF:car.kcR,t0),d1=t0[1];yc[i]=c;
    let vv=smin(v0,v1,tau,wy,i);if(cap&&cap[i]<vv)vv=cap[i];vc[i]=vv;dvc[i]=d0;dvy[i]=d1;
    if(vv<vmin){vmin=vv;i0=i;}
  }
  S.i0=i0;
  const ggB=car.ggB,ggT=car.ggT,shT=car.shiftT,gearT=car.gear,m=car.m,drv=car.drv,kd=0.5*RHO*car.cda/m,rr=G*CRR,alat=car.alat,trc=car.trc,brk=car.brk,inv=1/VSTEP,top=NT-2;
  vf[i0]=vc[i0];let curG=gearT[Math.min(NT-1,Math.round(vc[i0]*inv))];
  for(let s=0;s<N-1;s++){
    const i=(i0+s)%N,j=i+1===N?0:i+1,u=vf[i];
    let x=u*inv,ii=x|0;if(ii>top){ii=top;x=top+1;}const f=x-ii;
    // each step must respect the more heavily loaded of its two ends
    const ki=k[i]<0?-k[i]:k[i],kj=k[j]<0?-k[j]:k[j];
    const al=alat[ii]+(alat[ii+1]-alat[ii])*f,q=u*u*(ki>kj?ki:kj)/al;
    gg2(ggT,u,q,_t2);const tr=ts?_t2[0]*ts[i]:_t2[0],pw=drv[ii]+(drv[ii+1]-drv[ii])*f,ad=tr<pw?tr:pw;
    let v2=u*u+2*(ad-kd*u*u-rr)*ds[i];
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
    const al=alat[ii]+(alat[ii+1]-alat[ii])*f,q=u*u*(ki>kj?ki:kj)/al;
    gg2(ggB,u,q,_t2);const a=(bs?_t2[0]*bs[j]:_t2[0])+kd*u*u+rr,vn=Math.sqrt(u*u+2*a*ds[j]);
    vb[j]=smin(vn,vc[j],tau,S.fb,j);
  }
  for(let i=0;i<N;i++)v[i]=Math.max(0.1,smin(vf[i],vb[i],tau,S.fm,i));
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
    tab2(alat,u,_t1);
    const al=_t1[0],dal=_t1[1],q=u*u*ak/al;
    const dqv=2*u*ak/al-u*u*ak*dal/(al*al),dqk=sg*u*u/al;
    gg2(ggB,u,q,_t2);
    const B=_t2[0]+kd*u*u+rr,dBv=_t2[1]+_t2[2]*dqv+2*kd*u,dBk=_t2[2]*dqk;
    const vn=Math.sqrt(u*u+2*B*ds[j]);if(vn<=1e-9)continue;
    gb[i]+=g*(u+ds[j]*dBv)/vn;gk[ks]+=g*ds[j]*dBk/vn;gds[j]+=g*B/vn;
  }
  gvc[i0]+=gb[i0];
  // forward pass, reversed
  for(let s=N-2;s>=0;s--){
    const i=(i0+s)%N,j=i+1===N?0:i+1,w=S.ff[j];
    if(gf[j]===0)continue;
    gvc[j]+=gf[j]*(1-w);const g=gf[j]*w;if(g===0)continue;
    const u=vf[i],ki=k[i]<0?-k[i]:k[i],kj=k[j]<0?-k[j]:k[j],ks=ki>kj?i:j,ak=ki>kj?ki:kj,sg=k[ks]<0?-1:1;
    tab2(alat,u,_t1);
    const al=_t1[0],dal=_t1[1],q=u*u*ak/al;
    const dqv=2*u*ak/al-u*u*ak*dal/(al*al),dqk=sg*u*u/al;
    gg2(ggT,u,q,_t2);tab2(drv,u,_t3);const grip=_t2[0],pw=_t3[0];
    let A,dAv,dAk;
    if(grip<pw){A=grip;dAv=_t2[1]+_t2[2]*dqv;dAk=_t2[2]*dqk;}else{A=pw;dAv=_t3[1];dAk=0;}
    const ad=A,dadv=dAv,dadk=dAk;
    A+=-kd*u*u-rr;dAv+=-2*kd*u;
    let v2=u*u+2*A*ds[i],xv=0,xk=0;
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
  // curvature -> points
  for(let i=0;i<N;i++){
    const g=gk[i];if(g===0)continue;
    const a=i===0?N-1:i-1,b=i+1===N?0:i+1;
    const d1x=px[i]-px[a],d1y=py[i]-py[a],d2x=px[b]-px[i],d2y=py[b]-py[i],ex=px[b]-px[a],ey=py[b]-py[a];
    const l1=ds[a],l2=ds[i],le=Math.sqrt(ex*ex+ey*ey),den=l1*l2*le;if(den<=1e-9)continue;
    const kk=k[i],c=2/den;
    // dk/dd1, dk/dd2, dk/de
    const g1x=c*d2y-kk*d1x/(l1*l1),g1y=-c*d2x-kk*d1y/(l1*l1);
    const g2x=-c*d1y-kk*d2x/(l2*l2),g2y=c*d1x-kk*d2y/(l2*l2);
    const gex=-kk*ex/(le*le),gey=-kk*ey/(le*le);
    gx[i]+=g*(g1x-g2x);gy[i]+=g*(g1y-g2y);
    gx[a]+=g*(-g1x-gex);gy[a]+=g*(-g1y-gey);
    gx[b]+=g*(g2x+gex);gy[b]+=g*(g2y+gey);
  }
  for(let i=0;i<N;i++){
    const j=i+1===N?0:i+1,g=gds[i];if(g===0||ds[i]<=1e-12)continue;
    const ux=(px[j]-px[i])/ds[i],uy=(py[j]-py[i])/ds[i];
    gx[j]+=g*ux;gy[j]+=g*uy;gx[i]-=g*ux;gy[i]-=g*uy;
  }
  for(let i=0;i<N;i++)grad[i]=gx[i]*nx[i]+gy[i]*ny[i];
  return t;
}
