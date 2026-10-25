// ARCHITECTURE.md §8.1: lapEval's hand-written adjoint gradient vs a central finite difference along a random
// smooth direction, hard (tau = 0) and softened (tau = 0.5), for every car preset on Harrow Ring at 12 m.
// The error is measured against the gradient's own scale, Σ|grad_i·d_i|, not the net directional derivative:
// along a random direction the per-station terms can cancel (166,000× for the Open-wheeler), and the FD's
// roundoff (~1e-12 s in the lap time, so ~1e-8 at h = 1e-6) is fixed in absolute terms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, setupPreset } from './load-core.mjs';
import { stadium } from './golden-util.mjs';

const H = 1e-6, SCALE_TOL = 1e-6; // a 0.1% gradient error at a single station of ~800 still fails
const core = await loadCore(), CAR_NAMES = Object.keys(core.CARS);

// Periodic smooth field: sum of 4 sinusoids in arc length with random integer wavenumbers and phases.
function smoothField(rnd, N, amp) {
  const f = new Float64Array(N), comps = [];
  for (let c = 0; c < 4; c++) comps.push({ n: 2 + Math.floor(rnd() * 18), ph: rnd() * 2 * Math.PI, a: amp * (0.5 + rnd()) / 2 });
  for (let i = 0; i < N; i++) for (const { n, ph, a } of comps) f[i] += a * Math.sin(2 * Math.PI * n * i / N + ph);
  return f;
}

for (const name of CAR_NAMES) {
  for (const tau of [0, 0.5]) {
    test(`gradient: ${name}, tau=${tau}`, t => {
      const { T, B, car } = setupPreset(core, name), N = T.N;
      const off = smoothField(core.mulberry32(1001), N, 0.5 * B.hw);
      for (let i = 0; i < N; i++) off[i] = Math.min(B.hi[i], Math.max(B.lo[i], off[i]));
      const d = smoothField(core.mulberry32(2002), N, 1);
      const dmax = d.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      for (let i = 0; i < N; i++) d[i] /= dmax;

      const S = core.makeScratch(N), grad = new Float64Array(N);
      const lap = core.lapEval(T, car, off, S, grad, tau);
      let Da = 0, scale = 0;
      for (let i = 0; i < N; i++) { Da += grad[i] * d[i]; scale += Math.abs(grad[i] * d[i]); }

      const S2 = core.makeScratch(N), xp = new Float64Array(N), xm = new Float64Array(N);
      for (let i = 0; i < N; i++) { xp[i] = off[i] + H * d[i]; xm[i] = off[i] - H * d[i]; }
      const Dfd = (core.lapEval(T, car, xp, S2, null, tau) - core.lapEval(T, car, xm, S2, null, tau)) / (2 * H);
      const err = Math.abs(Da - Dfd), rel = err / scale;
      t.diagnostic(`lap=${lap.toFixed(4)} s  D_a=${Da.toPrecision(10)}  D_fd=${Dfd.toPrecision(10)}  err/scale=${rel.toExponential(2)}  ` +
        `err/net=${(err / Math.abs(Da)).toExponential(2)}  cancellation=${(scale / Math.abs(Da)).toFixed(0)}x`);
      assert.ok(Number.isFinite(Da) && Number.isFinite(Dfd) && scale > 0, `degenerate derivative: D_a=${Da}, D_fd=${Dfd}, scale=${scale}`);
      assert.ok(rel < SCALE_TOL, `error/scale ${rel.toExponential(3)} ≥ ${SCALE_TOL} (D_a=${Da}, D_fd=${Dfd}, Σ|g·d|=${scale})`);

      if (tau !== 0) return; // coverage is only meaningful with hard (0/1) min weights
      // S still holds the analytic (unperturbed) run.
      let yaw = 0, shift = 0;
      for (let i = 0; i < N; i++) {
        const cornerLimited = i === S.i0 || (S.ff[i] === 0 && S.fb[i] === 0);
        if (S.wy[i] === 0 && S.dvy[i] !== 0 && cornerLimited) yaw++;
        if (S.sh[i] === 1 && S.fm[i] === 1) shift++;
      }
      t.diagnostic(`coverage: yaw-limited corner stations=${yaw}, forward-limited upshifts=${shift}`);
      assert.ok(yaw > 0, `yaw limit never binds at a corner-limited station for ${name}; gradient check doesn't exercise the yaw term`);
      if (car.shiftT > 0) assert.ok(shift > 0, `no upshift on a forward-limited station for ${name} (shiftT=${car.shiftT}); shift-loss gradient not exercised`);
      else t.diagnostic(`shift coverage skipped: shiftT=${car.shiftT}`);
    });
  }
}

