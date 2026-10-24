// Migration step 5: the Solver behind the worker protocol (ARCHITECTURE.md §10.1), driven directly (no worker).
// The optimiser's result depends only on its step sequence, so a run through the protocol must reproduce the
// convergence fixture (§8.2/8.3) bit for bit; revisions must tag every result with the state it was computed on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';
import { loadGolden, assertRuntime, comboKey, dynResultSummary } from './golden-util.mjs';

const core = await loadCore(), CAR = 'GT racer', TRACK = core.TRACKS[0], WIDTH = 12;

// A solver set up the way the app boots: car, then track, all events recorded. hook(event, solver), if given, sees each
// event as it is emitted, while the solver is in the state that produced it.
function boot(hook) {
  const ev = [], s = new core.Solver(e => { ev.push(e); if (hook) hook(e, s); });
  s.handle({ type: 'setCar', rev: 1, params: { ...core.CARS[CAR] } });
  s.handle({ type: 'setTrack', rev: 2, ctrl: core.genCtrl(TRACK.seed, WIDTH), width: WIDTH, keepLine: false });
  return { s, ev, of: type => ev.filter(e => e.type === type), last: type => ev.filter(e => e.type === type).at(-1) };
}
const noErrors = ev => assert.deepEqual(ev.filter(e => e.type === 'error'), [], 'solver emitted errors');
// The line on screen must be one the optimiser accepted: during the polish stage, Optimizer.step() leaves `off`
// holding the last candidate tried, even when it rejects it and restores the spline coefficients `c`. This observer
// checks every snapshot published before convergence against the accepted spline, as it is emitted; the test
// 'publishes only lines the optimiser accepted' reads the tally from the shared converged run.
function acceptedObserver() {
  const acc = { checked: 0, polish: 0, bad: [] };
  const hook = (e, s) => {
    if (e.type !== 'snapshot' || s.opt.converged) return;
    const o = s.opt, N = s.T.N;
    acc.checked++; if (o.polish) acc.polish++;
    for (let i = 0; i < N; i++) if (s.pub[i] !== o.spl(i, o.c)) { acc.bad.push({ lineRev: e.lineRev, polish: !!o.polish, station: i }); break; }
  };
  return { acc, hook };
}
// Booted and run to convergence once per file (~9 s); shared by the tests that need a converged line. Run in 20 ms
// ticks, as the accepted-lines check always was, so it sees the same density of snapshots; the result depends only on
// the optimiser's step sequence, not on the tick length.
let conv = null;
function converged() {
  if (!conv) {
    const { acc, hook } = acceptedObserver();
    conv = boot(hook); conv.accepted = acc;
    conv.s.handle({ type: 'run' }); while (conv.s.tick(20));
  }
  return conv;
}

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
    assert.equal(snap.line.off.length, b.s.pub.length);
    assert.ok(snap.line.off.every((x, i) => x === b.s.pub[i]), 'snapshot off is the published line (run files export it)');
    assert.notEqual(snap.line.off.buffer, b.s.pub.buffer, 'off is a copy, never the solver\'s own array');
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
  for (const a of [snap.line.px, snap.line.py, snap.line.v, snap.line.k, snap.line.ds, snap.ref.v, ...Object.values(snap.line.phys), trk.cx, trk.cy, trk.nx, trk.ny, trk.kc, trk.z, trk.dz, trk.cth, trk.kv, info.curves.drive]) a.fill(-1);
  assert.ok(b.s.pub.every(Number.isFinite) && b.s.T.cx[0] !== -1 && b.s.T.cth[0] === 1 && b.s.T.z[0] === 0 && b.s.car.drv[5] !== -1, 'solver state was written through an emitted array');
  assert.equal(trk.flat, true, 'track event says the boot circuit is flat');
  b.s.handle({ type: 'view', util: false }); // republish the same line
  const again = b.last('snapshot');
  assert.equal(again.line.px.length, N);
  for (let i = 0; i < N; i++) if (again.line.px[i] !== px0[i] || again.line.v[i] !== v0[i]) assert.fail(`republished snapshot differs at station ${i}`);
  for (let i = 0; i < N; i++) if (b.s.ref.v[i] !== ref0[i]) assert.fail(`reference lap changed at station ${i}`);
});

