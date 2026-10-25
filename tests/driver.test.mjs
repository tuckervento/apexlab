import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCore, setupPreset, runSource, driverSource } from './load-core.mjs';
import { PHYSICS, DRIVER } from '../src/app/physics-version.js';
import { liveHash, makeRunFile, readRunFile } from '../src/app/runfile.js';

const core=await loadCore(),{referenceDriver}=core;
function scenario(hills=0){
  const {T,car}=setupPreset(core,'GT racer',{hills}),dc=core.dynSetup(car);
  const check=new core.DynCheck(T,car,new Float64Array(T.N));
  return {T,car,dc,line:check.line,v:Float64Array.from(check.vq,x=>x*0.85)};
}

test('independent identities: driver edits change only driver hash; plant edits change only physics hash',()=>{
  const dir=mkdtempSync(join(tmpdir(),'apex-driver-hash-'));
  try{
    cpSync(fileURLToPath(new URL('../src',import.meta.url)),dir,{recursive:true});
    const physics=runSource(dir),driver=driverSource(dir);
    const edit=f=>{const p=join(dir,f);writeFileSync(p,readFileSync(p,'utf8')+'\n// changed\n');};
    edit('drivers/reference.js');
    assert.deepEqual(runSource(dir),physics);
    assert.notEqual(driverSource(dir).sha256,driver.sha256);
    const changedDriver=driverSource(dir);
    edit('dynamics/plant.js');
    assert.notEqual(runSource(dir).sha256,physics.sha256);
    assert.deepEqual(driverSource(dir),changedDriver);
    assert.ok(!physics.files.some(f=>f.startsWith('drivers/')));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('driver manifest is current and browser hash agrees',async()=>{
  const live=driverSource();
  assert.deepEqual(DRIVER,{name:referenceDriver.name,sha256:live.sha256,files:live.files});
  assert.equal(await liveHash(DRIVER.files,async f=>readFileSync(new URL('../src/'+f,import.meta.url))),live.sha256);
});

for(const hills of [0,25])test(`recorded actions replay bit for bit without running reference driver (${hills} m hills)`,()=>{
  const {T,car,dc,line,v}=scenario(hills),actions=[];
  const recorder={
    init:ctx=>referenceDriver.init(ctx),
    step(state,obs){
      // Observations contain scalars only, never plant state, tyre internals or arrays.
      assert.ok(Object.values(obs).every(x=>typeof x==='number'&&Number.isFinite(x)));
      const action=referenceDriver.step(state,obs);actions.push({...action});return action;
    },
  };
  const first=core.dynLap(T,car,dc,line,v,true,recorder);
  let at=0;
  const replay={init(){},step(){assert.ok(at<actions.length);return actions[at++];}};
  assert.deepEqual(core.dynLap(T,car,dc,line,v,true,replay),first);
  assert.equal(at,actions.length);
  // Independent driver instances cannot inherit a previous run's integral.
  assert.deepEqual(core.dynLap(T,car,dc,line,v,true),first);
});

test('a replacement driver cannot mutate plant geometry through init or observations',()=>{
  const {T,car,dc,line,v}=scenario(),before=structuredClone({car,line,v});
  const driver={
    init(ctx){ctx.line.px.fill(1e9);ctx.v.fill(0);ctx.car.drv.fill(0);return null;},
    step(state,obs){obs.vx=-1e9;return {steer:0,fx:1000};},
  };
  const a=core.dynLap(T,car,dc,line,v,true,driver);
  const b=core.dynLap(T,car,dc,line,v,true,{init(){},step(){return {steer:0,fx:1000};}});
  assert.deepEqual(a,b);
  assert.deepEqual({car,line,v},before);
});

test('plant rejects malformed actions before modifying its state',()=>{
  const {car,dc,line}=scenario(),state=core.createPlant(car,{x:0,y:0,vx:20,vy:0,r:0,psi:0,delta:0}),before={...state};
  for(const action of [null,{}, {steer:NaN,fx:1},{steer:0,fx:Infinity}]){
    assert.throws(()=>core.plantStep(state,action,car,dc,line,0),/finite steer and fx/);
    assert.deepEqual(state,before);
  }
});

test('plant enforces steering lock even when driver requests exceed it',()=>{
  const {car,dc,line}=scenario();
  for(const steer of [2,-2]){
    const state=core.createPlant(car,{x:0,y:0,vx:20,vy:0,r:0,psi:0,delta:0});
    for(let i=0;i<500;i++)core.plantStep(state,{steer,fx:0},car,dc,line,0);
    assert.equal(state.delta,Math.sign(steer)*0.6);
  }
});

test('saved runs round-trip independent driver identity; older runs remain readable',()=>{
  const file=JSON.parse(readFileSync(new URL('./fixtures/run-v1-gt-harrow.apexlab.json',import.meta.url)));
  assert.equal(readRunFile(file).driver,null);
  const driver={name:DRIVER.name,sha256:DRIVER.sha256,live:DRIVER.sha256};
  const run=readRunFile({...file,driver});
  assert.deepEqual(run.driver,driver);
  const out=makeRunFile({P:run.car,ctrl:run.track.ctrl,width:run.track.width,trackName:run.track.name,seed:run.track.seed,
    disp:{...run.result.snapshot,off:run.line.off,t:run.result.lap},prog:run.result,refT:run.result.ref,dyn:run.result.dyn,
    physics:{sha256:PHYSICS.sha256},driver,exported:run.exported,userAgent:'test'});
  assert.deepEqual(readRunFile(JSON.parse(JSON.stringify(out))).driver,driver);
  for(const bad of [{name:'',sha256:DRIVER.sha256},{name:DRIVER.name,sha256:'bad'},{...driver,live:'bad'}])
    assert.throws(()=>readRunFile({...file,driver:bad}),/driver\./);
});
