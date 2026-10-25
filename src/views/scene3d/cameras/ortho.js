import { Camera } from '../../map2d/camera.js';
import { dataToThree } from '../frame.js';

// Canvas dimensions are CSS pixels, needed for the map's asymmetric phone padding.
export function init({T,aspect=4/3,width=800,height=width/aspect,tilt=0,follow=false}){
  const map=new Camera();map.cw=width;map.ch=height;map.fit(T,T.width);
  let radius=1;for(let i=0;i<T.N;i++)radius=Math.max(radius,Math.hypot(T.cx[i]-map.x,T.cy[i]-map.y,T.z[i]));
  return {map,target:dataToThree(map.x,map.y,0),halfHeight:height/(2*map.z),tilt:Math.max(0,Math.min(60,tilt)),follow,radius,zMax:map.z};
}
export function step(s,input,dtAnim){
  if(input.width>0&&input.height>0){s.map.cw=input.width;s.map.ch=input.height;}
  if(s.follow&&input.car){
    s.map.frame(input.ghost?[input.car,input.ghost]:[input.car],s.zMax,40);
    s.target=dataToThree(s.map.x,s.map.y,0);s.halfHeight=s.map.ch/(2*s.map.z);
  }
  return s;
}
export function zoom(s,f){
  if(!(Number.isFinite(f)&&f>0))throw new RangeError('ortho zoom needs a positive finite factor');
  s.halfHeight=Math.max(s.radius*0.001,Math.min(s.radius*1e6,s.halfHeight*f));s.zMax=s.map.ch/(2*s.halfHeight);return s;
}
export function view(s){
  const t=Math.max(0,Math.min(60,s.tilt))*Math.PI/180,c=Math.cos(t),n=Math.sin(t),d=3*s.radius+10;
  const back=dataToThree(0,n,c),up=dataToThree(0,-c,n);
  return {position:s.target.map((v,k)=>v+d*back[k]),target:[...s.target],up,near:0.1,far:d+2*s.radius+10,ortho:{halfHeight:s.halfHeight}};
}
