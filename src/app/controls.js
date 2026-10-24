// Side panel and buttons: car and track setup, run/pause, ghost, colouring, replay, dynamic check; the actions they
// trigger (carChanged, rebuildTrack, setRunning) and the panel readouts the solver client redraws through its hooks.
import { genCtrl } from '../core/index.js';
import { CARS, TRACKS } from './presets.js';
import { S, $ } from './state.js';
import { send, sendState } from './client.js';
import { fmtTime } from '../views/format.js';
import { findCorners } from '../views/map2d/map.js';

const SPEC=[
  {g:'Chassis'},
  {k:'mass',l:'Mass',min:150,max:3000,st:5,u:'kg',f:v=>v.toFixed(0)},
  {k:'cg',l:'CoG height',min:0.2,max:0.8,st:0.01,u:'m',f:v=>v.toFixed(2),h:'Higher CoG transfers more load in corners'},
  {k:'track',l:'Track width (axle)',min:1.2,max:2.0,st:0.01,u:'m',f:v=>v.toFixed(2),h:'Wider resists load transfer but eats usable road'},
  {k:'wb',l:'Wheelbase',min:1.8,max:3.8,st:0.01,u:'m',f:v=>v.toFixed(2),h:'Longer resists pitch under braking but rotates more slowly'},
  {k:'yawDI',l:'Yaw inertia (dynamic index)',min:0.6,max:1.4,st:0.01,u:'',f:v=>v.toFixed(2),h:'Yaw inertia ÷ (mass × CG-to-axle distances). Higher is lazier to change direction'},
  {k:'rear',l:'Weight on rear',min:35,max:70,st:1,u:'%',f:v=>v.toFixed(0)},
  {k:'rollF',l:'Roll stiffness on front',min:25,max:75,st:1,u:'%',f:v=>v.toFixed(0),h:'Share of cornering load transfer taken by the front axle. More front pushes the car toward understeer'},
  {g:'Powertrain'},
  {k:'pt',seg:[['ICE','Combustion'],['EV','Electric']],l:'Type'},
  {k:'power',l:'Peak power',min:10,max:800,st:5,u:'kW',f:v=>v.toFixed(0)},
  {k:'evBase',pt:'EV',l:'Base speed',min:20,max:200,st:1,u:'km/h',f:v=>v.toFixed(0),h:'Full motor torque below this speed, constant power above it'},
  {k:'evMax',pt:'EV',l:'Max speed (motor rpm limit)',min:100,max:400,st:1,u:'km/h',f:v=>v.toFixed(0),h:'Set by the single reduction gear'},
  {k:'nT',pt:'ICE',l:'Torque peak',min:30,max:72,st:1,u:'% of power-peak rpm',f:v=>v.toFixed(0),h:'Low = flat, torquey engine; high = peaky, high-revving'},
  {k:'nRed',pt:'ICE',l:'Redline',min:100,max:125,st:1,u:'% of power-peak rpm',f:v=>v.toFixed(0)},
  {k:'gears',pt:'ICE',l:'Gears',min:1,max:8,st:1,u:'',f:v=>v.toFixed(0),h:'Spaced geometrically between 1st and top; the best gear is always selected'},
  {k:'shiftT',pt:'ICE',l:'Shift time',min:0,max:0.5,st:0.01,u:'s',f:v=>v.toFixed(2),h:'Drive is cut for this long on every upshift'},
  {k:'v1',pt:'ICE',l:'1st gear at redline',min:30,max:180,st:1,u:'km/h',f:v=>v.toFixed(0)},
  {k:'vTopG',pt:'ICE',l:'Top gear at redline',min:80,max:420,st:1,u:'km/h',f:v=>v.toFixed(0)},
  {k:'drive',seg:['RWD','AWD'],l:'Driven wheels'},
  {g:'Aero'},
  {k:'cla',l:'Downforce · CL·A',min:0,max:6,st:0.05,u:'m²',f:v=>v.toFixed(2)},
  {k:'aeroF',l:'Aero balance on front',min:25,max:65,st:1,u:'%',f:v=>v.toFixed(0),h:'Share of downforce on the front axle'},
  {k:'cda',l:'Drag · CD·A',min:0.25,max:1.6,st:0.01,u:'m²',f:v=>v.toFixed(2)},
  {g:'Brakes'},
  {k:'brakeF',l:'Brake bias on front',min:0,max:85,st:1,u:'%',f:v=>v.toFixed(0),h:'Fixed front share of brake force. The first axle to lock sets the braking limit'},
  {g:'Tyres'},
  {k:'mu',l:'Peak grip μ',min:0.7,max:2.0,st:0.01,u:'',f:v=>v.toFixed(2)},
  {k:'sens',l:'Load sensitivity',min:0,max:0.4,st:0.01,u:'',f:v=>v.toFixed(2),h:'Grip lost per doubling of tyre load'},
  {k:'slipPk',l:'Peak slip angle',min:3,max:12,st:0.5,u:'°',f:v=>v.toFixed(1),h:'Dynamic check only: how far the tyre slips before its grip peaks'}
];

