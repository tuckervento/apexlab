// App-layer state: everything the page holds, in one plain object. The car, optimiser and dynamic check live in the
// solver worker (ARCHITECTURE.md §10.1); S holds the UI parameters and the latest data the worker sent:
// T (track), disp (line snapshot), info (describeCar), prog (optimiser progress), dynRes (dynamic check).
import { genCtrl } from '../core/index.js';
import { CARS, TRACKS } from './presets.js';
import { Camera } from '../views/map2d/camera.js';

const ctrl=genCtrl(TRACKS[0].seed,12);
export const S={
  P:{...CARS['GT racer']}, info:null,
  trackIdx:0, width:12, ctrl, origCtrl:ctrl.map(p=>p.slice()), fitPending:false,
  T:null, refT:0, refV:null, disp:null, prog:null, ghost:null, corners:[],
  running:true, colorMode:'speed', tagMode:'speed' /* map tags: off, speed, g, grip */, deltaMode:'time' /* telemetry Δ: time, place */, replay:4, animT:0, editing:false, follow:false, followZ:7 /* closest follow zoom, px/m */, frameErr:null,
  hist:[], pal:null /* {colors, ramp} from the page's CSS */, cam:new Camera(), carPos:-1, carV:0,
  dynRes:null, dynStale:false, dynRunning:false,
};
export const $=s=>document.querySelector(s);
