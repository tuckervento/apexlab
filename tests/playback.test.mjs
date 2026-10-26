// Playback poses (ARCHITECTURE.md §10.2): known lap/trace samples, kinematics and the race clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';
import { SKIDPAD, skidpadSetup } from './golden-util.mjs';

const core = await loadCore();

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

// Timing is deliberately nonuniform; geometry is a 12 m square, without legacy-optional height.
const LAP = { px: [0, 12, 12, 0], py: [0, 0, 12, 12], v: [4, 8, 4, 8],
  k: [0.125, -0.125, 0.25, -0.25], ds: [12, 12, 12, 12], tc: [0, 2, 5, 9, 14], t: 14,
  phys: { wf: [100, 200, 400, 600], wr: [800, 600, 400, 200] } };
const INFO = { n: 5, vstep: 2, curves: { gear: [1, 1, 2, 3, 4], rpm: [0.2, 0.3, 0.4, 0.6, 0.8] } };

test('playback: known lap boundaries and midpoint', () => {
  for (const [t, station, x, y, speed, s] of [[0, 0, 0, 0, 4, 0], [2, 1, 12, 0, 8, 12],
    [5, 2, 12, 12, 4, 24], [9, 3, 0, 12, 8, 36]]) {
    const p = core.pose(LAP, t);
    assert.equal(p.station, station, `station at t=${t}`);
    assert.equal(p.frac, 0, `boundary fraction at t=${t}`);
    assert.deepEqual([p.x, p.y, p.speed, p.s], [x, y, speed, s], `boundary pose at t=${t}`);
  }
  const p = core.pose(LAP, 3.5, INFO);
  assert.deepEqual([p.station, p.frac, p.x, p.y, p.speed, p.s], [1, 0.5, 12, 6, 6, 18], 'midpoint position, speed and distance');
  assert.equal(p.heading, Math.PI / 2, 'midpoint heading follows the segment');
  assert.deepEqual(p.phys, { wf: 300, wr: 500 }, 'midpoint telemetry is linearly interpolated');
  // Positive curvature bends right in the screen frame; negative curvature bends left.
  assert.equal(core.pose(LAP, 1).ay, 2, 'right bend ay is +2 m/s²');
  assert.equal(p.ay, -8, 'left bend ay is -8 m/s²');
  // Braking 8 -> 4 m/s over 12 m: (16 - 64) / 24 = -2 m/s².
  assert.ok(Math.abs(p.ax + 2) < 1e-9, 'longitudinal acceleration is -2 m/s²');
  assert.equal(p.gear, 3, '6 m/s selects gear 3');
  assert.equal(p.rpm, 0.6, '6 m/s selects 0.6 redline');
  const q = core.pose(LAP, 3.5);
  assert.equal(q.gear, undefined, 'gear is optional without info');
  assert.equal(q.rpm, undefined, 'rpm is optional without info');
  assert.equal(q.z, 0, 'legacy snapshot without height is flat');
});

test('playback: closing segment and hold just before the finish', () => {
  const p = core.pose(LAP, 11.5);
  assert.deepEqual([p.station, p.frac, p.x, p.y, p.speed, p.s], [3, 0.5, 0, 6, 6, 42], 'closing segment interpolates last to first');
  assert.equal(p.heading, -Math.PI / 2, 'closing segment points toward the start');
  assert.deepEqual(p.phys, { wf: 350, wr: 500 }, 'closing telemetry wraps to the first station');
  for (const t of [14, 20, 100]) {
    const q = core.pose(LAP, t);
    assert.equal(q.station, 3, 'lap end holds the final segment');
    assert.ok(q.frac > 0.999 && q.frac < 1, 'lap end holds within the last 0.1% of the final segment');
    assert.ok(q.s > 47.988 && q.s < 48 && q.y > 0 && q.y < 0.012, 'lap end is just before the finish');
  }
});

const TRACE = { t: [2, 6], x: [0, 12], y: [4, 8], v: [3, 6], vy: [4, 8], psi: [3 * Math.PI / 4, -3 * Math.PI / 4],
  s: [10, 30], st: [1, 2], r: [0.1, 0.3], delta: [0.2, 0.4], alf: [0.01, 0.03], alr: [-0.03, -0.01],
  ax: [1, 3], ay: [-2, -4], gear: [2, 3] };

test('playback: trace takes the shortest arc across the heading seam', () => {
  // 135° -> -135° advances 90° through 180°; at one quarter it is 157.5°.
  assert.ok(Math.abs(core.pose(TRACE, 3).heading - 7 * Math.PI / 8) < 1e-12, 'heading seam quarter is 7π/8 on the shortest arc');
  assert.ok(Math.abs(Math.abs(core.pose(TRACE, 4).heading) - Math.PI) < 1e-12, 'heading seam midpoint is ±π');
});

