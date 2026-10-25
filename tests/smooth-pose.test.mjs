import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';

const core = await loadCore();
const angle = a => Math.atan2(Math.sin(a), Math.cos(a));
const close = (a,b,label) => assert.ok(Math.abs(a-b) <= 1e-9, `${label}: ${a} vs ${b}`);

function snapshots(car = 'GT racer', track = core.TRACKS[0]) {
  const ev = [], s = new core.Solver(e => ev.push(e));
  s.handle({ type: 'setCar', rev: 1, params: { ...core.CARS[car] } });
  s.handle({ type: 'setTrack', rev: 2, ctrl: core.genCtrl(track.seed, 12), width: 12, keepLine: false });
  s.handle({ type: 'run' });
  for (let k = 0; k < 40; k++) s.tick(25);
  const info = ev.find(e => e.type === 'carInfo').info, T = s.T;
  const snaps = ev.filter(e => e.type === 'snapshot').map(m => ({ ...m.line, t: m.lap, vmin: m.vmin, vmax: m.vmax }));
  return { T, info, snaps: [snaps[0], snaps[Math.floor(snaps.length / 2)], snaps.at(-1)] };
}
const LAPS = [snapshots('GT racer'), snapshots('Kart', core.TRACKS[2])];

test('smoothPose: station positions and lap fields match pose', () => {
  for (const { info, snaps } of LAPS) for (const d of snaps) {
    for (let i = 0; i < d.px.length; i++) {
      const p = core.pose(d,d.tc[i],info), q = core.smoothPose(d,d.tc[i],info);
      for (const k of ['x','y','z','s','station','speed']) close(q[k],p[k],`station ${i} ${k}`);
    }
    for (let n = 0; n <= 200; n++) {
      const t = d.t*n/200, p = core.pose(d,t,info), q = core.smoothPose(d,t,info);
      for (const k of Object.keys(p)) if (!['x','y','z','heading','grade'].includes(k)) assert.deepEqual(q[k],p[k],k);
      close(Math.hypot(...q.tangent),1,'unit tangent');
      close(q.heading,Math.atan2(q.tangent[1],q.tangent[0]),'heading');
      close(q.pitch,Math.atan(q.grade),'pitch');
    }
    assert.deepEqual(core.smoothPose(d,d.t*1.1),core.smoothPose(d,d.t-1e-6),'lap end clamp');
  }
});

test('smoothPose: heading is continuous at every station including the seam', () => {
  for (const { snaps } of LAPS) for (const d of snaps) for (let i = 0; i < d.px.length; i++) {
    const before = i ? d.tc[i]-1e-7 : d.t-1e-7;
    const a = core.smoothPose(d,before), b = core.smoothPose(d,d.tc[i]+1e-7);
    const jump = Math.abs(angle(b.heading-a.heading));
    assert.ok(jump < 1e-3, `station ${i}: heading jump ${jump}`);
  }
});

test('smoothPose: heading change at 60 Hz is bounded by peak lap yaw rate', t => {
  for (const { snaps } of LAPS) for (const d of snaps) {
    const peak = Math.max(...d.v.map((v,i) => v*Math.abs(d.k[i]))), bound = 1.5*peak/60+1e-3;
    let max = 0;
    for (let n = 0; n/60 < d.t; n++) {
      const a = core.smoothPose(d,n/60), b = core.smoothPose(d,Math.min((n+1)/60,d.t));
      max = Math.max(max,Math.abs(angle(b.heading-a.heading)));
    }
    assert.ok(max <= bound, `60 Hz heading change ${max} exceeds ${bound}`);
    t.diagnostic(`60 Hz max=${max.toFixed(6)} bound=${bound.toFixed(6)} rad`);
  }
});

test('smoothPose: elevation derivative, wrapped tangents and trace rejection', () => {
  const d = {px:[0,4,4,0],py:[0,0,4,4],pz:[0,1,2,1],ds:[5,5,5,5],tc:[0,1,2,3,4],t:4,v:[5,5,5,5],k:[0,0,0,0]};
  const p = core.smoothPose(d,0);
  close(p.tangent[0],Math.SQRT1_2,'wrapped x tangent');
  close(p.tangent[1],-Math.SQRT1_2,'wrapped y tangent');
  for (const t of [0.2,0.7,1.3,2.6,3.4]) {
    const q = core.smoothPose(d,t), a = core.smoothPose(d,t-1e-5), b = core.smoothPose(d,t+1e-5);
    const delta = [b.x-a.x,b.y-a.y,b.z-a.z], len = Math.hypot(...delta);
    delta.forEach((v,i) => close(q.tangent[i],v/len,`derivative ${i}`));
    close(q.grade,q.tangent[2]/Math.hypot(...q.tangent.slice(0,2)),'smoothed grade');
  }
  const flat = {...d}; delete flat.pz;
  assert.equal(core.smoothPose(flat,0.5).z,0);
  assert.equal(core.smoothPose(flat,0.5).pitch,0);
  assert.throws(() => core.smoothPose({t:[0,1]},0),/lap snapshot/);
});
