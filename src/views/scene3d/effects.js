// Cosmetic camera effects. Fixed animation ticks share the camera's reset and sampler.
// FOV is base + (-5 + 15*v/(300/3.6)), capped at 72 degrees (55/70 for base 60).
import { dataToThree } from './frame.js';

const H=1/240,W=8;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function init(){return {time:0,ticks:0,fov:-5,lateral:0,back:0,fovRate:0,lateralRate:0,backRate:0,shake:0,heading:0,reduced:false};}
function spring(s,key,goal){
  const rate=key+'Rate',d=s[key]-goal,b=s[rate]+W*d,e=Math.exp(-W*H);
  s[key]=goal+(d+b*H)*e;s[rate]=(s[rate]-W*b*H)*e;
}
function road(T,p){
  const i=p.station??0,j=(i+1)%(T?.N||1),f=p.frac??0;
  const at=a=>a?(a[i]+(a[j]-a[i])*f):0;
  const kv=at(T?.kv),v=Math.max(0,p.speed??0);
  // Poses have no lateral offset field: project onto the interpolated centreline normal.
  const offset=T?.nx?Math.abs((p.x-at(T.cx))*at(T.nx)+(p.y-at(T.cy))*at(T.ny)):0;
  const edge=T?.width>0?clamp((offset/(T.width/2)-0.8)/0.2,0,1):0;
  return Math.min(0.12,0.025*Math.abs(kv)*v*v/9.81+0.025*Math.abs((p.phys?.nz??1)-1)+0.0015*Math.max(0,-(p.ax??0))+0.04*edge)*Math.min(1,v/10);
}
// sample(tAnim) is relative to init, dtAnim is already replay-scaled. Zero freezes all state.
export function step(s,p,T,dtAnim,{replay=1,reduced=false,sample}={}){
  if(!Number.isFinite(dtAnim)||dtAnim<0)throw new RangeError('effects needs nonnegative finite dtAnim');
  if(dtAnim===0)return s;
  s.time+=dtAnim;s.reduced=reduced;
  const end=Math.floor((s.time+1e-10)/H);
  while(s.ticks<end){
    const q=(sample?sample((s.ticks+0.5)*H):p)??{};
    spring(s,'fov',clamp(-5+15*Math.max(0,q.speed??0)/(300/3.6),-5,12));
    spring(s,'lateral',clamp(-(q.ay??0)*0.025,-0.5,0.5));
    spring(s,'back',clamp((q.ax??0)*0.035,-0.35,0.5));
    s.shake=road(T,q)/Math.max(1,replay);s.heading=q.heading??0;s.ticks++;
  }
  return s;
}
// Seeded harmonic noise: animation time only, no wall clock or random source.
const noise=(t,seed)=>0.65*Math.sin(t*43+seed)+0.35*Math.sin(t*71+seed*2.17);
// Mutates only the caller's fresh camera view; reduced also overrides a paused state's previous output.
export function apply(s,v,{reduced=s.reduced}={}){
  if(reduced)return v;
  v.fovDeg=Math.min(72,v.fovDeg+s.fov);
  const t=s.ticks*H,h=s.heading,l=s.lateral+s.shake*noise(t,1.73),b=s.back;
  const delta=dataToThree(-Math.sin(h)*l-Math.cos(h)*b,Math.cos(h)*l-Math.sin(h)*b,s.shake*noise(t,4.91));
  for(let i=0;i<3;i++)v.position[i]+=delta[i];
  return v;
}
