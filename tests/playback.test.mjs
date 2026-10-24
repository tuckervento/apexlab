// Migration step 7: playback.pose() (ARCHITECTURE.md §10.2) on lap snapshots and dynamic traces, and the race clock.
// The lap pose must reproduce what the map and HUD computed before step 7 (carState, copied below) bit for bit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';
import { SKIDPAD, skidpadSetup } from './golden-util.mjs';

const core = await loadCore(), { G } = core;

// Pre-step-7 carState and raceClock, verbatim from src/views/map2d/map.js (step 6).
function carStateOld(d,T,rt,replay){
  const N=T.N;if(!(replay>0&&d&&d.t>0))return null;
  const t=Math.min(rt,d.t-1e-6);let lo=0,hi=N;while(hi-lo>1){const m=(lo+hi)>>1;if(d.tc[m]<=t)lo=m;else hi=m;}
  const j=(lo+1)%N,f=(t-d.tc[lo])/((d.tc[lo+1]-d.tc[lo])||1);
  return {i:lo,x:d.px[lo]+(d.px[j]-d.px[lo])*f,y:d.py[lo]+(d.py[j]-d.py[lo])*f,ang:Math.atan2(d.py[j]-d.py[lo],d.px[j]-d.px[lo]),
    v:d.v[lo]+(d.v[j]-d.v[lo])*f,glat:d.v[lo]*d.v[lo]*Math.abs(d.k[lo])/G,glong:(d.v[j]*d.v[j]-d.v[lo]*d.v[lo])/(2*d.ds[lo]+1e-9)/G};
}
function raceClockOld(disp,ghost,animT){const cyc=ghost?Math.max(disp.t,ghost.t)+1:disp.t;return animT%cyc;}

// Snapshots the way the app receives them: centreline, and lines part-way through the search.
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
// query times: 0, every station boundary tc[i] exactly, random times, and past the lap end
function times(d, n = 500) {
  const r = core.mulberry32(7), ts = [0, d.t, d.t * 1.05, d.t - 1e-9];
  for (let i = 0; i < d.tc.length; i += Math.max(1, Math.floor(d.tc.length / 150))) ts.push(d.tc[i]);
  while (ts.length < n) ts.push(r() * d.t);
  return ts;
}

test('playback: lap pose equals pre-step-7 carState bit for bit', () => {
  let n = 0;
  for (const { T, info, snaps } of LAPS) for (const d of snaps) for (const t of times(d)) {
    const o = carStateOld(d, T, t, 4), p = core.pose(d, t, info);
    const pairs = [['x', p.x, o.x], ['y', p.y, o.y], ['heading', p.heading, o.ang], ['speed', p.speed, o.v],
      ['|ay|/G', Math.abs(p.ay) / G, o.glat], ['ax/G', p.ax / G, o.glong], ['station', p.station, o.i]];
    for (const [k, a, b] of pairs) if (!Object.is(a, b)) assert.fail(`t=${t}: ${k} ${a} vs old ${b}`);
    n++;
  }
  assert.ok(n > 2000, `only ${n} poses compared`);
});

test('playback: lap pose properties', () => {
  for (const { info, snaps } of LAPS) for (const d of snaps) {
    const L = d.ds.reduce((a, b) => a + b, 0);
    assert.equal(core.pose(d, 0, info).s, 0, 's at t=0');
    let prev = -1;
    for (let k = 0; k <= 400; k++) {
      const p = core.pose(d, d.t * k / 400, info);
      assert.ok(p.s >= prev, `s decreased at t=${d.t * k / 400}: ${p.s} < ${prev}`); prev = p.s;
      assert.equal(p.z, 0);
      assert.equal(p.gear, info.curves.gear[Math.min(info.n - 1, Math.round(p.speed / info.vstep))], 'gear is the HUD lookup');
      assert.ok(p.rpm >= 0 && p.rpm <= 1, `rpm ${p.rpm}`);
    }
    assert.ok(Math.abs(prev - L) < 1e-6 * L, `s at lap end ${prev} vs line length ${L}`);
    assert.equal(core.pose(d, 1, null).gear, undefined, 'no gear without info');
  }
});

test('playback: raceClock', () => {
  assert.equal(core.raceClock([80], 100), 20);
  assert.equal(core.raceClock([80, 78], 100), 100 % 81, 'the quicker car waits 1 s at the line');
  const r = core.mulberry32(3);
  for (let k = 0; k < 200; k++) {
    const disp = { t: 60 + 30 * r() }, ghost = r() < 0.5 ? { t: 60 + 30 * r() } : null, animT = 400 * r();
    assert.ok(Object.is(core.raceClock(ghost ? [disp.t, ghost.t] : [disp.t], animT), raceClockOld(disp, ghost, animT)));
  }
});