// ---------- actions
export function rebuildTrack(keepLine){
  S.dynRes=null;S.dynStale=false;if(S.dynRunning)S.dynRunning=false;renderDyn();
  sendState('setTrack',{ctrl:S.ctrl.map(p=>p.slice()),width:S.width,keepLine});S.hist=[];
}
export function carChanged(){
  if(S.dynRunning){S.dynRunning=false;renderDyn();}
  sendState('setCar',{params:{...S.P}});S.hist=[];if(!S.running&&!S.editing)setRunning(true);
}
// The search never runs while editing the track (the worker is paused then); fresh = "Search again" from the current line.
export function setRunning(r,fresh){S.running=r;if(!S.editing)send(r?{type:'run',fresh:!!fresh}:{type:'pause'});runLabel();}
export function runLabel(){$('#runBtn').textContent=S.running?'Pause':(S.prog&&S.prog.converged?'Search again':'Run');}
export function showError(msg){S.frameErr=S.frameErr||new Error(msg);S.running=false;runLabel();const st=$('#status');st.dataset.s='paused';st.textContent='Error: '+msg;}
export function fit(){S.cam.fit(S.T,S.width);}
export function setFollow(f){S.follow=f;$('#zFollow').setAttribute('aria-pressed',String(f));if(f)S.followZ=Math.max(S.cam.z,7);} // a paused car can be followed too
export function updGhostUI(){const g=S.ghost;$('#ghostRow').hidden=!g;$('#clearGhost').hidden=!g;$('#capGhost').hidden=!g;$('#gapWrap').hidden=!g;$('#deltaRow').hidden=!g;$('#tele').classList.toggle('noghost',!g);}

