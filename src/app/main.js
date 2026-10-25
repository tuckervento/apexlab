// Apex Lab app entry: wires the solver client, controls and 2D views together. Owns map input (pan, zoom, pinch, track
// editing), the requestAnimationFrame loop, the lap readout and live telemetry; everything it draws comes from S
// (src/app/state.js).
import { S, $ } from './state.js';
import { perfWindow } from './perf.js';
import { send, sendState, connect, settled } from './client.js';
import { bindButtons, bindRun, buildCarUI, buildTrackUI, carView, dynLap, fit, loaded, loadFailed, rebuildTrack, refused, renderDerived, renderDyn,
  runLabel, selectHandle, setFollow, setView, showError, trackArrived, updGhostUI, updHillsUI } from './controls.js';
import { fmtTime, fmtDelta } from '../views/format.js';
import { readColors } from '../views/map2d/colors.js';
import { drawMap } from '../views/map2d/map.js';
import { pose, smoothPose, stationPose, raceClock } from '../playback/pose.js';
import * as orbit from '../views/scene3d/cameras/orbit.js';
import * as chase from '../views/scene3d/cameras/chase.js';
import * as tv from '../views/scene3d/cameras/tv.js';
import { renderTelemetry, tagText } from './telemetry.js';
import { drawSpeedChart, drawConv, drawGapChart, drawForceChart, drawElevChart } from '../views/map2d/charts.js';

const CAMERAS={overview:orbit,chase,tv}; // S.cam3d.mode → camera module (each: init, step, view)

connect({renderDerived,renderDyn,runLabel,showError,trackArrived,dynLap,loaded,loadFailed,refused,ghostDropped:updGhostUI});

// ---------- canvas + map input
const cv=$('#view'),ctx=cv.getContext('2d'),cam=S.cam;
// In 3D the canvas is the inset, sized and fitted for S.camMini; cam isn't resized then, and gets the stage back on the way to 2D.
function resize(){
  if(S.view!=='3d'){cam.resize(cv,$('#stage').getBoundingClientRect(),window.devicePixelRatio);return;}
  if(S.scene3d){S.scene3d.resize($('#view3d').getBoundingClientRect(),window.devicePixelRatio);dirty3d=true;}
  S.camMini.resize(cv,cv.getBoundingClientRect(),window.devicePixelRatio);if(S.T)S.camMini.fit(S.T,S.width);
}
const SX=x=>cam.sx(x),SY=y=>cam.sy(y),WX=sx=>cam.wx(sx),WY=sy=>cam.wy(sy),zoomAt=(f,sx,sy)=>cam.zoomAt(f,sx,sy);
// Following, zoom sets the closest the camera may go (S.followZ); draw() zooms out further to keep the ghost in view.
// Zooming out scales the current zoom (visible at once); zooming in raises S.followZ (cam.z never exceeds it).
const zoomFollow=f=>{S.followZ=Math.max(0.05,Math.min(40,(f<1?cam.z:S.followZ)*f));},FOLLOW_MARGIN=40;
$('#zFollow').onclick=()=>setFollow(!S.follow);$('#zView').onclick=()=>setView(S.view==='3d'?'2d':'3d');
$('#zIn').onclick=()=>{if(S.view==='3d'){zoom3d(1/1.5);return;}S.follow?zoomFollow(1.5):zoomAt(1.5,cam.cw/2,cam.ch/2);};
$('#zOut').onclick=()=>{if(S.view==='3d'){zoom3d(1.5);return;}S.follow?zoomFollow(1/1.5):zoomAt(1/1.5,cam.cw/2,cam.ch/2);};
$('#zFit').onclick=()=>{if(S.view==='3d'){if(S.cam3d.mode==='overview'&&S.T&&S.disp)initCamera();return;}setFollow(false);fit();};

