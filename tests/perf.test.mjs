import { test } from 'node:test';
import assert from 'node:assert/strict';
const {frameStats,perfWindow}=await import(process.env.APEX_PERF_SRC || '../src/app/perf.js');

test('frame percentiles use numeric nearest rank without reordering samples',()=>{
  const a=[100,2,10,3];assert.deepEqual(frameStats(a),{p50:3,p95:100,frames:4});
  assert.deepEqual(a,[100,2,10,3]);assert.deepEqual(frameStats([]),{p50:null,p95:null,frames:0});
});
test('windows split running and idle frames and attribute long tasks by start time',()=>{
  const w=perfWindow(100);
  w.sample(110,'2d',true);w.sample(130,'2d',false);w.sample(160,'3d chase',true);w.sample(200,'3d chase',true);
  const r=w.close(220,[{startTime:99,duration:90},{startTime:100,duration:60},
    {startTime:130,duration:70},{startTime:159,duration:80},{startTime:160,duration:50},{startTime:220,duration:90}]);
  assert.deepEqual(r.intervals,[30,40]);assert.deepEqual(r.idleIntervals,[20]);
  assert.equal(r.runningFrames,2);assert.equal(r.idleFrames,1);
  assert.equal(r.p50,30);assert.equal(r.p95,40);assert.equal(r.idleP50,20);assert.equal(r.idleP95,20);
  assert.equal(r.longTasks,2);assert.equal(r.longTaskMs,110);
  assert.equal(r.idleLongTasks,2);assert.equal(r.idleLongTaskMs,150);
  assert.equal(r.mixed,true);assert.equal(r.mode,'3d chase');
  const next=perfWindow(220);next.sample(230,'3d overview',false);next.sample(270,'3d overview',false);
  const n=next.close(280);assert.deepEqual(n.intervals,[]);assert.deepEqual(n.idleIntervals,[40]);
  assert.equal(n.p50,null);assert.equal(n.p95,null);assert.equal(n.runningFrames,0);assert.equal(n.mixed,false);
  r.intervals.push(999);r.idleIntervals.push(999);
  assert.deepEqual(w.close(220).intervals,[30,40]);assert.deepEqual(w.close(220).idleIntervals,[20]);
});