// Telemetry forces (inverse dynamics along the line) ride on every snapshot. The axle loads must add up to weight
// plus downforce: longitudinal transfer moves load between the axles but cancels in the sum.
test('solver: every snapshot carries phys, and axle loads sum to weight plus downforce', t => {
  const b = converged(), N = b.s.T.N, m = b.s.car.m, snaps = b.of('snapshot');
  const KEYS = ['fxf', 'fxr', 'fyf', 'fyr', 'wf', 'wr', 'uf', 'ur', 'down', 'drag', 'nz'];
  let worst = 0;
  for (const [n, sn] of snaps.entries()) {
    const ph = sn.line.phys;
    assert.deepEqual(Object.keys(ph).sort(), [...KEYS].sort(), `snapshot ${n} phys keys`);
    assert.ok(ph.nz.every(x => x === 1), `snapshot ${n}: load factor not exactly 1 on a flat circuit`);
    for (const k of KEYS) {
      assert.equal(ph[k].length, N, `snapshot ${n} phys.${k} length`);
      if (!ph[k].every(Number.isFinite)) assert.fail(`snapshot ${n} phys.${k} has a non-finite value`);
    }
    for (let i = 0; i < N; i++) {
      const want = m * core.G + ph.down[i];
      worst = Math.max(worst, Math.abs(ph.wf[i] + ph.wr[i] - want) / want);
      if (ph.down[i] < 0 || ph.drag[i] <= 0) assert.fail(`snapshot ${n} station ${i}: downforce ${ph.down[i]}, drag ${ph.drag[i]}`);
    }
  }
  t.diagnostic(`snapshots=${snaps.length}  stations=${N}  worst load-sum error=${worst.toExponential(2)}`);
  assert.ok(snaps.length > 1, `only ${snaps.length} snapshots`);
  assert.ok(worst < 1e-9, `axle loads differ from weight + downforce by up to ${worst}`);
});

test('solver: a failing command emits error, changes nothing, and leaves the solver usable', () => {
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
  assert.equal(b.s.running, true, 'a refused command leaves the search running');
  assert.equal(b.s.carRev, 1, 'a rejected car must not replace the current one');
  b.s.handle({ type: 'run' });
  const e0 = b.last('progress').evals;
  for (let k = 0; k < 5; k++) b.s.tick(30);
  assert.ok(b.last('progress').evals > e0, 'solver did not resume after the error');
});

// The client matches an error to the command it answers (and a load or a coalesced setCar waits for that answer), so an
// error carries the rev of the failing command, and null when no command is to blame.
test('solver: an error carries the rev of the failing command, null for a slice or a command without one', () => {
  const b = boot();
  const bad = { ...core.CARS[CAR] }; delete bad.slipPk;
  b.s.handle({ type: 'setCar', rev: 7, params: bad });
  assert.equal(b.last('error').rev, 7, 'a rejected command');
  b.s.handle({ type: 'warp' });
  assert.equal(b.last('error').rev, null, 'a command without a rev');
  b.s.handle({ type: 'run' });
  b.s.opt.step = () => { throw new Error('slice blew up'); };
  b.s.tick(30);
  assert.match(b.last('error').message, /slice blew up/);
  assert.equal(b.last('error').rev, null, 'an error in a slice');
  assert.equal(b.last('error').paused, true, 'a slice error pauses'); assert.equal(b.s.running, false);
});

