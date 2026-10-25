// Side panel and buttons: car and track setup, run/pause, ghost, colouring, replay, dynamic check, saved runs; the
// actions they trigger (carChanged, rebuildTrack, setRunning) and the panel readouts the solver client redraws through
// its hooks.
import { genCtrl } from '../core/index.js';
import { CARS, TRACKS } from './presets.js';
import { S, $, circuit, hillsFollow } from './state.js';
import { send, sendState, sendLoad, settled } from './client.js';
import { PHYSICS, DRIVER } from './physics-version.js';
import { makeRunFile, readRunFile, toGhost, liveHash, CAR_KEYS } from './runfile.js';
import { fmtTime } from '../views/format.js';
import { findCorners } from '../views/map2d/map.js';
import { SPEC } from './sliders.js';
import { SIMPLE, defaults, carFor, knobStates, KNOB_FIELDS, GEARING } from './simple.js';

// ---------- actions
export function rebuildTrack(keepLine){
  S.dynRes=null;S.dynStale=false;if(S.dynRunning)S.dynRunning=false;renderDyn();
  sendState('setTrack',{ctrl:S.ctrl.map(p=>p.slice(0,3)),width:S.width,keepLine,resume:!S.editing},trackView());S.hist=[];
}
export function carChanged(){
  if(S.dynRunning){S.dynRunning=false;renderDyn();}
  sendState('setCar',{params:{...S.P},resume:!S.editing},carView());S.hist=[];
}
// The page's state behind a car or circuit command, for the client to put back if the worker refuses a later one.
export const carView=()=>({P:{...S.P},simple:{...S.simple},manual:{...S.manual}});
export const trackView=()=>({ctrl:S.ctrl.map(p=>p.slice()),origCtrl:S.origCtrl.map(p=>p.slice()),trackIdx:S.trackIdx,width:S.width,hills:S.hills,preset:$('#trackPreset').value});
// The worker refused a car or circuit change and kept what it had: put the panel back to the last state it accepted (v;
// null if it never accepted one) and say what was refused, until the next accepted change of that kind.
export function refused(kind,msg,v){
  if(kind==='setCar'){if(v){S.P={...v.P};S.simple={...v.simple};S.manual={...v.manual};baseOptions();syncFields();syncKnobs();}refusedNote('#carRefused',msg);return;}
  if(v){S.ctrl=v.ctrl.map(p=>p.slice());S.origCtrl=v.origCtrl.map(p=>p.slice());S.trackIdx=v.trackIdx;S.width=v.width;S.hills=v.hills;
    $('#trackPreset').value=v.preset;$('#f-width').value=S.width;$('#o-width').textContent=S.width+' m';selectHandle(-1);updHillsUI();}
  refusedNote('#trackRefused',msg);
}
function refusedNote(id,msg){const el=$(id);el.textContent='Not applied, so nothing changed: '+msg;el.hidden=false;}
// The search never runs while editing the track (the worker is paused then); fresh = "Search again" from the current line.
// The worker owns `running`: this only asks, and S.running follows from its next progress event.
export function setRunning(r,fresh){if(!S.editing)send(r?{type:'run',fresh:!!fresh}:{type:'pause'});runLabel();}
export function runLabel(){$('#runBtn').textContent=S.running?'Pause':(S.prog&&S.prog.converged?'Search again':'Run');}
export function showError(msg){S.frameErr=S.frameErr||new Error(msg);runLabel();const st=$('#status');st.dataset.s='paused';st.textContent='Error: '+msg;}
export function fit(){S.cam.fit(S.T,S.width);}
// 2D map or 3D view ('2d' | '3d'; always 2D while editing the track). main.js sizes the map canvas for it on the next frame.
// The zoom buttons drive the 2D camera, hidden in 3D, so they're disabled there (until the 3D view gives them meanings).
export function setView(v){if(S.editing)v='2d';S.view=v;const on=v==='3d';$('#stage').classList.toggle('v3d',on);$('#view3d').hidden=!on;$('#zView').setAttribute('aria-pressed',String(on));
  for(const b of ['#zIn','#zOut','#zFit','#zFollow'])$(b).disabled=on;}
