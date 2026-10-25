# Apex Lab — Architecture

Apex Lab finds the minimum-time racing line around a closed circuit for a configurable car, then checks how much of that pace a time-stepped vehicle model can actually hold.

This document describes the current code (physics, solver, views and app in ES modules under `src/`; `index.html` is markup and CSS; the original single-page prototype is frozen in `prototype/apex-lab.html`) and the plan for splitting it into a physics core, a solver that runs off the main thread, and interchangeable views (the existing 2D map first, a 3D view later).

---

## 1. Status

- **Layers** (migration steps 1–7 done):
  - `src/core/` — `constants`, `rng`, `units`, `powertrain`, `car`, `describe`, `track`, `lap`, `optimiser` (+ `index.js`). Track, car, view data, lap model, optimiser. No DOM, no module-level mutable state.
  - `src/dynamics/` — `bicycle` (model and inverse dynamics), `plant` (integration and automatic gearbox), `observe` (scalar observations), `lap` (legacy `dynLap` orchestration), `check` (`DynCheck`). No DOM.
  - `src/solver/` — `solver` (`Solver`: owns car, track, line, `Optimizer`, `DynCheck`; speaks the §10.1 protocol; no DOM, no worker APIs), `worker` (Web Worker adapter).
  - `src/views/` — `format` (`fmtTime`); `map2d/`: `camera` (world ↔ screen, fit, follow framing, zoom), `colors` (palette from CSS), `map` (`drawMap`, `findCorners`), `charts` (speed, convergence, gap, force). Views draw from explicit inputs and never read app state.
  - `src/playback/` — `pose` (`pose(source, t, info?)` along a lap snapshot or a dynamic trace; `raceClock`). No DOM.
  - `src/app/` — `state` (`S`, the one app state object), `client` (solver-worker protocol client), `controls` (side panel, buttons, actions), `telemetry` (live readout, map-tag text), `main` (map input, frame loop, HUD, boot), `presets` (`CARS`, `TRACKS`), `sliders` (the car slider table), `simple` (simple car controls: base car and knobs → `CarParams`), `runfile` (saved-run file format, §7), `physics-version` (generated hash of the physics source, §7).
  - `index.html` — markup and CSS, plus `<script type="module" src="./src/app/main.js">`.
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

The dynamic plant and driver are separate. `createPlant(car, initial)` creates vehicle state;
`plantStep(state, {steer, fx}, car, dc, line, station, dt)` advances it, including steering-rate limits,
automatic gear selection, shift interruption and force saturation. `observe(state, line, station, t)` returns
fresh scalar observations. Neither the plant nor observations import driver code.

`src/drivers/reference.js` preserves the original controller behind `init(ctx)` and `step(state, obs)`.
`dynLap(..., keepTrace, driver?)` defaults to that driver; its legacy start, finish and driver-relative
trouble tests remain unchanged. Driver initialization receives copies of the car, line and speed plan;
per-step observations contain scalar copies, no references to plant state. This interface is not a JavaScript sandbox.

`PHYSICS` hashes core, dynamics and solver source; `DRIVER` hashes the reference driver's own source.
Both manifests live in `src/app/physics-version.js`, regenerated with
`node tests/make-physics-version.mjs --write`. Drivers may use physics helpers: reproducing a dynamic
result requires both identities and the same runtime. Saved runs carry optional separate driver metadata;
older files remain readable but cannot identify their driver separately. Existing snapshot ghosts still
replay their stored samples. Race result files and replay compatibility gating remain future work.

### 3.1 Core

