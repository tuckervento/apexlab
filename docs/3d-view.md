# 3D view: requirements and options

> **Status (2026-10-25): implemented.** Step 9 is done; `ARCHITECTURE.md` §3 (the scene API and app wiring) and §11
> describe what shipped, `PLAN.md` holds the task breakdown and `STATUS.md` the record, including where the build
> departed from this document. Read this file for the reasoning behind the choices; it is not kept current.

Research and planning notes for migration step 9 (`ARCHITECTURE.md` §11): what a 3D view needs, how the existing
physics would drive it, and the options for each part, with a recommendation and the reasoning. Written 2026-10-24 at
commit `188ad94`; no source was changed. Library versions are from the npm registry and browser support from MDN
browser-compat-data 8.1.7, both read on that date.

Each claim is marked when it matters: **(measured)** means checked in this session by running code (the scripts are
described where they're used), **(source)** means read in this repo's or a library's source, and **(practice)** means
common practice in racing games and 3D views, not checked here.

## Summary

**What the 3D view is.** A *playback* view. The physics has already run: the worker publishes lap snapshots (≤ 20 Hz
while searching) and, after a dynamic check, one time-stepped trace. The 3D view samples those on the race clock, as
the 2D map does. Nothing in the 3D view feeds back into the physics, so rendering never touches goldens, the adjoint or
the physics hash. (Letting someone *drive* the car live is a different product; see §12.)

**Recommendations, in one table:**

| Area | Recommendation | Main reason |
|---|---|---|
| Library | **three.js** (0.186.1), vendored and pinned, loaded through an import map; `WebGLRenderer` first | Plain ES modules with no build step; the smallest full-featured option (~409 KB gzipped); its math runs in Node for tests (measured) |
| GPU API | **WebGL2** baseline; WebGPU later and optional | WebGPU is still missing on Linux and Intel Macs in Firefox (MDN data); WebGL2 works everywhere we care about |
| Threading | **Render on the main thread**, written so it can move to an OffscreenCanvas worker without a rewrite | The physics is already off the main thread; a render worker costs input forwarding and DOM labels; measure first |
| Frame | **three (X, Y, Z) = data (x, z, y)**: a swizzle, no sign changes | Verified: same picture from above as the 2D map, and `n` stays the driver's right (measured) |
| Pose | **A new smooth pose (C¹ heading and height)** in `src/playback/`, beside the current `pose()`, which stays bit-identical | Today's heading is constant per 4 m segment: steps of 3.3–10.5° held for 100–330 ms on converged lines (measured) |
| Cameras | Overview orbit and chase first; then TV trackside, bonnet, top-down/tilted ortho | Chase and overview cover "watch the lap"; the rest are additive |
| Sense of speed | Speed-linked FOV, chase-cam g response and road-driven shake first; motion blur later | The first three cost almost nothing and come straight from pose and telemetry; true motion blur needs three's WebGPU renderer |
| Elevation | A level-cross-section track ribbon at the station heights, built to take a bank angle later; a ground plane with height cues first, fitted terrain later | Banking (deferred A2) will tilt the cross-section; building the mesh from a per-station frame now avoids a rewrite |
| Scope of step 9 | Six phases (§11), each shippable and verifiable on its own | Keeps each change checkable, as steps 1–8 were |

**Decisions that are Q's to make** are collected in §13 (dependency policy, A1 vs 3D, layout, exaggeration, visual
target, interactive driving).

---

## 1. What the physics already gives a view

The main thread holds no car, bounds or optimiser (`CLAUDE.md`, "Key couplings"). Everything a 3D view can draw
arrives as worker events and lands in `S` (`src/app/state.js`). Inventory (all **(source)**):

| Data | Where it lands | Fields a 3D view uses | Rate |
|---|---|---|---|
| Track (`track` event) | `S.T` | `N`, `L`, `ds`, centreline `cx`, `cy`, normals `nx`, `ny`, curvature `kc`, `width`, heights `z`, `dz`, `cth`, `kv`, `flat`, `issue` | On a track change; during edit drags, coalesced to one in flight |
| Line snapshot | `S.disp` | `px`, `py`, `pz`, `v`, `k`, `ds`, `tc` (cumulative time), `off`, `u` (tyre use, when asked), `phys` (axle forces, loads, grip use, downforce, drag, load factor `nz`) | ≤ 20 Hz while improving (`PUBLISH_MS = 50`, `src/solver/solver.js:9`) |
| Ghost | `S.ghost` | A copy of a snapshot plus its car's `wb` and `track` | When pinned or loaded |
| Dynamic check | `S.dynRes` | `dyn.trace`: `x`, `y`, `psi` (true heading), `vy`, `r`, `delta` (steer), `alf`, `alr` (slip), `ax`, `ay`, `gear`, `s`, `st`, `t`; `fail.at` (station) | Once per check |
| Car info | `S.info` | `curves.gear`, `curves.rpm` on the speed grid (HUD, engine sound later) | On a car change |
| Car params | `S.P` | `wb`, `track`, `cg` for the car's size | On a car change |
| Corners | `S.corners` | `apex`, `s`, `e`, `sign`, `peak` (`findCorners`, main thread) | With the track |
| Race clock | `S.animT`, `S.replay` | `raceClock()` (`src/playback/pose.js:10`) | Every frame |

