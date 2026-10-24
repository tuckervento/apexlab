// Side-panel charts, drawn from explicit inputs (no app state). Each takes its canvas, the device pixel ratio and
// the palette ({colors, ramp} from colors.js). carPos is the car's station (−1 when there is no car), carV its speed.
import { fmtTime } from '../format.js';

// Match a chart canvas's backing store to its size at dpr. The CSS height comes from its height attribute, kept in
// data-h on first sight: setting c.height rewrites that attribute to the backing height (h·dpr), and reading it back
// drew every chart twice its height on 2× screens, cut off at the bottom.
export function sizeChart(c,dpr){const w=c.clientWidth,h=+(c.dataset.h||(c.dataset.h=c.getAttribute('height')));if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);c.style.height=h+'px';}return [w,h];}

// Speed over lap distance: racing line, centreline reference (refV) and ghost.
export function drawSpeedChart(c,dpr,{colors},{T,disp,refV,ghost,carPos}){
  const g=c.getContext('2d'),[w,h]=sizeChart(c,dpr);g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const N=T.N,padL=30,padB=16,padT=6,iw=w-padL-4,ih=h-padB-padT;
  let vmax=Math.max(disp.vmax,...refV);if(ghost)vmax=Math.max(vmax,...ghost.v);vmax=Math.ceil(vmax*3.6/50)*50;const X=i=>padL+i/(N-1)*iw,Y=v=>padT+ih-(v*3.6)/vmax*ih;
  g.font=`10px ${colors.mono}`;g.fillStyle=colors.muted;g.textAlign='right';g.strokeStyle=colors.rule;g.lineWidth=1;
  for(let v=0;v<=vmax;v+=vmax>250?100:50){const y=Math.round(padT+ih-v/vmax*ih)+0.5;g.beginPath();g.moveTo(padL,y);g.lineTo(w-4,y);g.stroke();g.fillText(v,padL-5,y+3);}
  g.textAlign='center';const km=T.L/1000;for(let k=0;k<=km;k+=km>4?1:0.5){g.fillText(k+(k===0?' km':''),padL+k/km*iw,h-3);}
  const line=(arr,col,wd,dash)=>{g.beginPath();for(let i=0;i<N;i++){i?g.lineTo(X(i),Y(arr[i])):g.moveTo(X(i),Y(arr[i]));}g.strokeStyle=col;g.lineWidth=wd;g.setLineDash(dash||[]);g.stroke();g.setLineDash([]);};
  line(refV,colors.muted,1,[3,3]);if(ghost)line(ghost.v,colors.ghost,1.2,[5,3]);line(disp.v,colors.ink,1.6);
  if(carPos>=0){g.strokeStyle=colors.accent;g.lineWidth=1.5;g.beginPath();g.moveTo(X(carPos),padT);g.lineTo(X(carPos),padT+ih);g.stroke();}
}

// Height over lap distance on a hilly circuit (T.z, the centreline's: the line's heights are the same, no banking).
export function drawElevChart(c,dpr,{colors},{T,carPos}){
  const g=c.getContext('2d'),[w,h]=sizeChart(c,dpr);g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const N=T.N,z=T.z,padL=30,padB=16,padT=6,iw=w-padL-4,ih=h-padB-padT;let lo=Infinity,hi=-Infinity;for(let i=0;i<N;i++){lo=Math.min(lo,z[i]);hi=Math.max(hi,z[i]);}
  const span=Math.max(1,hi-lo),X=i=>padL+i/(N-1)*iw,Y=v=>padT+ih-(v-lo)/span*ih;
  g.font=`10px ${colors.mono}`;g.fillStyle=colors.muted;g.strokeStyle=colors.rule;g.lineWidth=1;g.textAlign='right';
  for(const v of [lo,hi]){const y=Math.round(Y(v))+0.5;g.beginPath();g.moveTo(padL,y);g.lineTo(w-4,y);g.stroke();g.fillText(Math.round(v),padL-5,y+3);}
  g.textAlign='center';const km=T.L/1000;for(let k=0;k<=km;k+=km>4?1:0.5)g.fillText(k+(k===0?' km':''),padL+k/km*iw,h-3);
  g.beginPath();g.moveTo(X(0),padT+ih);for(let i=0;i<N;i++)g.lineTo(X(i),Y(z[i]));g.lineTo(X(N-1),padT+ih);g.closePath();g.fillStyle=colors.grid2;g.fill();
  g.beginPath();for(let i=0;i<N;i++)i?g.lineTo(X(i),Y(z[i])):g.moveTo(X(i),Y(z[i]));g.strokeStyle=colors.ink;g.lineWidth=1.4;g.stroke();
  if(carPos>=0){g.strokeStyle=colors.accent;g.lineWidth=1.5;g.beginPath();g.moveTo(X(carPos),padT);g.lineTo(X(carPos),padT+ih);g.stroke();}
}

// Best lap against optimiser evaluations; hist is [[evals, lap], …].
export function drawConv(c,dpr,{colors},hist){
  const g=c.getContext('2d'),[w,h]=sizeChart(c,dpr);g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const pts=hist.filter(Boolean);if(pts.length<2){g.fillStyle=colors.muted;g.font=`11px ${colors.mono}`;g.fillText('Collecting…',8,h/2);return;}
  const e0=pts[0][0],e1=pts[pts.length-1][0];let t0=Infinity,t1=-Infinity;pts.forEach(p=>{t0=Math.min(t0,p[1]);t1=Math.max(t1,p[1]);});
  if(t1-t0<0.05){t1=t0+0.05;}const padL=4,padR=4,padT=14,padB=6,X=e=>padL+(e-e0)/Math.max(1,e1-e0)*(w-padL-padR),Y=t=>padT+(t1-t)/(t1-t0)*(h-padT-padB);
  g.beginPath();let first=true;for(const p of hist){if(!p){first=true;continue;}first?g.moveTo(X(p[0]),Y(p[1])):g.lineTo(X(p[0]),Y(p[1]));first=false;}
  g.strokeStyle=colors.accent;g.lineWidth=1.6;g.stroke();
  g.lineTo(X(e1),h-padB);g.lineTo(X(e0),h-padB);g.closePath();
  g.fillStyle=colors.ink;g.font=`10px ${colors.mono}`;g.textAlign='left';g.fillText(fmtTime(t1),padL,10);g.textAlign='right';g.fillText(fmtTime(t0),w-padR,h-padB-4);
}

