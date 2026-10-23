# Apex Lab — Architecture

Apex Lab finds the minimum-time racing line around a closed circuit for a configurable car, then checks how much of that pace a time-stepped vehicle model can actually hold.

This document describes the current code (physics in ES modules under `src/`, the app in `index.html`; the original single-page prototype is frozen in `prototype/apex-lab.html`) and the plan for splitting it into a physics core, a solver that runs off the main thread, and interchangeable views (the existing 2D map first, a 3D view later).

---

## 1. Status

- **Layers** (migration steps 1–3 done):
  - `src/core/` — `constants`, `rng`, `units`, `powertrain`, `car`, `track`, `lap`, `optimiser` (+ `index.js`). Track, car, lap model, optimiser. No DOM, no module-level mutable state.
  - `src/dynamics/` — `bicycle` (model, inverse dynamics, `dynLap`), `check` (`DynCheck`). No DOM.
  - `src/app/presets.js` — `CARS`, `TRACKS`.
  - `index.html` — markup, CSS, and the app as one inline module script: state, frame loop, canvas drawing, charts, controls.
- **The physics code was moved verbatim** from the prototype's `CORE`/`DYN` blocks. `tests/parity.test.mjs` checks the modules against `prototype/apex-lab.html` bit for bit.
- **Run:** `node serve.mjs`, then open `http://localhost:8000`. Browsers don't load ES modules or Workers from `file://`. `serve.mjs` is a zero-dependency static server bound to 127.0.0.1.
- **No build step, no dependencies.** Fonts load from Google Fonts; nothing else is external.

---

## 2. Conventions

| Thing | Convention |
|---|---|
| Units | SI internally: m, s, kg, N, rad, m/s. Car parameters are entered in mixed units (km/h, %, kW, degrees) and converted once, by `carSpec` (`src/core/units.js`), into the SI `CarSpec` stored as `car.spec`. Nothing past that boundary reads UI units. |
| World frame | 2D, metres. The canvas maps world to screen with **y pointing down**. |
| Stations | The circuit is resampled at uniform arc length, `N = clamp(round(L / 4 m), 240, 1600)`. Index arithmetic wraps (closed loop). Station `i` on the centreline and station `i` on the racing line correspond. |
| Normal | `n = (−ty, tx)`, the tangent rotated +90° in the numbers' own frame. A positive offset moves along `n`. |
| Curvature | Signed; positive means the path bends toward `n`. Computed from three consecutive points. |
| Racing line | A lateral offset per station along the centreline normal: `p_i = c_i + n_i · off_i`. |
| Speed tables | Indexed in 0.5 m/s steps from 0 to `VMAX = 110 m/s` (`NT = 221` entries). Above `VMAX` values clamp. |

Because the screen is y-down, `n` is drawn on the visual right-hand side of the direction of travel. The physics never depends on this; it matters only when a new view (for example a y-up or z-up 3D scene) consumes the same numbers. See §9.

---

## 3. Layers and public functions today

### 3.1 Core

