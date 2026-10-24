// Playback (ARCHITECTURE.md §10.2): the car's pose at time t along a lap snapshot (lap-model speeds: the racing line,
// ghosts) or a dynamic-check trace (dynLap with keepTrace: true yaw, steering and slip), and the race clock for ghosts.
// Pure, no DOM. Pose: station, s (m along the line, or travelled for a trace), x, y, z (0: flat world), heading
// (rad, screen frame), speed (m/s), ax (longitudinal) and ay (lateral, signed like curvature) in m/s²; with info
// (describeCar) also gear and rpm (fraction of redline, from the best-gear table). Traces add steer, slipF, slipR,
// beta (sideslip) and yawRate, and report the gear the driver model was actually in. Lap poses add frac (how far
// through the station segment) and, when the snapshot has telemetry, phys (forces on the car, see stationPose).

// Both cars leave the line together; the quicker one waits at the line for the other, then they go again.
export function raceClock(lapTimes,animT){const cyc=lapTimes.length>1?Math.max(...lapTimes)+1:lapTimes[0];return animT%cyc;}

export function pose(src,t,info){return src.tc?lapPose(src,t,info):tracePose(src,t,info);}

// Lap snapshot {px, py, v, k, ds, tc, t, phys?}: the station segment at time t, then stationPose within it.
function lapPose(d,rt,info){
  const N=d.px.length;
  const t=Math.min(rt,d.t-1e-6);let lo=0,hi=N;while(hi-lo>1){const m=(lo+hi)>>1;if(d.tc[m]<=t)lo=m;else hi=m;}
  return stationPose(d,lo,(t-d.tc[lo])/((d.tc[lo+1]-d.tc[lo])||1),info);
}
// Pose a fraction frac of the way through segment station of a lap snapshot: interpolated within the segment, heading
// and accelerations from it. Lines index the same track stations, so this also samples one lap where another car is
// (car versus ghost at the same place). With d.phys (snapshot telemetry) the pose adds phys, each field interpolated.
export function stationPose(d,lo,f,info){
  const N=d.px.length,j=(lo+1)%N;
  let s=0;for(let i=0;i<lo;i++)s+=d.ds[i];s+=f*d.ds[lo];
  const p={station:lo,frac:f,s,x:d.px[lo]+(d.px[j]-d.px[lo])*f,y:d.py[lo]+(d.py[j]-d.py[lo])*f,z:0,heading:Math.atan2(d.py[j]-d.py[lo],d.px[j]-d.px[lo]),
    speed:d.v[lo]+(d.v[j]-d.v[lo])*f,ax:(d.v[j]*d.v[j]-d.v[lo]*d.v[lo])/(2*d.ds[lo]+1e-9),ay:d.v[lo]*d.v[lo]*d.k[lo]};
  if(d.phys){const ph={};for(const k in d.phys){const a=d.phys[k];ph[k]=a[lo]+(a[j]-a[lo])*f;}p.phys=ph;}
  if(info){const i=at(info,p.speed);p.gear=info.curves.gear[i];p.rpm=info.curves.rpm[i];}
  return p;
}

// Dynamic trace {t[], x[], y[], v[] (=vx), vy[], psi[], r[], delta[], alf[], alr[], ax[], ay[], gear[], st[], s[]}.
function tracePose(tr,rt,info){
  const n=tr.t.length,t=Math.min(Math.max(rt,tr.t[0]),tr.t[n-1]);
  let lo=0,hi=n;while(hi-lo>1){const m=(lo+hi)>>1;if(tr.t[m]<=t)lo=m;else hi=m;}
  const j=Math.min(lo+1,n-1),f=j>lo?(t-tr.t[lo])/(tr.t[j]-tr.t[lo]):0,L=a=>a[lo]+(a[j]-a[lo])*f;
  const vx=L(tr.v),vy=L(tr.vy),dpsi=Math.atan2(Math.sin(tr.psi[j]-tr.psi[lo]),Math.cos(tr.psi[j]-tr.psi[lo])),psi=tr.psi[lo]+dpsi*f;
  const p={station:tr.st[lo],s:L(tr.s),x:L(tr.x),y:L(tr.y),z:0,heading:Math.atan2(Math.sin(psi),Math.cos(psi)),speed:Math.hypot(vx,vy),
    ax:L(tr.ax),ay:L(tr.ay),steer:L(tr.delta),slipF:L(tr.alf),slipR:L(tr.alr),beta:Math.atan2(vy,vx),yawRate:L(tr.r),gear:tr.gear[lo]};
  if(info)p.rpm=info.curves.rpm[at(info,p.speed)];
  return p;
}
const at=(info,v)=>Math.min(info.n-1,Math.round(v/info.vstep));
