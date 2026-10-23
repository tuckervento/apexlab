// ARCHITECTURE.md §8.1: lapEval's hand-written adjoint gradient vs a central finite difference along a random
// smooth direction, hard (tau = 0) and softened (tau = 0.5), for every car preset on Harrow Ring at 12 m.
// The error is measured against the gradient's own scale, Σ|grad_i·d_i|, not the net directional derivative:
// along a random direction the per-station terms can cancel (166,000× for the Open-wheeler), and the FD's
// roundoff (~1e-12 s in the lap time, so ~1e-8 at h = 1e-6) is fixed in absolute terms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, setupPreset } from './load-core.mjs';

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
