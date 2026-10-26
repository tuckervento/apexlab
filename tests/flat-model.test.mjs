// ARCHITECTURE.md §4: flat laws, independent of preset tuning and recorded laps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';

const core=await loadCore();
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,`${msg}: ${a} ≈ ${b}`);
const params=p=>({...core.CARS['Road car'],mass:1000,cda:0,cla:0,...p});
const curves=p=>core.describeCar(core.buildCar(p));

test('flat drag: force is ½ρCdA v²',()=>{
  const info=curves(params({cda:0.8})),at=v=>info.curves.resist[Math.round(v/info.vstep)];
  const roll=1000*9.81*0.012,d20=at(20)-roll,d40=at(40)-roll;
  near(d20,0.5*1.225*0.8*20**2,1e-9,'drag at 20 m/s');
  near(d40,0.5*1.225*0.8*40**2,1e-9,'drag at 40 m/s');
  near(d40,4*d20,1e-9,'doubling speed quadruples drag');
});

test('flat rolling loss: CRR m g, independent of speed and downforce',()=>{
  for(const mass of [1000,1600])for(const cla of [0,2]){
    const info=curves(params({mass,cla,cda:0}));
    for(const v of [0,20,40])near(info.curves.resist[Math.round(v/info.vstep)],mass*9.81*0.012,1e-9,
      `rolling force at ${v} m/s, mass ${mass} kg, CLA ${cla} m²`);
  }
});

test('flat EV: constant torque, constant wheel power, motor speed cutoff',()=>{
  // 200 kW crank power, 90% efficiency, base 20 m/s, motor maximum 60 m/s.
  const info=curves(params({pt:'EV',power:200,evBase:72,evMax:216}));
  const at=v=>info.curves.drive[Math.round(v/info.vstep)];
  for(const v of [0,5,10,19.5,20])near(at(v),200000*0.9/20,1e-9,`torque-limited force at ${v} m/s`);
  for(const v of [20.5,30,40,60])near(at(v)*v,200000*0.9,1e-8,`constant wheel power at ${v} m/s`);
  for(const v of [60.5,80,100])assert.equal(at(v),0,`no drive above motor maximum at ${v} m/s`);
});

for(const cla of [0,2])test(`flat lateral limit: 50 m radius, CLA ${cla} m²`,()=>{
  const mass=1000,mu=1.2,R=50;
  const car=core.buildCar(params({mass,mu,sens:0,cg:0,rear:50,rollF:50,aeroF:50,cla,cda:0,
    pt:'EV',power:400,evBase:72,evMax:360}));
  // Matching axle shares and linear tyres give ay = μ(g + ½ρCLA v²/m).
  const expected=Math.sqrt(mu*9.81/(1/R-mu*0.5*1.225*cla/mass));
  // vCorner inverts a linear interpolation on the 0.5 m/s grid (0.03% allowance).
  for(const sign of [-1,1]){
    const v=core.vCorner(car,sign/R,null,new Float64Array(2));
    near(v,expected,expected*0.0003,`constant-radius corner speed, CLA ${cla}, sign ${sign}`);
    near(v*v/R,mu*(9.81+0.5*1.225*cla*v*v/mass),0.01,`lateral force balance, CLA ${cla}, sign ${sign}`);
  }
});
