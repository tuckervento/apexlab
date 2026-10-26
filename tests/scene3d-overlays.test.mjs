import test from 'node:test';
import assert from 'node:assert/strict';
import { cornerAnchor } from '../src/views/scene3d/overlays.js';

test('corner anchors sit outside either bend at road height in the three frame',()=>{
  const T={width:12,cx:[10],cy:[20],z:[40],nx:[0.6],ny:[0.8]};
  for(const sign of [1,-1])for(const margin of [undefined,4]){
    const [x,height,y]=cornerAnchor(T,{apex:0,sign},margin),dx=x-10,dy=y-20;
    const offset=dx*0.6+dy*0.8,clearance=margin===undefined?3:4;
    assert.ok(Math.abs(height-40)<1e-10,'anchor follows road height');
    assert.ok(sign*offset<0,`anchor outside bend sign ${sign}`);
    assert.ok(Math.abs(Math.hypot(dx,dy)-(margin===undefined?9:10))<1e-10,'anchor distance from centreline');
    assert.ok(Math.abs(dx*0.8-dy*0.6)<1e-10,'anchor offset follows road normal');
    assert.ok(Math.abs(Math.abs(offset)-6-clearance)<1e-10,`anchor edge clearance ${clearance} m`);
  }
});
