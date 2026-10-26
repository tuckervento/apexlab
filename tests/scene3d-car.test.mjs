import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from '../vendor/three-0.186.1/build/three.core.js';
import { CARS } from '../src/app/presets.js';
import { buildCarModel, placeCar, disposeCar } from '../src/views/scene3d/car.js';
import { dataToThree } from '../src/views/scene3d/frame.js';

const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-10,`${message}: ${a} != ${b}`);

test('preset dimensions, axle offsets, CG height and ghost defaults',()=>{
  for(const [name,dims] of Object.entries(CARS)){
    const car=buildCarModel(dims,{color:0x123456,opacity:0.4});
    const size=new Box3().setFromObject(car).getSize(new Vector3());
    assert.ok(size.x>=dims.wb&&size.x<=dims.wb+2,`${name} length`);
    assert.ok(size.z>=dims.track&&size.z<=dims.track+0.6,`${name} width`);
    close(car.getObjectByName('body').position.y,dims.cg,'body follows CG height');
    assert.equal(car.getObjectByName('body').material.color.getHex(),0x123456);
    car.traverse(o=>{if(o.material){assert.equal(o.material.opacity,0.4);assert.equal(o.material.transparent,true);}});
    for(const end of ['F','R'])for(const side of ['L','R']){
      const wheel=car.getObjectByName(`wheel${end}${side}`);
      close(wheel.position.x,end==='F'?dims.wb*dims.rear/100:-dims.wb*(1-dims.rear/100),'axle position');
      close(wheel.position.z,(side==='R'?1:-1)*dims.track/2,'wheel side');
      close(wheel.position.y,car.userData.radius,'wheel touches road');
      const box=new Box3().setFromObject(wheel);
      assert.ok(Math.abs(box.min.y)<1e-7,'tyre bottom (float32 geometry)');
    }
    if(name==='Kart')close(car.userData.radius,0.14,'kart radius');
    if(name==='GT racer')close(car.userData.radius,0.33,'GT radius');
    disposeCar(car);
  }
  const ghost=buildCarModel({wb:2.65,track:1.66});
  close(ghost.getObjectByName('body').position.y,0.44,'ghost CG default');
  close(ghost.getObjectByName('wheelFR').position.x,2.65/2,'ghost weight default');
  disposeCar(ghost);
});

test('placement preserves forward tangent and right wheels through yaw and pitch',()=>{
  const car=buildCarModel(CARS['GT racer']);
  for(const heading of [0,0.7,-2])for(const pitch of [0,0.23,-0.18]){
    const pose={x:12,y:-7,z:3,heading,pitch};
    placeCar(car,pose);car.updateMatrixWorld(true);
    assert.deepEqual(car.position.toArray(),dataToThree(pose.x,pose.y,pose.z));
    const tangent=new Vector3(...dataToThree(Math.cos(heading)*Math.cos(pitch),Math.sin(heading)*Math.cos(pitch),Math.sin(pitch)));
    assert.ok(new Vector3(1,0,0).applyQuaternion(car.quaternion).dot(tangent)>1-1e-12,'forward follows pose tangent');
    const normal=new Vector3(...dataToThree(-Math.sin(heading),Math.cos(heading),0));
    for(const end of ['F','R']){
      const right=car.getObjectByName(`wheel${end}R`).getWorldPosition(new Vector3());
      const left=car.getObjectByName(`wheel${end}L`).getWorldPosition(new Vector3());
      assert.ok(right.sub(left).normalize().dot(normal)>0.99,'right wheels on +n side');
    }
  }
  placeCar(car,{x:0,y:0,heading:0});
  close(car.rotation.z,0,'missing pitch resets');close(car.position.y,0,'missing elevation defaults to zero');
  disposeCar(car);
});

test('disposal frees every owned geometry and material exactly once, including shared resources',()=>{
  const car=buildCarModel(CARS.Kart),geometries=new Set(),materials=new Set();
  const uses=new Map(),counts=new Map();
  car.traverse(o=>{
    const resources=[];
    if(o.geometry){geometries.add(o.geometry);resources.push(o.geometry);}
    if(o.material)for(const material of [].concat(o.material)){materials.add(material);resources.push(material);}
    for(const resource of resources)uses.set(resource,(uses.get(resource)??0)+1);
  });
  assert.ok(geometries.size>0,'model owns geometry');assert.ok(materials.size>0,'model owns materials');
  const wheelGeometry=car.getObjectByName('wheelFL').children[0].geometry;
  for(const name of ['wheelFR','wheelRL','wheelRR'])assert.equal(car.getObjectByName(name).children[0].geometry,wheelGeometry,'wheels share geometry');
  assert.ok([...materials].some(m=>uses.get(m)>1),'model shares materials between meshes');
  for(const resource of [...geometries,...materials]){
    counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));
  }
  disposeCar(car);
  for(const geometry of geometries)assert.equal(counts.get(geometry),1,'every owned geometry disposed once');
  for(const material of materials)assert.equal(counts.get(material),1,'every owned material disposed once');
  for(const [resource,n] of uses)if(n>1)assert.equal(counts.get(resource),1,'shared resource disposed once, not once per mesh');
});
