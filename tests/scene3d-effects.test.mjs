import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadCore, setupPreset } from './load-core.mjs';
const {init,step,apply}=await import(pathToFileURL(resolve(process.env.EFFECTS_SRC||'src/views/scene3d/effects.js')));
const core=await loadCore();
const flat=setupPreset(core,'GT racer',{hills:0}).T,hills=setupPreset(core,'GT racer',{hills:40}).T;
const p={x:flat.cx[0],y:flat.cy[0],z:0,station:0,frac:0,heading:0,speed:30,ax:0,ay:0};
const base=()=>({position:[-8,3,0],target:[12,0,0],up:[0,1,0],fovDeg:60,near:0.5,far:10000});
function settled(q,T=flat,options={}){const s=init();step(s,q,T,5,options);return s;}

test('effects: FOV is monotone, eased, 55 at rest, 70 at 300 km/h and capped at 72',()=>{
  let prev=0;
  for(let speed=0;speed<=160;speed+=5){const v=apply(settled({...p,speed}),base());assert.ok(v.fovDeg>=prev&&v.fovDeg<=72);prev=v.fovDeg;}
  assert.equal(apply(settled({...p,speed:0}),base()).fovDeg,55);
  assert.ok(Math.abs(apply(settled({...p,speed:300/3.6}),base()).fovDeg-70)<1e-10);
  const s=init();step(s,{...p,speed:100},flat,1/60);assert.ok(s.fov>-5&&s.fov<12);
});
test('effects: reduced motion preserves exactly the base view for any input, including paused changes',()=>{
  for(const fovDeg of [60,65])for(const speed of [0,30,150]){
    const s=settled({...p,speed,ax:-15,ay:20,phys:{nz:2}},hills);
    const v={...base(),fovDeg},before=structuredClone(v);
    assert.deepEqual(apply(s,v,{reduced:true}),before);
    step(s,p,flat,0.1,{reduced:true});assert.deepEqual(apply(s,{...base(),fovDeg}),before);
  }
});
test('effects: flat steady driving has zero shake; 40 m crest, load, brakes and edge excite shake',()=>{
  assert.equal(settled(p).shake,0);
  let station=0,dip=0;for(let i=1;i<hills.N;i++){if(hills.kv[i]<hills.kv[station])station=i;if(hills.kv[i]>hills.kv[dip])dip=i;}
  assert.ok(hills.kv[station]<0&&hills.kv[dip]>0);
  assert.ok(settled({...p,station:dip,x:hills.cx[dip],y:hills.cy[dip]},hills).shake>0);
  const q={...p,station,x:hills.cx[station],y:hills.cy[station]};
  const s=settled(q,hills);assert.ok(s.shake>0);
  assert.notDeepEqual(apply(s,base()).position,base().position);
  for(const input of [{...p,phys:{nz:1.5}},{...p,ax:-8},{...p,x:p.x+flat.nx[0]*flat.width/2,y:p.y+flat.ny[0]*flat.width/2}])assert.ok(settled(input).shake>0);
  assert.equal(settled({...p,speed:0,ax:-8}).shake,0);
  assert.ok(Math.abs(settled(q,hills,{replay:4}).shake*4-s.shake)<1e-15);
});
test('effects: g response is spring eased, bounded and converted through the data frame',()=>{
  const s=settled({...p,ay:10,ax:5,heading:Math.PI/2});
  assert.ok(Math.abs(s.lateral+0.25)<1e-10&&Math.abs(s.back-0.175)<1e-10);
  s.shake=0;
  const v=apply(s,base());assert.ok(Math.abs(v.position[0]+7.75)<1e-10);assert.ok(Math.abs(v.position[2]+0.175)<1e-10);
  assert.deepEqual(v.target,base().target);
});
test('effects: sampled animation path agrees at 30, 60 and 144 Hz',()=>{
  const sample=t=>({...p,speed:30+20*Math.sin(t),ax:5*Math.cos(t),ay:10*Math.sin(2*t),heading:t,phys:{nz:1+0.3*Math.sin(3*t)}});
  let reference;
  for(const fps of [30,60,144]){
    const s=init(),outputs=[];let time=0,frame=1;
    for(const end of [0.5,1,2,3]){
      while(time<end-1e-12){const next=Math.min(frame/fps,end);step(s,sample(next),hills,next-time,{sample});time=next;if(time>=frame/fps-1e-12)frame++;}
      outputs.push(apply(s,base()));
    }
    if(!reference)reference=outputs;
    for(let i=0;i<outputs.length;i++){
      assert.ok(Math.abs(outputs[i].fovDeg-reference[i].fovDeg)<1e-12);
      assert.ok(Math.hypot(...outputs[i].position.map((x,j)=>x-reference[i].position[j]))<1e-12);
    }
    assert.ok(outputs.at(-1).fovDeg>56,'sampler drives speed despite endpoint frames');
  }
});
test('effects: zero animation time freezes every state field and never samples',()=>{
  const s=settled(p),before=structuredClone(s);
  step(s,{...p,speed:200},hills,0,{reduced:true,sample:()=>{throw Error('paused');}});assert.deepEqual(s,before);
  assert.throws(()=>step(s,p,flat,-1),RangeError);assert.throws(()=>step(s,p,flat,NaN),RangeError);
});
