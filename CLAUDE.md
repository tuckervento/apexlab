# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Apex Lab: finds the minimum-time racing line around a closed circuit for a configurable car, then checks how much of that pace a time-stepped bicycle model can hold. Currently a single-file prototype (`apex-lab.html`, ~1230 lines, no build, no dependencies, no package.json). `ARCHITECTURE.md` is the detailed reference (conventions, physics rules, optimiser stages, data shapes, protocol/migration plan) — read it before changing physics.

## Running and testing

- **Run:** open `apex-lab.html` in a browser. Only external resource is Google Fonts.
- **Test:** `node --test tests/` (Node's built-in runner, zero deps; ~80 s, almost all of it the convergence run). `tests/load-core.mjs` extracts the lines between `// ===== CORE START` … `// ===== CORE END` and `// ===== DYN START` … `// ===== DYN END` (plus the `CARS`/`TRACKS` presets) from the HTML and evaluates them in a fresh `vm` context per call; it throws if a marker is missing or duplicated or a block references the DOM. Set `APEX_HTML=<path>` to test a different copy of the page.
- All six `ARCHITECTURE.md` §8 checks are ported: gradient, convergence, skidpad, and `golden.test.mjs` (centreline laps plus dynamic checks on 24 committed converged lines). Each check has **property** assertions (physical sanity bounds) and **golden** assertions (bit-exact against `tests/golden.json`). No linter or build exists.
- **Goldens:** any intended physics change breaks them by design. Regenerate with `node tests/make-golden.mjs --write` (~5 min), then review the `golden.json` diff before committing. A mechanical refactor (migration step 2) must leave them passing untouched. They are per-runtime: a different V8 build fails every golden assertion loudly, naming both versions.
- The gradient check measures error against `Σ|grad_i·d_i|`, not the net directional derivative: random directions can cancel ~10⁵×, which makes FD roundoff look like a failure.

## Architecture (big picture)

Everything is one `<script>` block in three layers; the CORE and DYN layers have no DOM access and must stay that way (the planned worker/module split depends on it).

1. **CORE** — track (`genCtrl` → `buildTrack` spline → `makeBounds`), car (`buildCar` precomputes speed-indexed limit tables incl. the GGV), quasi-steady-state lap model `lapEval`, and `Optimizer` (staged spline L-BFGS).
2. **DYN** — `dynNominal` (inverse dynamics), `dynLap` (4 ms time-stepped lap with feedforward+feedback driver), `DynCheck` (bisects the fastest clean fraction of lap-model pace).
3. **App** — globals (`P`, `car`, `T`, `B`, `off`, `opt`, `disp`, `dyn`, `dynRes`…), a `requestAnimationFrame` loop giving the optimiser ~10 ms/frame on the main thread, canvas drawing, charts, controls.

Key couplings that span the file:
- `Optimizer` mutates the same `off` array the renderer reads; the UI reads globals directly. `refreshDisplay()` re-runs `lapEval` to build the `disp` snapshot used by drawing.
- Chart/readout code reads raw `CarModel` tables and calls `dynNominal` from the display path (so table renames break views).
- `carChanged()` is the slider-change path: rebuilds car (~60 ms), bounds, re-scores the optimiser (restarts at stage 3), recomputes the reference lap.
- `frame()`/`frameBody()` catch exceptions and show them in the status chip rather than killing the loop — a past silent freeze was a missing `Optimizer.clamp` at convergence.

## Things that bite

- **`lapEval` has a hand-written exact adjoint gradient.** Any change to `lapEval` (including yaw limit, shift losses, GGV interpolation) must be re-checked against central finite differences (≥4 sig figs, hard and `tau > 0` modes).
- **Non-re-entrant hidden state:** `vCorner` returns its derivative via module-level `VC_D`; `lapEval` uses shared scratch `_t1/_t2/_t3`; `DYN` gains are a mutable global.
- **Preset circuits are seeds** into `genCtrl`/`buildTrack`; changing either changes every preset and invalidates golden lap times (GT racer on seed 27, 12 m width: 78.3771 s for a single run from the centreline in Node v26.12.0; restarts scatter ~78.28–78.40 s; Node and Chrome differ by tens of ms, so golden values are per-runtime; dynamic check 97.8%). Changing either also requires regenerating `tests/golden.json`.
- **Conventions:** SI internally (UI params are km/h, %, kW, deg, converted in `buildCar`/`buildPowertrain`/`dynSetup`); screen is y-down so normal `n = (−ty, tx)` points visually right; stations at uniform arc length with wrapping indices; speed tables are 0.5 m/s steps to `VMAX = 110`.
- **Dead code** (don't extend, safe-to-remove candidates per ARCHITECTURE.md §12): `crPoint`, `HillClimb`, `sig`, `softplus`, `DYN.maxIter`, `DYN.look`.
- The optimiser's edge handling is a stiffening penalty, deliberately not a clamp (a clamp creates apex curvature kinks the lap model exploits).
