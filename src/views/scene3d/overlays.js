import { dataToThree } from './frame.js';

export function cornerAnchor(T,c,margin=3){
  const i=c.apex,o=-c.sign*(T.width/2+margin);
  return dataToThree(T.cx[i]+T.nx[i]*o,T.cy[i]+T.ny[i]*o,T.z[i]);
}
