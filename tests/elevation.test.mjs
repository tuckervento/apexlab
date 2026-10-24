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

// The load-factor tables (car.load) are the flat car's tables at other loads; at n = 1 they must be the flat car's own.
test('car: the n = 1 slice of the load tables is the flat car, bit for bit', () => {
  const { NT, NQ, NL, NSTEP } = core, l1 = Math.round(1 / NSTEP);
  assert.equal(l1 * NSTEP, 1, 'n = 1 is a grid node');
  for (const [name, P] of Object.entries(core.CARS)) {
    const flat = core.buildCar(P), car = core.buildCar(P, { loads: true });
    assert.equal(flat.load, null, `${name}: a flat build has no load tables`);
    for (const k of ['alat', 'kcrit', 'kcF', 'kcR']) {
      assert.equal(car.load[k].length, NL * NT);
      for (let i = 0; i < NT; i++) if (!Object.is(car.load[k][l1 * NT + i], flat[k][i])) assert.fail(`${name}: load.${k} at n = 1, speed index ${i}`);
    }
    for (const k of ['ggB', 'ggT']) {
      assert.equal(car.load[k].length, NL * NT * NQ);
      for (let i = 0; i < NT * NQ; i++) if (!Object.is(car.load[k][l1 * NT * NQ + i], flat[k][i])) assert.fail(`${name}: load.${k} at n = 1, cell ${i}`);
    }
    for (const k of ['alat', 'kcrit', 'ggB', 'ggT', 'vTop', 'lF', 'lR']) assert.deepEqual(car[k], flat[k], `${name}: ${k} of a loads build`);
  }
});

// Between nodes the lookups are linear in n. Against a direct solve at every midpoint, for all presets. Measured when
// written (NSTEP 0.125): alat within 0.29% for n >= 0.25 (1.31% below, where static load nearly vanishes); GGV within
// 0.27 m/s² anywhere (largest at q >= 0.9, where the GGV is a small residual), 99th percentile 0.05 m/s².
test('car: the load tables interpolate in n to within 0.5% lateral and 0.4 m/s² longitudinal of a direct solve', async t => {
  const { NT, NQ, NL, NSTEP } = core;
  for (const [name, P] of Object.entries(core.CARS)) {
    const car = core.buildCar(P, { loads: true }), L = car.load, all = [];
    let eA = 0, eA0 = 0, eG = 0;
    for (let l = 0; l < NL - 1; l++) {
      const x = core.gripTables(car.spec, (l + 0.5) * NSTEP);
      for (let i = 1; i < NT; i++) {
        const ea = Math.abs((L.alat[l * NT + i] + L.alat[(l + 1) * NT + i]) / 2 - x.alat[i]) / x.alat[i];
        if ((l + 0.5) * NSTEP >= 0.25) eA = Math.max(eA, ea); else eA0 = Math.max(eA0, ea);
        for (const k of ['ggB', 'ggT']) for (let q = 0; q < NQ; q++) {
          const j = i * NQ + q, e = Math.abs((L[k][l * NT * NQ + j] + L[k][(l + 1) * NT * NQ + j]) / 2 - x[k][j]);
          all.push(e); eG = Math.max(eG, e);
        }
      }
    }
    all.sort((a, b) => a - b);
    const p99 = all[Math.floor(all.length * 0.99)];
    t.diagnostic(`${name}: alat ${(eA * 100).toFixed(2)}% (n < 0.25: ${(eA0 * 100).toFixed(2)}%), GGV max ${eG.toFixed(3)} p99 ${p99.toFixed(3)} m/s²`);
    assert.ok(eA < 0.005, `${name}: alat interpolation ${(eA * 100).toFixed(2)}% for n >= 0.25`);
    assert.ok(eA0 < 0.02, `${name}: alat interpolation ${(eA0 * 100).toFixed(2)}% for n < 0.25`);
    assert.ok(eG < 0.4 && p99 < 0.1, `${name}: GGV interpolation max ${eG} p99 ${p99} m/s²`);
  }
});
