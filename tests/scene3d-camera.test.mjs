import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from '../vendor/three-0.186.1/build/three.core.js';
import { init, step, orbit, pan, zoom, view } from '../src/views/scene3d/cameras/orbit.js';
import { stationFrames } from '../src/views/scene3d/frame.js';
import { loadCore, setupPreset } from './load-core.mjs';

const core=await loadCore();
const camera=(s,aspect)=>{
  const v=view(s),c=new PerspectiveCamera(v.fovDeg,aspect,v.near,v.far);
  c.position.fromArray(v.position);c.up.fromArray(v.up);c.lookAt(...v.target);c.updateMatrixWorld();
  return c;
};

for(const preset of core.TRACKS)for(const hills of [0,40])for(const aspect of [16/9,9/16]){
  test(`overview fits ${preset.seed}, hills ${hills}, aspect ${aspect}`,()=>{
    const {T}=setupPreset(core,'GT racer',{seed:preset.seed,hills});
    const {origin,lateral}=stationFrames(T);
    for(const fovDeg of [35,50,75]){
      const s=init({T,aspect,fovDeg}),v=view(s);
      for(const key of ['position','target','up']){
        assert.ok(Object.hasOwn(v,key),`view requires ${key}`);
        assert.equal(v[key].length,3,`${key} has three components`);
        for(const n of v[key])assert.ok(Number.isFinite(n),`${key} components finite`);
      }
      for(const key of ['fovDeg','near','far']){
        assert.ok(Object.hasOwn(v,key),`view requires ${key}`);
        assert.ok(Number.isFinite(v[key]),`${key} finite`);
      }
      assert.ok(v.fovDeg>0&&v.fovDeg<180,'usable vertical FOV');
      assert.ok(v.near>0&&v.far>v.near,'ordered positive clipping planes');
      const direction=new Vector3().fromArray(v.target).sub(new Vector3().fromArray(v.position));
      assert.ok(direction.length()>0,'eye differs from target');
      assert.ok(direction.normalize().cross(new Vector3().fromArray(v.up).normalize()).length()>1e-6,'up is not parallel to view direction');
      const c=camera(s,aspect),target=new Vector3(...v.target).project(c);
      assert.ok(Math.abs(target.x)<1e-10&&Math.abs(target.y)<1e-10,'view target projects to screen centre');
      assert.ok(target.z>=-1&&target.z<=1,'view target fits clipping planes');
      assert.equal(view(s).fovDeg,fovDeg);
      for(let i=0;i<T.N;i++)for(const sign of [-1,1]){
        const p=new Vector3(...Array.from({length:3},(_,k)=>origin[3*i+k]+sign*lateral[3*i+k]*T.width/2)).project(c);
        assert.ok(Math.abs(p.x)<=0.95&&Math.abs(p.y)<=0.95,`edge ${i} fits NDC: ${p.x}, ${p.y}`);
        assert.ok(p.z>=-1&&p.z<=1,`edge ${i} fits clipping planes`);
      }
    }
  });
}

test('orbit clamps pitch, zoom fixes target, pan uses screen fractions and step is idle',()=>{
  const {T}=setupPreset(core,'GT racer'),s=init({T,aspect:16/9});
  for(let i=0;i<100;i++)orbit(s,0.2,1);
  assert.equal(s.pitch,85*Math.PI/180);
  for(let i=0;i<100;i++)orbit(s,-0.2,-1);
  assert.equal(s.pitch,5*Math.PI/180);
  const target=[...s.target],dist=s.dist;
  zoom(s,0.5);assert.equal(s.dist,dist/2);assert.deepEqual(s.target,target);
  zoom(s,2);assert.equal(s.dist,dist);assert.deepEqual(s.target,target);
  assert.throws(()=>zoom(s,0),RangeError);
  const c=camera(s,s.aspect);
  pan(s,0.1,-0.2);
  const p=new Vector3(...s.target).project(c);
  assert.ok(Math.abs(p.x-0.2)<1e-12&&Math.abs(p.y+0.4)<1e-12,'pan moves target by viewport fractions');
  const before=structuredClone(s);step(s,{aspect:s.aspect},0);assert.deepEqual(s,before);
  step(s,{aspect:9/16},1);assert.equal(s.aspect,9/16);
});
