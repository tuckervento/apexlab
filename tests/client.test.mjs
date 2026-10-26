// The protocol client (src/app/client.js, ARCHITECTURE.md §10.1) against a fake Worker: which commands it sends and when,
// and what it does with the events that come back. controls.js is not imported (it fetches at import); the client calls
// it only through the hooks given to connect(), which are recorded here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sent = [], calls = [];
let worker = null;
let observeTrack = () => {};
let recordDyn = false;
globalThis.Worker = class { constructor() { worker = this; } postMessage(m) { sent.push(m); } };
globalThis.document = { querySelector: () => ({}), querySelectorAll: () => [] };

const { S } = await import('../src/app/state.js');
const client = await import('../src/app/client.js');
client.connect({
  renderDerived() {}, renderDyn() { if (recordDyn) calls.push(['renderDyn', S.dynStale]); },
  runLabel: () => calls.push(['runLabel']), trackArrived() { observeTrack(); },
  showError: msg => calls.push(['showError', msg]), dynLap: n => calls.push(['dynLap', n]),
  loaded: m => calls.push(['loaded', m.rev]), loadFailed: () => calls.push(['loadFailed']),
  refused: (kind, msg, view) => calls.push(['refused', kind, msg, view]),
  ghostDropped: () => calls.push(['ghostDropped']),
});
console.error = () => {}; // the client logs every solver error; these tests deliver them on purpose
const deliver = m => worker.onmessage({ data: m });
const of = type => sent.filter(c => c.type === type);
// Module state (revisions, what is in flight) lasts for the whole file, so each test starts from a mark and ends with
// nothing in flight.
const mark = () => { sent.length = 0; calls.length = 0; };

test('client: setCar is coalesced, one in flight and only the latest pending', () => {
  mark();
  for (const tag of ['a', 'b', 'c']) client.sendState('setCar', { params: { tag } });
  assert.deepEqual(of('setCar').map(c => c.params.tag), ['a'], 'only the first goes out at once');
  deliver({ type: 'carInfo', carRev: of('setCar')[0].rev, info: {} });
  assert.deepEqual(of('setCar').map(c => c.params.tag), ['a', 'c'], 'its answer sends the latest, skipping b');
  deliver({ type: 'carInfo', carRev: of('setCar')[1].rev, info: {} });
  assert.equal(of('setCar').length, 2, 'nothing left to send');
});

test('client: dynProgress only updates the label while a dynamic check is running', () => {
  mark();
  S.dynRunning = false; // a car or track change ended the check; the worker had already emitted this one
  deliver({ type: 'dynProgress', lap: 3 });
  assert.deepEqual([...calls], [], 'a late dynProgress must not bring back "running"');
  S.dynRunning = true;
  deliver({ type: 'dynProgress', lap: 4 });
  assert.deepEqual([...calls], [['dynLap', 4]]);
  S.dynRunning = false;
});

test('client: only the error of the command in flight releases it', () => {
  mark();
  client.sendState('setCar', { params: { tag: 'a' } });
  client.sendState('setCar', { params: { tag: 'b' } });
  const first = of('setCar')[0].rev;
  deliver({ type: 'error', rev: null, message: 'slice blew up', stack: '' });
  assert.equal(of('setCar').length, 1, 'an error in a slice answers no command, so b stays queued');
  deliver({ type: 'error', rev: first, message: 'a was refused', stack: '' });
  assert.deepEqual(of('setCar').map(c => c.params.tag), ['a', 'b'], 'the failed command will not be answered, so b goes next');
  deliver({ type: 'carInfo', carRev: of('setCar')[1].rev, info: {} });
  assert.equal(of('setCar').length, 2);
});

const load = () => client.sendLoad({ params: {}, ctrl: [], width: 12, off: [], run: false });
const answerLoad = rev => { deliver({ type: 'carInfo', carRev: rev, info: {} }); deliver({ type: 'track', trackRev: rev, N: 1 }); deliver({ type: 'loaded', rev, N: 1, clamped: { n: 0, max: 0 } }); };

