// Stage layout (docs/plans/3d/PLAN.md 1.6): the 2D/3D toggle puts #view3d over the whole stage and shrinks the 2D map to a corner
// inset drawn with S.camMini; S.cam comes back untouched; Edit forces 2D; at 390 px the inset clears the zoom buttons and
// the lap readout. Every check should be true.
//
// 2D unchanged: with 3D never toggled, the page must be byte-identical to main's. The scenario first freezes the page
// (solver paused on the centreline lap, replay paused at a fixed animT, the camera fitted, the search history and lap
// count blanked, DPR 1) and screenshots it at 1280×800 and 390×844. VIEW_TOGGLE_SAVE=<prefix> writes <prefix>-1280.png
// and <prefix>-390.png and stops (run it from a checkout of main: cdp.mjs serves the tree it is started in);
// VIEW_TOGGLE_BASELINE=<prefix> compares against them byte for byte:
//   git worktree add /tmp/apex-main main
//   (cd /tmp/apex-main && VIEW_TOGGLE_SAVE=/tmp/main node "$OLDPWD/tools/cdp.mjs" "$OLDPWD/tools/scenarios/view-toggle.mjs")
//   VIEW_TOGGLE_BASELINE=/tmp/main node tools/cdp.mjs tools/scenarios/view-toggle.mjs
// The 3D toggle button itself is new pixels, so it is made invisible (visibility, not display: the zoom column keeps its
// layout) for those screenshots. Without VIEW_TOGGLE_BASELINE the comparison is skipped and says so.
import { readFileSync, writeFileSync } from 'node:fs';
import { diffPng } from '../shot.mjs';

export const options = {webgl:true};

const frames = 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))';

