# STATUS

_Last updated: 2026-10-25 (Wave F batch 2)_

## Snapshot

28 of 33 tasks done (Waves A–E, plus Wave F's 1.9, 2.1, 2.2, 2.4, 2.6, 3.5, 3.6, 5.3), all merged to `main`, with
the two batch 1 follow-ups (board backs, the tag in "Dynamic check" mode). On `main`, 414/414 tests pass and 20 of 21
scenarios exit 0, every reference at fraction 0; the exception is `view3d`'s `phoneSelector` (the camera selector no
longer fits a phone), which the layout job in progress fixes. `view-toggle` is byte-identical to pre-Wave-E `main` in 2D.
The 3D view has six cameras (overview, chase, heli, pair, Map, TV), attitude, height exaggeration, overlays and a trace
car. Next: the layout job, then Wave F batch 3 (2.3, 4.1, 4.3) on Q's go.

## Completed

Branches are listed with their commit; Claude-subagent branches live in `.claude/worktrees/agent-*`, Codex ones in
`../apexlab-wt/<id>`. "Verified" means re-run by the coordinator, not only the agent's report.

- [x] 0.1 `smoothPose` (Codex) — done 2026-10-24 — `3d/0.1` `017b4fc` — verified: `tests/smooth-pose.test.mjs` 4
  tests pass; full suite 267/267; `tests/playback.test.mjs` diff empty; teeth (linear in place of Hermite) failed the
  boundary-jump (0.389 rad) and 60 Hz (0.388 > 0.029) checks; max 60 Hz heading change 0.0266 vs bound 0.0284 rad.
- [x] 0.2 A11 trace heights (Claude Opus; Sonnet attempt blocked) — done 2026-10-24 —
  `worktree-agent-add1e1f07e2829301` `7948f65` — verified: full suite 266/266; `make-physics-version` "committed file is
  current", driver sha unchanged; golden/playback diffs empty; three new tests in `tests/elevation.test.mjs`; teeth: 4
  mutations (no interpolation, wrong segment, `z:0` in pose, lateral leak) each fail a test.
- [x] 0.3 vendor three.js 0.186.1 (Claude Opus) — done 2026-10-24 — `worktree-agent-ace2684247e79fd5f` `65bf59f` —
  verified: coordinator re-downloaded the tarball, sha512 = registry `dist.integrity`, vendored `three.core.js`,
  `three.module.js`, `LICENSE` byte-identical (`cmp`); `tests/vendor-three.test.mjs` 4 tests pass; full suite 267/267.
- [x] 0.5 headless WebGL2 + screenshot compare (Claude Sonnet) — done 2026-10-24 — `worktree-agent-abe963dfb64bf3214`
  `a58d188` — verified: `APEX_PORT=8771 APEX_DEBUG_PORT=9341 node tools/cdp.mjs tools/scenarios/webgl2.mjs` exit 0,
  renderer "ANGLE (… SwiftShader driver)", `EXT_clip_control: true`, diff identical 0 / 1 px shift 0.0117;
  `refused.mjs` exit 0.
- [x] 1.6 stage layout, 3D canvas + inset minimap (Claude Opus; Sonnet attempts blocked) — done 2026-10-24 —
  `worktree-agent-afeb5ccf91731d6ff` `d42e9ab` — verified: `VIEW_TOGGLE_BASELINE=<main baseline> node tools/cdp.mjs
  tools/scenarios/view-toggle.mjs` exit 0, `allTrue`, `unchanged2d1280`/`unchanged2d390` true (byte-identical to
  main); full suite 263/263.
- [x] 2.5 cosmetic attitude/steer/spin (Codex) — done 2026-10-24 — `3d/2.5` `7b0670c` — verified:
  `tests/scene3d-attitude.test.mjs` 4 tests pass; full suite 267/267; teeth: roll forcing sign reversed fails the
  peak-roll check.
- [x] 5.2 `traceClock` (Codex) — done 2026-10-24 — `3d/5.2` `f9158a7` — verified: `tests/trace-clock.test.mjs` 3 tests
  pass; full suite 266/266; teeth: no alignment subtraction / forced `ended:false` each fail.
- [x] 0.4 world-frame helper and station frames (Codex) — done 2026-10-25 — `3d/0.4` `20bde7f` — verified:
  `tests/scene3d-frame.test.mjs` 2 tests pass; full suite 283/283; coordinator's teeth (`[x,y,z]` in place of `[x,z,y]`
  in a copy of `frame.js`, test copy pointed at it) fail 2/2.