// Elevation (migration step 8): the same check on Harrow Ring with hills at the slider's maximum (40 m), cars built
// with load tables. On top of the flat coverage it asserts that the hilly branches are exercised: corner speeds read
// at a load factor (one at a crest, n < 1), and forward- and brake-limited steps that include gravity's work.
const HILLS = 40;
function hillyPreset(name, hills = HILLS, trackIdx = 0) {
  const tr = core.TRACKS[trackIdx], ctrl = core.genCtrl(tr.seed, 12), u = core.genElev(tr.seed, ctrl);
  const T = core.buildTrack(ctrl.map((p, i) => [p[0], p[1], hills * u[i]]), 12), car = core.buildCar(core.CARS[name], { loads: true });
  return { T, car, B: core.makeBounds(T, car) };
}
for (const name of CAR_NAMES) {
  for (const tau of [0, 0.5]) {
    test(`gradient, hills ${HILLS} m: ${name}, tau=${tau}`, t => {
      const { T, B, car } = hillyPreset(name), N = T.N;
      assert.equal(T.flat, false);
      const off = smoothField(core.mulberry32(1001), N, 0.5 * B.hw);
      for (let i = 0; i < N; i++) off[i] = Math.min(B.hi[i], Math.max(B.lo[i], off[i]));
      const d = smoothField(core.mulberry32(2002), N, 1);
      const dmax = d.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      for (let i = 0; i < N; i++) d[i] /= dmax;

      const S = core.makeScratch(N), grad = new Float64Array(N);
      const lap = core.lapEval(T, car, off, S, grad, tau);
      let Da = 0, scale = 0;
      for (let i = 0; i < N; i++) { Da += grad[i] * d[i]; scale += Math.abs(grad[i] * d[i]); }
      const S2 = core.makeScratch(N), xp = new Float64Array(N), xm = new Float64Array(N);
      for (let i = 0; i < N; i++) { xp[i] = off[i] + H * d[i]; xm[i] = off[i] - H * d[i]; }
      const Dfd = (core.lapEval(T, car, xp, S2, null, tau) - core.lapEval(T, car, xm, S2, null, tau)) / (2 * H);
      const err = Math.abs(Da - Dfd), rel = err / scale;
      t.diagnostic(`lap=${lap.toFixed(4)} s  D_a=${Da.toPrecision(10)}  D_fd=${Dfd.toPrecision(10)}  err/scale=${rel.toExponential(2)}  cancellation=${(scale / Math.abs(Da)).toFixed(0)}x`);
      assert.ok(Number.isFinite(lap) && Number.isFinite(Da) && Number.isFinite(Dfd) && scale > 0, `degenerate: lap=${lap} D_a=${Da}, D_fd=${Dfd}, scale=${scale}`);
      assert.ok(rel < SCALE_TOL, `error/scale ${rel.toExponential(3)} ≥ ${SCALE_TOL} (D_a=${Da}, D_fd=${Dfd}, Σ|g·d|=${scale})`);

      if (tau !== 0) return;
      let cornerN = 0, crest = 0, fwdG = 0, bwdG = 0, nmin = Infinity, nmax = -Infinity;
      for (let i = 0; i < N; i++) {
        const n = T.cth[i] + S.v[i] * S.v[i] * T.kv[i] / core.G, j = (i + 1) % N, h = (i - 1 + N) % N;
        nmin = Math.min(nmin, n); nmax = Math.max(nmax, n);
        const cornerLimited = i === S.i0 || (S.ff[i] === 0 && S.fb[i] === 0);
        if (cornerLimited && !(T.cth[i] === 1 && T.kv[i] === 0)) { cornerN++; if (n < 1) crest++; }
        if (S.ff[j] === 1 && S.fm[j] === 1 && T.dz[i] !== 0) fwdG++;  // step i -> j set the speed at j, on a slope
        if (S.fb[h] === 1 && S.fm[h] === 0 && T.dz[h] !== 0) bwdG++;  // braking step h <- i set the speed at h
      }
      let yaw = 0, shift = 0;
      for (let i = 0; i < N; i++) {
        const cornerLimited = i === S.i0 || (S.ff[i] === 0 && S.fb[i] === 0);
        if (S.wy[i] === 0 && S.dvy[i] !== 0 && cornerLimited) yaw++;
        if (S.sh[i] === 1 && S.fm[i] === 1) shift++;
      }
      t.diagnostic(`coverage: corner-limited at a load factor=${cornerN} (crest ${crest}), forward-limited on a slope=${fwdG}, brake-limited on a slope=${bwdG}, yaw-limited=${yaw}, upshifts=${shift}; n along the lap ${nmin.toFixed(2)}..${nmax.toFixed(2)}`);
      assert.ok(cornerN > 0 && crest > 0, `load-factor corner speeds not exercised (${cornerN}, crest ${crest})`);
      assert.ok(fwdG > 0 && bwdG > 0, `gravity in the passes not exercised (forward ${fwdG}, braking ${bwdG})`);
      assert.ok(yaw > 0, `yaw limit never binds at a corner-limited station for ${name} on hills`);
      if (car.shiftT > 0) assert.ok(shift > 0, `no forward-limited upshift for ${name} on hills`);
    });
  }
}

