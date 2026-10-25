// The vendored three.js (vendor/three-0.186.1/README.md): the pinned revision, every file byte for byte against the
// SHA-256s its README records, and the import map in index.html pointing at it. Imports by path: Node has no import map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '../vendor/three-0.186.1/build/three.core.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), DIR = join(ROOT, 'vendor', 'three-0.186.1');
const sha256 = f => createHash('sha256').update(readFileSync(f)).digest('hex');
const files = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(d, e.name)) : [join(d, e.name)]);

// README rows of the form | `path` | <64 hex> | …
function recorded() {
  const rows = [...readFileSync(join(DIR, 'README.md'), 'utf8').matchAll(/^\|\s*`([^`]+)`\s*\|\s*([0-9a-f]{64})\s*\|/gm)];
  return new Map(rows.map(m => [m[1], m[2]]));
}

test('three.core.js is revision 186', () => {
  assert.equal(core.REVISION, '186');
});

test('every vendored file matches the SHA-256 in the README, and none is unlisted', () => {
  const want = recorded();
  assert.ok(want.has('build/three.core.js') && want.has('build/three.module.js') && want.has('LICENSE'), 'README lists the build files and LICENSE');
  const have = files(DIR).map(f => relative(DIR, f).split(sep).join('/')).filter(f => f !== 'README.md').sort();
  assert.deepEqual(have, [...want.keys()].sort(), 'files on disk vs README rows');
  for (const f of have) assert.equal(sha256(join(DIR, f)), want.get(f), `SHA-256 of ${f}`);
});

test('three.module.js imports without a DOM and shares core\'s classes', async () => {
  assert.equal(typeof document, 'undefined');
  const mod = await import('../vendor/three-0.186.1/build/three.module.js');
  assert.equal(mod.REVISION, '186');
  assert.equal(mod.Vector3, core.Vector3, 'one copy of core, re-exported');
  assert.equal(typeof mod.WebGLRenderer, 'function');
});

test('index.html maps "three" and "three/addons/" into this directory, before any module script', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(m, 'index.html has an import map');
  const { imports } = JSON.parse(m[1]);
  assert.equal(imports.three, './vendor/three-0.186.1/build/three.module.js');
  assert.equal(imports['three/addons/'], './vendor/three-0.186.1/examples/jsm/');
  assert.ok(existsSync(join(ROOT, imports.three)), 'the "three" target exists');
  assert.ok(m.index < html.indexOf('<script type="module"'), 'the import map comes before the first module script');
});
