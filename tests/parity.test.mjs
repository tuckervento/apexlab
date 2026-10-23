// Migration step 2 check: the src/ modules compute exactly what the frozen prototype (prototype/apex-lab.html)
// computes, bit for bit, on randomised inputs beyond the golden fixtures: random circuits, presets with every
// continuous parameter scaled ±10%, random smooth lines.
// Valid until the first intended physics change; after that the prototype is a historical reference only and this
// file should be deleted (the goldens carry on).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';
import { loadPrototype } from './load-prototype.mjs';
import { dynSummary } from './golden-util.mjs';

const mod = await loadCore(), proto = loadPrototype(), rnd = mod.mulberry32(31337);
const SEEDS = Array.from({ length: 4 }, () => 1 + Math.floor(rnd() * 1e6));
const DISCRETE = new Set(['pt', 'drive', 'gears']);
const CARS = Array.from({ length: 4 }, () => {
  const names = Object.keys(mod.CARS), base = mod.CARS[names[Math.floor(rnd() * names.length)]], p = {};
  for (const [k, v] of Object.entries(base)) p[k] = DISCRETE.has(k) || typeof v !== 'number' ? v : v * (0.9 + 0.2 * rnd());
  return p;
});

// Every element identical (Object.is, so -0 and NaN count). Works across realms and for typed or plain arrays.
function same(a, b, what) {
  assert.equal(a.length, b.length, `${what}: length ${a.length} vs ${b.length}`);
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) assert.fail(`${what}[${i}]: ${a[i]} vs ${b[i]}`);
}
function smoothField(r, N, amp) {
  const f = new Float64Array(N), comps = [];
  for (let c = 0; c < 4; c++) comps.push({ n: 2 + Math.floor(r() * 18), ph: r() * 2 * Math.PI, a: amp * (0.5 + r()) / 2 });
  for (let i = 0; i < N; i++) for (const { n, ph, a } of comps) f[i] += a * Math.sin(2 * Math.PI * n * i / N + ph);
  return f;
}

const tracks = SEEDS.map(seed => {
  const both = [mod, proto].map(c => { const ctrl = c.genCtrl(seed, 12); return { ctrl, T: c.buildTrack(ctrl, 12) }; });
  return { seed, m: both[0], p: both[1] };
});
const cars = CARS.map(P => ({ P, m: mod.buildCar({ ...P }), p: proto.buildCar({ ...P }) }));

test('parity: genCtrl + buildTrack', () => {
  for (const { seed, m, p } of tracks) {
    same(m.ctrl.flat(), p.ctrl.flat(), `seed ${seed} ctrl`);
    for (const k of ['N', 'L', 'ds', 'width', 'issue', 'minR']) assert.ok(Object.is(m.T[k], p.T[k]), `seed ${seed} T.${k}: ${m.T[k]} vs ${p.T[k]}`);
    for (const k of ['cx', 'cy', 'nx', 'ny', 'kc']) same(m.T[k], p.T[k], `seed ${seed} T.${k}`);
  }
});

test('parity: buildCar', () => {
  for (const [ci, { m, p }] of cars.entries()) {
    for (const k of ['alat', 'brk', 'trc', 'ggB', 'ggT', 'kcrit', 'kcF', 'kcR', 'drv', 'gear', 'rpm', 'ayF', 'ayR', 'limF', 'brkF']) same(m[k], p[k], `car ${ci} ${k}`);
    for (const k of ['lF', 'lR', 'aCG', 'bCG', 'Izz', 'vTop', 'shiftT', 'm', 'cda']) assert.ok(Object.is(m[k], p[k]), `car ${ci} ${k}: ${m[k]} vs ${p[k]}`);
  }
});

for (const [ti, t] of tracks.entries()) {
  for (const [ci, c] of cars.entries()) {
    test(`parity: lapEval + gradient, seed ${t.seed}, car ${ci}`, () => {
      const Bm = mod.makeBounds(t.m.T, c.m), Bp = proto.makeBounds(t.p.T, c.P), N = t.m.T.N;
      same(Bm.lo, Bp.lo, 'bounds.lo'); same(Bm.hi, Bp.hi, 'bounds.hi');
      const off = smoothField(mod.mulberry32(t.seed + ci), N, 0.5 * Bm.hw);
      for (let i = 0; i < N; i++) off[i] = Math.min(Bm.hi[i], Math.max(Bm.lo[i], off[i]));
      for (const tau of [0, 0.5]) {
        const Sm = mod.makeScratch(N), Sp = proto.makeScratch(N), gm = new Float64Array(N), gp = new Float64Array(N);
        const lm = mod.lapEval(t.m.T, c.m, off, Sm, gm, tau), lp = proto.lapEval(t.p.T, c.p, off, Sp, gp, tau);
        assert.ok(Object.is(lm, lp), `tau ${tau} lap: ${lm} vs ${lp}`);
        same(gm, gp, `tau ${tau} grad`); same(Sm.v, Sp.v, `tau ${tau} v`);
      }
      if (ti !== ci) return; // optimiser + dynamic check on the diagonal only (they dominate the cost)
      const om = Float64Array.from(off), op = Float64Array.from(off), Om = new mod.Optimizer(), Op = new proto.Optimizer();
      Om.setup(t.m.T, c.m, Bm, om); Op.setup(t.p.T, c.p, Bp, op);
      for (let k = 0; k < 300; k++) { Om.step(); Op.step(); }
      assert.ok(Object.is(Om.f, Op.f) && Om.evals === Op.evals && Om.stage === Op.stage, `optimiser after 300 steps: f ${Om.f} vs ${Op.f}, evals ${Om.evals} vs ${Op.evals}`);
      same(om, op, 'optimiser line');
      assert.deepEqual(dynSummary(mod, t.m.T, c.m, om), dynSummary(proto, t.p.T, c.p, op));
    });
  }
}