- [x] 5.1 `smoothPose` for traces (Codex) — done 2026-10-25 — `3d/5.1` `1970955` — verified:
  `tests/smooth-pose.test.mjs` 6 tests pass; full suite 283/283; golden/playback diffs empty; skidpad mean radius error
  at mid-samples 0.006 m smooth vs 0.488 m linear; coordinator's teeth (chord tangents, i.e. linear, in an `APEX_SRC`
  copy) fail the skidpad-midpoint test.
- [x] 1.1 track ribbon (Codex) — done 2026-10-25 — `3d/1.1` `cdbce90` — verified: full suite 293/293; coordinator's
  teeth (drop the seam quad) fail 8/8 ribbon tests.
- [x] 1.2 line ribbon and colour modes (Codex, one follow-up) — done 2026-10-25 — `3d/1.2` `1daf006` — verified: full
  suite 288/288; returns `{position, index}`; colours are linear RGB; coordinator's teeth: swapped pedal thresholds
  fail 2/3, no linear conversion fails 2/3.
- [x] 1.3 car model (Codex) — done 2026-10-25 — `3d/1.3` `0a2453c` — verified: full suite 288/288; axes match
  `frame.js` (+X forward, +Z right, `'YZX'` yaw then pitch); coordinator's teeth (FR at −Z) fail 2/3.
- [x] 1.4 orbit camera (Codex) — done 2026-10-25 — `3d/1.4` `72f5838` — verified: full suite 302/302; coordinator's
  teeth (fit distance halved) fail 16/17.
- [x] 1.5 chase camera (Codex, one follow-up to its tests) — done 2026-10-25 — `3d/1.5` `f8807b3` — verified: full
  suite 289/289; coordinator's teeth (ignore `input.sample`) fail 2/4, the cross-frame-rate comparison among them
  (0.95 m against a 1 cm tolerance).
- [x] 1.7 scene module (Codex; browser checks run by the coordinator) — done 2026-10-25 — `3d/1.7` `60e3293` (plus
  `e4031f2`, PLAN.md checkpoint) — verified:
  - `node tools/cdp.mjs tools/scenarios/scene3d.mjs` exits 0 twice, the second run comparing against the committed
    `tools/scenarios/ref/scene3d.png` (fraction 0). All 10 checks are true: depth `reversed`, 5066 triangles equal to
    the 5066 expected, geometries 9 over 300 frames and 5 rebuilds, theme stable, forced log depth, context
    lost/restored.
  - The reference image shows the circuit and speed-coloured line from the orbit view. A one-off chase render (not
    committed) shows the car's body, cabin and wheels on the line.
  - Coordinator's teeth: no `geometry.dispose()` makes the geometry count grow 10→14 (`rebuildsStable` false), and
    `setTrack` building nothing fails `triangles`, `reference` and `logFallback`.
  - Full suite 320/320 and all 8 scenarios exit 0.
- [x] 3.4 lighting, car-only shadow, themes (Codex) — done 2026-10-25 — `3d/3.4` `39cfb3f` — verified: suite 320/320;
  `theme3d.mjs` all true (geometry count and identity unchanged by the theme switch, shadow map on, only the car's
  meshes cast, shadow camera follows the car, background differs per theme); the chase render shows the car's shadow;
  coordinator's teeth (the ghost casts too) fail `carOnly`.
- [x] 3.3 kerbs (Codex) — done 2026-10-25 — `3d/3.3` `87f4870` — verified: suite 328/328; `kerbs.mjs` all true;
  red/white kerbs on the inside of the bend in the chase render; coordinator's teeth (kerbs on the outside) fail 8/8.
- [x] 3.1 ground plane and edge skirts (Codex, one follow-up) — done 2026-10-25 — `3d/3.1` `2979204` — verified: suite
  328/328; `world.mjs` all true; the horizon fades softly in both themes; coordinator's teeth (fog `far` past the
  camera's `far`) fail 8/8 at "full fog before camera clipping".
- [x] 3.2 start line, braking boards, corner signs (Codex, one follow-up) — done 2026-10-25 — `3d/3.2` `9a69972` —
  verified: suite 356/356; `markings.mjs` all true; boards and signs read as bordered panels on posts; coordinator's
  teeth (board distances without the lap wrap) fail 20/36.
- [x] 1.8 app integration (Codex; scenario timing fixed by the coordinator) — done 2026-10-25 — `3d/1.8` `5b8ca60` —
  verified: suite 320/320; `view3d.mjs` all true in 3 consecutive runs (lazy load, missing-WebGL2 fallback and
  reopen, overview/chase references, chase car moves on screen, Kart smaller, track change re-fits, paused render
  skip, context loss and reopen, button states per mode, Fit after a drag, 390 px layout); `view-toggle.mjs` all true
  with `unchanged2d1280`/`unchanged2d390` against a WebGL-mode `main` baseline; coordinator's teeth (3D Fit does
  nothing) fail `fitRestores`.