// The renderer is the only import that pulls in three. Keep its pending promise across toggles.
let opening3d=null,applied3d={},dirty3d=true,lastView3d='',cameraStart=0,cameraTrack=null,lastAnim3d=null;
const aspect3d=()=>{const r=$('#view3d').getBoundingClientRect();return r.width/Math.max(1,r.height);};
function cameraInput(){
  const d=S.disp,g=S.ghost,rt=raceClock(g?[d.t,g.t]:[d.t],S.animT);
  return {T:S.T,corners:S.corners,car:d.t>0?smoothPose(d,rt,S.info):null,ghost:g&&g.t>0?smoothPose(g,rt):null,replay:S.replay,aspect:aspect3d()};
}
function initCamera(input=cameraInput()){
  S.cam3d.state=CAMERAS[S.cam3d.mode].init(input);cameraStart=S.animT;cameraTrack=S.T;dirty3d=true;
}
function zoom3d(f){if(S.cam3d.mode==='overview'&&S.cam3d.state){orbit.zoom(S.cam3d.state,f);dirty3d=true;}}
function fail3d(reason){
  S.view3dMsg=reason;setView('2d');
  if(S.scene3d){S.scene3d.dispose();S.scene3d=null;}
  const old=$('#view3d'),fresh=old.cloneNode(false);old.replaceWith(fresh);bind3dInput(fresh);
  applied3d={};lastView3d='';lastAnim3d=null;S.cam3d.state=null;
}
async function open3d(){
  if(opening3d||S.scene3d)return;
  opening3d=(async()=>{
    try{
      const {createScene3d}=await import('../views/scene3d/index.js');
      S.scene3d=createScene3d($('#view3d'),S.pal,{onLost:e=>{if(e.type==='webglcontextlost')fail3d('WebGL context lost');}});
      S.scene3d.resize($('#stage').getBoundingClientRect(),window.devicePixelRatio);
      S.view3dMsg=null;applied3d={};dirty3d=true;
    }catch(e){fail3d(e.message||'Could not load 3D');}
    finally{opening3d=null;}
  })();
}
$('#camera3d').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;S.cam3d.mode=b.dataset.v;S.cam3d.state=null;
  $('#camera3d').querySelectorAll('button').forEach(q=>q.setAttribute('aria-pressed',String(q===b)));setView(S.view);
};
function bind3dInput(canvas){
  const points=new Map();let gesture=null;
  const active=()=>S.view==='3d'&&S.cam3d.mode==='overview'&&S.cam3d.state;
  const measure=()=>{const [a,b]=[...points.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y)};};
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{if(!active())return;e.preventDefault();zoom3d(Math.exp(e.deltaY*0.0015));},{passive:false});
  canvas.addEventListener('pointerdown',e=>{if(!active())return;canvas.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture=points.size===2?measure():null;});
  canvas.addEventListener('pointermove',e=>{
    const prev=points.get(e.pointerId);if(!prev||!active())return;
    points.set(e.pointerId,{x:e.clientX,y:e.clientY});const r=canvas.getBoundingClientRect(),state=S.cam3d.state;
    if(points.size===2){const next=measure();if(gesture){orbit.pan(state,(next.x-gesture.x)/r.width,-(next.y-gesture.y)/r.height);if(next.d>0&&gesture.d>0)orbit.zoom(state,gesture.d/next.d);}gesture=next;}
    else if(e.shiftKey||(e.buttons&2))orbit.pan(state,(e.clientX-prev.x)/r.width,-(e.clientY-prev.y)/r.height);
    else orbit.orbit(state,-(e.clientX-prev.x)*0.005,(e.clientY-prev.y)*0.005);
    dirty3d=true;
  });
  const end=e=>{points.delete(e.pointerId);gesture=null;};
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
}
bind3dInput($('#view3d'));
function draw3d(dt){
  if(S.view!=='3d')return;
  if(!S.scene3d){open3d();return;}
  try{
    const api=S.scene3d,input=cameraInput(),d=S.disp,g=S.ghost,a=applied3d;
    const track=a.T!==S.T||a.trackRev!==S.T.trackRev;
    if(track){api.setTrack(S.T);a.T=S.T;a.trackRev=S.T.trackRev;S.cam3d.state=null;dirty3d=true;}
    if(track||a.lineRev!==d.lineRev||a.mode!==S.colorMode){api.setLine(d,S.colorMode,S.pal);a.lineRev=d.lineRev;a.mode=S.colorMode;dirty3d=true;}
    if(a.ghost!==g){api.setGhost(g);a.ghost=g;dirty3d=true;}
    const dims={wb:S.P.wb,track:S.P.track,cg:S.P.cg,rear:S.P.rear},key=JSON.stringify(dims),hasGhost=!!g;
    if(a.info!==S.info||a.dims!==key||a.hasGhost!==hasGhost){api.setCars({car:dims,ghost:hasGhost?dims:null});a.info=S.info;a.dims=key;a.hasGhost=hasGhost;dirty3d=true;}
    const dtAnim=dt*S.replay,seek=lastAnim3d!==null&&Math.abs(S.animT-lastAnim3d-dtAnim)>1e-6;
    if(!S.cam3d.state||cameraTrack!==S.T||(seek&&['chase','tv'].includes(S.cam3d.mode)))initCamera(input);
    else{
      input.sample=t=>{const rt=raceClock(g?[d.t,g.t]:[d.t],cameraStart+t);return d.t>0?smoothPose(d,rt,S.info):null;};
      CAMERAS[S.cam3d.mode].step(S.cam3d.state,input,dtAnim);
    }
    const view=CAMERAS[S.cam3d.mode].view(S.cam3d.state),keyView=JSON.stringify(view);
    if(S.replay!==0||dirty3d||lastView3d!==keyView||seek){api.frame({car:input.car,ghost:input.ghost,view});lastView3d=keyView;dirty3d=false;}
    lastAnim3d=S.animT;
  }catch(e){fail3d(e.message||'3D render failed');}
}
// The inset (3D showing) takes no map input: a click on it goes back to 2D.
cv.addEventListener('click',()=>{if(S.view==='3d')setView('2d');});
cv.addEventListener('wheel',e=>{if(S.view==='3d')return;e.preventDefault();const r=cv.getBoundingClientRect(),f=Math.exp(-e.deltaY*0.0015);if(S.follow)zoomFollow(f);else zoomAt(f,e.clientX-r.left,e.clientY-r.top);},{passive:false});

