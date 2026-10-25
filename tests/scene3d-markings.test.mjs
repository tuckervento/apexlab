import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, setupPreset } from './load-core.mjs';
import { stationFrames } from '../src/views/scene3d/frame.js';
import { findCorners } from '../src/views/map2d/map.js';
import { boardPlacements, signPlacements, startBand, labelAtlas, labelPlanes, labelBacks, markerPosts } from '../src/views/scene3d/markings.js';

const core=await loadCore();
for(const preset of core.TRACKS)for(const hills of [0,40]){
  const {T}=setupPreset(core,'Road car',{seed:preset.seed,hills}),f=stationFrames(T),corners=findCorners(T);
  test(`${preset.name}, ${hills} m: markings outside every track station`,()=>{
    const boards=boardPlacements(T,corners),signs=signPlacements(T,corners);
    assert.equal(boards.length,3*corners.length);assert.equal(signs.length,corners.length);
    for(const r of [...boards,...signs]){
      for(let i=0;i<T.N;i++)assert.ok(Math.hypot(r.position[0]-f.origin[3*i],r.position[2]-f.origin[3*i+2])>T.width/2+1,'clear of all stations');
      const a=Math.floor(r.station),b=(a+1)%T.N,u=r.station-a;
      const origin=[0,1,2].map(k=>f.origin[3*a+k]*(1-u)+f.origin[3*b+k]*u);
      const n=[0,1,2].map(k=>f.lateral[3*a+k]*(1-u)+f.lateral[3*b+k]*u);
      assert.ok((r.position[0]-origin[0])*n[0]*corners[r.corner].sign+(r.position[2]-origin[2])*n[2]*corners[r.corner].sign<0,'outside bend');
      const tx=f.tangent[3*a]*(1-u)+f.tangent[3*b]*u,tz=f.tangent[3*a+2]*(1-u)+f.tangent[3*b+2]*u;
      assert.ok(Math.sin(r.yaw)*tx+Math.cos(r.yaw)*tz<0,'faces approaching cars');
    }
    signs.forEach((r,i)=>{assert.equal(r.number,i+1);assert.equal(r.station,corners[i].apex);});
  });
  test(`${preset.name}, ${hills} m: blank backs face away just behind every panel`,()=>{
    const records=[...boardPlacements(T,corners),...signPlacements(T,corners)],front=labelPlanes(records),back=labelBacks(records);
    assert.equal(back.index.length,records.length*6);
    records.forEach((r,i)=>{
      const n=Array.from(front.normal.slice(12*i,12*i+3)),bn=Array.from(back.normal.slice(12*i,12*i+3));
      assert.ok(n.reduce((v,x,k)=>v+x*bn[k],0)<-0.999,'opposite normals');
      const center=m=>[0,1,2].map(k=>[0,1,2,3].reduce((v,j)=>v+m.position[12*i+3*j+k]/4,0));
      const a=center(front),b=center(back),delta=b.map((v,k)=>v-a[k]),depth=delta.reduce((v,x,k)=>v+x*n[k],0);
      assert.ok(depth< -0.004&&depth> -0.006,'back is 5 mm behind');
      assert.ok(Math.hypot(...delta)<0.01,'within a centimetre');
      const ids=Array.from(back.index.slice(6*i,6*i+3)),p=ids.map(j=>Array.from(back.position.slice(3*j,3*j+3)));
      const u=p[1].map((v,k)=>v-p[0][k]),v=p[2].map((x,k)=>x-p[0][k]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      assert.ok(cross.reduce((a,x,k)=>a+x*bn[k],0)>0,'back winding matches normal');
    });
  });
  test(`${preset.name}, ${hills} m: posts reach road and meet panels`,()=>{
    const records=[...boardPlacements(T,corners),...signPlacements(T,corners)],m=markerPosts(T,records),panels=labelPlanes(records);
    assert.equal(m.index.length,36*records.length,'twelve triangles per post');
    records.forEach((r,i)=>{
      const ys=[];for(let j=0;j<24;j++)ys.push(m.position[72*i+3*j+1]);
      const a=Math.floor(r.station),u=r.station-a,road=T.z[a]*(1-u)+T.z[(a+1)%T.N]*u;
      const panelBottom=Math.min(...[0,1,2,3].map(j=>panels.position[12*i+3*j+1]));
      assert.ok(Math.min(...ys)<=road,'post bottom reaches road');
      assert.ok(Math.abs(Math.min(...ys)-(road-0.25))<1e-5,'post extends below road');
      assert.ok(Math.max(...ys)>=panelBottom,'post top meets panel');
      assert.ok(Math.max(...ys)<r.position[1],'post ends within panel');
    });
  });
  test(`${preset.name}, ${hills} m: board distances wrap before corner start`,()=>{
    const cs=[...corners,{s:1,apex:1,sign:1}];
    for(const r of boardPlacements(T,cs)){
      assert.ok(r.station>=0&&r.station<T.N,'wrapped station');
      const metres=((cs[r.corner].s-r.station+T.N)%T.N)*T.ds;
      assert.ok(Math.abs(metres-r.distance)<1e-8,'distance before start');
    }
  });
  test(`${preset.name}, ${hills} m: start band spans station zero width`,()=>{
    const m=startBand(T,f),offsets=[];
    for(let i=0;i<m.position.length;i+=3){let d=0;for(let k=0;k<3;k++)d+=(m.position[i+k]-f.origin[k])*f.lateral[k];offsets.push(d);assert.ok(m.normal[i+1]>0.99);}
    assert.ok(Math.abs(Math.min(...offsets)+T.width/2)<1e-4);
    assert.ok(Math.abs(Math.max(...offsets)-T.width/2)<1e-4);
    assert.equal(m.index.length,12*Math.ceil(T.width));
  });
}

for(const count of [1,33,200,513])test(`${count} labels: bounded non-overlapping grid atlas`,()=>{
  const {pages}=labelAtlas(count);let covered=0;
  for(const page of pages){
    assert.equal(page.start,covered);covered+=page.count;
    assert.ok(page.width>0&&page.width<=2048&&page.height>0&&page.height<=2048,'canvas fits 2048');
    assert.equal(page.tiles.length,page.count);assert.equal(page.tileSize,128);
    const records=page.tiles.map(()=>({position:[0,1.5,0],yaw:0})),mesh=labelPlanes(records,{tiles:page.tiles});
    page.tiles.forEach((tile,i)=>{
      const [u0,v0,u1,v1]=tile.uv;
      assert.ok(u0>=0&&v0>=0&&u1<=1&&v1<=1&&u0<u1&&v0<v1,'UV rectangle in unit square');
      assert.ok(tile.x>=0&&tile.y>=0&&tile.x+tile.size<=page.width&&tile.y+tile.size<=page.height,'tile fits canvas');
      const expected=[u0,v0,u1,v0,u1,v1,u0,v1].map(Math.fround);
      assert.deepEqual(Array.from(mesh.uv.slice(8*i,8*i+8)),expected,'panel uses its tile');
      for(const other of page.tiles.slice(0,i)){
        const [a,b,c,d]=other.uv;
        assert.ok(u1<=a||c<=u0||v1<=b||d<=v0,'UV rectangles do not overlap');
      }
    });
  }
  assert.equal(covered,count,'every record gets a tile');
  assert.equal(pages.length,Math.ceil(count/256),'overflow uses additional textures');
});
