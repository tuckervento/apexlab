import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineRibbon, lineColors } from '../src/views/scene3d/line.js';
import { loadCore } from './load-core.mjs';

const core=await loadCore(),ev=[],s=new core.Solver(e=>ev.push(e));
s.handle({type:'setCar',rev:1,params:{...core.CARS['GT racer']}});
s.handle({type:'view',util:true});
const ctrl=core.genCtrl(core.TRACKS[0].seed,12),elev=core.genElev(core.TRACKS[0].seed,ctrl);
s.handle({type:'setTrack',rev:2,ctrl:ctrl.map((p,i)=>[p[0],p[1],25*elev[i]]),width:12,keepLine:false});
s.handle({type:'run'});
for(let k=0;k<40;k++)s.tick(25);
const all=ev.filter(e=>e.type==='snapshot').map(m=>({...m.line,vmin:m.vmin,vmax:m.vmax}));
const snaps=[all[0],all[Math.floor(all.length/2)],all.at(-1)];
const pal={colors:{s0:'#e12',s1:'#aabbcc',s2:'#123456',ghost:'#789'},
  ramp:Array.from({length:32},(_,i)=>`rgb(${i*7},${255-i*5},${i*3})`)};

// Verbatim map.js bucket rule; palette decoding below is independent of the implementation.
function bucket(d,mode,i){
  const N=d.px.length,ramp=pal.ramp;
  const buckets=mode==='pedal'?3:ramp.length;
  const span=Math.max(1e-6,d.vmax-d.vmin);
  const j=(i+1)%N;let b;
  if(mode==='speed') b=Math.round((d.v[i]-d.vmin)/span*(buckets-1));
  else if(mode==='util') b=buckets-1-Math.round(Math.max(0,Math.min(1,(d.u[i]-0.5)/0.5))*(buckets-1));
  else{const a=(d.v[j]*d.v[j]-d.v[i]*d.v[i])/(2*d.ds[i]+1e-9);b=a<-1.2?0:a>0.4?2:1;}
  return b;
}
const linear=v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;
const pedal=[[238,17,34],[170,187,204],[18,52,86]];
function checkColors(d,mode){
  const c=lineColors(d,mode,pal);assert.equal(c.length,12*d.px.length);
  for(let i=0;i<d.px.length;i++){
    const b=mode==='ghost'?0:bucket(d,mode,i);
    const rgb=mode==='ghost'?[119,136,153]:mode==='pedal'?pedal[b]:[b*7,255-b*5,b*3];
    for(let v=0;v<4;v++)for(let k=0;k<3;k++)assert.equal(c[12*i+3*v+k],Math.fround(linear(rgb[k]/255)),`${mode} segment ${i} vertex ${v} channel ${k}`);
  }
}

test('linear line colours match map buckets on centreline, mid-search and late snapshots',()=>{
  assert.equal(snaps.length,3);assert.notDeepEqual(snaps[0].px,snaps[2].px);
  for(const d of snaps){
    assert.ok(d.u,'requested snapshot utilisation');
    for(const mode of ['speed','pedal','util','ghost'])checkColors(d,mode);
    const without={...d};delete without.u;
    assert.deepEqual(lineColors(without,'util',pal),lineColors(without,'speed',pal));
  }
});

test('line ribbon uses wrapped line tangents, width, lift and closes with upward triangles',()=>{
  for(const d of [...snaps,{px:[0,4,5,0],py:[0,0,3,4],pz:[1,2,4,3]}]){
    for(const options of [{},{halfWidth:1.25,lift:0.17}]){
      const {halfWidth=0.6,lift=0.05}=options,{position:p,index}=lineRibbon(d,options),N=d.px.length;
      assert.equal(p.length,12*N);assert.equal(index.length,6*N);
      for(let i=0;i<N;i++)for(let v=0;v<4;v++){
        const n=(i+(v>=2?1:0))%N,a=(n+N-1)%N,b=(n+1)%N;
        const dx=d.px[b]-d.px[a],dy=d.py[b]-d.py[a],len=Math.hypot(dx,dy),w=(v%2?1:-1)*halfWidth;
        const expected=[d.px[n]-dy/len*w,(d.pz?.[n]??0)+lift,d.py[n]+dx/len*w];
        for(let k=0;k<3;k++)assert.equal(p[12*i+3*v+k],Math.fround(expected[k]),`station ${n} coordinate ${k}`);
      }
      for(let i=0;i<N;i++){
        const v=4*i;assert.deepEqual([...index.slice(6*i,6*i+6)],[v,v+1,v+2,v+1,v+3,v+2]);
        const a=12*i,b=a+3,c=a+6;
        assert.ok((p[b+2]-p[a+2])*(p[c]-p[a])-(p[b]-p[a])*(p[c+2]-p[a+2])>0,'upward winding');
      }
    }
  }
});

test('pedal thresholds and speed/util extremes include the closing segment',()=>{
  const ds=[1,1,1,1,1,1],v=[4,2,2,3,4,4];
  const d={px:ds,py:ds,ds,v,vmin:2,vmax:4,u:[0,0.5,0.75,1,2,0.8]};
  for(const mode of ['speed','pedal','util','ghost'])checkColors(d,mode);
  const flat={...d,v:[3,3,3,3,3,3],vmin:3,vmax:3};checkColors(flat,'speed');
});
