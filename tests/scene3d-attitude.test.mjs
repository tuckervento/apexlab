import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';
import { init, step, view } from '../src/views/scene3d/attitude.js';

const core=await loadCore();
function snapshot(hills){
  const events=[],s=new core.Solver(e=>events.push(e)),ctrl=core.genCtrl(core.TRACKS[0].seed,12);
  const heights=core.genElev(core.TRACKS[0].seed,ctrl);
  s.handle({type:'setCar',rev:1,params:{...core.CARS['GT racer']}});
  s.handle({type:'setTrack',rev:2,ctrl:ctrl.map((p,i)=>[...p,hills*heights[i]]),width:12,keepLine:false});
  const e=events.filter(e=>e.type==='snapshot').at(-1);
  return {...e.line,t:e.lap};
}
const laps=[snapshot(0),snapshot(40)],options={wb:2.6,radius:0.33};
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,`${msg}: ${a} vs ${b}`);

test('cosmetic steady roll/pitch scale and right-bend signs',()=>{
  const d=laps[0],s=init(d,options),p={...core.pose(d,0),ay:s.ayPeak,ax:s.axPeak,station:0,frac:0.25};
  for(let i=0;i<600;i++)step(s,p,1/60);
  near(s.roll,-3*Math.PI/180,0.02*3*Math.PI/180,'peak roll');
  near(s.pitch,2*Math.PI/180,0.02*2*Math.PI/180,'peak pitch');
  const i=d.k.findIndex((k,i)=>k>0&&d.k[(i+1)%d.k.length]>0);
  const right=core.stationPose(d,i,0.37);
  step(s,right,1/60);
  near(s.steer,Math.atan(options.wb*(d.k[i]*0.63+d.k[(i+1)%d.k.length]*0.37)),1e-14,'interpolated steer');
  assert.ok(s.steer>0&&s.roll<0,'right steer and outside (left) roll');
  step(s,{...right,steer:-0.123},1/60);assert.equal(s.steer,-0.123);
  step(s,{...right,steer:0},1/60);assert.equal(s.steer,0);
  for(let i=0;i<600;i++)step(s,{...p,ay:-s.ayPeak/2,ax:-s.axPeak/2},1/60);
  near(s.roll,1.5*Math.PI/180,1e-8,'negative half peak roll');
  near(s.pitch,-Math.PI/180,1e-8,'braking pitch');
});

function run(d,dt,total){
  const s=init(d,options),sample=t=>core.pose(d,t);
  for(let t=0;t<total;){const h=Math.min(dt,total-t);t+=h;step(s,sample(t),h,sample);}
  return s;
}
test('fixed animation ticks match frame rates and replay speeds; pause freezes all state',()=>{
  for(const d of laps){
    const total=Math.min(20,d.t),ref=run(d,1/60,total);
    for(const fps of [30,60,144])for(const replay of [0.5,4,12]){
      const s=run(d,replay/fps,total);
      assert.deepEqual(view(s),view(ref),`${fps} Hz, replay ${replay}`);
      const before=structuredClone(s);step(s,{...core.pose(d,0),steer:1},0);
      assert.deepEqual(s,before,'pause changes no state');
    }
  }
});

test('wheel spin integrates one lap distance within 0.1%',()=>{
  for(const d of laps){
    const s=run(d,1/60,d.t),L=d.ds.reduce((a,b)=>a+b,0);
    near(s.spin,L/options.radius,0.001*L/options.radius,'lap spin L/r');
  }
});

test('zero acceleration ranges stay finite and invalid time is rejected',()=>{
  const d={px:[0,1],k:[0,0],v:[0,0],ds:[1,1]},s=init(d,options);
  step(s,{station:0,frac:0,speed:0,ax:0,ay:0},1);
  assert.deepEqual(view(s),{roll:0,pitch:0,steer:0,spin:0});
  assert.throws(()=>step(s,{},-1),RangeError);
  assert.throws(()=>init(d,{wb:2,radius:0}),RangeError);
});
