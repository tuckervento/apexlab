// 2D map camera (src/views/map2d/camera.js): fit() and the follow framing frame(). The camera is a pure view module,
// so it is imported directly. fit() must match its pre-frame() version (copied below) bit for bit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';
import { Camera } from '../src/views/map2d/camera.js';

const core = await loadCore();
const T = core.buildTrack(core.genCtrl(core.TRACKS[0].seed, 12), 12);

// Pre-frame() Camera.fit, verbatim.
function fitOld(cam,T,width){
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(let i=0;i<T.N;i++){x0=Math.min(x0,T.cx[i]);x1=Math.max(x1,T.cx[i]);y0=Math.min(y0,T.cy[i]);y1=Math.max(y1,T.cy[i]);}
  const cw=cam.cw,ch=cam.ch,narrow=cw<560,padT=narrow?150:40,padB=narrow?70:40,padX=narrow?20:60;
  cam.z=Math.min((cw-padX*2)/(x1-x0+width),(ch-padT-padB)/(y1-y0+width));
  cam.x=(x0+x1)/2;cam.y=(y0+y1)/2-((padT-padB)/2)/cam.z;
}
const sized = (cw, ch) => Object.assign(new Camera(), { cw, ch });

test('fit() matches the pre-frame() version on wide and narrow canvases', () => {
  for (const [cw, ch] of [[1200, 800], [390, 760]]) {
    const a = sized(cw, ch), b = sized(cw, ch);
    a.fit(T, 12); fitOld(b, T, 12);
    assert.deepEqual([a.x, a.y, a.z], [b.x, b.y, b.z], `${cw}x${ch}`);
  }
});

// Screen position of a world point, and the centre of the area clear of the overlays.
const scr = (c, p) => [c.sx(p.x), c.sy(p.y)];
const centre = c => { const { padT, padB } = c.pads(); return [c.cw / 2, padT + (c.ch - padT - padB) / 2]; };
const near = (a, b, msg) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${msg}: ${a} vs ${b}`));

test('frame() with one point: zoom zMax, point at the centre of the clear area', () => {
  for (const [cw, ch] of [[1200, 800], [390, 760], [390, 250]]) {
    const c = sized(cw, ch), p = { x: 123.4, y: -56.7 };
    c.frame([p], 7, 40);
    assert.equal(c.z, 7, `${cw}x${ch}`);
    near(scr(c, p), centre(c), `${cw}x${ch}`);
  }
});

test('frame() with two nearby points: zoom zMax, midpoint centred', () => {
  const c = sized(1200, 800), a = { x: 10, y: 20 }, b = { x: 14, y: 17 };
  c.frame([a, b], 7, 40);
  assert.equal(c.z, 7);
  near(scr(c, { x: 12, y: 18.5 }), centre(c), 'midpoint');
});

test('frame() with two distant points: zooms out until both sit margin px inside the clear area, tight on one axis', () => {
  const m = 40;
  for (const [cw, ch] of [[1200, 800], [390, 760]])
    for (const [a, b] of [[{ x: 0, y: 0 }, { x: 300, y: 40 }], [{ x: 5, y: -250 }, { x: -20, y: 100 }]]) {
      const c = sized(cw, ch), { padT, padB, padX } = c.pads(), tag = `${cw}x${ch} ${JSON.stringify([a, b])}`;
      c.frame([a, b], 7, m);
      assert.ok(c.z < 7, tag);
      const gaps = [];
      for (const p of [a, b]) {
        const [x, y] = scr(c, p);
        gaps.push(x - padX - m, cw - padX - m - x, y - padT - m, ch - padB - m - y);
      }
      assert.ok(Math.min(...gaps) > -1e-9, `${tag}: inside by margin (${gaps})`);
      assert.ok(Math.abs(Math.min(...gaps)) < 1e-9, `${tag}: tight on one axis (${gaps})`);
    }
});

test('frame() keeps zoom within the zoomAt range', () => {
  const c = sized(1200, 800);
  c.frame([{ x: 0, y: 0 }, { x: 1e7, y: 0 }], 7, 40); assert.equal(c.z, 0.05);
  c.frame([{ x: 0, y: 0 }], 100, 40); assert.equal(c.z, 40);
});
