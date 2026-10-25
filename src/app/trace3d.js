import { tagText } from './telemetry.js';
import { smoothPose, traceClock } from '../playback/pose.js';

export const currentTrace=(result,stale)=>!stale&&result?.dyn?.trace?result.dyn:null;
export function tracePoseAt(snapshot,dyn,rt){
  if(!dyn)return null;
  const c=traceClock(snapshot,dyn,rt);
  return c.started&&!c.ended?smoothPose(dyn.trace,c.t):null;
}
export function traceCars(lap,trace,mode,current){
  return {car:current&&mode==='dynamic'?null:lap,trace:current&&mode!=='lap'?trace:null};
}
// Wrap on the lap, not the ghost cycle: the target must precede the failure station on this car's clock.
export function failureReplayTime(snapshot,fail){return ((snapshot.tc[fail.at]-1.5)%snapshot.t+snapshot.t)%snapshot.t;}

export function traceTagPose(lap,trace,mode,current){return current&&mode==='dynamic'?trace:lap;}

export function traceTagText(mode,p,other){return mode==='grip'&&!p.phys?{main:'grip: lap model only'}:tagText(mode,p,other);}
