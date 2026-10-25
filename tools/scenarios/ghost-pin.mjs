// Pin and a circuit change (review L5): a pin while a hilly circuit is still building pins nothing and the button is
// disabled; once it lands, Pin works again and the ghost carries the new track revision.
export default async ({ run }) => run(`(async () => {
  const { S } = await import('/src/app/state.js'), c = await import('/src/app/controls.js');
  const q = s => document.querySelector(s), pin = q('#pinBtn'), wait = ms => new Promise(r => setTimeout(r, ms));
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  const r = { before: { disabled: pin.disabled, trackRev: S.disp.trackRev } };
  S.hills = 40; for (const p of S.ctrl) p[2] = S.hills * p[3]; S.ghost = null; c.updGhostUI(); c.rebuildTrack(true);
  pin.click(); await frame(); await frame();
  r.building = { disabled: pin.disabled, pinned: !!S.ghost, shown: S.disp.trackRev };
  await wait(3000);
  r.landed = { disabled: pin.disabled, shown: S.disp.trackRev };
  pin.click(); r.pinned = { ghostTrackRev: S.ghost && S.ghost.trackRev, shown: S.disp.trackRev };
  return r;
})()`);
