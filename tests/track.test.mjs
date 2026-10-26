import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';

const { buildTrack, makeBounds } = await loadCore();
const car = {spec:{track:1.75}}; // 2 m body width, including the 0.25 m allowance.
const circle = (r, sign=1) => Array.from({length:64}, (_, i) => {
  const a=sign*2*Math.PI*i/64;return [r*Math.cos(a),r*Math.sin(a)];
});
const near = (a,b,e,msg) => assert.ok(Number.isFinite(a) && Math.abs(a-b)<=e, `${msg}: ${a} vs ${b} (±${e})`);

// 64 circle knots: angle < 0.1 rad. Cubic length error is O(angle^4); allow 1e-4 relative.
// Curvature has O(angle^2) spline error and dense-chord/resampling noise; allow 1% relative.
for (const sign of [1,-1]) test(`circle orientation ${sign}: geometry and periodic stations`, () => {
  const r=200,T=buildTrack(circle(r,sign),12);
  assert.equal(T.issue,null);
  near(T.L,2*Math.PI*r,2*Math.PI*r*1e-4,'circle circumference');
  assert.equal(T.N,314,'~4 m stations for a 400π m circle');
  near(T.ds,T.L/T.N,1e-12,'uniform arc spacing');
  for (let i=0;i<T.N;i++) {
    const a=(i-1+T.N)%T.N,b=(i+1)%T.N,dx=T.cx[b]-T.cx[a],dy=T.cy[b]-T.cy[a],d=Math.hypot(dx,dy);
    near(Math.hypot(T.cx[i],T.cy[i]),r,0.002,'circle radius');
    near(T.kc[i],sign/r,0.01/r,'signed circle curvature');
    near(Math.hypot(T.nx[i],T.ny[i]),1,1e-12,'unit normal');
    near((T.nx[i]*dx+T.ny[i]*dy)/d,0,1e-12,'normal perpendicular to neighbouring-station tangent');
    assert.ok(sign*(T.nx[i]*T.cx[i]+T.ny[i]*T.cy[i]) < -0.99*r,'circle normal points to the documented side');
    // Includes last -> first: one ordinary station interval, no duplicate or seam jump.
    const step=Math.hypot(T.cx[b]-T.cx[i],T.cy[b]-T.cy[i]);
    near(step,T.ds,T.ds*1e-4,'periodic station step, including seam');
    near(Math.hypot(T.nx[b]-T.nx[i],T.ny[b]-T.ny[i]),T.ds/r,1e-4,'periodic normal step, including seam');
  }
  near(T.minR,r,0.01*r,'circle minimum radius');
});

function stadium() {
  const p=[];
  for(let x=-120;x<120;x+=10)p.push([x,-60]);
  for(let i=0;i<32;i++){const a=-Math.PI/2+i*Math.PI/32;p.push([120+60*Math.cos(a),60*Math.sin(a)]);}
  for(let x=120;x>-120;x-=10)p.push([x,60]);
  for(let i=0;i<32;i++){const a=Math.PI/2+i*Math.PI/32;p.push([-120+60*Math.cos(a),60*Math.sin(a)]);}
  return p;
}

for (const sign of [1,-1]) test(`stadium orientation ${sign}: straight and bend curvature`, () => {
  const p=stadium(),T=buildTrack(sign===1?p:p.slice().reverse(),12);
  assert.equal(T.issue,null);
  // C² spline rounds the straight/arc joins; length tolerance is 0.1%.
  near(T.L,480+120*Math.PI,(480+120*Math.PI)*0.001,'stadium length');
  let straights=0,bends=0;
  for(let i=0;i<T.N;i++) {
    // Stay 60 m from joins, beyond both spline transition and five-station smoothing.
    if(Math.abs(T.cx[i])<60){near(T.kc[i],0,1e-5,'stadium straight curvature');straights++;}
    if(Math.abs(T.cx[i])>170){near(T.kc[i],sign/60,0.01/60,'stadium signed bend curvature');bends++;}
  }
  assert.ok(straights>20 && bends>20,'both straight and bend interiors are exercised');
});

test('bounds reserve half the car width and limit only the inside of each bend', () => {
  const T={N:5,width:20,kc:[0,0.2,-0.2,0.05,-0.05]},B=makeBounds(T,car);
  near(B.hw,9,1e-12,'road half-width 10 minus car half-width 1');
  const lo=[-9,-9,-4,-9,-9],hi=[9,4,9,9,9]; // radius 5: inside limit 0.8*5 = 4 m.
  for(let i=0;i<T.N;i++) {
    near(B.lo[i],lo[i],1e-12,'negative bound reserves car width and inside fold clearance');
    near(B.hi[i],hi[i],1e-12,'positive bound reserves car width and inside fold clearance');
  }
});

test('rigid transforms preserve length, curvature and bounds and rotate normals', () => {
  const p=stadium(),T=buildTrack(p,12),B=makeBounds(T,car),a=0.73;
  for(const [angle,dx,dy] of [[0,310,-470],[a,0,0],[a,310,-470]]) {
    const co=Math.cos(angle),si=Math.sin(angle),U=buildTrack(p.map(([x,y])=>[co*x-si*y+dx,si*x+co*y+dy]),12),D=makeBounds(U,car);
    assert.equal(U.N,T.N);
    assert.equal(U.issue,T.issue);
    near(U.L,T.L,1e-8,'rigid length');
    near(U.minR,T.minR,1e-7,'rigid minimum radius');
    near(D.hw,B.hw,1e-12,'rigid usable half-width');
    for(let i=0;i<T.N;i++) {
      near(U.cx[i],co*T.cx[i]-si*T.cy[i]+dx,1e-8,'transformed station x');
      near(U.cy[i],si*T.cx[i]+co*T.cy[i]+dy,1e-8,'transformed station y');
      near(U.kc[i],T.kc[i],1e-10,'rigid curvature');
      near(U.nx[i],co*T.nx[i]-si*T.ny[i],1e-9,'rotated normal x');
      near(U.ny[i],si*T.nx[i]+co*T.ny[i],1e-9,'rotated normal y');
      near(D.lo[i],B.lo[i],1e-8,'rigid negative bound');
      near(D.hi[i],B.hi[i],1e-8,'rigid positive bound');
    }
  }
});

test('tight and overlapping circuits report issues; zero length throws', () => {
  // For a 12 m road the corner threshold is radius 7 m; straddle it without relying on spline roundoff.
  const tight=buildTrack(circle(6),12),wide=buildTrack(circle(8),12);
  near(tight.minR,6,0.06,'tight circle minimum radius');
  assert.equal(tight.issue,'A corner is tighter than the track is wide');
  assert.equal(wide.issue,null,'8 m radius clears the 7 m threshold');
  const crossed=buildTrack([[-150,-100],[150,100],[-150,100],[150,-100]],12);
  assert.equal(crossed.issue,'The track overlaps itself here');
  assert.throws(()=>buildTrack([[11,17],[11,17],[11,17],[11,17]],12),/buildTrack: the circuit is shorter than the track is wide/);
});
