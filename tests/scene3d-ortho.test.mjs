import test from 'node:test';
import assert from 'node:assert/strict';
import { OrthographicCamera, Vector3 } from '../vendor/three-0.186.1/build/three.core.js';
import { init, step, zoom, view } from '../src/views/scene3d/cameras/ortho.js';
import { Camera } from '../src/views/map2d/camera.js';
import { dataToThree } from '../src/views/scene3d/frame.js';
import { loadCore, setupPreset } from './load-core.mjs';

const core=await loadCore();
function project(s,x,y,z){
  const v=view(s),h=v.ortho.halfHeight,w=h*s.map.cw/s.map.ch,c=new OrthographicCamera(-w,w,h,-h,v.near,v.far);
  c.position.fromArray(v.position);c.up.fromArray(v.up);c.lookAt(...v.target);c.updateMatrixWorld();
  const p=new Vector3(...dataToThree(x,y,z)).project(c);
  return {x:(p.x+1)*s.map.cw/2,y:(1-p.y)*s.map.ch/2,z:p.z};
}
for(const preset of core.TRACKS)for(const [width,height] of [[1280,800],[390,523]]){
  test(`ortho matches map fit: seed ${preset.seed}, ${width}x${height}`,()=>{
    const {T}=setupPreset(core,'GT racer',{seed:preset.seed,hills:40}),s=init({T,width,height}),map=new Camera();
    map.cw=width;map.ch=height;map.fit(T,T.width);
    for(let i=0;i<T.N;i++){
      const p=project(s,T.cx[i],T.cy[i],T.z[i]);
      assert.ok(Math.abs(p.x-map.sx(T.cx[i]))<=0.5,`station ${i} x`);
      assert.ok(Math.abs(p.y-map.sy(T.cy[i]))<=0.5,`station ${i} y`);
      assert.ok(Math.abs(p.z)<=1,`station ${i} depth`);
    }
  });
}
test('ortho crest rises by height times sin tilt in screen metres',()=>{
  const {T}=setupPreset(core,'GT racer',{hills:40}),s=init({T,width:1280,height:800,tilt:45});
  let i=0;for(let j=1;j<T.N;j++)if(T.z[j]>T.z[i])i=j;
  assert.ok(T.z[i]>10,'nontrivial crest');
  const elevated=project(s,T.cx[i],T.cy[i],T.z[i]),flat=project(s,T.cx[i],T.cy[i],0);
  // Compare the same plan point at road height and zero: plan foreshortening cancels.
  const expected=-T.z[i]*Math.sin(Math.PI/4)*800/(2*s.halfHeight);
  assert.ok(Math.abs(elevated.y-flat.y-expected)<1e-8);
  assert.ok(Math.abs(elevated.x-flat.x)<1e-8);
});
test('ortho zoom fixes target and scales half height; follow is opt in',()=>{
  const {T}=setupPreset(core,'GT racer'),s=init({T,width:390,height:523}),target=[...s.target],h=s.halfHeight;
  zoom(s,0.5);assert.equal(s.halfHeight,h/2);assert.deepEqual(s.target,target);
  zoom(s,2);assert.equal(s.halfHeight,h);assert.throws(()=>zoom(s,0),RangeError);
  const input={car:{x:10,y:20},ghost:{x:50,y:80},width:390,height:523};
  step(s,input,1);assert.deepEqual(s.target,target);
  s.follow=true;step(s,input,1);
  const map=new Camera();map.cw=390;map.ch=523;map.frame([input.car,input.ghost],s.zMax,40);
  assert.deepEqual(s.target,dataToThree(map.x,map.y,0));assert.equal(s.halfHeight,523/(2*map.z));
});