| Function | Purpose | Notes |
|---|---|---|
| `genCtrl(seed, width) → ctrl[]` | Procedural circuit: 9–15 control points, a star-shaped polygon with random radii; retries until valid. | Seeded RNG (`mulberry32`). Preset circuits are just seeds. |
| `buildTrack(ctrl, width) → Track` | Periodic C² cubic spline through the control points (chord-length knots), sampled densely (~0.25 m), resampled to stations. Computes centreline points, normals, smoothed curvature `kc`, minimum radius and an `issue` string for overlaps or too-tight corners. | C² matters: an earlier Catmull-Rom spline had curvature steps at every control point, which every racing line inherited. |
| `genElev(seed, ctrl) → unit heights` | A smooth closed height profile for a circuit's control points (three harmonics of distance along the loop, its own random stream), lowest to highest point 1 apart. The app multiplies it by *Hills* (m). | Step 8. |
| `makeBounds(Track, CarModel) → {lo, hi, hw}` | Usable lateral range per station: half width minus half the car's width, plus a fold limit `|off| < 0.8 / |kc|` on the inside of tight corners. | |
| `carSpec(params) → CarSpec` | Validates `CarParams` and converts them to SI (§7). | Throws on any missing, non-finite or invalid field; no defaults. Result is frozen. |
| `buildCar(params, {loads?}) → CarModel` | Calls `carSpec`, then precomputes every speed-indexed limit table (§4). With `loads: true` also `car.load`, the grip tables at 17 load factors (§4.7). | About 16 ms in Node v26 (measured in step 8; older notes said 60 ms), ~250 ms with `loads`; called on every slider change. `car.spec` is a frozen snapshot, not the caller's object. |
| `describeCar(CarModel) → CarInfo` | Chart- and readout-ready car data: force curves on the speed grid, the balance readout, top speed, power/weight (§7). | The only car data views read; they treat `car` as an opaque handle. Arrays are copies. Becomes the `carInfo` payload in step 5. |
| `lapEval(Track, CarModel, off, Scratch, grad?, tau?, lim?) → lapTime` | Quasi-steady-state lap of a given line. Fills `Scratch` with points, step lengths, curvature, speeds. Optionally writes the **exact gradient** `dT/d(off)` into `grad`. | `tau > 0` softens every hard `min()` for the optimiser. `lim = {cap, bs, ts}` adds per-station speed caps and braking/traction scales (no gradient). |
| `class Optimizer` | `setup(Track, CarModel, Bounds, off)`, `step() → improved`, `rescore(CarModel, Bounds)`, plus `best`, `converged`, `stageInfo`, `evals`, `exactLap()`, `clamp(x)`, `current(out)` (the accepted line: during the polish `off` can hold a rejected candidate). | **Mutates `off` in place.** See §5. |
| `vCorner`, `tabAt`, `tab2`, `gg2`, `smin`, `solveDec`, `enginePower`, `buildPowertrain` | Helpers. | `vCorner(car, k, kc, out)` writes speed and `dv/d|k|` into `out`, like `tab2`/`gg2`. `lapEval`'s small output buffers live in `Scratch` (`t0`–`t3`), so it keeps no module-level state. |

### 3.2 Dynamics

| Function | Purpose |
|---|---|
| `dynSetup(CarModel) → dc` | Bicycle-model constants: CG distances, yaw inertia, Pacejka shape, brake and drive split. |
| `dynNominal(CarModel, dc, line, v[]) → Nominal` | Inverse dynamics along the line at given speeds. Returns per-station steering, sideslip, yaw rate, longitudinal force, slip angles, **per-axle grip utilisation** `uf`, `ur`, and the forces on the car for telemetry: axle tyre forces `Fxf`, `Fxr`, `Fyf`, `Fyr`, axle loads `Wf`, `Wr` (from `axleLoads`, which `axleCaps` also uses), `down` and `drag` (aero + rolling). |
| `dynLap(Track, CarModel, dc, line, v[], keepTrace) → LapRun` | One time-stepped lap (4 ms steps) with a feedforward-plus-feedback driver. Returns time, trouble stations, spin/off flags, maxima, and optionally a trace. |
| `class DynCheck` | `new DynCheck(Track, CarModel, off)`, `step()` (one simulated lap per call), `done`, `result`. Bisects the highest uniform fraction of lap-model pace the car completes cleanly. |

### 3.3 App (everything else)

The optimiser and the dynamic check run in a Web Worker (`src/solver/worker.js` wrapping `Solver`), in back-to-back 15 ms slices while there is work, yielding between slices (through a `MessageChannel`) to take commands. The main thread keeps its state in one object `S` (`src/app/state.js`): the UI parameters `P` (always `carFor(simple, manual)`: a base car, the simple knobs, and fields set by hand in Advanced; §7) and what the worker sent, `T` (track), `disp` (line snapshot), `info` (`describeCar`), `prog` (optimiser progress), `dynRes`, plus its own `ghost`, `hist` and `cam`. `src/app/client.js` applies worker events to `S` and calls UI hooks; `controls.js` owns the panel; `telemetry.js` builds the live readout and the map tags' text; `main.js` runs the frame loop, which passes `S` into the views in `src/views/map2d/`. From core the app uses only `genCtrl`, `genElev` and constants (`G`; `src/app/simple.js`, the simple-controls knob mapping, also reads `RHO`, `ETA` and `CRR`); the views import nothing from core.

- `setCar`/`setTrack` are coalesced: one in flight per kind, and only the latest pending one is sent next, so a slider or handle drag can't queue up ~60 ms rebuilds.
- A snapshot never steps back to an older car or track, and a new track is swapped in together with its first snapshot (stations change with the track).
- Editing the track pauses the worker's search; leaving edit mode resumes it.

