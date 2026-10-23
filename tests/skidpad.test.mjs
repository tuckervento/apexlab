// ARCHITECTURE.md §8.4: the dynamic model holds a constant-speed circle close to the lap model's lateral limit.
// Property: clean lap and mean lateral error ≤ 0.2 m up to 98% (measured 0.06–0.08 m). Golden: bit-exact results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';
import { SKIDPAD, skidpad, loadGolden, assertRuntime } from './golden-util.mjs';

const MAX_MEAN_E = 0.2, core = await loadCore();

for (const fr of SKIDPAD.fracs) {
  test(`skidpad: ${SKIDPAD.car}, ${SKIDPAD.R} m circle, ${fr * 100}% of v²`, async t => {
    const r = skidpad(core, SKIDPAD.car, fr);
    t.diagnostic(`mean|e|=${r.meanE.toFixed(4)} m  max|e|=${r.maxE.toFixed(4)} m  t=${r.t.toFixed(3)} s`);

    await t.test('property', () => {
      assert.ok(r.complete && !r.spun && r.trouble === 0, `lap not clean: complete=${r.complete} spun=${r.spun} trouble=${r.trouble}`);
      assert.ok(r.meanE <= MAX_MEAN_E, `mean lateral error ${r.meanE} m > ${MAX_MEAN_E} m`);
    });
    await t.test('golden', () => {
      const g = loadGolden();
      assertRuntime(g);
      assert.deepEqual(r, g.skidpad.results[fr]);
    });
  });
}
