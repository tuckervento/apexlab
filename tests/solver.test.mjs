// Migration step 5: the Solver behind the worker protocol (ARCHITECTURE.md §10.1), driven directly (no worker).
// The optimiser's result depends only on its step sequence, so a run through the protocol must reproduce the
// convergence fixture (§8.2/8.3) bit for bit; revisions must tag every result with the state it was computed on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';
import { loadGolden, assertRuntime, comboKey, dynResultSummary } from './golden-util.mjs';

const core = await loadCore(), CAR = 'GT racer', TRACK = core.TRACKS[0], WIDTH = 12;

// A solver set up the way the app boots: car, then track, all events recorded.
function boot() {
  const ev = [], s = new core.Solver(e => ev.push(e));
  s.handle({ type: 'setCar', rev: 1, params: { ...core.CARS[CAR] } });
  s.handle({ type: 'setTrack', rev: 2, ctrl: core.genCtrl(TRACK.seed, WIDTH), width: WIDTH, keepLine: false });
  return { s, ev, of: type => ev.filter(e => e.type === type), last: type => ev.filter(e => e.type === type).at(-1) };
}
const noErrors = ev => assert.deepEqual(ev.filter(e => e.type === 'error'), [], 'solver emitted errors');
// Booted and run to convergence once per file (~7 s); shared by the tests that need a converged line.
let conv = null;
function converged() { if (!conv) { conv = boot(); conv.s.handle({ type: 'run' }); while (conv.s.tick(1000)); } return conv; }

test(`solver: converges through the protocol, ${CAR}, ${TRACK.name}`, { timeout: 10 * 60 * 1000 }, async t => {
  const b = converged();
  noErrors(b.ev);
  const snap = b.last('snapshot'), prog = b.last('progress'), centreLap = b.of('snapshot').find(e => e.ref).ref.t;
  t.diagnostic(`lap=${snap.lap.toFixed(4)} s  evals=${prog.evals}  snapshots=${b.of('snapshot').length}`);

  await t.test('property', () => {
    assert.ok(prog.converged && !prog.running, `not converged: ${JSON.stringify(prog)}`);
    assert.equal(snap.carRev, 1); assert.equal(snap.trackRev, 2);
    assert.ok(snap.lap < centreLap, `lap ${snap.lap} not faster than centreline ${centreLap}`);
    assert.equal(b.of('carInfo').length, 1); assert.equal(b.of('track').length, 1);
  });
  await t.test('golden', () => {
    const g = loadGolden();
    assertRuntime(g);
    const fx = g.combos[comboKey(CAR, TRACK.name)];
    assert.deepEqual({ centreLap, lap: snap.lap, evals: prog.evals }, { centreLap: fx.centreLap, lap: fx.lap, evals: fx.evals });
    const diff = [];
    for (let i = 0; i < fx.N; i++) if (b.s.pub[i] !== fx.off[i]) diff.push(i);
    assert.equal(diff.length, 0, `published line differs from the fixture at ${diff.length} stations (first: ${diff[0]})`);
  });
});

test(`solver: dynamic check through the protocol, ${CAR}, ${TRACK.name}`, async t => {
  const b = converged(), lineRev = b.last('snapshot').lineRev, n0 = b.ev.length;
  b.s.handle({ type: 'dynCheck' });
  while (b.s.tick(1000));
  const ev = b.ev.slice(n0); noErrors(ev);
  const res = ev.filter(e => e.type === 'dynResult');
  assert.equal(res.length, 1, `expected one dynResult, got ${res.length}`);
  const r = res[0];
  t.diagnostic(`frac=${r.result.frac}  iters=${r.result.iters}  dynProgress events=${ev.filter(e => e.type === 'dynProgress').length}`);

  await t.test('property', () => {
    assert.deepEqual({ carRev: r.carRev, trackRev: r.trackRev, lineRev: r.lineRev }, { carRev: 1, trackRev: 2, lineRev }, 'result tagged with the revisions it was computed on');
    assert.ok(r.result.frac >= 0.85 && r.result.frac <= 1, `frac ${r.result.frac}`);
    assert.equal(b.last('progress').running, false, 'dynCheck should leave the search paused');
  });
  await t.test('golden', () => {
    const g = loadGolden();
    assertRuntime(g);
    const { lap, off, N, centreLap, evals, steps, ...fx } = g.combos[comboKey(CAR, TRACK.name)];
    assert.deepEqual(dynResultSummary(r.result), fx);
  });
});

