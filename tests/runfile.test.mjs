// Saved runs (ARCHITECTURE.md §7, §10.1): the solver's atomic `load` command and the run-file format. A loaded line
// must come back exactly as recorded, because the point of a run file is to compare the same line under other physics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCore, runSource } from './load-core.mjs';
import { fixtureCase } from './fixture-util.mjs';
import { PHYSICS } from '../src/app/physics-version.js';
import { liveHash, makeRunFile, readRunFile, toGhost, CAR_KEYS } from '../src/app/runfile.js';
import { SPEC } from '../src/app/sliders.js';

const fx = await fixtureCase('GT racer|Harrow Ring');
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
  const { s, ev } = boot(), n0 = ev.length, lineRev0 = s.lineRev;
  s.handle({ type: 'load', rev: 3, params: fx.car, ctrl: fx.ctrl, width: fx.width, off: fx.off, run: false });
  const got = ev.slice(n0); noErrors(got);
  const snap = got.find(e => e.type === 'snapshot'), loaded = got.find(e => e.type === 'loaded'), prog = got.filter(e => e.type === 'progress').at(-1);

  await t.test('property', () => {
    const at = type => got.findIndex(e => e.type === type);
    for (const type of ['carInfo', 'track']) assert.ok(at(type) >= 0 && at(type) < at('snapshot'), `${type} before snapshot`);
    assert.ok(at('snapshot') >= 0 && at('snapshot') < at('loaded'), 'snapshot before loaded');
    assert.equal(got.find(e => e.type === 'carInfo').carRev, 3);
    assert.equal(got.find(e => e.type === 'track').trackRev, 3);
    assert.deepEqual({ car: snap.carRev, track: snap.trackRev, loaded: loaded.rev }, { car: 3, track: 3, loaded: 3 }, 'one revision for car and track');
    assert.equal(snap.lineRev, lineRev0 + 1);
    assert.equal(prog.running, false, 'run:false stays paused');
    assert.equal(loaded.N, fx.N); assert.equal(snap.line.off.length, fx.N);
    assert.equal(loaded.clamped.n, 0, `fixture line was clamped at ${loaded.clamped.n} stations (max ${loaded.clamped.max} m)`);
    assert.ok(snap.ref && snap.ref.t > snap.lap, 'centreline reference lap sent with the first snapshot');
  });
  await t.test('exact offsets', () => {
    sameArrays(snap.line.off, fx.off, 'published offsets');
    sameArrays(s.pub, fx.off, 'retained offsets');
  });
  await t.test('current physics', () => {
    const car = core.buildCar(fx.car);
    assert.equal(snap.lap, core.lapEval(fx.T, car, fx.off, core.makeScratch(fx.N)), 'loaded lap equals fresh current-physics evaluation');
  });
});

test('physics version: the committed hash is current', () => {
  const live = runSource();
  assert.deepEqual(PHYSICS, { sha256: live.sha256, files: live.files },
    'src/app/physics-version.js is stale: run `node tests/make-physics-version.mjs --write` and commit it with the physics change');
});

test('liveHash: the browser-side hash equals runSource()', async () => {
  const root = process.env.APEX_SRC || fileURLToPath(new URL('../src', import.meta.url));
  assert.equal(await liveHash(PHYSICS.files, async f => readFileSync(join(root, f))), runSource().sha256);
});

// A run exported from a solver that has loaded the committed GT racer / Harrow Ring fixture line (non-trivial doubles).
function recorded() {
  const { s, ev } = boot();
  s.handle({ type: 'load', rev: 3, params: fx.car, ctrl: fx.ctrl, width: fx.width, off: fx.off, run: false });
  const snaps = ev.filter(e => e.type === 'snapshot'), snap = snaps.at(-1);
  const args = {
    P: fx.car, ctrl: fx.ctrl, width: fx.width, trackName: fx.trackName, seed: TRACK.seed,
    disp: { ...snap.line, t: snap.lap }, prog: { converged: true, evals: 78063 }, refT: snap.ref.t, dyn: null,
    driver: { name: 'authored driver', sha256: 'a'.repeat(64), live: 'b'.repeat(64) },
    physics: { sha256: PHYSICS.sha256, live: PHYSICS.sha256 }, exported: '2026-10-23T00:00:00.000Z', userAgent: 'test',
  };
  return { file: makeRunFile(args), snap, args };
}
const sameArrays = (a, b, what) => { assert.equal(a.length, b.length, `${what} length`); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) assert.fail(`${what}[${i}]: ${a[i]} !== ${b[i]}`); };

