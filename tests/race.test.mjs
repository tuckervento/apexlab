import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCore, setupPreset } from './load-core.mjs';
const core=await loadCore();
const {race,createJudge,judgeStep}=await import(pathToFileURL(resolve(process.env.APEX_SRC||'src','race/index.js')));
function scenario(){
  const {T,car}=setupPreset(core,'GT racer'),dc=core.dynSetup(car);
  const check=new core.DynCheck(T,car,new Float64Array(T.N));
  return {T,car,dc,line:check.line,v:Float64Array.from(check.vq,x=>x*0.8)};
}
test('continuous laps settle and callbacks preserve driver state',()=>{
  const {T,car,dc,line,v}=scenario(),summaries=[];
  const driver={...core.referenceDriver,lap(state,summary){assert.ok(Number.isFinite(state.eI));summaries.push(summary);}};
  const result=race(T,car,dc,line,v,{laps:4,driver});
  assert.equal(result.complete,true);
  assert.equal(result.incidents.length,0);
  assert.equal(summaries.length,4);
  assert.ok(Math.max(...result.lapTimes.slice(1))-Math.min(...result.lapTimes.slice(1))<0.002);
  assert.ok(result.crossings[0]>0);
});
test('interpolated lap times sum to total',()=>{
  const {T,car,dc,line,v}=scenario(),r=race(T,car,dc,line,v);
  assert.equal(r.complete,true);
  assert.ok(Math.abs(r.lapTimes.reduce((a,b)=>a+b,0)-r.total)<1e-10);
  assert.equal(r.drivingTime,r.crossings.at(-1)-r.crossings[0]);
  assert.ok(r.crossings.every(t=>Math.abs(t/0.004-Math.round(t/0.004))>1e-6));
});
test('scripted steering gives exactly one incident at a repeatable station',()=>{
  const {T,car,dc,line,v}=scenario();
  const driver={init:ctx=>core.referenceDriver.init(ctx),step(s,o){return o.t>1?{steer:0.6,fx:0}:core.referenceDriver.step(s,o);}};
  const r=race(T,car,dc,line,v,{driver,incidentPolicy:'dnf'});
  assert.equal(r.dnf,true);
  assert.equal(r.incidents.length,1);
  assert.equal(r.incidents[0].station,53); // V8 runtime golden (like golden.json); steering lock after one second
});
test('known edge excursions count entries, with warnings and penalties',()=>{
  const T={N:4,width:12,cx:[0,100,200,300],cy:[0,0,0,0],nx:[0,0,0,0],ny:[1,1,1,1]};
  const car={spec:{track:2}},judge=createJudge(),edge=6-2.25/2;
  const line=[0,0.49,0.51,0.8,0.51,0.49,0.51,0,0.51];
  for(const over of line){
    assert.equal(judgeStep(judge,{x:50,y:edge+over,vx:20,vy:0,psi:0},T,car,0,0),null);
  }
  assert.equal(judge.violations,3);
  assert.equal(judge.penalties,5);
});

test('reset informs driver once and charges the incident penalty',()=>{
  const {T,car,dc,line,v}=scenario();
  let kicked=false,notifications=0;
  const driver={init:ctx=>core.referenceDriver.init(ctx),step(s,o){
    if(o.incident){notifications++;kicked=true;}
    return !kicked&&o.t>1?{steer:0.6,fx:0}:core.referenceDriver.step(s,o);
  }};
  const r=race(T,car,dc,line,v,{driver,laps:2});
  assert.equal(r.complete,true);
  assert.equal(r.incidents.length,1);
  assert.equal(notifications,1);
  assert.equal(r.penalties,5+5*Math.floor(r.violations/3));
  assert.ok(Math.abs(r.lapTimes.reduce((a,b)=>a+b,0)-r.total)<1e-10);
});

for(const window of [3,4])test(`default reset across finish scores the lap and reports incidents once (${window})`,()=>{
  const {T,car,dc,line,v}=scenario(),summaries=[];
  let kicked=false;
  const driver={init:ctx=>core.referenceDriver.init(ctx),lap(s,summary){summaries.push(summary);},step(s,o){
    if(o.incident)kicked=true;
    return !kicked&&o.lap>=2&&o.station>=T.N-window&&o.station<T.N-1?{steer:0.6,fx:0}:core.referenceDriver.step(s,o);
  }};
  const r=race(T,car,dc,line,v,{driver,laps:3});
  assert.equal(r.incidents.length,1);
  assert.equal(r.incidents[0].station,T.N-(window===3?2:3));
  assert.equal(r.lapTimes.length,3);
  assert.ok(r.lapTimes.every(t=>t>r.lapTimes[0]-2&&t<r.lapTimes[0]+r.penalties+1));
  assert.ok(Math.abs(r.lapTimes.reduce((a,b)=>a+b,0)-r.total)<1e-10);
  assert.deepEqual(summaries.map(s=>s.incidents.length),[0,1,0]);
});

const straight={N:4,width:12,cx:[0,100,200,300],cy:[0,0,0,0],nx:[0,0,0,0],ny:[1,1,1,1]};
const judgeCar={spec:{track:2}},usableEdge=6-2.25/2;
for(const [name,values] of [
  ['off',{y:usableEdge+3.1}],
  ['tangent spin',{psi:0.5}],
  ['sideslip spin',{vy:20*Math.tan(0.5),psi:-0.5}],
])test(`judge classifies ${name}`,()=>{
  const state={x:50,y:0,vx:20,vy:0,psi:0,...values};
  assert.equal(judgeStep(createJudge(),state,straight,judgeCar,0,0)?.type,name==='off'?'off':'spin');
});
test('judge returns null just under each incident threshold',()=>{
  for(const values of [{y:usableEdge+2.999},{psi:0.449},{vy:20*Math.tan(0.449),psi:-0.449}])
    assert.equal(judgeStep(createJudge(),{x:50,y:0,vx:20,vy:0,psi:0,...values},straight,judgeCar,0,0),null);
});

test('formation is lap zero; formation penalties and incidents belong only to lap one',()=>{
  const {T,car,dc,line,v}=scenario(),summaries=[],seen=new Set();
  let kicked=false;
  const driver={init:ctx=>core.referenceDriver.init(ctx),lap(s,summary){summaries.push(summary);},step(s,o){
    seen.add(o.lap);
    if(o.incident)kicked=true;
    return !kicked&&o.t>1?{steer:0.6,fx:0}:core.referenceDriver.step(s,o);
  }};
  const r=race(T,car,dc,line,v,{driver,laps:3});
  assert.equal(r.incidents.length,1);
  assert.ok(r.incidents[0].t<r.crossings[0]);
  assert.deepEqual([...seen],[0,1,2,3]);
  assert.deepEqual(summaries.map(s=>s.incidents.length),[1,0,0]);
  const penalties=r.lapTimes.map((t,i)=>t-(r.crossings[i+1]-r.crossings[i]));
  assert.ok(Math.abs(penalties[0]-r.penalties)<1e-10);
  assert.ok(penalties.slice(1).every(p=>Math.abs(p)<1e-10));
});
test('first timed lap agrees with lone dynLap within measured start transient',()=>{
  const {T,car,dc,line,v}=scenario(),r=race(T,car,dc,line,v,{laps:1});
  const lone=core.dynLap(T,car,dc,line,v,false);
  // Measured 0.0574140834 s on Node v26.12.1; allow 0.1 s for rolling-start position/transient.
  assert.ok(Math.abs(r.lapTimes[0]-lone.t)<0.1);
});
