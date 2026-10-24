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

// Crests and compressions in a corner, against the closed form. A car with no load sensitivity and no downforce has
// alat = μ·g·n exactly, so v²·k = μ·(g + v²·kv) at the limit: v = √(μg / (k − μ·kv)). On a 60 m corner (μ = 1):
// flat 24.26 m/s; crest of 200 m vertical radius 21.28 (−12.3%), of 50 m 16.36 (−32.6%); compression of 200 m 29.00 (+19.5%).
test('lap: corner speed over a crest or through a compression matches v = √(μg / (k − μ·kv))', t => {
  const car = core.buildCar({ ...core.CARS['Road car'], mu: 1, sens: 0, cla: 0 }, { loads: true }), out = new Float64Array(2), k = 1 / 60, G = core.G;
  for (const [label, kv] of [['flat', 0], ['crest 200 m', -1 / 200], ['crest 50 m', -1 / 50], ['compression 200 m', 1 / 200]]) {
    const v = core.vCornerN(car, k, car.load.kcrit, 1, kv, out), exact = Math.sqrt(G / (k - kv));
    t.diagnostic(`${label}: ${v.toFixed(3)} m/s, closed form ${exact.toFixed(3)} (${(100 * (v / exact - 1)).toFixed(3)}%)`);
    assert.ok(Math.abs(v / exact - 1) < 0.005, `${label}: ${v} vs ${exact}`);
    assert.ok(out[1] < 0, `${label}: dv/dk should be negative, got ${out[1]}`);
  }
  // and the flat-table search agrees with the load-table one at n ≡ 1
  assert.equal(core.vCornerN(car, k, car.load.kcrit, 1, 0, out), core.vCorner(car, k, null, out));
});

// Gravity in the forward pass: where drive power is the limit (no upshift, the step sets the speed), v_j² is
// u² + 2·(drive − drag − rolling)·ds − 2g·dz with ds the 3D step. Recomputed here from the car's own tables.
function hilly(carName, H = 40, trackIdx = 0) {
  const tr = core.TRACKS[trackIdx], ctrl = core.genCtrl(tr.seed, WIDTH), u = core.genElev(tr.seed, ctrl);
  const T = core.buildTrack(withZ(ctrl, u.map(x => H * x)), WIDTH), car = core.buildCar(core.CARS[carName], { loads: true });
  const B = core.makeBounds(T, car), off = new Float64Array(T.N);
  for (let i = 0; i < T.N; i++) off[i] = Math.min(B.hi[i], Math.max(B.lo[i], 0));
  return { T, car, B, off };
}
test('lap: on a power-limited step, gravity takes exactly 2g·dz off v²', t => {
  const { T, car, off } = hilly('Road car'), N = T.N, S = core.makeScratch(N), { G, RHO, CRR } = core;
  core.lapEval(T, car, off, S);
  const kd = 0.5 * RHO * car.cda / car.m, rr = G * CRR, tn = new Float64Array(2), tl = new Float64Array(3), tg = new Float64Array(4);
  let up = 0, down = 0, worst = 0;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, u = S.vf[i];
    if (T.dz[i] === 0 || S.ff[j] !== 1 || S.sh[j]) continue;
    const n = core.loadAt(T.cth[i], T.kv[i], u, tn); core.tab3(car.load.alat, u, n, tl);
    const ak = Math.max(Math.abs(S.k[i]), Math.abs(S.k[j])); core.gg3(car.load.ggT, u, u * u * ak / tl[0], n, tg);
    const pw = core.tabAt(car.drv, u); if (!(pw < tg[0])) continue; // grip-limited: not this check
    const dx = S.px[j] - S.px[i], dy = S.py[j] - S.py[i], ds3 = Math.sqrt(dx * dx + dy * dy + T.dz[i] * T.dz[i]);
    assert.ok(ds3 > Math.sqrt(dx * dx + dy * dy), `step ${i}: 3D step not longer than its plan view`);
    const want = u * u + 2 * (pw - kd * u * u - rr) * ds3 - 2 * G * T.dz[i];
    worst = Math.max(worst, Math.abs(S.vf[j] * S.vf[j] - want) / want);
    if (T.dz[i] > 0) up++; else down++;
  }
  t.diagnostic(`power-limited steps on a slope: ${up} uphill, ${down} downhill; worst relative mismatch ${worst.toExponential(2)}`);
  assert.ok(up > 0 && down > 0, 'need power-limited steps both uphill and downhill');
  assert.ok(worst < 1e-12, `v² differs from u² + 2(F/m)ds − 2g·dz by ${worst}`);
});