| Function | Purpose | Notes |
|---|---|---|
| `genCtrl(seed, width) → ctrl[]` | Procedural circuit: 9–15 control points, a star-shaped polygon with random radii; retries until valid. | Seeded RNG (`mulberry32`). Preset circuits are just seeds. |
| `buildTrack(ctrl, width) → Track` | Periodic C² cubic spline through the control points (chord-length knots), sampled densely (~0.25 m), resampled to stations. Computes centreline points, normals, smoothed curvature `kc`, minimum radius and an `issue` string for overlaps or too-tight corners. | C² matters: an earlier Catmull-Rom spline had curvature steps at every control point, which every racing line inherited. |
| `makeBounds(Track, CarModel) → {lo, hi, hw}` | Usable lateral range per station: half width minus half the car's width, plus a fold limit `|off| < 0.8 / |kc|` on the inside of tight corners. | |
| `carSpec(params) → CarSpec` | Validates `CarParams` and converts them to SI (§7). | Throws on any missing, non-finite or invalid field; no defaults. Result is frozen. |
| `buildCar(params) → CarModel` | Calls `carSpec`, then precomputes every speed-indexed limit table (§4). | About 60 ms; called on every slider change. `car.spec` is a frozen snapshot, not the caller's object. |
| `lapEval(Track, CarModel, off, Scratch, grad?, tau?, lim?) → lapTime` | Quasi-steady-state lap of a given line. Fills `Scratch` with points, step lengths, curvature, speeds. Optionally writes the **exact gradient** `dT/d(off)` into `grad`. | `tau > 0` softens every hard `min()` for the optimiser. `lim = {cap, bs, ts}` adds per-station speed caps and braking/traction scales (no gradient). |
| `class Optimizer` | `setup(Track, CarModel, Bounds, off)`, `step() → improved`, `rescore(CarModel, Bounds)`, plus `best`, `converged`, `stageInfo`, `evals`, `exactLap()`, `clamp(x)`. | **Mutates `off` in place.** See §5. |
| `vCorner`, `tabAt`, `tab2`, `gg2`, `smin`, `solveDec`, `enginePower`, `buildPowertrain` | Helpers. | `vCorner(car, k, kc, out)` writes speed and `dv/d|k|` into `out`, like `tab2`/`gg2`. `lapEval`'s small output buffers live in `Scratch` (`t0`–`t3`), so it keeps no module-level state. |

### 3.2 Dynamics

| Function | Purpose |
|---|---|
| `dynSetup(CarModel) → dc` | Bicycle-model constants: CG distances, yaw inertia, Pacejka shape, brake and drive split. |
| `dynNominal(CarModel, dc, line, v[]) → Nominal` | Inverse dynamics along the line at given speeds. Returns per-station steering, sideslip, yaw rate, longitudinal force, slip angles, and **per-axle grip utilisation** `uf`, `ur`. |
| `dynLap(Track, CarModel, dc, line, v[], keepTrace) → LapRun` | One time-stepped lap (4 ms steps) with a feedforward-plus-feedback driver. Returns time, trouble stations, spin/off flags, maxima, and optionally a trace. |
| `class DynCheck` | `new DynCheck(Track, CarModel, off)`, `step()` (one simulated lap per call), `done`, `result`. Bisects the highest uniform fraction of lap-model pace the car completes cleanly. |

### 3.3 App (everything else)

Global state (`P`, `car`, `T`, `B`, `off`, `opt`, `disp`, `ghost`, `hist`, `cam`, `dyn`, `dynRes`, …), a `requestAnimationFrame` loop that gives the optimiser about 10 ms per frame (7 ms on narrow screens) on the main thread, `refreshDisplay()` which re-runs `lapEval` to produce the display snapshot `disp`, canvas drawing, charts and controls.

The frame loop is wrapped so an exception pauses the search and shows in the status chip instead of stopping the loop. This exists because of a real bug: a missing `Optimizer.clamp` threw at convergence and froze the page silently.

---

## 4. What sets the car's limits

### 4.1 Tyre law

Every limit derives from one function: peak tyre force `F = μ_eff · Fz`, with load sensitivity

```
μ_eff = μ · max(0.25, 1 − sens · (Fz / FZ0 − 1)),   FZ0 = 3500 N
```

so every bit of load transfer costs total grip.

### 4.2 Axle loads

- **Static:** mass × g split by weight distribution (`rear`).
- **Downforce:** `½ρ·CL·A·v²`, split by aero balance (`aeroF`).
- **Longitudinal transfer:** `m·ax·h / wheelbase`.
- **Lateral transfer:** `m·ay·h / track width`, split between axles by roll stiffness (`rollF`).

### 4.3 Tables built by `buildCar` (per 0.5 m/s)

