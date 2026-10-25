// Horizontal line ribbon; each segment owns four vertices so bucket colours never interpolate at stations.
// position: packed three XYZ, index: upward-facing triangles; colors: packed linear RGB in [0,1] (converted from palette sRGB).
import { dataToThree } from './frame.js';

export function lineRibbon(disp,{halfWidth=0.6,lift=0.05}={}){
  const N=disp.px.length,edges=new Float64Array(6*N);
  for(let i=0;i<N;i++){
    const a=(i+N-1)%N,b=(i+1)%N,dx=disp.px[b]-disp.px[a],dy=disp.py[b]-disp.py[a];
    const len=Math.hypot(dx,dy),nx=len?-dy/len:0,ny=len?dx/len:1;
    for(let side=0;side<2;side++){
      const w=(side?1:-1)*halfWidth;
      edges.set(dataToThree(disp.px[i]+nx*w,disp.py[i]+ny*w,(disp.pz?.[i]??0)+lift),6*i+3*side);
    }
  }
  const position=new Float32Array(12*N),index=new Uint32Array(6*N);
  for(let i=0;i<N;i++){
    const j=(i+1)%N,v=4*i;
    position.set(edges.subarray(6*i,6*i+6),12*i);
    position.set(edges.subarray(6*j,6*j+6),12*i+6);
    index.set([v,v+1,v+2,v+1,v+3,v+2],6*i);
  }
  return {position,index};
}

function rgb(css){
  if(css.startsWith('#')){
    let h=css.slice(1);if(h.length===3)h=h.split('').map(c=>c+c).join('');
    const n=parseInt(h,16);return [n>>16&255,n>>8&255,n&255];
  }
  return css.match(/[\d.]+/g).slice(0,3).map(Number);
}

// Four copies of each segment's colour, matching lineRibbon's vertex order. Ghost uses mode='ghost'.
export function lineColors(disp,mode,pal){
  const d=disp,N=d.px.length,{colors,ramp}=pal,result=new Float32Array(12*N);
  mode=mode==='util'&&!d.u?'speed':mode;
  const buckets=mode==='pedal'?3:ramp.length,span=Math.max(1e-6,d.vmax-d.vmin);
  for(let i=0;i<N;i++){
    const j=(i+1)%N;let b;
    if(mode==='speed') b=Math.round((d.v[i]-d.vmin)/span*(buckets-1));
    else if(mode==='util') b=buckets-1-Math.round(Math.max(0,Math.min(1,(d.u[i]-0.5)/0.5))*(buckets-1));
    else if(mode==='pedal'){const a=(d.v[j]*d.v[j]-d.v[i]*d.v[i])/(2*d.ds[i]+1e-9);b=a<-1.2?0:a>0.4?2:1;}
    const c=rgb(mode==='ghost'?colors.ghost:mode==='pedal'?[colors.s0,colors.s1,colors.s2][b]:ramp[b]);
    const linear=c.map(x=>{const v=x/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});
    for(let v=0;v<4;v++)result.set(linear,12*i+3*v);
  }
  return result;
}
