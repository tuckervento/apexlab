// A car and a circuit the worker refuses (review L4): the panel goes back to what the worker holds, a note says why,
// and the search keeps running. Expect the two refusals among the console errors ("solver: …"), nothing else.
export const options = {expectedConsoleErrors: [/^solver: carSpec: mass must be > 0, got 0$/,
  /^solver: buildTrack: the circuit is shorter than the track is wide \(\d+(?:\.\d+)?(?:e[+-]?\d+)? m < 12 m\): are the control points all in one place\?$/]};

export default async ({ run }) => run(`(async () => {
  const { S } = await import('/src/app/state.js'), c = await import('/src/app/controls.js'), { send, settled } = await import('/src/app/client.js');
  const q = s => document.querySelector(s), until = performance.now() + 60000;
  const wait = async f => { while (!f() && performance.now() < until) await new Promise(r => requestAnimationFrame(r)); return !!f(); };
  const car = () => ({ mass: S.P.mass, slider: +q('#f-mass').value, running: S.running, note: q('#carRefused').hidden ? null : q('#carRefused').textContent });
  if (!await wait(settled)) throw new Error('precondition: initial car and circuit did not settle');
  const prog = S.prog; send({ type: 'run', fresh: true });
  if (!await wait(() => S.prog !== prog && S.running)) throw new Error('precondition: fresh search did not start');
  const seen = { before: car() };
  S.P.mass = 0; q('#f-mass').value = 0; c.carChanged();
  await wait(() => !q('#carRefused').hidden); seen.car = car();
  const n = S.ctrl.length, first = S.ctrl[0].slice(), rev = S.T.trackRev;
  seen.beforeTrack = { n, first, rev };
  S.ctrl = S.ctrl.map(() => [50, 50, 0, null]); c.rebuildTrack(true);
  await wait(() => !q('#trackRefused').hidden);
  seen.track = { n: S.ctrl.length, first: S.ctrl[0].slice(), rev: S.T.trackRev,
    running: S.running, note: q('#trackRefused').hidden ? null : q('#trackRefused').textContent };
  const checks = {
    massRestored: seen.car.mass === seen.before.mass,
    sliderRestored: seen.car.slider === seen.before.slider && seen.car.slider === seen.before.mass,
    carNote: !!seen.car.note && seen.car.note.includes('mass') && seen.car.note.includes('> 0'),
    carRunning: seen.car.running === true,
    ctrlCountRestored: seen.track.n === n,
    ctrlFirstRestored: seen.track.first.length === first.length && seen.track.first.every((x, i) => x === first[i]),
    trackRevUnchanged: seen.track.rev === rev,
    trackNote: !!seen.track.note && seen.track.note.includes('circuit') && seen.track.note.includes('all in one place'),
    trackRunning: seen.track.running === true
  };
  return { allTrue: Object.values(checks).every(Boolean), checks, seen };
})()`);
