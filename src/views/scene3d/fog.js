// Camera-space depth matches three Fog and the far clipping plane. Caller owns out.
export function worldSize(position){
  let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
  for(let j=0;j<position.length;j+=3){x0=Math.min(x0,position[j]);x1=Math.max(x1,position[j]);z0=Math.min(z0,position[j+2]);z1=Math.max(z1,position[j+2]);}
  return Math.max(1,Math.hypot(x1-x0,z1-z0));
}

export function fogRange(position,size,view,out,e=1,base=0){
  const p=view.position,t=view.target,dx=t[0]-p[0],dy=t[1]-p[1],dz=t[2]-p[2],length=Math.hypot(dx,dy,dz);
  let depth=0;
  for(let j=0;j<position.length;j+=3)depth=Math.max(depth,((position[j]-p[0])*dx+(base+(position[j+1]-base)*e-p[1])*dy+(position[j+2]-p[2])*dz)/length);
  // Leave room to fade on small circuits in car cameras as well as fitted overviews.
  out.far=Math.min(view.far,2*size);
  out.near=Math.min(depth+0.1*(out.far-depth),0.99*out.far);
  return out;
}
