import { readFileSync } from 'node:fs';
import { loadCore } from './load-core.mjs';

export function loadFixedLines() {
  const f = JSON.parse(readFileSync(new URL('./fixtures/fixed-lines.json', import.meta.url), 'utf8'));
  if (f.version !== 1) throw new Error(`Unsupported fixed-line fixture version ${f.version}`);
  return f;
}

// The optional case uses the same geometry guard for authored rejection tests.
export async function fixtureCase(key, input = loadFixedLines().cases[key]) {
  if (!input) throw new Error(`Unknown fixed-line case ${key}`);
  const { buildTrack } = await loadCore(), c = structuredClone(input), T = buildTrack(c.ctrl, c.width);
  if (T.N !== c.N || T.L !== c.L)
    throw new Error(`Fixture ${key}: geometry mismatch (N ${T.N} vs ${c.N}, L ${T.L} vs ${c.L}); revise or resample the fixture explicitly`);
  if (c.off.length !== c.N) throw new Error(`Fixture ${key}: offset length ${c.off.length} differs from N ${c.N}`);
  return { key, car: c.car, carName: c.carName, trackName: c.trackName,
    ctrl: c.ctrl, width: c.width, hills: c.hills, T, off: Float64Array.from(c.off), N: c.N, L: c.L };
}