- **`alat`:** steady-state lateral limit. Each axle must carry the lateral force for the mass it supports; the limit is the axle that saturates first (`limF` records which: front means understeer).
- **`kcrit`, `kcF`, `kcR`:** `ay / v²` for the car and for each axle. Corner speed is the inverse lookup.
- **`ggB`, `ggT` (GGV, `NT × NQ`, `NQ = 33`):** for each speed and lateral fraction `q = ay / alat`, the largest braking deceleration and drive acceleration that keep **both** axles inside their own friction circles, with load transfer, fixed brake bias, and the driven axle(s). This replaced a whole-car friction ellipse, which overestimated rear grip under trail braking by about 40%.
- **`drv`:** tractive force envelope from the powertrain:
  - **EV:** single fixed reduction; constant torque up to `evBase`, constant power above it, zero above `evMax`.
  - **ICE:** Leiderman-type power curve `P(n) = Pmax (c1 n + c2 n² − c3 n³)`, shaped so torque peaks at `nT`, through `gears` ratios spaced geometrically between 1st-gear and top-gear speed at redline. The best gear is taken at every speed; below 1st gear's minimum rpm the clutch slips at constant force.
- **`brk`, `trc`:** pure-longitudinal limits (for charts and readouts).
- **`vTop`:** where drive force meets drag plus rolling resistance (or the rev limit).
- **Yaw:** `Izz = yawDI · m · a · b`, with lengths `lF = yawDI · a` and `lR = yawDI · b` (`a`, `b` are CG-to-axle distances).

Drivetrain efficiency `ETA = 0.9` and rolling resistance `CRR = 0.012` are constants.

### 4.4 Rules applied by `lapEval`

1. **Geometry:** line points from offsets, step lengths, three-point curvature.
2. **Corner speed per station** is the softer minimum of:
   - the steady lateral limit at `|k|`, and
   - the **yaw limit**: an effective curvature `|k| + l · |dk/ds|` checked against one axle's own limit. Tightening into a turn (`d|k|/ds > 0`) needs spare front grip, using `lF`; unwinding needs spare rear grip, using `lR`.
3. **Forward pass** from the slowest station:
   - acceleration is the smaller of GGV traction and the drive envelope, minus drag and rolling;
   - **upshifts** (with hysteresis) subtract the work drive would have done during `shiftT`.
4. **Backward pass:** deceleration is GGV braking plus drag and rolling.
5. **Each 4 m step uses the more heavily loaded of its two ends** for `q`. Without this, corner entries were optimistic.
6. **Speed** is the minimum of the two passes; **lap time** is the trapezoid sum.

### 4.5 Gradient

The reverse pass is hand-written and exact through every step above, including the yaw term, shift losses and GGV interpolation. It has been checked against central finite differences to at least four significant figures in both hard and softened (`tau > 0`) modes. **Any change to `lapEval` must keep this check passing** (§8).

### 4.6 Hard-coded ceilings

- Speed tables stop at 110 m/s (about 396 km/h).
- Tyre peak is never below 25% of μ·Fz.
- The track fold limit is 0.8/|k|.

---

## 5. Optimiser

- **Representation:** the line is a periodic cubic B-spline of lateral offsets. Offsets are evaluated at stations; the gradient flows to the knots.
- **Track edges** are a stiffening quadratic penalty, not a clamp. A clamp leaves a kink at every apex, a spike in curvature that the lap model exploits; with the penalty the line meets the kerb tangentially. Removing those kinks made optimised laps about 2.4 s faster on the reference circuit.
- **Stages** run coarse to fine; each is L-BFGS (memory 20, Armijo backtracking) until improvement stalls:

| Stage | Knot spacing | Soft-min width `tau` (m/s) | Edge penalty |
|---|---|---|---|
| 1 | 48 m | 3 | 2 |
| 2 | 24 m | 1 | 10 |
| 3 | 12 m | 0.3 | 50 |
| 4 | 8 m | 0.08 | 300 |
| 5 | 6 m | 0 (exact) | 2000 |
| 6 | — | 0 | local polish: random smooth bumps on the knots, kept if faster |

