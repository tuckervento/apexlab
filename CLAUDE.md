# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Apex Lab: finds the minimum-time racing line around a closed circuit for a configurable car, then checks how much of that pace a time-stepped bicycle model can hold. Physics, solver, views and app in ES modules under `src/` (`index.html` is markup, CSS and one script tag); no build, no package dependencies, no package.json; one vendored library, three.js 0.186.1 (`vendor/three-0.186.1/`), for the 3D view only. The original single-file prototype is frozen in `prototype/apex-lab.html` (reference only — don't edit). `ARCHITECTURE.md` is the detailed reference (conventions, physics rules, optimiser stages, data shapes, protocol/migration plan) — read it before changing physics.

## Running and testing

- **Run:** `node serve.mjs`, then open `http://localhost:8000` (`PORT=` to change). `file://` no longer works: browsers block ES modules (and Workers) there. Only external resource is Google Fonts.
- **Test:** `node --test tests/` (Node's built-in runner, zero deps; ~25 s). `tests/load-core.mjs` imports `src/` as one namespace (`APEX_SRC=<dir>` loads a modified copy, for checking that tests fail on broken code). Modules are cached per process, so module-level state is shared within a test file.
- **Browser:** `node tools/cdp.mjs <scenario.mjs>` drives the real app in headless Chrome over the DevTools protocol (no deps; Node's `WebSocket`, `CHROME=<path>` if not at the macOS default), for what Node can't run: `controls.js`, `main.js`, the panel, the frame loop. A scenario gets `run(expr)` in the page, where `import('/src/app/state.js')` etc. are the app's own module instances. Exit 0 pass (or explicit `diagnostic: true`, reported as not verified), 1 the scenario failed (false checks, malformed results, page/scenario exceptions, unexpected or missing expected console errors), 2 the driver couldn't run it (Chrome, `serve.mjs`, port, DevTools; the reason is printed). Examples in `tools/scenarios/`.
  - **WebGL.** The 3D scenarios set `export const options = {webgl: true}` (or `APEX_WEBGL=1`): Chrome runs WebGL2 on
    SwiftShader. Without it, `getContext('webgl2')` is null.
  - **Paths and ports.** `cdp.mjs` serves the tree it is started in. `APEX_PORT`/`APEX_DEBUG_PORT` let several runs
    (for example, in worktrees) go at once.
  - **References.** Screenshot references live in `tools/scenarios/ref/` and are compared by `tools/shot.mjs`
    (`compareToReference`, `diffPng`). Missing references fail. `APEX_UPDATE_REFS=1` writes them and the run exits
    non-zero with "UPDATED reference (review)". Review every written image, then run the scenario twice without
    update mode: each reference must compare at fraction 0. `webgl2.mjs` tests both modes explicitly in a temp directory.
    References render with `prefers-color-scheme: light` unless a scenario explicitly chooses another scheme.
    - `view-toggle.mjs` checks that 2D is byte-identical with 3D unopened, against PNGs saved on `main`
      (`VIEW_TOGGLE_SAVE`/`VIEW_TOGGLE_BASELINE`; see its header). Without the baseline it skips that check.
- `tests/parity.test.mjs` compares `src/` against the frozen prototype bit for bit (via `tests/load-prototype.mjs`, which extracts the prototype's `CORE`/`DYN` blocks into a `vm` context). Elevation (step 8) left flat circuits bit-identical, so it still passes; delete it after the first intended change to *flat* physics.
- All six `ARCHITECTURE.md` §8 checks are ported: gradient, convergence, skidpad, and `golden.test.mjs` (centreline laps plus dynamic checks on 30 committed converged lines: 24 flat, 6 on 25 m hills), plus the elevation checks (`elevation.test.mjs`, §8.7). Each check has **property** assertions (physical sanity bounds) and **golden** assertions (bit-exact against `tests/golden.json`). No linter or build exists.
- **Goldens:** any intended physics change breaks them by design. Regenerate with `node tests/make-golden.mjs --write` (~1 min), then review the `golden.json` diff before committing. A mechanical refactor (migration step 2) must leave them passing untouched. They are per-runtime: a different V8 build fails every golden assertion loudly, naming both versions.
  Opt-in numerical comparison: `node tools/numeric-report.mjs [--json]` reports fixed-line, skidpad and GT/Harrow convergence differences against the baseline (`APEX_SRC=<dir>` checks a source copy).
- **Driver split:** `src/dynamics/plant.js` owns integration and actuators; `src/drivers/reference.js` owns control policy. `dynLap` in `dynamics/lap.js` accepts an optional driver. The generated `DRIVER` identity is independent of `PHYSICS`; regenerate both with `node tests/make-physics-version.mjs --write` after driver or physics edits.
- **Race:** `tests/race.test.mjs` runs with the suite. `node tests/check-race-mutations.mjs` (~1.5 s) is run separately, not by `node --test tests/`: it breaks `APEX_SRC` copies of `src/race/` and asserts each targeted race test fails. Add a mutation there with every new race property. `src/race/` is **not** in the `PHYSICS` hash yet; it must join (as the rules hash, `docs/race-mode.md` §5.7) before race result files exist.
- **Physics version:** `src/app/physics-version.js` holds the SHA-256 of the physics source (`core/`, `dynamics/`, `solver/solver.js`; not the presets, a run file stores its own car); run files carry it. After *any* edit to those files, mechanical refactors included, run `node tests/make-physics-version.mjs --write` and commit the result, or `runfile.test.mjs` fails. The hash identifies the source, not the results: a refactor changes it while the goldens still pass. `make-golden.mjs`'s `meta.sourceSha256` is a separate, older record (it includes `presets.js`) and is not kept current.
- The gradient check measures error against `Σ|grad_i·d_i|`, not the net directional derivative: random directions can cancel ~10⁵×, which makes FD roundoff look like a failure.

## Architecture (big picture)

Seven layers; core, dynamics, race, solver and playback have no DOM access and must stay that way (the solver runs in a Web Worker).

1. **Core** (`src/core/`) — track (`genCtrl` → `buildTrack` spline → `makeBounds`), car (`buildCar` precomputes speed-indexed limit tables incl. the GGV; with `{loads: true}` also on a load-factor axis for hills), quasi-steady-state lap model `lapEval`, elevation (`genElev`; per-station `z`, `dz`, `cth`, `kv` in the track; `ARCHITECTURE.md` §4.7), and `Optimizer` (staged spline L-BFGS).
2. **Dynamics** (`src/dynamics/`) — `dynNominal` (inverse dynamics), `dynLap` (4 ms time-stepped lap with feedforward+feedback driver), `DynCheck` (bisects the fastest clean fraction of lap-model pace).
3. **Race** (`src/race/`) — `race()` drives several laps at constant grip on `createPlant`/`plantStep`/`observe` with a driver from `src/drivers/`, and `judgeStep` applies plant-only rules (track limits, off, spin; reset or DNF). Rules are in `src/race/README.md`, design and status in `docs/race-mode.md` §5.2. Node only so far (no solver command or UI).
4. **Solver** (`src/solver/`) — `Solver` owns car, track, line, `Optimizer` and `DynCheck` behind the `ARCHITECTURE.md` §10.1 protocol (commands in, events out, every array a copy, results tagged with car/track/line revisions); `worker.js` runs it in a Web Worker in 15 ms slices. No worker APIs in `solver.js`, so `tests/solver.test.mjs` drives it directly.
5. **Views** (`src/views/map2d/`, `src/views/scene3d/`) — map2d: camera, palette, `drawMap`, charts. scene3d (step 9, done; API in `ARCHITECTURE.md` §3): pure modules tested in Node (meshes, line, kerbs, markings, frame, car, attitude, effects, streaks, wheels, and the eight cameras in `cameras/`, each with `init`/`step`/`view`), plus `scene.js`, a WebGL renderer on vendored three.js (`createScene3d`, loaded lazily through `index.js`; Node tests must not import it). `frame({car, ghost, trace, view, attitude, streaks, wheelBlur})` renders one frame. Both views are functions of explicit inputs (canvas, camera, palette, data) and never import app state.
6. **Playback** (`src/playback/pose.js`) — `pose(source, t, info?)` for a lap snapshot or a dynamic-check trace (true heading, steer, slip), and `raceClock`. The map's car and ghost markers and the HUD use it.
7. **App** (`src/app/`) — `state.js` (`S`, the one app state object), `client.js` (worker protocol client: applies events to `S`, calls UI hooks given to `connect()`), `controls.js` (panel, buttons, actions), `telemetry.js` (live readout and map-tag text), `main.js` (map and 3D input, frame loop including `draw3d`, lap readout, boot), `trace3d.js` (which car the 3D view shows: lap, dynamic trace or both), `presets.js`, `sliders.js` (the car slider table: ranges, steps, formatters; pure, no DOM), `simple.js` (car panel knobs: base car + knobs + hand-set fields → `S.P`; ARCHITECTURE §7). Uses only `genCtrl`, `genElev` and constants from core: `G`, plus `RHO`, `ETA`, `CRR` in `simple.js` (the simple-controls knob mapping; pure, no DOM).

Key couplings across the layers:
- The main thread has no car, bounds, line or optimiser: everything physical arrives as worker events. Views get car data only from `carInfo` (`describeCar`), and the line only from `snapshot` (tyre use `u` too, after a `view` command).
- `carChanged()`/`rebuildTrack()` send `setCar`/`setTrack`, coalesced (one in flight per kind, latest pending). In the worker these rebuild the car (~16 ms; ~250 ms with load tables on a hilly circuit) or track, re-score or restart the optimiser, and recompute the reference lap.
- A new track is swapped in only together with its first snapshot (station counts differ); snapshots never step back to an older car/track revision; dynamic results are current only while their three revisions match the displayed snapshot.
- Worker exceptions arrive as `error` events. Each command is a transaction (`Solver.handle` runs it on `Optimizer.fork()` with its events held back): one that throws restores every field and sends only `{paused: false}`, and the client puts the panel back to the last accepted car or circuit (`refused` hook). A slice that throws pauses the solver (`{paused: true}`); `frame()`/`frameBody()` also catch exceptions. Both show in the status chip rather than killing the page — a past silent freeze was a missing `Optimizer.clamp` at convergence.

## Deferred work

`docs/deferred.md` keeps the items set aside on purpose (2.5D map, banking, load-table and lap-model speed, elevation's simplifications, saved-run gaps), each with its context, approach, open questions and how to verify. Read it before starting any of them, and update it when one lands.

## Things that bite

- **`lapEval` has a hand-written exact adjoint gradient.** Any change to `lapEval` (including yaw limit, shift losses, GGV interpolation, and on hills the load factor's `dn/du` chain and the 3D steps) must be re-checked against central finite differences (≥4 sig figs, hard and `tau > 0` modes); `gradient.test.mjs` does this on flat and hilly circuits, through the load clamps too.
- **Elevation keeps flat circuits bit-identical** (`ARCHITECTURE.md` §4.7): a flat station runs the flat code expression for expression, adjoint included, because the converged-line goldens depend on the gradient's bits. Put any hilly term in its own branch, never as a zero-valued addition (`+ 0·0` can turn a −0 into +0). A hilly circuit needs a car built with `{loads: true}` (`lapEval` throws otherwise; the solver builds it). Its levels start at a per-car floor `load.l0` ≤ 0 (zero grip below), so index them as `(l − l0)`, take levels with `Math.floor` (not `|0`, which truncates negatives), and pass `load.nf`/`load.l0` to `loadAt`/`tab3`/`gg3`. `Scratch.stall/air/ntop` (snapshot `warn`) report laps the floor or clamps distort; don't hide them.
- **No module-level mutable state in core/dynamics:** `vCorner`/`lapEval` output buffers live in `Scratch` (every `lapEval` caller needs its own `makeScratch(N)`); `DYN` is frozen. Keep it that way: the worker split depends on it.
- **Preset circuits are seeds** into `genCtrl`/`buildTrack`; changing either changes every preset and invalidates golden lap times (GT racer on seed 27, 12 m width: 78.3771 s for a single run from the centreline in Node v26.12.0/v26.12.1; restarts scatter ~78.28–78.40 s; Node and Chrome differ by tens of ms, so golden values are per-runtime; dynamic check 97.8%). Changing either also requires regenerating `tests/golden.json`.
- **Conventions:** SI internally (UI params are km/h, %, kW, deg; `carSpec` in `src/core/units.js` validates and converts them once into `car.spec`, renaming every field whose unit changes — read `car.spec`, never UI params, from core/dynamics); screen is y-down so normal `n = (−ty, tx)` points visually right; stations at uniform arc length with wrapping indices; speed tables are 0.5 m/s steps to `VMAX = 110`.
- The optimiser's edge handling is a stiffening penalty, deliberately not a clamp (a clamp creates apex curvature kinks the lap model exploits).
- **3D frame convention:** three `(X, Y, Z) = data (x, z, y)`, and yaw = −heading (`dataToThree` and `yawFromHeading` in `src/views/scene3d/frame.js`). Convert only at that boundary; physics, poses and snapshots keep the data frame. Two more signs, both cosmetic:
  - positive attitude roll lowers the right (+n) side, so positive `ay` gives negative roll;
  - positive bank in `stationFrames` lowers the right edge.
- **three.js is pinned to 0.186.1**, vendored under `vendor/three-0.186.1/` (Q's decision; no other library without asking Q). `tests/vendor-three.test.mjs` checks:
  - the revision;
  - each file's SHA-256 against the vendor README;
  - that `three.module.js` imports without a DOM;
  - `index.html`'s import map.

  An upgrade means new hashes and new scenario references. The view needs WebGL2: without it, or after a lost context, it falls back to 2D with "3D off: …" in the status chip.
- **3D scenario lessons:**
  - **Deterministic screenshots.** Render a fixed frame through `S.scene3d.frame(...)` at replay 0 (as `attitude3d.mjs` and `wheels3d.mjs` do), not a live one.
  - **Waits.** Wait on state or `requestAnimationFrame`, never a fixed sleep: SwiftShader frames take ~100 ms. Wait for the precondition, never for the behaviour under test, or a broken feature shows up as a driver timeout (exit 2) instead of a named failed check.
  - **References must see the feature.** A chase camera can't see the wheel faces; `wheels3d.mjs` checks that its two states' shots differ.
  - **Page-script strings.** No `//` comments inside one-line page-script strings: they comment out the rest of the line.
  - **Finding meshes.** Look meshes up by name or `traverse`, never on the scene's top level (world meshes sit in the `heightWorld` group).
  - **Triangle counts.** The lap car is drawn twice per frame (main pass and shadow pass), and `renderer.info.render.triangles` counts both.
