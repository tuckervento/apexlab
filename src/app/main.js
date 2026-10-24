// Apex Lab app entry: wires the solver client, controls and 2D views together. Owns map input (pan, zoom, pinch, track
// editing), the requestAnimationFrame loop, the lap readout and live telemetry; everything it draws comes from S
// (src/app/state.js).
import { S, $ } from './state.js';
import { send, sendState, connect, settled } from './client.js';
import { bindButtons, bindRun, buildCarUI, buildTrackUI, carView, dynLap, fit, loaded, loadFailed, rebuildTrack, refused, renderDerived, renderDyn,
  runLabel, selectHandle, setFollow, showError, trackArrived, updGhostUI, updHillsUI } from './controls.js';
import { fmtTime, fmtDelta } from '../views/format.js';
import { readColors } from '../views/map2d/colors.js';
import { drawMap } from '../views/map2d/map.js';
import { pose, stationPose, raceClock } from '../playback/pose.js';
import { renderTelemetry, tagText } from './telemetry.js';
import { drawSpeedChart, drawConv, drawGapChart, drawForceChart, drawElevChart } from '../views/map2d/charts.js';

connect({renderDerived,renderDyn,runLabel,showError,trackArrived,dynLap,loaded,loadFailed,refused,ghostDropped:updGhostUI});

// ---------- canvas + map input
const cv=$('#view'),ctx=cv.getContext('2d'),cam=S.cam;
function resize(){cam.resize(cv,$('#stage').getBoundingClientRect(),window.devicePixelRatio);}
const SX=x=>cam.sx(x),SY=y=>cam.sy(y),WX=sx=>cam.wx(sx),WY=sy=>cam.wy(sy),zoomAt=(f,sx,sy)=>cam.zoomAt(f,sx,sy);
// Following, zoom sets the closest the camera may go (S.followZ); draw() zooms out further to keep the ghost in view.
// Zooming out scales the current zoom (visible at once); zooming in raises S.followZ (cam.z never exceeds it).
const zoomFollow=f=>{S.followZ=Math.max(0.05,Math.min(40,(f<1?cam.z:S.followZ)*f));},FOLLOW_MARGIN=40;
$('#zFollow').onclick=()=>setFollow(!S.follow);
$('#zIn').onclick=()=>S.follow?zoomFollow(1.5):zoomAt(1.5,cam.cw/2,cam.ch/2);$('#zOut').onclick=()=>S.follow?zoomFollow(1/1.5):zoomAt(1/1.5,cam.cw/2,cam.ch/2);$('#zFit').onclick=()=>{setFollow(false);fit();};
cv.addEventListener('wheel',e=>{e.preventDefault();const r=cv.getBoundingClientRect(),f=Math.exp(-e.deltaY*0.0015);if(S.follow)zoomFollow(f);else zoomAt(f,e.clientX-r.left,e.clientY-r.top);},{passive:false});

const ptrs=new Map();let drag=null,lastTap={t:0,idx:-1};
function handleAt(sx,sy){let best=-1,bd=22;S.ctrl.forEach((p,i)=>{const d=Math.hypot(SX(p[0])-sx,SY(p[1])-sy);if(d<bd){bd=d;best=i;}});return best;}
cv.addEventListener('pointerdown',e=>{
  cv.setPointerCapture(e.pointerId);const r=cv.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;
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
function refreshColors(){S.pal=readColors(document.documentElement);}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',refreshColors);
new MutationObserver(refreshColors).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});

// ---------- drawing (views in src/views/map2d/)
function draw(){
  const {disp,ghost,T}=S,rt=raceClock(ghost?[disp.t,ghost.t]:[disp.t],S.animT); // replay 0 (Pause) freezes the clock, not the car
  const cs=disp.t>0?pose(disp,rt,S.info):null,gs=ghost&&ghost.t>0?pose(ghost,rt):null;if(S.follow&&cs)cam.frame(gs?[cs,gs]:[cs],S.followZ,FOLLOW_MARGIN);
  // each car against the other at the same place (both lines index the track's stations; a track change clears the ghost)
  const ghostHere=cs&&ghost?stationPose(ghost,cs.station,cs.frac):null,carHere=gs?stationPose(disp,gs.station,gs.frac):null;
  const tags=S.tagMode==='off'?null:{car:cs&&tagText(S.tagMode,cs,ghostHere),ghost:gs&&tagText(S.tagMode,gs,carHere)};
  drawMap(ctx,cam,S.pal,{T,width:S.width,disp,colorMode:S.colorMode,ghost,ghostCar:gs,car:cs,carDims:{wb:S.P.wb,track:S.P.track},corners:S.corners,dyn:S.dynRes&&!S.dynStale?S.dynRes:null,editing:S.editing,ctrl:S.ctrl,sel:S.sel,tags});
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

// ---------- loop
let lastTs=0,frameN=0;
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
  if(S.frameErr&&S.running)S.frameErr=null;
  const dt=Math.min(0.1,(ts-lastTs)/1000||0);lastTs=ts;frameN++;
  const {T,disp,prog:p,ghost}=S;
  const pin=$('#pinBtn'),unsettled=!settled();if(pin.disabled!==unsettled)pin.disabled=unsettled; // a change still being built: its ghost would be stale
  if(!T||!disp||!p)return; // nothing from the solver yet
  S.animT+=dt*S.replay;
  const st=$('#status'),s=S.editing?'editing':!S.running?(p.converged?'converged':'paused'):(p.polish?'refining':'searching');
  const lbl=S.editing?'Editing track':!S.running?(p.converged?'Converged':'Paused'):p.polish?`Stage ${p.stage}/${p.of} · local polish`:`Stage ${p.stage}/${p.of} · ${p.knot} m spline`;
  if(!S.frameErr){if(st.dataset.s!==s)st.dataset.s=s;if(st.textContent!==lbl)st.textContent=lbl;}
  $('#lapTime').textContent=fmtTime(disp.t);
  $('#deltaRef').textContent=fmtDelta(disp.t-S.refT,3)+' s';
  if(ghost){$('#ghostTime').textContent=fmtTime(ghost.t);$('#ghostDelta').textContent='· you '+fmtDelta(disp.t-ghost.t,3)+' s';}
  $('#evals').textContent=p.evals.toLocaleString()+' laps simulated';
  $('#legMin').textContent=Math.round(disp.vmin*3.6);$('#legMax').textContent=Math.round(disp.vmax*3.6);
  showWarn(T,disp.warn);
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