// Time gap to the ghost over lap distance.
export function drawGapChart(c,dpr,{colors},{T,disp,ghost,carPos}){
  const g=c.getContext('2d'),[w,h]=sizeChart(c,dpr);g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const N=T.N,gap=new Float64Array(N);let mx=0.05;for(let i=0;i<N;i++){gap[i]=disp.tc[i]-ghost.tc[i];mx=Math.max(mx,Math.abs(gap[i]));}
  const nice=[0.05,0.1,0.2,0.5,1,2,5,10,20];let top=nice.find(n=>n>=mx)||mx;
  const padL=34,padT=6,padB=6,iw=w-padL-4,ih=h-padT-padB,X=i=>padL+i/(N-1)*iw,Y=v=>padT+ih/2-v/top*ih/2;
  g.font=`10px ${colors.mono}`;g.fillStyle=colors.muted;g.textAlign='right';g.strokeStyle=colors.rule;g.lineWidth=1;
  for(const v of [top,0,-top]){const y=Math.round(Y(v))+0.5;g.beginPath();g.moveTo(padL,y);g.lineTo(w-4,y);g.stroke();g.fillText((v>0?'+':v<0?'−':'')+Math.abs(v),padL-5,y+3);}
  g.beginPath();g.moveTo(X(0),Y(0));for(let i=0;i<N;i++)g.lineTo(X(i),Y(gap[i]));g.lineTo(X(N-1),Y(0));g.closePath();g.globalAlpha=0.12;g.fillStyle=colors.ink;g.fill();g.globalAlpha=1;
  g.beginPath();for(let i=0;i<N;i++){i?g.lineTo(X(i),Y(gap[i])):g.moveTo(X(i),Y(gap[i]));}g.strokeStyle=colors.ink;g.lineWidth=1.5;g.stroke();
  if(carPos>=0){g.strokeStyle=colors.accent;g.beginPath();g.moveTo(X(carPos),padT);g.lineTo(X(carPos),padT+ih);g.stroke();}
}

// Tractive force against speed from describeCar's curves. Returns whether per-gear lines were drawn (none for an EV).
export function drawForceChart(c,dpr,{colors},{info,carPos,carV}){
  const g=c.getContext('2d'),[w,h]=sizeChart(c,dpr);g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const {drive,traction,resist,gears}=info.curves,vs=info.vstep;
  const vmaxK=Math.min((info.n-1)*vs*3.6,Math.ceil(info.derived.vTop*3.6*1.12/50)*50),nmax=Math.min(info.n-1,Math.round(vmaxK/3.6/vs));
  // scaled to the whole traction limit: with downforce it climbs with speed, and capping the axis (as at 1.6× drive)
  // sent it off the top for the GT racer and Open-wheeler
  let fmax=0;for(let i=1;i<=nmax;i++)fmax=Math.max(fmax,drive[i],traction[i]);fmax=Math.ceil(fmax/1000/2)*2||2;
  const padL=26,padB=16,padT=6,iw=w-padL-4,ih=h-padT-padB,X=i=>padL+i/nmax*iw,Y=F=>padT+ih-F/1000/fmax*ih;
  g.font=`10px ${colors.mono}`;g.fillStyle=colors.muted;g.textAlign='right';g.strokeStyle=colors.rule;g.lineWidth=1;
  const ys=fmax>12?4:2;for(let f=0;f<=fmax;f+=ys){const y=Math.round(Y(f*1000))+0.5;g.beginPath();g.moveTo(padL,y);g.lineTo(w-4,y);g.stroke();g.fillText(f,padL-5,y+3);}
  for(let v=0;v<=vmaxK;v+=vmaxK>250?100:50){const x=X(v/3.6/vs);g.textAlign=x>w-20?'right':'center';g.fillText(v,Math.min(x,w-2),h-3);}
  g.save();g.beginPath();g.rect(padL,padT,iw,ih);g.clip();
  const line=(fn,col,wd,dash)=>{g.beginPath();let pen=false;for(let i=0;i<=nmax;i++){const F=fn(i);if(!isFinite(F)){pen=false;continue;}pen?g.lineTo(X(i),Y(F)):g.moveTo(X(i),Y(F));pen=true;}g.strokeStyle=col;g.lineWidth=wd;g.setLineDash(dash||[]);g.stroke();g.setLineDash([]);};
  gears.forEach(gf=>line(i=>gf[i],colors.grid2,1.2)); // none for an EV
  line(i=>traction[i],colors.accent,1.4,[5,3]);
  line(i=>resist[i],colors.muted,1.2,[3,3]);
  line(i=>drive[i],colors.ink,1.8);
  g.restore();
  if(carPos>=0){const x=X(carV/vs);g.strokeStyle=colors.accent;g.lineWidth=1;g.beginPath();g.moveTo(x,padT);g.lineTo(x,padT+ih);g.stroke();}
  return gears.length>0;
}
