import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, mediaParams } from '../tools/cdp.mjs';

const good = {checks: {ready: true, rendered: true}, allTrue: true};
const refusal = 'solver: carSpec: mass must be > 0, got 0';
const options = {expectedConsoleErrors: [/^solver: carSpec: mass must be > 0, got 0$/]};
const fails = (input, reason) => {
  const verdict = classify(input);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.some(r => reason.test(r)), JSON.stringify(verdict.reasons));
};

test('media emulation defaults to light, including calls without features', () => {
  const light = {name: 'prefers-color-scheme', value: 'light'};
  assert.deepEqual(mediaParams('Emulation.setEmulatedMedia'), {features: [light]});
  const params = Object.freeze({media: 'screen', features: Object.freeze([])});
  assert.deepEqual(mediaParams('Emulation.setEmulatedMedia', params), {media: 'screen', features: [light]});
  assert.deepEqual(params.features, []);
});

test('reduced-motion emulation retains the light scheme without changing inputs', () => {
  for (const value of ['reduce', 'no-preference']) {
    const motion = Object.freeze({name: 'prefers-reduced-motion', value});
    const params = Object.freeze({features: Object.freeze([motion])});
    assert.deepEqual(mediaParams('Emulation.setEmulatedMedia', params),
      {features: [motion, {name: 'prefers-color-scheme', value: 'light'}]});
    assert.deepEqual(params.features, [motion]);
  }
});

test('explicit colour schemes pass through unchanged', () => {
  for (const value of ['dark', 'light', '']) {
    const params = {features: [{name: 'prefers-reduced-motion', value: 'reduce'}, {name: 'prefers-color-scheme', value}]};
    assert.equal(mediaParams('Emulation.setEmulatedMedia', params), params);
  }
});

test('other DevTools methods pass through unchanged', () => {
  const params = {features: [{name: 'unrelated', value: 'value'}]};
  assert.equal(mediaParams('Page.navigate', params), params);
  assert.equal(mediaParams('Runtime.evaluate', params), params);
});

test('passing checks, with or without allTrue', () => {
  assert.deepEqual(classify({result: good}), {ok: true, reasons: [], diagnostic: false});
  assert.equal(classify({result: {checks: good.checks}}).ok, true);
});

test('missing or non-object result', () => {
  for (const result of [undefined, null, false, 1, 'pass', []]) fails({result}, /result must be an object/);
});

test('missing checks', () => {
  fails({result: {allTrue: true}}, /checks must be a nonempty object/);
});

test('empty checks', () => {
  fails({result: {checks: {}}}, /checks must not be empty/);
});

test('non-object checks', () => {
  for (const checks of [null, true, 'pass', [true]]) fails({result: {checks}}, /checks must be a nonempty object/);
});

test('non-boolean check names the malformed check', () => {
  for (const value of [1, 0, null, undefined, 'true', [], {}]) fails({result: {checks: {pixel: value}}}, /check pixel must be boolean/);
});

test('false check fails without allTrue and names the check', () => {
  fails({result: {checks: {rendered: false}}}, /check rendered is false/);
});

test('allTrue must agree with the checks', () => {
  fails({result: {...good, allTrue: false}}, /allTrue disagrees/);
  fails({result: {checks: {ready: false}, allTrue: true}}, /allTrue disagrees/);
  for (const allTrue of [undefined, null, 1, 'true']) fails({result: {...good, allTrue}}, /allTrue disagrees/);
});

test('page exception fails a passing result', () => {
  fails({result: good, exceptions: ['TypeError: broken frame']}, /page exception: TypeError: broken frame/);
});

test('unexpected console error fails', () => {
  fails({result: good, consoleErrors: ['broken frame']}, /unexpected console error: broken frame/);
  fails({result: good, options, consoleErrors: [refusal, 'another error']}, /unexpected console error: another error/);
});

test('expected console error occurred', () => {
  assert.equal(classify({result: good, options, consoleErrors: [refusal, refusal]}).ok, true);
});

test('each expected console error must occur', () => {
  fails({result: good, options}, /missing expected console error/);
  fails({result: good, options: {expectedConsoleErrors: [...options.expectedConsoleErrors, /never logged/]},
    consoleErrors: [refusal]}, /missing expected console error: \/never logged\//);
});

test('regex matching is repeatable and preserves declaration state', () => {
  const pattern = /mass/g; pattern.lastIndex = 99;
  const input = {result: good, options: {expectedConsoleErrors: [pattern]}, consoleErrors: [refusal, refusal]};
  assert.equal(classify(input).ok, true);
  assert.equal(classify(input).ok, true);
  assert.equal(pattern.lastIndex, 99);
});

test('diagnostic mode explicitly skips verification', () => {
  assert.deepEqual(classify({result: {diagnostic: true, seen: {frames: 42}}}), {ok: true, reasons: [], diagnostic: true});
  fails({result: {diagnostic: 'true'}}, /checks must be a nonempty object/);
  fails({result: {diagnostic: true, checks: {ready: false}}}, /check ready is false/);
});

test('diagnostics still enforce page exceptions and console errors', () => {
  const result = {diagnostic: true};
  fails({result, exceptions: ['broken frame']}, /page exception/);
  fails({result, consoleErrors: ['broken frame']}, /unexpected console error/);
  fails({result, options}, /missing expected console error/);
});
