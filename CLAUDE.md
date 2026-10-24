# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Apex Lab: finds the minimum-time racing line around a closed circuit for a configurable car, then checks how much of that pace a time-stepped bicycle model can hold. Physics, solver, views and app in ES modules under `src/` (`index.html` is markup, CSS and one script tag); no build, no dependencies, no package.json. The original single-file prototype is frozen in `prototype/apex-lab.html` (reference only — don't edit). `ARCHITECTURE.md` is the detailed reference (conventions, physics rules, optimiser stages, data shapes, protocol/migration plan) — read it before changing physics.

## Running and testing

- **Run:** `node serve.mjs`, then open `http://localhost:8000` (`PORT=` to change). `file://` no longer works: browsers block ES modules (and Workers) there. Only external resource is Google Fonts.
- **Test:** `node --test tests/` (Node's built-in runner, zero deps; ~15 s). `tests/load-core.mjs` imports `src/` as one namespace (`APEX_SRC=<dir>` loads a modified copy, for checking that tests fail on broken code). Modules are cached per process, so module-level state is shared within a test file.
- `tests/parity.test.mjs` compares `src/` against the frozen prototype bit for bit (via `tests/load-prototype.mjs`, which extracts the prototype's `CORE`/`DYN` blocks into a `vm` context). Delete it after the first intended physics change.
- All six `ARCHITECTURE.md` §8 checks are ported: gradient, convergence, skidpad, and `golden.test.mjs` (centreline laps plus dynamic checks on 24 committed converged lines). Each check has **property** assertions (physical sanity bounds) and **golden** assertions (bit-exact against `tests/golden.json`). No linter or build exists.
- **Goldens:** any intended physics change breaks them by design. Regenerate with `node tests/make-golden.mjs --write` (~30 s), then review the `golden.json` diff before committing. A mechanical refactor (migration step 2) must leave them passing untouched. They are per-runtime: a different V8 build fails every golden assertion loudly, naming both versions.
- **Physics version:** `src/app/physics-version.js` holds the SHA-256 of the physics source (`core/`, `dynamics/`, `app/presets.js`); run files carry it. After *any* edit to those files, mechanical refactors included, run `node tests/make-physics-version.mjs --write` and commit the result, or `runfile.test.mjs` fails. The hash identifies the source, not the results: a refactor changes it while the goldens still pass. `make-golden.mjs`'s `meta.sourceSha256` is a separate, older record and is not kept current.
- The gradient check measures error against `Σ|grad_i·d_i|`, not the net directional derivative: random directions can cancel ~10⁵×, which makes FD roundoff look like a failure.

## Architecture (big picture)

Six layers; core, dynamics, solver and playback have no DOM access and must stay that way (the solver runs in a Web Worker).

1. **Core** (`src/core/`) — track (`genCtrl` → `buildTrack` spline → `makeBounds`), car (`buildCar` precomputes speed-indexed limit tables incl. the GGV), quasi-steady-state lap model `lapEval`, and `Optimizer` (staged spline L-BFGS).
2. **Dynamics** (`src/dynamics/`) — `dynNominal` (inverse dynamics), `dynLap` (4 ms time-stepped lap with feedforward+feedback driver), `DynCheck` (bisects the fastest clean fraction of lap-model pace).
3. **Solver** (`src/solver/`) — `Solver` owns car, track, line, `Optimizer` and `DynCheck` behind the `ARCHITECTURE.md` §10.1 protocol (commands in, events out, every array a copy, results tagged with car/track/line revisions); `worker.js` runs it in a Web Worker in 15 ms slices. No worker APIs in `solver.js`, so `tests/solver.test.mjs` drives it directly.
4. **Views** (`src/views/map2d/`) — camera, palette, `drawMap`, charts. Pure functions of explicit inputs (canvas, camera, palette, data); they never import app state, so a second view (3D, step 9) can sit beside them.
5. **Playback** (`src/playback/pose.js`) — `pose(source, t, info?)` for a lap snapshot or a dynamic-check trace (true heading, steer, slip), and `raceClock`. The map's car and ghost markers and the HUD use it.
6. **App** (`src/app/`) — `state.js` (`S`, the one app state object), `client.js` (worker protocol client: applies events to `S`, calls UI hooks given to `connect()`), `controls.js` (panel, buttons, actions), `telemetry.js` (live readout and map-tag text), `main.js` (map input, frame loop, lap readout, boot), `presets.js`. Uses only `genCtrl` and `G` from core.

Key couplings across the layers:
- The main thread has no car, bounds, line or optimiser: everything physical arrives as worker events. Views get car data only from `carInfo` (`describeCar`), and the line only from `snapshot` (tyre use `u` too, after a `view` command).
- `carChanged()`/`rebuildTrack()` send `setCar`/`setTrack`, coalesced (one in flight per kind, latest pending). In the worker these rebuild the car (~60 ms) or track, re-score or restart the optimiser, and recompute the reference lap.
- A new track is swapped in only together with its first snapshot (station counts differ); snapshots never step back to an older car/track revision; dynamic results are current only while their three revisions match the displayed snapshot.
- Worker exceptions arrive as `error` events (the solver pauses itself); `frame()`/`frameBody()` also catch exceptions. Both show in the status chip rather than killing the page — a past silent freeze was a missing `Optimizer.clamp` at convergence.

## Things that bite

- **`lapEval` has a hand-written exact adjoint gradient.** Any change to `lapEval` (including yaw limit, shift losses, GGV interpolation) must be re-checked against central finite differences (≥4 sig figs, hard and `tau > 0` modes).
- **No module-level mutable state in core/dynamics:** `vCorner`/`lapEval` output buffers live in `Scratch` (every `lapEval` caller needs its own `makeScratch(N)`); `DYN` is frozen. Keep it that way: the worker split depends on it.
- **Preset circuits are seeds** into `genCtrl`/`buildTrack`; changing either changes every preset and invalidates golden lap times (GT racer on seed 27, 12 m width: 78.3771 s for a single run from the centreline in Node v26.12.0/v26.12.1; restarts scatter ~78.28–78.40 s; Node and Chrome differ by tens of ms, so golden values are per-runtime; dynamic check 97.8%). Changing either also requires regenerating `tests/golden.json`.
- **Conventions:** SI internally (UI params are km/h, %, kW, deg; `carSpec` in `src/core/units.js` validates and converts them once into `car.spec`, renaming every field whose unit changes — read `car.spec`, never UI params, from core/dynamics); screen is y-down so normal `n = (−ty, tx)` points visually right; stations at uniform arc length with wrapping indices; speed tables are 0.5 m/s steps to `VMAX = 110`.
- The optimiser's edge handling is a stiffening penalty, deliberately not a clamp (a clamp creates apex curvature kinks the lap model exploits).