// The worker owns `running`. The app resumes the search after a car or circuit change with `resume` on that very command,
// not with a separate `run`, which could overtake a coalesced (queued) setCar or land just after convergence.
test('solver: setCar and setTrack with resume start the search; without it they leave it as it was', () => {
  const car = { ...core.CARS[CAR] }, ctrl = core.genCtrl(TRACK.seed, WIDTH);
  const b = boot();
  b.s.handle({ type: 'setCar', rev: 3, params: car });
  assert.equal(b.s.running, false, 'no resume: stays paused');
  assert.equal(b.last('progress').running, false);
  b.s.handle({ type: 'setCar', rev: 4, params: car, resume: true });
  assert.equal(b.s.running, true, 'resume: searching');
  assert.equal(b.last('progress').running, true, 'and the progress event says so');
  const e0 = b.last('progress').evals;
  for (let k = 0; k < 5; k++) b.s.tick(30);
  assert.ok(b.last('progress').evals > e0, 'the search does work');

  b.s.handle({ type: 'pause' });
  b.s.handle({ type: 'setTrack', rev: 5, ctrl, width: WIDTH, keepLine: false, resume: true });
  assert.equal(b.s.running, true, 'setTrack resumes too');
  assert.equal(b.last('progress').running, true);

  const bad = { ...car }; delete bad.slipPk;
  b.s.handle({ type: 'pause' }); // paused, so the check below is about resume, not about an error stopping the search
  b.s.handle({ type: 'setCar', rev: 6, params: bad, resume: true });
  assert.equal(b.last('error').rev, 6);
  assert.equal(b.s.running, false, 'a rejected car does not resume');

  // the app boots with setCar before there is a track: nothing to run yet, and no error
  const ev = [], s = new core.Solver(e => ev.push(e));
  s.handle({ type: 'setCar', rev: 1, params: car, resume: true });
  assert.equal(s.running, false, 'no track yet');
  s.handle({ type: 'setTrack', rev: 2, ctrl, width: WIDTH, keepLine: false, resume: true });
  assert.equal(s.running, true, 'the track\'s resume starts it');
  noErrors(ev);
});

// The line on screen must be one the optimiser accepted (see acceptedObserver). Tallied during the shared converged run.
test('solver: publishes only lines the optimiser accepted', { timeout: 10 * 60 * 1000 }, t => {
  const { checked, polish, bad } = converged().accepted;
  t.diagnostic(`snapshots checked=${checked} (polish ${polish})  not accepted=${bad.length} (outside polish ${bad.filter(b => !b.polish).length})`);
  assert.ok(polish > 0, 'no snapshot was published during the polish stage');
  assert.deepEqual(bad.slice(0, 3), [], `${bad.length} of ${checked} snapshots showed a line the optimiser had not accepted`);
});

// Hills through the protocol (elevation P5): a hilly circuit gets a car with load tables (the same params, so the same
// car revision and no new carInfo), snapshots carry the line's heights and the lap model's warnings, the optimiser and
// the dynamic check run on it, and going flat again keeps the loaded car.
test('solver: a hilly circuit builds load tables under the same car revision and publishes heights', t => {
  const b = boot(), s = b.s, tr = core.TRACKS[0], ctrl = core.genCtrl(tr.seed, WIDTH), u = core.genElev(tr.seed, ctrl), hills = ctrl.map((p, i) => [p[0], p[1], 30 * u[i]]);
  assert.equal(s.car.load, null, 'a flat circuit builds no load tables');
  const step = cmd => { const n0 = b.ev.length; s.handle(cmd); const got = b.ev.slice(n0); noErrors(got); return got; };
  let got = step({ type: 'setTrack', rev: 3, ctrl: hills, width: WIDTH, keepLine: true });
  const trk = got.find(e => e.type === 'track'), snap = got.find(e => e.type === 'snapshot');
  assert.deepEqual(got.map(e => e.type).filter(x => x === 'carInfo'), [], 'no carInfo: the car is the same car');
  assert.equal(trk.flat, false); assert.ok(s.car.load, 'load tables built');
  assert.deepEqual([snap.carRev, snap.trackRev], [1, 3]);
  assert.ok(Number.isFinite(snap.lap) && snap.lap > 0);
  assert.deepEqual(snap.warn, { stall: 0, air: 0, ntop: 0 });
  assert.equal(snap.line.pz.length, s.T.N);
  for (let i = 0; i < s.T.N; i++) if (snap.line.pz[i] !== s.T.z[i]) assert.fail(`pz[${i}]`);
  assert.ok(snap.line.pz.some(z => z !== 0), 'heights published');
  // the optimiser improves a hilly lap, and the dynamic check runs on it
  step({ type: 'run' }); const t0 = performance.now(); while (performance.now() - t0 < 2000 && s.tick(200));
  const after = b.last('snapshot'); t.diagnostic(`hilly lap ${snap.lap.toFixed(3)} -> ${after.lap.toFixed(3)} s after 2 s of search`);
  assert.ok(after.lap < snap.lap, 'no improvement on the hilly circuit');
  step({ type: 'dynCheck' }); while (s.tick(1000));
  const dr = b.last('dynResult'); t.diagnostic(`dynamic check on hills: ${(dr.result.frac * 100).toFixed(1)}%`);
  assert.ok(dr.result.frac >= 0.85 && dr.result.frac <= 1, `fraction ${dr.result.frac}`);
  // a car change on hills builds its own tables; going flat keeps them, and the heights go to 0
  got = step({ type: 'setCar', rev: 4, params: { ...core.CARS['Kart'] } }); assert.ok(s.car.load && got.some(e => e.type === 'carInfo'));
  got = step({ type: 'setTrack', rev: 5, ctrl, width: WIDTH, keepLine: false });
  assert.ok(s.car.load && s.T.flat && got.find(e => e.type === 'snapshot').line.pz.every(z => z === 0), 'flat again');
  got = step({ type: 'load', rev: 6, params: { ...core.CARS[CAR] }, ctrl: hills, width: WIDTH, off: new Float64Array(s.T.N), run: false });
  assert.ok(s.car.load && got.some(e => e.type === 'loaded'), 'a hilly run loads');
});

