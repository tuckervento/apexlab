// ARCHITECTURE.md §8.2: drive Optimizer.step() until converged, polish included, for the GT racer on Harrow Ring
// at 12 m. No try/catch around step(): an exception (like the missing Optimizer.clamp that once froze the page at
// convergence) fails the test. The golden lap time is reported, not asserted (pinning it is §8.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, setupPreset } from './load-core.mjs';

// REF_LAP: this procedure's result in Node v26.12.0. Other runtimes differ by tens of ms (investigations/golden-lap.md).
const MAX_STEPS = 5e6, REF_LAP = 78.3771;

test('convergence: GT racer, Harrow Ring, 12 m', { timeout: 10 * 60 * 1000 }, t => {
  const core = loadCore(), { T, B, car } = setupPreset(core, 'GT racer'), N = T.N;
  // as rebuildTrack(false): centreline, clamped to the usable range
  const off = new Float64Array(N);
  for (let i = 0; i < N; i++) off[i] = Math.min(B.hi[i], Math.max(B.lo[i], 0));
  const centreLap = core.lapEval(T, car, off, core.makeScratch(N));

  const opt = new core.Optimizer(), t0 = performance.now();
  opt.setup(T, car, B, off);
  let steps = 0;
  while (!opt.converged) {
    if (steps >= MAX_STEPS) {
      const s = opt.stageInfo;
      assert.fail(`not converged after ${steps} steps: stage ${s.n}/${s.of} (knot ${s.knot} m), evals=${opt.evals}, lap=${opt.best}`);
    }
    opt.step();
    steps++;
  }
  const secs = (performance.now() - t0) / 1000;

  assert.equal(opt.converged, true);
  assert.ok(opt.polish, 'converged without running the polish stage');
  for (let i = 0; i < N; i++)
    assert.ok(off[i] >= B.lo[i] && off[i] <= B.hi[i], `station ${i}: offset ${off[i]} outside [${B.lo[i]}, ${B.hi[i]}] after convergence`);
  const lap = opt.exactLap();
  assert.ok(Number.isFinite(lap), `exactLap() is ${lap}`);
  assert.ok(lap < centreLap, `optimised lap ${lap} is not faster than the centreline ${centreLap}`);

  t.diagnostic(`exact lap=${lap.toFixed(4)} s  pre-clamp best=${opt.best.toFixed(4)} s  clamp delta=${(lap - opt.best).toExponential(2)} s`);
  t.diagnostic(`vs reference ${REF_LAP} s: ${(lap - REF_LAP >= 0 ? '+' : '') + (lap - REF_LAP).toFixed(3)} s  centreline=${centreLap.toFixed(4)} s`);
  t.diagnostic(`steps=${steps}  evals=${opt.evals}  wall=${secs.toFixed(1)} s`);
});
