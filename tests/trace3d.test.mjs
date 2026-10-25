import { test } from 'node:test';
import assert from 'node:assert/strict';
const {currentTrace,tracePoseAt,traceCars,failureReplayTime}=await import(process.env.TRACE3D_MODULE||'../src/app/trace3d.js');
const snapshot={tc:[0,3,6,9],t:9};
const trace={t:[0.25,1.25],x:[3,4],y:[0,0],psi:[0,0],v:[1,1],vy:[0.1,0.1],r:[0,0],st:[1,1],s:[0,1],z:[0,0],ax:[0,0],ay:[0,0],delta:[0.1,0.1],alf:[0,0],alr:[0,0],gear:[1,1]};
const dyn={start:1,trace};

test('trace3d aligns trace sampling and hides outside recorded time',()=>{
  assert.equal(tracePoseAt(snapshot,dyn,3.25).x,3);
  assert.equal(tracePoseAt(snapshot,dyn,3.75).x,3.5);
  assert.equal(tracePoseAt(snapshot,dyn,3),null);
  assert.equal(tracePoseAt(snapshot,dyn,4.5),null);
  assert.equal(tracePoseAt(snapshot,null,3.5),null);
});
test('trace3d rejects stale results and selects lap dynamic or both',()=>{
  assert.equal(currentTrace({dyn},false),dyn);
  assert.equal(currentTrace({dyn},true),null);
  assert.equal(currentTrace(null,false),null);
  assert.equal(currentTrace({dyn:null},false),null);
  const lap={x:1},p={x:2};
  assert.deepEqual(traceCars(lap,p,'lap',true),{car:lap,trace:null});
  assert.deepEqual(traceCars(lap,p,'dynamic',true),{car:null,trace:p});
  assert.deepEqual(traceCars(lap,p,'both',true),{car:lap,trace:p});
  assert.deepEqual(traceCars(lap,p,'dynamic',false),{car:lap,trace:null});
});
test('failure replay seeks 1.5 seconds before station including lap wrap and ghost cycle',async()=>{
  const {raceClock}=await import('../src/playback/pose.js');
  for(const at of [0,1,2])for(const laps of [[9],[9,14]]){
    const rt=raceClock(laps,failureReplayTime(snapshot,{at}));
    assert.equal((snapshot.tc[at]-rt+snapshot.t)%snapshot.t,1.5);
  }
});
