// Saved runs (ARCHITECTURE.md §7): a car, the circuit it ran on, the line it converged to, and the lap that line gave,
// as one JSON file, so a run from an older version can be loaded into a newer one and compared. Pure functions, no DOM.
// The reader refuses anything it can't use and says what: no defaults, no silent repair (a car with a field filled in
// is a different car). A change to the car parameters or this layout bumps RUN_VERSION and adds an explicit migration.
import { CARS } from './presets.js';

// v1: flat circuits. v2 (elevation): control points [x, y, z] and the recorded line's heights (snapshot.pz).
export const RUN_FORMAT = 'apexlab-run', RUN_VERSION = 2, READS = [1, 2];
export const CAR_KEYS = Object.keys(CARS['GT racer']);
const LINE_ARRAYS = ['px', 'py', 'v', 'ds', 'k']; // snapshot arrays of length N (tc has N + 1)

// ---------- hash of the running source
// The same SHA-256 as runSource() in tests/load-core.mjs: for each file, "// <path>\n" then its bytes, in order.
// fetchBytes(path) resolves to the bytes of one file of PHYSICS.files (src/app/physics-version.js).
export async function liveHash(files, fetchBytes) {
  const enc = new TextEncoder(), parts = [];
  for (const f of files) parts.push(enc.encode(`// ${f}\n`), new Uint8Array(await fetchBytes(f)));
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', all)), b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- write
// dyn: the current dynamic-check result, or null (a stale one must not be saved as if it described this line).
// disp: the displayed snapshot (carries off, phys and the lap); prog: the latest progress event.
export function makeRunFile({ P, ctrl, width, trackName, seed, disp, prog, refT, dyn, physics, exported, userAgent }) {
  const num = (name, x) => { if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`export: ${name} is ${x}, not a finite number`); return x; };
  const arr = (name, a) => Array.from(a, (x, i) => num(`${name}[${i}]`, x));
  const N = disp.off.length;
  const snapshot = Object.fromEntries([...LINE_ARRAYS, 'tc'].map(k => [k, arr(`snapshot.${k}`, disp[k])]));
  snapshot.pz = arr('snapshot.pz', disp.pz);
  snapshot.phys = Object.fromEntries(Object.entries(disp.phys).map(([k, a]) => [k, arr(`snapshot.phys.${k}`, a)]));
  return {
    format: RUN_FORMAT, version: RUN_VERSION, exported, userAgent, physics,
    car: Object.fromEntries(CAR_KEYS.map(k => [k, P[k]])),
    track: { name: trackName, seed, width: num('width', width), ctrl: ctrl.map((p, i) => [num(`ctrl[${i}][0]`, p[0]), num(`ctrl[${i}][1]`, p[1]), num(`ctrl[${i}][2]`, p.length > 2 ? p[2] : 0)]) },
    line: { N, off: arr('line.off', disp.off) },
    result: {
      lap: num('lap', disp.t), converged: !!prog.converged, evals: num('evals', prog.evals), ref: num('ref', refT),
      dyn: dyn ? { frac: num('dyn.frac', dyn.frac), t: dyn.dyn ? num('dyn.t', dyn.dyn.t) : null, umax: num('dyn.umax', dyn.umax), uaxle: dyn.uaxle, fail: dyn.fail ? { fr: dyn.fail.fr, at: dyn.fail.at, spun: dyn.fail.spun } : null } : null,
      snapshot,
    },
  };
}