- **Done** when the polish has gone 3000 tries without gaining 1 ms; the final line is clamped to the bounds.
- **Re-scoring** after a car change restarts at stage 3 from the current line.
- **Starting point** doesn't matter much: six different starts finish within 0.02–0.2 s of each other.

---

## 6. Dynamic check

**Purpose:** measure how much of the lap model's pace a car with yaw inertia, tyre slip, load-transfer lag and a steering-rate limit can hold on the optimised line.

**Model (`dynLap`):**
- **State:** position, heading, body velocities `vx`, `vy`, yaw rate.
- **Tyres:** each axle has `Fy = D · sin(C · atan(B·α))` with `C = 1.45` and `B` set by the peak slip angle (`slipPk`). Peak `D` uses the same tyre law and load model as §4, with load transfer filtered at 60 ms.
- **Combined slip:** longitudinal force takes its share of each axle's friction circle first.
- **Integration:** 4 ms explicit steps.

**Driver:** inverse dynamics plus feedback.
- `dynNominal` solves the bicycle model backwards along the line: lateral and yaw-moment balance give the axle forces, the tyre curve gives slip angles, kinematics give steering and sideslip.
- The car applies that nominal steering and longitudinal force, plus corrections: path gain 15/v, heading 2.5, yaw rate 0.3, small integral; speed proportional gain 1.5 s⁻¹.
- Steering is limited to ±0.6 rad and 1.5 rad/s.
- Two earlier ad-hoc drivers produced spins that were controller artefacts rather than physics; that is why this design was chosen.

**Trouble and abort:**
- *Trouble* is more than 0.5 m past the usable edge, or sideslip more than 0.1 rad away from nominal.
- A lap *aborts* beyond 3 m or 0.45 rad.

**Check (`DynCheck`):**
1. Inverse-dynamics utilisation on the lap model's own profile.
2. Bisection of the highest uniform fraction of lap-model speed the car completes cleanly, from 80% to 100%, to 0.4%.
3. The first failure just above that fraction.

**Reading the result:** the driver is not perfect, so the margin is a lower bound, repeatable to about ±0.5%. Inverse utilisation on the lap model's profile peaks at 103–106% (95th percentile about 103%), so the two models agree to within a few percent.

---

## 7. Data shapes

### `CarParams` (as the UI edits them)

```ts
{
  mass: kg, cg: m, track: m, wb: m, rear: %, rollF: %, yawDI: number,
  pt: 'ICE' | 'EV', power: kW, drive: 'RWD' | 'AWD',
  evBase: km/h, evMax: km/h,                               // EV
  nT: %, nRed: %, gears: int, v1: km/h, vTopG: km/h, shiftT: s,  // ICE
  cla: m², aeroF: %, cda: m²,
  brakeF: %,
  mu: number, sens: number, slipPk: deg
}
```

### `CarSpec` (`car.spec`, SI; built by `carSpec`)

Fields whose unit changes are renamed, so a reader that still expects UI units fails.

```ts
{
  mass, cg, track, wb, yawDI, pt, drive, gears, shiftT, cla, cda, mu, sens,   // unchanged
  wr, rF, aF, bF,                     // rear, rollF, aeroF, brakeF: % → fraction
  Pmax,                               // power: kW → W
  vBase, vMotor, vGear1, vGearTop,    // evBase, evMax, v1, vTopG: km/h → m/s
  nTorque, nRedline,                  // nT, nRed: % → fraction of power-peak rpm
  slipPeak                            // slipPk: deg → rad
}
```

### `Track`

```ts
{ N, L, ds, cx[], cy[], nx[], ny[], kc[], width, issue: string | null, minR, ctrl }
```

### `Scratch` after `lapEval`

```ts
{ px[], py[], ds[], k[], vc[], vf[], vb[], v[], …adjoint buffers }
```

### Display snapshot (`disp`, built by `refreshDisplay`)

```ts
{ px[], py[], v[], ds[], k[], tc[] /* cumulative time, length N+1 */, t, vmin, vmax, u[] | null }
```

### `DynCheck.result`

