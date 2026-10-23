// ARCHITECTURE.md §8.3, 8.5, 8.6 against tests/golden.json (generate with: node tests/make-golden.mjs --write).
// - centreline: lap time on the clamped centreline for every car × circuit, bit-exact.
// - per combo, on the committed converged line (fixture):
//     property: sanity bounds that every preset meets (the documented tighter ranges only hold for some cars, §8.5/8.6);
//     golden:   lap time and the whole dynamic-check result, bit-exact.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, setupPreset } from './load-core.mjs';
import { loadGolden, assertRuntime, comboKey, clampedZeros, dynSummary } from './golden-util.mjs';

const FRAC_MIN = 0.85, UMAX_MAX = 1.15;
const core = await loadCore(), g = loadGolden(), { CARS, TRACKS } = core;
const combos = Object.keys(CARS).flatMap(car => TRACKS.map(track => ({ car, track, key: comboKey(car, track.name) })));

test('golden: centreline laps, all cars × circuits', () => {
  assertRuntime(g);
  const bad = [];
  for (const { car, track, key } of combos) {
    const { T, B, car: c } = setupPreset(core, car, { seed: track.seed });
    const lap = core.lapEval(T, c, clampedZeros(B, T.N), core.makeScratch(T.N)), want = g.combos[key]?.centreLap;
    if (lap !== want) bad.push(`${key}: ${lap} !== ${want}`);
  }
  assert.deepEqual(bad, [], `centreline laps differ from goldens:\n${bad.join('\n')}`);
});

for (const { car, track, key } of combos) {
  describe(key, () => {
    let T, B, off, s, centreLap;
    before(() => {
      const fx = g.combos[key];
      if (!fx) throw new Error(`no fixture for ${key} in goldens; regenerate with node tests/make-golden.mjs --write`);
      const p = setupPreset(core, car, { seed: track.seed });
      ({ T, B } = p);
      off = Float64Array.from(fx.off);
      centreLap = core.lapEval(T, p.car, clampedZeros(B, T.N), core.makeScratch(T.N));
      s = dynSummary(core, T, p.car, off);
    });

    test('property', t => {
      t.diagnostic(`lap=${s.lap.toFixed(4)} s  frac=${s.frac.toFixed(4)}  umax=${s.umax.toFixed(3)} (${s.uaxle})`);
      assert.equal(off.length, T.N, 'fixture length ≠ station count');
      for (let i = 0; i < T.N; i++) assert.ok(off[i] >= B.lo[i] && off[i] <= B.hi[i], `fixture station ${i} outside [${B.lo[i]}, ${B.hi[i]}]: ${off[i]}`);
      assert.ok(s.lap < centreLap, `fixture lap ${s.lap} not faster than centreline ${centreLap}`);
      assert.ok(s.frac >= FRAC_MIN && s.frac <= 1, `dynamic check fraction ${s.frac} outside [${FRAC_MIN}, 1]`);
      assert.ok(s.umax <= UMAX_MAX, `inverse-dynamics utilisation ${s.umax} (${s.uaxle}, station ${s.uat}) > ${UMAX_MAX}`);
      assert.ok(s.fin && s.fin.complete && !s.fin.spun && s.fin.trouble === 0, `final lap at frac ${s.frac} not clean: ${JSON.stringify(s.fin)}`);
    });

    test('golden', () => {
      assertRuntime(g);
      const { N, centreLap: _c, evals, steps, off: _o, ...want } = g.combos[key];
      assert.deepEqual(s, want);
    });
  });
}
