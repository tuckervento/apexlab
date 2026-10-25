export const WHEEL_SPOKES=4;

// Displayed frames are modelled at 60 Hz; replay scales wheel travel between them.
// The static disc can stay on under reduced motion: it adds no motion of its own.
export function wheelBlurred(speed,radius,replay,{spokes=WHEEL_SPOKES,frameDt=1/60}={}){
  return speed>0&&radius>0&&replay>0&&spokes>0&&frameDt>0&&speed/radius*replay*frameDt>Math.PI/spokes;
}

export function applyWheelBlur(group,blurred){
  if(!group)return;
  for(const pivot of group.children){
    if(!pivot.name.startsWith('wheel'))continue;
    const spin=pivot.children[0];
    spin.getObjectByName('wheelFace').visible=!blurred;
    spin.getObjectByName('wheelBlur').visible=!!blurred;
  }
}