```ts
{
  qss, frac,
  dyn: { t, trace: { x[], y[], v[], e[], t[], st[] } } | null,
  fail: { fr, at, spun } | null,
  umax, uat, uaxle, uf[], ur[], iters
}
```

All per-station arrays are `Float64Array` of length `N`.

---

## 8. Verification (port these first)

All six checks are ported to `tests/` (run with `node --test tests/`, ~15 s), which imports the `src/` modules (`tests/load-core.mjs`; `APEX_SRC=<dir>` loads a modified copy). Each check is split into **property** assertions (physical sanity) and **golden** assertions (bit-exact against `tests/golden.json`).

1. **Gradient check** (`gradient.test.mjs`). On a random smooth offset field, compare the analytic gradient with a central finite difference along a random direction, in hard mode and with `tau = 0.5`, for all six presets, h = 1e-6. The error is measured against the gradient's scale `Σ|grad_i·d_i|`, not the net directional derivative, and must be below 1e-6. A random direction can cancel to a net 10⁵× smaller than its terms (Open-wheeler on Harrow Ring), so a net-relative "4 significant figures" fails on finite-difference roundoff alone (the lap time carries ~1e-12 s of rounding noise). The hard-mode run also asserts that the yaw limit binds and, for cars with shift time, that an upshift happens, so those adjoint branches are exercised. Single-line sign flips in the yaw and shift-loss adjoints both fail this test.
2. **Run to convergence** (`convergence.test.mjs`). Drive `Optimizer.step()` until `converged`, polish included, GT racer on Harrow Ring. This would have caught the `clamp` freeze (verified: deleting `clamp` fails with a stack trace on the HTML line). Golden: lap, evaluation and step counts, and every station of the converged line match the fixture bit for bit.
3. **Determinism and golden values** (`golden.test.mjs`, `make-golden.mjs`). Same seed and parameters give the same results, bit for bit, **within one JS runtime**. Node and Chrome compute the track geometry differently in the last bits (starting in `buildTrack`), and the optimiser's endpoint is chaotic, so their converged laps differ by tens of ms (`investigations/golden-lap.md`).
   - `tests/golden.json` holds, for all 6 cars × 4 circuits: the centreline lap, the line converged from the centreline (the *fixture*) with its lap and optimiser effort, and the dynamic-check result on it, including the final traced lap's error maxima and mean error. It also holds the skidpad results. Its `meta` records Node/V8, commit, and a SHA-256 of the physics source.
   - Regenerate with `node tests/make-golden.mjs --write` (~30 s, one child process per combo) after an intended physics change, and review the diff. If the V8 build differs from `meta`, every golden assertion fails with both versions named; property assertions still run.
   - Reference: GT racer on Harrow Ring (seed 27, 12 m), single run from the centreline: **78.3771 s** in Node v26.12.0 and v26.12.1 (V8 14.6.202.34); 78.348 s in Chrome 153. Restarting ("Search again") is a fresh draw, not a refinement: six consecutive restarts in Chrome gave 78.278–78.398 s.
   - Teeth: `CRR` 0.012 → 0.0121 fails every lap golden; `DYN.kr` 0.3 → 0.31 fails every dynamic golden and the skidpad goldens while all property checks still pass.
