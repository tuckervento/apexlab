import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, setupPreset } from './load-core.mjs';
import { init, step, view } from '../src/views/scene3d/cameras/chase.js';
import { dataToThree } from '../src/views/scene3d/frame.js';

const core=await loadCore();
function snapshot(hills){
  const {T}=setupPreset(core,'GT racer',{hills}),events=[],solver=new core.Solver(e=>events.push(e));
  const ctrl=core.genCtrl(core.TRACKS[0].seed,12),elev=core.genElev(core.TRACKS[0].seed,ctrl);
  solver.handle({type:'setCar',rev:1,params:{...core.CARS['GT racer']}});
  solver.handle({type:'setTrack',rev:2,ctrl:hills?ctrl.map((p,i)=>[...p,hills*elev[i]]):ctrl,width:12,keepLine:false});
  solver.handle({type:'run'});
  for(let i=0;i<40;i++)solver.tick(25);
  const m=events.filter(e=>e.type==='snapshot').at(-1),d={...m.line,t:m.lap};
  return {T,d,sample:t=>core.smoothPose(d,t)};
}
const laps=[snapshot(0),snapshot(40)];
// Camera constants: trail 8 m, lift 3 m, W=8 /s. A critically damped position
// spring lags constant velocity by 2*v/W. Add 2 m for fixed-tick latency and
// changing direction/height; settle for 1 s (eight spring time constants).
const followBound=d=>Math.hypot(8,3)+2*Math.max(...d.v)/8+2;
function follow(v,p){
  const car=dataToThree(p.x,p.y,p.z),forward=dataToThree(Math.cos(p.heading),Math.sin(p.heading),0);
  return {distance:Math.hypot(...car.map((x,i)=>x-v.position[i])),
    behind:forward.reduce((s,x,i)=>s+x*(car[i]-v.position[i]),0)};
}
function checkView(v,p,T){
  assert.deepEqual(Object.keys(v).sort(),['position','target','up','fovDeg','near','far'].sort());
  assert.ok([...v.position,...v.target,...v.up,v.fovDeg,v.near,v.far].every(Number.isFinite),'finite view');
  assert.ok(v.position[1]>=T.z[p.station]+1,'track height + 1 m margin');
  assert.deepEqual(v.up,[0,1,0],'no roll');
  const expected=dataToThree(p.x+p.tangent[0]*p.speed*0.4,p.y+p.tangent[1]*p.speed*0.4,p.z+p.tangent[2]*p.speed*0.4);
  for(let i=0;i<3;i++)assert.ok(Math.abs(v.target[i]-expected[i])<1e-8,'0.4 s tangent lead');
}

test('chase: full smoothPose laps agree across frame rates and replay speeds', t=>{
  let max=0;
  for(const {T,d,sample} of laps){
    let maxDistance=0,minBehind=Infinity;
    const bound=followBound(d);
    const checkpoints=Array.from({length:80},(_,i)=>d.t*(i+1)/80);
    let reference;
    for(const fps of [30,60,144])for(const replay of [0.5,4,12]){
      const input={T,car:sample(0),sample},state=init(input),outputs=[];
      let distance=0,behind=Infinity;
      let time=0,frame=1;
      for(const end of checkpoints){
        while(time<end-1e-12){
          const next=Math.min(frame*replay/fps,end);
          input.car=sample(next);
          step(state,input,next-time);time=next;
          const p=sample(state.time);checkView(view(state),p,T);
          if(time>=1){
            const f=follow(view(state),p);
            distance=Math.max(distance,f.distance);behind=Math.min(behind,f.behind);
          }
          if(time>=frame*replay/fps-1e-12)frame++;
        }
        outputs.push(view(state));
      }
      if(!reference)reference=outputs;
      for(let n=0;n<outputs.length;n++)for(const key of ['position','target']){
        const error=Math.hypot(...outputs[n][key].map((x,i)=>x-reference[n][key][i]));
        max=Math.max(max,error);assert.ok(error<0.01,`${fps} Hz ${replay}x ${key}: ${error} m`);
      }
      assert.ok(distance<=bound,`moving follow distance ${distance} m <= ${bound} m`);
      assert.ok(behind>0,`moving camera stays behind car: dot=${behind}`);
      maxDistance=Math.max(maxDistance,distance);minBehind=Math.min(minBehind,behind);
    }
    t.diagnostic(`${T.flat?'flat':'40 m hills'}: follow bound=${bound} m, observed max=${maxDistance} m, min behind dot=${minBehind} m`);
  }
  t.diagnostic(`maximum view difference ${max} m`);
});

test('chase: sub-step sampler follows moving car even with a held frame pose', ()=>{
  for(const {T,d,sample} of laps){
    const input={T,car:sample(0),sample},state=init(input);
    for(let time=0.1;time<d.t;time+=0.1){
      step(state,input,0.1);
      if(time<1)continue;
      const f=follow(view(state),sample(state.time));
      assert.ok(f.distance<=followBound(d),`sampler moving follow distance ${f.distance} m`);
      assert.ok(f.behind>0,'sampler camera stays behind moving car');
    }
  }
});

test('chase: zero time freezes every field; track re-init is finite', ()=>{
  for(const {T,sample} of laps){
    const input={T,car:sample(0),sample},state=init(input);
    step(state,input,0.2);
    const before=structuredClone(state);
    step(state,{T:laps[1].T,car:sample(10),sample:()=>{throw Error('paused sampler');}},0);
    assert.deepEqual(state,before);
    checkView(view(init({T,car:sample(0)})),sample(0),T);
  }
  assert.ok(view(init({T:laps[1].T,car:null})).position.every(Number.isFinite));
});

test('chase: held pose settles behind car, yaw wraps along shortest arc', ()=>{
  const {T,sample}=laps[0];
  const p=sample(5),input={T,car:p},state=init({T,car:sample(0)});
  for(let i=0;i<600;i++)step(state,input,1/60);
  const v=view(state),car=dataToThree(p.x,p.y,p.z),forward=dataToThree(Math.cos(p.heading),Math.sin(p.heading),0);
  const behind=forward.reduce((s,x,i)=>s+x*(car[i]-v.position[i]),0);
  assert.ok(Math.abs(behind-8)<1e-8,'steady camera is 8 m behind car');
  const a={...p,heading:Math.PI-0.01},b={...p,heading:-Math.PI+0.01},wrapped=init({T,car:a});
  step(wrapped,{T,car:b},0.1);
  assert.ok(Math.abs(wrapped.yaw+Math.PI)<0.011,'yaw crosses seam without a full turn');
  assert.throws(()=>step(state,input,-1),RangeError);
  assert.throws(()=>step(state,input,NaN),RangeError);
});