test('client: an error in a slice does not fail a load in flight', () => {
  mark();
  const rev = load();
  deliver({ type: 'error', rev: null, message: 'slice blew up', stack: '' });
  assert.deepEqual([...calls], [['showError', 'slice blew up']], 'the load has not failed');
  answerLoad(rev);
  assert.deepEqual(calls.at(-1), ['loaded', rev], 'the panel is told it loaded');
});

test('client: the error of a load fails it and frees both kinds', () => {
  mark();
  const rev = load();
  deliver({ type: 'error', rev, message: 'load: bad line', stack: '' });
  assert.deepEqual([...calls], [['showError', 'load: bad line'], ['loadFailed']]);
  client.sendState('setCar', { params: { tag: 'after' } });
  client.sendState('setTrack', { ctrl: [], width: 12, keepLine: false });
  assert.deepEqual([of('setCar').at(-1).params.tag, of('setTrack').length], ['after', 1], 'both go straight out');
  deliver({ type: 'carInfo', carRev: of('setCar').at(-1).rev, info: {} });
  deliver({ type: 'track', trackRev: of('setTrack').at(-1).rev, N: 1 });
});

test('client: an edit made while a load is in flight is dropped, not sent after it', () => {
  mark();
  const rev = load();
  client.sendState('setCar', { params: { tag: 'EDIT' } });
  client.sendState('setTrack', { ctrl: [], width: 12, keepLine: false });
  deliver({ type: 'carInfo', carRev: rev, info: {} });
  deliver({ type: 'track', trackRev: rev, N: 1 });
  assert.deepEqual(sent.map(c => c.type), ['load'], 'the load\'s own events do not release the edit; only its answer does');
  deliver({ type: 'loaded', rev, N: 1, clamped: { n: 0, max: 0 } });
  assert.deepEqual(sent.map(c => c.type), ['load'], 'the edit was made against the state the load replaced');
  assert.deepEqual(calls.at(-1), ['loaded', rev]);
  client.sendState('setCar', { params: { tag: 'LATER' } });
  assert.deepEqual(of('setCar').map(c => c.params.tag), ['LATER'], 'both kinds are free again');
  deliver({ type: 'carInfo', carRev: of('setCar')[0].rev, info: {} });
});

test('client: a crashed worker fails a load in flight and frees both kinds, since nothing will answer', () => {
  mark();
  load();
  client.sendState('setCar', { params: { tag: 'queued' } });
  worker.onerror({ preventDefault() {}, message: 'worker died' });
  assert.deepEqual([...calls], [['showError', 'solver failed: worker died'], ['loadFailed']]);
  client.sendState('setCar', { params: { tag: 'after' } });
  assert.deepEqual(of('setCar').map(c => c.params.tag), ['after'], 'nothing waits on the dead load; the edit made meanwhile is dropped with it');
  deliver({ type: 'carInfo', carRev: of('setCar')[0].rev, info: {} });
});

const prog = (running, converged = false) => ({ type: 'progress', stage: 1, of: 6, knot: 48, polish: false, evals: 0, lap: 80, running, converged });

test('client: progress mirrors the worker\'s running flag, and redraws the label only when it changes', () => {
  mark();
  S.running = false; S.prog = null;
  deliver(prog(true));
  assert.equal(S.running, true);
  assert.deepEqual([...calls], [['runLabel']]);
  deliver(prog(true));
  assert.deepEqual([...calls], [['runLabel']], 'nothing changed');
  deliver(prog(false, true));
  assert.equal(S.running, false, 'the worker stopped (converged)');
  assert.deepEqual([...calls], [['runLabel'], ['runLabel']]);
});

test('client: a solver error and a crashed worker both leave it not running', () => {
  mark();
  S.running = true;
  deliver({ type: 'error', rev: null, message: 'slice blew up', stack: '' }); // the solver pauses itself on an error, without a progress
  assert.equal(S.running, false, 'error');
  S.running = true;
  worker.onerror({ preventDefault() {}, message: 'worker died' });
  assert.equal(S.running, false, 'crash');
});

