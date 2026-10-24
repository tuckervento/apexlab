// Unit boundary (migration step 3). The UI edits CarParams in mixed units (km/h, %, kW, deg); core and dynamics
// read only the SI CarSpec built here (car.spec). A field whose unit changes gets a new name, so a reader that
// still expects UI units fails instead of computing with wrong numbers. Missing or invalid fields throw: no defaults.
// Each conversion keeps the prototype's operation order (x/100, x/3.6, x*1000, x*π/180), so results are bit-identical.
export function carSpec(p){
  const num=(k,u)=>{const v=p[k];if(typeof v!=='number'||!Number.isFinite(v))throw new Error(`carSpec: ${k}${u?' ('+u+')':''} must be a finite number, got ${v}`);return v;};
  const one=(k,ok)=>{const v=p[k];if(!ok.includes(v))throw new Error(`carSpec: ${k} must be one of ${ok.join(', ')}, got ${v}`);return v;};
  const slipPk=num('slipPk','deg');if(!(slipPk>0))throw new Error(`carSpec: slipPk (deg) must be > 0, got ${slipPk}`);
  const s=Object.freeze({
    mass:num('mass','kg'),cg:num('cg','m'),track:num('track','m'),wb:num('wb','m'),yawDI:num('yawDI',''),
    wr:num('rear','%')/100,rF:num('rollF','%')/100,                       // fractions: weight on rear, front roll stiffness
    pt:one('pt',['ICE','EV']),drive:one('drive',['RWD','AWD']),Pmax:num('power','kW')*1000, // W at the crank
    vBase:num('evBase','km/h')/3.6,vMotor:num('evMax','km/h')/3.6,        // EV: m/s
    nTorque:num('nT','%')/100,nRedline:num('nRed','%')/100,               // ICE: fractions of power-peak rpm
    gears:num('gears',''),vGear1:num('v1','km/h')/3.6,vGearTop:num('vTopG','km/h')/3.6,shiftT:num('shiftT','s'),
    cla:num('cla','m²'),aF:num('aeroF','%')/100,cda:num('cda','m²'),     // aF: front share of downforce
    bF:num('brakeF','%')/100,                                              // front share of brake force
    mu:num('mu',''),sens:num('sens',''),slipPeak:slipPk*Math.PI/180       // rad
  });
  // Physical limits, not the panel's ranges (src/app/sliders.js): outside these a formula stops meaning anything (no
  // mass, an axle with no weight, thrust from drag) rather than describing an unusual car. A legal car that can't move
  // (almost no power or grip) is left to the lap's stall warning. Checked after the conversions, which stay as they were.
  const lim=(k,ok,what)=>{if(!ok(p[k]))throw new Error(`carSpec: ${k} must be ${what}, got ${p[k]}`);};
  for(const k of ['mass','track','wb','yawDI','power','nRed','v1','vTopG','evBase','evMax','mu'])lim(k,v=>v>0,'> 0');
  for(const k of ['cg','shiftT','cla','cda','sens'])lim(k,v=>v>=0,'≥ 0');
  for(const k of ['rollF','aeroF','brakeF'])lim(k,v=>v>=0&&v<=100,'in [0, 100] %');
  lim('rear',v=>v>0&&v<100,'in (0, 100) %, so both axles carry weight');
  lim('nT',v=>v>=0&&v<=75,'in [0, 75] % of power-peak rpm (above 75 enginePower gives negative torque near 0 rpm)');
  lim('gears',v=>Number.isInteger(v)&&v>=1,'a whole number ≥ 1');
  return s;
}