// ---------- readouts (also redrawn by the solver client's hooks)
function setSeg(el,v){el.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===String(v))));}
export function renderDerived(){
  const {lateral:[l1,l2],braking:bk}=S.info.balance,d=S.info.derived,lim=b=>b.axle==='front'?'front · understeer':'rear · oversteer';
  $('#derived').innerHTML=`<div>Power / weight<b>${Math.round(d.powerToWeight)} kW/t</b></div><div>Top speed<b>${Math.round(d.vTop*3.6)} km/h</b></div>`+
    `<div>Lateral @ ${l1.kmh}<b>${l1.g.toFixed(2)} g</b></div><div>Lateral @ ${l2.kmh}<b>${l2.g.toFixed(2)} g</b></div>`+
    `<div>Grip limit @ ${l1.kmh}<b>${lim(l1)}</b></div><div>Grip limit @ ${l2.kmh}<b>${lim(l2)}</b></div>`+
    `<div>Braking @ ${bk.kmh}<b>${bk.g.toFixed(2)} g</b></div><div>First to lock<b>${bk.axle} axle</b></div>`;
}
export function trackArrived(){
  const T=S.T;S.corners=findCorners(T);if(S.fitPending&&S.cam.cw){fit();S.fitPending=false;}
  const w=$('#warn'); w.hidden=!T.issue; w.textContent=T.issue?T.issue+' — results may look odd':'';
  $('#trackInfo').textContent=(T.L/1000).toFixed(2)+' km · '+S.corners.length+' turns';
}
function cornerAt(i){const T=S.T,corners=S.corners,N=T.N;for(let n=0;n<corners.length;n++){const c=corners[n],len=(c.e-c.s+N)%N,d=(i-c.s+N)%N;if(d<=len+12||d>=N-12)return 'T'+(n+1);}return (i*T.L/N/1000).toFixed(2)+' km';}
export function renderDyn(){
  const out=$('#dynOut');if(!S.dynRes){out.hidden=true;$('#dynState').textContent='not run';return;}
  const R=S.dynRes,f=R.fail;out.hidden=false;
  $('#dynState').textContent=S.dynStale?'out of date':'';
  out.innerHTML=`<div>Holds on the road at<b>${(R.frac*100).toFixed(1)}% of pace</b></div>`+
    `<div>Dynamic lap at that pace<b>${R.dyn?fmtTime(R.dyn.t):'—'}</b></div>`+
    `<div>Peak tyre use on lap-model profile<b>${(R.umax*100).toFixed(1)}% · ${R.uaxle}</b></div>`+
    `<div>First trouble<b>${f?cornerAt(f.at)+' · '+(f.spun?'spins':'runs wide')+' at '+(f.fr*100).toFixed(1)+'%':'none'}</b></div>`;
}
export function dynLap(n){$('#dynState').textContent='running · lap '+n;}

