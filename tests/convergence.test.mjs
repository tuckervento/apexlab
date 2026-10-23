// ARCHITECTURE.md §8.2: drive Optimizer.step() until converged, polish included, for the GT racer on Harrow Ring
// at 12 m. No try/catch around step(): an exception (like the missing Optimizer.clamp that once froze the page at
// convergence) fails the test. §8.3: the result (lap, effort and the line itself) must match the golden fixture
// bit for bit; goldens are per-runtime (investigations/golden-lap.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, setupPreset } from './load-core.mjs';
import { loadGolden, assertRuntime, comboKey, clampedZeros } from './golden-util.mjs';

const MAX_STEPS = 5e6, CAR = 'GT racer';

test(`convergence: ${CAR}, Harrow Ring, 12 m`, { timeout: 10 * 60 * 1000 }, async t => {
  const core = await loadCore(), track = core.TRACKS[0], { T, B, car } = setupPreset(core, CAR, { seed: track.seed }), N = T.N;
  const off = clampedZeros(B, N); // as rebuildTrack(false)
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
  const secs = (performance.now() - t0) / 1000, lap = opt.exactLap();
  t.diagnostic(`exact lap=${lap.toFixed(4)} s  pre-clamp best=${opt.best.toFixed(4)} s  clamp delta=${(lap - opt.best).toExponential(2)} s  centreline=${centreLap.toFixed(4)} s`);
  t.diagnostic(`steps=${steps}  evals=${opt.evals}  wall=${secs.toFixed(1)} s`);

  await t.test('property', () => {
    assert.equal(opt.converged, true);
    assert.ok(opt.polish, 'converged without running the polish stage');
    for (let i = 0; i < N; i++)
      assert.ok(off[i] >= B.lo[i] && off[i] <= B.hi[i], `station ${i}: offset ${off[i]} outside [${B.lo[i]}, ${B.hi[i]}] after convergence`);
    assert.ok(Number.isFinite(lap), `exactLap() is ${lap}`);
    assert.ok(lap < centreLap, `optimised lap ${lap} is not faster than the centreline ${centreLap}`);
  });

  await t.test('golden', () => {
    const g = loadGolden();
    assertRuntime(g);
    const fx = g.combos[comboKey(CAR, track.name)];
    assert.deepEqual({ centreLap, lap, evals: opt.evals, steps }, { centreLap: fx.centreLap, lap: fx.lap, evals: fx.evals, steps: fx.steps });
    const diff = [];
    for (let i = 0; i < N; i++) if (off[i] !== fx.off[i]) diff.push(i);
    assert.equal(diff.length, 0, `converged line differs from the fixture at ${diff.length} stations (first: ${diff[0]})`);
  });
});
