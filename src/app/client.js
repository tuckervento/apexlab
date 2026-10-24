// Protocol client for the solver worker (ARCHITECTURE.md §10.1): sends commands, applies events to S, and calls the
// UI hooks given to connect() for what the page must redraw. setCar/setTrack are coalesced: one in flight per kind
// and only the latest pending one goes next, so a slider or handle drag can't queue up dozens of ~60 ms rebuilds.
import { S } from './state.js';

const solver=new Worker(new URL('../solver/worker.js',import.meta.url),{type:'module'});
let rev=0,pendingT=null,ui=null,loadRev=0,carEv=0,trackEv=0; // loadRev: a load in flight; carEv, trackEv: latest car and track revisions the worker built
const flight={setCar:{busy:0,next:null},setTrack:{busy:0,next:null}};
// The page's own state behind each command (view: what the caller needs to put the page back), kept here and never
// sent; `accepted` is the view of the last command of each kind the worker built, which a refused one reverts to.
const views=new Map(),accepted={setCar:null,setTrack:null};
function accept(kind,r){if(views.has(r))accepted[kind]=views.get(r);for(const k of views.keys())if(k<=r)views.delete(k);}
export const send=cmd=>solver.postMessage(cmd);
export function sendState(type,body,view){const f=flight[type],cmd={type,rev:++rev,...body};if(view)views.set(cmd.rev,view);if(f.busy){f.next=cmd;return;}f.busy=cmd.rev;send(cmd);}
// A saved run replaces car, track and line in one command (ARCHITECTURE.md §10.1). It supersedes anything queued behind
// the commands already in flight, and holds both kinds busy until the worker has answered. Returns its revision.
export function sendLoad(body,view){ // view: () => {setCar, setTrack}, the page's state once loaded (called after ui.loaded)
  const cmd={type:'load',rev:++rev,...body};if(view)views.set(cmd.rev,view);
  for(const f of Object.values(flight)){f.next=null;f.busy=cmd.rev;}
  loadRev=cmd.rev;send(cmd);return cmd.rev;
}
// True when nothing is queued or in flight and the displayed line was computed on the newest car and track, so S.P,
// S.ctrl and S.disp describe one run (what an export saves).
export const settled=()=>{const d=S.disp,f=flight;return !!d&&!loadRev&&!f.setCar.busy&&!f.setCar.next&&!f.setTrack.busy&&!f.setTrack.next&&d.carRev===carEv&&d.trackRev===trackEv;};
function landed(f){f.busy=0;if(f.next){const c=f.next;f.next=null;f.busy=c.rev;if(S.editing)c.resume=false;send(c);}} // c was queued before the circuit edit began, whose pause its resume would undo
// hooks: {renderDerived(), renderDyn(), runLabel(), showError(msg), trackArrived(), dynLap(n), loaded(m), loadFailed(msg),
//   refused(kind, message, view): the worker refused a setCar/setTrack and nothing newer is queued; view is the last accepted,
//   ghostDropped(): a new circuit replaced the one the ghost was pinned on}
export function connect(hooks){ui=hooks;}

solver.onmessage=({data:m})=>{
  switch(m.type){
    case 'carInfo':carEv=m.carRev;if(m.carRev!==loadRev)accept('setCar',m.carRev);if(flight.setCar.busy!==loadRev)landed(flight.setCar);S.info=m.info;ui.renderDerived();break; // while a load is in flight, its answer ('loaded') frees the hold, not these
    case 'track':trackEv=m.trackRev;if(m.trackRev!==loadRev)accept('setTrack',m.trackRev);if(flight.setTrack.busy!==loadRev)landed(flight.setTrack);pendingT=m;break; // swapped in with the first snapshot on it
    case 'loaded':if(loadRev===m.rev){const v=views.get(m.rev);views.delete(m.rev);loadRev=0;for(const f of Object.values(flight)){f.busy=0;f.next=null;} // edits queued meanwhile were made against the state the load replaced
      ui.loaded(m);if(v){const w=v();accepted.setCar=w.setCar;accepted.setTrack=w.setTrack;}}break; // the page is in the loaded state only after ui.loaded
    case 'snapshot':onSnapshot(m);break;
    case 'progress':
      { // the worker owns `running`; S.running only mirrors it
        const changed=!S.prog||S.running!==m.running||S.prog.converged!==m.converged;
        S.prog=m;S.running=m.running;if(changed)ui.runLabel();
      }
      if(m.running&&!S.editing&&S.disp){S.hist.push([m.evals,S.disp.t]);if(S.hist.length>1500)S.hist=S.hist.filter((_,i)=>i%2===0);}
      break;
    case 'dynProgress':if(S.dynRunning)ui.dynLap(m.lap);break; // one emitted before a car or track change ended the check arrives after it
    case 'dynResult':S.dynRunning=false;S.dynRes={...m.result,carRev:m.carRev,trackRev:m.trackRev,lineRev:m.lineRev};S.dynStale=!dynCurrent();ui.renderDyn();break;
    case 'error':
      console.error('solver: '+m.message+'\n'+m.stack);
      if(m.paused!==false){ // a slice's error (or an older worker's): the solver paused itself, and sends no progress to say so
        S.running=false;ui.showError(m.message);if(S.dynRunning){S.dynRunning=false;ui.renderDyn();}
      }
      for(const [kind,f] of Object.entries(flight))if(m.rev&&f.busy===m.rev){ // the failed command won't be answered
        landed(f);views.delete(m.rev);
        if(m.paused===false&&m.rev!==loadRev&&!f.busy)ui.refused(kind,m.message,accepted[kind]); // nothing newer queued: back to what the worker holds
      }
      if(m.rev&&m.rev===loadRev){loadRev=0;views.delete(m.rev);ui.loadFailed(m.message);} // the load's own error (the loop above freed both kinds); the solver changed nothing, so S still matches it
      break;
  }
};
solver.onerror=e=>{
  e.preventDefault();console.error('solver worker:',e.message||e);S.running=false;ui.showError('solver failed: '+(e.message||'see console'));
  // Solver catches its own exceptions, so this is the worker failing outside a command: nothing in flight will be answered.
  for(const f of Object.values(flight)){f.busy=0;f.next=null;}
  if(loadRev){loadRev=0;ui.loadFailed('the solver worker failed');}
};
function onSnapshot(m){
  const d=S.disp;
  if(d&&(m.carRev<d.carRev||m.trackRev<d.trackRev))return; // never step back to an older car or track
  if(pendingT&&m.trackRev===pendingT.trackRev){
    S.T=pendingT;pendingT=null;ui.trackArrived();
    if(S.ghost&&S.ghost.trackRev!==m.trackRev){S.ghost=null;ui.ghostDropped();} // its stations are another circuit's
  }
  if(!S.T||m.trackRev!==S.T.trackRev)return;
  if(m.ref){S.refT=m.ref.t;S.refV=m.ref.v;}
  S.disp={...m.line,t:m.lap,vmin:m.vmin,vmax:m.vmax,warn:m.warn,carRev:m.carRev,trackRev:m.trackRev,lineRev:m.lineRev};
  const st=!!S.dynRes&&!dynCurrent();if(st!==S.dynStale){S.dynStale=st;ui.renderDyn();}
}
// A dynamic result is current only while the car, track and line it was computed on are the ones displayed.
function dynCurrent(){const d=S.disp,r=S.dynRes;return d&&r.carRev===d.carRev&&r.trackRev===d.trackRev&&r.lineRev===d.lineRev;}
