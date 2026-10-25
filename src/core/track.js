// Moved verbatim from prototype/apex-lab.html (migration step 2); makeBounds takes the car (step 3).
import { mulberry32 } from './rng.js';

export function curv3(ax,ay,bx,by,cx,cy){
  const d1x=bx-ax,d1y=by-ay,d2x=cx-bx,d2y=cy-by,cr=d1x*d2y-d1y*d2x,den=Math.hypot(d1x,d1y)*Math.hypot(d2x,d2y)*Math.hypot(cx-ax,cy-ay);
  return den>1e-9?2*cr/den:0;
}

export function buildTrack(ctrl,width){
  // dense enough that straight-line resampling leaves negligible curvature noise (sub-0.3 m spacing)
  const n=ctrl.length,dense=[];let SUB=40;{let per=0;for(let i=0;i<n;i++){const p1=ctrl[i],p2=ctrl[(i+1)%n];per+=Math.hypot(p2[0]-p1[0],p2[1]-p1[1]);}SUB=Math.max(40,Math.min(600,Math.ceil(per/n/0.25)));}
  // Periodic C² cubic spline through the control points (chord-length knots): curvature is continuous,
  // so lines laid on top of the centreline don't inherit curvature steps at the control points.
  const h=new Float64Array(n);for(let i=0;i<n;i++){const p1=ctrl[i],p2=ctrl[(i+1)%n];h[i]=Math.max(1e-3,Math.hypot(p2[0]-p1[0],p2[1]-p1[1]));}
  // height (ctrl[i][2], 0 when absent) is splined the same way, with the same plan-view knots
  const zc=ctrl.map(p=>p.length>2?p[2]:0);
  const Mx=new Float64Array(n),My=new Float64Array(n),Mz=new Float64Array(n),rx=new Float64Array(n),ry=new Float64Array(n),rz=new Float64Array(n);
  for(let i=0;i<n;i++){const ip=(i-1+n)%n,inx=(i+1)%n;
    rx[i]=6*((ctrl[inx][0]-ctrl[i][0])/h[i]-(ctrl[i][0]-ctrl[ip][0])/h[ip]);ry[i]=6*((ctrl[inx][1]-ctrl[i][1])/h[i]-(ctrl[i][1]-ctrl[ip][1])/h[ip]);
    rz[i]=6*((zc[inx]-zc[i])/h[i]-(zc[i]-zc[ip])/h[ip]);}
  for(let it=0;it<400;it++)for(let i=0;i<n;i++){const ip=(i-1+n)%n,inx=(i+1)%n,d=2*(h[ip]+h[i]);
    Mx[i]=(rx[i]-h[ip]*Mx[ip]-h[i]*Mx[inx])/d;My[i]=(ry[i]-h[ip]*My[ip]-h[i]*My[inx])/d;Mz[i]=(rz[i]-h[ip]*Mz[ip]-h[i]*Mz[inx])/d;}
  for(let i=0;i<n;i++){const j=(i+1)%n,hi=h[i],p1=ctrl[i],p2=ctrl[j];
    for(let s=0;s<SUB;s++){const t=s/SUB*hi,A=(hi-t)/hi,Bq=t/hi,cA=((A*A*A-A)*hi*hi)/6,cB=((Bq*Bq*Bq-Bq)*hi*hi)/6;
      dense.push([A*p1[0]+Bq*p2[0]+cA*Mx[i]+cB*Mx[j],A*p1[1]+Bq*p2[1]+cA*My[i]+cB*My[j],A*zc[i]+Bq*zc[j]+cA*Mz[i]+cB*Mz[j]]);}}
  const m=dense.length,cum=new Float64Array(m+1);
  for(let i=0;i<m;i++){const a=dense[i],b=dense[(i+1)%m];cum[i+1]=cum[i]+Math.hypot(b[0]-a[0],b[1]-a[1]);}
  const L=cum[m],N=Math.max(240,Math.min(1600,Math.round(L/4))),ds=L/N;
  // Not L > 0: identical control points still give L ~ 1e-13 m from rounding in the spline, and a NaN lap
  if(!(L>=width))throw new Error(`buildTrack: the circuit is shorter than the track is wide (${L} m < ${width} m): are the control points all in one place?`);
  const cx=new Float64Array(N),cy=new Float64Array(N),cz=new Float64Array(N),nx=new Float64Array(N),ny=new Float64Array(N),kc=new Float64Array(N);
  let j=0;
  for(let i=0;i<N;i++){const s=i*ds;while(j<m-1&&cum[j+1]<s)j++;const seg=cum[j+1]-cum[j]||1,t=(s-cum[j])/seg,a=dense[j],b=dense[(j+1)%m];cx[i]=a[0]+(b[0]-a[0])*t;cy[i]=a[1]+(b[1]-a[1])*t;cz[i]=a[2]+(b[2]-a[2])*t;}
  for(let i=0;i<N;i++){const a=(i-1+N)%N,b=(i+1)%N,tx=cx[b]-cx[a],ty=cy[b]-cy[a],l=Math.hypot(tx,ty)||1;nx[i]=-ty/l;ny[i]=tx/l;kc[i]=curv3(cx[a],cy[a],cx[i],cy[i],cx[b],cy[b]);}
  const ks=new Float64Array(N);let minR=Infinity;
  for(let i=0;i<N;i++){let s=0;for(let d=-2;d<=2;d++)s+=kc[(i+d+N)%N];ks[i]=s/5;const r=1/Math.max(1e-9,Math.abs(ks[i]));if(r<minR)minR=r;}
  let issue=null;
  if(minR<width/2+1)issue='A corner is tighter than the track is wide';
  const stride=Math.max(1,Math.round(8/ds)),gap=Math.ceil(Math.max(width*4,80)/ds),need=width+5;
  outer:for(let a=0;a<N;a+=stride)for(let b=a+gap;b<N;b+=stride){if(N-(b-a)<gap)continue;if(Math.hypot(cx[a]-cx[b],cy[a]-cy[b])<need){issue='The track overlaps itself here';break outer;}}
  // Elevation per station, from the centreline (no banking: height doesn't vary across the track, so these hold for
  // every line). dz: rise to the next station; cth: cos of the grade (horizontal step over 3D step); kv: vertical
  // curvature d²z/ds² (> 0 compression, < 0 crest), smoothed like kc. Exactly 0, 1 and 0 when flat.
  if(zc.every(z=>z===zc[0]))cz.fill(zc[0]); // one height everywhere is level ground: no spline rounding noise in dz
  const dz=new Float64Array(N),cth=new Float64Array(N),kr=new Float64Array(N),kv=new Float64Array(N);
  for(let i=0;i<N;i++){const j=(i+1)%N;dz[i]=cz[j]-cz[i];cth[i]=ds/Math.sqrt(ds*ds+dz[i]*dz[i]);}
  for(let i=0;i<N;i++)kr[i]=(dz[i]-dz[(i-1+N)%N])/(ds*ds);
  for(let i=0;i<N;i++){let s=0;for(let d=-2;d<=2;d++)s+=kr[(i+d+N)%N];kv[i]=s/5;}
  const flat=dz.every(x=>x===0);
  if(!issue&&!flat)issue=hillIssue({N,ds,dz,kv});
  return {N,L,ds,cx,cy,nx,ny,kc:ks,width,issue,minR,ctrl:ctrl.map(p=>p.slice()),z:cz,dz,cth,kv,flat};
}
// Hills past what the lap model is built for (elevation review E-M2): grade and vertical curvature come from the
// centreline, lateral demand ignores the slope and the load tables clamp (ARCHITECTURE §4.7), so laps there aren't
// real. Generated hills stay within 15 % and 400 m; hand-edited heights can reach 280 % and 9 m. null if within both.
export const HILL_LIMITS=Object.freeze({grade:0.25,radius:50}); // grade: rise over plan distance; radius: m
export function hillIssue(T){
  let g=0,k=0;for(let i=0;i<T.N;i++){g=Math.max(g,Math.abs(T.dz[i])/T.ds);k=Math.max(k,Math.abs(T.kv[i]));}
  const parts=[];
  if(g>HILL_LIMITS.grade)parts.push(`a ${Math.round(100*g)}% grade`);
  if(k*HILL_LIMITS.radius>1)parts.push(`a ${Math.round(1/k)} m crest or dip`);
  return parts.length?`Steeper hills than the model is built for (${parts.join(' and ')}; it handles up to ${100*HILL_LIMITS.grade}% and ${HILL_LIMITS.radius} m)`:null;
}