const ptrs=new Map();let drag=null,lastTap={t:0,idx:-1};
function handleAt(sx,sy){let best=-1,bd=22;S.ctrl.forEach((p,i)=>{const d=Math.hypot(SX(p[0])-sx,SY(p[1])-sy);if(d<bd){bd=d;best=i;}});return best;}
cv.addEventListener('pointerdown',e=>{
  if(S.view==='3d')return;cv.setPointerCapture(e.pointerId);const r=cv.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;
  ptrs.set(e.pointerId,{x:sx,y:sy});
  if(ptrs.size===2){const [a,b]=[...ptrs.values()];drag={type:'pinch',d:Math.hypot(a.x-b.x,a.y-b.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2};return;}
  const h=S.editing?handleAt(sx,sy):-1;
  drag={type:h>=0?'handle':'pan',idx:h,sx,sy,lx:sx,ly:sy,moved:false};if(h>=0)selectHandle(h);
});
cv.addEventListener('pointermove',e=>{
  if(!ptrs.has(e.pointerId)||!drag)return;const r=cv.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;
  ptrs.set(e.pointerId,{x:sx,y:sy});
  if(drag.type==='pinch'&&ptrs.size===2){const [a,b]=[...ptrs.values()],d=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    if(S.follow)zoomFollow(d/drag.d);else{cam.x-=(mx-drag.mx)/cam.z;cam.y-=(my-drag.my)/cam.z;zoomAt(d/drag.d,mx,my);}drag.d=d;drag.mx=mx;drag.my=my;return;}
  if(Math.hypot(sx-drag.sx,sy-drag.sy)>4) drag.moved=true;
  if(drag.type==='handle'&&drag.moved){S.ctrl[drag.idx]=[WX(sx),WY(sy),...S.ctrl[drag.idx].slice(2)];$('#trackPreset').value='e';S.ghost=null;updGhostUI();rebuildTrack(true);} // the point keeps its height
  else if(drag.type==='pan'&&drag.moved){if(S.follow)setFollow(false);cam.x-=(sx-drag.lx)/cam.z;cam.y-=(sy-drag.ly)/cam.z;}
  drag.lx=sx;drag.ly=sy;
});
function endPtr(e){
  if(!ptrs.has(e.pointerId))return;ptrs.delete(e.pointerId);
  if(drag&&drag.type!=='pinch'&&!drag.moved&&S.editing){
    const now=performance.now(),ctrl=S.ctrl;
    if(drag.type==='handle'){
      if(lastTap.idx===drag.idx&&now-lastTap.t<400&&ctrl.length>4){ctrl.splice(drag.idx,1);selectHandle(-1);$('#trackPreset').value='e';S.ghost=null;updGhostUI();rebuildTrack(true);lastTap={t:0,idx:-1};}
      else lastTap={t:now,idx:drag.idx};
    }else{
      const wx=WX(drag.sx),wy=WY(drag.sy);let bi=0,bd=1e18;
      for(let i=0;i<ctrl.length;i++){const a=ctrl[i],b=ctrl[(i+1)%ctrl.length],mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2,d=(mx-wx)**2+(my-wy)**2;if(d<bd){bd=d;bi=i;}}
      // the new point sits halfway, in height too (and in generator height, so the Hills slider still drives it)
      const a=ctrl[bi],b=ctrl[(bi+1)%ctrl.length],u=a[3]!=null&&b[3]!=null?(a[3]+b[3])/2:null;
      ctrl.splice(bi+1,0,[wx,wy,(a[2]+b[2])/2,u]);if(S.sel>bi)S.sel++;$('#trackPreset').value='e';S.ghost=null;updGhostUI();updHillsUI();rebuildTrack(true);
    }
  }
  drag=null;
}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);

