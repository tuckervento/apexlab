import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadCore, setupPreset } from './load-core.mjs';
import { findCorners } from '../src/views/map2d/map.js';
import * as chase from '../src/views/scene3d/cameras/chase.js';
const tv=await import(pathToFileURL(resolve(process.env.APEX_SRC||'src','views/scene3d/cameras/tv.js')));
const core=await loadCore(),laps=[];
for(const preset of core.TRACKS)for(const hills of [0,40]){
  const {T}=setupPreset(core,'Road car',{seed:preset.seed,hills}),corners=findCorners(T);
  const ds=Float64Array.from({length:T.N},(_,i)=>Math.hypot(T.cx[(i+1)%T.N]-T.cx[i],T.cy[(i+1)%T.N]-T.cy[i],T.z[(i+1)%T.N]-T.z[i]));
  const tc=new Float64Array(T.N+1);for(let i=0;i<T.N;i++)tc[i+1]=tc[i]+ds[i]/30;
  const d={px:T.cx,py:T.cy,pz:T.z,ds,tc,t:tc[T.N],v:new Float64Array(T.N).fill(30),k:T.kc};
  laps.push({T,corners,d,sample:t=>core.smoothPose(d,t%d.t)});
}
test('tv: deterministic outside placements clear every station on all presets and hills',()=>{
  for(const {T,corners} of laps){
    const cameras=tv.placements(T,corners);assert.deepEqual(cameras,tv.placements(T,corners));
    for(const c of cameras){
      const a=Math.floor(c.station),u=c.station-a,b=(a+1)%T.N;
      assert.ok(c.position[1]>T.z[a]*(1-u)+T.z[b]*u,'above local road');
      for(let i=0;i<T.N;i++)assert.ok(Math.hypot(c.position[0]-T.cx[i],c.position[2]-T.cy[i])>=T.width/2+10-1e-9,'every arm clears eye');
    }
    corners.forEach((c,i)=>{const eye=cameras.find(p=>p.corner===i);assert.ok(eye,'corner covered');
      const a=Math.floor(c.apex);assert.ok(((eye.position[0]-T.cx[a])*T.nx[a]+(eye.position[2]-T.cy[a])*T.ny[a])*c.sign<0,'outside corner');});
  }
});
function drive(lap,h){
  const input={...lap,car:lap.sample(0),replay:1},s=tv.init(input),cuts=[];let active=s.active,time=0;
  while(time<lap.d.t-1e-10){const dt=Math.min(h,lap.d.t-time);time+=dt;input.car=lap.sample(time);tv.step(s,input,dt);
    if(active!==s.active){cuts.push({time,active:s.active});active=s.active;}
    const v=tv.view(s);assert.ok(v.fovDeg>=12&&v.fovDeg<=65,'lens limits');
  }
  return {s,cuts};
}
test('tv: smoothPose lap cuts bounded and deterministic at 30, 60, 144 Hz',()=>{
  for(const lap of laps){
    const ref=drive(lap,1/144);
    assert.ok(ref.cuts.length>0,'lap cuts');assert.ok(ref.cuts.length<=2*ref.s.cameras.length,'cuts per lap bound');
    for(const fps of [30,60]){const out=drive(lap,1/fps);assert.deepEqual(out.cuts.map(c=>c.active),ref.cuts.map(c=>c.active),'same cut sequence');
      out.cuts.forEach((c,i)=>assert.ok(Math.abs(c.time-ref.cuts[i].time)<=1/fps+1e-9,'cut time within one frame'));}
  }
});
test('tv: hysteresis bounds cuts while a car hovers at a camera boundary',()=>{
  const {T,corners,sample}=laps[0],p=sample(0),input={T,corners,car:p,replay:1},s=tv.init(input);
  // Two beside/ahead eyes differ by centimetres: sub-pixel pose jitter must not produce repeated cuts.
  s.cameras=[{x:p.x+20,y:p.y+20,position:[p.x+20,p.z+5,p.y+20]},{x:p.x+20,y:p.y-20,position:[p.x+20,p.z+5,p.y-20]}];s.active=0;
  let cuts=0,active=0;
  for(let i=0;i<600;i++){
    const car={...p,heading:0,y:p.y+(i%2?0.01:-0.01)};tv.step(s,{...input,car},1/60);
    if(active!==s.active){cuts++;active=s.active;}
  }
  assert.ok(cuts<=2*s.cameras.length,`cuts bound under boundary jitter: ${cuts}`);
});
test('tv: above 4x equals independently continuously stepped chase, including sampler',()=>{
  for(const lap of laps){
    const input={...lap,car:lap.sample(0),replay:1},s=tv.init(input),c=chase.init(input);
    for(let i=0;i<180;i++){
      input.replay=i<90?1:8;tv.step(s,input,1/30);chase.step(c,input,1/30);
      if(i>=90)assert.deepEqual(tv.view(s),chase.view(c));
    }
    input.replay=4;tv.step(s,input,0);assert.deepEqual(tv.view(s).position,s.cameras[s.active].position,'4x remains TV');
    const before=structuredClone(s);tv.step(s,input,0);assert.deepEqual(s,before,'paused freezes');
    assert.throws(()=>tv.step(s,input,-1),RangeError);
  }
});