// ---------- panels
export function buildCarUI(){
  const sel=$('#carPreset');
  sel.innerHTML=Object.keys(CARS).map(n=>`<option>${n}</option>`).join('')+'<option value="custom">Custom setup</option>';
  sel.value='GT racer';
  sel.onchange=()=>{if(sel.value==='custom')return;S.P={...CARS[sel.value]};syncFields();carChanged();};
  const box=$('#carFields');let html='';
  for(const s of SPEC){
    if(s.g){html+=`<h3>${s.g}</h3>`;continue;}
    if(s.seg){html+=`<div class="row"><span class="ctl-label" style="min-width:auto;flex:1;font-family:var(--body);font-size:13px;color:var(--ink)">${s.l}</span><div class="seg" id="seg-${s.k}">${s.seg.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return `<button data-v="${v}" aria-pressed="false">${l}</button>`;}).join('')}</div></div>`;continue;}
    html+=`<div class="field"${s.pt?` data-pt="${s.pt}"`:''}><label for="f-${s.k}">${s.l}</label><output id="o-${s.k}"></output><input type="range" id="f-${s.k}" min="${s.min}" max="${s.max}" step="${s.st}">${s.h?`<small>${s.h}</small>`:''}</div>`;
  }
  box.innerHTML=html;
  for(const s of SPEC){
    if(s.g) continue;
    if(s.seg){$('#seg-'+s.k).onclick=e=>{const b=e.target.closest('button');if(!b)return;S.P[s.k]=b.dataset.v;setSeg($('#seg-'+s.k),b.dataset.v);sel.value='custom';syncFields();carChanged();};continue;}
    const inp=$('#f-'+s.k);
    inp.oninput=()=>{S.P[s.k]=+inp.value;$('#o-'+s.k).textContent=s.f(S.P[s.k])+(s.u?' '+s.u:'');sel.value='custom';carChanged();};
  }
  syncFields();
}
function syncFields(){
  const P=S.P;
  for(const s of SPEC){if(s.g)continue;if(s.seg){setSeg($('#seg-'+s.k),P[s.k]);continue;}$('#f-'+s.k).value=P[s.k];$('#o-'+s.k).textContent=s.f(P[s.k])+(s.u?' '+s.u:'');}
  document.querySelectorAll('[data-pt]').forEach(el=>el.hidden=el.dataset.pt!==P.pt);
}
export function buildTrackUI(){
  const sel=$('#trackPreset');
  sel.innerHTML=TRACKS.map((t,i)=>`<option value="${i}">${t.name}</option>`).join('')+'<option value="r" hidden>Random</option><option value="e" hidden>Edited</option>';
  sel.onchange=()=>{const i=+sel.value;if(isNaN(i))return;S.trackIdx=i;S.ctrl=genCtrl(TRACKS[i].seed,S.width);S.origCtrl=S.ctrl.map(p=>p.slice());S.ghost=null;updGhostUI();S.fitPending=true;rebuildTrack(false);setRunning(true);};
  $('#randTrack').onclick=()=>{const seed=(Math.random()*1e6)|0;S.ctrl=genCtrl(seed,S.width);S.origCtrl=S.ctrl.map(p=>p.slice());sel.value='r';S.ghost=null;updGhostUI();S.fitPending=true;rebuildTrack(false);setRunning(true);};
  const w=$('#f-width');w.oninput=()=>{S.width=+w.value;$('#o-width').textContent=S.width+' m';S.ghost=null;updGhostUI();rebuildTrack(true);setRunning(true);};
  $('#editBtn').onclick=()=>{S.editing=!S.editing;const ed=S.editing;$('#editBtn').classList.toggle('on',ed);$('#editBtn').textContent=ed?'Done editing':'Edit shape';$('#editbar').hidden=!ed;$('#view').classList.toggle('editing',ed);if(ed)send({type:'pause'});else setRunning(true);};
  $('#revertTrack').onclick=()=>{S.ctrl=S.origCtrl.map(p=>p.slice());S.ghost=null;updGhostUI();rebuildTrack(true);setRunning(true);};
}
// Run/pause, restart, ghost, colouring, tags, telemetry Δ basis, replay and dynamic-check buttons.
export function bindButtons(){
  $('#runBtn').onclick=()=>{if(!S.running&&S.prog&&S.prog.converged){S.hist=[];setRunning(true,true);}else setRunning(!S.running);};
  $('#resetC').onclick=()=>{send({type:'setLine'});S.hist=[];setRunning(true);};
  $('#pinBtn').onclick=()=>{const d=S.disp;S.ghost={px:Float64Array.from(d.px),py:Float64Array.from(d.py),v:Float64Array.from(d.v),ds:Float64Array.from(d.ds),k:Float64Array.from(d.k),tc:Float64Array.from(d.tc),t:d.t,wb:S.P.wb,track:S.P.track,
    phys:Object.fromEntries(Object.entries(d.phys).map(([k,a])=>[k,Float64Array.from(a)]))};S.animT=0;updGhostUI();};
  $('#clearGhost').onclick=()=>{S.ghost=null;updGhostUI();};
  $('#colorSeg').onclick=e=>{const b=e.target.closest('button');if(!b)return;const m=S.colorMode=b.dataset.v;setSeg($('#colorSeg'),m);$('#legSpeed').hidden=m!=='speed';$('#legPedal').hidden=m!=='pedal';$('#legUtil').hidden=m!=='util';send({type:'view',util:m==='util'});};
  $('#tagSeg').onclick=e=>{const b=e.target.closest('button');if(!b)return;S.tagMode=b.dataset.v;setSeg($('#tagSeg'),S.tagMode);};
  $('#deltaSeg').onclick=e=>{const b=e.target.closest('button');if(!b)return;S.deltaMode=b.dataset.v;setSeg($('#deltaSeg'),S.deltaMode);};
  $('#replaySeg').onclick=e=>{const b=e.target.closest('button');if(!b)return;S.replay=+b.dataset.v;setSeg($('#replaySeg'),b.dataset.v);}; // 0 = Pause: the clock stops, the car and its readouts stay
  $('#dynBtn').onclick=()=>{S.running=false;runLabel();send({type:'dynCheck'});S.dynRunning=true;S.dynRes=null;S.dynStale=false;$('#dynOut').hidden=true;$('#dynState').textContent='running';};
}
