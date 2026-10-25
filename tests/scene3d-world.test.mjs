import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, setupPreset } from './load-core.mjs';
import { stationFrames } from '../src/views/scene3d/frame.js';
import { trackRibbon, groundHeight, groundPlane, skirts } from '../src/views/scene3d/meshes.js';
import { fogRange, worldSize } from '../src/views/scene3d/fog.js';
import * as chase from '../src/views/scene3d/cameras/chase.js';
import { lineRibbon } from '../src/views/scene3d/line.js';
import * as orbit from '../src/views/scene3d/cameras/orbit.js';

const core=await loadCore();
for(const preset of core.TRACKS)for(const hills of [0,40]){
  test(`${preset.name}, ${hills} m: ground bounds, clearance, skirts and fog`,()=>{
    const {T}=setupPreset(core,'Road car',{seed:preset.seed,hills});
    const frames=stationFrames(T),road=trackRibbon(T,frames),wall=skirts(T,frames),ground=groundPlane(T,30),y=groundHeight(T);
    const line=lineRibbon({px:T.cx,py:T.cy,pz:T.z});
    assert.equal(y,Math.fround(Math.min(...T.z)-0.25));
    assert.equal(ground.position.length,12);assert.equal(ground.index.length,6);
    for(let j=0;j<12;j+=3){assert.equal(ground.position[j+1],y);assert.deepEqual([...ground.normal.slice(j,j+3)],[0,1,0]);}
    for(const positions of [road.position,line.position])for(let j=1;j<positions.length;j+=3)assert.ok(y<positions[j],'ground clears road and line');
    for(let k=0;k<3;k+=2){
      const values=Array.from({length:2*T.N},(_,i)=>road.position[3*i+k]);
      const bounds=Array.from({length:4},(_,i)=>ground.position[3*i+k]);
      assert.ok(Math.abs(Math.min(...bounds)-(Math.min(...values)-30))<1e-3);
      assert.ok(Math.abs(Math.max(...bounds)-(Math.max(...values)+30))<1e-3);
    }
    assert.equal(wall.position.length,12*T.N);assert.equal(wall.normal.length,12*T.N);assert.equal(wall.index.length,12*T.N);
    for(let i=0;i<T.N;i++)for(let edge=0;edge<2;edge++){
      const j=12*i+6*edge;
      assert.deepEqual(wall.position.slice(j,j+3),road.position.slice(6*i+3*edge,6*i+3*edge+3));
      assert.equal(wall.position[j+4],y);
      assert.equal(wall.position[j+3],wall.position[j]);assert.equal(wall.position[j+5],wall.position[j+2]);
      assert.equal(wall.normal[j+1],0);
      assert.ok(Math.abs(Math.hypot(...wall.normal.slice(j,j+3))-1)<1e-6);
      assert.ok((wall.normal[j]*frames.lateral[3*i]+wall.normal[j+2]*frames.lateral[3*i+2])*(edge?1:-1)>0.999);
      const a=4*i+2*edge,b=a+1,c=4*((i+1)%T.N)+2*edge,d=c+1;
      assert.deepEqual([...wall.index.slice(12*i+6*edge,12*i+6*edge+6)],edge?[a,c,b,b,c,d]:[a,b,c,b,d,c]);
    }
    const size=worldSize(road.position),world=groundPlane(T,8*size);
    const views=[16/9,9/16].map(aspect=>({camera:orbit.view(orbit.init({T,aspect})),aspect,overview:true}));
    for(let i=0;i<T.N;i++){
      const car={x:T.cx[i],y:T.cy[i],z:T.z[i],heading:Math.atan2(-T.nx[i],T.ny[i]),speed:30,station:i};
      views.push({camera:chase.view(chase.init({T,car})),aspect:16/9,overview:false});
    }
    const fog={near:0,far:0};
    for(const {camera,aspect,overview} of views){
      assert.equal(fogRange(road.position,size,camera,fog),fog,'reuse caller output');
      assert.ok(Number.isFinite(fog.far)&&fog.far>fog.near&&fog.near>0);
      assert.ok(fog.far<=camera.far,'full fog before camera clipping');
      const p=camera.position,d=camera.target.map((v,k)=>v-p[k]),length=Math.hypot(...d);
      if(overview)for(let j=0;j<road.position.length;j+=3){
        const depth=d.reduce((sum,v,k)=>sum+v*(road.position[j+k]-p[k]),0)/length;
        assert.ok(depth<fog.near,'overview road remains unfogged');
      }
      // A visible point has distance <= depth*rayBound, even at a frustum corner.
      // Every boundary is farther away, so any visible ground edge is already fully fogged.
      const tan=Math.tan(camera.fovDeg*Math.PI/360),rayBound=Math.sqrt(1+tan*tan*(1+aspect*aspect));
      for(const k of [0,2]){
        const lo=Math.min(...Array.from({length:4},(_,i)=>world.position[3*i+k]));
        const hi=Math.max(...Array.from({length:4},(_,i)=>world.position[3*i+k]));
        assert.ok(p[k]>lo&&p[k]<hi,'camera inside ground bounds');
        assert.ok(Math.min(p[k]-lo,hi-p[k])/rayBound>fog.far,'visible ground boundary beyond full fog');
      }
    }
  });
}
