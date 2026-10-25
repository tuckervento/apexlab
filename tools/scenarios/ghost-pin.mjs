// Pin and a circuit change (review L5): a pin while a hilly circuit is still building pins nothing and the button is
// disabled; once it lands, Pin works again and the ghost carries the new track revision.
export default async ({ run }) => run(`(async () => {
  const { S } = await import('/src/app/state.js'), c = await import('/src/app/controls.js'), { settled } = await import('/src/app/client.js');
  const pin = document.querySelector('#pinBtn'), until = performance.now() + 60000;
  const frame = () => new Promise(r => {
    const timer = setTimeout(() => { cancelAnimationFrame(id); r(false); }, Math.max(0, until - performance.now()));
    const id = requestAnimationFrame(() => { clearTimeout(timer); r(true); });
  });
  const poll = async f => { while (!f()) { if (performance.now() >= until || !await frame()) return false; } return true; };
  const checks = { booted: false, heldPending: false, pinDisabledWhilePending: false, pinNothingWhilePending: false,
    installed: false, pinEnabledAfter: false, pinsNewRevision: false }, seen = {};
  const result = () => ({ allTrue: Object.values(checks).every(Boolean), checks, seen });
  checks.booted = await poll(() => S.T && S.disp && S.T.trackRev === S.disp.trackRev && settled());
  if (!checks.booted) return result();
  const post = Worker.prototype.postMessage;
  let held = null;
  Worker.prototype.postMessage = function(...args) {
    if (args[0]?.type === 'setTrack') { held = { worker: this, args }; return; }
    return post.apply(this, args);
  };
  try {
    seen.before = { disabled: pin.disabled, trackRev: S.disp.trackRev };
    S.hills = 40; for (const p of S.ctrl) p[2] = S.hills * p[3]; S.ghost = null; c.updGhostUI(); c.rebuildTrack(true);
    await frame(); await frame();
    checks.heldPending = !!held && held.args[0].rev > seen.before.trackRev && S.disp.trackRev === seen.before.trackRev;
    checks.pinDisabledWhilePending = pin.disabled;
    pin.click(); checks.pinNothingWhilePending = S.ghost === null;
    seen.building = { heldRev: held?.args[0].rev, disabled: pin.disabled, pinned: !!S.ghost, shown: S.disp.trackRev };
    if (!held) return result();
    const rev = held.args[0].rev;
    post.apply(held.worker, held.args); held = null;
    checks.installed = await poll(() => S.T?.trackRev === rev && S.disp?.trackRev === rev && settled());
    if (!checks.installed) return result();
    await frame(); await frame();
    checks.pinEnabledAfter = !pin.disabled;
    pin.click(); checks.pinsNewRevision = !!S.ghost && S.ghost.trackRev === rev && S.ghost.trackRev === S.disp.trackRev;
    seen.landed = { disabled: pin.disabled, shown: S.disp.trackRev, trackRev: S.T.trackRev, ghostTrackRev: S.ghost?.trackRev };
    return result();
  } finally {
    Worker.prototype.postMessage = post;
    if (held) post.apply(held.worker, held.args);
  }
})()`);
