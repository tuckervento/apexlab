import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from '../vendor/three-0.186.1/build/three.core.js';
import { dataToThree, yawFromHeading, stationFrames } from '../src/views/scene3d/frame.js';

const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-12,`${message}: ${a} != ${b}`);
const vector=(a,i)=>new Vector3().fromArray(a,3*i);
const headings=[0,0.7,-2];
const T={N:3,cx:[3,7,-2],cy:[8,-4,9],z:[2,5,-1],width:12,
  nx:headings.map(h=>-Math.sin(h)),ny:headings.map(h=>Math.cos(h))};

test('data frame projects like the y-down map and yaw preserves forward/right',()=>{
  assert.deepEqual(dataToThree(2,3,5),[2,5,3]);
  const camera=new PerspectiveCamera(60,1,0.1,100);
  camera.position.set(0,10,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const project=(x,y,z)=>new Vector3(...dataToThree(x,y,z)).project(camera);
  const centre=project(0,0,0),x=project(1,0,0),y=project(0,1,0);
  assert.ok(x.x>centre.x,'data +x projects screen right');
  assert.ok(y.y<centre.y,'data +y projects screen down (negative NDC y)');
  close(x.y,centre.y,'+x stays horizontal');close(y.x,centre.x,'+y stays vertical');
  for(const h of headings){
    close(yawFromHeading(h),-h,'negative heading is yaw');
    const forward=new Vector3(1,0,0).applyAxisAngle(new Vector3(0,1,0),yawFromHeading(h));
    const tangent=new Vector3(...dataToThree(Math.cos(h),Math.sin(h),0));
    const n=new Vector3(...dataToThree(-Math.sin(h),Math.cos(h),0));
    assert.ok(forward.dot(tangent)>=1-1e-6,'car forward matches tangent');
    assert.ok(forward.clone().cross(new Vector3(0,1,0)).dot(n)>=1-1e-6,'forward cross up matches right normal');
  }
});

test('station frames keep level cross-sections on grades and bank lowers the right edge',()=>{
  const flat=stationFrames(T),zero=stationFrames(T,new Float64Array(T.N));
  assert.deepEqual(flat,zero,'omitted bank is zero');
  for(const a of Object.values(flat)){
    assert.ok(a instanceof Float64Array);assert.equal(a.length,3*T.N);
  }
  const bank=[0,0.3,-0.4],frames=stationFrames(T,bank);
  for(let i=0;i<T.N;i++){
    assert.deepEqual(Array.from(flat.origin.slice(3*i,3*i+3)),dataToThree(T.cx[i],T.cy[i],T.z[i]));
    assert.deepEqual(Array.from(flat.lateral.slice(3*i,3*i+3)),[T.nx[i],0,T.ny[i]]);
    assert.deepEqual(Array.from(flat.up.slice(3*i,3*i+3)),[0,1,0]);
    const t=vector(frames.tangent,i),l=vector(frames.lateral,i),u=vector(frames.up,i);
    const expected=new Vector3(...dataToThree(Math.cos(headings[i]),Math.sin(headings[i]),0));
    assert.ok(t.dot(expected)>=1-1e-6,'station tangent follows plan heading despite changing height');
    for(const v of [t,l,u])close(v.length(),1,'unit frame');
    close(t.dot(l),0,'tangent/lateral orthogonal');close(t.dot(u),0,'tangent/up orthogonal');
    close(l.dot(u),0,'lateral/up orthogonal');
    assert.ok(t.clone().cross(u).dot(l)>=1-1e-6,'bank preserves frame orientation');
    const o=vector(frames.origin,i),half=T.width/2;
    close(o.clone().addScaledVector(l,half).y,T.z[i]-half*Math.sin(bank[i]),'right edge height');
    close(o.clone().addScaledVector(l,-half).y,T.z[i]+half*Math.sin(bank[i]),'left edge height');
    close(l.dot(vector(flat.lateral,i)),Math.cos(bank[i]),'bank rotates lateral');
    close(u.dot(vector(flat.lateral,i)),Math.sin(bank[i]),'bank rotates up toward right');
  }
});
