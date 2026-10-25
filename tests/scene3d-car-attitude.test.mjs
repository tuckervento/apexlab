import test from 'node:test';
import assert from 'node:assert/strict';
import * as attitude from '../src/views/scene3d/attitude.js';
import { smoothPose } from '../src/playback/pose.js';
import { Vector3 } from '../vendor/three-0.186.1/build/three.core.js';
import { buildCarModel, placeCar, disposeCar } from '../src/views/scene3d/car.js';
const {applyAttitude}=await import(process.env.ATTITUDE_MODULE??'../src/views/scene3d/car-attitude.js');

test('attitude leans outward, adds grade pitch, steers right and rolls every wheel forward',()=>{
  const car=buildCarModel({wb:2.65,track:1.66});
  placeCar(car,{x:0,y:0,heading:0.7,pitch:0.12});
  applyAttitude(car,{roll:-0.04,pitch:0.02,steer:0.15,spin:1.2});
  assert.equal(car.rotation.x,0.04,'right corner leans left');
  assert.ok(Math.abs(car.rotation.z-0.14)<1e-12,'cosmetic pitch adds to grade');
  for(const name of ['wheelFL','wheelFR','wheelRL','wheelRR']){
    const pivot=car.getObjectByName(name);
    assert.equal(pivot.rotation.y,name[5]==='F'?-0.15:0,'front steering only');
    assert.equal(pivot.children[0].rotation.z,-1.2,'forward axle spin');
    if(name[5]==='F')assert.ok(new Vector3(1,0,0).applyEuler(pivot.rotation).z>0,'front wheels point right');
  }
  disposeCar(car);
});

test('absent attitude resets all cosmetic transforms after placement',()=>{
  const car=buildCarModel({wb:2.65,track:1.66});
  placeCar(car,{x:0,y:0,heading:0});applyAttitude(car,{roll:0.1,pitch:0.2,steer:0.3,spin:4});
  placeCar(car,{x:0,y:0,heading:1,pitch:0.12});applyAttitude(car);
  assert.equal(Math.abs(car.rotation.x),0);assert.equal(car.rotation.z,0.12);
  for(const child of car.children)if(child.name.startsWith('wheel')){
    assert.equal(Math.abs(child.rotation.y),0);assert.equal(Math.abs(child.children[0].rotation.z),0);
  }
  applyAttitude(null,null);disposeCar(car);
});

test('trace poses use lap scaling and recorded steering at wrapped stations',()=>{
  const lap={px:[0,5,10,15],v:[10,11,10,9],ds:[5,5,5,5],k:[0.03,0.02,0.01,0.04]};
  const tr={t:[0,0.5,1],x:[0,5,10],y:[0,0,0],v:[10,10,10],vy:[0,0,0],psi:[0,0,0],r:[0,0,0],
    delta:[0.2,0,-0.1],ax:[2,2,2],ay:[4,4,4],alf:[0,0,0],alr:[0,0,0],gear:[1,1,1],st:[3,0,1],s:[0,5,10]};
  const car=buildCarModel({wb:2.65,track:1.66}),opts={wb:2.65,radius:car.userData.radius};
  const state=attitude.init(lap,opts),reference=attitude.init(lap,opts);
  assert.equal(state.ayPeak,reference.ayPeak);assert.equal(state.axPeak,reference.axPeak);
  for(const t of [0,0.25,0.5,0.75,1]){
    const p=smoothPose(tr,t);
    assert.ok(Number.isInteger(p.station)&&p.station>=0&&p.station<lap.k.length,'wrapped lap station');
    assert.equal(p.frac??0,0,'trace defaults to station fraction zero');
    attitude.step(state,p,0.1,()=>p);
    assert.equal(state.steer,p.steer,'recorded steer including zero overrides curvature');
    placeCar(car,p);applyAttitude(car,attitude.view(state));
    for(const name of ['wheelFL','wheelFR'])assert.ok(Math.abs(car.getObjectByName(name).rotation.y+p.steer)<1e-12,'rendered recorded steering');
  }
  assert.ok(state.roll<0&&state.pitch>0,'trace accelerations drive the shared lap scale');
  const before=attitude.view(state);attitude.step(state,smoothPose(tr,0),0);assert.deepEqual(attitude.view(state),before,'paused trace attitude freezes');
  disposeCar(car);
});
