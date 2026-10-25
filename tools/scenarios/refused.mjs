// A car and a circuit the worker refuses (review L4): the panel goes back to what the worker holds, a note says why,
// and the search keeps running. Expect the two refusals among the console errors ("solver: …"), nothing else.
export default async ({ run }) => run(`(async () => {
  const { S } = await import('/src/app/state.js'), c = await import('/src/app/controls.js');
  const q = s => document.querySelector(s), wait = ms => new Promise(r => setTimeout(r, ms));
  const car = () => ({ mass: S.P.mass, slider: +q('#f-mass').value, running: S.running, note: q('#carRefused').hidden ? null : q('#carRefused').textContent });
  const r = { boot: car() };
  S.P.mass = 0; c.carChanged(); await wait(1500); r.refusedCar = car();
  const n = S.ctrl.length, first = S.ctrl[0].slice(), rev = S.T.trackRev;
  S.ctrl = S.ctrl.map(() => [50, 50, 0, null]); c.rebuildTrack(true); await wait(1500);
  r.refusedTrack = { restored: S.ctrl.length === n && S.ctrl[0].every((x, i) => x === first[i]), sameTrack: S.T.trackRev === rev,
    running: S.running, note: q('#trackRefused').hidden ? null : q('#trackRefused').textContent };
  return r;
})()`);
