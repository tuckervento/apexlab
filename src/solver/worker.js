// Web Worker adapter for Solver (ARCHITECTURE.md §10.1): commands in through onmessage, events out through
// postMessage (arrays transferred). While the solver has work it runs back-to-back slices, yielding between them
// through a MessageChannel so commands are handled promptly (setTimeout would clamp to ≥4 ms); otherwise it idles
// until the next command. Solver catches its own exceptions and reports them as {type:'error'} events.
import { Solver } from './solver.js';

const SLICE_MS=15,solver=new Solver((ev,transfer)=>postMessage(ev,transfer||[])),ch=new MessageChannel();
let scheduled=false;
const schedule=()=>{if(!scheduled){scheduled=true;ch.port2.postMessage(0);}};
ch.port1.onmessage=()=>{scheduled=false;if(solver.tick(SLICE_MS))schedule();};
onmessage=e=>{solver.handle(e.data);schedule();};