Errors are shown in the status chip and pause the search, instead of stopping the page: the worker reports exceptions as `error` events, and the `requestAnimationFrame` loop is wrapped the same way. This exists because of a real bug: a missing `Optimizer.clamp` threw at convergence and froze the page silently.

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

1. **Geometry:** line points from offsets, step lengths, three-point curvature (on hills: 3D steps, horizontal curvature; §4.7).
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

The reverse pass is hand-written and exact through every step above, including the yaw term, shift losses and GGV interpolation, and on hills the load factor's dependence on speed (`dn/du`) and the 3D steps (§4.7). It has been checked against central finite differences to at least four significant figures in both hard and softened (`tau > 0`) modes. **Any change to `lapEval` must keep this check passing** (§8).

### 4.6 Hard-coded ceilings

- Speed tables stop at 110 m/s (about 396 km/h).
- Tyre peak is never below 25% of μ·Fz.
- The track fold limit is 0.8/|k|.

### 4.7 Elevation (step 8): grade, crests and compressions

No banking: a station's height doesn't depend on where the line crosses the track, so every elevation input is a per-station constant from the centreline (`buildTrack`): `z`, `dz` (rise to the next station), `cth` (cos of the grade) and `kv` (vertical curvature, > 0 in a compression). Control points carry `[x, y, z]`, splined like x/y.

