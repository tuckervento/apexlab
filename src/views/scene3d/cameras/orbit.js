import { stationFrames } from '../frame.js';

const MIN_PITCH=5*Math.PI/180,MAX_PITCH=85*Math.PI/180;
const clampPitch=p=>Math.max(MIN_PITCH,Math.min(MAX_PITCH,p));

// Camera-local right, up and target-to-eye vectors, in the three frame.
function basis(s){
  const c=Math.cos(s.yaw),n=Math.sin(s.yaw),p=Math.sin(s.pitch),q=Math.cos(s.pitch);
  return {right:[c,0,-n],up:[-n*p,q,-c*p],back:[n*q,p,c*q]};
}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

// fovDeg is vertical. Keep projection/extent metadata with the caller-owned pose state.
export function init({T,aspect,fovDeg=50}){
  if(!(Number.isFinite(aspect)&&aspect>0&&fovDeg>0&&fovDeg<180))throw new RangeError('orbit needs positive aspect and FOV in (0,180)');
  const {origin,lateral}=stationFrames(T),points=[];
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<T.N;i++)for(const sign of [-1,1]){
    const p=Array.from({length:3},(_,k)=>origin[3*i+k]+sign*lateral[3*i+k]*T.width/2);
    points.push(p);
    for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
  }
  const s={target:lo.map((v,k)=>(v+hi[k])/2),yaw:0,pitch:Math.PI/4,dist:0,fovDeg,aspect,radius:0};
  const b=basis(s),tan=Math.tan(fovDeg*Math.PI/360);
  for(const p of points){
    const d=p.map((v,k)=>v-s.target[k]),depth=dot(d,b.back);
    s.radius=Math.max(s.radius,Math.hypot(...d));
    s.dist=Math.max(s.dist,depth+Math.abs(dot(d,b.right))/(0.94*tan*aspect),depth+Math.abs(dot(d,b.up))/(0.94*tan));
  }
  s.radius=Math.max(1,s.radius);s.dist=Math.max(s.dist,s.radius*0.01);
  return s;
}

// Free orbit has no animation forcing; step only updates the viewport aspect.
export function step(state,input,dtAnim){
  if(Number.isFinite(input.aspect)&&input.aspect>0)state.aspect=input.aspect;
  return state;
}

export function orbit(state,dyaw,dpitch){
  state.yaw=(state.yaw+dyaw)%(2*Math.PI);state.pitch=clampPitch(state.pitch+dpitch);
  return state;
}

// Positive dx/dy move the target screen-right/up by fractions of the viewport.
export function pan(state,dx,dy){
  const b=basis(state),height=2*state.dist*Math.tan(state.fovDeg*Math.PI/360);
  for(let k=0;k<3;k++)state.target[k]+=height*(dx*state.aspect*b.right[k]+dy*b.up[k]);
  return state;
}

// f > 1 pulls back; positive distance prevents passing through the target.
export function zoom(state,f){
  if(!(Number.isFinite(f)&&f>0))throw new RangeError('orbit zoom needs a positive finite factor');
  state.dist=Math.max(state.radius*0.001,Math.min(state.radius*1e6,state.dist*f));
  return state;
}

export function view(state){
  const {back}=basis(state),near=Math.max(0.01,state.dist-state.radius*1.1);
  return {position:state.target.map((v,k)=>v+state.dist*back[k]),target:[...state.target],up:[0,1,0],
    fovDeg:state.fovDeg,near,far:Math.max(near+1,state.dist+state.radius*1.1)};
}
