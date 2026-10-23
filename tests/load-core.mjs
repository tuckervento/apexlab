// Loads the physics from the src/ ES modules (core, dynamics, presets) as one namespace object.
// APEX_SRC=<dir> loads a copy of src/ instead (used to check that the tests fail on deliberately broken code).
// Modules are cached per process, so every loadCore() call in a test file shares one instance (the core keeps no
// mutable module-level state; DYN and the presets are frozen).
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = process.env.APEX_SRC || fileURLToPath(new URL('../src', import.meta.url));
const ENTRIES = ['core/index.js', 'dynamics/index.js', 'app/presets.js'];

export async function loadCore(srcDir = SRC) {
  const mods = await Promise.all(ENTRIES.map(e => import(pathToFileURL(join(srcDir, e)).href)));
  return Object.assign({}, ...mods);
}

// The physics source files and their combined SHA-256. Recorded in goldens for reference only.
export function coreSource(srcDir = SRC) {
  const files = [];
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk(join(srcDir, 'core')); walk(join(srcDir, 'dynamics')); files.push(join(srcDir, 'app/presets.js'));
  const h = createHash('sha256');
  for (const f of files.sort()) h.update(`// ${relative(srcDir, f)}\n`).update(readFileSync(f));
  return { files: files.map(f => relative(srcDir, f)), sha256: h.digest('hex') };
}

// Build a preset circuit the way the app does (genCtrl -> buildTrack -> makeBounds).
export function setupPreset(core, carName, { seed = core.TRACKS[0].seed, width = 12 } = {}) {
  const params = core.CARS[carName];
  if (!params) throw new Error(`Unknown car preset "${carName}"; have: ${Object.keys(core.CARS).join(', ')}`);
  const P = { ...params }, car = core.buildCar(P);
  const T = core.buildTrack(core.genCtrl(seed, width), width), B = core.makeBounds(T, car);
  return { P, car, T, B };
}