// What the app does with revisions: a dynamic result is current only while all three match the latest snapshot.
const current = (r, snap) => r.carRev === snap.carRev && r.trackRev === snap.trackRev && r.lineRev === snap.lineRev;

test('solver: revisions tag results and expose staleness', () => {
  const b = boot();
  const s0 = b.last('snapshot');
  assert.ok(s0.ref && s0.lineRev === 1 && s0.carRev === 1 && s0.trackRev === 2, `boot snapshot ${JSON.stringify({ ...s0, line: '…', ref: !!s0.ref })}`);
  b.s.handle({ type: 'run' });
  for (let k = 0; k < 20; k++) b.s.tick(30);
  const snaps = b.of('snapshot');
  for (let k = 1; k < snaps.length; k++) assert.ok(snaps[k].lineRev > snaps[k - 1].lineRev, `lineRev not increasing at snapshot ${k}`);
  assert.ok(snaps.length > 1, 'no snapshot published while improving');

  // dynamic check while searching: pauses, republishes the line it checks (same revision), tags the result with it
  const L = b.last('snapshot').lineRev, n1 = b.ev.length;
  b.s.handle({ type: 'dynCheck' });
  const re = b.ev.slice(n1).find(e => e.type === 'snapshot');
  assert.ok(re && re.lineRev === L, 'dynCheck should republish the checked line without a new revision');
  assert.equal(b.s.running, false, 'dynCheck should pause the search');
  while (b.s.tick(1000));
  const r = b.last('dynResult');
  assert.equal(r.lineRev, L);
  assert.ok(current(r, b.last('snapshot')), 'fresh dynResult should be current');

  // tyre-use view: same line, same revision, now with u
  b.s.handle({ type: 'view', util: true });
  const sv = b.last('snapshot');
  assert.equal(sv.lineRev, L, 'a view change must not change the line revision');
  assert.ok(sv.line.u && sv.line.u.length === b.s.T.N, 'tyre-use snapshot has no u');
  assert.ok(current(r, sv), 'a view change must not make the dynamic result stale');

  // car change: carInfo first, then a rescored snapshot with the new carRev; the old result is now stale
  const n0 = b.ev.length;
  b.s.handle({ type: 'setCar', rev: 3, params: { ...core.CARS[CAR], mass: core.CARS[CAR].mass + 50 } });
  const after = b.ev.slice(n0).map(e => e.type);
  assert.deepEqual(after.slice(0, 2), ['carInfo', 'snapshot'], `events after setCar: ${after.join(', ')}`);
  const s3 = b.last('snapshot');
  assert.ok(s3.carRev === 3 && s3.lineRev > L && s3.ref, 'snapshot after setCar should carry carRev 3, a new lineRev and a new ref');
  assert.ok(!current(r, s3), 'dynamic result should be stale after a car change');

  // the search resumes from the rescored line
  b.s.handle({ type: 'run' });
  const e0 = b.last('progress').evals;
  for (let k = 0; k < 5; k++) b.s.tick(30);
  assert.ok(b.last('progress').evals > e0 && b.last('progress').running, 'solver did not resume after the car change');
});