- **Flat stays flat, bit for bit.** A station with `dz = 0`, `cth = 1`, `kv = 0` runs the flat code expression for expression, adjoint included (the converged-line goldens depend on the gradient's bits). One height everywhere is flat (`T.flat`). The 24 flat goldens, prototype parity and the pre-elevation run file (`tests/fixtures/`) are unchanged.
- **Gravity, exact.** Steps are 3D (`ds`); gravity does work `m·g·dz` over each, so the forward pass has `− 2g·dz[i]` in `v²` and the braking pass `+ 2g·dz[j]`. Path-independent, so no new gradient path.
- **Load factor.** Static weight counts `n = cth + v²·kv/g` times (downforce and inertial demands unchanged). `buildCar({loads: true})` builds `car.load`: the lateral, `kcrit`/`kcF`/`kcR` and GGV tables at n = 0, 0.125, …, 2 (`gripTables(p, n)`, the flat computation with the weight scaled; n = 1 is the flat car's own). Lookups are linear in n, clamped to [0, 2]: within 0.29% (lateral, n ≥ 0.25) and 0.27 m/s² (GGV) of a direct solve.
- **Corner speed** on a hilly station (`vCornerN`): `vCorner`'s search with each speed node read at the load the station gives at that speed, so crests unload faster cars more. It assumes that limit never rises with speed (pinned by a test over 271,998 node pairs). Within 0.03% of the closed form `v = √(μg / (k − μ·kv))` for a linear tyre.
- **What the lap time hides is reported:** `Scratch.stall` (stations at the 0.1 m/s floor: a climb the car can't make), `.air` (steps read at n ≤ 0; a car with no downforce then has no grip and coasts), `.ntop` (n > 2). Carried on snapshots as `warn`, shown over the map.
- **Simplifications:** grade and `kv` from the centreline, not the line driven (up to 44 ms of lap on 40 m hills); lateral demand uses the 3D speed (about 1.1% pessimistic at 15% grade); rolling resistance stays `g·CRR`; no banking.
- **Cost:** `lapEval` with gradient 366 µs on 40 m hills against 220 µs flat (Harrow Ring, GT racer).
- **Dynamics** (§6) apply the same terms, so the dynamic check stays consistent with the lap model.

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

**On hills** (`grades(T)` gives the line its grade sine, cosine and vertical curvature; step 8): gravity pulls along the road at the car's station, tyre loads use the load factor `n = cth + v²·kv/g`, the nominal force includes `m·g·sinθ`, load transfer comes from the tyre acceleration less drag (as on the flat), and the car covers ground in plan at `v·cosθ`. Checked to track a 6% ramp within 0.033 m/s, and to keep the dynamic-check fraction in [0.85, 1] on 150 m hills (it collapses to 81–92% if the time-stepped car ignores the load factor).

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

The check runs on the line the solver last published, the one on screen, and its result carries that line's revisions (§10.1).

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

### Simple controls (app only; `src/app/simple.js`)

The car panel edits `CarParams` through a base car and seven knobs, each at the top of the section whose sliders it sets
(Powertrain, Chassis, Aero, Tyres, Brakes; `KNOBS_IN` in `controls.js`); nothing below the app layer sees them,
and run files store only the 25 fields.
```
S.simple = { base: { name, car },      // a preset ({name, car: CARS[name]}) or a loaded run's car ('Loaded: …')
             weight, power,            // % from the base (±25, ±50)
             tyre, gearbox,            // 'base' or a compound / gearbox
             downforce, balance,       // CL·A offset (m²), balance −1…1 (understeer…oversteer)
             pt, drive }
S.manual = { field: value, … }         // CarParams fields set by hand in Advanced
S.P      = carFor(S.simple, S.manual)  // deriveParams(S.simple) with S.manual on top
```
Centred knobs give the base back bit for bit (the clamp to the slider ranges widens to the base's own value). A knob
whose `KNOB_FIELDS` are all in `S.manual` is greyed (`knobStates`), one with some is marked; the gearing (`GEARING`)
follows Power, Weight and Downforce as a side effect, so a hand-set gear greys none. Brake bias stays the base car's.

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

### `CarInfo` (built by `describeCar`; all SI)

```ts
{
  vstep, n,                                  // speed grid: sample i is at i·vstep m/s, i < n
  curves: { drive, traction, resist,         // N at the wheels, per sample
            gears: Float64Array[],           // per-gear force, NaN outside its rpm range; [] for EV
            gear: Int8Array,                 // selected gear, 0 = none
            rpm: Float64Array },             // engine speed as a fraction of redline, per sample
  balance: { lateral: [{ kmh: 100, g, axle }, { kmh: 200, g, axle }],   // axle: 'front' | 'rear' (limiting)
             braking: { kmh: 150, g, axle } },                         // first axle to lock
  derived: { vTop /* m/s */, powerToWeight /* kW/t */ }
}
```

Plain objects are frozen; arrays are fresh copies.

### `Track`

```ts
{ N, L, ds, cx[], cy[], nx[], ny[], kc[], width, issue: string | null, minR, ctrl /* [x, y] or [x, y, z] */,
  z[], dz[] /* rise to the next station */, cth[] /* cos of the grade */, kv[] /* vertical curvature, > 0 compression */,
  flat /* true: z constant, so dz 0, cth 1, kv 0 exactly */ }   // elevation from the centreline (no banking); step 8
```

### `Scratch` after `lapEval`

```ts
{ px[], py[], ds[] /* 3D step */, dh[] /* horizontal step, for curvature */, k[], vc[], vf[], vb[], v[], …adjoint buffers,
  stall /* stations held at the 0.1 m/s floor */, air /* pass steps read airborne, n <= 0 */, ntop /* … above the load grid */ }
```

### Display snapshot (`disp`: the `line` of the worker's `snapshot` event, built by `Solver.publish` in `src/solver/solver.js`; `client.js` stores it in `S.disp` with `t`, `vmin`, `vmax` and the three revisions)

```ts
{ px[], py[], v[], ds[], k[], tc[] /* cumulative time, length N+1 */, off[] /* the line's lateral offsets */, t, vmin, vmax, u[] | null,
  phys: { fxf[], fxr[], fyf[], fyr[] /* axle tyre forces */, wf[], wr[] /* axle loads */, uf[], ur[] /* grip use */,
          down[], drag[] /* drag: aero + rolling */, nz[] /* load factor, 1 on level ground */ } }   // N; from dynNominal on the line at v (inverse dynamics)
```

A pinned ghost is a copy of `disp` (with `phys`), plus the car's `wb` and `track`.

### Run file (`src/app/runfile.js`; `*.apexlab.json`)

A car, the circuit it ran on, the line it converged to and the lap that line gave, so a run from an older build can be loaded into a newer one and compared.

```ts
{ format: 'apexlab-run', version: 2, exported: ISO date, userAgent,
  physics: { sha256, live },          // committed hash of the physics source; hash of what the exporting page fetched
  car: CarParams,                     // exactly the 25 fields of §7; no more, no fewer
  track: { name, seed: number | null, width, ctrl: [x, y, z][] },  // control points, not the seed: genCtrl may change
  line: { N, off: number[] },
  result: { lap, converged, evals, ref /* centreline lap */,
            dyn: { frac, t, umax, uaxle, fail } | null,           // only a current dynamic result
            snapshot: { px, py, pz, v, ds, k /* N */, tc /* N + 1 */, phys: { …N each } } } }   // becomes the ghost
```

- **Version identity.** `physics.sha256` is the SHA-256 of `core/`, `dynamics/` and `solver/solver.js` (`runSource()` in `tests/load-core.mjs`; the solver is in because it computes the published lap and telemetry, the presets are out because a file stores its car and circuit in full), committed as `src/app/physics-version.js`. `tests/make-physics-version.mjs --write` regenerates it and `tests/runfile.test.mjs` fails when it is stale, so `git log -S <hash>` finds the commit behind a file. The page also hashes the files it fetched (`liveHash`), so loading can say that it is running uncommitted edits. **The hash identifies source, not results**: a mechanical refactor changes it while the goldens still pass. `golden.json`'s `meta.sourceSha256` is a different, older hash (`coreSource()`, presets included, not kept current).
- **Reading is strict.** `readRunFile` refuses a wrong `format` or `version`, any missing or unknown car field (all named), bad circuit data, wrong array lengths and non-finite numbers. It fills in nothing; a car with a field made up is a different car. A change to the car parameters or this layout bumps `version` and adds an explicit migration then. The first, v1 → v2 (elevation): control points gain z = 0 and the recorded line `pz` = 0, exact because a v1 run can only be flat; the committed v1 fixture (`tests/fixtures/`) must still reload to its recorded lap bit for bit. Value-level car checks are `carSpec`'s, in the worker: physical limits (no mass, an axle with no weight, a torque peak above 75 % of power-peak rpm), not the panel's ranges in `src/app/sliders.js`, so narrowing a slider never refuses an older run file.
- **Loading.** The `load` command (§10.1) replaces car, track and line in one step and publishes the line as given, not as the optimiser's spline fit, so an unchanged build reproduces the recorded lap bit for bit (tested for the GT racer on Harrow Ring). *Load run* stays paused on that line; *Run* then restarts the search from it through the coarse stages. *Load as ghost* keeps the current car and searches from the saved line.
- **Ghost limits.** A ghost needs the saved lap's station count to equal the circuit's, and every telemetry channel the live snapshot has. If `buildTrack` ever changes N, a run still loads (the line is resampled) but gets no ghost, and the page says so.
- JSON drops the sign of `-0`; nothing in the physics depends on it.

### `DynCheck.result`

```ts
{
  qss, frac,
  dyn: { t, trace: { x[], y[], v[] /* vx */, e[], t[], st[],          // every 6th 4 ms step
                     psi[], vy[], r[], delta[], alf[], alr[], ax[], ay[], gear[], s[] } } | null,   // for pose()
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
   - `tests/golden.json` holds, for all 6 cars × 4 circuits and each car on Harrow Ring with 25 m of hills (step 8): the centreline lap, the line converged from the centreline (the *fixture*) with its lap and optimiser effort, and the dynamic-check result on it, including the final traced lap's error maxima and mean error. It also holds the skidpad results. Its `meta` records Node/V8, commit, and a SHA-256 of the physics source.
   - Regenerate with `node tests/make-golden.mjs --write` (~1 min for the 30 combos in Node v26, one child process per combo) after an intended physics change, and review the diff. If the V8 build differs from `meta`, every golden assertion fails with both versions named; property assertions still run.
   - Reference: GT racer on Harrow Ring (seed 27, 12 m), single run from the centreline: **78.3771 s** in Node v26.12.0 and v26.12.1 (V8 14.6.202.34); 78.348 s in Chrome 153. Restarting ("Search again") is a fresh draw, not a refinement: six consecutive restarts in Chrome gave 78.278–78.398 s.
   - Teeth: `CRR` 0.012 → 0.0121 fails every lap golden; `GAINS.kr` in `src/drivers/reference.js` 0.3 → 0.31 fails every dynamic golden and the skidpad goldens while all property checks still pass.
4. **Skidpad** (`skidpad.test.mjs`). Road car, 80 m circle (a 16-point spline, so |k| ripples ±1.4%), constant speed at 90/95/98% of the lap model's v² there. Property: a clean lap and mean lateral error ≤ 0.2 m. Measured with the current driver gains: 0.059 / 0.068 / 0.077 m (still clean at 100%: 0.088 m).
5. **Model consistency** and 6. **Margin table** (`golden.test.mjs`, on the 30 fixtures). The prototype's figures, utilisation ≤ ~1.06 and a margin of 92–99%, hold only for the GT racer and Open-wheeler on the current code. The properties are sanity bounds every preset meets: dynamic-check fraction in [0.85, 1], utilisation ≤ 1.15, and a clean final lap. Measured (fraction % / peak utilisation):

   | Car | Harrow Ring | Kestrel Point | Millbrook Park | Saltmarsh | Harrow Ring, 25 m hills |
   |---|---|---|---|---|---|
   | Road car | 91.3 / 1.052 | 91.6 / 1.059 | 97.2 / 1.055 | 92.8 / 1.083 | 91.6 / 1.079 |
   | Hot hatch AWD | 98.1 / 1.117 | 97.5 / 1.073 | 97.8 / 1.073 | 98.4 / 1.083 | 98.1 / 1.088 |
   | EV saloon | 97.2 / 1.042 | 96.2 / 1.053 | 95.0 / 1.110 | 97.5 / 1.114 | 96.6 / 1.039 |
   | GT racer | 97.8 / 1.043 | 96.6 / 1.051 | 97.2 / 1.054 | 97.2 / 1.043 | 98.1 / 1.044 |
   | Open-wheeler | 96.6 / 1.055 | 96.9 / 1.045 | 97.2 / 1.039 | 95.9 / 1.050 | 96.6 / 1.043 |
   | Kart | 99.1 / 1.039 | 100 / 1.039 | 100 / 1.096 | 99.7 / 1.046 | 98.8 / 1.061 |

7. **Elevation** (step 8; `elevation.test.mjs`, the hilly half of `gradient.test.mjs`, and hilly cases in `solver.test.mjs`, `runfile.test.mjs`). Flat circuits bit-identical (the 24 flat goldens didn't change by a byte when the hilly ones were added). The gradient check on hills, all six cars, hard and soft, also through the load-factor clamps (err/scale ≤ 2e-8; breaking any new adjoint term fails all 12). Closed forms: crest and compression corner speeds within 0.03%, terminal speed and rate of approach up a constant ramp within 3%. Direction: on a ramp stadium the climb is slower, the descent faster and the lap slower than flat. Dynamics: the dynamic check in the flat bounds on hills, ramp tracking within 0.033 m/s, crest-limited corners at their reduced limit; each shown to fail on the broken model it targets. Cross-version: a v1 run file recorded before elevation reloads to its lap bit for bit through the v1 → v2 migration.
   - A converged lap is one draw from a chaotic optimiser endpoint (restarts scatter by ~±0.06 s), so the hilly goldens' laps differ from the flat ones by amounts (−0.05 to +0.07 s, Kart +0.69 s) that don't measure what hills cost; the fixed-line direction test does.

Golden values depend on `genCtrl` and `buildTrack`. Any change to the generator or spline changes every preset circuit, so tag golden values with a track-generator version.

---

## 9. Coupling to remove

1. ✅ **Shared mutable state.** The optimiser mutated the same `off` array the renderer read. Now the worker owns the line and sends copies (step 5).
2. ✅ **One thread.** The optimiser and the dynamic check ran inside the frame loop. Now they run in a worker (step 5).
3. **Views reach into internals.**
   - ✅ The tractive-force chart, balance readout and HUD gear read raw `CarModel` tables. Now behind `describeCar` (step 4).
   - ✅ Tyre-use colouring called `dynNominal` from the display path. Now the solver puts utilisation in the snapshot (`line.u`) when asked (step 5).
4. ✅ **No pose contract.** The car's position was interpolated inside the 2D drawing code (`carState`). Now `playback.pose()` (step 7).
5. ✅ **Staleness is ad hoc.** `dynStale` compared lap times. Now it's car/track/line revisions (step 5).
6. **Flat world.** ✅ Elevation and grade, crests and compressions (step 8). Still no banking; still a y-down screen convention.

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
  playback/      pose(t) from a lap snapshot or a dynamic trace; race clock for ghosts (step 7)
  views/
    map2d/       current canvas map + charts, drawn from explicit inputs (step 6)
    scene3d/     future
  app/           state object, protocol client, controls, wiring (step 6)
tests/
```

### 10.1 Solver protocol (worker boundary)

As implemented in step 5 (`src/solver/solver.js`; tested directly in `tests/solver.test.mjs`).

**Commands** (main thread → worker). `rev` is one counter on the main thread, increasing with every car or track command.

```ts
{ type: 'setCar',   rev, params: CarParams, resume? } // build car → carInfo; rescore; new reference lap → snapshot
{ type: 'setTrack', rev, ctrl, width, keepLine, resume? } // build track → track; fresh search from the old line resampled, or the centreline → snapshot
{ type: 'setLine' }                                 // fresh search from the centreline → snapshot
{ type: 'load',     rev, params, ctrl, width, off, run } // car + track + line in one step (§7 run file) → carInfo, track, snapshot, loaded; run: search from it, else paused
{ type: 'run', fresh? } | { type: 'pause' }         // fresh: restart the search from the current line ("Search again")
{ type: 'view', util }                              // include tyre use u in snapshots → snapshot
{ type: 'dynCheck' }                                // pause; republish the current line; check it
```

**Events** (worker → main thread):

```ts
{ type: 'carInfo',   carRev, info: CarInfo }       // describeCar (§7)
{ type: 'track',     trackRev, N, L, ds, cx, cy, nx, ny, kc, width, issue, z, dz, cth, kv, flat }   // elevation: §7 Track
{ type: 'snapshot',  carRev, trackRev, lineRev, lap, vmin, vmax,
                     line: { px, py, pz, v, k, ds, tc, u, phys, off }, ref?: { t, v }, warn: { stall, air, ntop } }   // ≤20 Hz while improving; ref = centreline lap, sent when it changes; phys: §7; off = the line's offsets; pz = its heights; warn: §7 Scratch
{ type: 'loaded',    rev, N, clamped: { n, max } }   // after the load's snapshot; clamped: stations moved to fit this build's track limits, and by how much
{ type: 'progress',  stage, of, knot, polish, evals, lap, running, converged }
{ type: 'dynProgress', lap } | { type: 'dynResult', carRev, trackRev, lineRev, result }
{ type: 'error',     rev, paused, message, stack }   // a command is a transaction: one that fails changes nothing and stops nothing (paused: false, rev: its rev); a failing slice pauses the solver (paused: true, rev: null). Either way it stays usable
```

- **The worker owns `running`.** It changes only on `run`, `pause`, `dynCheck`, `load` (`run`), convergence, an error (which pauses it and sends no `progress`), and `resume` on `setCar`/`setTrack`: when set, the worker starts searching as soon as the new line exists. The app resumes after a car or circuit change this way, not with a separate `run`, because setCar/setTrack are coalesced on the main thread and a `run` sent beside one could overtake it. `S.running` only mirrors the `running` of the latest `progress` (and is cleared on an `error` or a worker failure); a command that changes it is answered by the next `progress`. A queued `resume` is dropped if the circuit is being edited by the time it is sent.
- **Revisions** replace the staleness flags. `lineRev` increases each time the worker publishes a changed line. A view never steps back to an older car or track revision, and a dynamic result is current only while all three of its revisions match the displayed snapshot.
- **Arrays** cross the boundary as fresh copies, transferred. The worker keeps its own working copy and a published copy, and never shares memory with views.
- **Differences from the original sketch:**
  - `describeCar` is pushed as `carInfo` on every car change rather than requested.
  - `setTrack` always sends `ctrl`: the main thread generates preset tracks itself, because it needs the control points for editing.
  - `corners` are computed on the main thread (label placement).
  - `dynCheck` takes no `lineRev`: a line revision sent from the main thread was usually stale by the time it arrived (lines publish at 20 Hz), so the worker checks the current line and republishes it.
  - `setLine` with an explicit `off`, and `view`, `run.fresh` and `ref`, were added or deferred as the UI needed.
  - `load` is one command, not `setCar` + `setTrack` + `setLine`: those are coalesced per kind, so the line could land on a track it wasn't recorded on. It builds car and track before changing any state (a throw leaves the solver as it was; it also refuses a circuit of zero length, which `buildTrack` accepts silently and which would give a NaN lap), gives both the load's `rev`, and `Optimizer.setup` is followed by restoring the exact line, because `setup` overwrites the line with its spline fit. The client holds both kinds until `loaded` (or the load's own `error`, matched by `rev`), not until the load's `carInfo` and `track`, and drops edits queued meanwhile; the panel's car, circuit and saved-runs sections are inert for that time.

### 10.2 Pose contract (shared by every view)

As implemented in step 7 (`src/playback/pose.js`; `tests/playback.test.mjs`):

```ts
pose(source: LapSnapshot | DynTrace, t: seconds, info?: CarInfo) → {
  station, s, x, y, z /* 0: flat world */, heading /* rad, screen frame */, speed /* m/s */,
  ax /* longitudinal */, ay /* lateral, signed like curvature */,       // m/s²
  gear?, rpm?,                                                          // with info; rpm = fraction of redline
  // Lap snapshot only: frac (0–1 through the station segment); phys (snapshot telemetry, §7, interpolated) if present
  // DynTrace only:
  steer, slipF, slipR, beta /* sideslip */, yawRate
}
stationPose(snapshot, station, frac, info?) → pose   // the second half of a lap pose; samples one lap where another car is
lapExtremes(snapshot) → {speed, ax, ay, phys: {…}}   // each {max, min} over the lap; bounds every pose (telemetry Lap max)
raceClock(lapTimes[], animT) → t   // both cars leave together; the quicker waits 1 s at the line
```

- **Lap snapshot** (the line, ghosts): interpolated within a station segment; heading from the segment, `ax`/`ay` from the lap model's speeds and curvature, `s` along the line. Bit for bit what the map and HUD computed before step 7. Lines index the same track stations, so `stationPose(ghost, car.station, car.frac)` is the ghost at the car's place: the telemetry's *Same place* Δ and the map tags compare the two cars this way.
- **DynTrace** (`DynCheck.result.dyn.trace`, §7): true heading `psi`, steering and slip recorded by `dynLap`; `s` is distance travelled; the gear is the one the driver model was in. `rpm` comes from the best-gear table at that speed (no per-gear ratios in `CarInfo`). The trace starts where the dynamic lap starts (the straightest station), not at the start line. On the skidpad the recorded state is kinematically consistent with the car's own path: |ay| = v²κ within 0.6%, r + dβ/dt = vκ within 0.3%.
- Not yet: `pitch`, `roll` (no attitude model). Nothing in the UI plays back a dynamic trace yet.

### 10.3 Track model for elevation and 3D

Elevation changes both physics and rendering, so design the per-station track record once. Step 8 implemented the elevation half: per station `z`, `dz`, `cth` (cos of grade) and `kv` (vertical curvature), with the plan view (`cx`, `cy`, `nx`, `ny`, `kc`) unchanged, so stations and lines don't move when hills change. Still to come with banking and 3D:

```ts
station: { s, x, y, z, tangent, lateral /* banked */, up, widthL, widthR, grade, bank, kH /* horizontal */, kV /* vertical */ }
```

- **Grade** ✅: gravity's work `m·g·dz` in both passes (§4.7).
- **Vertical curvature** ✅: normal load `g·cos + v²·kV` through a load-factor axis on the grip tables (§4.7).
- **Bank**: adds a gravity component to lateral grip, and makes height vary across the track (so grade and load would depend on the line). Not done.

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
4. ✅ **Add `describeCar()`** and move chart and readout data behind it. `index.html` reads no `car.<field>`; readouts and the force chart are pixel-identical for every preset. Tyre-use colouring stays on `dynNominal` until step 5.
5. ✅ **Move the optimiser and dynamic check into a worker** behind the protocol. The main thread renders snapshots only. A run through the protocol reproduces the convergence fixture and its dynamic check bit for bit (`tests/solver.test.mjs`). In headless Chrome, convergence takes 9 s instead of 32 s, at the same 1:18.348.
6. ✅ **Port the 2D map and charts** as the first protocol client. Compare against prototype screenshots. Views live in `src/views/map2d/`, the wiring in `src/app/`. Headless Chrome, one session: identical to step 5 in six states (screenshot, every canvas, panel text). Against the prototype, the map, speed, force and gap canvases are identical in all six. The only other differences were the stale HUD gear digit (since fixed, `0f3d61f`) and the "out of date" label that step 5 shows after a car change (the prototype never redrew it). Also in this step: snapshots show only lines the optimiser accepted (`Optimizer.current`).
7. ✅ **Add `playback.pose()`**; the 2D car marker and ghost use it. Both sources supported (§10.2). `dynLap`'s trace records the car's state (+0.2 ms on the one traced lap per check). Replay-off rendering is identical to step 6, and the lap pose equals the old `carState` bit for bit.
8. ✅ **Elevation** (grade, crests and compressions; no banking): heights in the track model, grip tables on a load-factor axis, gravity and load in the lap model and its adjoint, the same in the bicycle model, the solver building load tables for hilly circuits, run files v2 (the first explicit migration), and the app's Hills slider, height editing, elevation chart, height tint and telemetry. Flat circuits are bit-identical (goldens, parity, the pre-elevation run file); six hilly combos added to the goldens. §4.7.
9. **3D view** as a second client of the protocol and pose contract.

---

## 12. Known issues and cleanup

Items deferred on purpose, with their context and planned approach, are in [`docs/deferred.md`](docs/deferred.md).

- **Preset circuits are seeds.** Any change to the generator silently changes them; store generated control points as data files instead.
- **`buildCar` costs about 16 ms** in Node (the GGV bisections included), **~250 ms with load tables** on hilly circuits (17 load levels). Fine on slider release; heavy on continuous drag on hills. Options: only the load slices the circuit can reach, fewer bisection steps, or memoising by parameter hash.
- **Elevation's simplifications** (§4.7): grade and vertical curvature from the centreline, not the line driven; lateral demand on the 3D speed; no banking. And hilly `lapEval` costs ~1.7× flat.
- **The dynamic check's driver gains were tuned on the GT and road presets.** Very different cars may need retuning before the margin can be trusted.
- **Lap model and dynamic model disagree more for some presets** (§8.5/8.6 table): Hot hatch AWD and EV saloon reach inverse-dynamics utilisation 1.11–1.12; the Road car holds only 91% of lap-model pace on two circuits; the Kart reaches 100% (the check can't find its limit). Not investigated: it could be the lap model, the bicycle model or the driver.

---

## 13. Not modelled yet

Banking (elevation and grade are in, step 8); tyre temperature and wear (needs a stint model and the slip energy from §6); battery and thermal derating; aero changes with ride height; 2-speed EV gearboxes; transient tyre relaxation length; differential behaviour.
