// Extract inputs only; never reconverge or copy historical output metrics.
// node tests/make-fixtures.mjs [--write]
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCore } from './load-core.mjs';
import { loadGolden, comboKey, circuitName, HILLY } from './golden-util.mjs';

const argv = process.argv.slice(2);
if (argv.length && (argv.length !== 1 || argv[0] !== '--write'))
  throw new Error('Usage: node tests/make-fixtures.mjs [--write]');
const core = await loadCore(), g = loadGolden(), cases = {}, width = 12;
for (const carName of Object.keys(core.CARS)) {
  const circuits = [...core.TRACKS.map(track => ({ track, hills: 0 })),
    ...HILLY.map(h => ({ track: core.TRACKS[h.track], hills: h.hills }))];
  for (const { track, hills } of circuits) {
    const key = comboKey(carName, circuitName(track.name, hills)), old = g.combos[key];
    if (!old) throw new Error(`Missing golden case ${key}`);
    const c = core.genCtrl(track.seed, width), u = core.genElev(track.seed, c);
    const ctrl = c.map((p, i) => [p[0], p[1], hills * u[i]]), T = core.buildTrack(ctrl, width);
    if (T.N !== old.N || old.off.length !== T.N) throw new Error(`Fixture ${key}: station count differs from golden`);
    cases[key] = { car: { ...core.CARS[carName] }, ctrl, width, hills,
      trackName: track.name, seed: track.seed, carName, N: T.N, L: T.L, ds: T.ds, off: [...old.off] };
  }
}
if (Object.keys(cases).length !== Object.keys(g.combos).length) throw new Error('Golden case set differs from presets');
const meta = { trackGen: g.meta.trackGen, source: g.meta.commit, runtime: { node: process.version, v8: process.versions.v8 } };
const out = new URL('./fixtures/fixed-lines.json', import.meta.url);
const text = `{"version":1,"meta":${JSON.stringify(meta)},\n"cases":{\n` +
  Object.entries(cases).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n') + '\n}}\n';
console.log(`${argv.length ? 'Writing' : 'Would write'} ${Object.keys(cases).length} cases to ${fileURLToPath(out)} (${(Buffer.byteLength(text)/1024).toFixed(0)} KB)`);
if (argv.length) {
  mkdirSync(new URL('./fixtures/', import.meta.url), { recursive: true });
  writeFileSync(out, text);
}