test(`playback: trace pose on the skidpad (${SKIDPAD.car}, ${SKIDPAD.R} m, 95%)`, t => {
  const { T, car, line, v } = skidpadSetup(core, SKIDPAD.car, 0.95), info = core.describeCar(car);
  const r = core.dynLap(T, car, core.dynSetup(car), line, v, true), tr = r.trace, n = tr.t.length;
  assert.ok(r.complete && !r.spun, 'skidpad lap not clean');
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  // at recorded sample times the pose is the sample
  for (let k = 0; k < n; k++) {
    const p = core.pose(tr, tr.t[k], info);
    const want = { x: tr.x[k], y: tr.y[k], s: tr.s[k], heading: wrap(tr.psi[k]), speed: Math.hypot(tr.v[k], tr.vy[k]), steer: tr.delta[k],
      slipF: tr.alf[k], slipR: tr.alr[k], ax: tr.ax[k], ay: tr.ay[k], yawRate: tr.r[k], gear: tr.gear[k], station: tr.st[k] };
    for (const key in want) if (!Object.is(p[key], want[key])) assert.fail(`sample ${k}: ${key} ${p[key]} vs ${want[key]}`);
  }
  // heading is continuous between samples, s never decreases
  let prev = core.pose(tr, tr.t[0], info);
  for (let q = 1; q <= 4000; q++) {
    const p = core.pose(tr, tr.t[0] + (tr.t[n - 1] - tr.t[0]) * q / 4000, info);
    assert.ok(Math.abs(wrap(p.heading - prev.heading)) < 0.05, `heading jumps ${p.heading - prev.heading} rad at query ${q}`);
    assert.ok(p.s >= prev.s, `s decreased at query ${q}`);
    prev = p;
  }
  // The recorded state is kinematically consistent with the car's own path (κ from three consecutive positions):
  // |ay| = v²·|κ|, and the velocity vector turns at r + dβ/dt = v·κ. Yaw rate alone departs from v·κ by up to ~13%
  // while the driver's weave around the line decays (sideslip oscillates), so it is only checked on average against
  // the line. Measured (Road car, 95%): ay max 0.59%, kinematics max 0.30%, line means +0.30% (yaw) / +0.06% (ay).
  const beta = i => Math.atan2(tr.vy[i], tr.v[i]);
  let wa = 0, wk = 0, myaw = 0, may = 0, m = 0;
  for (let k = 1; k < n - 1; k++) {
    if (tr.t[k] < 1) continue; // skip the start transient
    const p = core.pose(tr, tr.t[k], info), sp = p.speed, kl = Math.abs(line.k[p.station]);
    const d1x = tr.x[k] - tr.x[k - 1], d1y = tr.y[k] - tr.y[k - 1], d2x = tr.x[k + 1] - tr.x[k], d2y = tr.y[k + 1] - tr.y[k];
    const kp = 2 * (d1x * d2y - d1y * d2x) / (Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y) * Math.hypot(tr.x[k + 1] - tr.x[k - 1], tr.y[k + 1] - tr.y[k - 1]));
    const db = (beta(k + 1) - beta(k - 1)) / (tr.t[k + 1] - tr.t[k - 1]);
    wa = Math.max(wa, Math.abs(Math.abs(p.ay) / (sp * sp * Math.abs(kp)) - 1));
    wk = Math.max(wk, Math.abs((p.yawRate + db) / (sp * kp) - 1));
    myaw += Math.abs(p.yawRate) / (sp * kl) - 1; may += Math.abs(p.ay) / (sp * sp * kl) - 1;
    for (const a of [p.beta, p.slipF, p.slipR]) assert.ok(Number.isFinite(a) && Math.abs(a) < 0.1, `slip ${a} rad at t=${tr.t[k]}`);
    m++;
  }
  myaw /= m; may /= m;
  t.diagnostic(`samples=${n}  |ay| vs v²κ max ${(wa * 100).toFixed(2)}%  kinematics max ${(wk * 100).toFixed(2)}%  mean vs line: yaw ${(myaw * 100).toFixed(2)}% ay ${(may * 100).toFixed(2)}%`);
  assert.ok(wa < 0.02, `|ay| off v²·κ_path by ${(wa * 100).toFixed(2)}%`);
  assert.ok(wk < 0.01, `r + dβ/dt off v·κ_path by ${(wk * 100).toFixed(2)}%`);
  assert.ok(Math.abs(myaw) < 0.01 && Math.abs(may) < 0.01, `average off the line: yaw ${(myaw * 100).toFixed(2)}%, ay ${(may * 100).toFixed(2)}%`);
  assert.ok(m > 100);
});