Payload size (computed from the snapshot layout, not timed): about 20 `Float64Array`s of length N, so 125 KB at N = 783
(Harrow Ring) and 256 KB at the N = 1600 cap, or 2.5–5 MB/s at 20 Hz. That's small next to what a GPU upload can take.

### 1.1 Gaps between that data and a 3D view

| # | Gap | Effect in 3D | Where it's handled |
|---|---|---|---|
| G1 | **Heading is constant over each station segment** (`heading: atan2` of the segment, `src/playback/pose.js:27`) and height is linear | The car and any camera attached to it rotate in visible steps. Measured on the 24 converged golden lines (`tests/golden.json`, laps reproduced exactly): the largest step per circuit is **3.3–10.5°**, held for **100–330 ms** (6–20 frames at 60 Hz). On the centreline it reaches 22° (Harrow Ring hairpin). Pitch steps are small, under 0.75° on 40 m hills (measured) | §4.2: a smooth pose |
| G2 | Dynamic traces have `z: 0` (deferred **A11**) | A trace played on a hilly circuit sinks into or floats above the road | A11, in phase P0 |
| G3 | No pitch, roll or suspension (`ARCHITECTURE.md` §10.2: "no attitude model") | The car body stays rigid and level with the road | §4.3: cosmetic attitude, labelled as not physics |
| G4 | No banking; the cross-section is level (deferred **A2**) | None today. A2 will tilt the road surface | §8.1: build the ribbon from a per-station frame |
| G5 | Lap snapshots have no steering angle or wheel speed; there is no wheel radius among the car parameters | No front-wheel steer or wheel spin for the lap-model car | §4.3: kinematic steer and a cosmetic radius |
| G6 | The trace starts at the straightest station, not the start line (`dynLap`, `src/dynamics/bicycle.js:92`) | Racing a trace against a lap snapshot needs a time offset | §4.4 |
| G7 | The usable bounds (`makeBounds`) stay in the worker | Kerbs and "car near the edge" cues can't use the real usable width | §8.3: place kerbs from `width` and the line, or send the bounds |
| G8 | No world beyond the track: no ground, terrain or scenery | A track ribbon floating in a void; hills hard to read | §8.2 |

---

## 2. Requirements

**Architecture (must):**
- R1. The view lives in `src/views/scene3d/` and is a function of explicit inputs (the canvas, camera, palette and
  data), like `src/views/map2d/`. It never imports `S`. This keeps a second view swappable and lets it move into a
  worker later (§5).
- R2. No physics on the main thread and no change to `core/`, `dynamics/` or `solver/solver.js` for rendering's sake.
  The one exception is A11 (record `z` in traces), which adds an output and changes no numbers. It still needs
  `node tests/make-physics-version.mjs --write`.
- R3. The current `pose()` stays bit-identical (`tests/playback.test.mjs`, and the 2D map depends on it). Smoothing is
  a new function.
- R4. The world frame is converted once, at the 3D boundary (`ARCHITECTURE.md` §10.3), never patched in individual
  views (§3).
- R5. Failures show in the status chip, as solver and frame errors do now. A lost WebGL context or a missing WebGL2
  falls back to the 2D map with a message; it never blanks the page.

**Behaviour (must):**
- R6. Show what the 2D map shows: track, racing line coloured by speed, pedal state or tyre use (the same `pal.ramp`),
  ghost, corner labels, map tags, dynamic-check failure marker, replay at every speed including paused.
- R7. Hills read as hills: crests and compressions visible from the chase camera and the overview.
- R8. Light and dark themes from the same CSS tokens (`readColors`, `src/views/map2d/colors.js`).
- R9. Respect `prefers-reduced-motion` (`index.html:51` already does for the chip): no shake, FOV kick or blur.

**Performance (targets, to be measured):**
- R10. 60 fps on an integrated laptop GPU at device pixel ratio ≤ 2 (the cap `Camera.resize` already uses) while the
  optimiser is searching. Track mesh rebuilds within one frame during an edit drag.
- R11. Nothing loads for people who stay in 2D: import three lazily (`import()`) the first time 3D opens.

**Project constraints (must, unless Q changes them):**
- R12. No build step and no install step. A library is vendored as files in the repo, pinned, with its licence.
- R13. Tests stay `node --test tests/` with zero dependencies. Geometry, frame and camera maths are tested in Node;
  only pixels need a browser.

---

## 3. World frame (verified)

The data frame is plan `(x, y)` with the screen y-down, so the normal `n = (−ty, tx)` is the driver's right, plus a
height `z` up (`ARCHITECTURE.md` §2, §10.3). As drawn, that frame is left-handed, so any right-handed 3D frame that
shows the same picture must include one reflection. In three.js (right-handed, y up) the reflection is a plain swap:

