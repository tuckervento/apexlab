// Elevation (migration step 8): the track's height model, and (later phases) its physics. The guiding rule is that a
// flat circuit is bit for bit what it was before elevation existed, so the goldens keep proving the flat physics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, setupPreset } from './load-core.mjs';
import { stadium } from './golden-util.mjs';
import { loadFixedLines, fixtureCase } from './fixture-util.mjs';

const core = await loadCore(), WIDTH = 12;
const withZ = (ctrl, z) => ctrl.map((p, i) => [p[0], p[1], typeof z === 'number' ? z : z[i]]);
const ARRAYS = ['cx', 'cy', 'nx', 'ny', 'kc'];

test('track: a flat circuit has exactly zero rise, unit cos-grade and zero vertical curvature', () => {
  for (const tr of core.TRACKS) {
    const ctrl = core.genCtrl(tr.seed, WIDTH), T2 = core.buildTrack(ctrl, WIDTH), T3 = core.buildTrack(withZ(ctrl, 0), WIDTH);
    const T5 = core.buildTrack(withZ(ctrl, 5.3), WIDTH); // level ground at one height is flat too (no spline rounding in dz)
    for (const [T, z0] of [[T2, 0], [T3, 0], [T5, 5.3]]) {
      assert.equal(T.flat, true, `${tr.name} at ${z0} m: flat`);
      for (let i = 0; i < T.N; i++) {
        if (T.z[i] !== z0 || T.dz[i] !== 0 || T.cth[i] !== 1 || T.kv[i] !== 0)
          assert.fail(`${tr.name} at ${z0} m, station ${i}: z ${T.z[i]} dz ${T.dz[i]} cth ${T.cth[i]} kv ${T.kv[i]}`);
      }
    }
    for (const k of ARRAYS) for (let i = 0; i < T2.N; i++) if (T2[k][i] !== T5[k][i]) assert.fail(`${tr.name}: ${k}[${i}] differs at a constant 5.3 m`);
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

// The load-factor tables (car.load) are the flat car's tables at other loads, with the flat car's own as the n = 1 slice.
// This pins the packing and layout only: buildCar reuses the flat tables for that slice, so that n = 1 is the flat
// physics is proven by the goldens (the flat car is gripTables(p, 1)), not here.
test('car: a loads build keeps the flat car and packs it as the n = 1 slice', () => {
  const { NT, NQ, NL, NSTEP } = core, l1 = Math.round(1 / NSTEP);
  assert.equal(l1 * NSTEP, 1, 'n = 1 is a grid node');
  for (const [name, P] of Object.entries(core.CARS)) {
    const flat = core.buildCar(P), car = core.buildCar(P, { loads: true });
    assert.equal(flat.load, null, `${name}: a flat build has no load tables`);
    for (const k of ['alat', 'kcrit', 'kcF', 'kcR']) {
      assert.equal(car.load[k].length, (NL - car.load.l0) * NT); // levels from the car's floor l0 (review E-M1)
      for (let i = 0; i < NT; i++) if (!Object.is(car.load[k][(l1 - car.load.l0) * NT + i], flat[k][i])) assert.fail(`${name}: load.${k} at n = 1, speed index ${i}`);
    }
    for (const k of ['ggB', 'ggT']) {
      assert.equal(car.load[k].length, (NL - car.load.l0) * NT * NQ);
      for (let i = 0; i < NT * NQ; i++) if (!Object.is(car.load[k][(l1 - car.load.l0) * NT * NQ + i], flat[k][i])) assert.fail(`${name}: load.${k} at n = 1, cell ${i}`);
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
    const at = l => l - L.l0; // level l's index from the car's floor; checked for n >= 0 (below, alat heads to exactly 0)
    for (let l = 0; l < NL - 1; l++) {
      const x = core.gripTables(car.spec, (l + 0.5) * NSTEP);
      for (let i = 1; i < NT; i++) {
        const ea = Math.abs((L.alat[at(l) * NT + i] + L.alat[at(l + 1) * NT + i]) / 2 - x.alat[i]) / x.alat[i];
        if ((l + 0.5) * NSTEP >= 0.25) eA = Math.max(eA, ea); else eA0 = Math.max(eA0, ea);
        for (const k of ['ggB', 'ggT']) for (let q = 0; q < NQ; q++) {
          const j = i * NQ + q, e = Math.abs((L[k][at(l) * NT * NQ + j] + L[k][at(l + 1) * NT * NQ + j]) / 2 - x[k][j]);
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

// A hilly preset circuit (Harrow Ring by default) at H m of hills, a car with load tables, the clamped centreline.
function hilly(carName, H = 40, trackIdx = 0) {
  const tr = core.TRACKS[trackIdx], ctrl = core.genCtrl(tr.seed, WIDTH), u = core.genElev(tr.seed, ctrl);
  const T = core.buildTrack(withZ(ctrl, u.map(x => H * x)), WIDTH), car = core.buildCar(core.CARS[carName], { loads: true });
  const B = core.makeBounds(T, car), off = new Float64Array(T.N);
  for (let i = 0; i < T.N; i++) off[i] = Math.min(B.hi[i], Math.max(B.lo[i], 0));
  return { T, car, B, off };
}

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

// The clamped load factor: at or below the car's floor nf (both axles unloaded, review E-M1) it has no grip at all and
// reads the floor slice; above the grid's top it reads the top. Without downforce the floor is n = 0.
test('lap: the load factor clamps to the grid, with zero slope, and lookups there are the end slices', () => {
  const { NT, NL, NSTEP, G } = core, top = (NL - 1) * NSTEP, out = new Float64Array(3), tl = new Float64Array(3), tg = new Float64Array(4);
  assert.deepEqual([core.loadAt(1, -1 / 50, 30, out), out[1], out[2]], [0, 0, -1], 'no downforce (floor 0): a crest at speed clamps to 0 (airborne), flat in v');
  assert.deepEqual([core.loadAt(1, 1 / 20, 40, out), out[1], out[2]], [top, 0, 1], 'hard compression: n clamps to the top');
  assert.equal(core.loadAt(1, -1 / 500, 20, out), 1 - 400 / 500 / G); assert.deepEqual([out[1], out[2]], [2 * 20 * (-1 / 500) / G, 0]);
  for (const name of ['Road car', 'GT racer']) {
    const car = core.buildCar(core.CARS[name], { loads: true }), L = car.load, v = 40.25, q = 0.4;
    assert.ok(L.l0 < 0, `${name} has downforce, so its floor is below 0`);
    assert.deepEqual([core.loadAt(1, -1 / 50, 30, out, L.nf), out[1], out[2]], [L.nf, 0, -1], `${name}: a crest past the floor clamps to it`);
    for (const [n, l] of [[L.nf, L.l0], [L.nf - 0.3, L.l0], [top, NL - 1], [top + 1, NL - 1]]) {
      core.tab3(L.alat, v, n, tl, L.l0); const ii = Math.floor(v / core.VSTEP), f = v / core.VSTEP - ii, o = (l - L.l0) * NT;
      const a = L.alat[o + ii] + (L.alat[o + ii + 1] - L.alat[o + ii]) * f;
      assert.ok(Math.abs(tl[0] - a) < 1e-12 && tl[2] === 0, `${name}: tab3 at n = ${n} is level ${l} (${tl[0]} vs ${a}), slope ${tl[2]}`);
      core.gg3(L.ggT, v, q, n, tg, L.l0); assert.equal(tg[3], 0, `${name}: gg3 ∂/∂n at n = ${n}`);
    }
    // between the floor and the level above (n < 0, so the level is a floor, not a truncation toward 0): their average
    { const ii = Math.floor(v / core.VSTEP), f = v / core.VSTEP - ii, row = l => { const o = (l - L.l0) * NT; return L.alat[o + ii] + (L.alat[o + ii + 1] - L.alat[o + ii]) * f; };
      core.tab3(L.alat, v, (L.l0 + 0.5) * NSTEP, tl, L.l0); assert.ok(Math.abs(tl[0] - (row(L.l0) + row(L.l0 + 1)) / 2) < 1e-12, `${name}: tab3 halfway above the floor`); }
    // a corner over a sharp crest: reaching the floor caps the speed (downforce keeps a car gripping past n = 0), finite
    // and below it, with dv/d|k| < 0
    const vc = core.vCornerN(car, 1 / 200, L.kcrit, 1, -1 / 60, out), vFloor = Math.sqrt(G * 60 * (1 - L.nf));
    assert.ok(Number.isFinite(vc) && vc > 0 && vc < vFloor && out[1] < 0, `${name}: corner speed ${vc} over a 60 m crest (floor n = ${L.nf} at ${vFloor.toFixed(1)} m/s), slope ${out[1]}`);
  }
});


// Airborne without downforce: over a sharp crest on a (nearly) straight line the load factor drops below 0 and a car
// with no downforce has no grip at all. The lap model must coast it over (gravity and drag only), not divide by its
// zero lateral limit: the lap and gradient stay finite, nothing is held at the speed floor, and the airborne steps are
// reported. Off the exact centreline |k| is ~1e-8 there, the case that used to put NaN into the gradient.
test('lap: a car with no downforce coasts over a crest it flies off, and the lap says so', t => {
  const bump = s => { const x = s - 500; return Math.abs(x) < 75 ? 10 * (1 + Math.cos(2 * Math.PI * x / 150)) : 0; }; // 20 m over 150 m at s = 500
  const T = core.buildTrack(stadium(1000, 120, bump), WIDTH), car = core.buildCar(core.CARS['Kart'], { loads: true }), B = core.makeBounds(T, car), N = T.N;
  assert.equal(car.spec.cla, 0, 'the Kart has no downforce');
  for (const [label, amp] of [['centreline', 0], ['off the centreline', 0.3]]) {
    const off = new Float64Array(N); for (let i = 0; i < N; i++) off[i] = Math.min(B.hi[i], Math.max(B.lo[i], amp * Math.sin(2 * Math.PI * 3 * i / N)));
    for (const tau of [0, 0.5]) {
      const S = core.makeScratch(N), grad = new Float64Array(N), lap = core.lapEval(T, car, off, S, grad, tau);
      t.diagnostic(`${label}, tau ${tau}: lap ${lap.toFixed(3)} s, airborne pass steps ${S.air}, at the speed floor ${S.stall}`);
      assert.ok(Number.isFinite(lap) && S.v.every(Number.isFinite) && grad.every(Number.isFinite), `${label}, tau ${tau}: non-finite lap, speed or gradient`);
      assert.ok(S.air > 0, `${label}, tau ${tau}: the crest should be reported airborne`);
      assert.equal(S.stall, 0, `${label}, tau ${tau}: stations held at the 0.1 m/s floor`);
    }
  }
});

// A car that can't get up a hill: the lap model holds it at the 0.1 m/s floor there, which makes for a lap time that
// means nothing. That must be reported (S.stall, carried on snapshots as warn.stall), and never happen on a normal lap.
test('lap: a car too weak for a climb is reported as stalled; a normal hilly lap is not', t => {
  const run = (params, H) => { const tr = core.TRACKS[0], ctrl = core.genCtrl(tr.seed, WIDTH), u = core.genElev(tr.seed, ctrl);
    const T = core.buildTrack(withZ(ctrl, u.map(x => H * x)), WIDTH), car = core.buildCar(params, { loads: true }), B = core.makeBounds(T, car), off = new Float64Array(T.N);
    for (let i = 0; i < T.N; i++) off[i] = Math.min(B.hi[i], Math.max(B.lo[i], 0));
    const S = core.makeScratch(T.N), lap = core.lapEval(T, car, off, S); return { lap, S }; };
  const weak = run({ ...core.CARS['Road car'], power: 40, mass: 2400 }, 80), ok = run(core.CARS['Road car'], 40);
  t.diagnostic(`40 kW / 2400 kg on 80 m hills: lap ${weak.lap.toFixed(1)} s, ${weak.S.stall} stations at the floor; Road car on 40 m: lap ${ok.lap.toFixed(2)} s, ${ok.S.stall}`);
  assert.ok(weak.S.stall > 0, 'stall not reported');
  assert.equal(ok.S.stall, 0, 'a normal hilly lap reports a stall');
  assert.deepEqual([ok.S.air, ok.S.ntop], [0, 0], 'a normal hilly lap reports clamping');
});

// Climbing a long constant ramp, a constant-power car settles at its terminal speed, where P·η/(m·v) = g·sinθ + drag +
// rolling: solved here from the car's spec alone, not from the lap model's tables. It gets there exponentially, from
// below if it arrives slower and from above if faster, with the gap shrinking by exp(−Δs·|f′(v_t)|/v_t) over Δs
// (f(v) = the net acceleration, linearised at v_t). An EV (no gears) with 60 kW and full power from 20 km/h.
test('lap: up a constant ramp a constant-power car approaches its closed-form terminal speed at the closed-form rate', t => {
  const { G, RHO, CRR, ETA } = core, S = 2500, R = 120;
  for (const grade of [0.04, 0.08]) {
    const top = grade * S, zAt = s => s <= S ? grade * s : s <= S + Math.PI * R ? top : s <= 2 * S + Math.PI * R ? top - grade * (s - S - Math.PI * R) : 0;
    const T = core.buildTrack(stadium(S, R, zAt), WIDTH), car = core.buildCar({ ...core.CARS['EV saloon'], power: 60, evBase: 20 }, { loads: true });
    const N = T.N, Sc = core.makeScratch(N); core.lapEval(T, car, new Float64Array(N), Sc);
    const p = car.spec, m = p.mass, Pm = p.Pmax * ETA, kd = 0.5 * RHO * p.cda / m, rr = G * CRR, ds = T.L / N;
    const at = frac => Math.round(frac * S / ds), sin = T.dz[at(0.7)] / Math.hypot(ds, T.dz[at(0.7)]);
    let lo = 1, hi = 100; for (let k = 0; k < 200; k++) { const v = (lo + hi) / 2; if (Pm / (m * v) - G * sin - kd * v * v - rr > 0) lo = v; else hi = v; }
    const vt = lo, fp = -Pm / (m * vt * vt) - 2 * kd * vt, rate = Math.abs(fp) / vt;
    const gap = [0.5, 0.7, 0.9].map(f => Sc.v[at(f)] - vt), want = Math.exp(-0.2 * S * rate), got = [gap[1] / gap[0], gap[2] / gap[1]];
    t.diagnostic(`${grade * 100}% ramp: terminal ${vt.toFixed(3)} m/s; gap ${gap.map(g => g.toFixed(3)).join(', ')} m/s; ratio per 500 m ${got.map(r => r.toFixed(3)).join(', ')} (closed form ${want.toFixed(3)})`);
    for (const f of [0.5, 0.7, 0.9]) assert.ok(Math.abs(T.dz[at(f)] / ds - grade) < 1e-3 && Sc.fm[at(f)] === 1, `${grade}: the ramp is not a clean constant grade, or the speed there isn't set by the climb`);
    const side = Math.sign(gap[0]);
    assert.ok(gap.every(g => Math.sign(g) === side) && Math.abs(gap[2]) < Math.abs(gap[1]) && Math.abs(gap[1]) < Math.abs(gap[0]), `${grade}: not a one-sided approach to ${vt}: ${gap}`);
    for (const r of got) assert.ok(Math.abs(r / want - 1) < 0.1, `${grade}: approach ratio ${r} vs closed form ${want}`);
    assert.ok(Math.abs(gap[2]) / vt < 0.03, `${grade}: still ${(100 * gap[2] / vt).toFixed(2)}% from terminal speed`);
  }
});

// Hills cost time where physics says they should, end to end: against the same stadium flat, a 4% ramp up one straight
// and down the other makes the climb slower and the descent faster, and the lap slower overall (time is convex in
// speed, so the climb loses more than the descent gives back).
test('lap: a climb is slower and a descent faster than the same straight flat, and the lap is slower', t => {
  const S = 1500, R = 120, g = 0.04, top = g * S, ramp = s => s <= S ? g * s : s <= S + Math.PI * R ? top : s <= 2 * S + Math.PI * R ? top - g * (s - S - Math.PI * R) : 0;
  for (const name of ['Road car', 'GT racer']) {
    const run = zAt => { const T = core.buildTrack(stadium(S, R, zAt), WIDTH), car = core.buildCar(core.CARS[name], { loads: !T.flat }), N = T.N, Sc = core.makeScratch(N);
      const lap = core.lapEval(T, car, new Float64Array(N), Sc), sec = (s0, s1) => { let tt = 0; for (let i = Math.ceil(s0 / T.ds); i < Math.floor(s1 / T.ds); i++) tt += 2 * Sc.ds[i] / (Sc.v[i] + Sc.v[(i + 1) % N]); return tt; };
      return { flat: T.flat, lap, up: sec(0, S), down: sec(S + Math.PI * R, 2 * S + Math.PI * R) }; };
    const f = run(() => 0), h = run(ramp);
    t.diagnostic(`${name}: climb ${h.up.toFixed(3)} s vs ${f.up.toFixed(3)} flat, descent ${h.down.toFixed(3)} vs ${f.down.toFixed(3)}, lap ${h.lap.toFixed(3)} vs ${f.lap.toFixed(3)}`);
    assert.deepEqual([f.flat, h.flat], [true, false]);
    assert.ok(h.up > f.up, `${name}: the climb isn't slower`);
    assert.ok(h.down < f.down, `${name}: the descent isn't faster`);
    assert.ok(h.lap > f.lap, `${name}: the hilly lap isn't slower`);
  }
});

// vCornerN binary-searches K(v) = kcrit(v, n(v)) over the speed nodes, which assumes K never rises with speed (as the
// flat tables are made to). Pinned across every preset, all three limit tables, grades and crest/compression radii from
// 20 m to 5 km; and the search agrees with a brute-force scan for the first crossing. If something new (banking,
// ride-height aero) breaks monotonicity, this fails instead of the search quietly returning some later crossing.
test('lap: the load-factor corner limit never rises with speed, and vCornerN finds its first crossing', () => {
  const { NT, VSTEP } = core, tn = new Float64Array(3), tl = new Float64Array(3), out = new Float64Array(2);
  const radii = [20, 30, 50, 80, 120, 200, 300, 500, 1000, 2000, 5000], kvs = [0, ...radii.map(r => 1 / r), ...radii.map(r => -1 / r)];
  let L; const K = (Kt, ii, c, kv) => { const v = ii * VSTEP, n = core.loadAt(c, kv, v, tn, L.nf); core.tab3(Kt, v, n, tl, L.l0); return tl[0]; };
  let pairs = 0, searches = 0;
  for (const [name, P] of Object.entries(core.CARS)) {
    const car = core.buildCar(P, { loads: true }), top = Math.floor(car.vTop / VSTEP) + 1; L = car.load; // vCornerN reads up to top
    for (const tab of ['kcrit', 'kcF', 'kcR']) for (const c of [1, 0.995, 0.98]) for (const kv of kvs) {
      let prev = K(L[tab], 1, c, kv);
      for (let ii = 2; ii <= top; ii++) { const k = K(L[tab], ii, c, kv); if (k > prev) assert.fail(`${name} ${tab} cth ${c} kv ${kv}: rises at node ${ii} (${prev} -> ${k})`); prev = k; pairs++; }
      if (tab !== 'kcrit') continue;
      for (const k of [1 / 15, 1 / 40, 1 / 100, 1 / 300, 1 / 1500]) {
        if (!(K(L.kcrit, 1, c, kv) > k) || K(L.kcrit, top, c, kv) > k) continue; // the search's own edge returns
        let ii = 2; while (K(L.kcrit, ii, c, kv) > k) ii++; // first node at or below k
        const Kl = K(L.kcrit, ii - 1, c, kv), Kh = K(L.kcrit, ii, c, kv), v = Math.min(car.vTop, (ii - 1 + (Kl - k) / (Kl - Kh)) * VSTEP);
        assert.equal(core.vCornerN(car, k, L.kcrit, c, kv, out), v, `${name} cth ${c} kv ${kv} k ${k}`); searches++;
      }
    }
  }
  const want = Object.values(core.CARS).reduce((s, P) => s + 3 * 3 * kvs.length * (Math.floor(core.buildCar(P).vTop / VSTEP) + 1 - 1), 0); // every car, table, grade and curvature; node pairs from 1 up to the car's top node
  assert.equal(pairs, want, `node pairs checked`);
  assert.ok(searches > 1000, `only ${searches} searches compared`);
});

// ---- dynamics (P4): the bicycle model on hills, consistent with the lap model

// Axle loads add up to the static weight at the load factor, plus downforce (transfer moves load between the axles).
test('dynamics: axle loads sum to m·g·n plus downforce', () => {
  for (const [name, P] of Object.entries(core.CARS)) {
    const dc = core.dynSetup(core.buildCar(P));
    for (const n of [0.2, 0.6, 1, 1.4]) for (const [v, ax] of [[20, 3], [50, -6]]) {
      const [Wf, Wr, DF] = core.axleLoads(dc, v, ax, n), want = dc.m * core.G * n + DF;
      assert.ok(Math.abs(Wf + Wr - want) < 1e-9 * want || Wf === 0 || Wr === 0, `${name} n ${n} v ${v}: ${Wf + Wr} vs ${want}`);
    }
  }
});

// The dynamic check on hills meets the same sanity bounds as on flat circuits (fraction in [0.85, 1], peak tyre use on
// the lap model's profile <= 1.15, clean final lap). Harrow Ring at 25 m on each car's converged flat line (a good line
// on the same plan view). Measured when written: fractions 91.6-100% (flat 91.3-99.1%), peak use <= 1.117.
test('dynamics: the dynamic check on a hilly circuit stays within the flat-circuit bounds', async t => {
  const f = loadFixedLines();
  for (const [key, input] of Object.entries(f.cases)) {
    if (input.trackName !== 'Harrow Ring' || input.hills !== 0) continue;
    const fx = await fixtureCase(key, input), name = fx.carName, hillKey = `${name}|Harrow Ring · hills 25 m`;
    const h = await fixtureCase(hillKey, f.cases[hillKey]), T = h.T, car = core.buildCar(fx.car, { loads: true });
    assert.deepEqual(h.ctrl.map(p => p.slice(0, 2)), fx.ctrl.map(p => p.slice(0, 2)), `${name}: hills keep the control-point plan view`);
    assert.equal(fx.off.length, T.N, 'hills keep the plan view, so the flat line fits');
    const dc = new core.DynCheck(T, car, fx.off); while (!dc.done) dc.step();
    const r = dc.result, d = r.dyn;
    t.diagnostic(`${name}: ${(r.frac * 100).toFixed(1)}%, peak use ${r.umax.toFixed(3)}`);
    assert.ok(r.frac >= 0.85 && r.frac <= 1, `${name}: fraction ${r.frac}`);
    assert.ok(r.umax <= 1.15, `${name}: peak tyre use ${r.umax}`);
    assert.ok(d && d.complete && !d.spun && d.trouble.length === 0, `${name}: final lap not clean`);
  }
});

// The time-stepped car must load its tyres by the same load factor as the lap model. If it didn't, the lap model would
// promise grip in compressions (and over crests take less) that the car doesn't have, and the fraction collapses.
// Kestrel Point at 150 m, centreline. Measured when written: 89.1-97.2% here; with dynLap ignoring n, 81.3-91.6%.
test('dynamics: on big hills the dynamic car and the lap model agree on grip (fraction stays in bounds)', t => {
  const tr = core.TRACKS[1], ctrl = core.genCtrl(tr.seed, WIDTH), u = core.genElev(tr.seed, ctrl), T = core.buildTrack(withZ(ctrl, u.map(x => 150 * x)), WIDTH);
  for (const name of Object.keys(core.CARS)) {
    const car = core.buildCar(core.CARS[name], { loads: true }), dc = new core.DynCheck(T, car, new Float64Array(T.N)); while (!dc.done) dc.step();
    t.diagnostic(`${name}: ${(dc.result.frac * 100).toFixed(1)}%`);
    assert.ok(dc.result.frac >= 0.85 && dc.result.frac <= 1, `${name}: fraction ${dc.result.frac}`);
  }
});

// Gravity in the time-stepped car matches the driver's feedforward: on a 6% ramp it tracks its target speed as closely
// as on the flat. If either side lacked m·g·sinθ, the speed controller (1.5 s⁻¹) would settle ~g·sinθ/1.5 = 0.4 m/s
// off. Measured when written: 0.033 m/s mean error climbing and descending; 0.34-0.38 m/s with no gravity in dynLap.
test('dynamics: up and down a ramp the dynamic car holds its target speed', t => {
  const S = 1500, R = 120, g = 0.06, top = g * S, z = s => s <= S ? g * s : s <= S + Math.PI * R ? top : s <= 2 * S + Math.PI * R ? top - g * (s - S - Math.PI * R) : 0;
  const T = core.buildTrack(stadium(S, R, z), WIDTH), car = core.buildCar(core.CARS['GT racer'], { loads: true });
  const dc = new core.DynCheck(T, car, new Float64Array(T.N)), r = dc.lap(0.9, false);
  const err = s0 => { let e = 0, n = 0; for (let i = Math.round((s0 + 0.3 * S) / T.ds); i < Math.round((s0 + 0.8 * S) / T.ds); i++) { e += Math.abs(r.stV[i] - 0.9 * dc.vq[i]); n++; } return e / n; };
  const up = err(0), down = err(S + Math.PI * R);
  t.diagnostic(`mean |v - target|: climbing ${up.toFixed(3)} m/s, descending ${down.toFixed(3)} m/s`);
  assert.ok(r.complete && !r.spun, 'lap not completed');
  assert.ok(up < 0.1 && down < 0.1, `speed error climbing ${up}, descending ${down}`);
});

// Inverse dynamics loads the tyres by the load factor too: where the lap model slowed a corner for a crest, the
// tyres are at their (reduced) limit, not at the fraction of a 1 g limit they'd be at if the crest were ignored.
// Kestrel Point at 250 m. Measured when written: use 1.03 at corner-limited stations with n < 0.8 (0.75 if ignored).
test('dynamics: over a crest the inverse dynamics finds the tyres at their reduced limit', t => {
  const tr = core.TRACKS[1], ctrl = core.genCtrl(tr.seed, WIDTH), u = core.genElev(tr.seed, ctrl), T = core.buildTrack(withZ(ctrl, u.map(x => 250 * x)), WIDTH);
  for (const name of ['GT racer', 'Road car']) {
    const car = core.buildCar(core.CARS[name], { loads: true }), N = T.N, dc = new core.DynCheck(T, car, new Float64Array(N)), S = core.makeScratch(N);
    core.lapEval(T, car, new Float64Array(N), S);
    const low = [];
    for (let i = 0; i < N; i++) if (S.ff[i] === 0 && S.fb[i] === 0 && T.cth[i] + S.v[i] * S.v[i] * T.kv[i] / core.G < 0.8) low.push(Math.max(dc.uf[i], dc.ur[i]));
    const mean = low.reduce((a, b) => a + b, 0) / low.length;
    t.diagnostic(`${name}: ${low.length} corner-limited stations with n < 0.8, mean tyre use ${mean.toFixed(3)}`);
    assert.ok(low.length > 0, `${name}: no crest-limited corner on this circuit`);
    assert.ok(mean >= 0.9 && mean <= 1.15, `${name}: tyre use ${mean} at crest-limited corners`);
  }
});

// Playback on hills: a lap pose's height interpolates the line's heights within the station segment, and its grade
// is rise over run in plan (the 3D step ds carries the rise: run = √(ds² − dz²)).
test('pose: height and grade on a hilly lap snapshot', () => {
  const tr = core.TRACKS[0], ctrl = core.genCtrl(tr.seed, WIDTH), u = core.genElev(tr.seed, ctrl), ev = [], s = new core.Solver(e => ev.push(e));
  s.handle({ type: 'setCar', rev: 1, params: { ...core.CARS['GT racer'] } });
  s.handle({ type: 'setTrack', rev: 2, ctrl: withZ(ctrl, u.map(x => 30 * x)), width: WIDTH, keepLine: false });
  const L = ev.filter(e => e.type === 'snapshot').at(-1).line, N = L.pz.length;
  let checked = 0;
  for (let i = 0; i < N; i += 37) for (const f of [0, 0.25, 0.8]) {
    const p = core.stationPose(L, i, f), j = (i + 1) % N, dz = L.pz[j] - L.pz[i];
    assert.ok(Math.abs(p.z - (L.pz[i] + dz * f)) < 1e-12, `z at station ${i} + ${f}`);
    assert.ok(Math.abs(p.grade - dz / Math.sqrt(L.ds[i] ** 2 - dz ** 2)) < 1e-12, `grade at station ${i}`);
    checked++;
  }
  assert.ok(checked > 50 && L.pz.some(z => z !== 0));
  const flat = core.stationPose({ ...L, pz: undefined }, 3, 0.5); // a snapshot from before elevation has no heights
  assert.deepEqual([flat.z, flat.grade], [0, 0]);
});

// A11: a dynamic trace records the track height under the car, so a trace plays back in 3D. The height is the
// centreline's, interpolated between the stations the observation sits between (level cross-section).
function tracedLap(hills) {
  const { T, car } = setupPreset(core, 'GT racer', { hills }), dc = core.dynSetup(car), check = new core.DynCheck(T, car, new Float64Array(T.N));
  const r = core.dynLap(T, car, dc, check.line, Float64Array.from(check.vq, x => x * 0.85), true);
  assert.ok(r.complete && !r.spun, `${hills} m hills: lap not clean`);
  return { T, tr: r.trace, info: core.describeCar(car) };
}

test('pose: a dynamic trace records height; each sample lies on its station segment (25 m hills)', () => {
  const { T, tr } = tracedLap(25), N = T.N, n = tr.t.length;
  assert.ok(n > 500 && tr.z.length === n, `z has ${tr.z && tr.z.length} samples for ${n}`);
  assert.ok(Math.max(...T.z) - Math.min(...T.z) > 5, 'the circuit has hills');
  let moved = 0;
  for (let k = 0; k < n; k++) {
    // the observation's segment is the station the car is nearest, or the one before it (the car is still behind the station)
    const within = seg => { const a = T.z[seg], b = T.z[(seg + 1) % N]; return tr.z[k] >= Math.min(a, b) - 1e-9 && tr.z[k] <= Math.max(a, b) + 1e-9; };
    assert.ok(within(tr.st[k]) || within((tr.st[k] - 1 + N) % N), `z[${k}] = ${tr.z[k]} off the segments at station ${tr.st[k]}`);
    // interpolated: off both candidate endpoint heights (without interpolation z is always one of them)
    if (tr.z[k] !== T.z[tr.st[k]] && tr.z[k] !== T.z[(tr.st[k] - 1 + N) % N]) moved++;
  }
  assert.ok(moved > n / 2, `only ${moved} of ${n} samples are between station heights (is z interpolated?)`);
});

test('pose: trace height is continuous along a hilly lap, and 0 for a trace without z', () => {
  const { tr, info } = tracedLap(25), t0 = tr.t[0], t1 = tr.t.at(-1), M = 4000;
  let prev = core.pose(tr, t0, info).z, worst = 0, lo = Infinity, hi = -Infinity;
  for (let q = 1; q <= M; q++) {
    const z = core.pose(tr, t0 + (t1 - t0) * q / M, info).z;
    worst = Math.max(worst, Math.abs(z - prev)); prev = z; lo = Math.min(lo, z); hi = Math.max(hi, z);
  }
  assert.ok(worst < 0.5, `pose z jumps ${worst} m between samples`);
  assert.ok(hi - lo > 5, `pose z only spans ${lo}..${hi}`);
  for (const k of [0, 100, 300]) assert.equal(core.pose(tr, tr.t[k], info).z, tr.z[k], 'at a sample the pose is the sample');
  const old = { ...tr }; delete old.z;
  assert.equal(core.pose(old, tr.t[100], info).z, 0, 'an older trace has no heights: z = 0');
});

test('pose: on a flat circuit every trace height is exactly 0', () => {
  const { tr, info } = tracedLap(0);
  assert.ok(tr.z.length === tr.t.length && tr.z.length > 500);
  assert.ok(tr.z.every(z => z === 0), 'a flat trace has a nonzero z');
  assert.equal(core.pose(tr, tr.t[200], info).z, 0);
});

// Where a hilly track meets a car (deferred A10): both callers evaluate a lap while being set up, so a car built
// without load tables is refused at construction, not on some later step.
test('a hilly circuit with a car built without load tables is refused at setup and construction', () => {
  const ctrl = core.genCtrl(core.TRACKS[0].seed, WIDTH), u = core.genElev(core.TRACKS[0].seed, ctrl);
  const T = core.buildTrack(withZ(ctrl, u.map(x => 40 * x)), WIDTH), car = core.buildCar(core.CARS['GT racer']), off = new Float64Array(T.N);
  assert.equal(T.flat, false);
  const msg = /needs a car built with \{loads: true\}/;
  assert.throws(() => new core.Optimizer().setup(T, car, core.makeBounds(T, car), off), msg, 'Optimizer.setup');
  assert.throws(() => new core.DynCheck(T, car, off), msg, 'DynCheck');
});

// Closed forms for the hill terms that otherwise only the bit-exact goldens guard (elevation review E-L6), so a physics
// change that regenerates the goldens can't carry a wrong term in with it. One circuit: a stadium whose first straight
// is a parabolic crest, z = −x²/(2·RV) (z'' = −1/RV exactly, which a cubic spline reproduces; slopes to 25 %), level
// elsewhere. Checks stay 150 m inside the straight, clear of the spline's ringing at its kinked ends.
// Not covered on purpose: kv's 5-station smoothing. On a smooth profile it changes nothing a closed form can see (the
// unsmoothed crest is within 0.04 %), and its station-to-station roughness on the presets overlaps with and without it
// (0.11–0.46 against 0.12–0.84), so no threshold would be more than fitted. The goldens guard it.
const CREST = (() => {
  const S = 1000, R = 120, RV = 2000, zAt = s => s < S ? -((s - S / 2) ** 2) / (2 * RV) : -((S / 2) ** 2) / (2 * RV);
  const T = core.buildTrack(stadium(S, R, zAt), WIDTH), slope = s => -(s - S / 2) / RV, on = [];
  for (let i = 0; i < T.N; i++) if (i * T.ds >= 150 && i * T.ds <= S - 150) on.push(i);
  return { S, RV, T, slope, on };
})();

test('track: vertical curvature at a crest apex is −1/RV', () => {
  const { T, S, RV } = CREST;
  for (let i = 0; i < T.N; i++) if (Math.abs(i * T.ds - S / 2) <= 50) // slope ≤ 2.5 %, so z'' and true curvature agree
    assert.ok(Math.abs(T.kv[i] * RV + 1) < 0.005, `station ${i}: kv ${T.kv[i]}, expected ${-1 / RV}`);
});

test('track: cos-grade on the crest is 1/√(1 + slope²), the slope taken mid-step', () => {
  const { T, slope, on } = CREST;
  for (const i of on) { const g = slope(i * T.ds + T.ds / 2), c = 1 / Math.sqrt(1 + g * g);
    assert.ok(Math.abs(T.cth[i] - c) < 2e-4, `station ${i}: cth ${T.cth[i]}, expected ${c}`); }
});

// The cth term of n = cth + v²·kv/g in the corner-speed solve, with a cth from buildTrack: a linear tyre and no
// downforce corner at v = √(μ·g·cth / k) on a grade (the crest test above passes cth = 1, so it can't see this term).
test('lap: corner speed on a grade matches v = √(μg·cth / k), with cth from the track', () => {
  const { T, on } = CREST, car = core.buildCar({ ...core.CARS['Road car'], mu: 1, sens: 0, cla: 0 }, { loads: true });
  const i = on[0], c = T.cth[i], k = 1 / 60, v = core.vCornerN(car, k, car.load.kcrit, c, 0, new Float64Array(2));
  assert.ok(c < 0.99, `the station should be steep enough to matter (0.5 % from cth = 1): cth ${c}`);
  assert.ok(Math.abs(v / Math.sqrt(core.G * c / k) - 1) < 0.002, `${v} vs ${Math.sqrt(core.G * c / k)} (cth ${c})`);
});

test('dynamics: the grade sine at a station is the slope there, sin θ = s/√(1 + s²) (central, not one-sided)', () => {
  const { T, slope, on } = CREST, sn = core.grades(T).sn;
  for (const i of on) { const g = slope(i * T.ds), s = g / Math.sqrt(1 + g * g); // one-sided is ds/(2·RV) = 1e-3 off
    assert.ok(Math.abs(sn[i] - s) < 2e-4, `station ${i}: sn ${sn[i]}, expected ${s}`); }
});

// With v² linear in distance along the road (3D), the path acceleration is exactly half its slope; dynNominal's ax is
// that plus g·sin θ. Measured on plan steps instead, it would be 1/cos θ too large (2 % at 20 % grade).
test('dynamics: dynNominal takes the path acceleration along the road, not its plan view', () => {
  const { T, on } = CREST, car = core.buildCar(core.CARS['GT racer'], { loads: true }), line = new core.DynCheck(T, car, new Float64Array(T.N)).line;
  const s3 = new Float64Array(T.N); for (let i = 1; i < T.N; i++) s3[i] = s3[i - 1] + line.ds3[i - 1];
  const B = 2, v = Float64Array.from(s3, s => Math.sqrt(400 + B * s)), nom = core.dynNominal(car, core.dynSetup(car), line, v);
  for (const i of on) assert.ok(Math.abs((nom.ax[i] - core.G * line.sn[i]) / (B / 2) - 1) < 1e-9, `station ${i}: ax ${nom.ax[i]}`);
});

// The time-stepped car, driving 90 % of the lap model's speeds, should match that profile's own time as closely on the
// crest as on the same stadium laid flat (measured: 0.23 % and 0.25 %). Covering plan ground at v rather than v·cos θ
// finishes the crest early (−0.16 %).
test('dynamics: dynLap follows a hilly lap as closely as the same lap flat', () => {
  const gap = (T, car) => {
    const d = new core.DynCheck(T, car, new Float64Array(T.N)), st = d.line.ds3 || d.line.ds, r = d.lap(0.9, false);
    let t = 0; for (let i = 0; i < T.N; i++) t += 2 * st[i] / (0.9 * (d.vq[i] + d.vq[(i + 1) % T.N]));
    assert.ok(r.complete, 'lap completes'); return r.t / t - 1;
  };
  const flat = core.buildTrack(stadium(CREST.S, 120, () => 0), WIDTH);
  const gF = gap(flat, core.buildCar(core.CARS['GT racer'])), gH = gap(CREST.T, core.buildCar(core.CARS['GT racer'], { loads: true }));
  assert.ok(Math.abs(gH - gF) < 0.001, `gap to the target profile: hilly ${gH}, flat ${gF}`);
});

// Hills past what the lap model is built for (elevation review E-M2) are a circuit issue, shown over the map like a
// corner tighter than the track. Measured: generated hills at the slider's 40 m stay at 6.6–14.8 % and 427–967 m;
// alternating ±60 m by hand reaches 125–285 % and 9–29 m.
test('track: hills steeper than the model is built for are a circuit issue', () => {
  for (const tr of core.TRACKS) {
    const c = core.genCtrl(tr.seed, WIDTH), u = core.genElev(tr.seed, c);
    assert.equal(core.buildTrack(withZ(c, u.map(x => 40 * x)), WIDTH).issue, null, `${tr.name} at 40 m`);
    const wild = core.buildTrack(withZ(c, c.map((_, i) => i % 2 ? 60 : -60)), WIDTH).issue;
    assert.match(wild, /^Steeper hills than the model is built for \(a \d+% grade and a \d+ m crest or dip;/, `${tr.name} at ±60 m`);
  }
  const grade = dz => core.hillIssue({ N: 3, ds: 100, dz: [0, dz, 0], kv: [0, 0, 0] });
  assert.equal(grade(24.9), null, '24.9% grade is within the 25% limit');
  assert.match(grade(-25.1), /\(a \d+% grade;/, '25.1% grade exceeds the 25% limit');
  assert.match(grade(31.6), /\(a 32% grade; it handles up to 25% and 50 m\)/, '31.6% grade rounds to 32%');
  const T = { N: 3, ds: 4, dz: [0, 0.5, 0], kv: [0, -1 / 40, 0] }; // 12.5 %, a 40 m crest
  assert.match(core.hillIssue(T), /\(a 40 m crest or dip;/);
  assert.equal(core.hillIssue({ ...T, dz: [0, 1, 0], kv: [0, -1 / 50, 0] }), null, 'exactly at the limits is fine');
});

// The load levels' GGV is solved by Illinois regula falsi rather than bisection: about twice as fast to build, to the
// same precision. Flat (n = 1) stays bisection, bit for bit. Checked on every preset at four load levels.
test('car: the load levels\' GGV by Illinois matches bisection within its precision', () => {
  const tol = 2 * 8 * core.G / 2 ** 24; // bisection's own bracket at 24 steps, twice
  for (const [name, P] of Object.entries(core.CARS)) for (const n of [0, 0.5, 1.5, 2]) {
    const p = core.carSpec(P), a = core.gripTables(p, n), b = core.gripTables(p, n, true);
    for (const k of ['ggB', 'ggT']) { let d = 0; for (let i = 0; i < a[k].length; i++) d = Math.max(d, Math.abs(a[k][i] - b[k][i])); assert.ok(d <= tol, `${name} n=${n} ${k}: ${d}`); }
    for (const k of ['alat', 'brk', 'trc', 'kcrit', 'kcF', 'kcR']) assert.deepEqual(a[k], b[k], `${name} n=${n} ${k} is not solved by Illinois`);
  }
});
// At the lateral limit (q = 1) the traction margin can start a rounding error below 0 and still rise at first, as load
// moves onto the driven axle: the answer is the far crossing, as bisection (which never checks fn(0)) gives.
test('car: Illinois takes 0 as valid, as bisection does, where the margin first rises', () => {
  const hump = a => (a === 0 ? -1e-12 : a * (3 - a)); // crosses at 0 and 3
  assert.ok(Math.abs(core.solveDec(hump, 8, 24) - 3) < 1e-5);
  assert.ok(Math.abs(core.solveIll(hump, 8, 8 / 2 ** 24) - 3) < 1e-5);
  const p = core.carSpec(core.CARS['GT racer']), i = (57 / core.VSTEP) * core.NQ + (core.NQ - 1); // v 57 m/s, q = 1, n = 2
  const ill = core.gripTables(p, 2).ggT[i], bis = core.gripTables(p, 2, true).ggT[i];
  assert.ok(bis > 2 && Math.abs(ill - bis) < 1e-5, `GT racer traction at n=2, 57 m/s, q=1: ${ill} vs ${bis}`);
});

// Over a crest a downforce car's tyres carry DF + m·g·n, so grip lasts below n = 0 until both axles' loads reach zero
// (review E-M1); the tables used to stop at n = 0, giving downforce-only grip however hard the crest unloaded the car.
// Now each car's tables reach down to its floor, the level where both axles carry nothing at every speed a lookup reads
// (up to the node above top speed): there every limit is exactly 0, and one level up some speed still has grip.
test('car: load tables reach down to zero grip, and no further', () => {
  const { NT, NQ, NSTEP, VSTEP } = core;
  const nameDF = 'Constructed downforce', df = {mass:1000,cg:0.3,track:1.6,wb:3,rear:50,rollF:50,power:400,pt:'ICE',gears:6,
    v1:100,vTopG:300,nT:60,nRed:110,evBase:100,evMax:300,drive:'AWD',cla:4,aeroF:50,cda:1,brakeF:50,mu:1.5,sens:0.15,shiftT:0.1,yawDI:1,slipPk:6};
  for (const [name, P] of [...Object.entries(core.CARS), [nameDF, df]]) {
    const car = core.buildCar(P, { loads: true }), L = car.load, top = Math.floor(car.vTop / VSTEP) + 1;
    assert.ok(Number.isInteger(L.l0) && L.l0 <= 0 && !Object.is(L.l0, -0), `${name}: l0 ${L.l0}`);
    if (name === nameDF) assert.ok(L.l0 < 0, 'constructed downforce needs negative load levels');
    if (P.cla === 0) { assert.equal(L.l0, 0, `${name}: no downforce, floor at n = 0`); continue; }
    const at = (k, l, w) => L[k].subarray((l - L.l0) * w, (l - L.l0 + 1) * w);
    for (const [k, w, from] of [['alat', NT, 0], ['kcrit', NT, 1], ['ggB', NT * NQ, 0], ['ggT', NT * NQ, 0]]) // kcrit = alat/v² is ∞ at v = 0
      assert.ok(at(k, L.l0, w).subarray(from, (top + 1) * (w / NT)).every(x => x === 0), `${name} ${k}: not zero at the floor n = ${L.l0 * NSTEP}`);
    assert.ok(at('alat', L.l0 + 1, NT).subarray(0, top + 1).some(x => x > 0), `${name}: the floor is lower than it needs to be`);
  }
});
