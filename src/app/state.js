// App-layer state: everything the page holds, in one plain object. The car, optimiser and dynamic check live in the
// solver worker (ARCHITECTURE.md §10.1); S holds the UI parameters and the latest data the worker sent:
// T (track), disp (line snapshot), info (describeCar), prog (optimiser progress), dynRes (dynamic check).
import { genCtrl, genElev } from '../core/index.js';
import { CARS, TRACKS } from './presets.js';
import { Camera } from '../views/map2d/camera.js';
import { defaults } from './simple.js';

// A generated circuit's control points [x, y, z, u]: z its height (m) and u the generator's unit height (genElev), so
// z = hills·u while the Hills slider drives the heights. u is null once heights are set by hand or come from a saved
// run (the slider is then disabled until Revert shape). Only [x, y, z] goes to the solver and into run files.
export function circuit(seed,width,hills){const c=genCtrl(seed,width),u=genElev(seed,c);return c.map((p,i)=>[p[0],p[1],hills*u[i],u[i]]);}
export const hillsFollow=ctrl=>ctrl.every(p=>p[3]!=null);
const ctrl=circuit(TRACKS[0].seed,12,0);
export const S={
  P:{...CARS['GT racer']}, info:null,
  // the car is built from these (S.P = carFor(simple, manual), simple.js): a base car and knob positions, with the fields
  // set by hand on top
  simple:defaults('GT racer'), manual:{},
  trackIdx:0, width:12, hills:0 /* m from lowest to highest point */, ctrl, origCtrl:ctrl.map(p=>p.slice()), sel:-1 /* control point selected while editing */, fitPending:false,
  T:null, refT:0, refV:null, disp:null, prog:null, ghost:null, corners:[],
  running:false /* mirrors the worker's, from its progress events */, colorMode:'speed', tagMode:'speed' /* map tags: off, speed, g, grip */, deltaMode:'time' /* telemetry with a ghost: time, place (live) or max (lap maxima) */, replay:4, animT:0, editing:false, follow:false, followZ:7 /* closest follow zoom, px/m */, frameErr:null,
  hist:[], pal:null /* {colors, ramp} from the page's CSS */, cam:new Camera(), carPos:-1, carV:0,
  // '2d' or '3d'; in 3D the 2D map is a corner inset drawn with camMini (fitted edge to edge: no overlays sit on it), and
  // cam keeps its framing for the way back
  view:'2d', cam3d:{mode:'overview',state:null}, scene3d:null, view3dMsg:null, camMini:Object.assign(new Camera(),{pads:()=>({padT:8,padB:8,padX:8})}),
  traceShow:'lap', traceDirty:false, reducedMotion:false /* prefers-reduced-motion (R9), kept current by main.js */,
  dynRes:null, dynStale:false, dynRunning:false,
};
export const $=s=>document.querySelector(s);
