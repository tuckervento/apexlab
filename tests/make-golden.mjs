// Generates tests/golden.json: for every car preset × circuit, the line converged from the centreline (the fixture),
// its exact lap, optimiser effort, and the dynamic check on it; plus skidpad results. All values are bit-exact for the
// runtime that produced them (recorded in meta).
//
//   node tests/make-golden.mjs              compute and print a summary only
//   node tests/make-golden.mjs --write      ...and overwrite tests/golden.json (review the diff before committing)
//   node tests/make-golden.mjs --out <path> ...and write to <path> instead
//
// Each combo converges in its own child process (11–190 s each); the whole run takes about 5 minutes.
import { fork, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadCore, setupPreset, coreSource } from './load-core.mjs';
import { GOLDEN_PATH, SKIDPAD, comboKey, clampedZeros, dynSummary, skidpad } from './golden-util.mjs';

const MAX_STEPS = 5e6, SELF = fileURLToPath(import.meta.url), REPO = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);

function runCombo(carName, trackIdx) {
  const core = loadCore(), track = core.TRACKS[trackIdx];
  const { T, B, car } = setupPreset(core, carName, { seed: track.seed }), N = T.N;
  const off = clampedZeros(B, N), centreLap = core.lapEval(T, car, off, core.makeScratch(N));
  const opt = new core.Optimizer(), t0 = performance.now();
  opt.setup(T, car, B, off);
  let steps = 0;
  while (!opt.converged) {
    if (steps >= MAX_STEPS) throw new Error(`${carName} | ${track.name}: not converged after ${steps} steps (evals ${opt.evals})`);
    opt.step(); steps++;
  }
  const secs = (performance.now() - t0) / 1000;
  return { car: carName, track: track.name, secs, golden: { N, centreLap, evals: opt.evals, steps, ...dynSummary(core, T, car, off), off: Array.from(off) } };
}

// exit only once the message is flushed: exiting straight after send() can drop it
if (argv[0] === '--job') process.send(runCombo(argv[1], +argv[2]), () => process.exit(0));
else await main();

async function main() {
  const out = argv[0] === '--write' ? GOLDEN_PATH : argv[0] === '--out' ? argv[1] : null;
  if (argv.length && !out) throw new Error(`Usage: node tests/make-golden.mjs [--write | --out <path>]; got ${argv.join(' ')}`);

  const core = loadCore(), jobs = [];
  for (const car of Object.keys(core.CARS)) for (let t = 0; t < core.TRACKS.length; t++) jobs.push([car, t]);
  const runJob = ([car, t]) => new Promise((resolve, reject) => {
    let res = null;
    const child = fork(SELF, ['--job', car, String(t)]);
    child.on('message', m => { res = m; });
    child.on('exit', code => code === 0 && res ? resolve(res) : reject(new Error(`job ${car} | ${core.TRACKS[t].name} exited with code ${code}`)));
  });

  const results = [], queue = jobs.slice(), t0 = performance.now();
  await Promise.all(Array.from({ length: Math.max(1, availableParallelism() - 1) }, async () => {
    while (queue.length) { const r = await runJob(queue.shift()); results.push(r); console.log(`  ${r.car} | ${r.track}: lap ${r.golden.lap.toFixed(4)} s, frac ${r.golden.frac.toFixed(4)}, umax ${r.golden.umax.toFixed(3)}, evals ${r.golden.evals}, ${r.secs.toFixed(0)} s`); }
  }));

  const skid = {};
  for (const fr of SKIDPAD.fracs) skid[fr] = skidpad(core, SKIDPAD.car, fr);
  console.log(`skidpad (${SKIDPAD.car}): ` + SKIDPAD.fracs.map(fr => `${fr}: mean|e| ${skid[fr].meanE.toFixed(3)} m`).join(', '));

  const git = cmd => execSync(cmd, { cwd: REPO, encoding: 'utf8' }).trim();
  const meta = {
    node: process.version, v8: process.versions.v8, commit: git('git rev-parse HEAD'), dirty: git('git status --porcelain') !== '',
    date: new Date().toISOString(), trackGen: 1, sourceSha256: coreSource().sha256,
  };
  console.log(`all ${results.length} combos in ${((performance.now() - t0) / 1000).toFixed(0)} s; Node ${meta.node}, V8 ${meta.v8}, commit ${meta.commit.slice(0, 7)}${meta.dirty ? ' (dirty)' : ''}`);
  if (!out) return;

  // One combo per line so a regenerated file diffs per combo. JSON numbers round-trip doubles exactly.
  const order = new Map(jobs.map(([c, t], i) => [comboKey(c, core.TRACKS[t].name), i]));
  const combos = results.map(r => [comboKey(r.car, r.track), r.golden]).sort((a, b) => order.get(a[0]) - order.get(b[0]));
  const text = `{"meta":${JSON.stringify(meta)},\n"skidpad":${JSON.stringify({ car: SKIDPAD.car, results: skid })},\n"combos":{\n` +
    combos.map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n') + '\n}}\n';
  writeFileSync(out, text);
  console.log(`wrote ${out} (${(text.length / 1024).toFixed(0)} KB)`);
}
