// Semantic angles from attitude.js, applied after placeCar's yaw and grade.
export function applyAttitude(group,a){
  if(!group)return;
  group.rotation.x=-(a?.roll??0);group.rotation.z+=a?.pitch??0;
  for(const child of group.children){
    if(!child.name.startsWith('wheel'))continue;
    child.rotation.y=child.name[5]==='F'?-(a?.steer??0):0;
    child.children[0].rotation.z=-(a?.spin??0);
  }
}
