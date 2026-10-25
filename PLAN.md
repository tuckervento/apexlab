# PLAN: 3D view (migration step 9)

_Drafted: 2026-10-24_

## Goal

Apex Lab has a 3D playback view, a second client of the solver protocol and pose contract beside the 2D map, built
with vendored three.js. It covers phases P0–P5 of `docs/3d-view.md` §11: smooth pose and trace heights, a skeleton
with overview and chase cameras and a 2D inset minimap, more cameras with a cosmetic car attitude, a technical-style
world, sense-of-speed effects, and dynamic-trace playback. Every phase is verified by Node tests and headless-Chrome
scenarios, and physics results (goldens) don't change.

## Context

**Read first:** `CLAUDE.md`, then `docs/3d-view.md` (the design reference; section numbers below are its own), then
`ARCHITECTURE.md` §10.2 (pose contract) and §10.3 (track model). The design doc was written at `188ad94`. Since then
`dynLap` has moved to `src/dynamics/lap.js` (plant/driver split), so its `bicycle.js:92`/`:145` line references are
stale.

**Decided by Q (2026-10-24):**
- three.js **0.186.1**, vendored and pinned under `vendor/three-0.186.1/`, `WebGLRenderer` (§6.3). It is the project's
  first third-party runtime code. No other library comes in without asking Q.
- Visual target is **technical**: flat shading, palette colours, today's 2D style. No scenery, sky, fitted terrain or
  post-processing passes.
- Layout: **3D fills `#stage`, with the 2D map as an inset minimap**. Track editing switches back to the full 2D map.

**Defaults taken from the doc's recommendations, which Q hasn't confirmed** (any task that depends on one says so):
skip deferred A1 in favour of a tilted orthographic three camera (§13 Q2, task 2.4); height exaggeration is a slider in
the overview only, always 1× in car cameras (Q4, task 3.5); the lap-model car plays by default and the trace car is an
option (Q7, task 5.3); render on the main thread (T1, §5).

**Conventions every task follows:**
- **Frame** (§3, measured): three `(X, Y, Z)` = data `(x, z, y)`, and `car.rotation.y = −heading`. There are no sign
  changes anywhere else. All conversion goes through `src/views/scene3d/frame.js` (task 0.4); never swizzle inline.
- **Purity** (R1): `src/views/scene3d/` never imports `S` or `src/app/*`. It takes explicit inputs (canvas, palette
  from `readColors`, data, view). Geometry, camera, attitude and effects maths are pure modules tested in Node.
