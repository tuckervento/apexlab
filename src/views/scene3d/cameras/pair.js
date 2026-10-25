import * as heli from './heli.js';
import { dataToThree } from '../frame.js';

// Fit a sphere enclosing both cars, with 3 m for body extent and a 10% screen border.
// The spring follows separation; the output-only lower bound also handles clock wraps/seeks.
function focus(p,g){
  if(!p||!g)return p;
  const r=Math.hypot(p.x-g.x,p.y-g.y,p.z-g.z)/2;
  return {...p,x:(p.x+g.x)/2,y:(p.y+g.y)/2,z:(p.z+g.z)/2,speed:0,
    cameraDistance:32+r*1.5,cameraHeight:28+r*1.5};
}
function inputs(input){
  return {...input,car:focus(input.car,input.ghost),sample:t=>focus(input.sample?input.sample(t):input.car,
    input.sampleGhost?input.sampleGhost(t):input.ghost)};
}
function points(s,input,t){
  s.car=input.sample?input.sample(t):input.car;
  s.ghost=input.sampleGhost?input.sampleGhost(t):input.ghost;s.aspect=input.aspect??1;
}
export function init(input){
  const s={follow:heli.init(inputs(input))};s.car=input.car;s.ghost=input.ghost;s.aspect=input.aspect??1;return s;
}
export function step(s,input,dtAnim){
  heli.step(s.follow,inputs(input),dtAnim);
  if(dtAnim!==0)points(s,input,s.follow.time);
  return s;
}
export function view(s){
  const v=heli.view(s.follow);
  if(!s.car||!s.ghost)return v;
  let radius=0;
  for(const p of [s.car,s.ghost]){
    const a=dataToThree(p.x,p.y,p.z);
    radius=Math.max(radius,Math.hypot(...a.map((x,i)=>x-v.target[i]))+3);
  }
  const half=Math.atan(Math.tan(v.fovDeg*Math.PI/360)*Math.min(1,s.aspect)*0.9);
  const offset=v.position.map((x,i)=>x-v.target[i]),d=Math.hypot(...offset),fit=radius/Math.sin(half);
  if(d<fit)for(let i=0;i<3;i++)v.position[i]=v.target[i]+offset[i]*fit/d;
  v.position[1]=Math.max(v.position[1],s.car.z+1,s.ghost.z+1);
  return v;
}
