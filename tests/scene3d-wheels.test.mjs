import test from 'node:test';
import assert from 'node:assert/strict';
import { CARS } from '../src/app/presets.js';
import { buildCarModel, disposeCar } from '../src/views/scene3d/car.js';
import { applyAttitude } from '../src/views/scene3d/car-attitude.js';
import { WHEEL_SPOKES, wheelBlurred, applyWheelBlur } from '../src/views/scene3d/wheels.js';

test('GT corner speed shows spokes at 1x and blur at 12x',()=>{
  const car=buildCarModel(CARS['GT racer']),r=car.userData.radius;
  assert.equal(wheelBlurred(12,r,1),false);
  assert.equal(wheelBlurred(12,r,12),true);
  const limit=Math.PI/WHEEL_SPOKES*r*60;
  assert.equal(wheelBlurred(limit*(1-1e-10),r,1),false);
  assert.equal(wheelBlurred(limit*(1+1e-10),r,1),true);
  assert.equal(wheelBlurred(12,r,1,{frameDt:1/30}),true);
  assert.equal(wheelBlurred(12,r,1,{spokes:8}),true);
  disposeCar(car);
});

test('wheel blur is monotone in speed and replay and absent at rest or pause',()=>{
  for(const r of [0.14,0.33,0.38]){
    for(const replay of [0,1,4,12]){
      let blurred=false;
      for(let speed=0;speed<=100;speed++){
        const next=wheelBlurred(speed,r,replay);
        assert.ok(!blurred||next,'increasing speed cannot restore spokes');blurred=next;
        if(!speed||!replay)assert.equal(next,false);
      }
    }
    for(const speed of [0,1,12,50,100]){
      let blurred=false;
      for(let replay=0;replay<=12;replay+=0.25){
        const next=wheelBlurred(speed,r,replay);
        assert.ok(!blurred||next,'increasing replay cannot restore spokes');blurred=next;
      }
    }
  }
  assert.equal(wheelBlurred(50,undefined,12),false);
});

test('every spin child has an outward spoked face and shared hidden blur disc',()=>{
  const car=buildCarModel(CARS['GT racer']),geometries=new Set();
  for(const name of ['wheelFL','wheelFR','wheelRL','wheelRR']){
    const pivot=car.getObjectByName(name),spin=pivot.children[0];
    assert.equal(pivot.children.length,1,'one existing spin child');
    const face=spin.getObjectByName('wheelFace'),blur=spin.getObjectByName('wheelBlur');
    assert.ok(face?.isMesh&&blur?.isMesh);
    assert.equal(face.parent,spin);assert.equal(blur.parent,spin);
    assert.equal(face.visible,true);assert.equal(blur.visible,false);
    assert.equal(face.geometry,blur.geometry);geometries.add(face.geometry);
    assert.ok(face.position.z*Math.sign(pivot.position.z)>0.1,'outside tyre cap');
    assert.equal(face.rotation.y,pivot.position.z<0?Math.PI:0);
    assert.equal(face.material.vertexColors,true);assert.equal(blur.material.vertexColors,false);
    const c=face.geometry.attributes.color;
    const light=[];
    for(let i=0;i<32;i++)light.push(c.getX(i*9+3)>0.5);
    assert.equal(light.filter((v,i)=>v&&!light[(i+31)%32]).length,WHEEL_SPOKES,'four distinct contrasting spokes');
  }
  assert.equal(geometries.size,1,'all wheels share disc geometry');
  applyAttitude(car,{spin:1.25});
  for(const on of [true,false,true,false]){
    applyWheelBlur(car,on);
    for(const name of ['wheelFL','wheelFR','wheelRL','wheelRR']){
      const spin=car.getObjectByName(name).children[0];
      assert.equal(spin.rotation.z,-1.25,'swap preserves spin');
      assert.equal(spin.getObjectByName('wheelFace').visible,!on);
      assert.equal(spin.getObjectByName('wheelBlur').visible,on);
    }
  }
  disposeCar(car);
});
