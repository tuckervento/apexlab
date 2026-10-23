// Chart- and readout-ready description of a built car (migration step 4). Views read this, never CarModel tables,
// so tables can change without breaking a view; in step 5 it becomes the worker's carInfo payload.
// Every value uses the expression the views used before, so readouts and charts are unchanged.
// Plain objects are frozen; arrays are fresh copies (freezing a non-empty typed array throws), so a view that
// writes into them cannot corrupt the car.
import { G, RHO, VSTEP, NT, CRR } from './constants.js';
import { tabAt } from './lap.js';

const LAT_REF_KMH=[100,200],BRAKE_REF_KMH=150; // reference speeds for the balance readout

export function describeCar(car){
  const m=car.m,p=car.spec,ix=kmh=>Math.min(NT-1,Math.round(kmh/3.6/VSTEP)),axle=f=>f?'front':'rear';
  // forces at the wheels (N) per speed sample i·VSTEP
  const drive=new Float64Array(NT),traction=new Float64Array(NT),resist=new Float64Array(NT);
  for(let i=0;i<NT;i++){drive[i]=car.drv[i]*m;traction[i]=car.trc[i]*m;resist[i]=0.5*RHO*p.cda*(i*VSTEP)**2+m*G*CRR;}
  const gears=Object.freeze(p.pt==='EV'?[]:car.gearF.map(gf=>Float64Array.from(gf))); // NaN outside a gear's rpm range
  const curves=Object.freeze({drive,traction,resist,gears,gear:Int8Array.from(car.gear)});
  const lateral=Object.freeze(LAT_REF_KMH.map(kmh=>Object.freeze({kmh,g:tabAt(car.alat,kmh/3.6)/G,axle:axle(car.limF[ix(kmh)])})));
  const braking=Object.freeze({kmh:BRAKE_REF_KMH,g:tabAt(car.brk,BRAKE_REF_KMH/3.6)/G,axle:axle(car.brkF[ix(BRAKE_REF_KMH)])});
  return Object.freeze({vstep:VSTEP,n:NT,curves,balance:Object.freeze({lateral,braking}),
    derived:Object.freeze({vTop:car.vTop,powerToWeight:p.Pmax/p.mass})}); // m/s; kW/t (= W/kg)
}
