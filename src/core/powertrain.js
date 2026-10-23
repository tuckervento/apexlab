// Moved verbatim from prototype/apex-lab.html (migration step 2).
import { VSTEP, NT, ETA } from './constants.js';

// Engine/motor force at the wheels for every speed in the table.
// EV: single fixed reduction; constant torque to the base speed, constant power above, cut at the motor's max speed.
// ICE: Leiderman-type power curve P(n)=Pmax(c1 n + c2 n² − c3 n³), n = rpm / power-peak rpm, shaped so torque
// peaks at n = nT. Gears are spaced geometrically between 1st and top-gear speeds at redline; the best gear is
// used at every speed (ideal shifting, no shift time). Below 1st gear's minimum rpm the clutch slips at constant force.
export function enginePower(n,nT){const c3=1/(2*(1-nT)),c2=nT/(1-nT),c1=(3-4*nT)/(2*(1-nT));return Math.max(0,c1*n+c2*n*n-c3*n*n*n);}
export function buildPowertrain(p){
  const m=p.mass,Pm=p.power*1000*ETA,drv=new Float64Array(NT),gear=new Int8Array(NT),rpm=new Float64Array(NT),gearF=[];
  if(p.pt==='EV'){
    const vb=Math.max(1,p.evBase/3.6),vm=p.evMax/3.6;
    for(let i=0;i<NT;i++){const v=i*VSTEP;drv[i]=v>vm?0:(v<vb?Pm/vb:Pm/v)/m;gear[i]=v>vm?0:1;rpm[i]=Math.min(1,v/vm);}
    gearF.push(Array.from(drv,a=>a*m));
    return {drv,gear,rpm,gearF};
  }
  const G_=Math.max(1,Math.round(p.gears)),v1=p.v1/3.6,vt=Math.max(p.v1,p.vTopG)/3.6,nT=p.nT/100,nR=p.nRed/100,nMin=0.3;
  const vr=[];for(let g=0;g<G_;g++)vr.push(G_===1?vt:v1*Math.pow(vt/v1,g/(G_-1)));
  for(let g=0;g<G_;g++)gearF.push(new Float64Array(NT));
  for(let i=0;i<NT;i++){
    const v=Math.max(0.25,i*VSTEP);let best=0,bg=0,bn=0;
    for(let g=0;g<G_;g++){
      let n=nR*v/vr[g],F;
      if(n>nR){gearF[g][i]=NaN;continue;}
      if(n<nMin){if(g>0){gearF[g][i]=NaN;continue;}const vs=nMin*vr[0]/nR;F=Pm*enginePower(nMin,nT)/vs;n=nMin;}
      else F=Pm*enginePower(n,nT)/v;
      gearF[g][i]=F;
      if(F>best){best=F;bg=g+1;bn=n;}
    }
    drv[i]=best/m;gear[i]=bg;rpm[i]=bn/nR;
  }
  return {drv,gear,rpm,gearF};
}
