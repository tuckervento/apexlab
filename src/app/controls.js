// Side panel and buttons: car and track setup, run/pause, ghost, colouring, replay, dynamic check, saved runs; the
// actions they trigger (carChanged, rebuildTrack, setRunning) and the panel readouts the solver client redraws through
// its hooks.
import { genCtrl } from '../core/index.js';
import { CARS, TRACKS } from './presets.js';
import { S, $ } from './state.js';
import { send, sendState, sendLoad, settled } from './client.js';
import { PHYSICS } from './physics-version.js';
import { makeRunFile, readRunFile, toGhost, liveHash, CAR_KEYS } from './runfile.js';
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
  sendState('setTrack',{ctrl:S.ctrl.map(p=>p.slice()),width:S.width,keepLine,resume:!S.editing});S.hist=[];
}
export function carChanged(){
  if(S.dynRunning){S.dynRunning=false;renderDyn();}
  sendState('setCar',{params:{...S.P},resume:!S.editing});S.hist=[];
}
// The search never runs while editing the track (the worker is paused then); fresh = "Search again" from the current line.
// The worker owns `running`: this only asks, and S.running follows from its next progress event.
export function setRunning(r,fresh){if(!S.editing)send(r?{type:'run',fresh:!!fresh}:{type:'pause'});runLabel();}
export function runLabel(){$('#runBtn').textContent=S.running?'Pause':(S.prog&&S.prog.converged?'Search again':'Run');}
export function showError(msg){S.frameErr=S.frameErr||new Error(msg);runLabel();const st=$('#status');st.dataset.s='paused';st.textContent='Error: '+msg;}
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
  sel.onchange=()=>{const i=+sel.value;if(isNaN(i))return;S.trackIdx=i;S.ctrl=genCtrl(TRACKS[i].seed,S.width);S.origCtrl=S.ctrl.map(p=>p.slice());S.ghost=null;updGhostUI();S.fitPending=true;rebuildTrack(false);};
  $('#randTrack').onclick=()=>{const seed=(Math.random()*1e6)|0;S.ctrl=genCtrl(seed,S.width);S.origCtrl=S.ctrl.map(p=>p.slice());sel.value='r';S.ghost=null;updGhostUI();S.fitPending=true;rebuildTrack(false);};
  const w=$('#f-width');w.oninput=()=>{S.width=+w.value;$('#o-width').textContent=S.width+' m';S.ghost=null;updGhostUI();rebuildTrack(true);};
  $('#editBtn').onclick=()=>{S.editing=!S.editing;const ed=S.editing;$('#editBtn').classList.toggle('on',ed);$('#editBtn').textContent=ed?'Done editing':'Edit shape';$('#editbar').hidden=!ed;$('#view').classList.toggle('editing',ed);if(ed)send({type:'pause'});else setRunning(true);};
  $('#revertTrack').onclick=()=>{S.ctrl=S.origCtrl.map(p=>p.slice());S.ghost=null;updGhostUI();rebuildTrack(true);};
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
  $('#dynBtn').onclick=()=>{send({type:'dynCheck'});S.dynRunning=true;S.dynRes=null;S.dynStale=false;$('#dynOut').hidden=true;$('#dynState').textContent='running';};
}

// ---------- saved runs (src/app/runfile.js): export the displayed car, circuit and line; load one back
// pendingLoad: {rev, mode: 'run' | 'ghost', run, name}. liveSha: hash of the physics source this page fetched, which
// differs from PHYSICS.sha256 when the source was edited and physics-version.js not regenerated.
let pendingLoad=null,liveSha=null,pickMode=null;
liveHash(PHYSICS.files,async f=>{const r=await fetch(new URL('../'+f,import.meta.url));if(!r.ok)throw new Error(`${f}: HTTP ${r.status}`);return r.arrayBuffer();})
  .then(h=>{liveSha=h;},e=>console.error('physics hash:',e));