```
three (X, Y, Z) = data (x, z, y)          car.rotation.y = −heading
```

**Measured** with three 0.186.1's `three.core.js` in Node (a script that builds a top-down camera with `up = (0, 0, −1)`
and projects test points): data +x lands at screen right and data +y at screen down, the same picture as the 2D map.
For headings 0, 0.7 and −2 rad, the car's forward vector matches the tangent and `forward × up` matches `n` (dot
products 1.000000). So:

- Positive offset and positive curvature keep their meaning (right of the driver, and a right-hand bend). No sign
  conversions anywhere.
- A z-up library (or Babylon's left-handed default) would need `Y = −y` or another reflection instead, and curvature
  and offsets would flip sign. That's the conversion §10.3 warns about; three's y-up avoids it.
- Turn this script into `tests/scene3d-frame.test.mjs` in phase P0, so the convention is pinned by a test.

Float precision is not a concern at this scale: the circuits span about 1–3 km (Harrow Ring is 3131 m around), and a
float32 has a step of 2⁻¹² m ≈ 0.24 mm at 2–4 km from the origin. No floating origin is needed (arithmetic, not
measured on a GPU).

---

## 4. How the physics drives the 3D view

### 4.1 Data flow

```
solver worker ──events──▶ client.js ──▶ S (T, disp, ghost, dynRes, info, P, corners)
                                            │
frame(ts) ── S.animT += dt·S.replay ── raceClock() ── smoothPose(disp | ghost | trace, t) ──┐
                                            │                                               │
                         revision changed? ─┴─▶ scene3d.rebuild(…)        scene3d.frame(poses, camera, effects)
                         (track, line, colour mode)                       (transforms only, every frame)
```

Two kinds of work, kept apart so the frame stays cheap:

- **Rebuilds** happen when a revision changes. A new `S.T` (track swap, which `client.js` already makes atomic with its
  first snapshot) rebuilds the track ribbon, ground and scenery. A new `lineRev` rebuilds the racing-line ribbon (N ≤ 1600
  stations, so ~3200 vertices: trivial). A colour-mode change rewrites one colour attribute. The ghost rebuilds when
  pinned.
- **Per-frame updates** move objects: car and ghost transforms, wheel spin and steer, camera, effects, label positions.
  No geometry allocation per frame, so no garbage-collection pauses.

`main.js`'s `draw()` already computes `cs` and `gs` (car and ghost poses) and the tags; the 3D path reuses that and swaps
`drawMap` for `scene3d.frame`. The HUD, telemetry and charts stay DOM and canvas as now.

### 4.2 Smooth pose (gap G1)

**Requirement.** A pose whose position, heading and height are continuous with continuous first derivatives (C¹), and
which equals today's `pose()` at the station nodes, so the 2D and 3D views agree where the car is.

**Options:**

| Option | How | For | Against |
|---|---|---|---|
| a. Cubic Hermite on positions | Tangents at stations by central differences; position from the cubic, heading from its derivative; height the same way | C¹ position and heading; cheap; exact at nodes | Within a segment the position moves off the chord by up to ~k·ds²/8 (about 2 cm at k = 1/90 m⁻¹ and ds = 4 m; arithmetic). The 2D map draws the chord, but 2 cm is far below a pixel there |
| b. Interpolate heading only | Keep the linear position; blend between the headings at the two ends (station heading = mean of adjacent segments) | Smallest change | Heading continuous but not C¹; car slides slightly sideways relative to its own nose |
| c. Smooth in the camera only | A spring on the camera, leaving the car stepping | No playback change | The car model still steps; fixes only half the problem |

**Recommendation: a**, as `smoothPose(src, t, info?)` in `src/playback/pose.js` (pure, testable), returning the same
fields plus `pitch` (from the grade) and `tangent`. Time within a segment stays as `lapPose` does it. Tests: equals
`pose()` at frac 0 for every station; the heading change per 1/60 s at the lap's top speed is bounded; `pose()` itself
unchanged (the existing tests).

### 4.3 Attitude, wheels and steer (gaps G3, G5)

None of this is physics. Each should be labelled as cosmetic in code and in the UI's "How the model works" text.

- **Body roll and pitch:** a second-order filter (spring-damper, ~1.5 Hz, ζ ≈ 0.7) driven by the pose's `ay` and `ax`,
  scaled to a few degrees at the car's peak g (`lapExtremes` gives the lap's range). Gives weight transfer a look
  without claiming a suspension model. Computed per frame in the view from consecutive poses; needs a fixed internal
  timestep so 12× replay and paused frames behave (a filter in animation time, not wall time).
- **Steer:** traces carry `delta` (true steering). For lap snapshots, use the kinematic angle `atan(wb · k)`, which
  ignores slip, and say so.
- **Wheel spin:** angle += v·dt / r with a cosmetic r ≈ 0.33 m (there is no wheel radius among the car parameters; a
  kart would want ~0.14 m: one constant per preset, or derive from `wb`).
