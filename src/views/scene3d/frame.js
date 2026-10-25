// Data (x,y,z) maps to three (X,Y,Z) = (x,z,y); heading maps to negative yaw.
// Frames use the horizontal plan tangent, not the grade; unbanked up is world vertical (0,1,0).
// Positive bank rotates lateral/up about the tangent by the right-hand rule, lowering the right (+n) edge,
// like attitude's positive roll. Thus a right-hand bend (k > 0) is banked with a negative angle.
export function dataToThree(x,y,z){return [x,z,y];}
export function yawFromHeading(h){return -h;}

// Packed XYZ Float64Arrays, three entries per station. bank is an optional per-station angle in radians.
export function stationFrames(T,bank){
  const origin=new Float64Array(3*T.N),tangent=new Float64Array(3*T.N);
  const lateral=new Float64Array(3*T.N),up=new Float64Array(3*T.N);
  for(let i=0;i<T.N;i++){
    const j=3*i,nx=T.nx[i],ny=T.ny[i],b=bank?.[i]??0,c=Math.cos(b),s=Math.sin(b);
    origin.set(dataToThree(T.cx[i],T.cy[i],T.z[i]),j);
    tangent.set(dataToThree(ny,-nx,0),j);
    lateral.set(dataToThree(nx*c,ny*c,b===0?0:-s),j);
    up.set(dataToThree(b===0?0:nx*s,b===0?0:ny*s,c),j);
  }
  return {origin,tangent,lateral,up};
}
