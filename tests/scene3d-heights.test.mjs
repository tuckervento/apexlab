import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const {scaledHeight,scaledPitch}=await import(pathToFileURL((process.env.APEX_SRC||new URL('../src',import.meta.url).pathname)+'/views/scene3d/heights.js'));

test('height scaling fixes the ground and multiplies relief',()=>{
  for(const base of [-23,0,12])for(const e of [1,3,5]){
    assert.equal(scaledHeight(base,e,base),base);
    assert.equal(scaledHeight(base+40,e,base)-base,40*e);
    assert.equal(scaledHeight(base-2,e,base)-base,-2*e);
  }
});
test('grade pitch scales slope with both signs and preserves identity',()=>{
  for(const p of [-0.6,-0.1,0,0.1,0.6]){
    assert.equal(scaledPitch(p,1),p);
    for(const e of [3,5])assert.ok(Math.abs(Math.tan(scaledPitch(p,e))-e*Math.tan(p))<1e-12);
  }
});
