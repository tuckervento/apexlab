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

test('simple: a missing, unknown or out-of-range knob throws, naming it', () => {
  const ok = defaults('GT racer');
  assert.throws(() => defaults('Tractor'), /unknown base car Tractor/);
  assert.throws(() => deriveParams({ ...ok, base: 'Tractor' }), /base must be one of/);
  assert.throws(() => deriveParams({ ...ok, wings: 1 }), /unknown knob wings/);
  const { power, ...noPower } = ok;
  assert.throws(() => deriveParams(noPower), /power must be a number/);
  assert.throws(() => deriveParams({ ...ok, weight: knob('weight').max + 1 }), /weight must be a number in/);
  assert.throws(() => deriveParams({ ...ok, balance: NaN }), /balance must be a number in/);
  assert.throws(() => deriveParams({ ...ok, tyre: 'wet' }), /tyre must be one of/);
});

// Knob k swept over its range from centred knobs on a base car: [knob value, CarParams, describeCar] per step.
function sweep(base, k, n = 10, over = {}) {
  const { min, max } = knob(k), out = [];
  for (let i = 0; i <= n; i++) {
    const v = min + (max - min) * i / n, p = deriveParams({ ...defaults(base), ...over, [k]: v });
    out.push([v, p, core.describeCar(core.buildCar(p))]);
  }
  return out;
}
// Strictly increasing where the field the knob drives changed, unchanged where it was clamped.
function risesWith(rows, field, value, what) {
  for (let i = 1; i < rows.length; i++) {
    const [v0, p0, d0] = rows[i - 1], [v1, p1, d1] = rows[i];
    if (p1[field] > p0[field]) assert.ok(value(d1) > value(d0), `${what}: ${value(d0)} -> ${value(d1)} at ${v0} -> ${v1}`);
    else assert.equal(value(d1), value(d0), `${what}: ${field} clamped at ${v0} -> ${v1}`);
  }
}

test('simple: more power gives more kW/t and a higher top speed', () => {
  for (const base of BASES) {
    const rows = sweep(base, 'power');
    risesWith(rows, 'power', d => d.derived.powerToWeight, `${base} kW/t`);
    risesWith(rows, 'power', d => d.derived.vTop, `${base} top speed`);
    assert.ok(rows.at(-1)[1].power > rows[0][1].power, `${base}: the Power knob moves power`);
  }
});

test('simple: more downforce gives more lateral g at 200 km/h', () => {
  for (const base of BASES) {
    const rows = sweep(base, 'downforce');
    risesWith(rows, 'cla', d => d.balance.lateral[1].g, `${base} lateral g at ${rows[0][2].balance.lateral[1].kmh} km/h`);
    assert.ok(rows.at(-1)[1].cla > rows[0][1].cla, `${base}: the Downforce knob moves CL·A`);
  }
});

test('simple: a grippier tyre gives more lateral g at 100 and 200 km/h', () => {
  const compounds = knob('tyre').opts.map(o => o[0]).filter(t => t !== 'base');
  for (const base of BASES) {
    const rows = compounds.map(tyre => { const p = deriveParams({ ...defaults(base), tyre }); return [tyre, p.mu, core.describeCar(core.buildCar(p))]; })
      .sort((a, b) => a[1] - b[1]);
    assert.equal(new Set(rows.map(r => r[1])).size, compounds.length, `${base}: every compound has its own μ`);
    for (let i = 1; i < rows.length; i++) for (const j of [0, 1]) {
      const [t0, , d0] = rows[i - 1], [t1, , d1] = rows[i], l0 = d0.balance.lateral[j], l1 = d1.balance.lateral[j];
      assert.ok(l1.g > l0.g, `${base} at ${l0.kmh} km/h: ${t0} ${l0.g} vs ${t1} ${l1.g}`);
    }
  }
});

// Balance moves the car toward oversteer: the front axle's lateral limit gains on the rear's. Not asserted: that the
// knob's ends flip the limiting axle. They don't on every base car (Hot hatch stays front-limited at +1, Kart stays
// rear-limited at −1: its gap spans only +0.43 to −0.17 % over the whole rollF slider range).
test('simple: Balance moves every base car from understeer toward oversteer', () => {
  const { VSTEP } = core, ix = kmh => Math.round(kmh / 3.6 / VSTEP);
  for (const base of BASES) for (const kmh of [100, 200]) {
    const gaps = [];
    for (let i = 0; i <= 8; i++) {
      const balance = -1 + i / 4, c = core.buildCar(deriveParams({ ...defaults(base), balance })), f = c.ayF[ix(kmh)], r = c.ayR[ix(kmh)];
      gaps.push((f - r) / Math.max(f, r));
    }
    for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] > gaps[i - 1], `${base} at ${kmh} km/h: front-rear gap ${gaps.map(g => (100 * g).toFixed(2)).join(' ')} %`);
  }
});
