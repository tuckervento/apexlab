// Simple car controls (src/app/simple.js): the knob mapping onto the 25 CarParams fields (docs/simple-controls.md,
// "Verification"). APEX_SRC=<dir> loads a modified copy of src/, as for the other tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCore } from './load-core.mjs';

const SRC = process.env.APEX_SRC || fileURLToPath(new URL('../src', import.meta.url));
const { SIMPLE, defaults, deriveParams } = await import(pathToFileURL(join(SRC, 'app/simple.js')).href);
const { SPEC } = await import(pathToFileURL(join(SRC, 'app/sliders.js')).href);
const core = { ...(await loadCore()), SPEC };
const { CARS } = core;
const BASES = Object.keys(CARS);

test('simple: centred knobs reproduce every preset bit for bit', () => {
  assert.equal(BASES.length, 6);
  for (const base of BASES) {
    const p = deriveParams(defaults(base));
    assert.deepEqual(p, { ...CARS[base] }, base);
    for (const k of Object.keys(CARS[base])) assert.ok(Object.is(p[k], CARS[base][k]), `${base}.${k}: ${p[k]} vs ${CARS[base][k]}`);
  }
});

// Every combination of choice knobs, with each numeric knob at its ends and centre.
const knob = k => SIMPLE.find(s => s.k === k);
function* grid() {
  const ends = k => [knob(k).min, 0, knob(k).max], opts = k => knob(k).opts.map(o => o[0]);
  for (const base of BASES) for (const pt of opts('pt')) for (const drive of opts('drive')) for (const tyre of opts('tyre'))
    for (const gearbox of opts('gearbox')) for (const weight of ends('weight')) for (const power of ends('power'))
      for (const downforce of ends('downforce')) for (const balance of ends('balance'))
        yield { base, weight, power, tyre, downforce, balance, pt, drive, gearbox };
}

test('simple: every knob setting gives a valid car inside the slider ranges', () => {
  const { carSpec, SPEC } = core;
  let n = 0;
  for (const s of grid()) {
    const p = deriveParams(s), at = JSON.stringify(s);
    assert.deepEqual(Object.keys(p).sort(), Object.keys(CARS[s.base]).sort(), at);
    assert.doesNotThrow(() => carSpec(p), at);
    for (const f of SPEC) {
      if (f.g) continue;
      if (f.seg) { assert.ok(f.seg.some(o => (Array.isArray(o) ? o[0] : o) === p[f.k]), `${f.k}=${p[f.k]} ${at}`); continue; }
      assert.ok(p[f.k] >= f.min && p[f.k] <= f.max, `${f.k}=${p[f.k]} outside [${f.min}, ${f.max}] ${at}`);
    }
    n++;
  }
  assert.equal(n, 6 * 2 * 2 * 5 * 4 * 3 ** 4);
});
