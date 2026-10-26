// Opt-in historical comparison: node tools/numeric-report.mjs [--json]
// APEX_SRC=<dir> checks a modified src copy; APEX_GOLDEN=<file> selects a baseline.
// APEX_NUMERIC_EXPECT_V8=<string> overrides the expected V8 for mismatch testing only.
// Exit 0: bit-identical, 1: differences, 2: unsupported runtime. No baseline is written.
import { loadCore, setupPreset } from '../tests/load-core.mjs';
import { loadGolden, assertRuntime, comboKey, circuitName, HILLY, clampedZeros, dynSummary, skidpad } from '../tests/golden-util.mjs';

const args = process.argv.slice(2), json = args.includes('--json');
if (args.some(a => a !== '--json') || args.length > 1) throw new Error('Usage: node tools/numeric-report.mjs [--json]');
const g = loadGolden(), expected = { ...g.meta, v8: process.env.APEX_NUMERIC_EXPECT_V8 ?? g.meta.v8 };
let supported = true;
try { assertRuntime({ meta: expected }); } catch { supported = false; }
if (!supported) {
  const message = `unsupported runtime: baseline Node ${expected.node} / V8 ${expected.v8}; current Node ${process.version} / V8 ${process.versions.v8}`;
  console.log(json ? JSON.stringify({ status: 'unsupported runtime', message, baseline: expected, current: { node: process.version, v8: process.versions.v8 } }) : message);
  process.exitCode = 2;
} else await report();

async function report() {
  const t0 = performance.now(), core = await loadCore(), deltas = [];
  let quantities = 0, convergedSeconds = 0;
  function compare(quantity, baseline, current) {
    if (baseline !== null && typeof baseline === 'object' && current !== null && typeof current === 'object') {
      for (const k of new Set([...Object.keys(baseline), ...Object.keys(current)])) compare(`${quantity}.${k}`, baseline[k], current[k]);
      return;
    }
    quantities++;
    if (Object.is(baseline, current)) return;
    const numeric = typeof baseline === 'number' && typeof current === 'number';
    const absoluteDelta = numeric ? Math.abs(current-baseline) : null;
    const relativeDelta = numeric && baseline !== 0 ? absoluteDelta/Math.abs(baseline) : Infinity;
    deltas.push({ quantity, baseline, current, absoluteDelta, relativeDelta });
  }
  const cases = [];
  for (const car of Object.keys(core.CARS)) {
    for (let track = 0; track < core.TRACKS.length; track++) cases.push({ car, track, hills: 0 });
    for (const h of HILLY) cases.push({ car, ...h });
  }
  const seen = new Set();
  for (const c of cases) {
    const key = comboKey(c.car, circuitName(core.TRACKS[c.track].name, c.hills)), b = g.combos[key];
    if (!b) throw new Error(`No baseline for ${key}`);
    seen.add(key);
    const { T, B, car } = setupPreset(core, c.car, { seed: core.TRACKS[c.track].seed, hills: c.hills });
    if (T.N !== b.N || b.off.length !== T.N) throw new Error(`${key}: station count changed; baseline ${b.N}, current ${T.N}; review fixture sampling`);
    compare(`${key}.centreLap`, b.centreLap, core.lapEval(T, car, clampedZeros(B, T.N), core.makeScratch(T.N)));
    const { N, centreLap, evals, steps, off, ...summary } = b;
    compare(`${key}.fixed`, summary, dynSummary(core, T, car, Float64Array.from(off)));
    if (key === comboKey('GT racer', 'Harrow Ring')) {
      const line = clampedZeros(B, T.N), opt = new core.Optimizer(), start = performance.now();
      opt.setup(T, car, B, line);
      let count = 0;
      while (!opt.converged) {
        if (count >= 5e6) throw new Error(`${key}: not converged after ${count} steps (evals ${opt.evals})`);
        opt.step(); count++;
      }
      convergedSeconds = (performance.now()-start)/1000;
      compare(`${key}.converged`, { lap: b.lap, evals, steps }, { lap: core.lapEval(T, car, line, core.makeScratch(T.N)), evals: opt.evals, steps: count });
    }
  }
  for (const key of Object.keys(g.combos)) if (!seen.has(key)) throw new Error(`Baseline case not evaluated: ${key}`);
  if (!seen.has(comboKey('GT racer', 'Harrow Ring'))) throw new Error('Missing GT racer / Harrow Ring convergence case');
  for (const [fr, b] of Object.entries(g.skidpad.results)) compare(`skidpad.${fr}`, b, skidpad(core, g.skidpad.car, +fr));
  deltas.sort((a, b) => (b.relativeDelta === a.relativeDelta ? 0 : b.relativeDelta > a.relativeDelta ? 1 : -1) || a.quantity.localeCompare(b.quantity));
  const seconds = (performance.now()-t0)/1000, runtime = `Node ${process.version} / V8 ${process.versions.v8}`;
  if (json) {
    // JSON has no Infinity/NaN/undefined, and normally loses the sign of zero.
    const encode = (_, v) => typeof v === 'number' && (!Number.isFinite(v) || Object.is(v, -0)) ? String(Object.is(v, -0) ? '-0' : v) : v === undefined ? 'undefined' : v;
    console.log(JSON.stringify({ status: deltas.length ? 'different' : 'identical', quantities, runtime, seconds, convergedSeconds, deltas }, encode));
  } else if (!deltas.length) {
    console.log(`identical (${quantities} quantities, runtime ${runtime}, ${seconds.toFixed(3)} s total, ${convergedSeconds.toFixed(3)} s converged)`);
  } else {
    console.log(`different (${deltas.length}/${quantities} quantities, runtime ${runtime}, ${seconds.toFixed(3)} s total, ${convergedSeconds.toFixed(3)} s converged)`);
    console.log('quantity\tbaseline\tcurrent\tabsolute delta\trelative delta');
    const show = v => Object.is(v, -0) ? '-0' : String(v);
    for (const d of deltas) console.log([d.quantity, show(d.baseline), show(d.current), d.absoluteDelta ?? 'n/a', d.relativeDelta].join('\t'));
  }
  process.exitCode = deltas.length ? 1 : 0;
}