test('run file: survives JSON, and loads back to the recorded lap', () => {
  const { file, snap, args } = recorded(), back = readRunFile(JSON.parse(JSON.stringify(file)));
  sameArrays(back.line.off, snap.line.off, 'line.off');
  for (const k of ['px', 'py', 'pz', 'v', 'ds', 'k', 'tc']) sameArrays(back.result.snapshot[k], snap.line[k], `snapshot.${k}`);
  for (const k of Object.keys(snap.line.phys)) sameArrays(back.result.snapshot.phys[k], snap.line.phys[k], `phys.${k}`);
  assert.equal(back.result.lap, snap.lap);
  assert.equal(back.result.evals, 78063, 'authored evaluation count survives');
  assert.deepEqual(back.driver, args.driver, 'driver identity survives JSON');
  assert.deepEqual(back.physics, args.physics);
  assert.equal(back.exported, args.exported); assert.equal(back.userAgent, args.userAgent);
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
  refuses(f => { f.format = 'other'; }, /format:/);
  refuses(f => { f.version = 3; }, /version:/);
  refuses(f => { f.track.ctrl[2] = f.track.ctrl[2].slice(0, 2); }, /track\.ctrl\[2\]:/);
  refuses(f => { delete f.result.snapshot.pz; }, /snapshot\.pz:/);
  refuses(f => { delete f.car.mu; delete f.car.sens; }, e => {
    assert.match(e.message, /car:/);
    const diagnosis = e.message.split('(')[0]; // exclude the parenthetical inventory of valid fields
    for (const k of ['mu', 'sens']) assert.match(diagnosis, new RegExp(`\\b${k}\\b`), `missing car field names ${k}`);
    return true;
  });
  refuses(f => { f.car.turbo = 1; }, /car:.*turbo/);
  refuses(f => { f.line.off.pop(); }, /line\.off:/);
  refuses(f => { f.result.snapshot.tc.pop(); }, /snapshot\.tc:/);
  refuses(f => { f.result.snapshot.phys.fxf[3] = null; }, /phys\.fxf\[3\]:/);
  refuses(f => { f.track.ctrl = f.track.ctrl.slice(0, 3); }, /track\.ctrl:/);
  refuses(f => { f.track.width = -1; }, /track\.width:/);
  const nan = Float64Array.from(args.disp.off); nan[0] = NaN;
  assert.throws(() => makeRunFile({ ...args, disp: { ...args.disp, off: nan } }), /export: line\.off\[0\]/);
});

test('run file: CAR_KEYS is every preset field, and carSpec needs each one', () => {
  for (const [name, p] of Object.entries(core.CARS)) assert.deepEqual(Object.keys(p).sort(), [...CAR_KEYS].sort(), `${name} fields`);
  for (const k of CAR_KEYS) {
    const p = { ...core.CARS[CAR] }; delete p[k];
    assert.throws(() => core.carSpec(p), new RegExp(`carSpec: ${k}\\b`), `carSpec without ${k}`);
  }
});

