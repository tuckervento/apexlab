import test from 'node:test';
import assert from 'node:assert/strict';
import { cornerAnchor } from '../src/views/scene3d/overlays.js';

test('corner anchors sit outside either bend at road height in the three frame',()=>{
  const T={width:12,cx:[10],cy:[20],z:[40],nx:[0.6],ny:[0.8]};
  assert.deepEqual(cornerAnchor(T,{apex:0,sign:1}),[4.6000000000000005,40,12.8]);
  assert.deepEqual(cornerAnchor(T,{apex:0,sign:-1}),[15.399999999999999,40,27.2]);
  assert.deepEqual(cornerAnchor(T,{apex:0,sign:1},4),[4,40,12]);
});