- **Car shape:** procedural, sized from `S.P.wb`, `S.P.track` and `cg` (ghost: its own `wb`, `track`). Low-poly boxes
  and cylinders, flat shaded. No model files means no loader, no asset pipeline and no new MIME types in `serve.mjs`.

### 4.4 Dynamic-trace playback (gaps G2, G6)

Nothing plays a trace today (`ARCHITECTURE.md` §10.2). 3D is where it pays: the lap-model car follows the line with no
slip, while the trace car shows real sideslip, steering corrections and where it runs wide. Prerequisites: A11 (record
`z` per trace sample, as snapshots carry `pz`), and an offset so both cars start together (the trace starts at the
straightest station and runs at `frac` of lap-model pace, so it also arrives later). Trace samples are 24 ms apart
(every 6th 4 ms step, `bicycle.js:145`), about 42 Hz, so a 60 Hz display needs interpolation. `tracePose` already does
it linearly; the smooth variant should apply here too.

---

## 5. Threading

Today (source): the solver runs in a worker in 15 ms slices (`src/solver/worker.js`); the main thread runs the DOM
panel, the frame loop, the 2D map, five chart canvases (every 2nd or 4th frame) and the telemetry readout.

| Option | How | For | Against |
|---|---|---|---|
| **T1. Main thread** | Render in the existing `requestAnimationFrame` loop | Simplest; DOM labels and pointer input work directly; same as the 2D map | Shares 16.7 ms with DOM work and the 2D charts; a long task in the panel drops 3D frames |
| T2. Render worker | `canvas.transferControlToOffscreen()` to a second worker. WebGL2 in `OffscreenCanvas`: Chrome 69, Firefox 105, Safari 17 (MDN). `requestAnimationFrame` in a dedicated worker: Chrome 69, Firefox 99, Safari 16.4 (MDN). three has an example (`examples/jsm/offscreen/`) | Frames isolated from DOM jank | Snapshots must reach this worker too (forwarded by the main thread, or a `MessageChannel` from the solver worker); pointer and wheel events forwarded; DOM labels and tags need projected positions posted back each frame, or drawn in WebGL; harder to debug |
| T3. Inside the solver worker | — | — | Rejected: a 15 ms solver slice would hold up every frame |

**Recommendation: T1**, with R1 (pure view, given its canvas) so T2 is a move rather than a rewrite. Go to T2 only if
measurement shows main-thread long tasks costing 3D frames (a `PerformanceObserver` on `longtask`, plus frame times).
Two cheap wins on T1:

- Render on demand: when paused (`S.replay === 0`), with the camera still and nothing new from the worker, skip the
  render (battery).
- While 3D is showing, don't draw the full-size 2D map canvas (only a minimap, if there is one).

---

## 6. Rendering library

### 6.1 Options

Versions and sizes from the npm registry tarballs, 2026-10-24 (measured: gzip of the files a no-build page would load).

| Option | Version (date) | Licence | What a page loads | Renderers | Fit with no-build ES modules |
|---|---|---|---|---|---|
| **three.js** | 0.186.1 (2026-09-24) | MIT | `three.module.js` 128 KB gz + `three.core.js` 281 KB gz ≈ **409 KB gz**; WebGPU build `three.webgpu.js` 436 KB gz + core | `WebGLRenderer` (WebGL2); `WebGPURenderer` (WebGPU with an automatic WebGL2 fallback) | **Good.** Plain ESM with relative imports; addons are separate ES files. Note: this npm release has **no `.min.js` builds** (expected, not found: measured), so vendor the unminified files |
| Babylon.js | 9.32.0 (2026-10-22) | Apache-2.0 | `babylon.js` UMD bundle 8.7 MB (1.85 MB gz); the ES packages (`@babylonjs/core`, 73 MB unpacked) assume a bundler | WebGL2, WebGPU | Poor: a global script or a bundler. Left-handed by default (`useRightHandedSystem` exists) |
| PlayCanvas engine | 2.23.3 (2026-10-15) | MIT | `playcanvas.min.mjs` single ESM file 2.55 MB (641 KB gz) | WebGL2, WebGPU | Good (one ESM file), but 1.6× three's size and an editor-centred ecosystem |
| OGL | 1.0.11 (2025-01-27) | Unlicense | ~470 KB of source, unminified (tiny gzipped) | WebGL / WebGL2 | Good, but minimal: no shadows, post-processing or text; we'd write those |
| regl / twgl.js | 2.1.1 (2024-11) / 7.0.0 (2025-07) | MIT | Small | WebGL (thin wrappers) | Good; but we'd write a scene graph, cameras, shadows and anti-aliasing |
| Raw WebGL2 or WebGPU | — | — | Nothing | Ours | Perfect fit with zero dependencies; all the work is ours |

Rejected without a deeper look: **CesiumJS** 1.146 (a geospatial globe, 80 MB package), **deck.gl** 9.4 (data-viz
layers; good at 2.5D maps, not car cameras), **react-three-fiber** (needs React and a build), **Filament** (wasm; last
npm release 2024-08), **Unity / Godot web exports** (a separate toolchain and runtime, wasm, can't share the ES
modules, breaks no-build).

