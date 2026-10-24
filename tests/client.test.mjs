// The protocol client (src/app/client.js, ARCHITECTURE.md §10.1) against a fake Worker: which commands it sends and when,
// and what it does with the events that come back. controls.js is not imported (it fetches at import); the client calls
// it only through the hooks given to connect(), which are recorded here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sent = [], calls = [];
let worker = null;
globalThis.Worker = class { constructor() { worker = this; } postMessage(m) { sent.push(m); } };
globalThis.document = { querySelector: () => ({}), querySelectorAll: () => [] };

const { S } = await import('../src/app/state.js');
const client = await import('../src/app/client.js');
client.connect({
  renderDerived() {}, renderDyn() {}, runLabel() {}, trackArrived() {},
  showError: msg => calls.push(['showError', msg]), dynLap: n => calls.push(['dynLap', n]),
  loaded: m => calls.push(['loaded', m.rev]), loadFailed: () => calls.push(['loadFailed']),
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