- Wave E on merged `main` (`12b9e71`, then `065b6c1` shadow fix and `0f4dd29` references): suite 372/372; all 13
  scenarios exit 0, every reference at fraction 0; `view-toggle` 2D byte-identical to pre-wave `main`;
  `git diff 251c0f5 HEAD` over physics, goldens, playback, `prototype/` and `vendor/` is empty.

- [x] 2.1 TV trackside camera (Codex) — done 2026-10-25 — `3d/2.1` `e518a88` — verified: suite 376/376; `tv3d.mjs` 20/20
  true (car inside the viewport, TV selected, zoom disabled, reference, on all four presets); coordinator's teeth
  (cameras on the inside of the bend) fail the placement test (Codex's: no hysteresis gives 600 cuts against 4).
- [x] 3.6 overlay parity (Codex) — done 2026-10-25 — `3d/3.6` `d7cc72b` — verified: suite 373/373; `overlay3d.mjs`
  14/14 true, including a real failure (default setup: `fr` 0.975 at station 69) for the marker and stale-clearing
  checks, and a drag through a label still orbiting; coordinator's teeth (screen Y flipped in `project`) fail only
  `overviewReference` (see Deviations).
- [x] 5.3 trace car in the 3D view (Codex; button class by the coordinator) — done 2026-10-25 — `3d/5.3` `0228691` —
  verified: suite 375/375; `trace3d.mjs` 14/14 true (aligned within ±1 station, sideslip β 0.048 rad at the fastest
  corner, "Dynamic check" hides the lap car and chase follows the trace, a car change hides the trace car and the
  control, Replay failure lands within 2 s before `tc[fail.at]`); coordinator's teeth (raw lap clock instead of
  `traceClock`) fail 1/3 trace tests.
- Wave F batch 1 on merged `main` (merges `ab28c03`, `5e31dc7`, `2e0215a`, `489711f`; references `d3ee86d`): suite
  382/382; all 17 scenarios exit 0, every reference at fraction 0, all 15 changed or new images reviewed;
  `git diff e9df824 HEAD` over physics, goldens, playback, `prototype/` and `vendor/` is empty.
- [x] 1.9 frame-time measurement (Codex, one follow-up; Q's hardware run) — done 2026-10-25 — `3d/1.9` `41af8ae`,
  headless numbers `0d1bbe8` — verified:
  - suite 374/374 on the branch; `perf3d.mjs` 9/9 true on the branch and on merged `main`; coordinator's teeth (running
    and idle buckets swapped) fail the window test;
  - Q's run on a MacBook Air, Chrome, mains power: running p50 16.7 ms and p95 17.4–17.6 ms in 2D, 3D overview, chase
    and TV, with 0 long tasks during a search. **P6 is not triggered; R10's 60 fps is met** (fewer than 5% of frames
    dropped at most). Recorded with the verdict in `investigations/3d-perf.md`.
