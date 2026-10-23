// Protocol client for the solver worker (ARCHITECTURE.md §10.1): sends commands, applies events to S, and calls the
// UI hooks given to connect() for what the page must redraw. setCar/setTrack are coalesced: one in flight per kind
// and only the latest pending one goes next, so a slider or handle drag can't queue up dozens of ~60 ms rebuilds.
import { S } from './state.js';

const solver=new Worker(new URL('../solver/worker.js',import.meta.url),{type:'module'});
let rev=0,pendingT=null,ui=null;
const flight={setCar:{busy:0,next:null},setTrack:{busy:0,next:null}};
export const send=cmd=>solver.postMessage(cmd);
export function sendState(type,body){const f=flight[type],cmd={type,rev:++rev,...body};if(f.busy){f.next=cmd;return;}f.busy=cmd.rev;send(cmd);}
function landed(f){f.busy=0;if(f.next){const c=f.next;f.next=null;f.busy=c.rev;send(c);}}
// hooks: {renderDerived(), renderDyn(), runLabel(), showError(msg), trackArrived(), dynLap(n)}
export function connect(hooks){ui=hooks;}

solver.onmessage=({data:m})=>{
  switch(m.type){
    case 'carInfo':landed(flight.setCar);S.info=m.info;ui.renderDerived();break;
    case 'track':landed(flight.setTrack);pendingT=m;break; // swapped in with the first snapshot on it
    case 'snapshot':onSnapshot(m);break;
    case 'progress':
      S.prog=m;
      if(m.converged&&S.running){S.running=false;ui.runLabel();}
      if(m.running&&!S.editing&&S.disp){S.hist.push([m.evals,S.disp.t]);if(S.hist.length>1500)S.hist=S.hist.filter((_,i)=>i%2===0);}
      break;
    case 'dynProgress':ui.dynLap(m.lap);break;
    case 'dynResult':S.dynRunning=false;S.dynRes={...m.result,carRev:m.carRev,trackRev:m.trackRev,lineRev:m.lineRev};S.dynStale=!dynCurrent();ui.renderDyn();break;
    case 'error':
      console.error('solver: '+m.message+'\n'+m.stack);ui.showError(m.message);
      if(S.dynRunning){S.dynRunning=false;ui.renderDyn();}
      for(const f of Object.values(flight))landed(f); // the failed command won't be answered
      break;
  }
};
solver.onerror=e=>{e.preventDefault();console.error('solver worker:',e.message||e);ui.showError('solver failed: '+(e.message||'see console'));};
function onSnapshot(m){
  const d=S.disp;
  if(d&&(m.carRev<d.carRev||m.trackRev<d.trackRev))return; // never step back to an older car or track
  if(pendingT&&m.trackRev===pendingT.trackRev){S.T=pendingT;pendingT=null;ui.trackArrived();}
  if(!S.T||m.trackRev!==S.T.trackRev)return;
  if(m.ref){S.refT=m.ref.t;S.refV=m.ref.v;}
  S.disp={...m.line,t:m.lap,vmin:m.vmin,vmax:m.vmax,carRev:m.carRev,trackRev:m.trackRev,lineRev:m.lineRev};
  const st=!!S.dynRes&&!dynCurrent();if(st!==S.dynStale){S.dynStale=st;ui.renderDyn();}
}
// A dynamic result is current only while the car, track and line it was computed on are the ones displayed.
function dynCurrent(){const d=S.disp,r=S.dynRes;return d&&r.carRev===d.carRev&&r.trackRev===d.trackRev&&r.lineRev===d.lineRev;}