// ---------- colours
function refreshColors(){S.pal=readColors(document.documentElement);if(S.scene3d){S.scene3d.setTheme(S.pal);dirty3d=true;}}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',refreshColors);
new MutationObserver(refreshColors).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});

// ---------- drawing (views in src/views/map2d/)
function draw(){
  const {disp,ghost,T}=S,rt=raceClock(ghost?[disp.t,ghost.t]:[disp.t],S.animT); // replay 0 (Pause) freezes the clock, not the car
  const cs=disp.t>0?pose(disp,rt,S.info):null,gs=ghost&&ghost.t>0?pose(ghost,rt):null,mini=S.view==='3d'; // mini: the inset, with no tags or corner labels
  if(S.follow&&cs&&!mini)cam.frame(gs?[cs,gs]:[cs],S.followZ,FOLLOW_MARGIN);
  // each car against the other at the same place (both lines index the track's stations; a track change clears the ghost)
  const ghostHere=cs&&ghost?stationPose(ghost,cs.station,cs.frac):null,carHere=gs?stationPose(disp,gs.station,gs.frac):null;
  const tags=S.tagMode==='off'?null:{car:cs&&tagText(S.tagMode,cs,ghostHere),ghost:gs&&tagText(S.tagMode,gs,carHere)};
  drawMap(ctx,mini?S.camMini:cam,S.pal,{T,width:S.width,disp,colorMode:S.colorMode,ghost,ghostCar:gs,car:cs,carDims:{wb:S.P.wb,track:S.P.track},corners:mini?[]:S.corners,dyn:S.dynRes&&!S.dynStale?S.dynRes:null,editing:S.editing,ctrl:S.ctrl,sel:S.sel,scaleBar:!mini,tags:mini?null:tags});
  renderTelemetry(cs,S.deltaMode==='place'?ghostHere:gs,{ghost:!!ghost,ev:S.P.pt==='EV',hills:!T.flat,mode:ghost?S.deltaMode:'time',carLap:disp,ghostLap:ghost});
  if(ghost)$('#liveGap').textContent=cs?fmtDelta(disp.tc[cs.station]-ghost.tc[cs.station],2)+' s':'—';
  if(cs){S.carPos=cs.station;S.carV=cs.speed;}else S.carPos=-1;
}

// ---------- warnings over the map: the circuit's own (overlaps, tight corners) and what the lap time hides (snapshot warn)
function showWarn(T,w){
  const parts=[];if(T.issue)parts.push(T.issue+' — results may look odd');
  if(w&&w.stall)parts.push(`The car can't get through ${w.stall} station${w.stall>1?'s':''} (${T.flat?'':'a climb too steep, or '}too little power or grip): the lap time isn't a real one`);
  if(w&&w.air)parts.push('The car leaves the ground over a crest');
  if(w&&w.ntop)parts.push('A compression loads the car beyond the model\'s range (2 g)');
  const el=$('#warn'),txt=parts.join(' · ');if(el.textContent!==txt)el.textContent=txt;el.hidden=!txt;
}

