// 2D map camera (src/views/map2d/camera.js): fit() and the follow framing frame(). The camera is a pure view module,
// so it is imported directly. Authored road bounds check fit padding; transforms preserve world points.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../src/views/map2d/camera.js';

const sized = (cw, ch) => Object.assign(new Camera(), { cw, ch });

// Screen position of a world point, and the centre of the area clear of the overlays.
const scr = (c, p) => [c.sx(p.x), c.sy(p.y)];
const centre = c => { const { padT, padB } = c.pads(); return [c.cw / 2, padT + (c.ch - padT - padB) / 2]; };
const near = (a, b, msg) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${msg}: ${a} vs ${b}`));

// Centreline bounds [10,210] × [-30,170], width 20: road envelope [0,220] × [-40,180].
const rect = { N: 4, cx: [10, 210, 210, 10], cy: [-30, -30, 170, 170] };
for (const [cw, ch, bounds, mid, tight] of [
  [1200, 800, [60, 1140, 40, 760], [600, 400], 'y'],
  [390, 760, [20, 370, 150, 690], [195, 420], 'x'],
]) test(`fit() at ${cw}x${ch}: road edges fit, centred, tight and idempotent`, () => {
  const c = sized(cw, ch), tag = `${cw}x${ch}`;
  c.fit(rect, 20);
  near(scr(c, { x: 110, y: 70 }), mid, `${tag}: track centred in clear area`);
  const [left, right, top, bottom] = bounds;
  for (const x of [0, 220]) for (const y of [-40, 180]) {
    const [sx, sy] = scr(c, { x, y });
    assert.ok(sx >= left-1e-9 && sx <= right+1e-9 && sy >= top-1e-9 && sy <= bottom+1e-9,
      `${tag}: road edges inside clear area`);
  }
  near(tight === 'x' ? [c.sx(0), c.sx(220)] : [c.sy(-40), c.sy(180)],
    tight === 'x' ? [left, right] : [top, bottom], `${tag}: tight at intended padding`);
  const before = [c.x, c.y, c.z];
  c.fit(rect, 20);
  near([c.x, c.y, c.z], before, `${tag}: fit is idempotent`);
});

test('world/screen inverse round trips preserve points after fit and zoom', () => {
  for (const [cw, ch] of [[1200, 800], [390, 760]]) {
    const c = sized(cw, ch);
    c.fit(rect, 20);
    for (const f of [1, 2.5, 0.2]) {
      c.zoomAt(f, 83, 217);
      for (const [x, y] of [[0, 0], [-123.4, 56.7], [110, 70], [1000, -2000]])
        near([c.wx(c.sx(x)), c.wy(c.sy(y))], [x, y], `${cw}x${ch}: inverse round trip`);
    }
  }
});

test('zoomAt() keeps the anchored screen point on the same world point, including zoom clamps', () => {
  for (const [cw, ch] of [[1200, 800], [390, 760]]) {
    const c = sized(cw, ch), anchor = [83, 217];
    c.fit(rect, 20);
    const world = [c.wx(anchor[0]), c.wy(anchor[1])];
    for (const f of [2, 0.5, 1e6, 1e-6]) {
      c.zoomAt(f, ...anchor);
      near([c.wx(anchor[0]), c.wy(anchor[1])], world, `${cw}x${ch}: anchored world point`);
      near([c.sx(world[0]), c.sy(world[1])], anchor, `${cw}x${ch}: anchored screen point`);
    }
  }
});

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
