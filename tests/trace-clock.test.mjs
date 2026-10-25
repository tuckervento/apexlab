import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';
import { SKIDPAD, skidpadSetup } from './golden-util.mjs';

const core = await loadCore();
function fixture(frac) {
  const { T, car, line, v } = skidpadSetup(core, SKIDPAD.car, frac);
  const tc = new Float64Array(T.N + 1);
  for (let i = 0; i < T.N; i++) tc[i + 1] = tc[i] + line.ds[i] / (v[i] / Math.sqrt(frac));
  const snapshot = { ...line, v: v.map(x => x / Math.sqrt(frac)), tc, t: tc[T.N] };
  const dyn = core.dynLap(T, car, core.dynSetup(car), line, v, true);
  return { snapshot, dyn };
}

test('trace clock aligns the lap station and the first complete-trace sample', () => {
  const { snapshot, dyn } = fixture(0.95), tr = dyn.trace;
  assert.ok(dyn.complete && !dyn.spun, 'trace completes');
  assert.ok(dyn.start > 0, 'exercise a nonzero offset');
  const start = snapshot.tc[dyn.start];
  assert.equal(core.pose(snapshot, start).station, dyn.start);
  assert.equal(core.traceClock(snapshot, dyn, start).t, 0, 'aligned start has trace time zero');
  const raceT = start + tr.t[0];
  const clock = core.traceClock(snapshot, dyn, core.raceClock([snapshot.t, start + dyn.t], raceT));
  assert.ok(Math.abs(clock.t - tr.t[0]) < 1e-12, 'first sample time');
  const lap = core.pose(snapshot, raceT), trace = core.pose(tr, clock.t);
  const delta = Math.abs(lap.station - trace.station);
  assert.ok(Math.min(delta, snapshot.N - delta) <= 1, 'first sample stations agree within one');
});

test('trace clock reports an incomplete high-pace trace ending without clamping', () => {
  const { snapshot, dyn } = fixture(4), ts = dyn.trace.t, offset = snapshot.tc[dyn.start];
  assert.ok(!dyn.complete && dyn.spun, 'high frac forces an incomplete trace');
  assert.ok(ts.length > 1, 'failure has recorded samples');
  const last = ts.at(-1), after = core.traceClock(snapshot, dyn, offset + last + 1);
  assert.equal(after.ended, true, 'past the last sample is ended');
  assert.ok(after.t > last, 'ended time is not clamped');
  assert.equal(after.started, true);
});

test('trace clock preserves multi-lap time and explicit sample boundaries', () => {
  const snapshot = { tc: [0, 2, 4], t: 6 }, dyn = { start: 1, trace: { t: [0.25, 20] } };
  assert.deepEqual(core.traceClock(snapshot, dyn, 2), { t: 0, started: false, ended: false });
  assert.deepEqual(core.traceClock(snapshot, dyn, 2.25), { t: 0.25, started: true, ended: false });
  assert.deepEqual(core.traceClock(snapshot, dyn, 22), { t: 20, started: true, ended: false });
  assert.deepEqual(core.traceClock(snapshot, dyn, 23), { t: 21, started: true, ended: true });
  assert.deepEqual(core.traceClock(snapshot, dyn, 0), { t: -2, started: false, ended: false });
  assert.deepEqual(core.traceClock(snapshot, { start: 1, trace: { t: [] } }, 2), { t: 0, started: false, ended: true });
});
