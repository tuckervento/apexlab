import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, setupPreset } from './load-core.mjs';
import { stationFrames } from '../src/views/scene3d/frame.js';
import { kerbs, kerbColors } from '../src/views/scene3d/kerbs.js';
import { findCorners } from '../src/views/map2d/map.js';

const core=await loadCore(),threshold=1/160,width=1;
const pal={colors:{kerb:'#808080',kerb2:'#ffffff'}};
const grey=Math.fround(((128/255+0.055)/1.055)**2.4);
for(const preset of core.TRACKS)for(const hills of [0,40]){
  test(`${preset.name}, ${hills} m: kerbs inside, threshold, height and stripes`,()=>{
    const {T}=setupPreset(core,'Road car',{seed:preset.seed,hills}),frames=stationFrames(T),corners=findCorners(T);
    const mesh=kerbs(T,frames,corners,{pal}),expected=[];
    for(const c of corners)for(let n=0;n<(c.e-c.s+T.N)%T.N;n++){
      const i=(c.s+n)%T.N,j=(i+1)%T.N;
      if(Math.abs(T.kc[i])>=threshold&&Math.abs(T.kc[j])>=threshold&&T.kc[i]*T.kc[j]>0)expected.push([i,j]);
    }
    assert.ok(expected.length>0);assert.equal(mesh.position.length,expected.length*12,'eligible segments only');
    assert.equal(mesh.index.length,expected.length*6);assert.equal(mesh.normal.length,mesh.position.length);
    const stripes=new Set();
    expected.forEach(([i,j],s)=>{
      const stripe=Math.floor(i/2)%2;stripes.add(stripe);
      for(let v=0;v<4;v++){
        const st=v<2?i:j,p=12*s+3*v,sign=Math.sign(T.kc[st]);
        assert.ok(Math.abs(T.kc[st])>=threshold,'vertex station meets threshold');
        let lateral=0;
        for(let k=0;k<3;k++)lateral+=(mesh.position[p+k]-frames.origin[3*st+k])*frames.lateral[3*st+k]*sign;
        assert.ok(lateral>=T.width/2-width-1e-4&&lateral<=T.width/2+0.01+1e-4,'vertex in inside band');
        assert.equal(mesh.position[p+1],Math.fround(T.z[st]),'height follows station');
        assert.deepEqual(Array.from(mesh.color.slice(p,p+3)),Array(3).fill(stripe?1:grey),'two-station stripe in linear RGB');
      }
    });
    assert.equal(stripes.size,2);
    const old=mesh.color;kerbColors(T,corners,old,{pal:{colors:{kerb:'#000',kerb2:'#000'}}});
    assert.equal(mesh.color,old);assert.ok(old.every(v=>v===0),'theme refills existing colors');
    assert.equal(kerbs(T,frames,corners,{threshold:Infinity,pal}).position.length,0,'custom threshold excludes every station');
    assert.equal(kerbs(T,frames,[],{pal}).index.length,0,'no corners means no kerbs');
  });
}
