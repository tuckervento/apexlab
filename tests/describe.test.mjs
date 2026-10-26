// CarInfo exposes SI units, display policy and owned arrays to views.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';

const core = await loadCore(), { G, CRR } = core;
const presets = Object.keys(core.CARS).map(name => { const P = { ...core.CARS[name] }, car = core.buildCar(P); return { name, P, car, info: core.describeCar(car) }; });

// Explicit SI tables isolate adapter policy from buildCar and the renderer.
function fixture(pt = 'ICE') {
  const f = v => new Float64Array(221).fill(v), car = {
    m: 1000, spec: { mass: 1000, Pmax: 123456, cda: 2, pt }, vTop: 62.5,
    drv: f(2), trc: f(3), alat: f(9.81), brk: f(19.62),
    limF: new Uint8Array(221), brkF: new Uint8Array(221),
    gearF: [f(4000), f(2500)], gear: new Int8Array(221).fill(2), rpm: f(0.75)
  };
  car.drv[20] = 4; car.trc[20] = 5; car.gear[0] = 0;
  car.gearF[0][0] = NaN; car.gearF[1][20] = 3200;
  // 100 km/h lies 5/9 from nodes 55 to 56; 200 lies 1/9 from 111 to 112.
  car.alat[56] = 27.468; car.alat[111] = 29.43; car.alat[112] = 117.72;
  car.limF[56] = 1; car.limF[110] = 1;
  // 150 km/h lies 1/3 from nodes 83 to 84; nearest axle node is 83.
  car.brk[84] = 49.05; car.brkF[83] = 1;
  return car;
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-10, `${what}: ${a} vs ${b}`);

test('describeCar synthetic units and table samples', () => {
  const info = core.describeCar(fixture()), { curves, balance, derived } = info;
  assert.equal(derived.powerToWeight, 123.456, 'power/weight W/kg (kW/t), unrounded');
  assert.equal(derived.vTop, 62.5, 'top speed m/s');
  assert.deepEqual(balance.lateral.map(b => b.kmh), [100, 200], 'lateral speed labels km/h');
  near(balance.lateral[0].g, 2, 'lateral g at 100 km/h');
  near(balance.lateral[1].g, 4, 'lateral g at 200 km/h');
  assert.deepEqual(balance.lateral.map(b => b.axle), ['front', 'rear'], 'nearest lateral limiting axle');
  assert.equal(balance.braking.kmh, 150, 'braking speed label km/h');
  near(balance.braking.g, 3, 'braking g at 150 km/h');
  assert.equal(balance.braking.axle, 'front', 'nearest braking locking axle');
  assert.deepEqual([curves.drive[0], curves.drive[20]], [2000, 4000], 'drive acceleration converted to N');
  assert.deepEqual([curves.traction[0], curves.traction[20]], [3000, 5000], 'traction acceleration converted to N');
  // Rolling = 1000 * 9.81 * .012 = 117.72 N; drag at 10/20 m/s = 122.5/490 N.
  near(curves.resist[0], 117.72, 'rolling resistance at rest N');
  near(curves.resist[20], 240.22, 'resistance at 10 m/s N');
  near(curves.resist[40], 607.72, 'resistance at 20 m/s N');
  assert.equal(curves.gears.length, 2, 'ICE gear force lines');
  assert.deepEqual([curves.gears[0][0], curves.gears[0][20], curves.gears[1][20]], [NaN, 4000, 3200], 'gear force samples N and unavailable rpm');
  assert.deepEqual([curves.gear[0], curves.gear[20]], [0, 2], 'selected gear samples');
  assert.equal(info.vstep, 0.5, 'speed grid step m/s');
  assert.equal(info.n, 221, 'speed grid sample count');
  for (const [k, a] of Object.entries(curves)) {
    if (k === 'gears') a.forEach(gf => assert.equal(gf.length, 221, 'gear force grid length'));
    else assert.equal(a.length, 221, `${k} grid length`);
  }
});

test('describeCar synthetic EV has no gear force lines', () => {
  assert.deepEqual(core.describeCar(fixture('EV')).curves.gears, [], 'EV has no gear force lines');
});

test('describeCar synthetic arrays are owned copies', () => {
  const car = fixture(), { curves } = core.describeCar(car);
  for (const [k, source, value] of [['drive', car.drv, 2], ['traction', car.trc, 3], ['gear', car.gear, 2], ['rpm', car.rpm, 0.75]]) {
    assert.notEqual(curves[k], source, `${k} is a copy`);
    curves[k][10] = -99;
    assert.equal(source[10], value, `${k} writes do not change car`);
  }
  curves.gears.forEach((gf, k) => {
    assert.notEqual(gf, car.gearF[k], `gear ${k + 1} is a copy`);
    gf[10] = -99;
    assert.equal(car.gearF[k][10], [4000, 2500][k], `gear ${k + 1} writes do not change car`);
  });
  const other = core.describeCar(car);
  assert.notEqual(curves.resist, other.curves.resist, 'resistance arrays are independently owned');
});

for (const pt of ['ICE', 'EV']) {
  test(`describeCar live adapter: ${pt}`, () => {
    const { info } = presets.find(p => p.P.pt === pt), { curves, balance, derived } = info;
    assert.ok(info.n > 0 && Number.isFinite(info.vstep) && info.vstep > 0, 'usable speed grid');
    for (const k of ['drive', 'traction', 'resist', 'gear', 'rpm']) {
      assert.equal(curves[k].length, info.n, `${k} live grid length`);
      assert.ok(curves[k].every(Number.isFinite), `${k} live samples finite`);
    }
    for (const gf of curves.gears) {
      assert.equal(gf.length, info.n, 'live gear grid length');
      assert.ok(gf.some(Number.isFinite) && gf.every(v => Number.isFinite(v) || Number.isNaN(v)), 'live gear samples finite or unavailable');
    }
    assert.ok(Object.values(derived).every(Number.isFinite), 'live derived values finite');
    for (const b of [...balance.lateral, balance.braking]) assert.ok(Number.isFinite(b.g), 'live balance finite');
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

test('describeCar rpm: the best-gear rpm table (fraction of redline), copied', () => {
  for (const { name, car, info } of presets) {
    const rpm = info.curves.rpm;
    assert.equal(rpm.length, info.n, `${name} rpm length`);
    for (let i = 0; i < info.n; i++) {
      if (!Object.is(rpm[i], car.rpm[i])) assert.fail(`${name} rpm[${i}] ${rpm[i]} vs car.rpm ${car.rpm[i]}`);
      assert.ok(rpm[i] >= 0 && rpm[i] <= 1, `${name} rpm[${i}] = ${rpm[i]}`);
    }
    assert.notEqual(rpm, car.rpm, `${name}: rpm must be a copy`);
  }
});
