import { stationFrames } from './frame.js';

const wrap=(s,N)=>(s%N+N)%N;
function placement(T,f,c,station){
  const a=Math.floor(station),b=(a+1)%T.N,u=station-a;
  const origin=[0,1,2].map(k=>f.origin[3*a+k]*(1-u)+f.origin[3*b+k]*u);
  const n=[0,1,2].map(k=>f.lateral[3*a+k]*(1-u)+f.lateral[3*b+k]*u);
  const len=Math.hypot(...n);for(let k=0;k<3;k++)n[k]/=len;
  let offset=T.width/2+2,position;
  // A neighbouring arm can be closer than the station that owns the marker.
  for(;;offset+=1){
    position=origin.map((v,k)=>v-c.sign*offset*n[k]);
    let clear=true;
    for(let i=0;i<T.N;i++)if(Math.hypot(position[0]-f.origin[3*i],position[2]-f.origin[3*i+2])<=T.width/2+1.5){clear=false;break;}
    if(clear)break;
  }
  position[1]+=1.5;
  const tx=f.tangent[3*a]*(1-u)+f.tangent[3*b]*u,tz=f.tangent[3*a+2]*(1-u)+f.tangent[3*b+2]*u;
  return {station,position,yaw:Math.atan2(-tx,-tz)};
}
export function boardPlacements(T,corners,{distances=[100,200,300]}={}){
  const f=stationFrames(T);
  return corners.flatMap((c,corner)=>distances.map(distance=>({corner,distance,...placement(T,f,c,wrap(c.s-distance/T.ds,T.N))})));
}
export function signPlacements(T,corners){
  const f=stationFrames(T);
  return corners.map((c,corner)=>({corner,number:corner+1,...placement(T,f,c,c.apex)}));
}
function builder(){
  const position=[],normal=[],index=[],color=[];
  function quad(points,n,c=1){const v=position.length/3;for(const p of points){position.push(...p);normal.push(...n);color.push(c,c,c);}index.push(v,v+1,v+2,v,v+2,v+3);}
  return {quad,finish:()=>({position:new Float32Array(position),normal:new Float32Array(normal),index:new Uint32Array(index),color:new Float32Array(color)})};
}
export function startBand(T,f=stationFrames(T)){
  const b=builder(),cells=Math.ceil(T.width),p=(l,t,h)=>[0,1,2].map(k=>f.origin[k]+l*f.lateral[k]+t*f.tangent[k]+h*f.up[k]);
  for(let i=0;i<cells;i++)for(let j=0;j<2;j++){
    const l=-T.width/2+i*T.width/cells,r=l+T.width/cells,t=(j-1)*0.6;
    b.quad([p(l,t,0.04),p(l,t+0.6,0.04),p(r,t+0.6,0.04),p(r,t,0.04)],Array.from(f.up.slice(0,3)),(i+j)%2);
  }
  return b.finish();
}
export function gantry(T,f=stationFrames(T)){
  const b=builder(),half=T.width/2+2;
  function box(l,h,w,height,depth){
    const p=(x,y,z)=>[0,1,2].map(k=>f.origin[k]+(l+x*w/2)*f.lateral[k]+(h+y*height/2)*f.up[k]+z*depth/2*f.tangent[k]);
    for(const [axis,other] of [[0,[1,2]],[1,[2,0]],[2,[0,1]]])for(const s of [-1,1]){
      const pts=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,c])=>{const v=[0,0,0];v[axis]=s;v[other[0]]=a;v[other[1]]=c;return p(...v);});
      const n=axis===0?f.lateral:axis===1?f.up:f.tangent;b.quad(pts,Array.from(n.slice(0,3),v=>v*s));
    }
  }
  box(-half,3,0.3,6,0.3);box(half,3,0.3,6,0.3);box(0,6,2*half+0.3,0.5,0.4);
  return b.finish();
}
// Fixed-size tiles preserve digit resolution; overflow gets another bounded texture.
export function labelAtlas(count){
  const pages=[],tileSize=128,capacity=256;
  for(let start=0;start<count;start+=capacity){
    const n=Math.min(capacity,count-start),columns=Math.min(16,Math.ceil(Math.sqrt(n))),rows=Math.ceil(n/columns);
    const width=columns*tileSize,height=rows*tileSize,tiles=[];
    for(let i=0;i<n;i++){
      const x=i%columns*tileSize,y=Math.floor(i/columns)*tileSize;
      // Half-texel inset keeps filtering inside each tile; canvas textures flip Y.
      tiles.push({x,y,size:tileSize,uv:[(x+0.5)/width,1-(y+tileSize-0.5)/height,(x+tileSize-0.5)/width,1-(y+0.5)/height]});
    }
    pages.push({start,count:n,tileSize,columns,rows,width,height,tiles});
  }
  return {pages};
}

export function markerPosts(T,records,{height=1.4}={}){
  const b=builder();
  for(const r of records){
    const a=Math.floor(r.station),u=r.station-a,ground=T.z[a]*(1-u)+T.z[(a+1)%T.N]*u;
    const bottom=ground-0.25,top=r.position[1]-height/2+0.05;
    const p=(x,y,z)=>[r.position[0]+x*0.08,y<0?bottom:top,r.position[2]+z*0.08];
    for(const [axis,other] of [[0,[1,2]],[1,[2,0]],[2,[0,1]]])for(const side of [-1,1]){
      const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,c])=>{const v=[0,0,0];v[axis]=side;v[other[0]]=a;v[other[1]]=c;return p(...v);});
      const n=[0,0,0];n[axis]=side;b.quad(points,n);
    }
  }
  return b.finish();
}

// Merged front-facing label planes; UVs belong to the supplied atlas page.
export function labelPlanes(records,{width=2,height=1.4,tiles=labelAtlas(records.length).pages.flatMap(p=>p.tiles)}={}){
  const b=builder(),uv=[];
  records.forEach((r,i)=>{
    const c=Math.cos(r.yaw),s=Math.sin(r.yaw),p=(x,y)=>[r.position[0]+x*c,r.position[1]+y,r.position[2]-x*s];
    b.quad([p(-width/2,-height/2),p(width/2,-height/2),p(width/2,height/2),p(-width/2,height/2)],[s,0,c]);
    const [u0,v0,u1,v1]=tiles[i].uv;
    uv.push(u0,v0,u1,v0,u1,v1,u0,v1);
  });
  return {...b.finish(),uv:new Float32Array(uv)};
}