// ---------- opt-in frame measurement
const perfEnabled=new URLSearchParams(location.search).has('perf');
let perfSample;
if(perfEnabled){
  let start=performance.now(),win=perfWindow(start),tasks=[],serial=0,observer=null;
  if(globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')){
    observer=new PerformanceObserver(list=>tasks.push(...list.getEntries()));observer.observe({type:'longtask'});
  }
  const flush=()=>{
    const end=performance.now();if(observer)tasks.push(...observer.takeRecords());
    const result={...win.close(end,tasks),serial:++serial,longTaskSupported:!!observer,flush};
    window.__perf=result;
    console.log(`[perf] running p50=${result.p50?.toFixed(2)}ms p95=${result.p95?.toFixed(2)}ms longTasks=${result.longTasks} longTaskMs=${result.longTaskMs.toFixed(2)} runningFrames=${result.runningFrames} idleFrames=${result.idleFrames} idleP50=${result.idleP50?.toFixed(2)}ms idleP95=${result.idleP95?.toFixed(2)}ms idleLongTasks=${result.idleLongTasks} idleLongTaskMs=${result.idleLongTaskMs.toFixed(2)} mode=${result.mode}`);
    start=end;win=perfWindow(start);tasks=[];return result;
  };
  window.__perf={flush};
  perfSample=ts=>{
    win.sample(ts,S.view==='3d'?`3d ${S.cam3d.mode}`:S.view,S.running);
    if(ts-start>=10000)flush();
  };
}

// ---------- loop
let lastTs=0,frameN=0,shownView='2d'; // shownView: the view the map canvas is sized for
// The loop always re-schedules itself; an error pauses the search and shows on the page instead of freezing it.
function frame(ts){
  try{frameBody(ts);}
  catch(e){
    if(!S.frameErr){S.frameErr=e;console.error(e);send({type:'pause'}); // the label follows from the worker's progress
      const st=$('#status');st.dataset.s='paused';st.textContent='Error: '+(e&&e.message||e);}
  }
  requestAnimationFrame(frame);
}
function frameBody(ts){
  if(perfEnabled)perfSample(ts);
  if(S.frameErr&&S.running)S.frameErr=null;
  const dt=Math.min(0.1,(ts-lastTs)/1000||0);lastTs=ts;frameN++;
  if(S.view!==shownView){shownView=S.view;resize();} // setView changed the layout: inset or full stage
  const {T,disp,prog:p,ghost}=S;
  const pin=$('#pinBtn'),unsettled=!settled();if(pin.disabled!==unsettled)pin.disabled=unsettled; // a change still being built: its ghost would be stale
  if(!T||!disp||!p)return; // nothing from the solver yet
  S.animT+=dt*S.replay;
  const st=$('#status'),s=S.editing?'editing':!S.running?(p.converged?'converged':'paused'):(p.polish?'refining':'searching');
  const label=S.editing?'Editing track':!S.running?(p.converged?'Converged':'Paused'):p.polish?`Stage ${p.stage}/${p.of} · local polish`:`Stage ${p.stage}/${p.of} · ${p.knot} m spline`;
  const lbl=label+(S.view3dMsg?' · 3D off: '+S.view3dMsg:'');
  if(!S.frameErr){if(st.dataset.s!==s)st.dataset.s=s;if(st.textContent!==lbl)st.textContent=lbl;}
  $('#lapTime').textContent=fmtTime(disp.t);
  $('#deltaRef').textContent=fmtDelta(disp.t-S.refT,3)+' s';
  if(ghost){$('#ghostTime').textContent=fmtTime(ghost.t);$('#ghostDelta').textContent='· you '+fmtDelta(disp.t-ghost.t,3)+' s';}
  $('#evals').textContent=p.evals.toLocaleString()+' laps simulated';
  $('#legMin').textContent=Math.round(disp.vmin*3.6);$('#legMax').textContent=Math.round(disp.vmax*3.6);
  showWarn(T,disp.warn);
  draw3d(dt);
  draw();
  const dpr=cam.dpr,pal=S.pal;
  if(frameN%2===0){drawSpeedChart($('#speedChart'),dpr,pal,{T,disp,refV:S.refV,ghost,carPos:S.carPos});if(!T.flat)drawElevChart($('#elevChart'),dpr,pal,{T,carPos:S.carPos});drawConv($('#convChart'),dpr,pal,S.hist);if(ghost)drawGapChart($('#gapChart'),dpr,pal,{T,disp,ghost,carPos:S.carPos});}
  if(frameN%4===0)$('#capGears').hidden=!drawForceChart($('#forceChart'),dpr,pal,{info:S.info,carPos:S.carPos,carV:S.carV});
}

// ---------- boot
refreshColors();bindButtons();bindRun();buildCarUI();buildTrackUI();
new ResizeObserver(()=>{const first=!cam.cw;resize();if(first&&S.T)fit();}).observe($('#stage'));
resize();sendState('setCar',{params:{...S.P}},carView());S.fitPending=true;rebuildTrack(false);
document.fonts&&document.fonts.ready.then(refreshColors);
requestAnimationFrame(frame);