// Unit height profile for a circuit's control points: smooth around the loop (three harmonics of the distance along
// it, so neighbouring points close together in plan get close heights), from its own random stream so the plan shape
// from genCtrl is untouched. Scaled so the lowest and highest points are 1 apart, centred on 0: multiply by the height
// range in metres (the app's Hills).
export function genElev(seed,ctrl){
  const rnd=mulberry32(seed*104729+71),n=ctrl.length,s=[0];
  for(let i=0;i<n;i++){const p=ctrl[i],q=ctrl[(i+1)%n];s.push(s[i]+Math.hypot(q[0]-p[0],q[1]-p[1]));}
  const L=s[n],amp=[1,0.3+0.5*rnd(),0.35*rnd()],ph=amp.map(()=>rnd()*Math.PI*2);
  const u=ctrl.map((_,i)=>{let v=0;for(let k=0;k<3;k++)v+=amp[k]*Math.sin(2*Math.PI*(k+1)*s[i]/L+ph[k]);return v;});
  const lo=Math.min(...u),hi=Math.max(...u);
  return u.map(x=>(x-(lo+hi)/2)/(hi-lo));
}

export function genCtrl(seed,width){
  const rnd=mulberry32(seed*7919+13);
  for(let attempt=0;attempt<200;attempt++){
    const n=9+Math.floor(rnd()*7),R=340+rnd()*120,aspect=1+rnd()*0.7,rot=rnd()*Math.PI*2,pts=[];
    for(let i=0;i<n;i++){const ang=(i+(rnd()-0.5)*0.55)/n*Math.PI*2;let r=R*(0.5+0.5*rnd());if(rnd()<0.22)r=R*(0.28+0.18*rnd());const x=Math.cos(ang)*r*aspect,y=Math.sin(ang)*r;pts.push([x*Math.cos(rot)-y*Math.sin(rot),x*Math.sin(rot)+y*Math.cos(rot)]);}
    const T=buildTrack(pts,Math.max(width,14));
    if(!T.issue&&T.minR>14)return pts;
  }
  return [[-400,-200],[400,-200],[400,200],[-400,200]];
}

export function makeBounds(T,car){
  const N=T.N,hw=Math.max(0.5,T.width/2-(car.spec.track+0.25)/2),lo=new Float64Array(N),hi=new Float64Array(N);
  for(let i=0;i<N;i++){let l=-hw,h=hw;const k=T.kc[i];if(k>1e-6)h=Math.min(h,0.8/k);else if(k<-1e-6)l=Math.max(l,0.8/k);if(l>h){l=h=0;}lo[i]=l;hi[i]=h;}
  return {lo,hi,hw};
}