test('client: a queued resume is dropped if the circuit is being edited by the time it is sent', () => {
  mark();
  const land = () => deliver({ type: 'carInfo', carRev: of('setCar').at(-1).rev, info: {} });
  client.sendState('setCar', { params: { tag: 'a' }, resume: true });
  client.sendState('setCar', { params: { tag: 'b' }, resume: true }); // queued behind a
  S.editing = true; // entering circuit-edit mode sends a pause; b must not undo it
  land();
  assert.deepEqual(of('setCar').map(c => [c.params.tag, c.resume]), [['a', true], ['b', false]]);
  land();
  S.editing = false;
  client.sendState('setCar', { params: { tag: 'c' }, resume: true });
  client.sendState('setCar', { params: { tag: 'd' }, resume: true });
  land();
  assert.deepEqual(of('setCar').slice(-2).map(c => [c.params.tag, c.resume]), [['c', true], ['d', true]], 'not editing: kept');
  land();
});

test('client: settled waits for matching snapshots after car, track and load answers', () => {
  mark();
  const snap = (carRev, trackRev) => deliver({ type: 'snapshot', carRev, trackRev, lineRev: 1,
    lap: 80, line: { px: [1] }, vmin: 1, vmax: 2, warn: {} });
  const initial = load();
  answerLoad(initial); snap(initial, initial);
  assert.equal(client.settled(), true, 'an installed load is ready to export and pin');
  client.sendState('setCar', { params: {} });
  const carRev = of('setCar').at(-1).rev;
  assert.equal(client.settled(), false, 'a pending car blocks export and pin');
  deliver({ type: 'carInfo', carRev, info: {} });
  assert.equal(client.settled(), false, 'carInfo alone does not install the matching line');
  snap(initial, initial);
  assert.equal(client.settled(), false, 'another old-car snapshot cannot make the edit ready');
  snap(carRev, initial);
  assert.equal(client.settled(), true, 'the matching car snapshot makes the edit ready');
  client.sendState('setTrack', { ctrl: [], width: 12 });
  const trackRev = of('setTrack').at(-1).rev;
  assert.equal(client.settled(), false, 'a pending track blocks export and pin');
  deliver({ type: 'track', trackRev, N: 1 });
  assert.equal(client.settled(), false, 'a track answer alone does not install its line');
  snap(carRev, initial);
  assert.equal(client.settled(), false, 'another old-track snapshot cannot make the edit ready');
  snap(carRev, trackRev);
  assert.equal(client.settled(), true, 'the matching track snapshot makes the edit ready');
  const rev = load();
  assert.equal(client.settled(), false, 'a pending load blocks export and pin');
  deliver({ type: 'carInfo', carRev: rev, info: {} });
  deliver({ type: 'track', trackRev: rev, N: 1 });
  assert.equal(client.settled(), false, 'car and track answers do not release a load');
  deliver({ type: 'loaded', rev, N: 1, clamped: { n: 0, max: 0 } });
  assert.equal(client.settled(), false, 'loaded alone does not install the matching snapshot');
  snap(carRev, trackRev);
  assert.equal(client.settled(), false, 'a pre-load snapshot cannot make the load ready');
  snap(rev, rev);
  assert.equal(client.settled(), true, 'the matching loaded snapshot is ready to export and pin');
});

// The snapshot's warn (stations at the speed floor, airborne steps, loads past the tables) is a sibling of line, not part
// of it; the map's warning line reads it from S.disp (review E-H1: it was dropped, so no lap warning ever showed).
test('client: a snapshot keeps its warn on S.disp', () => {
  mark();
  S.T = { trackRev: 900 };
  const line = { px: [0], py: [0] }, warn = { stall: 3, air: 0, ntop: 1 };
  deliver({ type: 'snapshot', carRev: 900, trackRev: 900, lineRev: 1, lap: 99, line, vmin: 1, vmax: 2, warn });
  assert.deepEqual(S.disp.warn, warn);
});

