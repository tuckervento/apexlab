import { dataToThree } from '../frame.js';

const LIMIT=Math.PI/2-0.01;
export function init(input){
  const p=input.car??{x:0,y:0,z:0,heading:0},v=input.view;
  const position=v?[...v.position]:dataToThree(p.x-8*Math.cos(p.heading),p.y-8*Math.sin(p.heading),p.z+3);
  const target=v?v.target:dataToThree(p.x,p.y,p.z+1),d=target.map((n,i)=>n-position[i]);
  return {position,yaw:Math.atan2(d[2],d[0]),pitch:Math.max(-LIMIT,Math.min(LIMIT,Math.atan2(d[1],Math.hypot(d[0],d[2])))),fovDeg:v?.fovDeg??60};
}
export function look(s,dx,dy){s.yaw+=dx*0.005;s.pitch=Math.max(-LIMIT,Math.min(LIMIT,s.pitch-dy*0.005));return s;}
export function move(s,forward=0,right=0,up=0){
  const c=Math.cos(s.pitch),n=Math.sin(s.pitch),y=s.yaw;
  s.position[0]+=forward*c*Math.cos(y)-right*Math.sin(y);
  s.position[1]+=forward*n+up;
  s.position[2]+=forward*c*Math.sin(y)+right*Math.cos(y);return s;
}
// Movement events are distance impulses, independent of replay and frame cadence.
export function step(s,input,dtAnim){return s;}
export function view(s){const c=Math.cos(s.pitch);return {position:[...s.position],target:[s.position[0]+c*Math.cos(s.yaw),s.position[1]+Math.sin(s.pitch),s.position[2]+c*Math.sin(s.yaw)],up:[0,1,0],fovDeg:s.fovDeg,near:0.1,far:10000};}
