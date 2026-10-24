// 2D map camera: world metres ↔ canvas CSS pixels. The screen is y-down (ARCHITECTURE.md §2). (x, y) is the world
// point at the canvas centre, z the scale in px per metre; cw, ch the canvas size in CSS px, dpr its pixel ratio.
export class Camera{
  constructor(){this.x=0;this.y=0;this.z=1;this.cw=0;this.ch=0;this.dpr=1;}
  sx(x){return (x-this.x)*this.z+this.cw/2;}
  sy(y){return (y-this.y)*this.z+this.ch/2;}
  wx(sx){return (sx-this.cw/2)/this.z+this.x;}
  wy(sy){return (sy-this.ch/2)/this.z+this.y;}
  // Match the canvas backing store to its box (rect, CSS px) at the device pixel ratio, capped at 2.
  resize(canvas,rect,devicePixelRatio){this.dpr=Math.min(2,devicePixelRatio||1);this.cw=rect.width;this.ch=rect.height;canvas.width=Math.round(this.cw*this.dpr);canvas.height=Math.round(this.ch*this.dpr);}
  // Room left for the overlays, CSS px (more at the top and bottom on narrow screens).
  pads(){const narrow=this.cw<560;return {padT:narrow?150:40,padB:narrow?70:40,padX:narrow?20:60};}
  // Fit the whole track, leaving room for the overlays.
  fit(T,width){
    let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(let i=0;i<T.N;i++){x0=Math.min(x0,T.cx[i]);x1=Math.max(x1,T.cx[i]);y0=Math.min(y0,T.cy[i]);y1=Math.max(y1,T.cy[i]);}
    const cw=this.cw,ch=this.ch,{padT,padB,padX}=this.pads();
    this.z=Math.min((cw-padX*2)/(x1-x0+width),(ch-padT-padB)/(y1-y0+width));
    this.x=(x0+x1)/2;this.y=(y0+y1)/2-((padT-padB)/2)/this.z;
  }
  // Follow framing: centre the points ({x, y} in metres) in the area clear of the overlays, at zoom zMax (the closest
  // the caller allows) or further out until every point sits at least margin px inside that area.
  frame(pts,zMax,margin){
    let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(const p of pts){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}
    const {padT,padB,padX}=this.pads(),aw=Math.max(1,this.cw-padX*2-margin*2),ah=Math.max(1,this.ch-padT-padB-margin*2);
    this.z=Math.max(0.05,Math.min(40,zMax,aw/(x1-x0),ah/(y1-y0)));
    this.x=(x0+x1)/2;this.y=(y0+y1)/2-((padT-padB)/2)/this.z;
  }
  // Zoom by f keeping the world point under screen (sx, sy) fixed.
  zoomAt(f,sx,sy){const wx=this.wx(sx),wy=this.wy(sy);this.z=Math.max(0.05,Math.min(40,this.z*f));this.x=wx-(sx-this.cw/2)/this.z;this.y=wy-(sy-this.ch/2)/this.z;}
}
