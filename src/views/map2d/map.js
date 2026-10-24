// The 2D map: track, racing line, ghost, dynamic-check overlay, corner labels, cars and edit handles, drawn from
// explicit inputs (no app state). Plus the corner finder for labels. Car poses come from src/playback/pose.js.

// Corners for labels: runs of |k| above 1/230 m⁻¹ with one sign, kept if longer than 14 m or tighter than 90 m.
export function findCorners(T){
  const N=T.N,th=1/230,out=[],k=T.kc;
  let start=0; while(start<N&&Math.abs(k[start])>th) start++;
  if(start>=N) return out;
  let cur=null;
  for(let s=1;s<=N;s++){
    const i=(start+s)%N,a=Math.abs(k[i]),sg=Math.sign(k[i]);
    if(a>th&&(!cur||cur.sign===sg)){
      if(!cur) cur={s:i,e:i,apex:i,peak:a,sign:sg};
      else{cur.e=i; if(a>cur.peak){cur.peak=a;cur.apex=i;}}
    }else{
      if(cur){out.push(cur);cur=null;}
      if(a>th) cur={s:i,e:i,apex:i,peak:a,sign:sg};
    }
  }
  if(cur) out.push(cur);
  const keep=out.filter(c=>((c.e-c.s+N)%N)*T.ds>14||c.peak>1/90);
  keep.sort((a,b)=>a.apex-b.apex);
  return keep;
}

