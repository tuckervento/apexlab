import { dataToThree, yawFromHeading } from '../frame.js';

// Match placeCar + applyAttitude's YZX order, including rotation of the eye offset.
export function init(input){return step({},input,0);}
export function step(s,input,dtAnim){
  const p=input.car??{x:0,y:0,z:0,heading:0},a=input.attitude;
  const y=yawFromHeading(p.heading),z=(p.pitch??0)+(a?.pitch??0),x=-(a?.roll??0);
  const cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z),cx=Math.cos(x),sx=Math.sin(x);
  const rotate=([u,v,w])=>{
    const b=v*cx-w*sx,c=v*sx+w*cx,d=u*cz-b*sz,e=u*sz+b*cz;
    return [d*cy+c*sy,e,-d*sy+c*cy];
  };
  const origin=dataToThree(p.x,p.y,p.z),offset=rotate([0.6,1.1,0]),forward=rotate([1,0,0]);
  s.position=origin.map((v,i)=>v+offset[i]);s.target=s.position.map((v,i)=>v+forward[i]);s.up=rotate([0,1,0]);
  return s;
}
export function view(s){return {position:[...s.position],target:[...s.target],up:[...s.up],fovDeg:60,near:0.1,far:10000};}