// A command the worker refused changed nothing there (paused: false, review L4): the search and a dynamic check go on,
// and once nothing newer of that kind is queued, the page goes back to the last state the worker accepted. The view a
// command carries for that is the page's, never sent to the worker.
test('client: a refused command leaves the search alone and puts the page back to the last accepted state', () => {
  mark();
  const refused = () => calls.filter(c => c[0] === 'refused');
  client.sendState('setCar', { params: { tag: 'a' } }, { P: 'A' });
  deliver({ type: 'carInfo', carRev: of('setCar').at(-1).rev, info: {} });
  S.running = true; S.dynRunning = true;
  client.sendState('setCar', { params: { tag: 'b' } }, { P: 'B' });
  client.sendState('setCar', { params: { tag: 'c' } }, { P: 'C' }); // queued behind b
  deliver({ type: 'error', rev: of('setCar').at(-1).rev, paused: false, message: 'b refused', stack: '' });
  assert.deepEqual(of('setCar').slice(-2).map(c => c.params.tag), ['b', 'c'], 'c goes next');
  assert.deepEqual(refused(), [], 'c is newer: its answer decides');
  deliver({ type: 'error', rev: of('setCar').at(-1).rev, paused: false, message: 'c refused', stack: '' });
  assert.deepEqual(refused(), [['refused', 'setCar', 'c refused', { P: 'A' }]]);
  assert.equal(S.running, true, 'still searching'); assert.equal(S.dynRunning, true, 'check still running');
  assert.ok(sent.every(c => !('view' in c) && !('P' in c)), 'views stay on the page');
  S.dynRunning = false; S.running = false;
});

// A ghost indexes the stations of the circuit it was pinned on (review L5): when another circuit is swapped in, a ghost
// from a different track revision is dropped, not drawn against stations it doesn't match.
test('client: a new circuit drops a ghost pinned on another one', () => {
  mark();
  S.T = { trackRev: 940 }; S.ghost = { trackRev: 940 };
  deliver({ type: 'track', trackRev: 950, N: 300 });
  deliver({ type: 'snapshot', carRev: 950, trackRev: 950, lineRev: 1, lap: 90, line: {}, vmin: 1, vmax: 2, warn: {} });
  assert.equal(S.T.trackRev, 950, 'the new circuit is shown');
  assert.equal(S.ghost, null); assert.deepEqual(calls.filter(c => c[0] === 'ghostDropped'), [['ghostDropped']]);
  S.ghost = { trackRev: 950 }; // pinned on it
  deliver({ type: 'snapshot', carRev: 950, trackRev: 950, lineRev: 2, lap: 89, line: {}, vmin: 1, vmax: 2, warn: {} });
  assert.deepEqual(S.ghost, { trackRev: 950 }, 'a ghost on the shown circuit stays');
  S.ghost = null;
});

test('client: a track and its snapshot swap together at every observable point', () => {
  mark();
  const snap = (trackRev, px) => ({ type: 'snapshot', carRev: 1000, trackRev, lineRev: 1,
    lap: 80, line: { px, py: px.map(() => 0) }, vmin: 1, vmax: 2, warn: {} });
  deliver({ type: 'track', trackRev: 1000, N: 2 });
  deliver(snap(1000, [10, 20]));
  const oldT = S.T, oldDisp = S.disp, seen = [];
  observeTrack = () => seen.push([S.T.trackRev, S.T.N, S.disp.trackRev, [...S.disp.px]]);
  try {
    deliver({ type: 'track', trackRev: 1001, N: 3 });
    assert.equal(S.T, oldT, 'a track event keeps the displayed track until its snapshot');
    assert.equal(S.disp, oldDisp, 'a track event keeps the displayed line until its snapshot');
    assert.deepEqual(seen, [], 'the pending track is not announced as displayed');
    deliver(snap(1001, [30, 40, 50]));
    assert.deepEqual([S.T.trackRev, S.T.N, S.disp.trackRev, S.disp.px],
      [1001, 3, 1001, [30, 40, 50]], 'the matching snapshot installs both new station arrays');
    assert.deepEqual(seen, [[1001, 3, 1001, [30, 40, 50]]],
      'trackArrived observes the new track together with its matching line');
  } finally {
    observeTrack = () => {};
  }
});

