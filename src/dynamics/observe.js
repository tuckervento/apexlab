// A fresh scalar observation; no mutable plant or geometry references escape.
export function observe(state,line,idx,t=0){
  const {x,y,vx,vy,r,psi,delta,ax,ay,curG}=state;
  const {N,px,py,th,ds:dsL}=line;
  let seg=idx,ux=Math.cos(th[seg]),uy=Math.sin(th[seg]),sx=(x-px[seg])*ux+(y-py[seg])*uy;
  if(sx<0){seg=(idx-1+N)%N;ux=Math.cos(th[seg]);uy=Math.sin(th[seg]);sx=(x-px[seg])*ux+(y-py[seg])*uy;}
  const j=(seg+1)%N,f=Math.max(0,Math.min(1,sx/(dsL[seg]||1)));
  const e=-(x-px[seg])*uy+(y-py[seg])*ux; // + = left of line
  const thl=th[seg]+f*Math.atan2(Math.sin(th[j]-th[seg]),Math.cos(th[j]-th[seg]));

  return {t,station:idx,seg,f,e,thl,x,y,vx,vy,r,psi,delta,ax,ay,gear:curG};
}
