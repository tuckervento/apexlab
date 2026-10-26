// Unit boundary: hand-authored CarParams and SI expectations (ARCHITECTURE §7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';

const { carSpec, CARS } = await loadCore();
const params = () => ({ ...CARS['Road car'],
  mass:1200,cg:0.4,track:1.6,wb:2.5,yawDI:0.9,rear:40,rollF:65,
  pt:'ICE',drive:'AWD',power:250,evBase:180,evMax:360,nT:45,nRed:120,
  gears:5,v1:72,vTopG:288,shiftT:0.15,cla:1.2,aeroF:35,cda:0.8,brakeF:70,
  mu:1.3,sens:0.2,slipPk:30
});

test('units: km/h becomes m/s under renamed fields', () => {
  const s = carSpec(params());
  for (const [k, v] of Object.entries({ vBase:50, vMotor:100, vGear1:20, vGearTop:80 }))
    assert.equal(s[k], v, `${k}: km/h converts to m/s`);
});

test('units: kW becomes watts', () => {
  assert.equal(carSpec(params()).Pmax, 250000, 'Pmax: 250 kW is 250000 W');
});

test('units: every percentage becomes a fraction', () => {
  const s = carSpec(params());
  for (const [k, v] of Object.entries({ wr:0.4, rF:0.65, aF:0.35, bF:0.7, nTorque:0.45, nRedline:1.2 }))
    assert.equal(s[k], v, `${k}: percentage converts to fraction`);
});

test('units: degrees become radians', () => {
  // 30 degrees is π/6; allow only floating-point rounding, not a unit-scale error.
  assert.ok(Math.abs(carSpec(params()).slipPeak - Math.PI/6) < 1e-15, 'slipPeak: 30 degrees is π/6 radians');
});

test('units: SI and categorical fields keep their values', () => {
  const s = carSpec(params());
  for (const [k, v] of Object.entries({ mass:1200,cg:0.4,track:1.6,wb:2.5,yawDI:0.9,
    pt:'ICE',drive:'AWD',gears:5,shiftT:0.15,cla:1.2,cda:0.8,mu:1.3,sens:0.2 }))
    assert.equal(s[k], v, `${k}: unchanged at the SI boundary`);
  for (const k of ['rear','rollF','power','evBase','evMax','nT','nRed','v1','vTopG','aeroF','brakeF','slipPk'])
    assert.ok(!Object.hasOwn(s, k), `${k}: UI-unit name is absent`);
});

test('units: spec is a frozen snapshot detached from its input', () => {
  const p = params(), s = carSpec(p);
  assert.notEqual(s, p, 'spec is a distinct object');
  assert.ok(Object.isFrozen(s), 'spec is frozen');
  assert.ok(!Object.isFrozen(p), 'caller can still edit params');
  p.mass = 2400; p.power = 500; p.rear = 60; p.pt = 'EV';
  assert.deepEqual([s.mass,s.Pmax,s.wr,s.pt], [1200,250000,0.4,'ICE'], 'later input edits do not change spec');
});

test('units: missing fields throw by name rather than receiving defaults', () => {
  for (const k of Object.keys(params())) {
    const p = params(); delete p[k];
    assert.throws(() => carSpec(p), new RegExp(`\\b${k}\\b`), `missing ${k} is rejected`);
    assert.ok(!Object.hasOwn(p, k), `missing ${k} is not filled in`);
  }
});

test('units: non-finite and non-numeric fields throw by name', () => {
  const p = params();
  for (const k of Object.keys(p).filter(k => typeof p[k] === 'number'))
    for (const v of [NaN,Infinity,-Infinity,'1',null])
      assert.throws(() => carSpec({ ...p, [k]:v }), new RegExp(`\\b${k}\\b`), `${k} rejects ${v}`);
});

test('units: invalid physical limits and choices throw by name', () => {
  const bad = { mass:0,track:0,wb:0,yawDI:0,power:0,nRed:0,v1:0,vTopG:0,evBase:0,evMax:0,mu:0,
    cg:-1,shiftT:-1,cla:-1,cda:-1,sens:-1,slipPk:0,pt:'diesel',drive:'FWD' };
  for (const [k, v] of Object.entries(bad))
    assert.throws(() => carSpec({ ...params(), [k]:v }), new RegExp(`\\b${k}\\b`), `invalid ${k} is rejected`);
  for (const [k, vs] of Object.entries({ rear:[0,100],rollF:[-1,101],aeroF:[-1,101],brakeF:[-1,101],nT:[-1,76],gears:[0,1.5] }))
    for (const v of vs)
      assert.throws(() => carSpec({ ...params(), [k]:v }), new RegExp(`\\b${k}\\b`), `${k} rejects ${v}`);
});

test('units: physical limits admit unusual cars outside panel ranges', () => {
  for (const split of [0,100]) {
    const s = carSpec({ ...params(), pt:'EV',gears:1,shiftT:0,cg:0,cla:0,cda:0,sens:0,
      rollF:split,aeroF:split,brakeF:split,nT:0 });
    assert.deepEqual([s.rF,s.aF,s.bF], split === 0 ? [0,0,0] : [1,1,1], 'inclusive split endpoints are valid');
    assert.deepEqual([s.pt,s.gears,s.shiftT,s.cg,s.cla,s.cda,s.sens,s.nTorque],
      ['EV',1,0,0,0,0,0,0], 'single-speed EV and zero nonnegative fields are valid');
  }
  const s = carSpec({ ...params(),mass:3500,nT:75,nRed:150,rear:0.1 });
  assert.deepEqual([s.mass,s.nTorque,s.nRedline,s.wr], [3500,0.75,1.5,0.001], 'physical limits permit values beyond panel ranges');
});
