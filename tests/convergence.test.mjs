// ARCHITECTURE.md §8.2: direct searches include polish and return feasible, independently scored lines.
// Budgets and one-sided quality policy: docs/investigations/search-budgets.md, Approval (Q).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';
import { fixtureCase } from './fixture-util.mjs';

const MAX_STEPS = 160000, MAX_EVALS = 160000, MAX_SECS = 120, CAR = 'GT racer';

for (const hills of [false, true]) test(`convergence: ${CAR}, Harrow Ring, 12 m${hills ? ', hills 25 m' : ''}`, { timeout: 180000 }, async t => {
  const core = await loadCore(), fx = await fixtureCase(`${CAR}|Harrow Ring${hills ? ' · hills 25 m' : ''}`);
  const T = fx.T, car = core.buildCar(fx.car, { loads: !T.flat }), B = core.makeBounds(T, car), N = T.N;
  const off = Float64Array.from(B.lo, (lo, i) => Math.min(B.hi[i], Math.max(lo, 0)));
  const centreLap = core.lapEval(T, car, off, core.makeScratch(N));
  assert.ok(fx.off.every((v, i) => v >= B.lo[i] && v <= B.hi[i]), 'fixture reference feasible');
  const referenceLap = core.lapEval(T, car, fx.off, core.makeScratch(N));
  assert.ok(centreLap - referenceLap > 1, 'reference improvement exceeds one second');

  const opt = new core.Optimizer(), stages = new Set(), t0 = performance.now();
  const budget = () => {
    assert.ok((performance.now() - t0) / 1000 <= MAX_SECS, 'search wall time <= 120 s');
    assert.ok(opt.evals <= MAX_EVALS, 'search evaluations <= 160000');
    assert.ok(steps <= MAX_STEPS, 'search steps <= 160000');
  };
  let steps = 0;
  opt.setup(T, car, B, off);
  while (!opt.converged) {
    budget();
    assert.ok(steps < MAX_STEPS, 'search converged within 160000 steps');
    stages.add(opt.stage + 1);
    opt.step(); steps++;
  }
  const line = opt.current(new Float64Array(N)), lap = opt.exactLap();
  budget();
  const secs = (performance.now() - t0) / 1000;
  const S = core.makeScratch(N), resultLap = core.lapEval(T, car, line, S);
  const gain = (centreLap - resultLap) / (centreLap - referenceLap);
  t.diagnostic(`lap=${lap}  fresh=${resultLap}  centreline=${centreLap}  reference=${referenceLap}  gain=${gain}`);
  t.diagnostic(`steps=${steps}  evals=${opt.evals}  stages=${stages.size}  polish=${!!opt.polish}  wall=${secs.toFixed(3)} s`);

  await t.test('property', () => {
    assert.equal(opt.converged, true);
    assert.ok(opt.polish, 'converged without running the polish stage');
    for (let i = 0; i < N; i++)
      assert.ok(off[i] >= B.lo[i] && off[i] <= B.hi[i], `station ${i}: offset ${off[i]} outside [${B.lo[i]}, ${B.hi[i]}] after convergence`);
    assert.ok(Number.isFinite(lap), `exactLap() is ${lap}`);
    assert.ok(lap < centreLap, `optimised lap ${lap} is not faster than the centreline ${centreLap}`);
  });

  await t.test('search contract', () => {
    assert.ok(opt.converged, 'search converged');
    assert.ok(line.every((v, i) => v >= B.lo[i] && v <= B.hi[i]), 'returned line inside bounds');
    for (const k of ['px', 'py', 'ds', 'k', 'vc', 'vf', 'vb', 'v'])
      assert.ok(S[k].every(Number.isFinite), `fresh ${k} finite`);
    for (const k of ['stall', 'air', 'ntop']) assert.ok(Number.isFinite(S[k]), `fresh ${k} finite`);
    assert.ok(Number.isFinite(resultLap) && resultLap > 0 && lap > 0, 'positive finite lap');
    // Absolute seconds: permits numerical roundoff without masking a changed reported time.
    assert.ok(Math.abs(lap - resultLap) <= 1e-9, 'reported lap matches fresh rescore within 1e-9 s');
    assert.ok(gain >= 0.9987, 'search gain >= 0.9987');
  });
});
