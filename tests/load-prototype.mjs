// Loads the frozen prototype's physics: extracts the CORE and DYN blocks (and the CARS/TRACKS presets) from
// prototype/apex-lab.html and evaluates them in a fresh VM context, exactly as the page runs them.
// Used only by parity.test.mjs, which checks the src/ modules against it bit for bit.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const DEFAULT_HTML = fileURLToPath(new URL('../prototype/apex-lab.html', import.meta.url));
const MARKERS = ['// ===== CORE START', '// ===== CORE END', '// ===== DYN START', '// ===== DYN END'];
const DOM = /\b(document|window|requestAnimationFrame|localStorage)\b/;
const EXPORTS = ['genCtrl', 'buildTrack', 'makeBounds', 'buildCar', 'makeScratch', 'lapEval', 'Optimizer', 'STAGES',
  'mulberry32', 'dynSetup', 'dynNominal', 'dynLap', 'DynCheck', 'DYN', 'CARS', 'TRACKS'];

function markerLine(lines, marker) {
  const hits = [];
  lines.forEach((l, i) => { if (l.trim() === marker) hits.push(i); });
  if (hits.length !== 1) throw new Error(`Expected marker "${marker}" exactly once, found ${hits.length}`);
  return hits[0];
}

function anchorLine(lines, prefix) {
  const hits = [];
  lines.forEach((l, i) => { if (l.startsWith(prefix)) hits.push(i); });
  if (hits.length !== 1) throw new Error(`Expected a line starting "${prefix}" exactly once, found ${hits.length}`);
  return hits[0];
}

export function loadPrototype(htmlPath = DEFAULT_HTML) {
  const { parts } = extract(htmlPath);
  const ctx = vm.createContext({});
  for (const p of parts) new vm.Script(p.code, { filename: htmlPath, lineOffset: p.lineOffset }).runInContext(ctx);
  return new vm.Script(`({${EXPORTS.join(',')}})`, { filename: 'load-prototype:exports' }).runInContext(ctx);
}

function extract(htmlPath) {
  const lines = readFileSync(htmlPath, 'utf8').split('\n');
  const [cs, ce, ds, de] = MARKERS.map(m => markerLine(lines, m));
  if (!(cs < ce && ce < ds && ds < de)) throw new Error(`Markers out of order: CORE ${cs + 1}-${ce + 1}, DYN ${ds + 1}-${de + 1}`);

  // a block is the lines strictly between its markers; lineOffset = marker index + 1 keeps stack traces on HTML lines
  const block = (start, end, name) => {
    const code = lines.slice(start + 1, end).join('\n');
    const m = code.match(DOM);
    if (m) throw new Error(`${name} block references "${m[0]}"; it must stay DOM-free`);
    return { code, lineOffset: start + 1 };
  };
  const pc = anchorLine(lines, 'const CARS={'), pt = anchorLine(lines, 'const TRACKS=[');
  if (pt < pc) throw new Error('Presets: "const TRACKS=[" found before "const CARS={"');
  const parts = [
    block(cs, ce, 'CORE'),
    block(ds, de, 'DYN'),
    { code: lines.slice(pc, pt + 1).join('\n'), lineOffset: pc },
  ];
  return { parts };
}
