import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, setupPreset } from './load-core.mjs';
import { stationFrames, dataToThree } from '../src/views/scene3d/frame.js';
import { trackRibbon } from '../src/views/scene3d/meshes.js';

const core=await loadCore();
const pal={elev:Array.from({length:16},(_,i)=>`rgb(${i*17},${255-i*17},0)`)};
const linear=c=>{const v=c/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;};
for(const preset of core.TRACKS)for(const hills of [0,40]){
  test(`${preset.name}, ${hills} m: closed ribbon edges, winding, normals and height colours`,()=>{
    const {T}=setupPreset(core,'Road car',{seed:preset.seed,hills});
    for(const bank of [0,0.1]){
      const frames=stationFrames(T,new Float64Array(T.N).fill(bank));
      const mesh=trackRibbon(T,frames,{heightColors:true,pal}),{position,normal,index,color}=mesh;
      assert.ok(position instanceof Float32Array);assert.ok(normal instanceof Float32Array);
      assert.ok(index instanceof Uint32Array);
      assert.equal(position.length,6*T.N);assert.equal(normal.length,6*T.N);assert.equal(index.length,6*T.N);
      assert.deepEqual(Array.from(index.slice(-6)),[2*T.N-2,2*T.N-1,0,2*T.N-1,1,0],'last quad closes to station zero');
      const lo=Math.min(...T.z),span=Math.max(1e-6,Math.max(...T.z)-lo);
      if(T.flat)assert.equal(color,undefined);
      else{assert.ok(color instanceof Float32Array);assert.equal(color.length,6*T.N);}
      for(let i=0;i<T.N;i++)for(let edge=0;edge<2;edge++){
        const sign=edge?1:-1,j=6*i+3*edge,half=sign*T.width/2;
        const expected=dataToThree(T.cx[i]+half*T.nx[i]*Math.cos(bank),T.cy[i]+half*T.ny[i]*Math.cos(bank),T.z[i]-half*Math.sin(bank));
        for(let k=0;k<3;k++)assert.equal(position[j+k],Math.fround(expected[k]),'edge at centre +/- banked half width');
        let dot=0;for(let k=0;k<3;k++)dot+=normal[j+k]*frames.up[3*i+k];
        assert.ok(dot>0,'normal points toward station up');
        assert.ok(Math.abs(Math.hypot(...normal.slice(j,j+3))-1)<1e-6,'unit normal');
        if(color){
          const b=Math.round((T.z[i]-lo)/span*15);
          assert.deepEqual(Array.from(color.slice(j,j+3)),[linear(b*17),linear(255-b*17),0].map(Math.fround),'height palette in linear RGB');
        }
      }
      for(let i=0;i<index.length;i+=3){
        const [a,b,c]=Array.from(index.slice(i,i+3),v=>3*v);
        const ux=position[b]-position[a],uz=position[b+2]-position[a+2];
        const vx=position[c]-position[a],vz=position[c+2]-position[a+2];
        assert.ok(uz*vx-ux*vz>0,'triangle winding faces up');
      }
    }
    assert.equal(trackRibbon(T,stationFrames(T)).color,undefined,'height colours are opt-in');
  });
}