// Past the edge: hills far beyond the slider. The lap, its speeds and its gradient must stay finite. Measured when
// written: the lowest load factor reached at lap speed stays well above 0 (Road car 0.55 at 250 m on Kestrel Point),
// because on a curved station the corner-speed solve needs grip (v²·k = alat(v, n(v)) > 0), so the car slows enough to
// keep its tyres loaded. n <= 0 is reachable only over a nearly straight crest at speed; the clamp test below exercises
// those branches directly.
test('lap: hills far past the slider still give a finite lap, speeds and gradient', t => {
  for (const name of ['Road car', 'GT racer']) {
    const { T, car, off } = hilly(name, 250, 1), N = T.N, S = core.makeScratch(N), grad = new Float64Array(N);
    const lap = core.lapEval(T, car, off, S, grad, 0);
    let nmin = Infinity;
    for (let i = 0; i < N; i++) nmin = Math.min(nmin, T.cth[i] + S.v[i] * S.v[i] * T.kv[i] / core.G);
    t.diagnostic(`${name}: lap ${lap.toFixed(3)} s, lowest load factor at lap speed ${nmin.toFixed(2)}`);
    assert.ok(Number.isFinite(lap) && lap > 0, `${name}: lap ${lap}`);
    assert.ok(S.v.every(x => Number.isFinite(x) && x > 0) && grad.every(Number.isFinite), `${name}: non-finite speeds or gradient`);
  }
});

// The clamped load factor: below 0 the car has no static grip (only downforce), above the grid's top it reads the top.
test('lap: the load factor clamps to the grid, with zero slope, and lookups there are the end slices', () => {
  const { NT, NQ, NL, NSTEP, G } = core, top = (NL - 1) * NSTEP, out = new Float64Array(2), tl = new Float64Array(3), tg = new Float64Array(4);
  assert.deepEqual([core.loadAt(1, -1 / 50, 30, out), out[1]], [0, 0], 'crest at speed: n clamps to 0, flat in v');
  assert.deepEqual([core.loadAt(1, 1 / 20, 40, out), out[1]], [top, 0], 'hard compression: n clamps to the top');
  assert.equal(core.loadAt(1, -1 / 500, 20, out), 1 - 400 / 500 / G); assert.equal(out[1], 2 * 20 * (-1 / 500) / G);
  for (const name of ['Road car', 'GT racer']) {
    const car = core.buildCar(core.CARS[name], { loads: true }), L = car.load, v = 40.25, q = 0.4;
    for (const [n, l] of [[0, 0], [-0.3, 0], [top, NL - 1], [top + 1, NL - 1]]) {
      core.tab3(L.alat, v, n, tl); const ii = Math.floor(v / core.VSTEP), f = v / core.VSTEP - ii;
      const a = L.alat[l * NT + ii] + (L.alat[l * NT + ii + 1] - L.alat[l * NT + ii]) * f;
      assert.ok(Math.abs(tl[0] - a) < 1e-12 && tl[2] === 0, `${name}: tab3 at n = ${n} is slice ${l} (${tl[0]} vs ${a}), slope ${tl[2]}`);
      core.gg3(L.ggT, v, q, n, tg); assert.equal(tg[3], 0, `${name}: gg3 ∂/∂n at n = ${n}`);
    }
    // a corner over a sharp crest: the n = 0 crossing caps the speed, finite and below it, with dv/d|k| < 0
    const vc = core.vCornerN(car, 1 / 200, L.kcrit, 1, -1 / 60, out), vZero = Math.sqrt(G * 60);
    assert.ok(Number.isFinite(vc) && vc > 0 && vc < vZero && out[1] < 0, `${name}: corner speed ${vc} over a 60 m crest (n = 0 at ${vZero.toFixed(1)} m/s), slope ${out[1]}`);
  }
});
