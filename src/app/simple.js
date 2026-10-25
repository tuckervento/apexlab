// Simple car controls (docs/simple-controls.md): a base car plus a few knobs, mapped onto the 25 CarParams fields. Pure,
// no DOM. Every knob is relative to the base car, so centred knobs (defaults) reproduce the preset exactly; a closed-form
// "neutral" balance would mislabel cars by several percent (the doc's finding). Derived values are clamped to the
// slider ranges (SPEC), so the panel's detailed sliders never show a value they can't offer; carSpec still validates.
import { CARS } from './presets.js';
import { SPEC } from './sliders.js';
import { G, RHO, ETA, CRR } from '../core/index.js';

// Tyre compounds, taken from the presets (Road car, Hot hatch, GT racer, Open-wheeler). 'base' keeps the base car's.
const TYRES=Object.freeze({street:Object.freeze({mu:1.00,sens:0.10,slipPk:8}),sport:Object.freeze({mu:1.08,sens:0.10,slipPk:8}),
  semi:Object.freeze({mu:1.38,sens:0.15,slipPk:6}),slick:Object.freeze({mu:1.60,sens:0.20,slipPk:5})});
const SHIFT=Object.freeze({manual:0.2,dct:0.1,seq:0.04}); // s; 'base' keeps the base car's
const LD=8;                 // lift/drag of added (or removed) downforce: cda follows cla by Δcla/LD (presets imply ~7–11)
const BAL_ROLL=10,BAL_AERO=5; // balance b in [−1, 1]: rollF − 10b, aeroF + 5b (percentage points)

// The knobs, in panel order. Numeric knobs: range, step, unit (offsets from the base car). Choice knobs: [value, label].
// The base car itself is not a knob: it is the panel's car dropdown (a preset, or a loaded run's car).
export const SIMPLE=Object.freeze([
  {k:'weight',l:'Weight',min:-25,max:25,st:1,u:'%'},
  {k:'power',l:'Power',min:-50,max:50,st:1,u:'%'},
  {k:'tyre',l:'Tyres',opts:[['base','Base'],['street','Street'],['sport','Sport'],['semi','Semi-slick'],['slick','Slick']]},
  {k:'downforce',l:'Downforce',min:-2,max:2,st:0.05,u:'m² CL·A'},
  {k:'balance',l:'Balance (understeer ↔ oversteer)',min:-1,max:1,st:0.05,u:''},
  {k:'pt',l:'Type',opts:[['ICE','Combustion'],['EV','Electric']]},
  {k:'drive',l:'Driven wheels',opts:[['RWD','RWD'],['AWD','AWD']]},
  {k:'gearbox',l:'Gearbox',opts:[['base','Base'],['manual','Manual'],['dct','DCT'],['seq','Sequential']]}
].map(s=>Object.freeze(s.opts?{...s,opts:Object.freeze(s.opts.map(o=>Object.freeze(o)))}:s)));

const RANGE=Object.fromEntries(SPEC.filter(s=>s.min!==undefined).map(s=>[s.k,s]));
// To the slider range, widened to take in the base car's own value: a loaded car may sit outside the sliders (carSpec
// checks physical limits only), and centred knobs must still give it back exactly.
const clamp=(k,v,b)=>Math.min(Math.max(RANGE[k].max,b[k]),Math.max(Math.min(RANGE[k].min,b[k]),v));

// A base car {name, car}: a preset name gives that preset; a loaded run's car comes as {name: 'Loaded: …', car}.
export function baseOf(b){
  if(typeof b==='string'){if(!CARS[b])throw new Error(`simple: unknown base car ${b}`);return {name:b,car:CARS[b]};}
  if(!b||typeof b.name!=='string'||!b.car||typeof b.car!=='object')throw new Error('simple: a base car is a preset name or {name, car}');
  return b;
}

// Centred knobs on a base car (a preset name or {name, car}).
export function defaults(base){
  const B=baseOf(base);
  return {base:B,weight:0,power:0,tyre:'base',downforce:0,balance:0,pt:B.car.pt,drive:B.car.drive,gearbox:'base'};
}

