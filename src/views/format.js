// Display formatting shared by views and app.
export function fmtTime(t){if(!isFinite(t))return '–:––.–––';const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(3);}
// Signed difference with a true minus sign: +0.123 / −0.123; unsigned when it rounds to zero (no −0.00).
export function fmtDelta(x,digits){const s=Math.abs(x).toFixed(digits);return (+s===0?'':x<0?'−':'+')+s;}
