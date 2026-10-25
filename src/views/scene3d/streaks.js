// Camera-local metres; a fixed pool avoids spawning work during playback.
export const STREAK_MAX=160;
export function streakCount(speed,reducedMotion=false){
  return reducedMotion?0:Math.floor(STREAK_MAX*Math.min(1,Math.max(0,speed)/100));
}
export function streakLength(speed,reducedMotion=false){
  return reducedMotion?0:Math.min(4,Math.max(0,speed)*0.04);
}
export function streakLayout(seed=43){
  const out=new Float64Array(STREAK_MAX*3);
  let s=seed>>>0;
  const next=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  for(let i=0;i<STREAK_MAX;i++){
    const j=3*i,side=next()<0.5?-1:1;
    out[j]=side*(2+next()*12);out[j+1]=(next()-0.5)*12;out[j+2]=next()*48;
  }
  return out;
}
// Writes into caller-owned storage; travel wraps behind the camera without changing the seed.
export function streakPosition(layout,i,speed,tAnim,out){
  const j=3*i,travel=Math.max(0,speed)*tAnim;
  out[0]=layout[j];out[1]=layout[j+1];out[2]=-2-((layout[j+2]-travel)%48+48)%48;
  return out;
}