- **Importing three:** modules that Node tests import must not use the bare `'three'` specifier (Node can't resolve
  it). They import nothing from three, or `vendor/three-0.186.1/build/three.core.js` by relative path. Only the
  renderer-facing module(s) import `three.module.js` (also by relative path, so the URL matches the import map's).
  Addons, if any, come in through the `"three/addons/"` import map entry. Task 0.3 verifies this rule in Node and
  corrects this paragraph if reality differs.
- **Cameras** live one per file in `src/views/scene3d/cameras/<name>.js`, each exporting `init(input)`,
  `step(state, input, dtAnim)` and `view(state)`. `input` is `{T, car, ghost, replay, aspect, corners?}`, where
  `car`/`ghost` are smooth poses or null. A **view** is
  `{position:[X,Y,Z], target:[X,Y,Z], up:[X,Y,Z], fovDeg, near, far}` in the three frame (plus
  `ortho:{halfHeight}` for orthographic views, task 2.4). Springs run in **animation time** (`dt·S.replay`) with a fixed
  internal sub-step, so they match at any replay speed and freeze when paused (§7.1).
- **No physics changes**, except task 0.2 (A11), which adds an output. Any edit to `src/core/`, `src/dynamics/` or
  `src/solver/solver.js` needs `node tests/make-physics-version.mjs --write`. `tests/golden.json` must stay unchanged
  through this whole plan.
- `pose()` stays bit-identical (R3): `tests/playback.test.mjs` passes with its existing assertions unedited.
- Reduced motion (R9): shake, FOV kick, streaks and blur are zero under `prefers-reduced-motion: reduce`.
- Tests: `node --test tests/`, zero dependencies. Every new test file needs **teeth**: break the code in an `APEX_SRC`
  copy (or the equivalent for `src/views`) and record that the test fails.
- Browser checks use `tools/cdp.mjs` scenarios in `tools/scenarios/`. GPUs differ, so 3D screenshots are compared with
  a tolerance (helper from task 0.5), never pixel-exact. Reference images are committed next to the scenario that makes
  them.

**Working in parallel:** each task goes on its own branch or worktree. The hot shared files are `index.html`,
`src/app/main.js`, `src/app/state.js`, `src/app/controls.js` and (from P2 on) `src/views/scene3d/scene.js`. Keep
diffs in them small and rebase before merging.

**API revision checkpoints:** P2–P5 Scope lines below name a *provisional* scene API (`createScene3d`, `setTrack`,
`setLine`, `frame`, …) and the `S.view`/`S.cam3d` state. Tasks 1.7 and 1.8 fix the real API. Each must, as part of its
acceptance, edit PLAN-3D.md so the Scope lines of every not-yet-started P2–P5 task name the real functions and
fields.

## Non-Goals

- Interactive driving or live physics (§12). Render worker (T2) and `WebGPURenderer`/TSL (§11 P6) unless task 1.9's
  measurements trigger them; that would be a plan revision.
- Fitted terrain (§8.2 c), trees and stands, sky, CSM, post-processing passes (radial blur, SMAA/TAA, true motion blur),
  Panini projection.
- Banking (A2): only the mesh builder's `bank` input (zeros) is in scope.
- Sending makeBounds' `lo`/`hi` to the main thread (G7); kerbs are placed from track data.
- Engine sound, more than two cars plus a trace, VR, video export, imported real circuits.
- Track editing in 3D (it switches to the 2D map).
- Playing race-mode (`src/race/`) traces. Keep trace playback source-agnostic so race mode (`docs/race-mode.md`
  §5.9) can reuse it later.
- Any change to the 2D map's pixels when 3D is off.

## Tasks

### Phase 0: Prerequisites (no three in the app)

- [ ] **0.1 — `smoothPose` for lap snapshots (gap G1)**
  - Scope: add `smoothPose(src, t, info?)` to `src/playback/pose.js` for lap snapshots. Position comes from a cubic
    Hermite on `px`/`py`/`pz`, with station tangents from wrapped central differences. Heading comes from the cubic's
    derivative, and `pitch` from the smoothed grade. Return `tangent` as a unit 3-vector in the data frame. Time within
    a segment works as in `lapPose`, and all other fields match `pose()`. Throw on trace input (task 5.1 adds traces).
    New tests go in `tests/smooth-pose.test.mjs`, plus an entry in `ARCHITECTURE.md` §10.2.
  - Depends on: none
  - Acceptance: tests pass on the snapshots `tests/playback.test.mjs` builds (GT racer on preset 0, Kart on preset 2;
    copy its `snapshots()` helper):
    (a) at every `t = tc[i]`, `x, y, z, s, station, speed` equal `pose()`'s within 1e-9;
    (b) the heading is continuous across station boundaries (jump < 1e-3 rad at `tc[i] ± 1e-7`);
    (c) the heading change per 1/60 s is ≤ 1.5 × (the lap's peak `v·|k|`) × 1/60 + 1e-3 rad over the whole lap;
    (d) `git diff tests/playback.test.mjs` is empty and that file passes;
    (e) teeth: linear interpolation in place of the Hermite makes (b) or (c) fail.
  - Context: the doc measured heading steps of 3.3–10.5° held 100–330 ms on converged lines, and 22° on the centreline
    (§1.1 G1). Off the chord the error is ~2 cm, which is accepted (§4.2). `tests/load-core.mjs` already loads
    `playback/pose.js`, so `core.smoothPose` is available in tests.

- [ ] **0.2 — Dynamic traces record height (A11, gap G2)**
  - Scope: `dynLap` in `src/dynamics/lap.js` pushes `tr.z` with every trace sample: the track height at the car's
    projected position, interpolated between `T.z[obs.seg]` and `T.z[seg+1]` by `obs.f` (the cross-section is level,
    with no banking). `tracePose` returns `z` from `tr.z` when present (0 otherwise). Run
    `node tests/make-physics-version.mjs --write`. Update `ARCHITECTURE.md` §7 (`DynCheck.result` trace shape) and §10.2,
    and mark A11 done in `docs/deferred.md`.
  - Depends on: none
  - Acceptance: `node --test tests/` passes, with `git diff tests/golden.json` empty and the driver identity
    unchanged. A new test (in `tests/elevation.test.mjs` or `tests/playback.test.mjs`) runs a traced `dynLap` on
    `setupPreset(core, 'GT racer', {hills: 25})` and checks three things: every `tr.z[k]` lies between the heights of
    its station and the next; `pose(trace, t).z` has no jump > 0.5 m between consecutive samples; and on the flat preset
    every `tr.z` is exactly 0.
  - Context: traces don't feed any golden (checked: `tests/golden-util.mjs`, `make-golden.mjs`), and `src/race/` keeps
    no trace. Snapshot `pz` is `T.z` per station (`solver.js:147`), so this matches it.

- [ ] **0.3 — Vendor three.js 0.186.1**
  - Scope: create `vendor/three-0.186.1/` holding `build/three.module.js`, `build/three.core.js`, `LICENSE`, and a
    `README.md` that records the source tarball URL, the registry's `dist.integrity`, each vendored file's SHA-256, the
    import rule (Context above), and how to upgrade. Add the import map for `"three"` and `"three/addons/"` to
    `index.html` (§6.3); it is inert until 1.8. Add `tests/vendor-three.test.mjs`: it imports `three.core.js` by path,
    asserts `REVISION === '186'`, and checks the SHA-256s against the README. Measure in Node whether
    `three.module.js` imports without a DOM, and record the result.
  - Depends on: none
  - Acceptance: the new test passes; `node serve.mjs` serves `/vendor/three-0.186.1/build/three.module.js` as 200
    `text/javascript`; `node tools/cdp.mjs tools/scenarios/refused.mjs` still exits 0 (the app doesn't load three yet);
    and the Context's import rule is confirmed or corrected in PLAN-3D.md.
  - Context: the tarball is `https://registry.npmjs.org/three/-/three-0.186.1.tgz`. Extract it into its own empty
    scratch directory (untrusted download) and check its integrity before copying. This release has no `.min.js`, so
    vendor the unminified files (§6.1). Vendor no addons now; the task that first needs one adds it and its hash.

- [ ] **0.4 — World-frame helper and per-station frames**
  - Scope: `src/views/scene3d/frame.js` (pure) exports the data→three conversion (`(x, y, z) → (x, z, y)`),
    `yawFromHeading(h) = −h`, and `stationFrames(T, bank?)`. The last returns per-station `origin`, `tangent`, `lateral`
    and `up` as typed arrays in the three frame; `bank` defaults to zeros and rotates `lateral`/`up` about the tangent
    (§8.1; document the sign). Test file `tests/scene3d-frame.test.mjs`.
  - Depends on: 0.3
  - Acceptance: the test turns the doc's §3 script into assertions, using `three.core.js`'s `PerspectiveCamera`
    top-down with `up = (0, 0, −1)`: data +x projects to screen right and +y to screen down. For headings 0, 0.7 and −2,
    the car's forward equals the tangent, and `forward × up` equals `n`, both with dot product ≥ 1 − 1e-6. At bank 0,
    `stationFrames` gives `lateral = (nx, 0, ny)`; at bank b, the edge heights are `z ± (w/2)·sin b`. Teeth: swapping two
    axes in a copy fails the test.

- [ ] **0.5 — Headless WebGL2 and tolerant screenshot compare in the CDP driver**
  - Scope: `tools/cdp.mjs` launches Chrome with `--disable-gpu`, which probably gives no usable WebGL2. Add an opt-in
    (a `withApp` option or env var) that does, for example `--use-angle=swiftshader --enable-unsafe-swiftshader`, and
    leave existing scenarios' flags unchanged. Add a zero-dependency screenshot helper that saves a PNG and compares it
    to a reference *in the page* (decode both with `createImageBitmap`, count pixels whose difference exceeds a
    threshold), returning the fraction that differ. Add a new scenario, `tools/scenarios/webgl2.mjs`.
  - Depends on: none
  - Acceptance: `node tools/cdp.mjs tools/scenarios/webgl2.mjs` exits 0. It draws a triangle in a WebGL2 context,
    reads back its pixels, and prints `UNMASKED_RENDERER_WEBGL` and whether `EXT_clip_control` exists. The helper's
    self-check gives 0 for identical images and > 0 for an image shifted by one pixel. All existing scenarios still
    exit 0. The flags that worked are recorded in `cdp.mjs`'s header comment.
  - Context: `EXT_clip_control` availability decides the depth strategy (§7.4); record what SwiftShader reports.

### Phase 1: Skeleton

- [ ] **1.1 — Track ribbon mesh builder**
  - Scope: in `src/views/scene3d/meshes.js` (pure: typed arrays, no three),
    `trackRibbon(T, frames, {heightColors?, pal?})` returns `{position, normal, index, color?}`: 2 vertices per
    station at `origin ± lateral·width/2`, two triangles per segment, closed at i = N. Height colours come from
    `pal.elev`, as the 2D map does on hilly circuits. Tests go in `tests/scene3d-meshes.test.mjs`.
  - Depends on: 0.4
  - Acceptance: tests pass on every preset, flat and at 40 m hills: vertex count is `2N` and index count `6N`, with the
    last quad joining station N−1 to station 0. Edges are at `c ± n·w/2` and heights at `T.z`, within float32 precision.
    Normals point up (`n·up > 0`) everywhere. With a test bank of 0.1 rad, edge heights are `z ± (w/2)·sin(0.1)`. Teeth.

- [ ] **1.2 — Racing-line ribbon and colour modes**
  - Scope: in `meshes.js`, `lineRibbon(disp, {halfWidth = 0.6, lift = 0.05})` builds a ribbon along the line at `pz`
    plus the lift, with its lateral from the line's own wrapped central-difference tangent. `lineColors(disp, mode, pal)`
    returns per-vertex RGB using the same bucket rules as `src/views/map2d/map.js:112–121`: speed over `vmin..vmax` on
    `pal.ramp`; pedal with `a < −1.2` → `s0`, `a > 0.4` → `s2`, else `s1`; util from `d.u`, falling back to speed
    while `u` is missing. Ghost ribbons take a constant `pal.colors.ghost`. Don't refactor `map.js`: this is the
    rule's second use, so write it again.
  - Depends on: 0.4
  - Acceptance: tests in `tests/scene3d-meshes.test.mjs`. For each mode, on three snapshots (centreline, mid-search,
    late), every segment's colour equals the colour that a verbatim copy of `map.js`'s bucket rule (kept in the test)
    gives. Vertices sit `lift` above `pz` and `halfWidth` either side of `(px, py)`. Util mode without `u` equals speed
    mode. Teeth.

- [ ] **1.3 — Procedural car model and placement**
  - Scope: `src/views/scene3d/car.js` imports `three.core.js`. `buildCarModel({wb, track, cg}, {color, opacity})`
    returns a low-poly `Group`: body boxes plus four wheel pivots named `wheelFL`, `wheelFR`, `wheelRL` and `wheelRR`.
    A pivot rotates about Y for steer, and its child rotates about the axle for spin. Local forward is +X. The wheel
    radius is cosmetic, derived from `wb` by a documented rule (§4.3: ~0.33 m GT, ~0.14 m kart).
    `placeCar(group, pose)` sets position (through `frame.js`), yaw (`−heading`) and pitch. A `disposeCar(group)`
    helper frees its geometry and materials.
  - Depends on: 0.3, 0.4
  - Acceptance: Node tests with `three.core.js`. The bounding box length is within [wb, wb + 2 m] and its width within
    [track, track + 0.6 m] for every preset car (`src/app/presets.js`). Wheel centres sit at the axle positions implied
    by `wb` and `cg`. After `placeCar` at headings 0, 0.7 and −2, the car's local +X maps to the pose tangent, and the
    right wheels lie on the `+n` side (dot > 0.99). `disposeCar` disposes every geometry it built (count them).

- [ ] **1.4 — Overview orbit camera**
  - Scope: `src/views/scene3d/cameras/orbit.js` follows the camera contract in Context. `init` fits the whole circuit,
    including `T.z` and the track width, for the given aspect and FOV. The state is `{target, yaw, pitch, dist}`, with
    ops `orbit(dyaw, dpitch)` (pitch clamped above the horizon), `pan(dx, dy)` (screen fractions) and `zoom(f)`. `view`
    returns a perspective view whose near/far are sized for the overview. Tests go in `tests/scene3d-camera.test.mjs`.
  - Depends on: 0.4
  - Acceptance: for all four presets, flat and at 40 m hills, at aspects 16:9 and 9:16, every `trackRibbon` edge
    vertex projects inside NDC [−0.95, 0.95] after `init`, using `three.core.js`'s `PerspectiveCamera` built from the
    view. Pitch stays within its clamps under repeated `orbit`. `zoom` keeps `target` fixed. Teeth.

- [ ] **1.5 — Chase camera**
  - Scope: `src/views/scene3d/cameras/chase.js`. Position and yaw follow the car through critically damped springs in
    animation time, with a fixed internal sub-step and no roll. The look-at point leads the car by `v·0.4 s` along its
    tangent. The camera never goes lower than the local track height (nearest station `T.z`) plus a margin. The
    g-response offsets come later, in 4.1.
  - Depends on: 0.1, 0.4
  - Acceptance: tests drive one lap of `smoothPose` (GT racer on preset 0, flat and at 40 m hills):
    (a) the same animation-time path sampled at frame dt 1/30, 1/60 and 1/144, and at replay ½×, 4× and 12×, gives the
    same view at the same `animT` within 1 cm;
    (b) `dtAnim = 0` leaves the state unchanged;
    (c) the camera is always ≥ track height + margin;
    (d) at steady state the camera is behind the car (`dot(forward, car − cam) > 0`);
    (e) re-`init` on a new track gives finite values.
    Teeth.

- [ ] **1.6 — Stage layout: 3D canvas plus 2D inset minimap (no three yet)**
  - Scope: in `index.html`, add `<canvas id="view3d">` to `#stage`, a 2D/3D toggle beside the zoom buttons, and CSS
    for the inset. In `state.js`, add `S.view` (`'2d' | '3d'`) and `S.camMini`, a second map2d `Camera` that is fitted on
    track change and resize. When `S.view === '3d'`, `main.js` draws `#view` as a corner inset with `S.camMini`: no tags,
    no corner labels, no pointer editing; a click switches to 2D. `S.cam` is untouched, so 2D comes back as it was.
    Entering edit mode (`controls.js`) forces `'2d'`. `#view3d` stays blank in this task.
  - Depends on: none
  - Acceptance: a new CDP scenario, `tools/scenarios/view-toggle.mjs`, checks four things. Toggling shows `#view3d` at
    stage size and `#view` at inset size. `S.cam.{x, y, z}` is identical after a 2D→3D→2D round trip. Pressing Edit sets
    `S.view` to `'2d'`. At 390 px width the inset's bounding rect doesn't intersect the zoom buttons or the lap readout.
    With 3D never toggled, a full-page screenshot is byte-identical to one taken on `main` in the same scenario state
    (2D unchanged). Existing scenarios exit 0.

- [ ] **1.7 — Scene module: renderer, rebuilds, per-frame transforms**
  - Scope: `src/views/scene3d/scene.js` imports `three.module.js`, with `index.js` as the lazy entry. It exports
    `createScene3d(canvas, pal, {onLost})` → `{setTrack(T), setLine(disp, colorMode, pal), setGhost(ghost | null),
    setCars({car: {wb, track, cg}, ghost: {wb, track} | null}), setTheme(pal), resize(rect, dpr), frame({car, ghost,
    view}), info(), dispose()}`. This shape is provisional; record the final one.
    - The renderer uses `reversedDepthBuffer` when `EXT_clip_control` exists and `logarithmicDepthBuffer` otherwise.
      `info()` reports which ran.
    - Lights are a hemisphere plus a directional light. Materials are flat-shaded from `pal`.
    - The track comes from 1.1, the line and ghost line from 1.2 (with `polygonOffset`; road first, line after), and
      the cars from 1.3, with the ghost translucent and drawn last.
    - Rebuilds happen only through the `set*` calls and dispose the old geometry. `frame` sets transforms and the
      camera only, with no allocation.
    - `webglcontextlost`/`webglcontextrestored` call `onLost`.
    - Add `scene3d` to `CLAUDE.md`'s layer list and to `ARCHITECTURE.md` §3/§10.
  - Depends on: 0.5, 1.1, 1.2, 1.3, 1.4
  - Acceptance: a CDP scenario, `tools/scenarios/scene3d.mjs`, mounts `createScene3d` on a canvas it creates in the
    live page, using `S.T`/`S.disp` from the running app (`main.js` isn't wired yet). It renders the orbit view and
    checks:
    - the screenshot is within tolerance of a committed reference;
    - `renderer.info.render.triangles` is within 5% of the expected count;
    - `info().depth` is reported;
    - `renderer.info.memory.geometries` is constant over 300 `frame()` calls and after 5 `setTrack` rebuilds;
    - `WEBGL_lose_context.loseContext()` calls `onLost`.

    Also edit PLAN-3D.md so every not-yet-started P2–P5 task's Scope line names the real scene API (see "API
    revision checkpoints").

- [ ] **1.8 — App integration: lazy 3D, cameras, fallback**
  - Scope: the first switch to 3D runs `import('../views/scene3d/index.js')` in `main.js` (R11) and creates the scene
    on `#view3d`.
    - Each frame in 3D: take `smoothPose` for the car and ghost, step the active camera (`S.cam3d = {mode, state}`;
      modes are overview and chase, picked from a selector in `#stage`), then call `scene.frame`.
    - Rebuild on the track's `trackRev`, on `lineRev` and colour-mode changes, on ghost pin/unpin, and on a car change.
    - Pointer, wheel and pinch on `#view3d` drive orbit/pan/zoom in overview, separately from the 2D handlers. Fit
      re-fits the overview.
    - When paused, with the camera still and no new data, skip the render (§5).
    - If WebGL2 is missing, the import fails or the context is lost, go back to 2D with a status-chip message (R5).

    Also edit PLAN-3D.md so every not-yet-started P2–P5 task names the real `S.cam3d`/selector/frame-loop hooks.
  - Depends on: 0.1, 1.5, 1.6, 1.7
  - Acceptance: a CDP scenario, `tools/scenarios/view3d.mjs`, exits 0 with no page exceptions and checks:
    - no `vendor/three` resource loads before the toggle (`performance.getEntriesByType('resource')`);
    - overview and chase screenshots are within tolerance of references;
    - the car's chase-view screen position changes over 1 s at 4×;
    - choosing the Kart preset rebuilds a smaller car;
    - a preset change re-fits the overview;
    - a forced context loss leaves `S.view === '2d'` with the chip message;
    - with `getContext('webgl2')` stubbed to null before the toggle, the fallback message shows and 2D still works.

    `node --test tests/` passes, and the existing scenarios exit 0.

- [ ] **1.9 — Frame-time measurement (R10, decides P6)**
  - Scope: add an opt-in `?perf` URL flag in `main.js` that logs the p50/p95 frame time and a `PerformanceObserver`
    `longtask` count every 10 s. Add a CDP scenario that records 2D versus 3D overview versus 3D chase during a search.
    Write up a manual procedure for Q's hardware. Record the results in `investigations/3d-perf.md`.
  - Depends on: 1.8
  - Acceptance: `investigations/3d-perf.md` holds the headless numbers (labelled as software rendering, not
    representative) and Q's numbers from the manual run, both during a search. It ends with a stated verdict: if 3D's
    p95 exceeds 16.7 ms because of main-thread long tasks, P6 (render worker) is triggered and Q is told; otherwise it
    isn't.

### Phase 2: Cameras and car

- [ ] **2.1 — TV trackside camera**
  - Scope: `cameras/tv.js` takes `input.corners` (from `findCorners`). It places fixed cameras outside each corner's
    apex (`−sign` side, at width/2 + 15–30 m, a few metres above the local `T.z`) and along long straights. It switches
    to the nearest camera ahead of or beside the car, with hysteresis; these are cuts, not blends. The FOV narrows to
    keep the car's on-screen size within a band. Above 4× replay it falls back to the chase view. It is added to the
    camera selector.
  - Depends on: 1.8
  - Acceptance: tests check that placement is deterministic for a track; that every camera is ≥ width/2 + 10 m from
    the centreline and above the local track height; that each corner has a camera on its outside; that cuts per lap at
    1× are ≤ 2 × (number of cameras), so there's no flicker; and that `replay > 4` returns the chase view. A CDP
    screenshot of each preset is within tolerance.

- [ ] **2.2 — Helicopter and two-car framing cameras**
  - Scope: `cameras/heli.js` is a high, behind camera on springs that shows the line ahead. `cameras/pair.js` keeps the
    car and ghost both in shot (the 3D counterpart of `cam.frame([cs, gs])` in `main.js`); with no ghost it behaves like
    heli. Both are added to the selector.
  - Depends on: 1.8
  - Acceptance: tests show that with a pinned ghost (two snapshots of different quality) both cars project inside NDC
    [−0.9, 0.9] for a whole race-clock cycle, and that the 1.5 determinism checks (a) and (b) hold for both. CDP
    screenshots are within tolerance.

- [ ] **2.3 — Bonnet and free-fly cameras**
  - Scope: `cameras/bonnet.js` is fixed rigidly to the smooth pose (plus attitude from 2.6 when present), with near
    plane 0.1 m. Under reduced motion it is disabled with a note in the selector (§7.1). `cameras/free.js` is user-driven
    fly (drag to look, wheel or keys to move) for inspection.
  - Depends on: 1.8
  - Acceptance: tests show the bonnet camera stays at a fixed offset in the car frame at headings 0, 0.7 and −2 (and
    pitched on a 40 m hill), and that free fly is deterministic for a fixed input sequence. A CDP check confirms that
    with `prefers-reduced-motion` emulated (`Emulation.setEmulatedMedia`) the bonnet option is disabled.

- [ ] **2.4 — Top-down and tilted orthographic camera (replaces deferred A1)**
  - Scope: `cameras/ortho.js` uses the view's `ortho:{halfHeight}`; the scene renders it with an `OrthographicCamera`.
    It frames like `Camera.fit`, has a 0–60° tilt slider, and follows like `Camera.frame`. In `docs/deferred.md`, mark A1
    as superseded by this camera, pending Q's confirmation of §13 Q2.
  - Depends on: 1.8
  - Acceptance: a test shows that at tilt 0, for a given canvas size, every track centreline point projects within
    0.5 px of map2d `Camera.fit`'s `sx`/`sy`. Raising the tilt moves a crest's projection by the expected `z·sin τ`
    amount. A CDP screenshot at 0° and 45° is within tolerance.

- [ ] **2.5 — Cosmetic attitude, steer and wheel spin (pure)**
  - Scope: `src/views/scene3d/attitude.js` provides:
    - roll and pitch from a spring-damper (~1.5 Hz, ζ ≈ 0.7; §4.3) driven by `ay`/`ax`, scaled so the lap's peak g
      (`lapExtremes`) gives about 3° roll and 2° pitch, with a fixed sub-step in animation time;
    - steer: the trace's `steer` when present, else the kinematic `atan(wb·k)` with `k` interpolated from the snapshot
      at the pose's station;
    - wheel spin: `angle += v·dtAnim / r`.

    Each is labelled cosmetic in code.
  - Depends on: none
  - Acceptance: tests show that steady-state roll equals scale × `ay/ay_peak` within 2%; frame-rate and replay
    determinism holds as in 1.5 (a, b); a right-hand bend (k > 0) gives a steer to the right and roll to the outside, in
    the signs `car.js` uses; and spin over one lap equals `L / r` within 0.1%. Teeth.

- [ ] **2.6 — Apply attitude to the cars, and say it's cosmetic**
  - Scope: the scene's `frame` takes per-car `{roll, pitch, steer, spin}` and applies them to the body and the wheel
    pivots from 1.3. `main.js` keeps per-car attitude state. The "How the model works" text in `index.html` says the
    body motion, steer and wheel spin in 3D are cosmetic, not physics.
  - Depends on: 1.8, 2.5
  - Acceptance: a CDP scenario reads the car group's transforms through a debug accessor. Mid-corner in a right-hander
    at 1×, the body roll is non-zero with the outward sign and the front wheel pivots are steered right. A chase
    screenshot is within tolerance. Paused, the transforms don't change across frames.

### Phase 3: World (technical style)

- [ ] **3.1 — Ground plane and edge skirts**
  - Scope: in `meshes.js`, `groundPlane(T, margin)` sits just below `min(T.z)`, and `skirts(T, frames)` drops from each
    track edge to the plane (§8.2 option b; the P1 floating ribbon is option a). Distance fog is scaled to the circuit's
    size. `setTrack` builds them.
  - Depends on: 1.7
  - Acceptance: tests on every preset, flat and at 40 m: the ground is strictly below every track vertex; skirt top
    vertices equal the ribbon's edge vertices; and their bottoms sit at ground height. CDP overview screenshots of a
    40 m preset in both themes are within tolerance.

- [ ] **3.2 — Start line, braking boards, corner signs**
  - Scope: a pure placement module puts a chequered start band across the track at station 0 (where `map.js` draws it)
    with a gantry, braking boards 100/200/300 m before each corner's start `s` on the outside, and corner-number signs
    outside each apex. A scene method (e.g. `setCorners(corners)`) builds them as low-poly meshes.
  - Depends on: 1.7
  - Acceptance: tests show every board and sign is off the track surface (more than width/2 + 1 m from the centreline);
    boards are at the stated distances before `c.s` with lap wrap; and the start band spans the full width at station 0.
    A CDP screenshot is within tolerance.

- [ ] **3.3 — Kerbs**
  - Scope: kerbs (striped in `pal.colors.kerb`/`kerb2`) go on the inside of corners from `findCorners` spans where
    curvature exceeds a threshold. They are placed from track data only, not the line, so they don't flicker while the
    optimiser runs (Non-Goals: no bounds sent).
  - Depends on: 1.7
  - Acceptance: tests show kerb vertices lie in the band [w/2 − kerb width, w/2 + 0.01] on the inside of curvature, and
    that there are none where `|kc|` is below the threshold. A CDP chase screenshot at a corner is within tolerance.

- [ ] **3.4 — Lighting, car shadow and themes**
  - Scope: tune the sun and hemisphere light. Add a car-only shadow from a small shadow camera following the car (no
    CSM). New CSS tokens for the 3D background and ground go in both themes in `index.html`. `setTheme(pal)` updates the
    materials in place, driven by `main.js`'s existing `refreshColors` observer.
  - Depends on: 1.7
  - Acceptance: CDP screenshots in light and dark (toggle `data-theme`) are within tolerance of the references; a theme
    switch changes no geometry count (`renderer.info.memory.geometries`); and the shadow map is enabled only for the car
    (checked by inspecting `castShadow` across the scene).

- [ ] **3.5 — Height exaggeration in the overview**
  - Scope: a slider (1–5×), shown only for overview and ortho, scales the vertical axis of the track, line, ground and
    the car *position* (not the car model's shape). The car's pitch uses the same scale. Car cameras (chase, heli, pair,
    TV, bonnet) always run at 1×. This relies on an unconfirmed default (§13 Q4).
  - Depends on: 1.8
  - Acceptance: a CDP scenario reads geometry through a debug accessor. At 3× a known crest's height above the ground
    is 3× its value at 1× (within 1%). The car's Y equals the ribbon's Y at its station at 3×. Switching to chase gives
    an effective 1×.

- [ ] **3.6 — Overlay parity with the 2D map (R6)**
  - Scope: corner labels and map tags (`tagText`) become DOM elements positioned by projecting 3D points each frame.
    They are hidden when behind the camera or off-screen. Add a dynamic-check failure marker at `fail.at` while the
    result is current (`!S.dynStale`). Road height colours on hilly circuits are on (as 2D shows them).
  - Depends on: 1.8
  - Acceptance: a CDP scenario checks that the label count equals the number of corners; that a corner behind the
    chase camera has its label hidden; that the tag text equals 2D's for the same pose; and that after a dynamic check
    whose result has `fail`, the marker is present at that station. Screenshots are within tolerance.

### Phase 4: Sense of speed

- [ ] **4.1 — FOV, g response and road-driven shake**
  - Scope: `src/views/scene3d/effects.js` (pure, fixed sub-step in animation time) provides:
    - a speed-linked FOV of 55° at rest to 70° at 300 km/h, capped at 72°;
    - g response: a lateral offset from `ay` and a pull-back from `ax`, through a spring;
    - shake from `T.kv`, `phys.nz`, braking `ax` and closeness to the track edge, scaled down above 1× replay.

    FOV and shake follow the car's real speed (§7.2). Under reduced motion everything is zero (base FOV). Wire it into
    the chase view (and heli, if 2.2 has landed) in `main.js`, reading
    `matchMedia('(prefers-reduced-motion: reduce)')`.
  - Depends on: 1.8
  - Acceptance: tests check that FOV is monotone in speed and ≤ 72°; that reduced motion gives exactly the base FOV and
    zero offsets; that shake is 0 on a flat straight at constant speed and > 0 over the largest-`kv` crest of a 40 m
    preset; and that frame-rate determinism holds as in 1.5 (a). A CDP check with reduced motion emulated confirms the
    view's FOV stays constant over a lap.

- [ ] **4.2 — Wheel blur**
  - Scope: above a threshold of *screen* wheel speed (real × replay), swap the wheels for a blurred disc so wheels
    don't strobe at 4–12× (§7.2). It is off under reduced motion only if it moves; a static disc is fine.
  - Depends on: 2.6
  - Acceptance: a pure threshold function is tested, including that the same car speed at 1× and 12× lands on
    different sides of the threshold. A CDP debug accessor shows the disc at 12× on a straight and the spoked wheel at
    1× in a slow corner.

- [ ] **4.3 — Speed streaks**
  - Scope: instanced streak particles near the camera, with density and length from the car's real speed, behind an
    effects toggle in the selector area. Off under reduced motion. No post-processing passes (Non-Goals).
  - Depends on: 1.8
  - Acceptance: a pure spawn/length function is tested (zero at rest, monotone in speed, zero under reduced motion).
    In CDP, `renderer.info.memory.geometries` is constant while streaks run, and a chase screenshot at speed is within
    tolerance.

### Phase 5: Dynamic trace in 3D

- [ ] **5.1 — `smoothPose` for traces**
  - Scope: extend `smoothPose` to dynamic traces. Use a Hermite on `x`/`y` with tangents from the recorded world
    velocity (`vx`, `vy` rotated by `psi`) and a Hermite on `psi` with `r` as its derivative. Take `z` from `tr.z`
    (0.2) and pitch from it. Other fields match `tracePose`.
  - Depends on: 0.1, 0.2
  - Acceptance: tests check that at sample times, `x, y, z, heading` equal `pose()`'s within 1e-9. The heading is
    continuous between samples. On the skidpad setup (`SKIDPAD` in `tests/golden-util.mjs`), the smooth path's radius
    error at mid-samples is smaller than the linear `tracePose`'s. The existing playback tests are unchanged. Teeth.

- [ ] **5.2 — Trace clock alignment (gap G6)**
  - Scope: add a pure function in `src/playback/pose.js` that maps race time to trace time, so the trace car and lap
    car pass the trace's start station (`dyn.start`, the straightest station) together. Define what happens after a
    trace ends early (spun or incomplete): report an `ended` flag rather than clamping silently. It must compose with
    `raceClock` and keep race mode's multi-lap traces possible (Non-Goals).
  - Depends on: none
  - Acceptance: tests show that at the aligned start time the lap pose's station equals `dyn.start`; that for a
    complete trace both cars are at the same station ±1 at its first sample; and that an incomplete trace (force one
    with a high `frac`) reports `ended` after its last sample. Documented in `ARCHITECTURE.md` §10.2.

- [ ] **5.3 — Trace car in the 3D view**
  - Scope: the scene plays `S.dynRes.dyn.trace` as a third car while the result is current. A UI choice offers "Lap
    model | Dynamic check | Both", defaulting to Lap model (an unconfirmed default, §13 Q7). The trace car uses its real
    steer (through 2.5's attitude when 2.6 has landed). A "Replay failure" button jumps `S.animT` to just before
    `fail.at`.
  - Depends on: 1.8, 5.1, 5.2
  - Acceptance: a CDP scenario runs a dynamic check on GT racer, Harrow Ring, and checks four things. At the aligned
    time both cars are within ±1 station. Through the fastest corner the trace car's heading differs from its velocity
    direction (non-zero `beta`). A car change (stale result) hides the trace car. Replay failure lands within 2 s before
    `fail.at` when there is a failure.

### Phase 6: Close-out

- [ ] **6.1 — Documentation close-out**
  - Scope: in `ARCHITECTURE.md`, mark §11 step 9 ✅ with a summary and bring §3, §10.2 and §10.3 up to date. In
    `CLAUDE.md`, update the layer list and add a "Things that bite" entry for the frame convention and the three.js pin.
    Add a 3D section to `README.md`. In `docs/deferred.md`, update A1 and the "Elsewhere" entries. Add a status line at
    the top of `docs/3d-view.md` pointing to `ARCHITECTURE.md`.
  - Depends on: every other task
  - Acceptance: `node --test tests/` and every scenario in `tools/scenarios/` pass. A grep for "step 9" and "3D" in the
    docs shows no stale "not done" claims, and Q has reviewed the doc diff.

## Parallelizable Tracks

The waves follow from Depends-on. Every task in a wave can run at the same time.

| Wave | Can start when | Tasks |
|---|---|---|
| A | now | 0.1, 0.2, 0.3, 0.5, 1.6, 2.5, 5.2 |
| B | 0.3 done (5.1: 0.1 and 0.2) | 0.4, 5.1 |
| C | 0.4 done | 1.1, 1.2, 1.3, 1.4, 1.5 (also needs 0.1) |
| D | 1.1–1.4 and 0.5 done | 1.7 |
| E | 1.7 done | 1.8, 3.1, 3.2, 3.3, 3.4 |
| F | 1.8 done | 1.9, 2.1, 2.2, 2.3, 2.4, 2.6, 3.5, 3.6, 4.1, 4.3, 5.3 |
| G | 2.6 done / everything | 4.2 / 6.1 |

The critical path is 0.3 → 0.4 → (1.1–1.4) → 1.7 → 1.8. Waves E and F have many tasks touching `scene.js`, `main.js`
and `index.html`; running more than ~4 of them at once will cost more in rebases than it saves.