4. **Skidpad** (`skidpad.test.mjs`). Road car, 80 m circle (a 16-point spline, so |k| ripples ±1.4%), constant speed at 90/95/98% of the lap model's v² there. Property: a clean lap and mean lateral error ≤ 0.2 m. Measured with the current driver gains: 0.059 / 0.068 / 0.077 m (still clean at 100%: 0.088 m).
5. **Model consistency** and 6. **Margin table** (`golden.test.mjs`, on the 24 fixtures). The prototype's figures, utilisation ≤ ~1.06 and a margin of 92–99%, hold only for the GT racer and Open-wheeler on the current code. The properties are sanity bounds every preset meets: dynamic-check fraction in [0.85, 1], utilisation ≤ 1.15, and a clean final lap. Measured (fraction % / peak utilisation):

   | Car | Harrow Ring | Kestrel Point | Millbrook Park | Saltmarsh |
   |---|---|---|---|---|
   | Road car | 91.3 / 1.052 | 91.6 / 1.059 | 97.2 / 1.055 | 92.8 / 1.083 |
   | Hot hatch AWD | 98.1 / 1.117 | 97.5 / 1.073 | 97.8 / 1.073 | 98.4 / 1.083 |
   | EV saloon | 97.2 / 1.042 | 96.2 / 1.053 | 95.0 / 1.110 | 97.5 / 1.114 |
   | GT racer | 97.8 / 1.043 | 96.6 / 1.051 | 97.2 / 1.054 | 97.2 / 1.043 |
   | Open-wheeler | 96.6 / 1.055 | 96.9 / 1.045 | 97.2 / 1.039 | 95.9 / 1.050 |
   | Kart | 99.1 / 1.039 | 100 / 1.039 | 100 / 1.096 | 99.7 / 1.046 |

Golden values depend on `genCtrl` and `buildTrack`. Any change to the generator or spline changes every preset circuit, so tag golden values with a track-generator version.

---

## 9. Coupling to remove

1. **Shared mutable state.** The optimiser mutates the same `off` array the renderer reads; UI functions read globals (`car`, `T`, `off`, `P`) directly.
2. **One thread.** The optimiser and the dynamic check run inside the frame loop. A heavier view (3D) would compete with the solver for frame time.
3. **Views reach into internals.**
   - The tractive-force chart and balance readout read raw `CarModel` tables (`drv`, `trc`, `gearF`, `alat`, `limF`, `brkF`).
   - Tyre-use colouring calls `dynNominal` from the display path.
4. **No pose contract.** The car's position is interpolated inside the 2D drawing code (`carState`).
5. **Staleness is ad hoc.** `dynStale` is a flag compared against lap time, not a revision.
6. **Flat world.** No elevation, grade or banking; y-down screen convention.

---

## 10. Target architecture

```
src/
  core/          pure functions, no DOM, no module-level mutable state
    units        parameter normalisation (km/h, %, kW, deg → SI) at the boundary
    tyre         tyre law, axle capacities
    car          buildCar: lateral tables, GGV, yaw constants
    powertrain   EV and ICE envelopes, gear table
    track        spline, resampling, bounds, (later) elevation/bank
    lap          lapEval + adjoint
    optimiser    staged spline L-BFGS + polish
  dynamics/      bicycle model, inverse dynamics, check
  solver/        Web Worker that owns Optimizer and DynCheck; message protocol
  playback/      pose(t) from a lap result or a dynamic trace; race clock for ghosts
  views/
    map2d/       current canvas map + charts, as a client of the protocol
    scene3d/     future
  app/           state store, controls, wiring
tests/
```

### 10.1 Solver protocol (worker boundary)

**Commands** (main thread → worker):

```ts
{ type: 'setCar',   rev, params: CarParams }
{ type: 'setTrack', rev, spec: { ctrl, width } | { seed, width } }
{ type: 'setLine',  rev, off?: Float64Array }   // omit off = centreline
{ type: 'run' } | { type: 'pause' }
{ type: 'dynCheck', lineRev }
{ type: 'describeCar' }                          // chart-ready data, so views never touch tables
```

**Events** (worker → main thread):

```ts
{ type: 'progress',  stage, of, knot, evals, lap }
{ type: 'snapshot',  carRev, trackRev, lineRev, lap, line: { px, py, v, k, ds, tc, u? } }   // throttled ~10–20 Hz
{ type: 'track',     trackRev, cx, cy, nx, ny, kc, width, corners, issue }
{ type: 'carInfo',   carRev, curves: { drive, gears[], traction, resist }, balance, derived }
{ type: 'dynProgress', lap } | { type: 'dynResult', lineRev, result }
{ type: 'error',     message, stack }
```

