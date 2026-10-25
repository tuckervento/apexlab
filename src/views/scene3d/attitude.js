// Cosmetic attitude only; no suspension or tyre physics. Data frame: heading increases toward the driver's
// right, n = (-ty, tx), k > 0 bends right. Steer > 0 turns right; roll > 0 lowers the right side (leans right),
// so positive ay produces negative roll (outside). Pitch > 0 raises the nose; positive ax produces positive pitch.
// Angles are radians, spin is unwrapped forward wheel travel. These are semantic body angles, not Euler axes;
// the car renderer owns their application after the shared frame conversion. Grade is not included in pitch.
import { lapExtremes } from '../../playback/pose.js';

const H=1/240, W=2*Math.PI*1.5, ZETA=0.7;
const ROLL=3*Math.PI/180, PITCH=2*Math.PI/180;
const peak=e=>Math.max(Math.abs(e.min),Math.abs(e.max));

// Caller-owned state. wb and radius are metres; radius is supplied by the cosmetic car model.
export function init(snapshot,{wb,radius}){
  if(!(wb>0&&radius>0))throw new RangeError('attitude needs positive wb and radius');
  const e=lapExtremes(snapshot);
  return {snapshot,wb,radius,ayPeak:peak(e.ay),axPeak:peak(e.ax),roll:0,pitch:0,rollRate:0,pitchRate:0,
    steer:0,spin:0,time:0,ticks:0};
}

// dtAnim is elapsed animation time (wall dt times replay). Zero freezes every field, including steer.
// Optional sample(tAnim) returns a pose on the playback path, relative to init. Supply it for frame/replay
// independent forcing, including trace playback and loops. Without it, the supplied pose is held over this step.
// Springs use fixed animation ticks; spin integrates speed on those same ticks (cosmetic v*dt/r).
export function step(state,p,dtAnim,sample){
  if(!Number.isFinite(dtAnim)||dtAnim<0)throw new RangeError('attitude needs nonnegative finite dtAnim');
  if(dtAnim===0)return state;
  state.time+=dtAnim;
  const end=Math.floor((state.time+1e-10)/H);
  while(state.ticks<end){
    const q=sample?sample((state.ticks+0.5)*H):p;
    const roll=state.ayPeak?-ROLL*q.ay/state.ayPeak:0;
    const pitch=state.axPeak?PITCH*q.ax/state.axPeak:0;
    // Cosmetic spring-damper, semi-implicit Euler at 240 Hz.
    state.rollRate+=(W*W*(roll-state.roll)-2*ZETA*W*state.rollRate)*H;
    state.pitchRate+=(W*W*(pitch-state.pitch)-2*ZETA*W*state.pitchRate)*H;
    state.roll+=state.rollRate*H;state.pitch+=state.pitchRate*H;
    // Cosmetic rolling radius; no wheel-slip model.
    state.spin+=q.speed*H/state.radius;
    state.ticks++;
  }
  // Cosmetic kinematic steer ignores slip. A trace's measured steer (including zero) takes precedence.
  const d=state.snapshot,i=p.station,j=(i+1)%d.k.length,f=p.frac??0;
  state.steer=p.steer??Math.atan(state.wb*(d.k[i]+(d.k[j]-d.k[i])*f));
  return state;
}

export function view(state){
  return {roll:state.roll,pitch:state.pitch,steer:state.steer,spin:state.spin};
}
