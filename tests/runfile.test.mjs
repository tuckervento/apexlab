// Saved runs (ARCHITECTURE.md §7, §10.1): the solver's atomic `load` command and the run-file format. A loaded line
// must come back exactly as recorded, because the point of a run file is to compare the same line under other physics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCore, coreSource } from './load-core.mjs';
import { loadGolden, assertRuntime, comboKey } from './golden-util.mjs';
import { PHYSICS } from '../src/app/physics-version.js';
import { liveHash, makeRunFile, readRunFile, toGhost, CAR_KEYS } from '../src/app/runfile.js';

const core = await loadCore(), CAR = 'GT racer', TRACK = core.TRACKS[0], WIDTH = 12;

// A solver booted the way the app boots (car, then track), all events recorded.
function boot() {
  const ev = [], s = new core.Solver(e => ev.push(e));
  s.handle({ type: 'setCar', rev: 1, params: { ...core.CARS[CAR] } });
  s.handle({ type: 'setTrack', rev: 2, ctrl: core.genCtrl(TRACK.seed, WIDTH), width: WIDTH, keepLine: false });
  return { s, ev };
}
const noErrors = ev => assert.deepEqual(ev.filter(e => e.type === 'error'), [], 'solver emitted errors');

test(`load: the recorded line comes back bit for bit, ${CAR}, ${TRACK.name}`, async t => {
  const g = loadGolden(), fx = g.combos[comboKey(CAR, TRACK.name)];
  const { s, ev } = boot(), n0 = ev.length, lineRev0 = s.lineRev;
  s.handle({ type: 'load', rev: 3, params: { ...core.CARS[CAR] }, ctrl: core.genCtrl(TRACK.seed, WIDTH), width: WIDTH, off: fx.off, run: false });
  const got = ev.slice(n0); noErrors(got);
  const snap = got.find(e => e.type === 'snapshot'), loaded = got.find(e => e.type === 'loaded'), prog = got.filter(e => e.type === 'progress').at(-1);

  await t.test('property', () => {
    assert.deepEqual(got.map(e => e.type), ['carInfo', 'track', 'snapshot', 'progress', 'loaded'], 'event order');
    assert.deepEqual({ car: snap.carRev, track: snap.trackRev, loaded: loaded.rev }, { car: 3, track: 3, loaded: 3 }, 'one revision for car and track');
    assert.equal(snap.lineRev, lineRev0 + 1);
    assert.equal(prog.running, false, 'run:false stays paused');
    assert.equal(loaded.N, fx.N); assert.equal(snap.line.off.length, fx.N);
    assert.equal(loaded.clamped.n, 0, `fixture line was clamped at ${loaded.clamped.n} stations (max ${loaded.clamped.max} m)`);
    assert.ok(snap.ref && snap.ref.t > snap.lap, 'centreline reference lap sent with the first snapshot');
  });
  await t.test('golden', () => {
    assertRuntime(g);
    assert.equal(snap.lap, fx.lap, 'lap time of the loaded line');
    const diff = [];
    for (let i = 0; i < fx.N; i++) if (snap.line.off[i] !== fx.off[i] || s.pub[i] !== fx.off[i]) diff.push(i);
    assert.equal(diff.length, 0, `loaded line differs from the fixture at ${diff.length} stations (first: ${diff[0]})`);
  });
});

test('physics version: the committed hash is current', () => {
  const live = coreSource();
  assert.deepEqual(PHYSICS, { sha256: live.sha256, files: live.files },
    'src/app/physics-version.js is stale: run `node tests/make-physics-version.mjs --write` and commit it with the physics change');
});

test('liveHash: the browser-side hash equals coreSource()', async () => {
  const root = process.env.APEX_SRC || fileURLToPath(new URL('../src', import.meta.url));
  assert.equal(await liveHash(PHYSICS.files, async f => readFileSync(join(root, f))), coreSource().sha256);
});

// A run exported from a solver that has loaded the committed GT racer / Harrow Ring fixture line (non-trivial doubles).
function recorded() {
  const fx = loadGolden().combos[comboKey(CAR, TRACK.name)], { s, ev } = boot();
  s.handle({ type: 'load', rev: 3, params: { ...core.CARS[CAR] }, ctrl: core.genCtrl(TRACK.seed, WIDTH), width: WIDTH, off: fx.off, run: false });
  const snaps = ev.filter(e => e.type === 'snapshot'), snap = snaps.at(-1);
  const args = {
    P: { ...core.CARS[CAR] }, ctrl: core.genCtrl(TRACK.seed, WIDTH), width: WIDTH, trackName: TRACK.name, seed: TRACK.seed,
    disp: { ...snap.line, t: snap.lap }, prog: { converged: true, evals: 78063 }, refT: snap.ref.t, dyn: null,
    physics: { sha256: PHYSICS.sha256, live: PHYSICS.sha256 }, exported: '2026-10-23T00:00:00.000Z', userAgent: 'test',
  };
  return { file: makeRunFile(args), snap, args };
}
const sameArrays = (a, b, what) => { assert.equal(a.length, b.length, `${what} length`); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) assert.fail(`${what}[${i}]: ${a[i]} !== ${b[i]}`); };

