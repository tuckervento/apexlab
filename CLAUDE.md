# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Apex Lab: finds the minimum-time racing line around a closed circuit for a configurable car, then checks how much of that pace a time-stepped bicycle model can hold. Physics in ES modules under `src/`, app in `index.html`; no build, no dependencies, no package.json. The original single-file prototype is frozen in `prototype/apex-lab.html` (reference only — don't edit). `ARCHITECTURE.md` is the detailed reference (conventions, physics rules, optimiser stages, data shapes, protocol/migration plan) — read it before changing physics.

## Running and testing

- **Run:** `node serve.mjs`, then open `http://localhost:8000` (`PORT=` to change). `file://` no longer works: browsers block ES modules (and Workers) there. Only external resource is Google Fonts.
- **Test:** `node --test tests/` (Node's built-in runner, zero deps; ~15 s). `tests/load-core.mjs` imports `src/` as one namespace (`APEX_SRC=<dir>` loads a modified copy, for checking that tests fail on broken code). Modules are cached per process, so module-level state is shared within a test file.
- `tests/parity.test.mjs` compares `src/` against the frozen prototype bit for bit (via `tests/load-prototype.mjs`, which extracts the prototype's `CORE`/`DYN` blocks into a `vm` context). Delete it after the first intended physics change.
- All six `ARCHITECTURE.md` §8 checks are ported: gradient, convergence, skidpad, and `golden.test.mjs` (centreline laps plus dynamic checks on 24 committed converged lines). Each check has **property** assertions (physical sanity bounds) and **golden** assertions (bit-exact against `tests/golden.json`). No linter or build exists.
- **Goldens:** any intended physics change breaks them by design. Regenerate with `node tests/make-golden.mjs --write` (~30 s), then review the `golden.json` diff before committing. A mechanical refactor (migration step 2) must leave them passing untouched. They are per-runtime: a different V8 build fails every golden assertion loudly, naming both versions.
- The gradient check measures error against `Σ|grad_i·d_i|`, not the net directional derivative: random directions can cancel ~10⁵×, which makes FD roundoff look like a failure.

## Architecture (big picture)

Three layers; core and dynamics have no DOM access and must stay that way (the planned worker split depends on it).

1. **Core** (`src/core/`) — track (`genCtrl` → `buildTrack` spline → `makeBounds`), car (`buildCar` precomputes speed-indexed limit tables incl. the GGV), quasi-steady-state lap model `lapEval`, and `Optimizer` (staged spline L-BFGS).
2. **Dynamics** (`src/dynamics/`) — `dynNominal` (inverse dynamics), `dynLap` (4 ms time-stepped lap with feedforward+feedback driver), `DynCheck` (bisects the fastest clean fraction of lap-model pace).
3. **App** (inline module script in `index.html`; presets in `src/app/presets.js`) — globals (`P`, `car`, `T`, `B`, `off`, `opt`, `disp`, `dyn`, `dynRes`…), a `requestAnimationFrame` loop giving the optimiser ~10 ms/frame on the main thread, canvas drawing, charts, controls.

Key couplings across the layers:
- `Optimizer` mutates the same `off` array the renderer reads; the UI reads globals directly. `refreshDisplay()` re-runs `lapEval` to build the `disp` snapshot used by drawing.
- Chart/readout code reads raw `CarModel` tables and calls `dynNominal` from the display path (so table renames break views).
- `carChanged()` is the slider-change path: rebuilds car (~60 ms), bounds, re-scores the optimiser (restarts at stage 3), recomputes the reference lap.
- `frame()`/`frameBody()` catch exceptions and show them in the status chip rather than killing the loop — a past silent freeze was a missing `Optimizer.clamp` at convergence.

## Things that bite

- **`lapEval` has a hand-written exact adjoint gradient.** Any change to `lapEval` (including yaw limit, shift losses, GGV interpolation) must be re-checked against central finite differences (≥4 sig figs, hard and `tau > 0` modes).
- **No module-level mutable state in core/dynamics:** `vCorner`/`lapEval` output buffers live in `Scratch` (every `lapEval` caller needs its own `makeScratch(N)`); `DYN` is frozen. Keep it that way: the worker split depends on it.
- **Preset circuits are seeds** into `genCtrl`/`buildTrack`; changing either changes every preset and invalidates golden lap times (GT racer on seed 27, 12 m width: 78.3771 s for a single run from the centreline in Node v26.12.0; restarts scatter ~78.28–78.40 s; Node and Chrome differ by tens of ms, so golden values are per-runtime; dynamic check 97.8%). Changing either also requires regenerating `tests/golden.json`.
- **Conventions:** SI internally (UI params are km/h, %, kW, deg, converted in `buildCar`/`buildPowertrain`/`dynSetup`); screen is y-down so normal `n = (−ty, tx)` points visually right; stations at uniform arc length with wrapping indices; speed tables are 0.5 m/s steps to `VMAX = 110`.
- The optimiser's edge handling is a stiffening penalty, deliberately not a clamp (a clamp creates apex curvature kinks the lap model exploits).
