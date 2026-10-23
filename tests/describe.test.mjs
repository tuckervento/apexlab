// Migration step 4: describeCar is the only car data views read. View parity: it gives exactly what index.html
// computed inline from CarModel tables before step 4 (formulas below copied verbatim from renderDerived and
// drawForceChart), so readouts and charts are unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';

const core = await loadCore(), { G, RHO, VSTEP, NT, CRR, tabAt } = core;
const presets = Object.keys(core.CARS).map(name => { const P = { ...core.CARS[name] }, car = core.buildCar(P); return { name, P, car, info: core.describeCar(car) }; });

// Every element identical (Object.is, so -0 and NaN count).
function same(a, b, what) {
  assert.equal(a.length, b.length, `${what}: length ${a.length} vs ${b.length}`);
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) assert.fail(`${what}[${i}]: ${a[i]} vs ${b[i]}`);
}

for (const { name, P, car, info } of presets) {
  test(`describeCar view parity: ${name}`, () => {
    // renderDerived, pre-step-4
    const g = v => (tabAt(car.alat, v / 3.6) / G);
    const ix = v => Math.min(NT - 1, Math.round(v / 3.6 / VSTEP)), lim = v => car.limF[ix(v)] ? 'front' : 'rear', bl = v => car.brkF[ix(v)] ? 'front' : 'rear';
    assert.equal(Math.round(info.derived.powerToWeight), Math.round(P.power / P.mass * 1000), 'power / weight');
    assert.ok(Object.is(info.derived.vTop, car.vTop), 'top speed');
    for (const [k, v] of [[0, 100], [1, 200]]) {
      const L = info.balance.lateral[k];
      assert.equal(L.kmh, v);
      assert.ok(Object.is(L.g, g(v)), `lateral @ ${v}: ${L.g} vs ${g(v)}`);
      assert.equal(L.axle, lim(v), `grip limit @ ${v}`);
    }
    const Bk = info.balance.braking;
    assert.equal(Bk.kmh, 150);
    assert.ok(Object.is(Bk.g, tabAt(car.brk, 150 / 3.6) / G), 'braking @ 150');
    assert.equal(Bk.axle, bl(150), 'first to lock');
    // drawForceChart, pre-step-4
    const m = car.m, curve = fn => Float64Array.from({ length: NT }, (_, i) => fn(i));
    same(info.curves.drive, curve(i => car.drv[i] * m), 'drive');
    same(info.curves.traction, curve(i => car.trc[i] * m), 'traction');
    same(info.curves.resist, curve(i => 0.5 * RHO * P.cda * (i * VSTEP) ** 2 + m * G * CRR), 'resist');
    assert.equal(info.curves.gears.length, P.pt !== 'EV' ? car.gearF.length : 0, 'gear lines drawn');
    info.curves.gears.forEach((gf, k) => same(gf, curve(i => car.gearF[k][i]), `gear ${k + 1}`));
    // HUD gear, pre-step-4: car.gear[Math.min(NT-1,Math.round(v/VSTEP))]
    same(info.curves.gear, car.gear, 'selected gear');
    assert.equal(info.vstep, VSTEP); assert.equal(info.n, NT);
  });
}

for (const { name, P, car, info } of presets) {
  test(`describeCar properties: ${name}`, () => {
    const { curves, balance } = info, n = info.n;
    for (const k of ['drive', 'traction', 'resist', 'gear']) assert.equal(curves[k].length, n, `${k} length`);
    curves.gears.forEach((gf, k) => assert.equal(gf.length, n, `gear ${k + 1} length`));
    assert.ok(Object.is(curves.resist[0], car.m * G * CRR), `resist at rest ${curves.resist[0]} is not rolling resistance`);
    for (let i = 1; i < n; i++) assert.ok(curves.resist[i] > curves.resist[i - 1], `resist not increasing at sample ${i}`);
    assert.equal(curves.gears.length, P.pt === 'EV' ? 0 : Math.max(1, Math.round(P.gears)), 'gear line count');
    for (let i = 0; i < n; i++) assert.ok(curves.gear[i] >= 0 && curves.gear[i] <= Math.max(1, P.gears), `gear ${curves.gear[i]} at sample ${i}`);
    for (const b of [...balance.lateral, balance.braking]) {
      assert.ok(b.axle === 'front' || b.axle === 'rear', `axle ${b.axle} @ ${b.kmh}`);
      assert.ok(b.g > 0 && Number.isFinite(b.g), `g ${b.g} @ ${b.kmh}`);
    }
    assert.ok(info.derived.vTop > 0 && info.derived.powerToWeight > 0, 'derived');
  });
}

test('describeCar copies its arrays and freezes its objects', () => {
  const { car } = presets.find(p => p.P.pt === 'ICE'), info = core.describeCar(car), drv0 = car.drv[10], gear0 = car.gear[10], gf0 = car.gearF[0][10];
  info.curves.drive[10] = -1; info.curves.gear[10] = 99; info.curves.gears[0][10] = -1;
  assert.ok(Object.is(car.drv[10], drv0) && car.gear[10] === gear0 && Object.is(car.gearF[0][10], gf0), 'writing into curves changed the car');
  for (const o of [info, info.curves, info.curves.gears, info.balance, info.balance.lateral, info.balance.lateral[0], info.balance.braking, info.derived])
    assert.ok(Object.isFrozen(o), 'describeCar returned an unfrozen object');
});
