// Simple controls (docs/simple-controls.md, step 2), driven through the panel's own inputs: presets give the same car in
// both pages, knobs move the car, Advanced edits grey the knobs they take over and ↺ gives them back, an EV hides the
// gearbox, a refused car brings back the knobs too, and Reset centres everything. Every check should be true; expect
// one "solver: carSpec: mass …" console error from the refusal.
export default async ({ run }) => run(`(async () => {
  const { S } = await import('/src/app/state.js'), c = await import('/src/app/controls.js'), { CARS } = await import('/src/app/presets.js');
  const q = s => document.querySelector(s), wait = ms => new Promise(r => setTimeout(r, ms)), checks = {}, seen = {};
  const same = (a, b) => Object.keys(b).every(k => Object.is(a[k], b[k]));
  const input = (sel, v) => { const el = q(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const pick = v => { const el = q('#carPreset'); el.value = v; el.dispatchEvent(new Event('change')); };
  const mode = m => q('#carMode [data-v="' + m + '"]').click();

  checks.bootsSimple = S.carMode === 'simple' && !q('#simpleFields').hidden && q('#carFields').hidden && same(S.P, CARS['GT racer']);
  checks.presetsIdenticalBothPages = true;
  for (const n of Object.keys(CARS)) {
    pick(n); await wait(400);
    const simpleText = q('#derived').textContent; mode('advanced'); await wait(50);
    const ok = same(S.P, CARS[n]) && q('#derived').textContent === simpleText && +q('#f-mass').value === CARS[n].mass;
    mode('simple'); if (!ok) { checks.presetsIdenticalBothPages = false; seen.presetFail = n; }
  }
  pick('GT racer'); await wait(400);
  input('#kf-weight', 10); await wait(300);
  checks.weightKnob = S.P.mass === CARS['GT racer'].mass * 1.1 && q('#ko-weight').textContent.includes(Math.round(S.P.mass) + ' kg');
  seen.weightOut = q('#ko-weight').textContent;

  mode('advanced'); input('#f-mu', 1.9); await wait(200);
  checks.tyrePartial = S.manual.mu === 1.9 && !q('#kn-tyre').hidden && !q('#k-tyre').classList.contains('off');
  input('#f-sens', 0.3); input('#f-slipPk', 7); await wait(200);
  checks.tyreGreyed = q('#k-tyre').classList.contains('off') && [...q('#ks-tyre').querySelectorAll('button')].every(b => b.disabled)
    && q('#carEdited').textContent.startsWith('3 fields');
  mode('simple'); input('#kf-weight', -10); await wait(300);
  checks.handEditSurvivesKnob = S.P.mu === 1.9 && S.P.mass === CARS['GT racer'].mass * 0.9;
  q('#kn-tyre button')?.click(); await wait(300);
  checks.resetGivesBack = !('mu' in S.manual) && S.P.mu === CARS['GT racer'].mu && !q('#k-tyre').classList.contains('off');

  mode('advanced'); input('#f-vTopG', 250); await wait(200); mode('simple');
  checks.gearingNoteNoGrey = !q('#gearNote').hidden && ['weight', 'power', 'downforce'].every(k => !q('#k-' + k).classList.contains('off'));
  q('#gearNote button')?.click(); await wait(300);
  checks.gearingBack = q('#gearNote').hidden && !('vTopG' in S.manual);

  pick('EV saloon'); await wait(400);
  checks.evHidesGearbox = q('#k-gearbox').hidden;
  pick('Road car'); await wait(400);
  checks.iceShowsGearbox = !q('#k-gearbox').hidden;

  input('#kf-power', 20); await wait(400); const kept = { simple: JSON.stringify({ ...S.simple, base: S.simple.base.name }), P: { ...S.P } };
  S.manual = { mass: 0 }; S.P = { ...S.P, mass: 0 }; c.carChanged(); await wait(1500); // what an Advanced edit past the limits would send
  checks.refusedRestoresKnobs = JSON.stringify({ ...S.simple, base: S.simple.base.name }) === kept.simple && !('mass' in S.manual)
    && same(S.P, kept.P) && +q('#kf-power').value === 20 && !q('#carRefused').hidden;

  q('#simpleReset').click(); await wait(400);
  checks.resetToBase = same(S.P, CARS['Road car']) && Object.keys(S.manual).length === 0 && +q('#kf-power').value === 0;
  // a loaded run whose car is no preset becomes the base, knobs centred, the car exactly the file's
  const run = await (await fetch('/tests/fixtures/run-v1-gt-harrow.apexlab.json')).json(); run.car.mass = 1234;
  q('#loadRun').click(); const dt = new DataTransfer(); dt.items.add(new File([JSON.stringify(run)], 'heavy-gt.apexlab.json'));
  q('#runFile').files = dt.files; q('#runFile').dispatchEvent(new Event('change')); await wait(3000);
  const sel = q('#carPreset'); seen.loadedAs = sel.selectedOptions[0]?.textContent;
  checks.loadedRunIsBase = sel.value === 'loaded' && seen.loadedAs === 'Loaded: heavy-gt' && same(S.P, run.car)
    && Object.keys(S.manual).length === 0 && +q('#kf-weight').value === 0;
  input('#kf-weight', 10); await wait(300);
  checks.knobsOnLoadedBase = S.P.mass === 1234 * 1.1;
  return { allTrue: Object.values(checks).every(Boolean), checks, seen };
})()`);