test('solver: emitted arrays are copies, never solver state', () => {
  const b = boot(), N = b.s.T.N, snap = b.last('snapshot'), trk = b.last('track'), info = b.last('carInfo').info;
  const px0 = Float64Array.from(snap.line.px), v0 = Float64Array.from(snap.line.v), ref0 = Float64Array.from(snap.ref.v);
  // a careless receiver writes into everything it was sent
  for (const a of [snap.line.px, snap.line.py, snap.line.v, snap.line.k, snap.line.ds, snap.ref.v, trk.cx, trk.cy, trk.nx, trk.ny, trk.kc, info.curves.drive]) a.fill(-1);
  assert.ok(b.s.pub.every(Number.isFinite) && b.s.T.cx[0] !== -1 && b.s.car.drv[5] !== -1, 'solver state was written through an emitted array');
  b.s.handle({ type: 'view', util: false }); // republish the same line
  const again = b.last('snapshot');
  assert.equal(again.line.px.length, N);
  for (let i = 0; i < N; i++) if (again.line.px[i] !== px0[i] || again.line.v[i] !== v0[i]) assert.fail(`republished snapshot differs at station ${i}`);
  for (let i = 0; i < N; i++) if (b.s.ref.v[i] !== ref0[i]) assert.fail(`reference lap changed at station ${i}`);
});

test('solver: a failing command emits error, pauses, and leaves the solver usable', () => {
  // before setup
  const ev = [], s = new core.Solver(e => ev.push(e));
  s.handle({ type: 'run' });
  assert.match(ev.at(-1).message, /needs setCar and setTrack/);
  s.handle({ type: 'warp' });
  assert.match(ev.at(-1).message, /Unknown command type "warp"/);

  // mid-run: an invalid car is rejected and the previous car stays in place
  const b = boot();
  b.s.handle({ type: 'run' });
  b.s.tick(30);
  const bad = { ...core.CARS[CAR] }; delete bad.slipPk;
  b.s.handle({ type: 'setCar', rev: 3, params: bad });
  const err = b.last('error');
  assert.match(err.message, /carSpec: slipPk/); assert.ok(err.stack.length > 0, 'error has no stack');
  assert.equal(b.s.running, false, 'an error should pause the search');
  assert.equal(b.s.carRev, 1, 'a rejected car must not replace the current one');
  b.s.handle({ type: 'run' });
  const e0 = b.last('progress').evals;
  for (let k = 0; k < 5; k++) b.s.tick(30);
  assert.ok(b.last('progress').evals > e0, 'solver did not resume after the error');
});

// The line on screen must be one the optimiser accepted: during the polish stage, Optimizer.step() leaves `off`
// holding the last candidate tried, even when it rejects it and restores the spline coefficients `c`.
test('solver: publishes only lines the optimiser accepted', { timeout: 10 * 60 * 1000 }, t => {
  let s = null, checked = 0, polish = 0;
  const bad = [];
  s = new core.Solver(e => {
    if (e.type !== 'snapshot' || s.opt.converged) return;
    const o = s.opt, N = s.T.N;
    checked++; if (o.polish) polish++;
    for (let i = 0; i < N; i++) if (s.pub[i] !== o.spl(i, o.c)) { bad.push({ lineRev: e.lineRev, polish: !!o.polish, station: i }); break; }
  });
  s.handle({ type: 'setCar', rev: 1, params: { ...core.CARS[CAR] } });
  s.handle({ type: 'setTrack', rev: 2, ctrl: core.genCtrl(TRACK.seed, WIDTH), width: WIDTH, keepLine: false });
  s.handle({ type: 'run' });
  while (s.tick(20));
  t.diagnostic(`snapshots checked=${checked} (polish ${polish})  not accepted=${bad.length} (outside polish ${bad.filter(b => !b.polish).length})`);
  assert.ok(polish > 0, 'no snapshot was published during the polish stage');
  assert.deepEqual(bad.slice(0, 3), [], `${bad.length} of ${checked} snapshots showed a line the optimiser had not accepted`);
});