### 6.2 What three gives that matters here (source: the 0.186.1 package)

- `WebGLRenderer` options `reversedDepthBuffer` (used only when `EXT_clip_control` exists) and
  `logarithmicDepthBuffer`, for the 0.1 m to 5 km depth range (§7.4).
- Addons: cascaded shadow maps (`examples/jsm/csm/`), wide lines (`lines/Line2`), post-processing passes (SMAA, FXAA,
  TAA, bloom, afterimage), an OffscreenCanvas example.
- With `WebGPURenderer` only: the TSL node effects, including velocity-based `MotionBlur`, TRAA and depth of field
  (`examples/jsm/tsl/display/`).
- The core imports in Node with no DOM (`document` undefined; measured). `Vector3`, `Matrix4`, `Quaternion` and camera
  projection work there, so the frame, camera and mesh-builder tests can use the same maths as the browser.

### 6.3 Recommendation: three.js, `WebGLRenderer`, vendored

**Reasons:**
- It is the only full-featured option that fits "plain ES modules, no build" without contortion.
- It is the smallest of the three full engines (409 KB gz, against 641 KB and 1.85 MB), loaded lazily (R11).
- Its y-up right-handed frame makes our conversion a swap with no sign changes (§3).
- It has a large ecosystem and examples for every piece we need.

