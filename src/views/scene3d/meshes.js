// Pure indexed road geometry in the three frame supplied by stationFrames.
// Each station stores left then right; shared vertices give smooth area-weighted normals.
export function trackRibbon(T,frames,{heightColors=false,pal}={}){
  const N=T.N,half=T.width/2,position=new Float32Array(6*N),normal=new Float32Array(6*N);
  const index=new Uint32Array(6*N),sums=new Float64Array(6*N);
  for(let i=0;i<N;i++){
    for(let edge=0;edge<2;edge++)for(let k=0;k<3;k++){
      position[6*i+3*edge+k]=frames.origin[3*i+k]+(edge?half:-half)*frames.lateral[3*i+k];
    }
    const a=2*i,b=a+1,c=2*((i+1)%N),d=c+1;
    index.set([a,b,c,b,d,c],6*i);
  }
  for(let i=0;i<index.length;i+=3){
    const a=3*index[i],b=3*index[i+1],c=3*index[i+2];
    const ux=position[b]-position[a],uy=position[b+1]-position[a+1],uz=position[b+2]-position[a+2];
    const vx=position[c]-position[a],vy=position[c+1]-position[a+1],vz=position[c+2]-position[a+2];
    const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;
    for(const j of [a,b,c]){sums[j]+=x;sums[j+1]+=y;sums[j+2]+=z;}
  }
  for(let i=0;i<2*N;i++){
    const j=3*i,length=Math.hypot(sums[j],sums[j+1],sums[j+2]);
    for(let k=0;k<3;k++)normal[j+k]=length?sums[j+k]/length:frames.up[3*Math.floor(i/2)+k];
  }
  const mesh={position,normal,index};
  if(heightColors&&!T.flat){
    let lo=Infinity,hi=-Infinity;
    for(const z of T.z){lo=Math.min(lo,z);hi=Math.max(hi,z);}
    const span=Math.max(1e-6,hi-lo),ramp=pal.elev.map(s=>s.match(/[\d.]+/g).map(Number));
    const color=new Float32Array(6*N);
    for(let i=0;i<N;i++){
      const rgb=ramp[Math.round((T.z[i]-lo)/span*(ramp.length-1))];
      // Palette strings are sRGB; three vertex colours are linear RGB.
      const linear=rgb.map(c=>{const v=c/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});
      color.set(linear,6*i);color.set(linear,6*i+3);
    }
    mesh.color=color;
  }
  return mesh;
}
