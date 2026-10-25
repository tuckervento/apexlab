import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const {STREAK_MAX,streakCount,streakLength,streakLayout,streakPosition}=await import(pathToFileURL((process.env.APEX_SRC||new URL('../src',import.meta.url).pathname)+'/views/scene3d/streaks.js'));

test('streaks vanish at rest and under reduced motion',()=>{
  for(const f of [streakCount,streakLength]){
    assert.equal(f(0),0);
    for(const v of [1,30,100,500])assert.equal(f(v,true),0);
  }
});
test('streak density and length grow with real speed and stay bounded',()=>{
  let count=0,length=0;
  for(let v=0;v<=500;v++){
    const c=streakCount(v),l=streakLength(v);
    assert.ok(Number.isInteger(c)&&c>=count&&c<=STREAK_MAX);
    assert.ok(l>=length&&Number.isFinite(l));count=c;length=l;
  }
  assert.ok(streakCount(80)>streakCount(20));assert.ok(streakLength(80)>streakLength(20));
  assert.equal(streakCount(1e9),STREAK_MAX);
});
test('seeded layout and animation-time positions are deterministic and move in a bounded volume',()=>{
  const a=streakLayout(43),b=streakLayout(43),out=new Float64Array(3),other=new Float64Array(3);
  assert.deepEqual(a,b);assert.notDeepEqual(a,streakLayout(44));
  for(let i=0;i<STREAK_MAX;i++){
    assert.equal(streakPosition(a,i,70,1.25,out),out);
    streakPosition(b,i,70,1.25,other);assert.deepEqual(out,other);
    assert.ok(Math.abs(out[0])>=2&&Math.abs(out[0])<=14&&Math.abs(out[1])<=6&&out[2]>=-50&&out[2]<=-2);
    streakPosition(a,i,70,1.26,other);assert.notDeepEqual(out,other);
    streakPosition(a,i,0,99,out);streakPosition(a,i,0,0,other);assert.deepEqual(out,other);
  }
});
