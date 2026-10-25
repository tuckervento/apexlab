import { dataToThree } from '../frame.js';
import * as chase from './chase.js';

const H=1/240,HOLD=0.75,GAIN=0.8;
const wrap=(s,N)=>(s%N+N)%N;
// Straight gaps between corner extents >= 200 m get evenly spaced cameras, <= 150 m apart.
// Corner eyes start 22 m beyond the edge, 5 m high; push outward in 1 m steps to clear other arms.
export function placements(T,corners=[]){
  const cameras=[];
  function add(station,sign,corner=null){
    station=wrap(station,T.N);const a=Math.floor(station),b=(a+1)%T.N,u=station-a;
    const at=v=>v[a]*(1-u)+v[b]*u,x=at(T.cx),y=at(T.cy),z=at(T.z);
    let nx=at(T.nx),ny=at(T.ny);const len=Math.hypot(nx,ny);nx/=len;ny/=len;
    let offset=T.width/2+22,px,py;
    for(;;offset++){
      px=x-sign*nx*offset;py=y-sign*ny*offset;
      let clear=true;for(let i=0;i<T.N;i++)if(Math.hypot(px-T.cx[i],py-T.cy[i])<T.width/2+10){clear=false;break;}
      if(clear)break;
    }
    cameras.push({station,corner,sign,x:px,y:py,position:dataToThree(px,py,z+5)});
  }
  for(let i=0;i<corners.length;i++)add(corners[i].apex,corners[i].sign,i);
  if(corners.length){
    const sorted=[...corners].sort((a,b)=>a.s-b.s);
    for(let i=0;i<sorted.length;i++){
      const start=sorted[i].e,length=wrap(sorted[(i+1)%sorted.length].s-start,T.N)*T.ds;
      if(length>=200){const n=Math.ceil(length/150);for(let j=0;j<n;j++)add(start+(j+0.5)*length/n/T.ds,1);}
    }
  }else{const n=Math.max(1,Math.ceil(T.N*T.ds/150));for(let i=0;i<n;i++)add(i*T.N/n,1);}
  return cameras;
}
const fallback={x:0,y:0,z:0,heading:0};
function distance(c,p){return Math.hypot(c.x-p.x,c.y-p.y);}
function nearest(s,p){
  let best=-1,d=Infinity;
  for(let i=0;i<s.cameras.length;i++){
    const c=s.cameras[i],dx=c.x-p.x,dy=c.y-p.y;
    // A 10 m rear allowance keeps a camera beside the car eligible through its apex.
    if(dx*Math.cos(p.heading)+dy*Math.sin(p.heading)<-10)continue;
    const next=distance(c,p);if(next<d){best=i;d=next;}
  }
  if(best<0)for(let i=0;i<s.cameras.length;i++){const next=distance(s.cameras[i],p);if(next<d){best=i;d=next;}}
  return best;
}
function aim(s,p){
  s.target=dataToThree(p.x,p.y,p.z+0.7);
  const d=Math.hypot(...s.cameras[s.active].position.map((x,i)=>x-s.target[i]));
  // A 1.4 m car height occupies 8% of viewport height where the 12–65 degree lens permits it.
  s.fovDeg=Math.max(12,Math.min(65,2*Math.atan(1.4/(2*Math.max(1,d)*0.08))*180/Math.PI));
}
export function init(input){
  const s={cameras:placements(input.T,input.corners),active:0,time:0,ticks:0,lastCut:0,chase:chase.init(input),replay:input.replay};
  const p=input.car??fallback;s.active=nearest(s,p);aim(s,p);return s;
}
export function step(s,input,dtAnim){
  if(!Number.isFinite(dtAnim)||dtAnim<0)throw new RangeError('tv needs nonnegative finite dtAnim');
  chase.step(s.chase,input,dtAnim);s.replay=input.replay;
  if(dtAnim===0)return s;
  s.time+=dtAnim;const end=Math.floor((s.time+1e-10)/H);
  while(s.ticks<end){
    const t=(s.ticks+0.5)*H,p=(input.sample?input.sample(t):input.car)??fallback,best=nearest(s,p);
    // Cut only after 0.75 animation seconds and a 20% distance improvement, or when the old eye is behind.
    const c=s.cameras[s.active],behind=(c.x-p.x)*Math.cos(p.heading)+(c.y-p.y)*Math.sin(p.heading)<-10;
    if(best!==s.active&&t-s.lastCut>=HOLD&&(behind||distance(s.cameras[best],p)<GAIN*distance(c,p))){s.active=best;s.lastCut=t;}
    s.ticks++;
  }
  aim(s,(input.sample?input.sample(s.time):input.car)??fallback);return s;
}
export function view(s){
  if(s.replay>4)return chase.view(s.chase);
  return {position:[...s.cameras[s.active].position],target:[...s.target],up:[0,1,0],fovDeg:s.fovDeg,near:0.5,far:10000};
}