// carSpec's limits are physical (units.js); the panel's ranges must sit inside them, or a slider could build a car the
// worker refuses.
test('carSpec accepts every preset, and every slider at its min and max on every preset', () => {
  for (const [name, P] of Object.entries(core.CARS)) {
    core.carSpec(P);
    for (const { k, min, max } of SPEC) if (min !== undefined) for (const v of [min, max])
      assert.doesNotThrow(() => core.carSpec({ ...P, [k]: v }), `${name}, ${k} = ${v}`);
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
  // Finite but outside what the formulas mean (review M6): each was published as a lap (NaN, or 10⁴ s) with no error.
  await t.test('a car value outside its physical limits is refused by name, and changes nothing', () => {
    const bad = [['mass', 0], ['mass', -500], ['cg', -0.1], ['track', 0], ['wb', 0], ['yawDI', 0], ['rear', 0], ['rear', 100],
      ['rollF', 101], ['power', 0], ['nT', 76], ['nRed', 0], ['gears', 0.4], ['gears', 2.5], ['shiftT', -0.1], ['v1', 0],
      ['vTopG', 0], ['evBase', 0], ['evMax', 0], ['cla', -1], ['aeroF', -1], ['cda', -0.1], ['brakeF', 101], ['mu', 0],
      ['mu', -1], ['sens', -0.5]];
    for (const [k, v] of bad) {
      const { s, ev } = boot(), before = { car: s.car, T: s.T, off: s.off, pub: s.pub, carRev: s.carRev, lineRev: s.lineRev }, n0 = ev.length;
      s.handle({ type: 'load', rev: 3, params: { ...params, [k]: v }, ctrl, width: WIDTH, off: new Float64Array(s.T.N), run: true });
      const got = ev.slice(n0);
      assert.deepEqual(got.map(e => e.type), ['error'], `${k} = ${v}: events`);
      assert.match(got[0].message, new RegExp(`carSpec: ${k}\\b`), `${k} = ${v}: message`);
      assert.deepEqual({ car: s.car, T: s.T, off: s.off, pub: s.pub, carRev: s.carRev, lineRev: s.lineRev }, before, `${k} = ${v}: state`);
    }
  });
});

const v1File = () => JSON.parse(readFileSync(new URL('./fixtures/run-v1-gt-harrow.apexlab.json', import.meta.url), 'utf8'));

test('cross-version: reading preserves the v1 record and ghost samples', () => {
  const file = v1File(), run = readRunFile(file);
  for (const k of ['version', 'exported', 'userAgent', 'physics', 'car']) assert.deepEqual(run[k], file[k], `recorded ${k}`);
  assert.equal(run.driver, null, 'legacy file has no separate driver identity');
  for (const k of ['name', 'seed', 'width']) assert.equal(run.track[k], file.track[k], `track.${k}`);
  assert.deepEqual(run.track.ctrl.map(p => p.slice(0, 2)), file.track.ctrl, 'recorded control points');
  assert.equal(run.line.N, file.line.N); sameArrays(run.line.off, file.line.off, 'recorded offsets');
  for (const k of ['lap', 'converged', 'evals', 'ref', 'dyn']) assert.deepEqual(run.result[k], file.result[k], `recorded result.${k}`);
  for (const k of ['px', 'py', 'v', 'ds', 'k', 'tc']) sameArrays(run.result.snapshot[k], file.result.snapshot[k], `recorded snapshot.${k}`);
  for (const k of Object.keys(file.result.snapshot.phys)) sameArrays(run.result.snapshot.phys[k], file.result.snapshot.phys[k], `recorded phys.${k}`);
  const ghost = toGhost(run);
  assert.deepEqual(ghost, { ...run.result.snapshot, t: file.result.lap, wb: file.car.wb, track: file.car.track }, 'ghost keeps the recorded snapshot');
  for (const i of [0, 17, file.line.N - 1]) {
    const p = core.pose(ghost, file.result.snapshot.tc[i]);
    assert.deepEqual([p.station, p.x, p.y, p.speed], [i, file.result.snapshot.px[i], file.result.snapshot.py[i], file.result.snapshot.v[i]], 'ghost replays stored station samples');
  }
});

test('cross-version: loading re-scores the exact v1 line under current physics', () => {
  for (const different of [false, true]) {
    const file = v1File();
    if (different) { file.result.lap = 1234.5; file.physics = { sha256: 'c'.repeat(64), live: 'd'.repeat(64) }; }
    const run = readRunFile(file), { s, ev } = boot(), n0 = ev.length;
    assert.equal(run.result.lap, file.result.lap, 'recorded lap survives different physics');
    assert.deepEqual(run.physics, file.physics, 'recorded physics identity survives');
    s.handle({ type: 'load', rev: 3, params: run.car, ctrl: run.track.ctrl, width: run.track.width, off: run.line.off, run: false });
    const got = ev.slice(n0); noErrors(got);
    const snap = got.find(e => e.type === 'snapshot'), loaded = got.find(e => e.type === 'loaded');
    assert.equal(loaded.N, run.line.N); assert.equal(loaded.clamped.n, 0);
    sameArrays(snap.line.off, file.line.off, 'v1 published offsets');
    const T = core.buildTrack(run.track.ctrl, run.track.width), car = core.buildCar(run.car);
    assert.equal(snap.lap, core.lapEval(T, car, Float64Array.from(file.line.off), core.makeScratch(T.N)), 'v1 loaded lap equals fresh current-physics evaluation');
    if (different) assert.notEqual(snap.lap, 1234.5, 'loading recomputes instead of using the recorded lap');
  }
});

// The v1 -> v2 migration, explicitly: the pre-elevation fixture comes back with heights 0 everywhere (exact: v1 is flat).
test('run file: a v1 file migrates to v2 with z = 0, pz = 0 and load factor nz = 1', () => {
  const run = readRunFile(JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/run-v1-gt-harrow.apexlab.json', import.meta.url)), 'utf8')));
  assert.equal(run.version, 1, 'the file\'s own version is reported');
  assert.ok(run.track.ctrl.every(p => p.length === 3 && p[2] === 0), 'control points [x, y, 0]');
  assert.equal(run.result.snapshot.pz.length, run.line.N, 'v1 pz has one zero per station'); assert.ok(run.result.snapshot.pz.every(z => z === 0), 'pz = 0');
  assert.ok(core.buildTrack(run.track.ctrl, run.track.width).flat, 'the migrated circuit is flat');
  assert.ok(run.result.snapshot.phys.nz.length === run.line.N && run.result.snapshot.phys.nz.every(x => x === 1), 'load factor filled with 1 (level ground)');
});

// A hilly run, v2: exported from a solver on a hilly circuit, through JSON, loaded into a fresh solver.
test('run file: a hilly run survives JSON and loads back to its recorded lap and heights', () => {
  const tr = core.TRACKS[0], ctrl = core.genCtrl(tr.seed, WIDTH), u = core.genElev(tr.seed, ctrl), hills = ctrl.map((p, i) => [p[0], p[1], 30 * u[i]]);
  const { s, ev } = boot(); s.handle({ type: 'setTrack', rev: 3, ctrl: hills, width: WIDTH, keepLine: true }); noErrors(ev);
  const snap = ev.filter(e => e.type === 'snapshot').at(-1);
  const file = makeRunFile({ P: { ...core.CARS[CAR] }, ctrl: hills, width: WIDTH, trackName: 'Edited', seed: null, disp: { ...snap.line, t: snap.lap },
    prog: { converged: false, evals: 0 }, refT: snap.ref.t, dyn: null, physics: { sha256: PHYSICS.sha256, live: PHYSICS.sha256 }, exported: '2026-10-24T00:00:00.000Z', userAgent: 'test' });
  assert.equal(file.version, 2);
  const back = readRunFile(JSON.parse(JSON.stringify(file)));
  assert.deepEqual(back.track.ctrl, hills, 'control points with their heights');
  sameArrays(back.result.snapshot.pz, snap.line.pz, 'snapshot.pz');
  const b2 = boot(), n0 = b2.ev.length;
  b2.s.handle({ type: 'load', rev: 3, params: back.car, ctrl: back.track.ctrl, width: back.track.width, off: back.line.off, run: false });
  const got = b2.ev.slice(n0); noErrors(got);
  const again = got.find(e => e.type === 'snapshot');
  assert.equal(again.lap, back.result.lap, 'lap of the hilly line loaded from the file');
  sameArrays(again.line.pz, back.result.snapshot.pz, 'heights after loading');
});
