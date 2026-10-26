import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';
import { loadFixedLines, fixtureCase } from './fixture-util.mjs';

const f = loadFixedLines(), key = 'Road car|Harrow Ring';
test('fixed lines contain the 30 explicit input cases', () => {
  assert.equal(f.version, 1);
  assert.equal(Object.keys(f.cases).length, 30);
});
for (const k of Object.keys(f.cases)) test(`fixed line loads: ${k}`, async () => {
  let c;
  await assert.doesNotReject(async () => { c = await fixtureCase(k); }, `${k}: fixed line matches recorded geometry`);
  assert.ok(c.off instanceof Float64Array, `${k}: typed offsets`);
  assert.equal(c.off.length, c.N, `${k}: one offset per station`);
  assert.equal(c.T.N, c.N, `${k}: recorded station count`);
  assert.equal(c.T.L, c.L, `${k}: recorded length`);
  assert.equal(c.T.ds, f.cases[k].ds, `${k}: recorded spacing`);
  assert.ok(c.ctrl.every(p => p.length === 3 && p.every(Number.isFinite)), `${k}: explicit xyz controls`);
});
test('fixed line rejects changed station count by case name', async () => {
  const c = structuredClone(f.cases[key]);
  // Doubling plan dimensions changes the station count, without changing the saved line.
  c.ctrl = c.ctrl.map(([x, y, z]) => [2*x, 2*y, z]);
  await assert.rejects(fixtureCase(key, c), e => e.message.includes(key) && e.message.includes('geometry mismatch'),
    'changed station count must reject the named case');
});
test('fixed line rejects changed length even with the same station count', async () => {
  const c = structuredClone(f.cases[key]);
  c.L += 1;
  await assert.rejects(fixtureCase(key, c), e => e.message.includes(key) && e.message.includes('geometry mismatch'),
    'changed length must reject the named case');
});
test('fixed lines own explicit car params independently of presets and other loads', async () => {
  const { CARS } = await loadCore(), a = loadFixedLines(), b = loadFixedLines();
  for (const [k, c] of Object.entries(a.cases)) {
    assert.equal(typeof c.car, 'object', `${k}: explicit params`);
    assert.notStrictEqual(c.car, CARS[c.carName], `${k}: params detached from preset`);
    assert.notStrictEqual(c.car, b.cases[k].car, `${k}: params detached from other loads`);
  }
  assert.equal(a.cases[key].car.mass, 1450, 'stored Road car mass is 1450 kg');
  a.cases[key].car.mass = 1;
  assert.equal(b.cases[key].car.mass, 1450, 'editing one load preserves another');
  assert.equal(a.cases['Road car|Saltmarsh'].car.mass, 1450, 'editing one case preserves another');
});