- [x] Follow-ups "fu": plain board/sign backs; the 3D tag follows the shown car, "grip: lap model only" for the trace
  car (Q's choice) (Codex, one follow-up) — done 2026-10-25 — `3d/fu` `7fd6c30` — verified: suite 392/392;
  `markings.mjs` all true (pixel variance inside a board: 0 from behind, 80,620 from the front); `trace3d.mjs` 20/20
  (dynamic, lap, both and grip tag checks); coordinator's teeth (no grip case) fail 1/5 trace tests.
- [x] 2.6 cosmetic attitude on the cars (Codex, one follow-up) — done 2026-10-25 — `3d/2.6` `ada3d77` — verified: suite
  385/385; `attitude3d.mjs` 14/14 (outward roll and right steer mid right-hander, rear wheels straight, wheels spinning,
  frozen when paused, trace car steered by the recorded `steer`); coordinator's teeth (roll sign flipped) fail 1/3.
- [x] 2.2 heli and pair cameras (Codex) — done 2026-10-25 — `3d/2.2` `b0640f1` — verified: suite 389/389; `heli3d.mjs`
  11/11 (both cars inside the viewport in pair with a pinned ghost); coordinator's teeth (pair ignores the ghost) fail
  the NDC framing test.
- [x] 2.4 orthographic Map camera (Codex; scenario fixes by the coordinator) — done 2026-10-25 — `3d/2.4` `0aa82e2` —
  verified: suite 392/392; `ortho3d.mjs` 14/14 including `frozen` (projection within 1 px of the 2D map's fit at tilt 0,
  zoom, Fit, control visibility), references at fraction 0; coordinator's teeth (tilt ignored) fail the crest test.
- [x] 3.5 height exaggeration (Codex; scenario lookups by the coordinator) — done 2026-10-25 — `3d/3.5` `37bb66d` —
  verified: suite 384/384; `heights3d.mjs` all true (crest ×3, car on the scaled road, chase at 1×, shadow box covers
  the ground at 5×); coordinator's teeth: `fitShadow` without the scale fails `shadowGround`, and a theme switch that
  rebuilds the kerbs fails the repaired `themeStable`.
- Wave F batch 2 on merged `main` (merges `c375ee9`, `73be708`, `9cbfe49`, `ae1e757`, `bb6bc2c`; scenario fixes
  `742bc85`; references `1a3deaf`): suite 414/414; 20 of 21 scenarios exit 0 with every reference at fraction 0 (the
  exception: `view3d` `phoneSelector`); all 23 changed or new images reviewed; board backs measured rigid at 3×;
  `git diff 515ec30 HEAD` over physics, goldens, playback, `prototype/` and `vendor/` is empty.

## In Progress

- The 3D control layout (Q chose option A): `#camera3d` becomes a `<select>`, and the camera, trace, height and tilt
  controls stack in one bottom-left column; every scenario that picks a camera moves to the select, and `view3d`'s
  phone check asserts the new layout with every control visible. Codex job in `../apexlab-wt/layout` (`3d/layout`,
  from `1a3deaf`), started 2026-10-25. Batch 3 (2.3, 4.1, 4.3) follows on Q's go.

## Blocked


## Deviations & Decisions

- 2026-10-24: the plan file is `PLAN.md` (committed in `268d3f9`); its text still calls itself `PLAN-3D.md` in four
  places (the API revision checkpoints and tasks 0.3, 1.7, 1.8). Read those as `PLAN.md`.
- 2026-10-24: Wave A ran as one parallel cycle of 7 tasks (Q's request), not iterate-plan's one task per cycle.
- 2026-10-24: Sonnet 5.5 subagents were blocked 6 times by the API safeguard `[reasoning_extraction]` (0.2, 0.3, 1.6;
  rewording the prompts didn't help). The likely trigger is the DOING/EXPECT format Q's global CLAUDE.md requires. Q
  decided: Codex is the default subagent; Claude subagents run on Opus; the main session coordinates and reviews.
- 0.1: acceptance (a) is met at every station but the lap's final timestamp `tc[N]`, where `pose()` clamps to `t − 1e-6`
  and Hermite and linear differ by 2.2 µm. Accepted as met.
- 0.1: `ARCHITECTURE.md` §10.2 still says "Not yet: `pitch`"; `smoothPose` now gives pitch. Fix at merge.
- 0.2: PLAN's "between the heights of its station and the next" is loose. A sample's height comes from its observed
  segment, which is `st` or `st − 1` (about half the samples), and the test checks that. The height is also from one
  4 ms step before the sample's `x`/`y` (`observe` runs before `plantStep`): a few mm, invisible, but relevant to any
  exact `z`-vs-`x`/`y` comparison.
- 0.3: the "Importing three" Context paragraph in PLAN.md was corrected (on its branch). `three.module.js` imports in
  Node without a DOM (only `new WebGLRenderer()` throws); addons import the bare `'three'`, so any module that imports an
  addon can't load in Node.
- 0.5: options come from env (`APEX_PORT`, `APEX_DEBUG_PORT`, `APEX_WEBGL=1`) or a scenario's `export const options`;
  the compare helper is `tools/shot.mjs` (not inside `cdp.mjs`). No reference images committed yet.
- 1.6: "full-page screenshot" became viewport screenshots at 1280×800 and 390×844, with `#zView` set to
  `visibility:hidden` for the comparison (it's new pixels). The comparison needs a main baseline
  (`VIEW_TOGGLE_BASELINE`). `S.camMini` overrides `pads()` to 8 px.
- 2.5: sign conventions are defined in `attitude.js`'s header (roll > 0 leans right, so +ay gives negative roll; +ax
  raises the nose); 1.3 should adopt them. Codex added an optional `sample(tAnim)` for frame-rate independence.

- 2026-10-24: Wave A merged to `main` in the order 0.5, 0.3, 0.2, 0.1, 5.2, 2.5, 1.6 (`--no-ff`, one merge commit per
  task). Two `ARCHITECTURE.md` §10.2 conflicts, both resolved by keeping every bullet. The 0.1-vs-0.2 one was expected.
  The 5.2 one wasn't (the trial was clean): the merge of 0.1 also updated the "Not yet: `pitch`" line, which sits next
  to 5.2's insertion. The merged tree differs from the tested trial tree only in that doc line.
- 2026-10-24 (Q, on 1.6's questions):
  - (1) The inset's scale bar gets a `drawMap` option, in task 1.8 (added to its Scope in PLAN.md).
  - (2) The zoom buttons are disabled in 3D now: `setView` in `src/app/controls.js`, checked by `zoomDisabledIn3d` and
    `zoomEnabledIn2d` in `view-toggle.mjs` (teeth: removing the line fails `zoomDisabledIn3d`). 1.8 re-enables the ones
    with 3D meanings.
  - (3) A drag on the inset counting as a click is accepted.
- 2026-10-24: `.gitignore` added with `.claude/worktrees/` only (not all of `.claude/`, which may later hold project
  settings).

- 2026-10-25: Wave B ran as one parallel cycle of 2 Codex tasks (Q's request). It merged to `main` (`--no-ff`, 0.4 then
  5.1) with no conflicts, and the merged tree is identical to the tested trial tree.
- 0.4 resolved what PLAN.md left open:
  - Station frames use the **horizontal** plan tangent, not the grade.
  - Unbanked `up` is world vertical, three `(0, 1, 0)`.
  - Positive bank lowers the right (`+n`) edge, matching `attitude.js`'s roll, so a right-hand bend (k > 0) takes a
    negative bank.
  - Frames are packed `Float64Array`s, 3 per station.
  - The function is named `dataToThree(x, y, z) → [x, z, y]`.
  - The test uses a synthetic 3-station track; 1.1's mesh tests cover real presets.
- 5.1: trace Hermites are in **time**: the x/y tangents are the recorded body velocity rotated by `psi`, the `psi`
  tangent is `r`, and `z` tangents are time central differences of `tr.z`. A trace pose has `pitch` and `tangent` but
  still no `grade`. `smooth-pose.test.mjs`'s "trace input throws" assertion was replaced by trace tests.

- 2026-10-25: Wave C ran as one parallel cycle of 5 Codex tasks (Q's request). It merged to `main` (`--no-ff`, 1.1 to
  1.5 in order) with no conflicts; the code is identical to the tested trial tree. Corrections to PLAN.md carried in
  the prompts:
  1. 1.2's line ribbon is in **`src/views/scene3d/line.js`**, not `meshes.js`, to avoid an add/add conflict with 1.1.
  2. Each task has its own test file: `scene3d-meshes`, `-line`, `-car`, `-camera`, `-chase`.
  3. 1.3: **`cg` is the CG height in metres**, not a front–rear position. Axles come from `rear` (rear weight %),
     with the pose point at the CG: the front axle is `wb·rear/100` ahead of it and the rear axle `wb·(1−rear/100)`
     behind. The dims are `{wb, track, cg = 0.44, rear = 50}`, and the defaults cover a ghost's `{wb, track}`.
  4. 1.4's fit test builds its edges from `stationFrames`, not from `trackRibbon` (concurrent).
  5. The chase camera takes an optional `input.sample(tAnim) → pose` for each spring sub-step (as `attitude.js`
     does): an extension to the camera contract.
- Wave C interfaces for 1.7:
  - `trackRibbon(T, frames, {heightColors, pal}) → {position, normal, index, color?}`.
  - `lineRibbon(disp, {halfWidth, lift}) → {position, index}`, with 4 vertices per segment so colours don't blend
    across stations; `lineColors(disp, mode, pal) → Float32Array` (modes speed, pedal, util, ghost).
  - Vertex colours are **linear RGB** in both.
  - `buildCarModel(dims, {color, opacity})`, `placeCar(group, pose)`, `disposeCar(group)`. `userData.radius` is the
    cosmetic wheel radius, for `attitude.js`.
  - Both cameras' `view()` returns `{position, target, up, fovDeg, near, far}`.
  - Orbit exports `init`, `step`, `view`, `orbit`, `pan` and `zoom`. Its state also keeps `fovDeg`, `aspect` and
    `radius`.
  - Chase trails 8 m behind and 3 m up, uses a 1 m ground margin, and its `fovDeg` is fixed at 60. Its ground clamp
    uses the height at the car's station.
- Review findings sent back to Codex (Q approved):
  - 1.2 returned `positions` and sRGB, out of step with 1.1. It was renamed to `position` and converted to linear RGB.
  - 1.5's tests passed with a camera that ignored `sample`, because `input.car` was never updated and the only
    "behind" check used a pose that didn't move. The tests now update `input.car` every frame, and a moving-car bound
    is derived as `hypot(8, 3) + 2·vmax/8 + 2 m` (26.8 m flat; observed 24.6 m). The implementation was unchanged.

- 2026-10-25, 1.7:
  - **Codex can't run the headless driver.** In its `workspace-write` sandbox `serve.mjs` fails with
    `listen EPERM: operation not permitted 127.0.0.1:8774`. Codex reported it and marked the browser checks
    "DID NOT RUN" (correct); the coordinator ran them. Browser-verified tasks therefore split: Codex implements, the
    coordinator runs the scenarios.
  - **three's `reversedDepthBuffer` falls back to the *default* depth buffer** without `EXT_clip_control`, not to the
    log one (`three.module.js:2426`). `scene.js` checks the extension itself, and `forceLogDepth` tests the fallback.
  - three already flips `polygonOffset` for a reversed depth buffer (`three.module.js:10526`), so the line's negative
    offset is correct in both modes.
  - `frame()` isn't strictly allocation-free: `placeCar` → `dataToThree` makes two 3-element arrays per frame. Accepted;
    the rule is there to prevent GC pauses, and that's negligible.
  - `onLost` fires for both `webglcontextlost` and `webglcontextrestored`, so 1.8 must check `event.type`.
  - The API revision checkpoint was done by the coordinator, not by 1.7 (it needs plan-wide context): PLAN.md's
    Context now records the real API and the camera `input.sample` extension. The Scope lines of 2.6, 3.4, 3.5 and 3.6
    are updated (3.5 needs a new `setHeightScale`, 3.6 a new `project()`), and the four stale `PLAN-3D.md`
    self-references now read `PLAN.md`.
  - `CLAUDE.md`'s Views entry was rewritten by the coordinator for clarity.

- 2026-10-25: Wave E ran as one parallel cycle of 5 Codex tasks (Q's request). It merged to `main` (`--no-ff`, 3.1, 3.3,
  3.2, 3.4, then 1.8). Every `scene.js`/`scene3d.mjs`/`index.html`/`colors.js` conflict was keep-both by design; the
  coordinator also removed a duplicate `findCorners` import the 3.3 + 3.2 merge produced (a SyntaxError) and ordered
  `themeWorld()` after 3.4's background line in `setTheme`. Ownership splits given in the prompts (deviations from
  PLAN.md's literal text):
  1. **Corners come from inside the scene:** `setTrack` calls `findCorners(T)` (`map2d/map.js`, pure); there is no
     `setCorners` (PLAN offered it only as an "e.g.").
  2. **Tokens:** 3.1 owns `--ground3d` (ground and skirts), 3.4 owns `--sky3d` (background); fog copies the background.
  3. **`refreshColors` → `setTheme` wiring went to 1.8**, not 3.4 (no scene in `main.js` before 1.8).
  4. **New files instead of shared ones:** `kerbs.js` (not `meshes.js`), `markings.js`, `fog.js`; test files
     `scene3d-world`, `-kerbs`, `-markings`. 3.4 has no Node test (all CDP).
  5. Each 3.x task got its own scenario (`world`, `kerbs`, `markings`, `theme3d`), mounting `createScene3d` on its own
     canvas: the mounting boilerplate is now copied 5 times. Worth a shared helper, or using the app's own 3D view
     (possible since 1.8), in a later task.
- **`cdp.mjs` teardown** (`37c1fec`, on `main`, Q approved): `world.mjs` reproducibly lost its result to
  `ENOTEMPTY` from `rmSync` of the Chrome profile (Chrome under SwiftShader on 40 m hills took > the fixed 300 ms to
  exit, and the `finally` error replaced the result). It now waits for Chrome's `exit` (5 s cap) and prints a cleanup
  failure as a warning. All 8 scenarios of the time re-ran clean.
- Review findings sent back to Codex (Q approved):
  - 3.1: the ground was clipped by the overview camera's `far` (1.7 km) before fog began (2.3 km), a hard horizon line;
    and `meshes.js` imported a camera for `fogRange`. Fog now lives in `fog.js` and follows the active view in
    `frame()` (an O(2N) loop over road vertices per frame, no allocation): `far = min(view.far, 2·size)`, `near` past
    the deepest road vertex. Chase horizons are a sharp line by geometry (the fog band is under a pixel at 4 m eye
    height); accepted.
  - 3.2: one label strip `128 px × labels` (Harrow Ring: 4224 px, over the 4096 many GPUs allow), and boards read as
    floating numbers (paper panels against a near-paper sky, no posts). Now grid atlas pages ≤ 2048 px, ink borders,
    merged ink posts to 0.25 m below the road.
- 1.8:
  - `fitRestores` failed once. Diagnosed (scratch scenario, nothing committed): Fit works; the scenario read the camera
    state 50 ms after a selector click, but the click nulls the state until the next frame and SwiftShader frames take
    ~97 ms. The coordinator replaced the four fixed waits after selector clicks with `settle()` (state set, then two
    frames).
  - `view-toggle.mjs` now runs with WebGL (a toggle loads the scene), so its 2D baseline must be taken with
    `APEX_WEBGL=1` on `main`; `zoomDisabledIn3d` became `zoomOverviewIn3d` by design.
  - Accepted as is: the orbit state keeps its `aspect` from `init` after a resize; `draw3d` keys the render skip on
    `JSON.stringify(view)` each frame (main thread, not `scene.frame`).
- **Dark-square bug, found only after the merge** (`065b6c1`, Q approved the fix): on 40 m hills the 3.1 ground plane lay
  ~33 m under the car, past 3.4's shadow camera `far` (80 m), and ground past `far` rendered as shadowed, a 24 m dark
  square following the car in the overview. Diagnosed in a scratch scenario (far 200 or no shadow: the patch matches
  the ground; a raycast hits only the ground). `fitShadow()` in `setTrack` now reaches from the highest station to the
  ground plane (95.9 m on the 40 m preset). `world.mjs` checks it geometrically and by pixel (teeth: far 80 fails
  both). **The screenshot compare alone missed it**: ~0.05% of pixels, under its 1% tolerance.
- The 1.8 API revision checkpoint was done by the coordinator: PLAN.md's Context now records the real hooks (`S.cam3d`,
  `#camera3d`, `draw3d`, `fail3d`, `bind3dInput`, the Wave E world), and the Scope lines of 2.1, 2.2, 2.3, 2.4, 2.6,
  3.5, 4.1 and 4.3 name them. `draw3d` picks the camera by a two-way ternary: the first of 2.1–2.4 to land replaces it
  with a mode→module table. 3.5 must scale the world meshes and `fitShadow()` too.
- Noted, not acted on: `kerbs.js` has a third copy of the sRGB→linear conversion (after `meshes.js`, `line.js`); by the
  rule of three it's now worth extracting.

- 2026-10-25: Wave F batch 1 ran as one parallel cycle of 4 Codex tasks (Q's request), from `e9df824`, and merged to
  `main` (`--no-ff`, 1.9, 2.1, 3.6, 5.3). 1.9, 2.1 and 3.6 merged cleanly; 5.3 conflicted in `main.js`
  (`cameraInput`, the step/view/frame lines, the helper block), `controls.js` (`setView`) and `index.html` (the
  selector line), all keep-both. In the merged `draw3d`, the old `input.sample` line is gone: 5.3 moved `sample` into
  `cameraInput()`. Decisions given in the prompts:
  - Per-frame work in each task's own function with one call line; only 2.1 changes camera selection, only 5.3 the
    `api.frame` call.
  - 1.9: no flag, no overhead; the scenario navigates to `/?perf` itself (the shared driver is unchanged).
  - 3.6: `project` and `setFailMarker` on the scene; labels are DOM (`#overlay3d`, under the inset). The fail ring
    uses `depthTest: false`, so it shows through hills; accepted as a marker.
  - 5.3: "Replay failure" seeks the **lap-model car** to `tc[fail.at] − 1.5 s`, because the stored trace is the
    passing lap (`check.js:34`) and the failing fraction has no trace. The trace car is `ink`-coloured with no shadow; in
    "Dynamic check" mode the shadow box stays with the (hidden) lap car's last position. Accepted.
- **Shadow box, second fix** (`9c6aa42`, on `main` before the merges, Q approved): the Wave E fix (`065b6c1`) covered only
  the light ray through the car. With the oblique sun, flat ground is up to ~12 m deeper across the 24 m box, so its far
  side still rendered as shadowed: a grey patch beside the car in the flat overview (in the committed Wave E
  `view3d-overview.png`; the coordinator reviewed that image and missed it), and in TV and chase views. Diagnosed in
  a scratch scenario (shadow off or `far` 200 clear it; hiding the markings or the car doesn't; a raycast hits only
  ground). `far` now adds the box's half-diagonal × tan(zenith); `scene3d.mjs` and `world.mjs` check all four box
  corners (the old `far` fails the flat check, 51.9 > 45.8 m).
- 1.9 review (follow-up sent, Q approved): every `perf3d` window reported "not running". A diagnostic showed a search
  converges in ~9 s headless, so each 12 s window ended idle, and the window flag was all-or-nothing. The same flaw was
  in the manual procedure (Q's hardware converges faster). Stats now cover running frames only; the scenario and the
  procedure restart the search whenever it converges.
- 2.1: `const CAMERAS` moved below the imports by the coordinator. Codex's placement: eyes 22 m past the edge and 5 m
  up, pushed out to clear every station; straights ≥ 200 m get cameras ≤ 150 m apart; cuts need 0.75 s and a 20%
  distance gain; FOV targets the car at 8% of the viewport height within 12–65°.
- Findings not yet acted on (for Q):
  - **3.6 has no direct check of where a label lands.** The flipped-Y teeth failed only the screenshot reference (DOM
    labels move many pixels, so it was caught, but a few-pixel offset wouldn't be). A direct check would compare a
    visible label's position with an independent projection of its anchor (camera rebuilt from the view).
  - **Board backs show mirrored digits** (double-sided label planes), in most TV shots (`tv3d-0`, `-1`, `-3`). A small
    3.2 follow-up: a blank back face, or single-sided panels with a plain back.
  - In "Dynamic check" mode the map tag still sits at the hidden lap car's pose.
- 1.9 verdict (2026-10-25):
  - Q's first run, on battery, showed a 30 Hz cap: 33.3 ms in every mode, 2D included, with no long tasks. That was
    Chrome's Energy Saver or macOS Low Power Mode, so it isn't used. The second run, on mains, decided it.
  - p95 17.4–17.6 ms counts as 60 fps: it's jitter, since a dropped frame reads ~33 ms. The logs carry no maximum, so
    "no frame dropped at all" isn't shown, only "fewer than 5%".
  - R10's edit-drag rebuild target isn't measured: editing is in 2D. P6 stays not triggered unless later
    measurements change that.
- 2026-10-25: Wave F batch 2 ran as one parallel cycle of 5 Codex jobs (Q's request), from `515ec30`, merged
  `--no-ff` in the order fu, 2.6, 2.2, 2.4, 3.5. Conflicts (all keep-both) in `main.js` (imports, helper blocks,
  `CAMERAS`, `cameraInput`), `scene.js` (`frame()`, camera construction, the returned API), `index.html` and
  `controls.js`. Decisions:
  - **Q:** in "Dynamic check" mode with Tag = Grip, the trace car's tag reads "grip: lap model only" (a trace has no
    lap-model tyre use); `tagText` itself is unchanged.
  - **Coordinator (2.6):** the trace car's attitude is initialised with the lap snapshot (same car, same peak scaling)
    and steered by the trace's recorded `steer`; `attitude.js` is unchanged.
  - **Merge-time:** board backs are rigid panels at any height scale like the fronts (measured: both shrink locally to
    1/3 at 3×); `frameHeights()` runs before `frameAttitude()` so only the grade pitch is scaled; the height slider also
    shows in Map mode.
  - 3.5 keeps board panels and the gantry at their true size by re-anchoring their vertices (same geometry objects);
    posts stretch. The road mesh is now named `'road'`.
  - 2.2 added `input.sampleGhost` for the pair camera's per-tick ghost sampling.
- **Scenario defects found in review and fixed by the coordinator (Q approved):**
  - `ortho3d`: waited for `#view3d` to be exactly 390 px wide (the page has margins, so never) and paused *before*
    the hill change (which restarts the search, so the line moved under the screenshots).
  - 3.5's height group took meshes off the scene's top level, breaking three lookups: `world.mjs` and
    `overlay3d.mjs` couldn't find the road, and `scene3d.mjs`'s `themeStable` became **vacuous** (it compared two empty
    lists). All now look up by name or `traverse`; `themeStable` has teeth again.
  - `heli3d` and `attitude3d` produced different images run to run (0.4–0.98% of pixels against a 1% tolerance): the
    car's line came from a timed search, and the live 1× run stops within a frame of its target. Both are now
    deterministic (two centreline laps of different cars; a fixed pose and attitude rendered through `frame()`).
  - Lesson, again: tolerant screenshot compares hide nondeterminism and vacuous checks. Comparing a second run at
    fraction 0 caught both.
- **Layout (Q chose option A):** the six-camera `.seg` no longer fits a phone (`view3d` `phoneSelector` fails on
  `main` until the layout job lands, recorded rather than weakened), and the trace, height and tilt controls collided
  on the left. Option A: a `<select>` for the camera and one stacked control column.
- Still open for Q: the 3.6 label-position direct check (not requested). Pair framing ignores the inset (minor).

## Next Up

- After the layout job: Wave F batch 3, 2.3 (bonnet and free-fly cameras; bonnet uses 2.6's attitude), 4.1 (FOV, g
  response, shake; wired for chase and heli) and 4.3 (speed streaks), on Q's go. Then Wave G: 4.2 (wheel blur, needs
  2.6) and 6.1 (documentation close-out).
