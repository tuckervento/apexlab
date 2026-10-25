import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, setupPreset } from './load-core.mjs';
import { PerspectiveCamera, Vector3 } from '../vendor/three-0.186.1/build/three.core.js';
import { dataToThree } from '../src/views/scene3d/frame.js';
const root=process.env.APEX_CAMERA_SRC??new URL('../src/views/scene3d/cameras/',import.meta.url).href;
const heli=await import(root+'heli.js'),pair=await import(root+'pair.js');
const core=await loadCore();
function snapshot(hills,ticks){
  const {T}=setupPreset(core,'GT racer',{hills}),events=[],solver=new core.Solver(e=>events.push(e));
  const ctrl=core.genCtrl(core.TRACKS[0].seed,12),elev=core.genElev(core.TRACKS[0].seed,ctrl);
  solver.handle({type:'setCar',rev:1,params:{...core.CARS['GT racer']}});
  solver.handle({type:'setTrack',rev:2,ctrl:hills?ctrl.map((p,i)=>[...p,hills*elev[i]]):ctrl,width:12,keepLine:false});
  solver.handle({type:'run'});
  for(let i=0;i<ticks;i++)solver.tick(25);
  const m=events.filter(e=>e.type==='snapshot').at(-1),d={...m.line,t:m.lap};
  return {T,d,sample:t=>core.smoothPose(d,t)};
}
const laps=[snapshot(0,0),snapshot(40,0),snapshot(40,40)];

function input(lap,ghost,aspect=1){
  const sample=t=>lap.sample(core.raceClock(ghost?[lap.d.t,ghost.d.t]:[lap.d.t],t));
  const sampleGhost=t=>ghost?.sample(core.raceClock([lap.d.t,ghost.d.t],t))??null;
  return {T:lap.T,car:sample(0),ghost:sampleGhost(0),sample,sampleGhost,aspect};
}
for(const [name,cam] of [['heli',heli],['pair',pair]]){
  test(name+': frame rates and replay speeds agree within 1 cm',()=>{
    for(const lap of laps.slice(0,2)){
      let reference;
      for(const fps of [30,60,144])for(const replay of [0.5,4,12]){
        const i=input(lap,name==='pair'?laps[2]:null),s=cam.init(i),out=[];
        let time=0,frame=1;
        for(let n=1;n<=40;n++){
          const end=lap.d.t*n/40;
          while(time<end-1e-12){
            const next=Math.min(frame*replay/fps,end);i.car=i.sample(next);i.ghost=i.sampleGhost(next);
            cam.step(s,i,next-time);time=next;if(time>=frame*replay/fps-1e-12)frame++;
          }
          out.push(cam.view(s));
        }
        if(!reference)reference=out;
        for(let n=0;n<out.length;n++)for(const key of ['position','target'])
          assert.ok(Math.hypot(...out[n][key].map((x,k)=>x-reference[n][key][k]))<0.01,`${fps} Hz ${replay}x ${key}`);
      }
    }
  });
  test(name+': zero animation time freezes all state',()=>{
    const i=input(laps[1],laps[2]),s=cam.init(i);cam.step(s,i,0.2);const before=structuredClone(s);
    cam.step(s,{...i,car:null,ghost:null,sample:()=>{throw Error('paused sample');}},0);
    assert.deepEqual(s,before);
    assert.throws(()=>cam.step(s,i,-1),RangeError);
  });
}
test('heli: steady eye is high and behind, target leads along the path',()=>{
  const p=laps[1].sample(5),i={T:laps[1].T,car:p},s=heli.init(i);
  for(let n=0;n<600;n++)heli.step(s,i,1/60);
  const v=heli.view(s),a=dataToThree(p.x,p.y,p.z),f=dataToThree(Math.cos(p.heading),Math.sin(p.heading),0);
  assert.ok(Math.abs(v.position[1]-a[1]-28)<1e-8,'28 m above');
  assert.ok(Math.abs(f.reduce((sum,x,k)=>sum+x*(a[k]-v.position[k]),0)-32)<1e-8,'32 m behind');
  const target=dataToThree(p.x+p.tangent[0]*p.speed*0.8,p.y+p.tangent[1]*p.speed*0.8,p.z+p.tangent[2]*p.speed*0.8);
  assert.deepEqual(v.target,target);
});
test('pair: pinned snapshots stay within NDC border for a whole race-clock cycle',()=>{
  assert.notEqual(laps[1].d.t,laps[2].d.t,'snapshots differ in quality');
  for(const aspect of [0.45,1,2]){
    const i=input(laps[1],laps[2],aspect),s=pair.init(i),cycle=Math.max(laps[1].d.t,laps[2].d.t)+1;
    for(let n=0;n<=Math.ceil(cycle*30)+1;n++){
      if(n)pair.step(s,i,1/30);
      const v=pair.view(s),c=new PerspectiveCamera(v.fovDeg,aspect,v.near,v.far);
      c.position.fromArray(v.position);c.up.fromArray(v.up);c.lookAt(new Vector3(...v.target));c.updateMatrixWorld();
      for(const p of [i.sample(n/30),i.sampleGhost(n/30)]){
        const a=new Vector3(...dataToThree(p.x,p.y,p.z)).project(c);
        assert.ok(Math.abs(a.x)<=0.9&&Math.abs(a.y)<=0.9&&Math.abs(a.z)<=1,`aspect ${aspect}, tick ${n}: ${a.toArray()}`);
      }
    }
  }
});
test('pair: without ghost equals heli, including sub-step sampling',()=>{
  const i=input(laps[1]),a=heli.init(i),b=pair.init(i);
  for(let n=0;n<300;n++){
    heli.step(a,i,0.1);pair.step(b,i,0.1);assert.deepEqual(pair.view(b),heli.view(a));
  }
});