// sc: {T, width, disp, colorMode, ghost, ghostCar, car, carDims:{wb, track}, corners, dyn (null when none or stale),
// editing, ctrl, sel (selected control point, -1 none), tags}. On a hilly circuit (T.flat false) the track surface is
// tinted by height (pal.elev, low to high) and edit handles show their heights. ghostCar/car are playback poses or null. tags: null, or {car, ghost}, each null or
// {main, delta?} text drawn in a small box beside that car (the car's on its right, the ghost's on its left).
export function drawMap(ctx,cam,pal,sc){
  const {colors,ramp,elev}=pal,{cw,ch,dpr}=cam,{T,width,ghost,corners,editing,ctrl}=sc;
  const SX=x=>cam.sx(x),SY=y=>cam.sy(y),WX=sx=>cam.wx(sx),WY=sy=>cam.wy(sy);
  function strokeLoop(xs,ys,o,nx,ny){ctx.beginPath();for(let i=0;i<=T.N;i++){const j=i%T.N,x=SX(xs[j]+(nx?nx[j]*o:0)),y=SY(ys[j]+(ny?ny[j]*o:0));i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();}
  function drawGrid(){
    let step=50;while(step*cam.z<14)step*=5;const major=step*5;
    const x0=WX(0),x1=WX(cw),y0=WY(0),y1=WY(ch);
    for(const [st,c] of [[step,colors.grid],[major,colors.grid2]]){
      ctx.beginPath();for(let x=Math.floor(x0/st)*st;x<=x1;x+=st){const s=Math.round(SX(x))+0.5;ctx.moveTo(s,0);ctx.lineTo(s,ch);}
      for(let y=Math.floor(y0/st)*st;y<=y1;y+=st){const s=Math.round(SY(y))+0.5;ctx.moveTo(0,s);ctx.lineTo(cw,s);}
      ctx.strokeStyle=c;ctx.lineWidth=1;ctx.stroke();
    }
  }
  function drawScaleBar(){
    const nice=[5,10,20,50,100,200,500,1000];let L=nice[0];for(const n of nice) if(n*cam.z<=120) L=n;
    const px=L*cam.z,x1=cw-16-(cw<560?0:0),x0=x1-px,y=ch-22;
    ctx.strokeStyle=colors.ink;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x0,y-5);ctx.lineTo(x0,y);ctx.lineTo(x1,y);ctx.lineTo(x1,y-5);ctx.stroke();
    ctx.fillStyle=colors.ink;ctx.font=`11px ${colors.mono}`;ctx.textAlign='center';ctx.fillText(L>=1000?(L/1000)+' km':L+' m',(x0+x1)/2,y-7);
  }
  function drawDynOverlay(){
    const R=sc.dyn;if(!R)return;const tr=R.dyn&&R.dyn.trace;
    if(tr&&tr.x.length>1){ctx.beginPath();ctx.moveTo(SX(tr.x[0]),SY(tr.y[0]));for(let i=1;i<tr.x.length;i++)ctx.lineTo(SX(tr.x[i]),SY(tr.y[i]));ctx.setLineDash([2,3]);ctx.strokeStyle=colors.ink;ctx.lineWidth=1.2;ctx.stroke();ctx.setLineDash([]);}
    if(R.fail){const i=R.fail.at,x=SX(T.cx[i]),y=SY(T.cy[i]),rad=Math.max(12,(width/2+3)*cam.z);
      ctx.beginPath();ctx.arc(x,y,rad,0,Math.PI*2);ctx.strokeStyle=colors.accent;ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
      ctx.font=`500 11px ${colors.mono}`;ctx.fillStyle=colors.accent;ctx.textAlign='left';ctx.fillText(R.fail.spun?'spins here':'runs wide here',x+rad+4,y+4);}
  }
  function drawCar(cs,wb,tw,isGhost){
    const L=Math.max(16,(wb+1.6)*cam.z),Wd=Math.max(8,(tw+0.3)*cam.z);
    ctx.save();ctx.translate(SX(cs.x),SY(cs.y));ctx.rotate(cs.heading);
    ctx.beginPath();ctx.moveTo(L/2,0);ctx.lineTo(L/4,-Wd/2);ctx.lineTo(-L/2,-Wd/2);ctx.lineTo(-L/2,Wd/2);ctx.lineTo(L/4,Wd/2);ctx.closePath();
    if(isGhost){ctx.globalAlpha=0.28;ctx.fillStyle=colors.ghost;ctx.fill();ctx.globalAlpha=1;ctx.setLineDash([3,2]);ctx.strokeStyle=colors.ghost;ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);}
    else{ctx.fillStyle=colors.ink;ctx.strokeStyle=colors.paper;ctx.lineWidth=1.5;ctx.fill();ctx.stroke();ctx.fillStyle=colors.accent;ctx.fillRect(-L/2,-Wd/2,L*0.18,Wd);}
    ctx.restore();
  }
  // Tag box beside a car marker: pushed out along the screen normal of its heading (side +1: right of travel), clear
  // of the marker, so the car's and the ghost's tags sit on opposite sides and don't stack. A box that would leave the
  // canvas goes to the marker's other side if it fits there, and is then kept inside.
  function drawTag(cs,tag,wb,tw,side,col){
    const L=Math.max(16,(wb+1.6)*cam.z),Wd=Math.max(8,(tw+0.3)*cam.z),D=Math.max(L,Wd)/2+8;
    const fMain=`500 11px ${colors.mono}`,fDelta=`9.5px ${colors.mono}`;
    ctx.font=fMain;let w=ctx.measureText(tag.main).width;if(tag.delta){ctx.font=fDelta;w=Math.max(w,ctx.measureText(tag.delta).width);}
    const bw=Math.round(w+12),bh=tag.delta?30:19;
    const place=sd=>{const nx=-Math.sin(cs.heading)*sd,ny=Math.cos(cs.heading)*sd,px=SX(cs.x)+nx*D,py=SY(cs.y)+ny*D;return [Math.round(px+nx*bw/2-bw/2),Math.round(py+ny*bh/2-bh/2)];};
    const inside=([x,y])=>x>=4&&y>=4&&x+bw<=cw-4&&y+bh<=ch-4;
    let [x0,y0]=place(side);if(!inside([x0,y0])){const q=place(-side);if(inside(q))[x0,y0]=q;}
    x0=Math.max(4,Math.min(cw-4-bw,x0));y0=Math.max(4,Math.min(ch-4-bh,y0));
    ctx.globalAlpha=0.88;ctx.fillStyle=colors.paper;ctx.fillRect(x0,y0,bw,bh);ctx.globalAlpha=1;
    ctx.strokeStyle=col;ctx.lineWidth=1;ctx.strokeRect(x0+0.5,y0+0.5,bw-1,bh-1);
    ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font=fMain;ctx.fillStyle=col;ctx.fillText(tag.main,x0+6,y0+13.5);
    if(tag.delta){ctx.font=fDelta;ctx.fillStyle=colors.muted;ctx.fillText(tag.delta,x0+6,y0+25);}
  }

  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=colors.paper;ctx.fillRect(0,0,cw,ch);
  drawGrid();
  const hw=width/2,N=T.N;
  ctx.lineJoin='round';ctx.lineCap='round';
  if(T.flat){strokeLoop(T.cx,T.cy,0);ctx.strokeStyle=colors.track;ctx.lineWidth=Math.max(2,width*cam.z);ctx.stroke();}
  else{ // by height: one path per ramp step, of the segments whose mean height falls in it
    let lo=Infinity,hi=-Infinity;for(let i=0;i<N;i++){lo=Math.min(lo,T.z[i]);hi=Math.max(hi,T.z[i]);}
    const nb=elev.length,span=Math.max(1e-6,hi-lo),seg=Array.from({length:nb},()=>[]);
    for(let i=0;i<N;i++){const j=(i+1)%N;seg[Math.round(((T.z[i]+T.z[j])/2-lo)/span*(nb-1))].push(i);}
    ctx.lineWidth=Math.max(2,width*cam.z);
    seg.forEach((arr,b)=>{if(!arr.length)return;ctx.beginPath();for(const i of arr){const j=(i+1)%N;ctx.moveTo(SX(T.cx[i]),SY(T.cy[i]));ctx.lineTo(SX(T.cx[j]),SY(T.cy[j]));}ctx.strokeStyle=elev[b];ctx.stroke();});}
  // kerbs on the inside of corners
  const kw=Math.max(1.5,1.2*cam.z);ctx.lineWidth=kw;ctx.lineCap='butt';
  for(const pass of [0,1]){ctx.beginPath();
    for(let i=0;i<N;i++){const k=T.kc[i];if(Math.abs(k)<1/160)continue;if(((i/2)|0)%2!==pass)continue;const sg=k>0?1:-1,j=(i+1)%N,o=sg*(hw+0.6);
      ctx.moveTo(SX(T.cx[i]+T.nx[i]*o),SY(T.cy[i]+T.ny[i]*o));ctx.lineTo(SX(T.cx[j]+T.nx[j]*o),SY(T.cy[j]+T.ny[j]*o));}
    ctx.strokeStyle=pass?colors.kerb2:colors.kerb;ctx.stroke();}
  ctx.lineCap='round';
  for(const s of [1,-1]){strokeLoop(T.cx,T.cy,s*hw,T.nx,T.ny);ctx.strokeStyle=colors.edge;ctx.lineWidth=1;ctx.stroke();}
  // centreline
  ctx.setLineDash([4,6]);strokeLoop(T.cx,T.cy,0);ctx.strokeStyle=colors.edge;ctx.globalAlpha=0.45;ctx.lineWidth=1;ctx.stroke();ctx.globalAlpha=1;ctx.setLineDash([]);
  // start line (checker)
  {const sq=Math.max(1.5,2*cam.z),n=Math.ceil(width/2);for(let r=0;r<2;r++)for(let q=0;q<n;q++){const o=-hw+q*2+1,a=(r?1:-1)*1;
    const x=SX(T.cx[0]+T.nx[0]*o)+((T.ny[0])*-a*cam.z),y=SY(T.cy[0]+T.ny[0]*o)+((-T.nx[0])*-a*cam.z);
    ctx.fillStyle=(q+r)%2?colors.ink:colors.paper;ctx.fillRect(x-sq/2,y-sq/2,sq,sq);}}
  // ghost
  if(ghost){ctx.beginPath();for(let i=0;i<=N;i++){const j=i%N;i?ctx.lineTo(SX(ghost.px[j]),SY(ghost.py[j])):ctx.moveTo(SX(ghost.px[j]),SY(ghost.py[j]));}
    ctx.setLineDash([6,5]);ctx.strokeStyle=colors.ghost;ctx.lineWidth=Math.max(1.5,Math.min(4,0.8*cam.z));ctx.stroke();ctx.setLineDash([]);}
  // racing line
  const d=sc.disp,lw=Math.max(2.5,Math.min(6,1.2*cam.z));ctx.lineWidth=lw;
  const mode=sc.colorMode==='util'&&!d.u?'speed':sc.colorMode; // until a snapshot with tyre use arrives
  const buckets=mode==='pedal'?3:ramp.length,paths=Array.from({length:buckets},()=>[]);
  const span=Math.max(1e-6,d.vmax-d.vmin);
  for(let i=0;i<N;i++){const j=(i+1)%N;let b;
    if(mode==='speed') b=Math.round((d.v[i]-d.vmin)/span*(buckets-1));
    else if(mode==='util') b=buckets-1-Math.round(Math.max(0,Math.min(1,(d.u[i]-0.5)/0.5))*(buckets-1));
    else{const a=(d.v[j]*d.v[j]-d.v[i]*d.v[i])/(2*d.ds[i]+1e-9);b=a<-1.2?0:a>0.4?2:1;}
    paths[b].push(i);}
  paths.forEach((arr,b)=>{if(!arr.length)return;ctx.beginPath();for(const i of arr){const j=(i+1)%N;ctx.moveTo(SX(d.px[i]),SY(d.py[i]));ctx.lineTo(SX(d.px[j]),SY(d.py[j]));}
    ctx.strokeStyle=mode==='pedal'?[colors.s0,colors.s1,colors.s2][b]:ramp[b];ctx.stroke();});
  drawDynOverlay();
  // corner labels
  ctx.font=`500 11px ${colors.mono}`;ctx.textAlign='center';ctx.textBaseline='middle';const placed=[];
  corners.forEach((c,n)=>{const i=c.apex,o=-c.sign*(hw+(18+lw)/cam.z),x=SX(T.cx[i]+T.nx[i]*o),y=SY(T.cy[i]+T.ny[i]*o);
    if(placed.some(p=>Math.hypot(p[0]-x,p[1]-y)<46))return;placed.push([x,y]);
    let vm=1e9;const len=(c.e-c.s+N)%N;for(let s=-12;s<=len+12;s++)vm=Math.min(vm,d.v[(c.s+s+N)%N]);
    const t1='T'+(n+1),t2=Math.round(vm*3.6)+'';ctx.fillStyle=colors.paper;ctx.globalAlpha=0.8;ctx.fillRect(x-17,y-13,34,26);ctx.globalAlpha=1;
    ctx.fillStyle=colors.ink;ctx.fillText(t1,x,y-6);ctx.fillStyle=colors.muted;ctx.font=`10px ${colors.mono}`;ctx.fillText(t2,x,y+6);ctx.font=`500 11px ${colors.mono}`;});
  ctx.textBaseline='alphabetic';
  // cars
  if(sc.ghostCar)drawCar(sc.ghostCar,ghost.wb,ghost.track,true);
  if(sc.car)drawCar(sc.car,sc.carDims.wb,sc.carDims.track,false);
  const tags=sc.tags;
  if(tags&&tags.ghost&&sc.ghostCar)drawTag(sc.ghostCar,tags.ghost,ghost.wb,ghost.track,-1,colors.ghost);
  if(tags&&tags.car&&sc.car)drawTag(sc.car,tags.car,sc.carDims.wb,sc.carDims.track,1,colors.ink);
  // edit handles
  if(editing){ctx.beginPath();ctrl.forEach((p,i)=>i?ctx.lineTo(SX(p[0]),SY(p[1])):ctx.moveTo(SX(p[0]),SY(p[1])));ctx.closePath();ctx.setLineDash([3,4]);ctx.strokeStyle=colors.accent;ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
    ctrl.forEach((p,i)=>{ctx.beginPath();ctx.arc(SX(p[0]),SY(p[1]),7,0,Math.PI*2);ctx.fillStyle=i===sc.sel?colors.accent:colors.paper;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=colors.accent;ctx.stroke();});
    if(!T.flat||ctrl.some(p=>p[2])){ctx.font=`10px ${colors.mono}`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=colors.ink;ctrl.forEach(p=>ctx.fillText(`${Math.round(p[2]||0)} m`,SX(p[0])+10,SY(p[1])-9));ctx.textBaseline='alphabetic';}}
  drawScaleBar();
}