export function setFollow(f){S.follow=f;$('#zFollow').setAttribute('aria-pressed',String(f));if(f)S.followZ=Math.max(S.cam.z,7);} // a paused car can be followed too
// The Hills slider drives the heights while every control point has its generator height; after a height is set by
// hand (or loaded from a run) it is disabled until Revert shape.
export function updHillsUI(){const f=hillsFollow(S.ctrl);$('#f-hills').disabled=!f;$('#hillsNote').hidden=f;$('#f-hills').value=S.hills;$('#o-hills').textContent=S.hills+' m';}
// Select a control point while editing (-1: none) and show its height in the edit bar.
export function selectHandle(i){S.sel=i;const p=S.ctrl[i],box=$('#editHeight');box.hidden=!p;if(!p)return;
  $('#selN').textContent=String(i+1);$('#f-ph').value=p[2];$('#o-ph').textContent=p[2].toFixed(1)+' m';}
export function updGhostUI(){const g=S.ghost;$('#ghostRow').hidden=!g;$('#clearGhost').hidden=!g;$('#capGhost').hidden=!g;$('#gapWrap').hidden=!g;$('#deltaRow').hidden=!g;$('#tele').classList.toggle('noghost',!g);}

// ---------- readouts (also redrawn by the solver client's hooks)
function setSeg(el,v){el.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===String(v))));}
export function renderDerived(){
  $('#carRefused').hidden=true; // a car the worker accepted
  const {lateral:[l1,l2],braking:bk}=S.info.balance,d=S.info.derived,lim=b=>b.axle==='front'?'front · understeer':'rear · oversteer';
  $('#derived').innerHTML=`<div>Power / weight<b>${Math.round(d.powerToWeight)} kW/t</b></div><div>Top speed<b>${Math.round(d.vTop*3.6)} km/h</b></div>`+
    `<div>Lateral @ ${l1.kmh}<b>${l1.g.toFixed(2)} g</b></div><div>Lateral @ ${l2.kmh}<b>${l2.g.toFixed(2)} g</b></div>`+
    `<div>Grip limit @ ${l1.kmh}<b>${lim(l1)}</b></div><div>Grip limit @ ${l2.kmh}<b>${lim(l2)}</b></div>`+
    `<div>Braking @ ${bk.kmh}<b>${bk.g.toFixed(2)} g</b></div><div>First to lock<b>${bk.axle} axle</b></div>`;
}
export function trackArrived(){
  $('#trackRefused').hidden=true; // a circuit the worker accepted
  const T=S.T;S.corners=findCorners(T);if(S.fitPending&&S.cam.cw){fit();S.fitPending=false;}
  if(S.camMini.cw)S.camMini.fit(T,S.width); // the 3D view's inset always shows the whole circuit
  $('#trackInfo').textContent=(T.L/1000).toFixed(2)+' km · '+S.corners.length+' turns'; // (#warn: main.js, with the lap's own warnings)
  $('#elevWrap').hidden=T.flat;$('#legElev').hidden=T.flat;
  if(!T.flat){let lo=Infinity,hi=-Infinity,gr=0;for(let i=0;i<T.N;i++){lo=Math.min(lo,T.z[i]);hi=Math.max(hi,T.z[i]);gr=Math.max(gr,Math.abs(T.dz[i]/T.ds));}
    $('#legZmin').textContent=Math.round(lo);$('#legZmax').textContent=Math.round(hi);$('#elevCap').textContent=`${Math.round(hi-lo)} m range · steepest ${(gr*100).toFixed(1)}%`;}
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
// ---------- the car: a base car, the knobs on it, and fields set by hand on top (simple.js); S.P is always
// carFor(S.simple, S.manual). One pane: each section starts with its knobs, then the fields they set.
const KNOBS_IN={Powertrain:['power','pt','drive','gearbox'],Chassis:['weight','balance'],Aero:['downforce'],Tyres:['tyre'],Brakes:[]}; // Balance: roll stiffness, its bigger lever, is Chassis
const label=t=>`<span class="ctl-label" style="min-width:auto;flex:1;font-family:var(--body);font-size:13px;color:var(--ink)">${t}</span>`;
function knobHTML(s){
  const note=`<small class="knob-note" id="kn-${s.k}" hidden></small>`;
  const gear=s.k==='power'?`<small class="knob-note" id="gearNote" hidden>Gearing set by hand below, so Power, Weight and Downforce leave it alone <button data-reset="gearing">↺ give it back</button></small>`:'';
  if(s.opts)return `<div class="knob" id="k-${s.k}"><div class="row">${label(s.l)}<div class="seg" id="ks-${s.k}">${s.opts.map(([v,l])=>`<button data-v="${v}" aria-pressed="false">${l}</button>`).join('')}</div></div>${note}</div>`;
  return `<div class="field knob" id="k-${s.k}"><label for="kf-${s.k}">${s.l}</label><output id="ko-${s.k}"></output><input type="range" id="kf-${s.k}" min="${s.min}" max="${s.max}" step="${s.st}">${note}</div>${gear}`;
}
export function buildCarUI(){
  const placed=Object.values(KNOBS_IN).flat(),groups=SPEC.filter(s=>s.g).map(s=>s.g);
  if(SIMPLE.some(s=>!placed.includes(s.k))||Object.keys(KNOBS_IN).some(g=>!groups.includes(g)))throw new Error('buildCarUI: a knob has no section (KNOBS_IN)');
  const sel=$('#carPreset');baseOptions();
  sel.onchange=()=>{if(sel.value!=='loaded')setBase(sel.value);}; // 'loaded': the loaded run's car, already the base
  const box=$('#carFields');let html='';
  for(const s of SPEC){
    if(s.g){html+=`<h3>${s.g}</h3>`;const ks=KNOBS_IN[s.g];if(ks.length)html+=`<div class="knobs">${ks.map(k=>knobHTML(SIMPLE.find(x=>x.k===k))).join('')}</div>`;continue;}
    if(s.seg)continue; // Type and Driven wheels: the knobs above are these fields
    html+=`<div class="field"${s.pt?` data-pt="${s.pt}"`:''}><label for="f-${s.k}">${s.l}</label><output id="o-${s.k}"></output><input type="range" id="f-${s.k}" min="${s.min}" max="${s.max}" step="${s.st}">${s.h?`<small>${s.h}</small>`:''}</div>`;
  }
  box.innerHTML=html;
  for(const s of SIMPLE){
    if(s.opts)$('#ks-'+s.k).onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;S.simple[s.k]=b.dataset.v;applyCar();};
    else $('#kf-'+s.k).oninput=e=>{S.simple[s.k]=+e.target.value;applyCar();};
  }
  for(const s of SPEC){
    if(s.g||s.seg)continue;
    const inp=$('#f-'+s.k);
    inp.oninput=()=>{S.P[s.k]=S.manual[s.k]=+inp.value;$('#o-'+s.k).textContent=s.f(S.P[s.k])+(s.u?' '+s.u:'');syncKnobs();carChanged();}; // set by hand: knobs no longer move it
  }
  box.addEventListener('click',e=>{const r=e.target.closest('[data-reset]');if(!r)return; // ↺: the knob sets these fields again
    for(const f of r.dataset.reset==='gearing'?GEARING:KNOB_FIELDS[r.dataset.reset])delete S.manual[f];applyCar();});
  $('#simpleReset').onclick=()=>setBase(S.simple.base);
  $('#carEdited').addEventListener('click',e=>{if(e.target.closest('button')){S.manual={};applyCar();}});
  syncFields();syncKnobs();
}
function applyCar(){S.P=carFor(S.simple,S.manual);syncFields();syncKnobs();carChanged();}
function setBase(base){S.simple=defaults(base);S.manual={};baseOptions();applyCar();} // a new base clears knobs and hand edits
// The presets, plus the loaded run's car while it is the base (options built as elements: its name comes from a file).
function baseOptions(){
  const sel=$('#carPreset'),b=S.simple.base,loaded=CARS[b.name]!==b.car;
  sel.replaceChildren(...Object.keys(CARS).map(n=>new Option(n,n)),...(loaded?[new Option(b.name,'loaded')]:[]));
  sel.value=loaded?'loaded':b.name;
}
const signed=(v,d=0)=>(v>0?'+':v<0?'−':'±')+Math.abs(v).toFixed(d);
const KNOB_OUT={weight:v=>`${signed(v)} % · ${Math.round(S.P.mass)} kg`,power:v=>`${signed(v)} % · ${Math.round(S.P.power)} kW`,
  downforce:v=>`${signed(v,2)} m²`, // the CL·A itself is the slider just below
balance:v=>v===0?'base':`${signed(v,2)} · toward ${v<0?'understeer':'oversteer'}`};
// Knob positions and readouts, and which knobs are greyed by fields set by hand.
function syncKnobs(){
  const st=knobStates(S.manual),n=Object.keys(S.manual).length;
  for(const s of SIMPLE){
    const v=S.simple[s.k],off=st[s.k]==='off',el=$('#k-'+s.k),note=$('#kn-'+s.k);
    el.classList.toggle('off',off);
    if(s.opts){setSeg($('#ks-'+s.k),v);$('#ks-'+s.k).querySelectorAll('button').forEach(b=>b.disabled=off);}
    else{const inp=$('#kf-'+s.k);inp.value=v;inp.disabled=off;$('#ko-'+s.k).textContent=KNOB_OUT[s.k](v);}
    note.hidden=st[s.k]==='on';
    if(!note.hidden)note.innerHTML=`${off?'Set by hand below':'Partly set by hand below'} <button data-reset="${s.k}">↺ give it back</button>`;
  }
  $('#k-gearbox').hidden=S.P.pt==='EV'; // an EV has no gearbox
  $('#gearNote').hidden=!st.gearing;
  const ed=$('#carEdited');ed.hidden=!n;
  if(n)ed.innerHTML=`${n} field${n>1?'s':''} set by hand <button class="textbtn">↺ clear</button>`;
}
function syncFields(){
  const P=S.P;
  for(const s of SPEC){if(s.g||s.seg)continue;$('#f-'+s.k).value=P[s.k];$('#o-'+s.k).textContent=s.f(P[s.k])+(s.u?' '+s.u:'');}
  document.querySelectorAll('[data-pt]').forEach(el=>el.hidden=el.dataset.pt!==P.pt);
}
export function buildTrackUI(){
  const sel=$('#trackPreset');
  sel.innerHTML=TRACKS.map((t,i)=>`<option value="${i}">${t.name}</option>`).join('')+'<option value="r" hidden>Random</option><option value="e" hidden>Edited</option>';
  sel.onchange=()=>{const i=+sel.value;if(isNaN(i))return;S.trackIdx=i;S.ctrl=circuit(TRACKS[i].seed,S.width,S.hills);S.origCtrl=S.ctrl.map(p=>p.slice());S.ghost=null;updGhostUI();updHillsUI();S.fitPending=true;rebuildTrack(false);};
  $('#randTrack').onclick=()=>{const seed=(Math.random()*1e6)|0;S.ctrl=circuit(seed,S.width,S.hills);S.origCtrl=S.ctrl.map(p=>p.slice());sel.value='r';S.ghost=null;updGhostUI();updHillsUI();S.fitPending=true;rebuildTrack(false);};
  // Hills keep the plan view and the stations, so a pinned ghost stays comparable (a flat lap against the same circuit with hills).
  const hl=$('#f-hills');hl.oninput=()=>{S.hills=+hl.value;$('#o-hills').textContent=S.hills+' m';if(!hillsFollow(S.ctrl))return;
    for(const p of S.ctrl)p[2]=S.hills*p[3];for(const p of S.origCtrl)if(p[3]!=null)p[2]=S.hills*p[3];rebuildTrack(true);};
  // a height set by hand: this point only, and from now on the slider no longer drives the heights
  const ph=$('#f-ph');ph.oninput=()=>{const p=S.ctrl[S.sel];if(!p)return;p[2]=+ph.value;for(const q of S.ctrl)q[3]=null;$('#o-ph').textContent=p[2].toFixed(1)+' m';$('#trackPreset').value='e';updHillsUI();rebuildTrack(true);};
  updHillsUI();
  const w=$('#f-width');w.oninput=()=>{S.width=+w.value;$('#o-width').textContent=S.width+' m';S.ghost=null;updGhostUI();rebuildTrack(true);};
  $('#editBtn').onclick=()=>{S.editing=!S.editing;const ed=S.editing;$('#editBtn').classList.toggle('on',ed);$('#editBtn').textContent=ed?'Done editing':'Edit shape';$('#editbar').hidden=!ed;$('#view').classList.toggle('editing',ed);selectHandle(-1);
    if(ed)setView('2d');$('#zView').disabled=ed; // the track is edited on the 2D map
    if(ed)send({type:'pause'});else setRunning(true);};
  $('#revertTrack').onclick=()=>{S.ctrl=S.origCtrl.map(p=>p.slice());S.ghost=null;updGhostUI();selectHandle(-1);updHillsUI();rebuildTrack(true);};
}
// Run/pause, restart, ghost, colouring, tags, telemetry Δ basis, replay and dynamic-check buttons.
export function bindButtons(){
  $('#runBtn').onclick=()=>{if(!S.running&&S.prog&&S.prog.converged){S.hist=[];setRunning(true,true);}else setRunning(!S.running);};
  $('#resetC').onclick=()=>{send({type:'setLine'});S.hist=[];setRunning(true);};
  // Pin is disabled until the display is settled (main.js), so the ghost, its circuit and its car are the ones shown
  $('#pinBtn').onclick=()=>{if(!settled())return;const d=S.disp;S.ghost={px:Float64Array.from(d.px),py:Float64Array.from(d.py),v:Float64Array.from(d.v),ds:Float64Array.from(d.ds),k:Float64Array.from(d.k),tc:Float64Array.from(d.tc),pz:Float64Array.from(d.pz),t:d.t,wb:S.P.wb,track:S.P.track,carRev:d.carRev,trackRev:d.trackRev,
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
let pendingLoad=null,liveSha=null,liveDriverSha=null,pickMode=null;
liveHash(PHYSICS.files,async f=>{const r=await fetch(new URL('../'+f,import.meta.url));if(!r.ok)throw new Error(`${f}: HTTP ${r.status}`);return r.arrayBuffer();})
  .then(h=>{liveSha=h;},e=>console.error('physics hash:',e));
liveHash(DRIVER.files,async f=>{const r=await fetch(new URL('../'+f,import.meta.url));if(!r.ok)throw new Error(`${f}: HTTP ${r.status}`);return r.arrayBuffer();})
  .then(h=>{liveDriverSha=h;},e=>console.error('driver hash:',e));
const ctrlEqual=(a,b)=>a.length===b.length&&a.every((p,i)=>p[0]===b[i][0]&&p[1]===b[i][1]&&(p[2]||0)===(b[i][2]||0)); // heights too (absent = 0)
const short=h=>h?h.slice(0,7):'unknown';
// File contents are untrusted: lines go in as text nodes, never as HTML.
function runMsg(...lines){$('#runInfo').replaceChildren(...lines.flatMap((l,i)=>i?[document.createElement('br'),l]:[l]));}
function physicsNote(run){
  const rec=run.physics.sha256,cur=PHYSICS.sha256;
  let s=rec===cur?`Physics source is the same as this build (${short(cur)}).`:`Physics source differs: recorded ${short(rec)}, this build ${short(cur)}. A refactor changes the hash without changing results.`;
  if(run.physics.live&&run.physics.live!==rec)s+=' The file was exported from uncommitted physics edits.';
  if(liveSha&&liveSha!==cur)s+=` This page is running uncommitted physics edits (${short(liveSha)}).`;
  if(run.driver){
    s+=run.driver.sha256===DRIVER.sha256?` Driver source matches (${short(DRIVER.sha256)}).`:` Driver source differs: recorded ${short(run.driver.sha256)}, this build ${short(DRIVER.sha256)}.`;
    if(run.driver.live&&run.driver.live!==run.driver.sha256)s+=' The file was exported from uncommitted driver edits.';
  }else s+=' This older file has no separate driver identity.';
  if(liveDriverSha&&liveDriverSha!==DRIVER.sha256)s+=` This page is running uncommitted driver edits (${short(liveDriverSha)}).`;
  return s;
}
const runSummary=(run,name)=>[`${name} · exported ${run.exported?run.exported.slice(0,10):'(no date)'} · recorded lap ${fmtTime(run.result.lap)}${run.result.dyn?` · dynamic check ${(run.result.dyn.frac*100).toFixed(1)}%`:''}${run.result.converged?'':' · search not converged'}`,physicsNote(run)];
const pinGhost=g=>{S.ghost={...g,carRev:S.disp.carRev,trackRev:S.disp.trackRev};S.animT=0;updGhostUI();}; // on the displayed circuit
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
    const d=S.disp,tv=$('#trackPreset').value,b=S.simple.base,cv=b.name+(CAR_KEYS.every(k=>Object.is(S.P[k],b.car[k]))?'':' custom'),tp=isNaN(+tv)?null:TRACKS[+tv],trackName=tp?tp.name:tv==='r'?'Random':'Edited';
    const run=makeRunFile({P:S.P,ctrl:S.ctrl,width:S.width,trackName,seed:tp?tp.seed:null,disp:d,prog:S.prog,refT:S.refT,dyn:S.dynRes&&!S.dynStale?S.dynRes:null,
      physics:{sha256:PHYSICS.sha256,live:liveSha},driver:{name:DRIVER.name,sha256:DRIVER.sha256,live:liveDriverSha},exported:new Date().toISOString(),userAgent:navigator.userAgent});
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
    pendingLoad={mode,run,name:file.name,rev:sendLoad({params:keep?{...S.P}:run.car,ctrl:run.track.ctrl,width:run.track.width,off:run.line.off,run:keep},()=>({setCar:carView(),setTrack:trackView()}))};
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
  S.width=run.track.width;$('#f-width').value=S.width;$('#o-width').textContent=S.width+' m';
  // a flat run on a preset is that preset (with its generator heights, so the Hills slider works); otherwise the
  // file's own heights, with the slider off
  const ti=run.track.seed==null?-1:TRACKS.findIndex(t=>t.seed===run.track.seed&&ctrlEqual(genCtrl(t.seed,S.width),run.track.ctrl));
  if(ti>=0){S.trackIdx=ti;S.hills=0;S.ctrl=circuit(TRACKS[ti].seed,S.width,0);}else S.ctrl=run.track.ctrl.map(p=>[p[0],p[1],p[2],null]);
  S.origCtrl=S.ctrl.map(p=>p.slice());updHillsUI();
  $('#trackPreset').value=ti>=0?String(ti):run.track.name==='Random'?'r':'e';
  if(L.mode==='run'){
    // the run's car becomes the base (a preset if it is one exactly), knobs centred: carFor gives it back bit for bit
    const n=Object.keys(CARS).find(n=>CAR_KEYS.every(k=>CARS[n][k]===run.car[k]));
    S.simple=defaults(n||{name:'Loaded: '+L.name.replace(/\.apexlab\.json$|\.json$/,''),car:{...run.car}});S.manual={};
    S.P=carFor(S.simple,S.manual);baseOptions();syncFields();syncKnobs();
  }
  S.hist=[];S.dynRes=null;S.dynStale=false;S.dynRunning=false;renderDyn();runLabel();fit();
  if(run.line.N!==m.N)notes.push(`The line was resampled from ${run.line.N} to ${m.N} stations.`);
  if(m.clamped.n)notes.push(`${m.clamped.n} stations were moved inside this build's track limits (by up to ${m.clamped.max.toFixed(2)} m).`);
  try{pinGhost(ghostFrom(run));notes.push('Recorded lap pinned as the ghost.');}catch(e){S.ghost=null;updGhostUI();notes.push(e.message);}
  runMsg(...notes);
}
export function loadFailed(msg){pendingLoad=null;lockPanel(false);runMsg(`Not loaded: the solver refused the file (${msg}). Nothing was changed.`);}
export function bindRun(){
  const input=$('#runFile');
  $('#exportRun').onclick=exportRun;
  $('#loadRun').onclick=()=>{pickMode='run';input.click();};
  $('#loadGhost').onclick=()=>{pickMode='ghost';input.click();};
  input.onchange=()=>{const f=input.files[0];input.value='';if(f)loadPicked(f,pickMode);};
}