- **Revisions** replace the staleness flags: a view drops anything tagged with an older revision, and a dynamic result is current only while its `lineRev` matches.
- **Arrays** cross the boundary as copied or transferred `Float64Array`s. The worker keeps its own working copy and never shares memory with views.

### 10.2 Pose contract (shared by every view)

```ts
pose(source: LapSnapshot | DynTrace, t: seconds) → {
  station, s, x, y, z, heading, speed, ax, ay, gear, rpm,
  // later, from the dynamic model or an attitude estimate:
  pitch?, roll?, steer?, slipF?, slipR?
}
```

- The lap model gives heading from the line tangent.
- The dynamic trace gives true yaw and sideslip, so it should record heading and steering, not just `x, y, v`.
- The race clock (both cars leave together; the quicker waits at the line) lives in `playback`, not in a view.

### 10.3 Track model for elevation and 3D

Elevation changes both physics and rendering, so design the per-station track record once:

```ts
station: { s, x, y, z, tangent, lateral /* banked */, up, widthL, widthR, grade, bank, kH /* horizontal */, kV /* vertical */ }
```

Physics consequences to plan for:
- **Grade** adds `±g·sin(grade)` to both passes.
- **Vertical curvature** scales normal load (`g·cos + v²·kV`): crests unload, compressions load. That needs a load-factor dimension in the GGV, or a scaling approximation.
- **Bank** adds a gravity component to lateral grip.

Pick the world frame for 3D explicitly. Recommended: right-handed, z-up. Converting from the prototype's y-down numbers flips handedness, so curvature signs and the meaning of positive offset must be converted at import, not patched in views.

---

## 11. Migration plan

Each step keeps behaviour identical and is checked against §8.

1. ✅ **Commit the prototype as-is**, plus a Node harness that extracts the `CORE` and `DYN` blocks and runs the §8 tests.
2. ✅ **Split mechanically** into modules with no logic changes. Golden lap times must match bit for bit. Done: goldens unchanged; dead code removed in a follow-up commit, also bit-identical.
3. ✅ **Remove hidden state from the core:**
   - ✅ the `VC_D` side channel;
   - ✅ module-level scratch `_t1`, `_t2`, `_t3` (both now live in `Scratch`);
   - ✅ mutable `DYN` gains (now one frozen literal);
   - ✅ presets defined next to the UI (moved to `src/app/presets.js` in step 2; frozen in step 3).

   ✅ Normalise parameter units at the boundary (`carSpec`). Goldens and prototype parity unchanged, bit for bit.
4. **Add `describeCar()`** and move chart and readout data behind it.
5. **Move the optimiser and dynamic check into a worker** behind the protocol. The main thread renders snapshots only.
6. **Port the 2D map and charts** as the first protocol client. Compare against prototype screenshots.
7. **Add `playback.pose()`**; the 2D car marker and ghost use it.
8. **Elevation:** the track record (§10.3), physics terms, golden-value refresh with a new track-generator version.
9. **3D view** as a second client of the protocol and pose contract.

---

## 12. Known issues and cleanup

- **Preset circuits are seeds.** Any change to the generator silently changes them; store generated control points as data files instead.
- **`buildCar` costs about 60 ms**, the GGV bisections included. Fine on slider release; heavy on continuous drag. Consider fewer bisection steps, or memoising by parameter hash.
- **The dynamic check's driver gains were tuned on the GT and road presets.** Very different cars may need retuning before the margin can be trusted.
- **Lap model and dynamic model disagree more for some presets** (§8.5/8.6 table): Hot hatch AWD and EV saloon reach inverse-dynamics utilisation 1.11–1.12; the Road car holds only 91% of lap-model pace on two circuits; the Kart reaches 100% (the check can't find its limit). Not investigated: it could be the lap model, the bicycle model or the driver.

---

## 13. Not modelled yet

Elevation, grade and banking; tyre temperature and wear (needs a stint model and the slip energy from §6); battery and thermal derating; aero changes with ride height; 2-speed EV gearboxes; transient tyre relaxation length; differential behaviour.
