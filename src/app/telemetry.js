// Live telemetry: the sidebar readout (car, ghost and their difference, live or as lap maxima) and the text of the
// map's car and ghost tags. Values come from playback poses and lapExtremes (src/playback/pose.js). Forces are the
// snapshot's inverse-dynamics telemetry (phys): what the lap model's speed profile asks of each axle, not a free
// simulation.
import { $ } from './state.js';
import { G } from '../core/index.js';
import { lapExtremes } from '../playback/pose.js';
import { fmtDelta } from '../views/format.js';

const kN=x=>x/1000,abs=Math.abs;
// Readout rows: a group heading, or label l, unit u, value f(pose), decimals d. Lateral values are magnitudes (the
// turn's direction doesn't matter when comparing two cars); signed ones are + drive, − braking.
const axle=(name,s)=>[{g:name+' axle'},
  {l:'Load',u:'kN',f:p=>kN(p.phys['w'+s]),d:1},
  {l:'Lateral',u:'kN',f:p=>kN(abs(p.phys['fy'+s])),d:1},
  {l:'Longitudinal',u:'kN',f:p=>kN(p.phys['fx'+s]),d:1,signed:true},
  {l:'Grip use',u:'%',f:p=>p.phys['u'+s]*100,d:0}];
const ROWS=[{g:'Motion'},
  {l:'Speed',u:'km/h',f:p=>p.speed*3.6,d:0},
  {l:'Gear',u:'',f:p=>p.gear,d:0,gear:true}, // the ghost's pose has no gear (it may be another car)
  {l:'Lateral',u:'g',f:p=>abs(p.ay)/G,d:2},
  {l:'Longitudinal',u:'g',f:p=>p.ax/G,d:2,signed:true},
  ...axle('Front','f'),...axle('Rear','r'),
  {g:'Aero and rolling'},
  {l:'Downforce',u:'kN',f:p=>kN(p.phys.down),d:1},
  {l:'Drag + rolling',u:'kN',f:p=>kN(p.phys.drag),d:1}];
// Lap max rows read lapExtremes. Positive curvature (ay > 0, and the lateral tyre forces) is a right-hand turn on the
// y-down screen, so left turns are the most negative values. Braking rows are the most negative, signed.
const maxAxle=(name,s)=>[{g:name+' axle'},
  {l:'Load',u:'kN',f:x=>kN(x.phys['w'+s].max),d:1},
  {l:'Lateral left',u:'kN',f:x=>kN(-x.phys['fy'+s].min),d:1},
  {l:'Lateral right',u:'kN',f:x=>kN(x.phys['fy'+s].max),d:1},
  {l:'Drive',u:'kN',f:x=>kN(x.phys['fx'+s].max),d:1,signed:true},
  {l:'Braking',u:'kN',f:x=>kN(x.phys['fx'+s].min),d:1,signed:true},
  {l:'Grip use',u:'%',f:x=>x.phys['u'+s].max*100,d:0}];
const MAX_ROWS=[{g:'Motion'},
  {l:'Top speed',u:'km/h',f:x=>x.speed.max*3.6,d:0},
  {l:'Lateral left',u:'g',f:x=>-x.ay.min/G,d:2},
  {l:'Lateral right',u:'g',f:x=>x.ay.max/G,d:2},
  {l:'Drive',u:'g',f:x=>x.ax.max/G,d:2,signed:true},
  {l:'Braking',u:'g',f:x=>x.ax.min/G,d:2,signed:true},
  ...maxAxle('Front','f'),...maxAxle('Rear','r'),
  {g:'Aero and rolling'},
  {l:'Downforce',u:'kN',f:x=>kN(x.phys.down.max),d:1},
  {l:'Drag + rolling',u:'kN',f:x=>kN(x.phys.drag.max),d:1}];

// The table holds one row set at a time, rebuilt only when the set changes.
let built=null;
function build(rows){
  $('#teleBody').innerHTML=rows.map(r=>r.g?`<tr class="grp"><th colspan="4">${r.g}</th></tr>`:
    `<tr><th>${r.l}${r.u?` <small>${r.u}</small>`:''}</th><td></td><td class="gcol g"></td><td class="gcol d"></td></tr>`).join('');
  const trs=$('#teleBody').rows;rows.forEach((r,i)=>{if(!r.g){const c=trs[i].cells;r.tr=trs[i];r.c=c[1];r.gc=c[2];r.dc=c[3];}});
  built=rows;
}
// Lap extremes per snapshot object (a new one arrives with every snapshot; a ghost never changes).
const extremes=new WeakMap(),lapMax=d=>{let x=extremes.get(d);if(!x){x=lapExtremes(d);extremes.set(d,x);}return x;};
const set=(el,s)=>{if(el.textContent!==s)el.textContent=s;};
const fmt=(x,r)=>x==null||!isFinite(x)?'—':r.signed?fmtDelta(x,r.d):x.toFixed(r.d);
// car: the car's pose (null when there is none); ref: the ghost's pose to compare against (null without one);
// ghost: a ghost is pinned; ev: electric (no gears); mode: 'time' or 'place' (live, ref chosen by the caller) or
// 'max' (lap maxima of carLap and ghostLap, the two lap snapshots).
export function renderTelemetry(car,ref,{ghost,ev,mode,carLap,ghostLap}){
  const max=mode==='max',rows=max?MAX_ROWS:ROWS;if(built!==rows)build(rows);
  const A=max?lapMax(carLap):car,B=max?lapMax(ghostLap):ref;
  for(const r of rows){
    if(r.g)continue;
    if(r.gear){r.tr.hidden=ev;if(ev)continue;}
    const a=A?r.f(A):null;set(r.c,fmt(a,r));
    if(!ghost)continue;
    const b=B?r.f(B):null;set(r.gc,fmt(b,r));set(r.dc,a==null||b==null?'—':fmtDelta(a-b,r.d));
  }
}

// Tag text for the map: the car's own value at its own place (main), and with other (the other car's pose at the
// same place) the difference, this car minus the other (delta). mode: 'speed', 'g' or 'grip'.
export function tagText(mode,p,o){
  if(mode==='speed')return {main:`${Math.round(p.speed*3.6)} km/h`,delta:o&&`Δ ${fmtDelta((p.speed-o.speed)*3.6,0)}`};
  if(mode==='g'){const lat=q=>abs(q.ay)/G,lon=q=>q.ax/G;
    return {main:`${lat(p).toFixed(2)} lat · ${fmtDelta(lon(p),2)} long`,delta:o&&`Δ ${fmtDelta(lat(p)-lat(o),2)} · ${fmtDelta(lon(p)-lon(o),2)}`};}
  if(mode==='grip'){const f=q=>q.phys.uf*100,r=q=>q.phys.ur*100;
    return {main:`F ${Math.round(f(p))} · R ${Math.round(r(p))} %`,delta:o&&`Δ F ${fmtDelta(f(p)-f(o),0)} · R ${fmtDelta(r(p)-r(o),0)}`};}
  throw new Error(`Unknown tag mode "${mode}"`);
}
