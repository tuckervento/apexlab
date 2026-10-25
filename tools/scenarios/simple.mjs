// The car panel (docs/simple-controls.md): one pane, each section's knobs above the sliders they set. Checks the layout,
// that presets come back exactly, that a knob moves the sliders under it, that slider edits grey the knobs they take
// over and ↺ gives them back, the EV gearbox, a refused car bringing back the knobs, Reset, and a loaded run becoming
// the base. Every check should be true; expect one "solver: carSpec: mass …" console error from the refusal.
export default async ({ run }) => run(`(async () => {
  const { S } = await import('/src/app/state.js'), c = await import('/src/app/controls.js'), { CARS } = await import('/src/app/presets.js');
  const q = s => document.querySelector(s), wait = ms => new Promise(r => setTimeout(r, ms)), checks = {}, seen = {};
  const same = (a, b) => Object.keys(b).every(k => Object.is(a[k], b[k]));
  const input = (sel, v) => { const el = q(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const pick = v => { const el = q('#carPreset'); el.value = v; el.dispatchEvent(new Event('change')); };
  const box = q('#carFields'), kids = [...box.children];

  seen.sections = kids.filter(e => e.tagName === 'H3').map(e => e.textContent);
  checks.sectionOrder = seen.sections.join() === 'Powertrain,Chassis,Aero,Tyres,Brakes';
  checks.knobsLeadTheirSection = kids.every((e, i) => e.tagName !== 'H3' || e.textContent === 'Brakes' || kids[i + 1].classList.contains('knobs'))
    && [['#k-power', '#f-power'], ['#k-weight', '#f-mass'], ['#k-balance', '#f-rollF'], ['#k-downforce', '#f-cla'], ['#k-tyre', '#f-mu']]
      .every(([k, f]) => q(k).compareDocumentPosition(q(f)) & Node.DOCUMENT_POSITION_FOLLOWING);
  checks.typeShownOnce = !q('#seg-pt') && !q('#seg-drive') && !!q('#ks-pt') && !!q('#ks-drive') && !q('#carMode');
  checks.bootIsBase = same(S.P, CARS['GT racer']) && q('#ks-tyre [data-v=base]').textContent === 'Base';

  checks.presetsIdentical = true;
  for (const n of Object.keys(CARS)) { pick(n); await wait(400); if (!(same(S.P, CARS[n]) && +q('#f-mass').value === CARS[n].mass)) { checks.presetsIdentical = false; seen.presetFail = n; } }
  pick('GT racer'); await wait(400);
  input('#kf-weight', 10); await wait(300);
  checks.knobMovesSliderBelow = S.P.mass === CARS['GT racer'].mass * 1.1 && +q('#f-mass').value === 1430 && q('#o-mass').textContent === '1430 kg'
    && q('#ko-weight').textContent === '+10 % · 1430 kg';

  input('#f-mu', 1.9); await wait(200);
  checks.tyrePartial = S.manual.mu === 1.9 && !q('#kn-tyre').hidden && !q('#k-tyre').classList.contains('off');
  input('#f-sens', 0.3); input('#f-slipPk', 7); await wait(200);
  checks.tyreGreyed = q('#k-tyre').classList.contains('off') && [...q('#ks-tyre').querySelectorAll('button')].every(b => b.disabled)
    && q('#carEdited').textContent.startsWith('3 fields');
  input('#kf-weight', -10); await wait(300);
  checks.handEditSurvivesKnob = S.P.mu === 1.9 && S.P.mass === CARS['GT racer'].mass * 0.9;
  q('#kn-tyre button')?.click(); await wait(300);
  checks.resetGivesBack = !('mu' in S.manual) && S.P.mu === CARS['GT racer'].mu && !q('#k-tyre').classList.contains('off');

  input('#f-vTopG', 250); await wait(200);
  checks.gearingNoteNoGrey = !q('#gearNote').hidden && ['weight', 'power', 'downforce'].every(k => !q('#k-' + k).classList.contains('off'));
  q('#gearNote button')?.click(); await wait(300);
  checks.gearingBack = q('#gearNote').hidden && !('vTopG' in S.manual);

  pick('EV saloon'); await wait(400);
  checks.evHidesGearbox = q('#k-gearbox').hidden && q('#f-evMax').closest('.field').hidden === false;
  pick('Road car'); await wait(400);
  checks.iceShowsGearbox = !q('#k-gearbox').hidden;

  input('#kf-power', 20); await wait(400); const kept = { simple: JSON.stringify({ ...S.simple, base: S.simple.base.name }), P: { ...S.P } };
  S.manual = { mass: 0 }; S.P = { ...S.P, mass: 0 }; c.carChanged(); await wait(1500); // what an edit past the physical limits would send
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