const snapshot = (carRev, trackRev, lineRev, px = [10, 20]) => ({ type: 'snapshot', carRev, trackRev, lineRev,
  lap: 80, line: { px, py: px.map(() => 0) }, vmin: 1, vmax: 2, warn: {} });

test('client: older car and track snapshots cannot replace the displayed run', () => {
  mark();
  deliver({ type: 'track', trackRev: 1100, N: 2 });
  deliver(snapshot(1101, 1100, 1));
  const newerCar = S.disp;
  deliver({ ...snapshot(1100, 1100, 2, [90, 99]), ref: { t: 999, v: [99] } });
  assert.equal(S.disp, newerCar, 'an older car snapshot cannot replace the displayed line');
  assert.deepEqual(S.disp.px, [10, 20], 'the rendered car line keeps the newer coordinates');
  deliver({ type: 'track', trackRev: 1102, N: 3 });
  deliver({ ...snapshot(1101, 1102, 3, [30, 40, 50]), ref: { t: 75, v: [3, 4, 5] } });
  const newerTrack = S.T, newerDisp = S.disp;
  // Even a delayed track event must not let its delayed snapshot roll the display back.
  deliver({ type: 'track', trackRev: 1100, N: 2 });
  deliver({ ...snapshot(1101, 1100, 4, [90, 99]), ref: { t: 999, v: [99] } });
  assert.equal(S.disp, newerDisp, 'an older track snapshot cannot replace the displayed line');
  assert.equal(S.T, newerTrack, 'an older track snapshot cannot replace the displayed track');
  assert.deepEqual([S.disp.px, S.refT, S.refV], [[30, 40, 50], 75, [3, 4, 5]],
    'the rendered track line and reference remain the newer run');
});

test('client: dynamic currency follows car, track and line revisions at the display boundary', () => {
  mark();
  recordDyn = true;
  const result = (carRev, trackRev, lineRev) => deliver({ type: 'dynResult', carRev, trackRev, lineRev,
    result: { pace: 0.95 } });
  const current = (carRev, trackRev, lineRev) => {
    result(carRev, trackRev, lineRev);
    assert.equal(S.dynStale, false, 'a result matching all displayed revisions is current');
    assert.deepEqual(calls.at(-1), ['renderDyn', false], 'the result renders as current');
  };
  const stale = dimension => {
    assert.equal(S.dynStale, true, `${dimension} revision change makes the displayed result stale`);
    assert.deepEqual(calls.at(-1), ['renderDyn', true], `${dimension} revision change renders the stale result`);
  };
  try {
    deliver({ type: 'track', trackRev: 1200, N: 2 });
    deliver(snapshot(1200, 1200, 10));
    current(1200, 1200, 10);
    client.send({ type: 'view', tyreUse: true });
    const beforeView = calls.length;
    deliver({ ...snapshot(1200, 1200, 10), line: { px: [10, 20], py: [0, 0], u: [0.4, 0.6] } });
    assert.deepEqual(S.disp.u, [0.4, 0.6], 'the unchanged-line view snapshot is installed');
    assert.equal(S.dynStale, false, 'an unchanged-line view snapshot keeps the result current');
    assert.equal(calls.length, beforeView, 'an unchanged-line view does not render a stale transition');
    deliver(snapshot(1201, 1200, 10)); stale('car');
    current(1201, 1200, 10);
    deliver({ type: 'track', trackRev: 1202, N: 2 });
    deliver(snapshot(1201, 1202, 10)); stale('track');
    current(1201, 1202, 10);
    deliver(snapshot(1201, 1202, 11)); stale('line');
    current(1201, 1202, 11);
    for (const [dimension, revs] of [['car', [1200, 1202, 11]], ['track', [1201, 1200, 11]], ['line', [1201, 1202, 10]]]) {
      result(...revs); stale(dimension);
      current(1201, 1202, 11);
    }
  } finally {
    recordDyn = false;
    S.dynRes = null; S.dynStale = false;
  }
});