const ctrlEqual=(a,b)=>a.length===b.length&&a.every((p,i)=>p[0]===b[i][0]&&p[1]===b[i][1]&&(p[2]||0)===(b[i][2]||0)); // heights too (absent = 0)
const short=h=>h?h.slice(0,7):'unknown';
// File contents are untrusted: lines go in as text nodes, never as HTML.
function runMsg(...lines){$('#runInfo').replaceChildren(...lines.flatMap((l,i)=>i?[document.createElement('br'),l]:[l]));}
function physicsNote(run){
  const rec=run.physics.sha256,cur=PHYSICS.sha256;
  let s=rec===cur?`Physics source is the same as this build (${short(cur)}).`:`Physics source differs: recorded ${short(rec)}, this build ${short(cur)}. A refactor changes the hash without changing results.`;
  if(run.physics.live&&run.physics.live!==rec)s+=' The file was exported from uncommitted physics edits.';
  if(liveSha&&liveSha!==cur)s+=` This page is running uncommitted physics edits (${short(liveSha)}).`;
  return s;
}
const runSummary=(run,name)=>[`${name} · exported ${run.exported?run.exported.slice(0,10):'(no date)'} · recorded lap ${fmtTime(run.result.lap)}${run.result.dyn?` · dynamic check ${(run.result.dyn.frac*100).toFixed(1)}%`:''}${run.result.converged?'':' · search not converged'}`,physicsNote(run)];
const pinGhost=g=>{S.ghost=g;S.animT=0;updGhostUI();};
// The recorded lap as a ghost on the displayed circuit; throws why it can't be compared.
function ghostFrom(run){
  if(S.T.N!==run.line.N)throw new Error(`No ghost: the file's lap has ${run.line.N} stations but this circuit has ${S.T.N}.`);
  const lacks=Object.keys(S.disp.phys).filter(k=>!(k in run.result.snapshot.phys));
  if(lacks.length)throw new Error(`No ghost: the file has no telemetry for ${lacks.join(', ')}.`);
  return toGhost(run);
}
function exportRun(){
  try{
    if(!settled())throw new Error('Not exported: a car or circuit change is still being built. Try again in a moment.');
    const d=S.disp,tv=$('#trackPreset').value,cv=$('#carPreset').value,tp=isNaN(+tv)?null:TRACKS[+tv],trackName=tp?tp.name:tv==='r'?'Random':'Edited';
    const run=makeRunFile({P:S.P,ctrl:S.ctrl,width:S.width,trackName,seed:tp?tp.seed:null,disp:d,prog:S.prog,refT:S.refT,dyn:S.dynRes&&!S.dynStale?S.dynRes:null,
      physics:{sha256:PHYSICS.sha256,live:liveSha},exported:new Date().toISOString(),userAgent:navigator.userAgent});
    const name=[cv,trackName,fmtTime(d.t)].join('-').toLowerCase().replace(/[^a-z0-9.]+/g,'-')+'.apexlab.json';
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(run)],{type:'application/json'}));a.download=name;a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    runMsg(`Exported ${name}: lap ${fmtTime(d.t)}${S.prog.converged?'':', search not converged'}.`);
  }catch(e){runMsg(e.message);}
}
// mode 'run': replace car, circuit and line with the file's, paused. 'ghost': keep this car, take the file's circuit and
// line (searching from it), and race the recorded lap. On the same circuit a ghost needs no rebuild at all.
async function loadPicked(file,mode){
  try{
    if(S.editing)throw new Error('Finish editing the circuit first.');
    let o;try{o=JSON.parse(await file.text());}catch(e){throw new Error(`Run file: ${file.name} is not valid JSON (${e.message}).`);}
    const run=readRunFile(o);
    if(mode==='ghost'&&run.track.width===S.width&&ctrlEqual(S.ctrl,run.track.ctrl)){
      if(!settled())throw new Error('Not loaded: a car or circuit change is still being built. Try again in a moment.');
      pinGhost(ghostFrom(run));runMsg(...runSummary(run,file.name),'Recorded lap pinned as the ghost.');return;
    }
    const keep=mode==='ghost';
    pendingLoad={mode,run,name:file.name,rev:sendLoad({params:keep?{...S.P}:run.car,ctrl:run.track.ctrl,width:run.track.width,off:run.line.off,run:keep})};
    lockPanel(true);
    runMsg(`Loading ${file.name}…`);
  }catch(e){runMsg(e.message);}
}
// The solver has replaced car, track and line (and the snapshot on them has arrived): bring the panel in line.
// While a load is in flight an edit would be made against the state the load replaces, so the sections that change the car,
// circuit or run are inert until the solver answers (loaded) or refuses (loadFailed).
function lockPanel(on){for(const id of ['carSection','trackSection','runSection'])$('#'+id).toggleAttribute('inert',on);}
export function loaded(m){
  const L=pendingLoad;if(!L||L.rev!==m.rev)return;pendingLoad=null;lockPanel(false);
  const {run}=L,notes=runSummary(run,L.name);
  S.ctrl=run.track.ctrl.map(p=>p.slice());S.origCtrl=S.ctrl.map(p=>p.slice());S.width=run.track.width;
  $('#f-width').value=S.width;$('#o-width').textContent=S.width+' m';
  const ti=run.track.seed==null?-1:TRACKS.findIndex(t=>t.seed===run.track.seed&&ctrlEqual(genCtrl(t.seed,S.width),S.ctrl));
  if(ti>=0)S.trackIdx=ti;
  $('#trackPreset').value=ti>=0?String(ti):run.track.name==='Random'?'r':'e';
  if(L.mode==='run'){
    S.P={...run.car};
    $('#carPreset').value=Object.keys(CARS).find(n=>CAR_KEYS.every(k=>CARS[n][k]===S.P[k]))||'custom';syncFields();
  }
  S.hist=[];S.dynRes=null;S.dynStale=false;S.dynRunning=false;renderDyn();runLabel();fit();
  if(run.line.N!==m.N)notes.push(`The line was resampled from ${run.line.N} to ${m.N} stations.`);
  if(m.clamped.n)notes.push(`${m.clamped.n} stations were moved inside this build's track limits (by up to ${m.clamped.max.toFixed(2)} m).`);
  try{pinGhost(ghostFrom(run));notes.push('Recorded lap pinned as the ghost.');}catch(e){S.ghost=null;updGhostUI();notes.push(e.message);}
  runMsg(...notes);
}
export function loadFailed(){pendingLoad=null;lockPanel(false);runMsg('Not loaded: the solver refused the file (see the status line). Nothing was changed.');}
export function bindRun(){
  const input=$('#runFile');
  $('#exportRun').onclick=exportRun;
  $('#loadRun').onclick=()=>{pickMode='run';input.click();};
  $('#loadGhost').onclick=()=>{pickMode='ghost';input.click();};
  input.onchange=()=>{const f=input.files[0];input.value='';if(f)loadPicked(f,pickMode);};
}