// Drag-limited top speed (m/s): P·η = (½ρ·CdA·v² + m·g·Crr)·v, the resistance buildCar uses. One real root (the cubic
// is increasing); Cardano with the second term written as −p/(3A) to avoid cancellation.
function vDrag(power,mass,cda){
  const a=0.5*RHO*cda,p=mass*G*CRR/a,q=-power*1000*ETA/a,A=Math.cbrt(-q/2+Math.sqrt(q*q/4+p*p*p/27));
  return A-p/(3*A);
}

// The full 25-field CarParams for a set of knobs. Throws on a missing, unknown or out-of-range knob.
export function deriveParams(simple){
  for(const k of Object.keys(simple))if(k!=='base'&&!SIMPLE.some(s=>s.k===k))throw new Error(`simple: unknown knob ${k}`);
  for(const s of SIMPLE){
    const v=simple[s.k];
    if(s.opts){if(!s.opts.some(o=>o[0]===v))throw new Error(`simple: ${s.k} must be one of ${s.opts.map(o=>o[0]).join(', ')}, got ${v}`);}
    else if(typeof v!=='number'||!(v>=s.min&&v<=s.max))throw new Error(`simple: ${s.k} must be a number in [${s.min}, ${s.max}], got ${v}`);
  }
  const b=baseOf(simple.base).car,p={...b};
  p.mass=clamp('mass',b.mass*(1+simple.weight/100),b);
  p.power=clamp('power',b.power*(1+simple.power/100),b);
  if(simple.tyre!=='base')Object.assign(p,TYRES[simple.tyre]);
  p.cla=clamp('cla',b.cla+simple.downforce,b);
  p.cda=clamp('cda',b.cda+(p.cla-b.cla)/LD,b);           // drag follows the downforce actually added, after clamping
  p.rollF=clamp('rollF',b.rollF-BAL_ROLL*simple.balance,b);
  p.aeroF=clamp('aeroF',b.aeroF+BAL_AERO*simple.balance,b);
  p.pt=simple.pt;p.drive=simple.drive;
  if(simple.gearbox!=='base')p.shiftT=SHIFT[simple.gearbox];
  // Auto gearing: scale both gear sets (ICE 1st and top, EV base and max speed) by the change in drag-limited top speed,
  // so the base car's gearing relative to its top speed is kept. Exactly 1 when power, mass and drag are the base's.
  const r=vDrag(p.power,p.mass,p.cda)/vDrag(b.power,b.mass,b.cda);
  p.vTopG=clamp('vTopG',b.vTopG*r,b);p.v1=clamp('v1',b.v1*r,b);
  p.evMax=clamp('evMax',b.evMax*r,b);p.evBase=clamp('evBase',b.evBase*r,b);
  // Brake bias stays the base car's: a closed-form ideal bias (no load sensitivity) braked worse than it on some cars.
  return p;
}

// The car the panel shows: the knobs' car with the fields set by hand on the sliders (manual: {field: value}) on top, so a
// knob change never undoes a hand edit.
export function carFor(simple,manual){
  const p=deriveParams(simple);
  for(const k of Object.keys(manual))if(!(k in p))throw new Error(`simple: unknown car field ${k}`);
  return Object.assign(p,manual);
}

// Which CarParams fields each knob sets, and the gearing all of Power, Weight and Downforce move (a side effect, so a
// hand-set gear greys no knob). A test checks this against what deriveParams changes.
export const KNOB_FIELDS=Object.freeze({weight:['mass'],power:['power'],tyre:['mu','sens','slipPk'],downforce:['cla','cda'],
  balance:['rollF','aeroF'],pt:['pt'],drive:['drive'],gearbox:['shiftT']});
export const GEARING=Object.freeze(['vTopG','v1','evMax','evBase']);
// Per knob: 'off' when every field it sets is set by hand (it no longer does anything), 'partial' when some are, 'on'
// otherwise; gearing: whether any gearing field is set by hand.
export function knobStates(manual){
  const out={};
  for(const s of SIMPLE){const f=KNOB_FIELDS[s.k],n=f.filter(k=>k in manual).length;out[s.k]=n===0?'on':n===f.length?'off':'partial';}
  out.gearing=GEARING.some(k=>k in manual);
  return out;
}