// A circuit with no length (every control point in one place: L ~ 1e-13 m from rounding) gave a NaN lap, published with
// no error (review L2). load refused it; setTrack must too, and leave everything as it was.
test('solver: setTrack refuses a circuit with no length and changes nothing', () => {
  const { s, ev } = boot(), state = () => ({ car: s.car, T: s.T, B: s.B, off: s.off, pub: s.pub, carRev: s.carRev, trackRev: s.trackRev, lineRev: s.lineRev });
  const before = state(), n0 = ev.length;
  s.handle({ type: 'setTrack', rev: 3, ctrl: [[50, 50, 0], [50, 50, 0], [50, 50, 0], [50, 50, 0]], width: WIDTH, keepLine: false });
  const got = ev.slice(n0);
  assert.deepEqual(got.map(e => e.type), ['error']);
  assert.match(got[0].message, /shorter than the track is wide/);
  assert.deepEqual(state(), before);
});

// A command that throws after it has started changing state (review L4) must leave the solver exactly as it was, search
// included: one error event (paused: false, since nothing stopped), no other event, the same car, track, line,
// optimiser and revisions, still running, and still able to search. Each throw is forced past the assignment point.
test('solver: a command that fails part-way changes nothing and keeps the search going', async t => {
  const failing = {
    setCar: s => { s.opt.rescore = () => { throw new Error('rescore blew up'); }; return { type: 'setCar', rev: 3, params: { ...core.CARS[CAR], mass: 1400 } }; },
    setTrack: s => { s.opt.setup = () => { throw new Error('setup blew up'); }; return { type: 'setTrack', rev: 3, ctrl: core.genCtrl(TRACK.seed + 1, WIDTH), width: WIDTH, keepLine: false }; },
    load: s => { s.opt.setup = () => { throw new Error('setup blew up'); }; return { type: 'load', rev: 3, params: { ...core.CARS[CAR] }, ctrl: core.genCtrl(TRACK.seed + 1, WIDTH), width: WIDTH, off: new Float64Array(400), run: false }; },
    dynCheck: s => { const pub = s.publish.bind(s); s.publish = b => { pub(b); throw new Error('after publish'); }; return { type: 'dynCheck' }; },
  };
  for (const [kind, arm] of Object.entries(failing)) await t.test(kind, () => {
    const b = boot(), s = b.s;
    s.handle({ type: 'run' }); for (let k = 0; k < 3; k++) s.tick(30);
    const keys = ['car', 'params', 'T', 'B', 'off', 'pub', 'ref', 'opt', 'carRev', 'trackRev', 'lineRev', 'running', 'dyn'];
    const before = Object.fromEntries(keys.map(k => [k, s[k]])), offBefore = Float64Array.from(s.off), optOff = s.opt.off;
    const cmd = arm(s), n0 = b.ev.length;
    s.handle(cmd);
    const got = b.ev.slice(n0);
    assert.deepEqual(got.map(e => e.type), ['error'], 'events');
    assert.equal(got[0].paused, false, 'a refused command stops nothing');
    for (const k of keys) assert.equal(s[k], before[k], k);
    assert.deepEqual(s.off, offBefore, 'working line contents'); assert.equal(s.opt.off, optOff, 'optimiser still works on the solver\'s line');
    delete s.opt.rescore; delete s.opt.setup; delete s.publish; // the prototype methods again
    const e0 = b.last('progress').evals; for (let k = 0; k < 5; k++) s.tick(30);
    assert.ok(b.last('progress').evals > e0, 'the search carries on');
  });
});
