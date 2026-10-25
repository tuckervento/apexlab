// Hills past what the model is built for (elevation review E-M2) are flagged over the map: the Hills slider at its
// 40 m maximum stays quiet, alternating ±60 m set by hand warns, and going back to flat clears it.
export default async ({ run }) => run(`(async () => {
  const { S } = await import('/src/app/state.js'), c = await import('/src/app/controls.js');
  const q = s => document.querySelector(s), wait = ms => new Promise(r => setTimeout(r, ms)), checks = {}, seen = {};
  const warn = () => q('#warn').hidden ? '' : q('#warn').textContent;
  const hills = h => { const el = q('#f-hills'); el.value = h; el.dispatchEvent(new Event('input', { bubbles: true })); };
  hills(40); await wait(2500); seen.at40 = warn();
  checks.sliderMaxQuiet = !/Steeper hills/.test(seen.at40);
  S.ctrl.forEach((p, i) => { p[2] = i % 2 ? 60 : -60; p[3] = null; }); c.rebuildTrack(true); await wait(3000); seen.wild = warn();
  checks.handEditWarns = /^Steeper hills than the model is built for \\(a \\d+% grade and a \\d+ m crest or dip; it handles up to 25% and 50 m\\) — results may look odd/.test(seen.wild);
  S.ctrl.forEach(p => { p[2] = 0; }); c.rebuildTrack(true); await wait(2500); seen.flat = warn();
  checks.flatClears = !/Steeper hills/.test(seen.flat);
  return { allTrue: Object.values(checks).every(Boolean), checks, seen };
})()`);
