// Scale about the ground so the horizon stays put.
export function scaledHeight(z,e,base){return base+(z-base)*e;}
export function scaledPitch(pitch,e){return e===1?pitch:Math.atan(e*Math.tan(pitch));}
