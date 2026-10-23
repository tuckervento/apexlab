// Display formatting shared by views and app.
export function fmtTime(t){if(!isFinite(t))return '–:––.–––';const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(3);}
