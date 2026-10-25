import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadCore } from './load-core.mjs';
import { dataToThree } from '../src/views/scene3d/frame.js';
import { Vector3, Euler } from '../vendor/three-0.186.1/build/three.core.js';
const root=process.env.APEX_CAMERA_SRC??resolve('src/views/scene3d/cameras');
const bonnet=await import(pathToFileURL(resolve(root,'bonnet.js'))),free=await import(pathToFileURL(resolve(root,'free.js')));
const close=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-10,`${a} ≈ ${b}`));
function rigid(p,a){
  const v=bonnet.view(bonnet.init({car:p,attitude:a}));
  const rotation=new Euler(-(a.roll??0),-p.heading,p.pitch+(a.pitch??0),'YZX');
  const origin=new Vector3(...dataToThree(p.x,p.y,p.z)),eye=new Vector3(0.6,1.1,0).applyEuler(rotation).add(origin);
  close(v.position,eye.toArray());close(v.up,new Vector3(0,1,0).applyEuler(rotation).toArray());
  close(v.target.map((x,i)=>x-v.position[i]),new Vector3(1,0,0).applyEuler(rotation).toArray());
  assert.equal(v.near,0.1);
  return v;
}
test('bonnet: rigid offset at headings 0, 0.7 and -2; body roll and pitch',()=>{
  for(const heading of [0,0.7,-2])for(const a of [{roll:0,pitch:0},{roll:0.2,pitch:0.04}])rigid({x:13,y:-4,z:2,heading,pitch:0},a);
  const v=rigid({x:0,y:0,z:0,heading:0,pitch:0},{roll:0.2});
  close(v.up,[0,Math.cos(0.2),-Math.sin(0.2)]);
});
test('bonnet: smoothPose grade on a 40 m hill and immediate paused updates',async()=>{
  const core=await loadCore(),events=[],solver=new core.Solver(e=>events.push(e));
  const c=core.genCtrl(core.TRACKS[0].seed,12),h=core.genElev(core.TRACKS[0].seed,c);
  solver.handle({type:'setCar',rev:1,params:{...core.CARS['GT racer']}});
  solver.handle({type:'setTrack',rev:2,ctrl:c.map((p,i)=>[...p,40*h[i]]),width:12,keepLine:false});
  const m=events.filter(e=>e.type==='snapshot').at(-1),d={...m.line,t:m.lap};
  let p=core.smoothPose(d,0);for(let t=0;t<d.t;t+=0.1){const q=core.smoothPose(d,t);if(Math.abs(q.pitch)>Math.abs(p.pitch))p=q;}
  assert.ok(Math.abs(p.pitch)>0.03,'nontrivial hill grade');
  rigid(p,{roll:-0.1,pitch:0.02});
  const s=bonnet.init({car:{...p,x:p.x-10}});bonnet.step(s,{car:p,attitude:{roll:0.1}},0);
  close(bonnet.view(s).position,bonnet.view(bonnet.init({car:p,attitude:{roll:0.1}})).position);
});
test('free: fixed events are deterministic across dt splits and move along the view',()=>{
  const input={car:{x:0,y:0,z:0,heading:0}},v={position:[1,2,3],target:[4,3,5],fovDeg:62};
  const run=splits=>{const s=free.init({...input,view:v});for(const event of [()=>free.look(s,40,-10),()=>free.move(s,3,0,0),()=>free.move(s,0,-2,1)]){event();for(const dt of splits)free.step(s,input,dt);}return s;};
  assert.deepEqual(run([1]),run([0.1,0.2,0.7]));
  const s=free.init({...input,view:v});close(s.position,v.position);
  const direction=free.view(s).target.map((n,i)=>n-s.position[i]);free.move(s,2);
  close(s.position,v.position.map((n,i)=>n+2*direction[i]));
  assert.ok(Math.hypot(...run([1]).position.map((n,i)=>n-v.position[i]))>2);
  close(free.view(free.init({...input,view:v})).target.map((n,i)=>n-v.position[i]),new Vector3(3,1,2).normalize().toArray());
});
test('free: pitch clamps away from both vertical poles',()=>{
  const s=free.init({car:null});free.look(s,0,-1e6);assert.ok(s.pitch<Math.PI/2&&s.pitch>1.5);
  free.look(s,0,2e6);assert.ok(s.pitch>-Math.PI/2&&s.pitch<-1.5);
  assert.ok([...free.view(s).position,...free.view(s).target].every(Number.isFinite));
});
