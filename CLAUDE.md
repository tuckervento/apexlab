# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Apex Lab: finds the minimum-time racing line around a closed circuit for a configurable car, then checks how much of that pace a time-stepped bicycle model can hold. Currently a single-file prototype (`apex-lab.html`, ~1230 lines, no build, no dependencies, no package.json). `ARCHITECTURE.md` is the detailed reference (conventions, physics rules, optimiser stages, data shapes, protocol/migration plan) — read it before changing physics.

## Running and testing

- **Run:** open `apex-lab.html` in a browser. Only external resource is Google Fonts.
- **No test suite, linter or build exists yet.** Physics is verified headless in Node by extracting the lines between `// ===== CORE START` … `// ===== CORE END` and `// ===== DYN START` … `// ===== DYN END`, concatenating them, and running harnesses against that. `ARCHITECTURE.md` §8 lists the checks (gradient vs finite differences, run-to-convergence, golden lap times, skidpad, model consistency). The harness itself is not in the repo.

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
- **Preset circuits are seeds** into `genCtrl`/`buildTrack`; changing either changes every preset and invalidates golden lap times (GT racer on seed 27, 12 m width ≈ 78.29 s converged; dynamic check ≈ 97.8–98.1%).
- **Conventions:** SI internally (UI params are km/h, %, kW, deg, converted in `buildCar`/`buildPowertrain`/`dynSetup`); screen is y-down so normal `n = (−ty, tx)` points visually right; stations at uniform arc length with wrapping indices; speed tables are 0.5 m/s steps to `VMAX = 110`.
- **Dead code** (don't extend, safe-to-remove candidates per ARCHITECTURE.md §12): `crPoint`, `HillClimb`, `sig`, `softplus`, `DYN.maxIter`, `DYN.look`.
- The optimiser's edge handling is a stiffening penalty, deliberately not a clamp (a clamp creates apex curvature kinks the lap model exploits).
