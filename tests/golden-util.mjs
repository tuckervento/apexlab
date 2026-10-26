// Shared by make-golden.mjs, make-fixtures.mjs, tools/numeric-report.mjs and a few tests (skidpad and stadium setups,
// clampedZeros, HILLY). The generator and the report call the same functions here, so they compute exactly the same
// quantities. golden.json is bit-exact and per-runtime: Node and Chrome already differ in buildTrack's last bits
// (investigations/golden-lap.md), so the report refuses a different V8 build (assertRuntime) rather than comparing.
// The default suite asserts contracts and never reads golden.json.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GOLDEN_PATH = process.env.APEX_GOLDEN || fileURLToPath(new URL('./golden.json', import.meta.url));
export const SKIDPAD = { car: 'Road car', R: 80, points: 16, width: 12, fracs: [0.90, 0.95, 0.98] };

export function loadGolden() {
  let text;
  try { text = readFileSync(GOLDEN_PATH, 'utf8'); }
  catch (e) { throw new Error(`No goldens at ${GOLDEN_PATH} (${e.code}). Generate them with: node tests/make-golden.mjs --write`); }
  return JSON.parse(text);
}

export function assertRuntime(g) {
  const m = g.meta, run = { node: process.version, v8: process.versions.v8 };
  if (m.v8 !== run.v8)
    throw new Error(`Goldens recorded under Node ${m.node} / V8 ${m.v8}, running Node ${run.node} / V8 ${run.v8}. ` +
      'Goldens are per-runtime (investigations/golden-lap.md); regenerate with node tests/make-golden.mjs --write and review the diff.');
}

export const comboKey = (car, track) => `${car}|${track}`;
// Hilly circuits in the goldens (elevation, migration step 8): every car on these, besides the flat car × circuit grid.
export const HILLY = [{ track: 0, hills: 25 }];
export const circuitName = (name, hills) => hills ? `${name} · hills ${hills} m` : name;

export function clampedZeros(B, N) {
  const off = new Float64Array(N);
  for (let i = 0; i < N; i++) off[i] = Math.min(B.hi[i], Math.max(B.lo[i], 0));
  return off;
}

// Lap time and dynamic check on a fixed line. frac, iters, the station indices and fin.t (a count of 4 ms steps) are
// all quantised, so a small driver change can leave them identical; the error maxima and mean error of the final
// traced lap are continuous and catch it.
export function dynSummary(core, T, car, off) {
  const lap = core.lapEval(T, car, off, core.makeScratch(T.N));
  const dc = new core.DynCheck(T, car, off);
  while (!dc.done) dc.step();
  return { lap, ...dynResultSummary(dc.result) };
}

// The summarised fields of a DynCheck result (as stored in the goldens).
export function dynResultSummary(r) {
  const f = r.fail, d = r.dyn;
  return {
    frac: r.frac, umax: r.umax, uat: r.uat, uaxle: r.uaxle, qss: r.qss, iters: r.iters,
    fail: f ? { fr: f.fr, at: f.at, spun: f.spun } : null,
    fin: d ? { t: d.t, complete: d.complete, spun: d.spun, trouble: d.trouble.length,
      maxE: d.maxE, maxOff: d.maxOff, maxDB: d.maxDB, meanE: meanAbs(d.stE) } : null,
  };
}

function meanAbs(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]);
  return s / a.length;
}

// The skidpad circle, its line (as the DynCheck constructor builds it) and constant target speeds at fraction fr.
export function skidpadSetup(core, carName, fr) {
  const { R, points, width } = SKIDPAD;
  const car = core.buildCar({ ...core.CARS[carName] });
  const ctrl = Array.from({ length: points }, (_, i) => [R * Math.cos(2 * Math.PI * i / points), R * Math.sin(2 * Math.PI * i / points)]);
  const T = core.buildTrack(ctrl, width), N = T.N, S = core.makeScratch(N);
  core.lapEval(T, car, new Float64Array(N), S);
  const th = new Float64Array(N), ds = new Float64Array(N);
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; th[i] = Math.atan2(S.py[j] - S.py[i], S.px[j] - S.px[i]); ds[i] = Math.hypot(S.px[j] - S.px[i], S.py[j] - S.py[i]); }
  const line = { N, px: Float64Array.from(S.px), py: Float64Array.from(S.py), k: Float64Array.from(S.k), th, ds };
  return { T, car, line, v: new Float64Array(N).fill(S.v[0] * Math.sqrt(fr)) };
}

// §8.4: constant speed around an 80 m circle (a C² spline through 16 points, so |k| ripples ±1.4%).
// fr is the fraction of the lap model's v² on the circle; for the Road car (CL·A = 0.10) that is ≈ the fraction of
// its lateral limit. The line is built from lapEval the same way the DynCheck constructor builds it.
export function skidpad(core, carName, fr) {
  const { T, car, line, v } = skidpadSetup(core, carName, fr), N = T.N;
  const r = core.dynLap(T, car, core.dynSetup(car), line, v, false);
  let se = 0;
  for (let i = 0; i < N; i++) se += Math.abs(r.stE[i]);
  return { complete: r.complete, spun: r.spun, trouble: r.trouble.length, meanE: se / N, maxE: r.maxE, t: r.t };
}

// A stadium: two straights of length S joined by semicircles of radius R, control points every ~25 m, heights from
// zAt(s) with s the distance along the loop (straight 1 runs s = 0..S). Lets a test put a crest or a ramp on a straight.
export function stadium(S, R, zAt) {
  const pts = [], n1 = Math.round(S / 25), na = Math.max(6, Math.round(Math.PI * R / 25));
  for (let i = 0; i < n1; i++) pts.push([-S / 2 + S * i / n1, 0, zAt(S * i / n1)]);
  for (let i = 0; i < na; i++) { const a = -Math.PI / 2 + Math.PI * i / na; pts.push([S / 2 + R * Math.cos(a), R + R * Math.sin(a), zAt(S + Math.PI * R * i / na)]); }
  for (let i = 0; i < n1; i++) pts.push([S / 2 - S * i / n1, 2 * R, zAt(S + Math.PI * R + S * i / n1)]);
  for (let i = 0; i < na; i++) { const a = Math.PI / 2 + Math.PI * i / na; pts.push([-S / 2 + R * Math.cos(a), R + R * Math.sin(a), zAt(2 * S + Math.PI * R + Math.PI * R * i / na)]); }
  return pts;
}