// ---------- read
// Returns the file, migrated to the current version, with every array a Float64Array; throws an Error saying what is
// wrong and where. Migration v1 -> v2: control points gain z = 0 and the recorded line pz = 0, which is exact: a v1
// run can only be flat. version (returned) is the file's own.
export function readRunFile(o) {
  const bad = (where, why) => { throw new Error(`Run file: ${where}: ${why}`); };
  const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
  if (!isObj(o) || o.format !== RUN_FORMAT) bad('format', `expected "${RUN_FORMAT}", got ${JSON.stringify(isObj(o) ? o.format : o)?.slice(0, 60)}; not an Apex Lab run file`);
  if (!READS.includes(o.version)) bad('version', `file is format v${o.version}; this build reads v${READS.join(' and v')}`);
  const v1 = o.version === 1;
  const need = (parent, key, where) => { if (!isObj(parent) || !isObj(parent[key])) bad(where, 'missing'); return parent[key]; };
  const fin = (where, x) => { if (typeof x !== 'number' || !Number.isFinite(x)) bad(where, `expected a finite number, got ${JSON.stringify(x)}`); return x; };
  const arr = (where, a, len) => {
    if (!Array.isArray(a)) bad(where, 'expected an array');
    if (a.length !== len) bad(where, `expected ${len} values, got ${a.length}`);
    a.forEach((x, i) => fin(`${where}[${i}]`, x));
    return Float64Array.from(a);
  };

  const car = need(o, 'car', 'car'), missing = CAR_KEYS.filter(k => !(k in car)), unknown = Object.keys(car).filter(k => !CAR_KEYS.includes(k));
  if (missing.length || unknown.length)
    bad('car', [missing.length && `missing field${missing.length > 1 ? 's' : ''} ${missing.join(', ')}`, unknown.length && `unknown field${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}`].filter(Boolean).join('; ') + ` (this build's car has: ${CAR_KEYS.join(', ')})`);

  const tr = need(o, 'track', 'track'), width = fin('track.width', tr.width);
  if (!(width > 0)) bad('track.width', `expected > 0, got ${width}`);
  if (!Array.isArray(tr.ctrl) || tr.ctrl.length < 4) bad('track.ctrl', 'expected at least 4 control points');
  const ctrl = tr.ctrl.map((p, i) => {
    if (!Array.isArray(p) || p.length !== (v1 ? 2 : 3)) bad(`track.ctrl[${i}]`, v1 ? 'expected [x, y]' : 'expected [x, y, z]');
    return [fin(`track.ctrl[${i}][0]`, p[0]), fin(`track.ctrl[${i}][1]`, p[1]), v1 ? 0 : fin(`track.ctrl[${i}][2]`, p[2])];
  });

  const ln = need(o, 'line', 'line'), N = ln.N;
  if (!Number.isInteger(N) || N < 2) bad('line.N', `expected an integer >= 2, got ${JSON.stringify(N)}`);
  const off = arr('line.off', ln.off, N);

  const res = need(o, 'result', 'result'), sn = need(res, 'snapshot', 'result.snapshot'), snapshot = {};
  for (const k of LINE_ARRAYS) snapshot[k] = arr(`result.snapshot.${k}`, sn[k], N);
  snapshot.tc = arr('result.snapshot.tc', sn.tc, N + 1);
  snapshot.pz = v1 ? new Float64Array(N) : arr('result.snapshot.pz', sn.pz, N);
  const ph = need(sn, 'phys', 'result.snapshot.phys');
  snapshot.phys = Object.fromEntries(Object.keys(ph).map(k => [k, arr(`result.snapshot.phys.${k}`, ph[k], N)]));
  // The load factor nz joined the telemetry with elevation. On level ground it is exactly 1, so a run without it there
  // (every v1 file) gets it; a hilly run without it stays without, and can't be compared as a ghost (it says why).
  if (!('nz' in snapshot.phys) && ctrl.every(p => p[2] === ctrl[0][2])) snapshot.phys.nz = new Float64Array(N).fill(1);
  let dyn = null;
  if (res.dyn != null) { const d = need(res, 'dyn', 'result.dyn'); dyn = { frac: fin('result.dyn.frac', d.frac), t: d.t == null ? null : fin('result.dyn.t', d.t), umax: fin('result.dyn.umax', d.umax), uaxle: d.uaxle, fail: d.fail ?? null }; }

  const ph2 = need(o, 'physics', 'physics');
  if (typeof ph2.sha256 !== 'string') bad('physics.sha256', 'expected a string');
  return {
    version: o.version, exported: typeof o.exported === 'string' ? o.exported : null, userAgent: typeof o.userAgent === 'string' ? o.userAgent : null,
    physics: { sha256: ph2.sha256, live: typeof ph2.live === 'string' ? ph2.live : null },
    car: { ...car }, track: { name: typeof tr.name === 'string' ? tr.name : '', seed: Number.isFinite(tr.seed) ? tr.seed : null, width, ctrl },
    line: { N, off },
    result: { lap: fin('result.lap', res.lap), converged: !!res.converged, evals: fin('result.evals', res.evals), ref: fin('result.ref', res.ref), dyn, snapshot },
  };
}

// The recorded lap as a ghost, in the shape the Pin button builds from the displayed snapshot.
export const toGhost = run => ({ ...run.result.snapshot, t: run.result.lap, wb: run.car.wb, track: run.car.track });
