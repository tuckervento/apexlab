// Simple car controls (docs/simple-controls.md): a base car plus a few knobs, mapped onto the 25 CarParams fields. Pure,
// no DOM. Every knob is relative to the base car, so centred knobs (defaults) reproduce the preset exactly; a closed-form
// "neutral" balance would mislabel cars by several percent (the doc's finding). Derived values are clamped to the
// Advanced slider ranges (SPEC), so the Advanced panel never shows a value it can't offer; carSpec still validates.
import { CARS } from './presets.js';
import { SPEC } from './sliders.js';
import { G, RHO, ETA, CRR } from '../core/index.js';

// Tyre compounds, taken from the presets (Road car, Hot hatch, GT racer, Open-wheeler). 'base' keeps the base car's.
const TYRES=Object.freeze({street:Object.freeze({mu:1.00,sens:0.10,slipPk:8}),sport:Object.freeze({mu:1.08,sens:0.10,slipPk:8}),
  semi:Object.freeze({mu:1.38,sens:0.15,slipPk:6}),slick:Object.freeze({mu:1.60,sens:0.20,slipPk:5})});
const SHIFT=Object.freeze({manual:0.2,dct:0.1,seq:0.04}); // s; 'base' keeps the base car's
const LD=8;                 // lift/drag of added (or removed) downforce: cda follows cla by Δcla/LD (presets imply ~7–11)
const BAL_ROLL=10,BAL_AERO=5; // balance b in [−1, 1]: rollF − 10b, aeroF + 5b (percentage points)
const BRAKE_REF=150/3.6;    // m/s: speed at which the ideal brake bias is evaluated (describeCar's braking reference)

// The knobs, in panel order. Numeric knobs: range, step, unit (offsets from the base car). Choice knobs: [value, label].
export const SIMPLE=Object.freeze([
  {k:'base',l:'Base car',opts:Object.keys(CARS).map(n=>[n,n])},
  {k:'weight',l:'Weight',min:-25,max:25,st:1,u:'%'},
  {k:'power',l:'Power',min:-50,max:50,st:1,u:'%'},
  {k:'tyre',l:'Tyres',opts:[['base','As base car'],['street','Street'],['sport','Sport'],['semi','Semi-slick'],['slick','Slick']]},
  {k:'downforce',l:'Downforce',min:-2,max:2,st:0.05,u:'m² CL·A'},
  {k:'balance',l:'Balance (understeer ↔ oversteer)',min:-1,max:1,st:0.05,u:''},
  {k:'pt',l:'Type',opts:[['ICE','Combustion'],['EV','Electric']]},
  {k:'drive',l:'Driven wheels',opts:[['RWD','RWD'],['AWD','AWD']]},
  {k:'gearbox',l:'Gearbox',opts:[['base','As base car'],['manual','Manual'],['dct','DCT'],['seq','Sequential']]}
].map(s=>Object.freeze(s.opts?{...s,opts:Object.freeze(s.opts.map(o=>Object.freeze(o)))}:s)));

const RANGE=Object.fromEntries(SPEC.filter(s=>s.min!==undefined).map(s=>[s.k,s]));
const clamp=(k,v)=>Math.min(RANGE[k].max,Math.max(RANGE[k].min,v));

// Centred knobs for a preset name.
export function defaults(base){
  const b=CARS[base];if(!b)throw new Error(`simple: unknown base car ${base}`);
  return {base,weight:0,power:0,tyre:'base',downforce:0,balance:0,pt:b.pt,drive:b.drive,gearbox:'base'};
}

// Drag-limited top speed (m/s): P·η = (½ρ·CdA·v² + m·g·Crr)·v, the resistance buildCar uses. One real root (the cubic
// is increasing); Cardano with the second term written as −p/(3A) to avoid cancellation.
function vDrag(power,mass,cda){
  const a=0.5*RHO*cda,p=mass*G*CRR/a,q=-power*1000*ETA/a,A=Math.cbrt(-q/2+Math.sqrt(q*q/4+p*p*p/27));
  return A-p/(3*A);
}
// Ideal front share of braking at the tyre limit at BRAKE_REF: static plus aero load on the front, plus the transfer
// m·a·h/wb with a = μ·(m·g + DF)/m, all over the total load. Ignores load sensitivity; used only as a ratio.
function idealBias(q){
  const DF=0.5*RHO*q.cla*BRAKE_REF*BRAKE_REF,W=q.mass*G;
  return (W*(1-q.rear/100)+DF*q.aeroF/100)/(W+DF)+q.mu*q.cg/q.wb;
}

// The full 25-field CarParams for a set of knobs. Throws on a missing, unknown or out-of-range knob.
export function deriveParams(simple){
  for(const k of Object.keys(simple))if(!SIMPLE.some(s=>s.k===k))throw new Error(`simple: unknown knob ${k}`);
  for(const s of SIMPLE){
    const v=simple[s.k];
    if(s.opts){if(!s.opts.some(o=>o[0]===v))throw new Error(`simple: ${s.k} must be one of ${s.opts.map(o=>o[0]).join(', ')}, got ${v}`);}
    else if(typeof v!=='number'||!(v>=s.min&&v<=s.max))throw new Error(`simple: ${s.k} must be a number in [${s.min}, ${s.max}], got ${v}`);
  }
  const b=CARS[simple.base],p={...b};
  p.mass=clamp('mass',b.mass*(1+simple.weight/100));
  p.power=clamp('power',b.power*(1+simple.power/100));
  if(simple.tyre!=='base')Object.assign(p,TYRES[simple.tyre]);
  p.cla=clamp('cla',b.cla+simple.downforce);
  p.cda=clamp('cda',b.cda+(p.cla-b.cla)/LD);           // drag follows the downforce actually added, after clamping
  p.rollF=clamp('rollF',b.rollF-BAL_ROLL*simple.balance);
  p.aeroF=clamp('aeroF',b.aeroF+BAL_AERO*simple.balance);
  p.pt=simple.pt;p.drive=simple.drive;
  if(simple.gearbox!=='base')p.shiftT=SHIFT[simple.gearbox];
  // Auto gearing: scale both gear sets (ICE 1st and top, EV base and max speed) by the change in drag-limited top speed,
  // so the base car's gearing relative to its top speed is kept. Exactly 1 when power, mass and drag are the base's.
  const r=vDrag(p.power,p.mass,p.cda)/vDrag(b.power,b.mass,b.cda);
  p.vTopG=clamp('vTopG',b.vTopG*r);p.v1=clamp('v1',b.v1*r);
  p.evMax=clamp('evMax',b.evMax*r);p.evBase=clamp('evBase',b.evBase*r);
  // Brake bias: keep the base car's bias in proportion to the ideal one, so it is exactly the base's when nothing
  // changes and a rear-only base (the Kart) stays rear-only.
  p.brakeF=clamp('brakeF',b.brakeF*(idealBias(p)/idealBias(b)));
  return p;
}
