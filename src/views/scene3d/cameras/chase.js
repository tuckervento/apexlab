// Chase in animation time, relative to init. Optional input.sample(tAnim) supplies a pose at each
// fixed spring tick (as in attitude.js); otherwise input.car is held over the step. Re-init on seeks
// or track changes. Positions use critically damped springs, yaw takes the shortest wrapped arc.
// Ground is T.z at the pose station (not terrain under the trailing camera), plus a 1 m margin.
import { dataToThree, yawFromHeading } from '../frame.js';

const H=1/240, W=8, DISTANCE=8, HEIGHT=3, MARGIN=1;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

function ground(T,p){return (T?.z?.[p.station]??0)+MARGIN;}
function aim(p){
  const t=p.tangent??[Math.cos(p.heading),Math.sin(p.heading),0];
  return dataToThree(p.x+t[0]*p.speed*0.4,p.y+t[1]*p.speed*0.4,p.z+t[2]*p.speed*0.4);
}
const fallback={x:0,y:0,z:0,heading:0,speed:0,station:0};

export function init(input){
  const p=input.car??fallback,yaw=yawFromHeading(p.heading),position=dataToThree(p.x,p.y,p.z+HEIGHT);
  position[0]-=DISTANCE*Math.cos(yaw);position[2]+=DISTANCE*Math.sin(yaw);
  position[1]=Math.max(position[1],ground(input.T,p));
  return {position,velocity:[0,0,0],yaw,yawRate:0,target:aim(p),time:0,ticks:0};
}

// Exact critically damped update for a constant goal over one fixed tick.
function spring(x,v,goal){
  const d=x-goal,b=v+W*d,e=Math.exp(-W*H);
  return [goal+(d+b*H)*e,(v-W*b*H)*e];
}

export function step(state,input,dtAnim){
  if(!Number.isFinite(dtAnim)||dtAnim<0)throw new RangeError('chase needs nonnegative finite dtAnim');
  if(dtAnim===0)return state;
  state.time+=dtAnim;
  const end=Math.floor((state.time+1e-10)/H);
  while(state.ticks<end){
    const p=(input.sample?input.sample((state.ticks+0.5)*H):input.car)??fallback;
    const goal=state.yaw+wrap(yawFromHeading(p.heading)-state.yaw);
    [state.yaw,state.yawRate]=spring(state.yaw,state.yawRate,goal);
    const desired=dataToThree(p.x,p.y,p.z+HEIGHT);
    desired[0]-=DISTANCE*Math.cos(state.yaw);desired[2]+=DISTANCE*Math.sin(state.yaw);
    for(let i=0;i<3;i++)[state.position[i],state.velocity[i]]=spring(state.position[i],state.velocity[i],desired[i]);
    state.ticks++;
  }
  const p=(input.sample?input.sample(state.time):input.car)??fallback;
  // Output clamp does not feed frame-dependent corrections back into the springs.
  state.target=aim(p);state.floor=ground(input.T,p);
  return state;
}

export function view(state){
  return {position:[state.position[0],Math.max(state.position[1],state.floor??-Infinity),state.position[2]],
    target:[...state.target],up:[0,1,0],fovDeg:60,near:0.5,far:10000};
}