// Where the load factor leaves the table grid along the lap. The Open-wheeler at 250 m on Kestrel Point (far past the
// slider) reaches n > 2 (clamped to the top). Airborne without downforce (n <= 0, no grip at all) needs a sharp crest
// on a near-straight: on curved crests the corner-speed solve keeps the tyres loaded (the Kart never leaves the
// ground on Kestrel Point even at 250 m), so the Kart case is a 20 m crest over 150 m on a stadium straight. The
// gradient must stay exact through the clamps; each case asserts that its clamp really happens.
function crestStadium(name) {
  const bump = s => { const x = s - 500; return Math.abs(x) < 75 ? 10 * (1 + Math.cos(2 * Math.PI * x / 150)) : 0; };
  const T = core.buildTrack(stadium(1000, 120, bump), 12), car = core.buildCar(core.CARS[name], { loads: true });
  return { T, car, B: core.makeBounds(T, car) };
}
for (const [name, clamp, where, setup] of [['Open-wheeler', 'ntop', 'hills 250 m on Kestrel Point', () => hillyPreset('Open-wheeler', 250, 1)],
  ['Kart', 'air', 'a sharp crest on a stadium straight', () => crestStadium('Kart')],
  ['GT racer', 'air', 'a sharp crest on a stadium straight, past its downforce floor (n < 0)', () => crestStadium('GT racer')]]) {
  for (const tau of [0, 0.5]) {
    test(`gradient, ${where} (load factor clamps): ${name}, tau=${tau}`, t => {
      const { T, B, car } = setup(), N = T.N;
      const off = smoothField(core.mulberry32(1001), N, 0.5 * B.hw);
      for (let i = 0; i < N; i++) off[i] = Math.min(B.hi[i], Math.max(B.lo[i], off[i]));
      const d = smoothField(core.mulberry32(2002), N, 1), dmax = d.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      for (let i = 0; i < N; i++) d[i] /= dmax;
      const S = core.makeScratch(N), grad = new Float64Array(N), lap = core.lapEval(T, car, off, S, grad, tau);
      let Da = 0, scale = 0;
      for (let i = 0; i < N; i++) { Da += grad[i] * d[i]; scale += Math.abs(grad[i] * d[i]); }
      const S2 = core.makeScratch(N), xp = new Float64Array(N), xm = new Float64Array(N);
      for (let i = 0; i < N; i++) { xp[i] = off[i] + H * d[i]; xm[i] = off[i] - H * d[i]; }
      const Dfd = (core.lapEval(T, car, xp, S2, null, tau) - core.lapEval(T, car, xm, S2, null, tau)) / (2 * H), rel = Math.abs(Da - Dfd) / scale;
      t.diagnostic(`lap=${lap.toFixed(3)} s  err/scale=${rel.toExponential(2)}  airborne steps=${S.air}  above the grid=${S.ntop}  stalled=${S.stall}`);
      assert.ok(Number.isFinite(lap) && grad.every(Number.isFinite), 'non-finite lap or gradient');
      assert.ok(S[clamp] > 0, `${clamp} clamp never hit; the case doesn't test what it says`);
      assert.ok(rel < SCALE_TOL, `error/scale ${rel.toExponential(3)} ≥ ${SCALE_TOL}`);
    });
  }
}