export default async ({ run, sleep, call }) => {
  const checks = {}, seen = {}, notes = {};
  const metrics = (width, height) => call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  // ---------- freeze the page into a state that doesn't depend on timing
  await metrics(1280, 800); await sleep(300);
  seen.freeze = await run(`(async () => {
    const { S } = await import('/src/app/state.js'), { send } = await import('/src/app/client.js');
    const q = s => document.querySelector(s), wait = ms => new Promise(r => setTimeout(r, ms));
    send({ type: 'pause' }); for (let i = 0; i < 100 && S.running; i++) await wait(50);
    const rev = S.disp.lineRev; send({ type: 'setLine' }); // the centreline: the same lap on every run
    for (let i = 0; i < 100 && S.disp.lineRev === rev; i++) await wait(50);
    await wait(300);
    q('#replaySeg [data-v="0"]').click(); S.animT = 3;
    S.hist = []; S.prog.evals = 0; // the search's history and lap count depend on how long it ran
    await document.fonts.ready;
    return { running: S.running, lineRev: S.disp.lineRev, lap: S.disp.t, status: q('#status').textContent };
  })()`);
  // the viewport, at desktop and phone width (the document scrolls by body's 8 px margin, and at phone width by the
  // panel below the stage; growing the viewport to capture beyond it would resize the stage and clear the map)
  const shots = {};
  await run(`(() => { const b = document.querySelector('#zView'); if (b) b.style.visibility = 'hidden'; })()`);
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    await metrics(w, h); await sleep(300); await run(`document.querySelector('#zFit').click()`); await run(frames);
    shots[w] = Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).result.data, 'base64');
  }
  await run(`(() => { const b = document.querySelector('#zView'); if (b) b.style.visibility = ''; })()`);
  await metrics(1280, 800); await sleep(300); await run(`document.querySelector('#zFit').click()`);
  const SAVE = process.env.VIEW_TOGGLE_SAVE, BASE = process.env.VIEW_TOGGLE_BASELINE; // path prefixes
  if (SAVE) { for (const w in shots) writeFileSync(`${SAVE}-${w}.png`, shots[w]); return { saved: SAVE, bytes: Object.fromEntries(Object.entries(shots).map(([w, b]) => [w, b.length])), seen }; }
  checks.frozen = !seen.freeze.running;
  if (BASE) for (const w in shots) {
    const base = readFileSync(`${BASE}-${w}.png`);
    checks['unchanged2d' + w] = base.equals(shots[w]); seen['bytes' + w] = { baseline: base.length, now: shots[w].length };
    // On a mismatch keep the evidence: the actual image next to the baseline, and how many pixels differ.
    if (!checks['unchanged2d' + w]) { const path = `${BASE}-${w}-actual-${Date.now()}.png`; writeFileSync(path, shots[w]);
      seen['mismatch' + w] = { actual: path, fraction: await diffPng({ run }, base, shots[w], { threshold: 0 }) }; }
  } else notes.unchanged2d = 'skipped: set VIEW_TOGGLE_BASELINE=<prefix of the pngs saved on main> (see the header)';

  // ---------- toggling: #view3d fills the stage, #view becomes the inset, S.cam survives the round trip
  Object.assign(checks, await run(`(async () => {
    const { S } = await import('/src/app/state.js');
    const q = s => document.querySelector(s), frame = () => ${frames}, c = {};
    const rect = s => { const r = q(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    const camOf = k => ({ x: k.x, y: k.y, z: k.z }), same = (a, b) => Object.is(a.x, b.x) && Object.is(a.y, b.y) && Object.is(a.z, b.z);
    await frame();
    // the stage's padding box (inside its 1 px rule), which the absolutely placed canvases fill
    const sb = q('#stage'), sr = sb.getBoundingClientRect(), st = { x: sr.left + sb.clientLeft, y: sr.top + sb.clientTop, w: sb.clientWidth, h: sb.clientHeight };
    const near = (a, b) => ['x', 'y', 'w', 'h'].every(k => Math.abs(a[k] - b[k]) < 0.5);
    const cam0 = camOf(S.cam), seen = { stage: st, view2d: rect('#view') };
    c.bootsIn2d = S.view === '2d' && q('#view3d').hidden && near(rect('#view'), st);

    q('#zView').click(); for(let i=0;i<100&&!S.scene3d;i++)await new Promise(r=>setTimeout(r,50)); await frame();
    const v3 = rect('#view3d'), vi = rect('#view'), cv = q('#view'); Object.assign(seen, { view3d: v3, inset: vi, backing: [cv.width, cv.height], mini: { cw: S.camMini.cw, ch: S.camMini.ch } });
    c.toggleShows3d = S.view === '3d' && !q('#view3d').hidden && q('#zView').getAttribute('aria-pressed') === 'true';
    c.view3dAtStageSize = near(v3, st);
    const zoomBtns = ['#zIn', '#zOut', '#zFit', '#zFollow'].map(s => q(s));
    c.zoomOverviewIn3d = zoomBtns.every((b,i) => b.disabled === (i === 3)); // overview has Fit and zoom
    // the inset: a corner box well inside the stage, its backing store and S.camMini at its size, S.cam left alone
    c.viewAtInsetSize = vi.w < st.w / 2 && vi.h < st.h / 2 && vi.w > 100 && Math.abs(st.x + st.w - (vi.x + vi.w) - 16) < 0.5 && Math.abs(st.y + st.h - (vi.y + vi.h) - 16) < 0.5
      && cv.width === Math.round(vi.w * S.camMini.dpr) && S.camMini.cw === vi.w && S.camMini.ch === vi.h;
    c.miniFitted = S.camMini.z > 0 && S.camMini.z < S.cam.z && Math.abs(S.camMini.x - S.cam.x) < 400;
    const wheel = new WheelEvent('wheel', { deltaY: -300, clientX: vi.x + vi.w / 2, clientY: vi.y + vi.h / 2, bubbles: true, cancelable: true });
    const mini0 = camOf(S.camMini); cv.dispatchEvent(wheel); await frame();
    // (main.js sizes S.cam from #stage's border box, sr: 1 px wider than the canvas's box, as on main)
    c.camUntouchedIn3d = same(camOf(S.cam), cam0) && S.cam.cw === sr.width && same(camOf(S.camMini), mini0);

    cv.dispatchEvent(new MouseEvent('click', { bubbles: true })); await frame(); // a click on the inset goes back to 2D
    c.insetClickBackTo2d = S.view === '2d' && q('#view3d').hidden && near(rect('#view'), st) && cv.width === Math.round(sr.width * S.cam.dpr) && S.cam.cw === sr.width;
    c.camSameAfterRoundTrip = same(camOf(S.cam), cam0);
    c.zoomEnabledIn2d = zoomBtns.every(b => !b.disabled);
    q('#zView').click(); await frame(); q('#zView').click(); await frame(); // and through the toggle
    c.camSameAfterToggleRoundTrip = S.view === '2d' && same(camOf(S.cam), cam0);

    // Edit forces 2D (and 3D can't be chosen while editing)
    q('#zView').click(); await frame(); const was = S.view;
    q('#editBtn').click(); await frame();
    c.editForces2d = was === '3d' && S.view === '2d' && S.editing && q('#view3d').hidden && q('#zView').disabled;
    q('#editBtn').click(); await frame();
    c.editEndsWith3dAvailable = !S.editing && !q('#zView').disabled && S.view === '2d';
    return { c, seen };
  })()`).then(({ c, seen: s }) => { seen.desktop = s; return c; }));

  // ---------- phone width: the inset clears the zoom buttons and the lap readout (and the legend), at the stage's
  // usual height and at its 340 px minimum
  for (const h of [844, 520]) {
    await metrics(390, h); await sleep(300);
    const r = await run(`(async () => {
      const { S } = await import('/src/app/state.js'), q = s => document.querySelector(s);
      if (S.view !== '3d') q('#zView').click(); await ${frames};
      const R = s => { const r = q(s).getBoundingClientRect(); return { l: r.left, t: r.top + scrollY, r: r.right, b: r.bottom + scrollY }; };
      const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b, inset = R('#view');
      const out = { inset, stage: R('#stage'), zoom: R('.zoom'), lap: R('.lapblock'), legend: R('#legend') };
      out.clear = { zoom: !hit(inset, out.zoom), lap: !hit(inset, out.lap), legend: !hit(inset, out.legend) };
      out.inStage = inset.l >= out.stage.l && inset.r <= out.stage.r && inset.t >= out.stage.t && inset.b <= out.stage.b;
      q('#zView').click(); await ${frames};
      return out;
    })()`);
    seen['w390h' + h] = r;
    checks['phoneInsetClear' + h] = r.clear.zoom && r.clear.lap && r.clear.legend && r.inStage;
  }
  return { allTrue: Object.values(checks).every(Boolean), checks, notes, seen };
};
