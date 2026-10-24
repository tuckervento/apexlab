// Elevation (migration step 8): the track's height model, and (later phases) its physics. The guiding rule is that a
// flat circuit is bit for bit what it was before elevation existed, so the goldens keep proving the flat physics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';

const core = await loadCore(), WIDTH = 12;
const withZ = (ctrl, z) => ctrl.map((p, i) => [p[0], p[1], typeof z === 'number' ? z : z[i]]);
const ARRAYS = ['cx', 'cy', 'nx', 'ny', 'kc'];

test('track: a flat circuit has exactly zero rise, unit cos-grade and zero vertical curvature', () => {
  for (const tr of core.TRACKS) {
    const ctrl = core.genCtrl(tr.seed, WIDTH), T2 = core.buildTrack(ctrl, WIDTH), T3 = core.buildTrack(withZ(ctrl, 0), WIDTH);
    for (const T of [T2, T3]) {
      assert.equal(T.flat, true, `${tr.name}: flat`);
      for (let i = 0; i < T.N; i++) {
        if (T.z[i] !== 0 || T.dz[i] !== 0 || T.cth[i] !== 1 || T.kv[i] !== 0)
          assert.fail(`${tr.name} station ${i}: z ${T.z[i]} dz ${T.dz[i]} cth ${T.cth[i]} kv ${T.kv[i]}`);
      }
    }
    assert.deepEqual([T3.N, T3.L, T3.ds, T3.minR, T3.issue], [T2.N, T2.L, T2.ds, T2.minR, T2.issue], `${tr.name}: [x, y, 0] scalars`);
    for (const k of ARRAYS) for (let i = 0; i < T2.N; i++) if (T2[k][i] !== T3[k][i]) assert.fail(`${tr.name}: ${k}[${i}] differs with z = 0`);
  }
});

// Hills at the slider's maximum on the presets and a spread of random circuits. Bounds are physical sanity, not fits:
// the steepest real circuits are about 18% (Eau Rouge, the Corkscrew); crests sharper than 200 m would throw a car at
// racing speed off the ground. Measured when written: grades 6.6-14.8%, crest radii >= 326 m, range overshoot <= 11%.
test('track: generated hills close the loop and stay within racing-circuit grades', () => {
  const H = 40, seeds = [...core.TRACKS.map(t => [t.name, t.seed]), ...[1, 2, 3, 4, 5, 6, 7, 8].map(s => [`seed ${s * 7777}`, s * 7777])];
  for (const [name, seed] of seeds) {
    const ctrl = core.genCtrl(seed, WIDTH), u = core.genElev(seed, ctrl);
    assert.ok(Math.abs(Math.max(...u) - Math.min(...u) - 1) < 1e-12 && Math.abs(Math.max(...u) + Math.min(...u)) < 1e-12, `${name}: unit profile spans [-0.5, 0.5]`);
    const T = core.buildTrack(withZ(ctrl, u.map(x => H * x)), WIDTH);
    let sdz = 0, grade = 0, kvmin = 0, zlo = Infinity, zhi = -Infinity;
    for (let i = 0; i < T.N; i++) {
      assert.ok([T.z[i], T.dz[i], T.cth[i], T.kv[i]].every(Number.isFinite), `${name} station ${i}: non-finite`);
      sdz += T.dz[i]; grade = Math.max(grade, Math.abs(T.dz[i] / T.ds)); kvmin = Math.min(kvmin, T.kv[i]); zlo = Math.min(zlo, T.z[i]); zhi = Math.max(zhi, T.z[i]);
    }
    assert.equal(T.flat, false, `${name}: not flat`);
    assert.ok(Math.abs(sdz) < 1e-9, `${name}: loop does not close, sum dz = ${sdz}`);
    assert.ok(grade < 0.20, `${name}: max grade ${(grade * 100).toFixed(1)}%`);
    assert.ok(-1 / kvmin > 200, `${name}: crest radius ${(-1 / kvmin).toFixed(0)} m`);
    assert.ok(zhi - zlo >= H * 0.999 && zhi - zlo <= H * 1.15, `${name}: height range ${(zhi - zlo).toFixed(1)} m for Hills ${H}`);
  }
});