test('playback: trace endpoint clamps and legacy height', () => {
  for (const [t, x, y, s, speed, heading, station, gear] of [[-10, 0, 4, 10, 5, 3 * Math.PI / 4, 1, 2],
    [20, 12, 8, 30, 10, -3 * Math.PI / 4, 2, 3]]) {
    const p = core.pose(TRACE, t);
    assert.deepEqual([p.x, p.y, p.s, p.speed, p.heading, p.station, p.gear], [x, y, s, speed, heading, station, gear], `trace clamps at t=${t}`);
    assert.equal(p.z, 0, 'legacy trace without height is flat');
  }
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

// stationPose is the second half of a lap pose: given the pose's own station and frac it must reproduce the pose,
// telemetry included; at frac 0 the telemetry is the station's own value.
test('playback: stationPose reproduces the lap pose; phys interpolates the snapshot telemetry', () => {
  let n = 0;
  for (const { info, snaps } of LAPS) for (const d of snaps) {
    assert.ok(d.phys && d.phys.wf.length === d.px.length, 'snapshot has no telemetry');
    for (const t of times(d, 200)) {
      const p = core.pose(d, t, info), q = core.stationPose(d, p.station, p.frac, info);
      assert.ok(p.frac >= 0 && p.frac <= 1, `frac ${p.frac} at t=${t}`);
      for (const k of Object.keys(p)) if (k !== 'phys' && !Object.is(p[k], q[k])) assert.fail(`t=${t}: ${k} ${p[k]} vs stationPose ${q[k]}`);
      for (const k of Object.keys(d.phys)) if (!Object.is(p.phys[k], q.phys[k])) assert.fail(`t=${t}: phys.${k} ${p.phys[k]} vs stationPose ${q.phys[k]}`);
      n++;
    }
    for (let i = 0; i < d.px.length; i += 37) {
      const q = core.stationPose(d, i, 0, info);
      for (const k of Object.keys(d.phys)) assert.equal(q.phys[k], d.phys[k][i], `phys.${k} at station ${i}, frac 0`);
    }
  }
  assert.ok(n > 500, `only ${n} poses compared`);
});

// lapExtremes is what "Lap max" shows: it must equal the brute-force range over every station's pose, and bound
// every pose the replay can produce (a dense sample of the lap).
test('playback: lapExtremes is the range of the lap poses', () => {
  for (const { info, snaps } of LAPS) for (const d of [snaps[0], snaps.at(-1)]) {
    const x = core.lapExtremes(d), N = d.px.length, get = { speed: p => p.speed, ax: p => p.ax, ay: p => p.ay };
    for (const k of Object.keys(d.phys)) get['phys.' + k] = p => p.phys[k];
    const ext = { speed: x.speed, ax: x.ax, ay: x.ay };
    for (const k of Object.keys(d.phys)) ext['phys.' + k] = x.phys[k];
    for (const [name, f] of Object.entries(get)) {
      let max = -Infinity, min = Infinity;
      for (let i = 0; i < N; i++) { const v = f(core.stationPose(d, i, 0, info)); max = Math.max(max, v); min = Math.min(min, v); }
      assert.ok(Object.is(ext[name].max, max) && Object.is(ext[name].min, min), `${name}: ${ext[name].min}..${ext[name].max} vs stations ${min}..${max}`);
      const tol = 1e-9 * Math.max(1, Math.abs(max), Math.abs(min));
      for (let q = 0; q <= 4000; q++) {
        const v = f(core.pose(d, d.t * q / 4000, info));
        if (v > max + tol || v < min - tol) assert.fail(`${name} at t=${d.t * q / 4000}: ${v} outside ${min}..${max}`);
      }
    }
    assert.ok(x.ay.max > 0 && x.ay.min < 0 && x.ax.max > 0 && x.ax.min < 0, 'a lap has left and right turns, drive and braking');
  }
});

test('playback: raceClock', () => {
  assert.equal(core.raceClock([80], 100), 20);
  assert.equal(core.raceClock([80, 78], 100), 100 % 81, 'the quicker car waits 1 s at the line');
  assert.equal(core.raceClock([80], 80), 0, 'single car restarts at its lap time');
  assert.equal(core.raceClock([80, 78], 80), 80, 'cars hold until the shared restart');
  assert.equal(core.raceClock([78, 80], 81), 0, 'slower ghost sets the shared restart');
  assert.equal(core.raceClock([80, 78], 163), 1, 'shared clock repeats after multiple laps');
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
