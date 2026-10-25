// Both endpoints must qualify: no kerb vertex leaks into a straight or across a corner boundary.
function segments(T,corners,threshold){
  const out=[];
  for(const c of corners)for(let s=0,n=(c.e-c.s+T.N)%T.N;s<n;s++){
    const i=(c.s+s)%T.N,j=(i+1)%T.N,sign=Math.sign(T.kc[i]);
    if(Math.abs(T.kc[i])>=threshold&&Math.abs(T.kc[j])>=threshold&&sign===Math.sign(T.kc[j]))out.push([i,j,sign]);
  }
  return out;
}
function linear(css){
  let rgb;
  if(css.startsWith('#')){
    let h=css.slice(1);if(h.length===3)h=h.split('').map(c=>c+c).join('');
    const n=parseInt(h,16);rgb=[n>>16&255,n>>8&255,n&255];
  }else rgb=css.match(/[\d.]+/g).slice(0,3).map(Number);
  return rgb.map(c=>{const v=c/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});
}
// Refill the existing attribute on theme changes; segment order matches kerbs().
export function kerbColors(T,corners,color,{threshold=1/160,pal}={}){
  const colors=[linear(pal.colors.kerb),linear(pal.colors.kerb2)];
  segments(T,corners,threshold).forEach(([i],s)=>{
    for(let v=0;v<4;v++)color.set(colors[Math.floor(i/2)%2],12*s+3*v);
  });
  return color;
}
// Width is metres. No lift: the renderer uses polygon offset to preserve the road height.
export function kerbs(T,frames,corners,{threshold=1/160,width=1,pal}={}){
  const spans=segments(T,corners,threshold),position=new Float32Array(12*spans.length);
  const normal=new Float32Array(position.length),color=new Float32Array(position.length),index=new Uint32Array(6*spans.length);
  spans.forEach(([i,j,sign],s)=>{
    for(let v=0;v<4;v++){
      const st=v<2?i:j,edge=v%2,offset=sign*(edge?T.width/2+0.01:T.width/2-width);
      for(let k=0;k<3;k++){
        position[12*s+3*v+k]=frames.origin[3*st+k]+offset*frames.lateral[3*st+k];
        normal[12*s+3*v+k]=frames.up[3*st+k];
      }
    }
    const v=4*s;
    index.set(sign>0?[v,v+1,v+2,v+1,v+3,v+2]:[v,v+2,v+1,v+1,v+2,v+3],6*s);
  });
  kerbColors(T,corners,color,{threshold,pal});
  return {position,normal,index,color};
}
