// Loads the physics from the src/ ES modules (core, dynamics, solver, playback, presets) as one namespace object.
// APEX_SRC=<dir> loads a copy of src/ instead (used to check that the tests fail on deliberately broken code).
// Modules are cached per process, so every loadCore() call in a test file shares one instance (the core keeps no
// mutable module-level state; DYN and the presets are frozen).
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = process.env.APEX_SRC || fileURLToPath(new URL('../src', import.meta.url));
const ENTRIES = ['core/index.js', 'dynamics/index.js', 'solver/solver.js', 'playback/pose.js', 'app/presets.js'];

export async function loadCore(srcDir = SRC) {
  const mods = await Promise.all(ENTRIES.map(e => import(pathToFileURL(join(srcDir, e)).href)));
  return Object.assign({}, ...mods);
}

// Combined SHA-256 of source files: for each, "// <path relative to src>\n" then its bytes, in sorted order. The browser
// recomputes the same hash (liveHash in src/app/runfile.js), so keep the two in step.
function digest(srcDir, files) {
  const h = createHash('sha256');
  for (const f of files.sort()) h.update(`// ${relative(srcDir, f)}\n`).update(readFileSync(f));
  return { files: files.map(f => relative(srcDir, f)), sha256: h.digest('hex') };
}
const jsFiles = d => readdirSync(d, { withFileTypes: true }).flatMap(e => { const p = join(d, e.name); return e.isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : []; });

// The physics source files and their combined SHA-256. Recorded in goldens for reference only. Includes the presets,
// which the goldens build their cars and circuits from.
export function coreSource(srcDir = SRC) {
  return digest(srcDir, [...jsFiles(join(srcDir, 'core')), ...jsFiles(join(srcDir, 'dynamics')), join(srcDir, 'app/presets.js')]);
}

// What a run file's physics hash covers (src/app/physics-version.js): everything that decides the numbers a run records,
// the solver included (it computes the published times and telemetry), and not the presets: a run file stores its car
// and circuit in full, so retuning a preset can't change how an old file behaves.
export function runSource(srcDir = SRC) {
  return digest(srcDir, [...jsFiles(join(srcDir, 'core')), ...jsFiles(join(srcDir, 'dynamics')), join(srcDir, 'solver/solver.js')]);
}

// Build a preset circuit the way the app does (genCtrl -> buildTrack -> makeBounds).
export function setupPreset(core, carName, { seed = core.TRACKS[0].seed, width = 12 } = {}) {
  const params = core.CARS[carName];
  if (!params) throw new Error(`Unknown car preset "${carName}"; have: ${Object.keys(core.CARS).join(', ')}`);
  const P = { ...params }, car = core.buildCar(P);
  const T = core.buildTrack(core.genCtrl(seed, width), width), B = core.makeBounds(T, car);
  return { P, car, T, B };
}
