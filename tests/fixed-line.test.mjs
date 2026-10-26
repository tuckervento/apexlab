// ARCHITECTURE.md §6, §8: fixed input lines, current model/driver contracts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, setupPreset } from './load-core.mjs';
import { loadFixedLines, fixtureCase } from './fixture-util.mjs';
import { clampedZeros, HILLY } from './golden-util.mjs';

const core = await loadCore(), fixtures = loadFixedLines();
const FRAC_MIN = 0.85, UMAX_MAX = 1.15;

function finite(x, name) {
  if (typeof x === 'number') assert.ok(Number.isFinite(x), `${name} is finite`);
  else if (Array.isArray(x) || ArrayBuffer.isView(x)) assert.ok(Array.from(x).every(Number.isFinite), `${name} samples are finite`);
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) finite(v, `${name}.${k}`);
}

for (const key of Object.keys(fixtures.cases)) {
  test(`fixed line: ${key}`, async t => {
    const fx = await fixtureCase(key);
    const { T, off } = fx, car = core.buildCar(fx.car, { loads: !T.flat }), B = core.makeBounds(T, car);
    const S = core.makeScratch(T.N), C = core.makeScratch(T.N);
    const lap = core.lapEval(T, car, off, S), centreLap = core.lapEval(T, car, clampedZeros(B, T.N), C);
    const dc = new core.DynCheck(T, car, off);
    // Two endpoint probes + six bisections reduce 0.20 to 0.003125 (< 0.004).
    for (let i = 0; i < 8 && !dc.done; i++) dc.step();
    assert.ok(dc.done, 'dynamic check finishes within eight probes');
    const r = dc.result, d = r.dyn;
    t.diagnostic(`lap=${lap.toFixed(4)} s  centre=${centreLap.toFixed(4)} s  frac=${r.frac.toFixed(4)}  umax=${r.umax.toFixed(3)}`);
    assert.equal(off.length, T.N, 'fixture length ≠ station count');
    for (let i = 0; i < T.N; i++) assert.ok(off[i] >= B.lo[i] && off[i] <= B.hi[i], `fixture station ${i} outside [${B.lo[i]}, ${B.hi[i]}]: ${off[i]}`);
    assert.ok(lap < centreLap, `fixture lap ${lap} not faster than centreline ${centreLap}`);
    assert.ok(r.frac >= FRAC_MIN && r.frac <= 1, `dynamic check fraction ${r.frac} outside [${FRAC_MIN}, 1]`);
    assert.ok(r.umax <= UMAX_MAX, `inverse-dynamics utilisation ${r.umax} (${r.uaxle}, station ${r.uat}) > ${UMAX_MAX}`);
    assert.ok(d && d.complete && !d.spun && d.trouble.length === 0, `final lap at frac ${r.frac} not clean`);
    // Both paths must fit within the usable road plus the documented 0.5 m trouble tolerance.
    const errorMax = T.width - (car.spec.track + 0.25) + 0.5;
    assert.ok(d.maxE <= errorMax, `tracking error stays within usable road span (${errorMax} m)`);
    assert.ok(d.maxOff <= 0.5 && d.maxDB <= 0.1, 'clean run respects edge and sideslip trouble thresholds');
    // The dynamic model has a 900 s integration horizon: these supported circuits must fit in it.
    assert.ok(lap > 0 && centreLap > 0 && centreLap < 900, 'positive centreline lap within the dynamic lap horizon');
    assert.ok(d.t > 0 && d.t < 900, 'final run completes within the dynamic lap horizon');
    finite({ lap, centreLap, line: { px: S.px, py: S.py, k: S.k, ds: S.ds, v: S.v }, centreV: C.v, result: r }, 'fixed line');

    const ev = [], solver = new core.Solver(e => ev.push(e));
    solver.handle({ type: 'load', rev: 1, params: fx.car, ctrl: fx.ctrl, width: fx.width, off, run: false });
    assert.deepEqual(ev.filter(e => e.type === 'error'), [], 'fixture load emits no error');
    const snap = ev.find(e => e.type === 'snapshot');
    // Warning counts concern the forward/backward pass speeds, not just the final speed profile.
    let stall = 0, air = 0, ntop = 0;
    for (let i = 0; i < T.N; i++) {
      if (Math.min(S.vf[i], S.vb[i]) < 0.1) stall++;
      const still = T.flat || (T.cth[i] === 1 && T.kv[i] === 0 && T.dz[i] === 0);
      if (still) continue;
      for (const u of [i !== (S.i0 + T.N - 1) % T.N ? S.vf[i] : null, i !== S.i0 ? S.vb[(i + 1) % T.N] : null]) {
        if (u === null) continue;
        const n = T.cth[i] + u*u*T.kv[i]/9.81;
        if (n <= car.load.nf) air++; else if (n >= 2) ntop++;
      }
    }
    assert.deepEqual(snap.warn, { stall, air, ntop }, 'snapshot warnings describe the lap floor and pass load clamps');
    finite(snap.line, 'snapshot.line');
  });
}

// Live presets remain usable too; fixed inputs above deliberately do not follow preset edits.
test('centreline laps: all preset cars × circuits', () => {
  for (const carName of Object.keys(core.CARS)) {
    for (const { track, hills } of [...core.TRACKS.map(track => ({ track, hills: 0 })), ...HILLY.map(h => ({ track: core.TRACKS[h.track], hills: h.hills }))]) {
      const { T, B, car } = setupPreset(core, carName, { seed: track.seed, hills }), S = core.makeScratch(T.N);
      const lap = core.lapEval(T, car, clampedZeros(B, T.N), S);
      assert.ok(lap > 0 && lap < 900, `${carName}, ${track.name}, hills ${hills}: positive centreline lap within the dynamic lap horizon`);
      finite({ lap, px: S.px, py: S.py, k: S.k, ds: S.ds, v: S.v }, 'preset centreline');
    }
  }
});