**What it costs:**
- It's the project's **first third-party runtime code** (Q's call, §13).
- three makes breaking changes almost every monthly release. Pin one version, vendor it, and upgrade on purpose with
  the screenshot checks (§10).

**Layout.** `vendor/three-0.186.1/` holding `build/three.module.js`, `build/three.core.js`, the few addons used, and
`LICENSE`. Map it in `index.html`:

```html
<script type="importmap">{"imports":{"three":"./vendor/three-0.186.1/build/three.module.js",
  "three/addons/":"./vendor/three-0.186.1/examples/jsm/"}}</script>
```

Import maps: Chrome 89, Firefox 108, Safari 16.4 (MDN). `serve.mjs` already serves `.js`. Node tests import the
vendored file by path.

**WebGPU later.** Write `scene3d` against the subset that both three renderers share (standard materials, buffer
geometry, no custom GLSL), so moving to `WebGPURenderer` is a constructor change if motion blur or TSL effects become
worth it. Don't start there: three's own manual still calls `WebGPURenderer` experimental, and WebGPU support is uneven
(§6.4).

**The no-dependency alternative**, if Q wants to keep zero third-party code: raw WebGL2. The scene is simple (two
ribbons, a ground, two or three procedural cars, labels), so it's feasible. The cost is that shaders, a shadow map,
anti-aliasing, a depth strategy, context-loss recovery and resize handling become ours. A guess, not an estimate: 2–3×
the work of phase P1.

### 6.4 WebGL2 vs WebGPU support (MDN browser-compat-data 8.1.7)

| | Chrome | Firefox | Safari |
|---|---|---|---|
| WebGL2 | 56 | 51 | 15 |
| WebGPU (`navigator.gpu`) | 113 on ChromeOS, macOS, Windows; Linux from 144 (Intel Gen12+ only) | **Partial:** Windows from 141; macOS on Apple silicon from 145 (Tahoe) or 147 (older); **not** Intel Macs or Linux | 26 (macOS, iOS) |
| WebGL2 in `OffscreenCanvas` | 69 | 105 | 17 |

---

## 7. Cameras, and speed effects ("distortion and warping")

### 7.1 Cameras

| Camera | Purpose | Driven by | Notes |
|---|---|---|---|
| **Overview orbit** | The whole circuit, hills included; the 3D "Fit" | Track extents incl. `z`; user orbit, pan, zoom | The default when 3D opens |
| **Chase** | Watch the lap | Smooth pose; look-ahead point a time ahead along the line (e.g. `s + v·0.4 s`) | Spring-damped follow (position and yaw), no roll. Lateral lag with `ay` and pull-back under `ax` convey g (practice) |
| Top-down / tilted orthographic | Parity with the 2D map; the "2.5D" tilt (deferred **A1**) for free | Same framing as `Camera.fit` / `frame` | See §13 Q2: may replace A1's Canvas 2D plan |
| TV trackside | The classic replay look | Fixed cameras placed from the track (outside of each corner from `findCorners`, plus straights); switch to the nearest one that sees the car; zoom FOV to keep the car's size on screen | Deterministic placement from track data; cuts, not blends |
| Bonnet / cockpit | Driver's view of crests and apexes | Rigid on the smooth pose plus cosmetic attitude | The most motion-sickness-prone; off under reduced motion, or offered with a warning |
| Helicopter | High follow, shows the line ahead | Pose, high and behind | Cheap variant of chase |
| Two-car framing | Car and ghost in one shot | Both poses, like `cam.frame([cs, gs])` in `main.js` | Needed for the ghost race |
| Free fly | Inspect a crest or a corner | User | Debugging and curiosity |

**Requirements across cameras:**
- Never go below ground on hills: clamp to the track or terrain height plus a margin.
- Run springs in *animation* time with a fixed internal step, so they behave the same at ½× and 12× replay and freeze
  when paused.
- Survive a track change (re-fit) and a replay-speed change (no jump).
- Keep camera maths pure in `src/views/scene3d/camera.js`, tested in Node like `tests/camera.test.mjs`.
- Keep camera state in `S` (e.g. `S.cam3d`), as `S.cam` is today.

At 12× replay the car covers up to 110 m/s × 12 ≈ 1.3 km/s on screen. Trackside cameras would cut every ~0.1 s, so
switch the TV camera off (or fall back to helicopter) above 4× (practice; to be tried).

### 7.2 Sense of speed

Ordered by value for cost (practice; nothing here measured yet). Each is driven by data we already have:

| Effect | Driven by | Cost | Notes |
|---|---|---|---|
| **Speed-linked FOV** | `pose.speed` (e.g. 55° at rest to 70° at 300 km/h), smoothed | Trivial | The strongest single cue in racing games; the widening is also where rectilinear edge stretch comes from (§7.3) |
| **Chase-cam g response** | `ay`, `ax` through the camera spring | Trivial | Doubles as an honest readout of the lap model's g |
| **Road-driven shake** | Vertical curvature `T.kv` (crests, compressions), load factor `phys.nz`, the car's distance to the edge (kerbs), braking `ax` | Small | Physics-driven, not random noise. Scale down above 1× replay |
| Speed streaks / particles | Speed; camera velocity | Small | Works in `WebGLRenderer` |
| Radial or edge blur | Speed | Small (one post pass) | A cheap stand-in for motion blur in `WebGLRenderer` |
| Wheel blur | Wheel rpm on screen (replay speed included) | Small | Swap to a blurred disc above a threshold, otherwise wheels strobe backwards at 4–12× (the wagon-wheel effect) |
| True motion blur | Per-pixel velocity buffer | Medium–large | three's `MotionBlur` node requires `WebGPURenderer` (§6.2) |

**Open question for the effects:** should they follow the car's real speed or what's on screen? At 12× the car looks
12× faster. Recommendation: FOV and shake follow real speed (they describe the car), blur and wheel swaps follow screen
speed (they describe what the eye sees).

### 7.3 Projection distortion

- A rectilinear projection stretches objects near the screen edges as FOV widens; beyond ~75–80° horizontal it looks
  wrong (practice). Cap the speed-linked FOV below that.
- For a wide cockpit view, a Panini or barrel post-projection keeps the centre undistorted. It's optional and only
  worth doing if the cockpit camera is kept.

### 7.4 Depth precision and z-fighting

The depth range runs from ~0.1 m (cockpit near plane) to ~5 km (circuit plus horizon), a ratio of 5·10⁴. A standard
depth buffer loses most of its precision at distance there, so far track and the racing-line ribbon on it flicker.

- Use `reversedDepthBuffer: true` where `EXT_clip_control` exists, else `logarithmicDepthBuffer` (both in three
  0.186.1 source). Which GPUs and browsers expose `EXT_clip_control` was **not checked** (MDN has no entry); check at
  start-up and record which path ran.
- Lift the racing-line ribbon a few centimetres above the road and use `polygonOffset`. Draw order: road, then kerbs and
  markings, then the line.
- Choose the near plane per camera (0.1 m cockpit, ~1 m chase, larger for the overview).

---

## 8. Elevation, the track and the world

### 8.1 Track surface

- Per station `i`: left and right edges at `c_i ± n_i · width/2`, both at height `z_i` (level cross-section, no
  banking). Two triangles per segment; the loop closes at i = N.
- Build it from a per-station frame `{origin, tangent, lateral, up}` with `up = (0, 0, 1)` today. Banking (A2) then
  only rotates `lateral` and `up` about the tangent, which matches the station record planned in `ARCHITECTURE.md`
  §10.3. Give the mesh builder a `bank` array of zeros now.
- Colour: grey road; the height tint (`pal.elev`) as an optional overlay, as in 2D.
- `T.issue` circuits (overlaps, tight corners) will interpenetrate in 3D. Show them as-is with the same warning; there
  are no bridges in the physics.

### 8.2 Ground and terrain

Hills run 0–40 m (the slider) on circuits 2–3 km around (measured: 40.0–40.9 m of range on the four presets at 40 m).
In perspective, from far away, that looks almost flat.

| Option | How | For | Against |
|---|---|---|---|
| **a. No ground, height cues** | Floating ribbon plus: car shadow on a plane at min z, vertical "curtains" from the track edge down to the plane, fog | Cheapest; honest (there's no terrain in the model) | Looks schematic |
| **b. Flat ground plane** at min z with curtains or embankments | A skirt from each track edge down to the plane | Reads as hills; still cheap | Large embankments on 40 m hills look odd |
| c. Fitted terrain | A heightfield grid whose heights come from the station heights (harmonic fill or inverse-distance), blended down under the track edges so it never pokes through | Looks like a real place | Real work; must stay below the road everywhere (a test); refit on every track edit (cost to measure) |

**Recommendation:** a, then b in the first world pass; c only if Q wants the scenery. Separately, a **view-only height
exaggeration** (as A1 sketches): 1× in chase and cockpit (the car must sit on the road it drives), adjustable in the
overview. It scales the scene's vertical axis only, never data. The car's pitch must use the same scale.

### 8.3 Scenery and markings (procedural, no asset files)

- Start/finish line and gantry; kerbs on the inside of corners where the line comes near the edge (from `width`, `off`,
  `k`; or send the bounds `lo`/`hi` in the `track` event to place them exactly: gap G7).
- Braking boards (100/200/300 m before each corner, from `findCorners`), corner-number signs, run-off colour.
- Lighting: one sun and a hemisphere light. Shadows: the car only, from a small shadow camera following it, first;
  CSM across the circuit only if wanted.
- Instanced low-poly trees or stands if Q wants a "place" (§13 Q5).

---

## 9. Overlays, UI and app integration

- **Racing line:** a ribbon (constant width in metres), vertex-coloured with `pal.ramp` for speed, pedal or tyre use,
  as `map.js` does. Ghost line in its 2D colour.
- **Cars:** car and ghost (translucent; draw transparent objects last). The dynamic-check failure point as a marker on
  the track at `fail.at`.
- **Labels and tags:** corner labels and the map tags as DOM elements positioned by projecting 3D points each frame
  (main thread only; in a render worker they'd be posted back, §5). Hide labels behind the camera or occluded by
  terrain.
- **Layout options** (§13 Q3): a 2D/3D toggle in `#stage`; 3D in `#stage` with the 2D map as an inset minimap; or a
  split screen.
- **Input:** orbit, pan and zoom (pointer, wheel, pinch) for the free cameras. Track editing stays in 2D: entering edit
  mode switches to the 2D map (or a top-down ortho camera, with picking at the handle's height later). Same rule A1
  chose.
- **State:** `S.view` (`'2d' | '3d'`), `S.cam3d` (which camera and its parameters), effect toggles.
- **Lifecycle:** `ResizeObserver` (as now), device pixel ratio capped at 2, `webglcontextlost`/`restored` handled (R5),
  disposal of geometry on rebuilds (three doesn't free GPU memory on its own).
- **Sound** (not graphics, but it carries most of the sense of speed in racing games): an engine note from `rpm` and
  `gear`, which `pose()` already gives with `info`. WebAudio, main thread. Its own item; worth noting so it isn't
  forgotten.

---

## 10. Verification

**In Node (no GPU):**
- Frame: the §3 script as a test (points left and right of the car, curvature sign).
- Smooth pose: equals `pose()` at station nodes; heading and height continuous; the heading change per 1/60 s bounded;
  the existing `pose()` tests untouched.
- Mesh builders (pure functions that return typed arrays): vertex count `2·N`, edges at `c ± n·w/2`, heights `z`;
  with a non-zero test bank, edge heights `z ± (w/2)·sin(bank)`; the terrain never above the road.
- Camera: spring determinism at any replay speed, the terrain clamp, and fit framing including `z`.
- Effects: reduced motion gives zero shake, FOV kick and blur.
- Teeth, as in the physics tests: break each (swap two axes, drop the clamp) in an `APEX_SRC` copy and watch the test
  fail.

**In a browser:**
- Screenshots in headless Chrome (the CDP driver used in step 6) for fixed states: preset, race time, camera. GPUs
  differ, so compare with a tolerance, not pixel-identical as step 6 did for 2D.
- Frame time and long tasks on the hardware Q cares about, during a search (the worst case: 20 Hz snapshots).

---

## 11. Proposed phases

Each phase ships on its own and is checked before the next.

| Phase | Contents | Verify |
|---|---|---|
| **P0** prerequisites (no three yet) | `smoothPose` in `src/playback/`; A11 (trace `z`); the frame mapping as a tested helper | Node tests; physics hash regenerated for A11; goldens unchanged |
| **P1** skeleton | Vendored three behind an import map, lazy-loaded; `src/views/scene3d/` with track ribbon, line ribbon (colour modes), box car and ghost; overview orbit and chase cameras; 2D/3D toggle; context-loss fallback | Screenshots; 60 fps target during a search; 2D unchanged when 3D is off |
| **P2** cameras and car | TV trackside, two-car framing, bonnet; cosmetic attitude, steer, wheel spin | Camera tests; screenshots per camera |
| **P3** world | Ground option a/b, kerbs, boards, start line, car shadow, fog, light/dark themes, height exaggeration in the overview | Mesh tests (incl. terrain below road); screenshots in both themes |
| **P4** sense of speed | FOV, g response, road shake, wheel blur, streaks; reduced motion | Effects tests; a look on real hardware (subjective, so Q's call) |
| **P5** dynamic trace in 3D | Play the trace car beside the lap-model car; failure replay | Trace and lap cars aligned at the start offset; screenshots |
| P6 (if measured) | Render worker (T2) if long tasks cost frames; `WebGPURenderer` if true motion blur or TSL effects become worth it | Before-and-after frame times |

Relation to deferred items: **A11** is in P0. **A1** (2.5D map) is either done in Canvas 2D first, or subsumed by
P1's tilted orthographic camera (§13 Q2). **A2** (banking) is unblocked by nothing here, and P1's frame-based mesh
builder means banking won't need a 3D rewrite. `docs/deferred.md` "Elsewhere" should point here once Q signs off.

---

## 12. Out of scope, with what each would change

- **Driving it yourself** (live input). The physics would have to run in real time, every frame, with input latency
  under ~50 ms: `dynLap`'s step loop running live in a worker, with `SharedArrayBuffer` or per-frame messages, a
  fixed-timestep loop and interpolation to the display. That's a new architecture, not a view. It also conflicts with
  the "optimiser owns the line" model. Decide separately.
- **More than two cars**, VR (three has WebXR support), video export (`canvas.captureStream()` with `MediaRecorder`).
- **Imported real circuits** (GPS or elevation data): a track-data question first, then a rendering one.

---

## 13. Decisions for Q

1. **Dependency policy.** Accept three.js (vendored, pinned, MIT) as the first third-party runtime code? Recommendation:
   yes. The alternative is raw WebGL2, roughly 2–3× P1's work (a guess) and every later feature built by hand.
2. **A1 vs 3D.** `docs/deferred.md` decided A1 (the tilted map) in Canvas 2D, with WebGL as step 9. A tilted
   orthographic three camera gives A1's picture almost free once P1 exists, without A1's painter's-order problem.
   Recommendation: skip A1 and do P0–P1, unless 3D is far enough off that the Canvas version is wanted sooner.
3. **Layout.** A 2D/3D toggle, 3D with a 2D inset minimap, or a split? Recommendation: 3D with an inset minimap, so the
   plan-view overview isn't lost; but a toggle is the smaller first step (P1).
4. **Height exaggeration.** Off, fixed, or a slider in the overview only? Recommendation: a slider in the overview,
   always 1× in car cameras.
5. **Visual target.** Clean and technical (flat shading, palette colours, matching today's 2D style) or game-like
   (scenery, sky, shadows, post-processing)? This sets most of P3 and P4's size. Recommendation: technical first; it
   reads the data better and is far cheaper.
6. **Interactive driving** (§12): ever wanted? If yes, the threading choice should be revisited before P1, because a
   live sim changes what the render loop waits on.
7. **Which car does 3D play by default:** the lap-model car (fast, no slip) or the dynamic trace (shows slip, but only
   after a check and at a fraction of the pace)? Recommendation: the lap car by default, the trace as an option once P5
   lands.

---

## Sources

Read on 2026-10-24.

- npm registry (versions, dates, licences, tarballs measured): [three](https://www.npmjs.com/package/three),
  [@babylonjs/core](https://www.npmjs.com/package/@babylonjs/core), [babylonjs](https://www.npmjs.com/package/babylonjs),
  [playcanvas](https://www.npmjs.com/package/playcanvas), [ogl](https://www.npmjs.com/package/ogl),
  [regl](https://www.npmjs.com/package/regl), [twgl.js](https://www.npmjs.com/package/twgl.js),
  [cesium](https://www.npmjs.com/package/cesium), [@deck.gl/core](https://www.npmjs.com/package/@deck.gl/core),
  [filament](https://www.npmjs.com/package/filament).
- [MDN browser-compat-data](https://github.com/mdn/browser-compat-data) 8.1.7 (`data.json` from unpkg): `api.GPU`,
  `api.OffscreenCanvas.getContext.webgl2_context`, `api.DedicatedWorkerGlobalScope.requestAnimationFrame`,
  `html.elements.script.type.importmap`, `api.WebGL2RenderingContext`.
- three.js manual, [WebGPURenderer](https://threejs.org/manual/en/webgpurenderer) (experimental status, WebGL2 fallback).
- [ICS Media: Three.js on WebGPU](https://ics.media/en/entry/250501/) (as of r176, `WebGLRenderer` sometimes faster
  than `WebGPURenderer`; secondary source, not measured here).
- web.dev, [WebGPU is now supported in major browsers](https://web.dev/blog/webgpu-supported-major-browsers).
- [Announcing Babylon.js 9.0](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0)
  (Windows Developer blog, 2026-03-26).
- [PlayCanvas Engine 2.0.0](https://blog.playcanvas.com/playcanvas-engine-hits-2-0-0) and
  [ESM scripts](https://blog.playcanvas.com/introducing-esm-scripts-in-playcanvas).
- web.dev, [OffscreenCanvas](https://web.dev/articles/offscreen-canvas).
- This repo: `ARCHITECTURE.md` §2, §7, §10, §11; `docs/deferred.md` A1, A2, A11; `src/playback/pose.js`,
  `src/app/main.js`, `src/app/client.js`, `src/solver/solver.js`, `src/dynamics/bicycle.js`,
  `src/views/map2d/camera.js`.
