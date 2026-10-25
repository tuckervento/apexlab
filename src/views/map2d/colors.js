// Palette for the canvas views, read from the page's CSS custom properties (so it follows light/dark themes).
// Returns {colors, ramp, elev}: named colours, a 32-step speed ramp through --s0, --s1, --s2, and a 16-step height ramp
// from --elev0 (low) to --elev1 (high) for the track surface on hilly circuits.
function hexRgb(h){h=h.trim().replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h.slice(0,6),16);return [n>>16&255,n>>8&255,n&255];}
export function readColors(root){const cs=getComputedStyle(root),g=k=>cs.getPropertyValue(k).trim();
  const colors={paper:g('--paper'),ink:g('--ink'),muted:g('--muted'),rule:g('--rule'),grid:g('--grid'),grid2:g('--grid2'),track:g('--track'),edge:g('--edge'),kerb:g('--kerb'),kerb2:g('--kerb2'),accent:g('--accent'),ghost:g('--ghost'),
    s:[hexRgb(g('--s0')),hexRgb(g('--s1')),hexRgb(g('--s2'))],s0:g('--s0'),s1:g('--s1'),s2:g('--s2'),mono:g('--mono'),display:g('--display')};
  colors.sky3d=g('--sky3d');
  const ramp=[];for(let i=0;i<32;i++){const t=i/31,[a,b,u]=t<0.5?[colors.s[0],colors.s[1],t*2]:[colors.s[1],colors.s[2],(t-0.5)*2];ramp.push(`rgb(${a.map((c,j)=>Math.round(c+(b[j]-c)*u)).join(',')})`);}
  const e0=hexRgb(g('--elev0')),e1=hexRgb(g('--elev1')),elev=[];for(let i=0;i<16;i++){const t=i/15;elev.push(`rgb(${e0.map((c,j)=>Math.round(c+(e1[j]-c)*t)).join(',')})`);}
  return {colors,ramp,elev};
}