test('run file: survives JSON, and loads back to the recorded lap', () => {
  const { file, snap } = recorded(), back = readRunFile(JSON.parse(JSON.stringify(file)));
  sameArrays(back.line.off, snap.line.off, 'line.off');
  for (const k of ['px', 'py', 'v', 'ds', 'k', 'tc']) sameArrays(back.result.snapshot[k], snap.line[k], `snapshot.${k}`);
  for (const k of Object.keys(snap.line.phys)) sameArrays(back.result.snapshot.phys[k], snap.line.phys[k], `phys.${k}`);
  assert.equal(back.result.lap, snap.lap);
  assert.deepEqual(back.car, core.CARS[CAR]);
  const { s, ev } = boot(), n0 = ev.length;
  s.handle({ type: 'load', rev: 3, params: back.car, ctrl: back.track.ctrl, width: back.track.width, off: back.line.off, run: false });
  noErrors(ev);
  const again = ev.slice(n0).find(e => e.type === 'snapshot');
  assert.equal(again.lap, back.result.lap, 'lap of the line loaded from the file');
  assert.equal(ev.slice(n0).find(e => e.type === 'loaded').clamped.n, 0);
  const ghost = toGhost(back);
  assert.deepEqual([ghost.t, ghost.wb, ghost.track], [snap.lap, core.CARS[CAR].wb, core.CARS[CAR].track]);
});

test('run file: refuses what it cannot use, and says what', () => {
  const { file, args } = recorded(), refuses = (mutate, re) => { const f = JSON.parse(JSON.stringify(file)); mutate(f); assert.throws(() => readRunFile(f), re); };
  refuses(f => { f.format = 'other'; }, /format: expected "apexlab-run", got "other"/);
  refuses(f => { f.version = 2; }, /version: file is format v2; this build reads v1/);
  refuses(f => { delete f.car.mu; delete f.car.sens; }, /car: missing fields mu, sens/);
  refuses(f => { f.car.turbo = 1; }, /car: unknown field turbo/);
  refuses(f => { f.line.off.pop(); }, /line\.off: expected \d+ values, got \d+/);
  refuses(f => { f.result.snapshot.tc.pop(); }, /snapshot\.tc: expected \d+ values, got \d+/);
  refuses(f => { f.result.snapshot.phys.fxf[3] = null; }, /phys\.fxf\[3\]: expected a finite number, got null/);
  refuses(f => { f.track.ctrl = f.track.ctrl.slice(0, 3); }, /track\.ctrl: expected at least 4/);
  refuses(f => { f.track.width = -1; }, /track\.width: expected > 0, got -1/);
  const nan = Float64Array.from(args.disp.off); nan[0] = NaN;
  assert.throws(() => makeRunFile({ ...args, disp: { ...args.disp, off: nan } }), /export: line\.off\[0\] is NaN/);
});

test('run file: CAR_KEYS is every preset field, and carSpec needs each one', () => {
  for (const [name, p] of Object.entries(core.CARS)) assert.deepEqual(Object.keys(p).sort(), [...CAR_KEYS].sort(), `${name} fields`);
  for (const k of CAR_KEYS) {
    const p = { ...core.CARS[CAR] }; delete p[k];
    assert.throws(() => core.carSpec(p), new RegExp(`carSpec: ${k}\\b`), `carSpec without ${k}`);
  }
});

test('load: another station count is resampled; run:true searches; bad input changes nothing', async t => {
  const ctrl = core.genCtrl(TRACK.seed, WIDTH), params = { ...core.CARS[CAR] };

  await t.test('resampled', () => {
    const { s, ev } = boot(), n0 = ev.length, N = s.T.N;
    s.handle({ type: 'load', rev: 3, params, ctrl, width: WIDTH, off: new Float64Array(N / 2 | 0).fill(1.5), run: false });
    noErrors(ev);
    const snap = ev.slice(n0).find(e => e.type === 'snapshot');
    assert.equal(snap.line.off.length, N, 'snapshot has the track\'s station count');
    for (let i = 0; i < N; i++) if (Math.abs(snap.line.off[i] - 1.5) > 1e-12) assert.fail(`off[${i}] = ${snap.line.off[i]}`);
  });
  await t.test('run:true searches from the loaded line', () => {
    const { s, ev } = boot(), n0 = ev.length;
    s.handle({ type: 'load', rev: 3, params, ctrl, width: WIDTH, off: new Float64Array(s.T.N), run: true });
    assert.equal(ev.slice(n0).filter(e => e.type === 'progress').at(-1).running, true);
    assert.equal(s.tick(50), true, 'a slice of optimiser work');
  });
  await t.test('bad input leaves car, track, line and revisions as they were', () => {
    for (const [why, bad] of [['mass NaN', { params: { ...params, mass: NaN } }], ['non-finite line', { off: Float64Array.of(0, NaN, 0) }], ['circuit with no length', { ctrl: [[0, 0]] }]]) {
      const { s, ev } = boot(), before = { car: s.car, T: s.T, B: s.B, off: s.off, pub: s.pub, carRev: s.carRev, trackRev: s.trackRev, lineRev: s.lineRev }, n0 = ev.length;
      s.handle({ type: 'load', rev: 3, params, ctrl, width: WIDTH, off: new Float64Array(s.T.N), run: true, ...bad });
      const got = ev.slice(n0);
      assert.deepEqual(got.map(e => e.type), ['error'], `${why}: events`);
      assert.deepEqual({ car: s.car, T: s.T, B: s.B, off: s.off, pub: s.pub, carRev: s.carRev, trackRev: s.trackRev, lineRev: s.lineRev, running: s.running }, { ...before, running: false }, `${why}: state`);
    }
  });
});
