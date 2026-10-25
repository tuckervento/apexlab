# Race mode: a driver against tyre wear

Research and design notes for the README "idea": once the optimiser has found the line, a driver runs repeated laps on
tyres that wear, and has to keep the pace without crashing as grip goes away. Different driving algorithms then
compete on race time. Written 2026-10-24 at commit `188ad94`; no source was changed. Builds on
[`docs/tyres.md`](tyres.md) (tyre options and measurements); read that first for the tyre side.

Each claim is marked when it matters: **(measured)** means checked in this session by running code (the probes are in
the appendix), **(source)** means read in this repo, **(literature)** means a paper or manual (only abstracts or the
manual's text were read, as noted under References), and **(practice)** means common practice in racing or racing
games, not checked here.

## Summary

**What it is.** A solo race against the clock: one car, one circuit, one line from the optimiser, N laps on tyres that
wear. The result is total time plus incidents. You compete with earlier races (yours or Q's) through result files and
ghosts, not wheel-to-wheel. Multi-car racing (overtaking, dirty air) is a different product (§1).

**What to call the thing driving.** The *driver*, or *driver model* in docs. Vehicle-dynamics tools call this a
"driver model" (IPG's IPGDriver), the TORCS racing championship called its entries "bots", "drivers" or
"controllers", and "agent" is the word for a learned policy (GT Sophy). Ours is a hand-designed control law, so "AI"
oversells it, and "CPU" just names the hardware it runs on. The code already says "driver" (`src/dynamics/bicycle.js`)
(§2).

**Is it a new driver?** Partly. The low-level controller we have (inverse-dynamics feedforward plus feedback) holds
up on worn tyres *if it is given the right speed plan*: with a plan from the lap model on the worn car, its highest
clean fraction of pace stays within about 2 points of new-tyre pace down to 10% grip loss, for 5 of 6 cars
(measured, §4.2). What's missing sits above it: something that **estimates** the grip that's left, **replans** the
speeds (and maybe the line), and **chooses a margin**, because a race gives no retries (today's dynamic check bisects
with unlimited attempts). So: the same controller under a new estimator, planner and pace layer.

**What needs building besides tyre wear.** Ten components (§5). Six are required for a first race:

| # | Component | New or extends | Where | Size |
|---|---|---|---|---|
| 1 | **Plant/driver split** of `dynLap`: physics on one side, the driver behind an observation → action interface | Refactor; dynamic goldens must stay bit-identical | `src/dynamics/` | Medium |
| 2 | **Multi-lap race loop**: continuous state across laps, start/finish timing, rolling start | New | `src/race/` | Small |
| 3 | **Tyre model in the plant**: slip power → wear (and later temperature) → grip per axle, within the lap | New (`tyres.md` path 3) | `src/dynamics/` | Medium |
| 4 | **Per-axle grip in the lap model** so a planner can price worn tyres (`gripTables` with front and rear scales) | Extends (`tyres.md` path 1); `lapEval` untouched | `src/core/car.js` | Small–medium |
| 5 | **Drivers**: the interface, plus reference drivers (blind, oracle, estimating) | New | `src/drivers/` | Medium |
| 6 | **Judge**: race rules from the plant's state only, with incidents, resets and penalties | New | `src/race/` | Small |
| 7 | Race spec and result files, hashes for rules and driver, leaderboard | New, modelled on run files | `src/app/`, `src/race/` | Medium |
| 8 | Solver protocol: `race` command, per-lap progress, result | Extends §10.1 | `src/solver/` | Small |
| 9 | UI: race panel, lap chart, tyre chart, playback of the race trace, race ghost | New | `src/app/`, `src/views/` | Medium–large |
| 10 | Later: line library, fuel burn, warm-up/temperature, sensor noise, per-corner learning | Optional | various | each small–medium |

**What the measurements say** (all on the committed converged lines, Harrow Ring, Node; §4):

- The dynamic check's fraction is the **edge**, not a margin: at it, losing 1% of grip (uniform or rear only) spins
  the GT racer. For 4 of the 6 cars the edge is already below the check's fraction at 1% wear, which is 2–10 laps at
  the wear rates `tyres.md` sized (0.1–0.5% per lap). A driver that just repeats the check's pace crashes early
  (measured).
- **Rear wear spins cars, front wear doesn't.** Rear-only wear moves the edge as much as uniform wear. Front-only
  wear costs far less: GT racer with 10% less front grip, 82.85 s against 86.53 s for uniform (measured). Per-axle
  wear is where the interesting driving is.
- **Replanning pays off mainly in safety, less in speed.** Against a blind driver that has somehow found its own edge
  (which needs crashes), replanning is about equal at 5% wear (−0.8 to +0.1 s) and 0.5–1.4 s faster at 10%
  (measured). Its value is knowing where the edge is without hitting it.
- **Re-optimising the line recovers 7–14% of what wear costs**: 0.13–0.30 s at 5% and 0.24–0.48 s at 10% on three
  cars, net of the optimiser's restart noise, about 5 s of compute each (measured). Real, but second-order: speeds
  come first.
- **Cost is not a problem.** One simulated lap is 5.4 ms (GT racer, N = 783), so a 20-lap race is about 0.1 s of
  plant time. A per-lap replan adds about 16 ms (flat) or 250 ms (hills) for the car rebuild (measured; rebuild costs
  are from `ARCHITECTURE.md` §3.1).

**Recommended order** (§9): split plant and driver (bit-identical) → race loop at constant grip → per-axle grip
scales → wear in the plant → reference drivers and judge → files, protocol, UI → extras. Each step is checkable on its
own, as migration steps 1–8 were.

**Decisions that are Q's to make** are in §10: what the driver may know, the penalty model, the compute budget,
whether the line may change, how "realistic" the tyre numbers need to be, and whether the driver's tyre model may
equal the plant's.

---

## 1. What "the race" is

- **Solo and timed.** One car on the circuit. A race is a *race spec* (car, circuit, line, tyre compound, laps,
  start, ambient) plus a *driver*. Result: total time, per-lap times, per-lap tyre state, incidents.
- **Comparisons come from fixing everything but the driver.** Today the app mixes two competitions: finding the line
  (optimiser) and driving it (dynamic check). A race spec holds the line, car and circuit fixed, so two results for the
  same spec differ only by driver. That is the competition the README idea asks for.
- **The line comes from the optimiser but is stored in the spec** (as run files store theirs, `ARCHITECTURE.md` §7),
  so a race stays reproducible after the optimiser changes.
- **Head-to-head without interaction**: race a ghost of an earlier result, lap by lap. Real multi-car racing needs
  collision, overtaking and wake models, which is a different scope.
- **Not pit strategy** (yet). Stops, compound choice over a race distance and fuel strategy are a layer above this one;
  the spec can grow a `stops` field later.

## 2. What to call the driving algorithm

| Term | Who uses it | Fits us? |
|---|---|---|
| CPU / computer / AI | Racing games (practice) | Names the hardware or oversells it; ours is a control law |
| Driver model | Vehicle-dynamics simulation: IPG's IPGDriver is sold as a "driver model" that chooses path and speed and controls steering, throttle and brake (literature) | **Yes**, for docs |
| Bot / robot / driver / controller | TORCS and its Simulated Car Racing championship, whose entries talk to the simulator through sensors and actuators (literature) | Yes; "bot" reads as a game word |
| Agent / policy | Reinforcement learning, e.g. GT Sophy in Gran Turismo Sport (literature) | Only for a learned driver |
| Autonomy stack, planner + controller | Autonomous racing (Indy Autonomous Challenge, Stanford's Shelley; literature) | Good names for our *layers* |

**Recommendation:** "driver" in code and UI (`drivers/`, "driver: replan-v1"), "driver model" in docs when the
distinction from a human matters, "agent" reserved for a learned one. Inside a driver, use the autonomy-stack words:
**estimator** (what grip is left), **planner** (speed profile, maybe line), **pace manager** (how much margin),
**controller** (steering and longitudinal force every 4 ms).

## 3. What the engine has today

All **(source)**, `src/dynamics/bicycle.js` and `check.js` unless noted.

- **`dynLap` is one function that holds plant, driver and judge together.**
  - Plant: axle loads, axle peaks (`axleCaps`), the force split, tyre curves, load-transfer lag, integration,
    gravity on hills.
  - Driver: nearest-station search, path and heading error, feedforward interpolation, the steering law, the speed
    law `Fx = FxN + m·1.5·(vt − vx)`, and the gear choice.
  - Judge: "trouble" and "abort".
- **It drives exactly one lap**, starting at the straightest station with the nominal state, and stops when it has
  advanced N stations.
- **`DynCheck` retries.** It bisects the pace fraction with as many laps as it needs; the code comment says the driver
  "eases off before that point and tries again". A race has no retries.
- **The judge measures sideslip against the driver's own plan.** `dB = |atan2(vy, vx) − atan2(vyN, vt)|`, where `vyN`
  and `vt` come from the driver's nominal. Fine for checking a line, but as a race rule it would let a driver change
  its own judging. Race rules must read only the plant's state. The track-limit test (`over`, against the circuit's
  usable half-width) is already plant-only.
- **The driver is inside the physics hash.** `runSource()` (`tests/load-core.mjs`) covers `core/`, `dynamics/` and
  `solver/solver.js`, so today any driver change looks like a physics change.
- **There is no tyre state.** One `mu` for both axles, built into the tables (`tyres.md`).
- **Hooks that already exist:**
  - `lapEval`'s `lim = {cap, bs, ts}` (per-station speed caps and braking/traction scales, no gradient) lets a
    planner back off at single corners.
  - `pose()` already reads a dynamic trace, but "nothing in the UI plays back a dynamic trace yet"
    (`ARCHITECTURE.md` §10.2).
- **The tyre curve's shape is fixed.** In `Fy = D·sin(C·atan(B·α))`, `B` comes from the peak slip angle alone, so
  cornering stiffness `B·C·D` scales with the peak `D`. If wear scales `D`, the car feels softer at *every* slip
  angle, not only at the limit (see §7 on what this means for estimators).

## 4. Measurements

Method: each preset on Harrow Ring, on its committed converged line (`tests/golden.json`), with a throwaway copy of
`src/` in which `dynSetup(car, sF, sR)` scales each axle's peak and `dynLap` takes a separate "driver's belief" for its
feedforward. At scales of 1 the copy matched the original bit for bit; the probe asserts this for every car. Node,
commit `188ad94`. Probes and the patch are in the appendix.

Drivers compared:

- **blind**: target speeds and feedforward from the new-tyre car;
- **ff-aware**: feedforward (steering, sideslip) from the worn car, target speeds from the new-tyre car;
- **replan**: target speeds from `lapEval` on the worn car (uniform wear only: the lap model has no per-axle grip yet).

### 4.1 The check's fraction is the edge

GT racer at the check's fraction (97.8%) for every lap (measured):

| Grip left | Blind, uniform | Replan, uniform | Blind, front only | Blind, rear only |
|---|---|---|---|---|
| 100% | clean | clean | clean | clean |
| 99% | spin | clean | clean | spin |
| 97% | spin | clean | clean | spin |
| 95% | spin | trouble | clean | spin |
| 93% | spin | clean | spin | spin |

I expected the blind driver to survive 2–4% of wear; it doesn't survive 1%. The bisection stops within 0.4% of the
edge, so there is no margin to spend. The replanning driver goes non-monotonic (trouble at 95%, clean at 93%) for the
same reason: it rides an edge that moves.

### 4.2 Highest clean fraction of pace

Bisected to 0.2%, the way `DynCheck` does it. Blind and rear-only: fraction of *new-tyre* lap-model speeds. Replan:
fraction of the *worn* car's lap-model speeds (measured):

| Car | New | Blind 95% | Replan 95% | Blind 90% | Replan 90% | Front-only 90% | Rear-only 90% |
|---|---|---|---|---|---|---|---|
| Road car | 91.4% | 88.9% | 91.6% | 86.9% | 91.6% | 91.3% | 86.9% |
| Hot hatch AWD | 98.1% | 95.3% | 98.3% | 92.7% | 97.5% | 96.9% | 92.5% |
| EV saloon | 97.2% | 94.7% | 96.6% | 90.9% | 96.2% | 93.0% | 91.4% |
| GT racer | 97.8% | 94.2% | 96.7% | 91.3% | 96.1% | 95.5% | 91.6% |
| Open-wheeler | 96.7% | 93.3% | 96.6% | 89.5% | 96.6% | 93.9% | 89.5% |
| Kart | 99.1% | 97.3% | 100% | 94.7% | 100% | 96.1% | 94.7% |

- The blind edge falls 0.44–0.72 points per 1% of grip lost. Replanning holds it within 1.7 points across 10%, for
  five cars. The Kart reads 100%: the check can't find its limit (`ARCHITECTURE.md` §12).
- At 95% and 90% grip, rear-only wear is within 0.5 points of uniform wear for every car (Hot hatch at 97% is the
  exception, 1.1 points). Front-only is much milder: these cars are
  rear-limited, matching `tyres.md`'s slip energy, where the rear takes more for 5 of 6 cars. A worn front makes the
  car run wide but stay on the road; a worn rear spins it.
- The ff-aware driver gains little over blind, and not consistently: −0.8 to +0.7 s at 95%, and −0.6 to +2.0 s at
  90% across cars. The feedforward isn't the bottleneck; the speed plan is.

### 4.3 Lap times: replanning against a blind driver at its own edge

Dynamic lap at each driver's highest clean fraction (s; measured):

| Car | Blind 95% | Replan 95% | Blind 90% | Replan 90% |
|---|---|---|---|---|
| Road car | 109.18 | 108.50 | 111.73 | 111.06 |
| Hot hatch AWD | 96.85 | 96.02 | 99.52 | 98.59 |
| EV saloon | 98.21 | 98.33 | 102.20 | 100.94 |
| GT racer | 83.86 | 83.50 | 86.53 | 86.00 |
| Open-wheeler | 64.53 | 64.08 | 67.18 | 66.01 |
| Kart | 113.25 | 112.78 | 115.84 | 114.41 |

The blind driver here is the best a blind driver could be, because it found its edge by crashing in the bisection. A
blind driver in a race has to guess its margin up front. Every point of margin costs about a point of lap time, and
too little margin ends in a spin within a few laps. That trade-off is the game.

### 4.4 Does the line need to change?

Optimiser rescored from the converged line with the worn car (uniform), run to convergence. The control (same car,
rescored) measures the restart noise (measured):

| Car | Noise (control) | Fixed line at 95% | Gain at 95%, net | Gain at 90%, net | Largest line move: control / 95% / 90% |
|---|---|---|---|---|---|
| GT racer | 0.061 s | 80.106 s | 0.13 s | 0.24 s | 0.71 / 0.64 / 1.06 m |
| Open-wheeler | 0.040 s | 61.251 s | 0.23 s | 0.48 s | 1.81 / 1.69 / 1.63 m |
| Road car | 0.073 s | 98.596 s | 0.30 s | 0.41 s | 0.70 / 0.79 / 1.48 m |

My prediction was "within noise", since uniform grip loss looks like it only scales speeds. It doesn't: drag, power
and downforce don't scale with `mu`, so corners and straights trade differently. The gain is 7–14% of what 5% wear
costs on a fixed line (1.62–2.24 s). The size of the line move is no evidence either way: the control moves it as
much, because a rescore is a fresh draw from a chaotic endpoint (`ARCHITECTURE.md` §8.7). One run per cell; consistent over three cars, not
a law. Each re-optimisation took 3.8–5.0 s in Node.

### 4.5 Cost

- One `dynLap`: 5.4 ms, GT racer, N = 783, best of 5 (measured).
- A car rebuild: about 16 ms flat, 250 ms with hill load tables (`ARCHITECTURE.md` §3.1; not re-measured).
- `lapEval` without a gradient: well under 1 ms (`ARCHITECTURE.md` §4.7, 220 µs *with* the gradient).
- So a 20-lap race with a per-lap replan costs about 0.5 s flat and 5 s on hills, plus about 100 s if the line is
  re-optimised every lap. That is the case for a precomputed line library (§5.10).

### 4.6 Limits of these measurements

- Grip was a *constant* scale for the whole lap, and the plant had no wear or temperature dynamics.
- Uniform `mu` scale only for the replanning driver.
- Harrow Ring only; one run per re-optimisation cell.
- The "pace fraction" is uniform along the lap, as in `DynCheck`. A per-corner margin would do better and is one of
  the things a driver could learn.

---

## 5. Components

### 5.0 The loop

```
                     race spec (car, circuit, line, compound, laps, start, ambient, seed)
                                              │
   ┌──────────────────────────── race loop (src/race) ───────────────────────────────┐
   │                                                                                  │
   │   ┌───────────── driver (src/drivers/<name>) ──────────────┐                      │
   │   │  estimator ─→ planner ─→ pace manager ─→ controller    │ ── action ──┐        │
   │   │  (grip left)   (lapEval   (margin per    (feedforward  │ steer, Fx   │        │
   │   │                on believed  lap/corner)   + feedback)  │             ▼        │
   │   └───────────────────▲────────────────────────────────────┘   plant (dynamics)   │
   │                       │ observation (every 4 ms)               bicycle + tyre     │
   │                       └──────────────────────────────────────  state per axle     │
   │                                                                     │             │
   │   judge: track limits, spin/off → incident, reset, penalty ◄────────┘             │
   │   timing: line crossings → lap times; per-lap tyre summary                        │
   └──────────────────────────────────────────────────────────────────────────────────┘
                                              │
                         race result (+ trace) → solver events → UI, result file
```

### 5.1 Split plant and driver (prerequisite)

Separate `dynLap` into:

- `plantStep(state, action, dt)`: the physics that is there today, expression for expression;
- `observe(state)`: what a driver may see;
- the **reference driver**: today's controller, unchanged.

`DynCheck` keeps using the reference driver.

- **Bit-identical is the bar.** The dynamic goldens (30 combos), the skidpad goldens and parity must pass untouched,
  exactly like migration step 2. Splitting functions doesn't change the arithmetic if every expression keeps its
  order.
- **Where the reference driver lives.** Keep it in `src/dynamics/`, inside the physics hash: the dynamic check's
  result (in run files) depends on it, so it is part of "the rules". Race competitors live in `src/drivers/` with
  their own hash (§5.7).
- **Today's driver-relative trouble test** stays with `DynCheck` (it's how the check defines "clean"). The race judge
  gets its own plant-only tests (§5.6).
- **Gears.** Shift *timing* (`shiftT` without drive) is plant; *choosing* a gear is driver. Make the plant offer an
  automatic gearbox for v1, so drivers don't all have to copy the shift logic.

### 5.2 The race loop

- **Continuous state across laps.** The car's state carries over a line crossing. Today each `dynLap` starts fresh
  from the nominal state.
- **Start.** Rolling: placed on the line at the straightest station, as `dynLap` does, at the planned speed. Timing
  starts at the first crossing of station 0, the snapshot's own lap start (`tc[0]`). The partial lap before it is a
  formation lap; once temperature is in (§5.3), that is where tyres warm.
- **Lap timing.** Interpolate the crossing inside the 4 ms step, so times aren't quantised to 4 ms.
- **Driver callbacks.** `step(obs)` every 4 ms, and `lap(summary)` at each crossing, where a driver may replan.
  Simulation time stops while a driver plans, so planning time doesn't cost race time (but see §10, compute budget).
- **Trace.** The race keeps the full trace once, at the end. `dynLap` records every 6th step, 16 channels: about 3,400
  samples and 430 KB per 81 s lap, so 20 laps is about 9 MB (computed from the layout). Fine to transfer once; too big
  for a JSON result file (§5.7).

### 5.3 The tyre model in the plant

This is `tyres.md` path 3, the in-lap state in the time-stepped model. `tyres.md` said it "skews the dynamic check"
and belongs in "a separate replay, not `DynCheck`": race mode is that replay. Forward in time, so none of the lap
model's causality problems.

- **State per axle:** wear `w` (0 = new); later a bulk temperature `T`.
- **Power into the tyre, per 4 ms step:**
  - Lateral: `|Fy|·vx·|tan α|`, the same expression `tyres.md` used for its slip-energy table.
  - Longitudinal: the plant has no slip ratio (`tyres.md` decision 4). Options: an assumed slip ratio from the force
    fraction, or count only *sliding*, where the plant already clamps demand above the peak (`|Fx| > 0.999·D`,
    "wheelspin or lock-up") and the excess is dissipated. The second is free and punishes lock-ups, which is good for
    gameplay; the first is more complete. Recommend the clamp-excess version first.
- **Wear law:** `dw/dt = k_w · P · f(T)`, wear proportional to friction power. West and Limebeer model wear as a
  function of surface temperature and contact power (literature); this is the simple version of that.
- **Grip from state:** `D_axle = D_new · g_w(w) · g_T(T)`.
  - `g_w`: a gentle slope then a **cliff** past a wear threshold (practice: the "cliff" is what makes strategy).
  - `g_T`: a window around `T_opt` (`tyres.md` path 1b).
  - Per-axle curves are standard in sims; Assetto Corsa's tyre files carry a separate wear curve and thermal
    performance curve per axle (practice).
- **Temperature (phase 2 of the tyre model):** `C·dT/dt = P − h(v)·(T − T_amb)`. In the plant that's one more line per
  axle at 4 ms, much cheaper than in the lap model (`tyres.md` §"Why temperature inside one lap is hard"). It adds
  real tyre management: push, overheat, back off to cool.
- **Sizing:** 0.1–0.5% of grip per lap gives 0.05–0.2 s per lap of degradation (`tyres.md`, measured there). Use it to
  set `k_w` for each compound.
- **Compounds** as presets (soft, medium, hard: `k_w`, cliff point, `T_opt`, window width, heat capacity), part of the
  race spec, not `CarParams`. There is no data to calibrate raw knobs (`tyres.md`). Plausible, not calibrated (§10).
- **Not modelled:** graining, blistering, flat spots, left/right differences (axle-level model, `tyres.md` decision 2).

### 5.4 Per-axle grip in the lap model (the planner's model)

A planner prices the worn car with `lapEval`, so `gripTables` needs separate front and rear scales: `tyres.md` path 1.

- **What it touches:** the front axle's sums (`lat` for the front, `bf`, the front term of `trc`, `cap(Wf, …)` in the
  GGV) use `mu·sF`, the rear's `mu·sR`. `dynSetup`'s `tireF` splits the same way, so the plant and the planner's model
  agree.
- **`lapEval` and its adjoint don't change.** The scales enter through the tables. At 1 every value is bit-identical
  (`x*1 === x`).
- **Recommendation, differing from `tyres.md`:** pass the scales as a `buildCar` option
  (`buildCar(params, {loads, grip: {f, r}})`), not new `CarParams` fields. Tyre state is *state*, not setup: keeping it
  out of `CarParams` avoids a run-file v3 migration and keeps the 25-field rule intact. The compound goes in the race
  spec.
- **Cost:** one rebuild per replan, about 16 ms flat, 250 ms on hills. Fine once per lap; too slow every 4 ms, so
  drivers plan per lap or per sector and control continuously.

### 5.5 Drivers

**Interface** (a sketch, to settle in phase 1):

```js
// src/drivers/<name>.js. No DOM, no module state (several races may run in one worker), deterministic.
export default {
  name: 'replan-v1',
  // ctx: the race spec (car params, circuit, line, laps), the track and line geometry, and the new-tyre CarModel.
  // May call core functions (buildCar, lapEval, dynNominal); returns the driver's own state.
  init(ctx) { return state; },
  // at each start/finish crossing: last lap time, incidents, lap number. The place to re-estimate and replan.
  lap(state, summary) {},
  // every 4 ms: returns {steer /* target, rad; the plant applies the rate limit */, fx /* N, + drive, − brake */}
  step(state, obs) { return action; },
};
```

`obs` holds what a racing driver or an autonomy stack could sense:

- time and lap;
- station and fraction (localisation, like TORCS's `distFromStart`);
- lateral error from the race line and heading error;
- `vx`, `vy`, yaw rate, `ax`, `ay`;
- steering angle and gear;
- `incident` when the judge reset the car.

Tyre *temperatures* are a maybe (racing cars carry tyre temperature sensors, practice). True wear and true peak grip
are not observable.

**The reference ladder.** Each driver is a yardstick for the next:

| Driver | Estimator | Planner | Pace | Purpose |
|---|---|---|---|---|
| **D0 blind** | none (new tyres) | the new-tyre plan, every lap | fixed fraction | Lower reference: shows the problem. Crashes or bleeds time |
| **D1 oracle** | reads the plant's true tyre state | `lapEval` on the true worn car each lap (per axle once §5.4 lands) | fixed fraction | Upper reference for a planner: perfect knowledge. Not a competitor; it reads what others can't |
| **D2 estimating** | per-axle grip from observed forces and slip angles (below) | like D1, on the *believed* car | fraction from confidence in the estimate | The first honest competitor |
| D3 learning | D2 | D2 plus per-station caps from incidents and near-misses (`lim.cap`) | per corner | Iterative learning across laps, as in Kapania and Gerdes, and Rosolia and Borrelli's learning MPC, which treats each lap as an iteration (literature) |
| D4 line library | D2 | picks or blends lines precomputed for a grid of (sF, sR) | per corner | Uses the 7–14% the line gives back (§4.4) |
| D5 learned | learned | learned | learned | An agent (RL). Far off; the interface allows it |

**A D2 estimator, concretely.**

1. From the observations, the driver can rebuild each axle's lateral force (from `ay` and yaw acceleration, the
   balance `dynNominal` uses) and slip angles (from `vy`, yaw rate and steering).
2. Then fit each axle's peak `D` to `Fy = D·sin(C·atan(B·α))`, with `B` and `C` known from the car.
3. Because `B` doesn't depend on `D` (§3), wear shows up even well below the limit. The Stanford work using pneumatic
   trail had the same aim, detecting the friction limit "before [it is] reached" (literature).
4. The fit is a least squares problem over each lap's samples, run in `lap()`.

**Margin.** D1 at the check's fraction rides the edge (§4.1). Every driver needs a margin, and choosing it is the
pace manager's job: from estimate uncertainty, from near-misses (sideslip growth, edge proximity), and from the race
situation (lap 19 of 20 can risk more than lap 2).

### 5.6 The judge

Rules read the plant's state only (§3):

- **Track limits:** more than 0.5 m beyond the usable edge (today's `tolOff`) is a track-limit violation. N violations
  give a time penalty (practice: track-limit warnings then penalties).
- **Off or spin:** beyond 3 m (today's abort distance), or the velocity direction more than a threshold (0.45 rad,
  today's abort value, to be re-tuned against plant-only angles) away from the car's heading or the track's tangent.
- **What an incident does:**
  - recommended: the car is reset onto the race line a few stations further on, at a reduced speed, with the nominal
    state; it gets a time penalty and keeps its tyre state; the driver is told;
  - alternatives: end the race (DNF) at the first incident, or after k of them. Real recovery from a spin is out of
    reach: the driver can't, and the bicycle model isn't built for it.
- **Score:** total time including penalties; a DNF ranks behind every finisher. Report alongside it:
  - incidents;
  - per-lap times against the **D1 reference** for the same spec (an "efficiency"; not a strict bound, because
    inverse utilisation already exceeds 1 in places, `ARCHITECTURE.md` §6);
  - the tyre state at the flag.

### 5.7 Race specs, results, versions

- **Race spec file:** car params (25 fields, as in run files), circuit control points and width, line offsets,
  compound preset (values in full, as run files store the car in full), laps, start type, ambient, seed (for any noise).
  Strict reading, a `version`, explicit migrations, the same rules as `runfile.js`.
- **Result file:** spec hash, driver name and driver hash, rules hash, per-lap times, per-lap tyre summary, incidents,
  total, runtime (as `golden.json` records V8). **No trace:** a race is deterministic, so a replay is a re-run. Games
  record inputs for the same reason (practice). If either hash differs, the page shows the summary and says why the
  replay is unavailable.
- **Two hashes:**
  - the *rules hash* = today's physics hash plus `src/race/` (plant, tyre model, judge, timing);
  - the *driver hash* = the driver's own files.

  Driver results are comparable only under one rules hash. A driver improvement changes only its own hash, so "beat
  prior race times" means the same spec, same rules hash, a different driver hash. Today's physics hash
  (`runSource()`) would need to cover `src/race/` too.
- **Per-runtime, as goldens are.** Node and Chrome differ in the last bits from `buildTrack` on (`ARCHITECTURE.md`
  §8.3). Over a race those bits can grow, so the leaderboard records the runtime, and only same-runtime times are
  compared to the millisecond.
- **Leaderboard:** for a start, a list of result files grouped by spec hash and rules hash, loaded like saved runs.
  Shared storage (an artifact database or a repo folder) is a later choice.

### 5.8 Solver protocol

Extends `ARCHITECTURE.md` §10.1:

```ts
{ type: 'race', rev, spec: RaceSpec, driver: string }   // pauses the search; builds car, track, line from the spec
{ type: 'raceStop' }
// events
{ type: 'raceLap', lap, t, tyre: { wF, wR, TF?, TR? }, incidents }   // after each crossing
{ type: 'raceResult', specHash, rulesHash, driverHash, laps: [...], total, incidents, dnf, trace }   // trace transferred once
```

- Runs in the worker's 15 ms slices, like `DynCheck`. Two or three laps of plant fit in a slice; a lap-end replan
  (16–250 ms) takes one or more slices, so planning must be resumable or allowed to overrun a slice. Re-optimising a
  line per lap (about 5 s) needs the optimiser to run sliced inside the driver's `lap()`, or a precomputed line library.
- **Driver registry:** a static `src/drivers/index.js` (no build, so no dynamic plugin loading); adding a driver means
  one file plus one line.
- **Revisions:** a race result is tagged with the spec hash rather than car, track and line revisions, because it
  carries its own copies.

### 5.9 UI

- **Race panel:** compound, laps, driver, Run race. "Make race from current line" freezes the current car, circuit
  and converged line into a spec.
- **Lap chart:** lap time against lap, with the D1 reference line and incident markers.
- **Tyre chart:** front and rear grip (and temperature) against lap.
- **Playback of the race trace:** the first UI that plays a dynamic trace (`pose()` supports it, §3). `raceClock` is
  per lap today; a multi-lap ghost needs it to run over a whole race.
- **Comparing two results:** per-lap gap, using the existing gap chart's pattern.
- **Map overlays:** incident locations; per-axle slip power (`tyres.md` path 0) as a colouring, which shows where a
  driver is eating the rears.

### 5.10 Later

- **Line library (D4):** before the race, re-optimise lines on a small (sF, sR) grid, at about 5 s each in Node
  (measured).
  - Switching lines needs care: two converged lines can be over a metre apart in places (§4.4), and the controller
    sees a jump as path error. Switch on a straight where they agree, or blend over it.
- **Fuel burn:** mass falls each lap. It works against wear: fuel-corrected pace is how teams read degradation
  (practice; F1 rule of thumb about 0.35 s per lap per 10 kg in the V8 era, from press figures).
  - Needs mass as state, not as a `CarParams` constant: a rebuild per lap, and the plant reading the current mass.
- **Warm-up and the formation lap,** once temperature is in.
- **Sensor noise** (seeded): TORCS's championship offered noisy range finders as an option (literature). It makes
  estimators honest (§7).
- **Weather / track evolution:** README TODO 8. A grip scale over time is the same mechanism as wear.

---

## 6. What a "better driver" can improve

These are the levers the competition is about. Most need no physics change once §5.1–5.6 exist:

- **Margin policy:** uniform, per corner, by lap, by confidence.
- **Estimation:** how fast and how accurately it finds the remaining grip, per axle.
- **The speed plan:**
  - from `lapEval` on the believed car;
  - with `lim` caps where it nearly lost the car;
  - braking points moved earlier on a worn front, exits gentler on a worn rear.
- **Tyre conservation** (with temperature, or with wear that depends on slip power): drive slower where time is
  cheap and tyres are expensive. This is the race-strategy question, and the reason the race is longer than one lap.
  Optimal-control tyre management (the 2016 and 2022 *Vehicle System Dynamics* papers under References) is the
  "perfect" version of it (literature), and
  `tyres.md` path 4 said not to build that as physics. As a *driver* behaviour it's fair game.
- **Line choice** (D4).
- **Controller gains:** `ARCHITECTURE.md` §12 notes they were tuned on two presets; a driver may retune them per car.

## 7. Fairness and integrity

- **Information boundary.** TORCS moved its bots out of the simulator's process because in-process bots "had full
  access to track and race data", making comparisons unfair, and a slow bot blocked the rest (literature). Same lesson
  here, cheaper fix:
  - drivers get `obs` (a fresh object each step), never the plant's state;
  - the judge and timing never call driver code;
  - D1, which reads the plant, is labelled a reference and kept off the leaderboard.

  Same-process JavaScript can't truly sandbox a driver. For a two-person competition, the interface plus code review
  is enough; a driver could run in its own worker later if that changes.
- **The model is the plant.** The planner's model (`lapEval` on a rebuilt car) and the plant share one tyre law. A
  driver with a perfect estimator therefore plans with the plant's exact physics. That is generous: real drivers and
  stacks plan with a wrong model. Options:
  - accept it (simplest);
  - give the plant something the lap model lacks (the temperature window, a different curve shape `C`, load-transfer
    lag; the lag is already there);
  - add seeded sensor noise.
- **An estimator could exploit a model artefact.** With `B` independent of `D` (§3), wear shows at every slip angle.
  Real worn tyres don't necessarily soften like that (practice: a worn tread is often stiffer). Either accept it as
  this world's physics, or make wear change the curve shape too. Decide before estimators get clever.
- **Determinism.** Fixed 4 ms step, no `Math.random` (`mulberry32` with the spec's seed for any noise), no wall-clock
  in decisions. Then a race repeats bit for bit within a runtime and can carry goldens.
- **Compute budget.** Simulated time stops while a driver plans, so a driver that re-optimises its line every lap
  (about 100 s per 20-lap race, §4.5) isn't penalised in race time. Options: unlimited (report wall time); a cap on
  `lapEval` calls per lap; or a wall-time budget (not deterministic across machines). Recommend unlimited plus
  reported compute for a start.

## 8. Verification

The same discipline as elevation: property assertions, golden assertions, and each property shown to fail on code
broken on purpose (`APEX_SRC`).

- **Plant/driver split:** the 30 dynamic goldens, skidpad and parity pass untouched, bit for bit.
- **Race loop at constant grip (no wear):**
  - laps 2..N are equal to within a small tolerance (a periodic steady state);
  - lap 1 against a lone `dynLap` at the same plan differs only by the start;
  - interpolated crossings: the lap times sum to the total.
- **Per-axle grip scales:**
  - at 1 the goldens are bit-identical;
  - lower scale → slower lap;
  - a front-only scale moves `limF` toward front-limited;
  - plant and planner agree (`axleCaps` at the scaled car matches the tables, as today).
- **Tyre model:**
  - skidpad closed forms: power `Fy·v·tan α`, wear linear in time at constant power, temperature settling to
    `T_amb + P/h`;
  - wear monotonic over a race;
  - zero wear rate leaves the race bit-identical to the constant-grip race.
- **Judge:** a scripted driver that steers off produces exactly one incident at the expected station; track-limit
  counting on a scripted line that crosses the edge by a known amount.
- **Drivers:**
  - D0 at the check's fraction fails within the first 1% of wear for the GT racer (pins §4.1);
  - D1 completes the race clean at a fraction with margin, with lap times rising with wear;
  - D2's estimate converges to within a tolerance of the true scale on a skidpad, and in a race.
- **Race goldens:** GT racer, Harrow Ring, medium compound, 10 laps, D1 and D2: total time, per-lap times, incidents,
  bit-exact within one runtime.

## 9. Phased plan

| Phase | Deliverable | Verify | Touches physics hash? |
|---|---|---|---|
| 1 | Plant/driver split; reference driver; `obs`/action interface; auto gearbox in the plant | Dynamic goldens, skidpad, parity untouched | Yes (refactor; regenerate the hash, goldens unchanged) |
| 2 | Race loop at constant grip: continuous laps, rolling start, timing, judge, incident reset | Steady-state laps; scripted incident tests | Yes (`src/race/` joins the hash) |
| 3 | Per-axle grip scales in `gripTables` and `dynSetup` (a `buildCar` option) | Bit-identical at 1; direction tests | Yes; goldens unchanged |
| 4 | Wear in the plant (slip power, wear, grip, cliff) with compound presets; slip-power colouring (`tyres.md` path 0) | Closed forms; monotonic wear; zero-rate identity | Yes; goldens unchanged while off |
| 5 | Drivers D0, D1, D2; race goldens | §8 driver tests | Driver hashes only |
| 6 | Race spec and result files, `race` protocol, race panel, lap and tyre charts, trace playback, race ghost | `solver.test.mjs`-style protocol tests; headless Chrome checks as in earlier steps | No |
| 7 | Temperature; D3, D4; fuel; noise | Per feature | Some |

Phases 1–5 make a race that runs in Node and tests; phase 6 makes it a game.

## 10. Decisions for Q

1. **What may the competing driver know?**
   - Recommend: observations only (§5.5), true wear hidden;
   - tyre temperatures visible once they exist;
   - D1 (oracle) as an off-leaderboard reference.
2. **Incident model:** reset with penalty (recommended), DNF on first incident, or DNF after k incidents. And the
   size of the penalty.
3. **Compute budget for drivers:** unlimited and reported (recommended), capped `lapEval` calls, or wall time.
4. **May the line change during a race?** The line is the optimiser's output, and the README idea says "try to
   maintain the line". Allowing changes (D4) uses the 7–14% the line can give back (§4.4) but blurs "driver" with
   "optimiser". Recommend fixed for v1, a separate class later.
5. **How realistic do tyres need to be?** Plausible compounds sized to 0.05–0.2 s per lap (recommended) against
   calibration to a real series (no data for it here).
6. **Model mismatch:** should the planner's model equal the plant's (§7)? Recommend equal for v1, mismatch as a
   harder class later.
7. **Race length and default spec:** for example 20 laps, medium compound, GT racer on Harrow Ring as the first
   "championship round".
8. **Where results live:** files only, or a shared leaderboard (later).

## 11. Risks and unknowns

- **The driver can't recover from a slide** (no countersteer logic beyond the feedback gains). That is why the reset
  is recommended over physics recovery. Unverified how often near-misses turn into spins over a 20-lap race.
- **The plant's tyre curve beyond the peak** (`sin(C·atan(Bα))` with `C = 1.45`) sets how forgiving a slide is. It
  was built for checking lines, not for racing. It may need tuning once wear pushes cars past the peak regularly.
- **Per-axle replanning is unmeasured.** §4.2's replanning driver had uniform wear only, because the lap model has
  no per-axle grip yet. Rear-only wear is where the blind driver failed hardest; whether a per-axle replan holds the
  edge there as uniform replanning did is the first thing to measure after phase 3.
- **Kart and Road car outliers** (`ARCHITECTURE.md` §12): the check can't find the Kart's limit, and the Road car
  holds only 91%. Their races may say more about the controller than about tyres.
- **Cross-runtime drift over a long race** is unmeasured (§5.7).

## References

Read for this note (abstracts or manual text only, unless stated):

- D. Loiacono, L. Cardamone, P. L. Lanzi, *Simulated Car Racing Championship: Competition Software Manual*, 2013,
  arXiv:1304.1672. The manual's text was read: why bots left the process, sensors and actuators, optional noise, the
  10 ms action deadline. <https://arxiv.org/abs/1304.1672>
- P. R. Wurman et al., "Outracing champion Gran Turismo drivers with deep reinforcement learning", *Nature* 602,
  223–228 (2022). Press coverage and Sony AI's announcement read. <https://ai.sony/news/sonyai009>
- U. Rosolia, F. Borrelli, "Learning How to Autonomously Race a Car: a Predictive Control Approach" (2019),
  arXiv:1901.08184, and U. Rosolia, A. Carvalho, F. Borrelli, "Autonomous Racing using Learning Model Predictive
  Control" (2016), arXiv:1610.06534. Abstracts: each lap is an iteration; stored laps update the controller.
  <https://arxiv.org/abs/1901.08184>
- N. R. Kapania, J. C. Gerdes, "Learning at the Racetrack: Data-driven Methods to Improve Racing Performance over
  Multiple Laps", *IEEE Trans. Vehicular Technology* 69(8), 8232–8242 (2020). Title and venue confirmed; content not
  read.
- J. Spielberg, A. Templer, J. Subosits, J. C. Gerdes, "Learning Policies for Automated Racing Using Vehicle Model
  Gradients", *IEEE Open J. Intelligent Transportation Systems* 4, 130–142 (2023). Abstract: improves an
  optimisation-generated racing trajectory with model-based RL on a full-size car.
  <https://doaj.org/article/8a776f21d28546958c20c2546e119a9c>
- Y.-H. J. Hsu, *Estimation and Control of Lateral Tire Forces Using Steering Torque*, PhD thesis, Stanford, 2009.
  Abstract: pneumatic trail lets the lateral force limits be detected before they are reached.
  <https://ddl.stanford.edu/sites/g/files/sbiybj25996/files/media/file/2009_thesis_hsu_estimation_control_of_lateral_tire_forces_0.pdf>
- W. J. West, D. J. N. Limebeer, "Optimal tyre management for a high-performance race car", *Vehicle System
  Dynamics* 60(1), 1–19 (2022). Abstract: wear as a function of surface temperature and contact power; friction as a
  function of temperature and wear; multi-lap optimisation.
  <https://repository.up.ac.za/items/574ea0b5-6f6d-4b91-8859-a55942b1cf14>
- "Optimal tyre usage for a Formula One car", *Vehicle System Dynamics* 54(10), 1448–1473 (2016). Abstract: minimum
  lap time optimal control with a thermodynamic tyre wear model. I believe the authors are Tremlett and Limebeer; the
  record read didn't list them. <https://pure.uj.ac.za/en/publications/optimal-tyre-usage-for-a-formula-one-car/>
- IPG Automotive, IPGDriver (CarMaker's driver model). Training page:
  <https://ipg-automotive.com/jp/events/training-courses/ipgdriver-in-carmaker-and-truckmaker>
- Fuel effect: Motorsport.com, Bahrain GP fuel weights (0.35 s per 10 kg).
  <https://www.motorsport.com/f1/news/bahrain-gp-fuel-weights-for-the-race/3217259/>
- Assetto Corsa per-axle `WEAR_CURVE` and thermal `PERFORMANCE_CURVE` entries, as seen in a community car's
  `tyres.ini`.
  <https://gitlab.eng.unimelb.edu.au/fwongkwok/mur-assettocorsa/-/commit/07ff084ffe1200666d41062774d16e39b08243f7>

## Appendix: the probes

Three files, run from the repo root. They read `src/`, `tests/golden.json` and a patched copy of `src/`, and write
nothing in the repo. Output at `188ad94` matched the tables above exactly.

**Patched copy.** Copy `src/` to `<dir>/src-axle/` and apply to `dynamics/bicycle.js` (per-axle peak scales, and an
optional driver-belief `dc` for the feedforward; identical results at scales of 1, which the edge probe's sibling
asserted for all six cars):

```diff
-export function dynSetup(car){
+export function dynSetup(car,sF=1,sR=1){
-  return {p,m,wr,wf,a,b,L,h,tireF,apk,B,Izz,aF:p.aF,rF:p.rF,bF:p.bF,awd:p.drive==='AWD'};
+  const tireFf=Fz=>sF*tireF(Fz),tireFr=Fz=>sR*tireF(Fz);
+  return {p,m,wr,wf,a,b,L,h,tireF,tireFf,tireFr,apk,B,Izz,aF:p.aF,rF:p.rF,bF:p.bF,awd:p.drive==='AWD'};
-  return [tireF(Wf/2+df)+tireF(Wf/2-df),tireF(Wr/2+dr)+tireF(Wr/2-dr)];
+  const tf=dc.tireFf||tireF,tr=dc.tireFr||tireF;return [tf(Wf/2+df)+tf(Wf/2-df),tr(Wr/2+dr)+tr(Wr/2-dr)];
-export function dynLap(T,car,dc,line,v,keepTrace){
+export function dynLap(T,car,dc,line,v,keepTrace,dcDrv){
-  const nom=dynNominal(car,dc,line,v),th=line.th,dsL=line.ds;
+  const nom=dynNominal(car,dcDrv||dc,line,v),th=line.th,dsL=line.ds;
```

**Edge probe** (§4.2, §4.3; `node <dir>/probe-edge.mjs`, ~17 s for all six cars):

```js
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const { loadCore, setupPreset } = await import(pathToFileURL(resolve('tests/load-core.mjs')).href);
const core = await loadCore(), ax = await loadCore(join(here, 'src-axle'));
const g = JSON.parse(readFileSync('tests/golden.json', 'utf8')), track = core.TRACKS[0];
const cars = process.argv[2] ? process.argv[2].split(',') : Object.keys(core.CARS);
function lineOf(T, car, off) {
  const N = T.N, S = core.makeScratch(N), t = core.lapEval(T, car, off, S), px = S.px, py = S.py, th = new Float64Array(N), ds = new Float64Array(N);
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; th[i] = Math.atan2(py[j] - py[i], px[j] - px[i]); ds[i] = Math.hypot(px[j] - px[i], py[j] - py[i]); }
  return { t, v: Float64Array.from(S.v), line: { N, px: Float64Array.from(px), py: Float64Array.from(py), k: Float64Array.from(S.k), th, ds } };
}
const clean = r => !r.spun && !r.trouble.length && r.complete;
function edge(lap) { if (clean(lap(1))) return { fr: 1, t: lap(1).t }; let lo = 0.6, hi = 1; if (!clean(lap(lo))) return { fr: 0, t: NaN };
  while (hi - lo > 0.002) { const m = (lo + hi) / 2; if (clean(lap(m))) lo = m; else hi = m; } return { fr: lo, t: lap(lo).t }; }
const pc = e => e.fr ? `${(100 * e.fr).toFixed(1)}%`.padStart(6) : '  fail';
for (const name of cars) {
  const { P, T, car } = setupPreset(core, name, { seed: track.seed }), off = Float64Array.from(g.combos[`${name}|${track.name}`].off);
  const base = lineOf(T, car, off), dcFresh = ax.dynSetup(car, 1, 1);
  const blindLap = (sF, sR, aware) => fr => { const dcP = ax.dynSetup(car, sF, sR); return ax.dynLap(T, car, dcP, base.line, Float64Array.from(base.v, x => x * fr), false, aware ? dcP : dcFresh); };
  console.log(`\n${name}: lap model on new tyres ${base.t.toFixed(3)} s. Highest clean fraction (dyn lap time):`);
  console.log('  grip | uniform blind       ff-aware      replan, of worn pace (worn lap model) | front-only blind | rear-only blind  ff-aware');
  for (const s of [1, 0.99, 0.98, 0.97, 0.95, 0.93, 0.9]) {
    const worn = core.buildCar({ ...P, mu: P.mu * s }), wl = lineOf(T, worn, off), dcW = core.dynSetup(worn);
    const rp = edge(fr => core.dynLap(T, worn, dcW, base.line, Float64Array.from(wl.v, x => x * fr), false));
    const ub = edge(blindLap(s, s, false)), ua = edge(blindLap(s, s, true)), fb = edge(blindLap(s, 1, false)), rb = edge(blindLap(1, s, false)), ra = edge(blindLap(1, s, true));
    const w = e => `${pc(e)} (${e.fr ? e.t.toFixed(2) : '  -  '})`;
    console.log(`  ${s.toFixed(2)} | ${w(ub)} ${w(ua)} ${w(rp)} (${wl.t.toFixed(2)})          | ${w(fb)}  | ${w(rb)} ${w(ra)}`);
  }
}
```

The §4.1 table and the 5.4 ms timing came from a sibling probe. It runs each driver at the `DynCheck` fraction instead
of bisecting, asserts the patched copy equals the original at scales of 1, and times `dynLap` best of 5.

**Re-optimisation probe** (§4.4; `node <dir>/probe-reopt.mjs "GT racer"`, ~15 s per car):

```js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { loadCore, setupPreset } = await import(pathToFileURL(resolve('tests/load-core.mjs')).href);
const core = await loadCore(), g = JSON.parse(readFileSync('tests/golden.json', 'utf8')), track = core.TRACKS[0];
const name = process.argv[2] || 'GT racer';
for (const s of [1, 0.95, 0.9]) {
  const { P, T, car } = setupPreset(core, name, { seed: track.seed }), fix = Float64Array.from(g.combos[`${name}|${track.name}`].off);
  const worn = core.buildCar({ ...P, mu: P.mu * s }), B = core.makeBounds(T, worn);
  const fixedLap = core.lapEval(T, worn, fix, core.makeScratch(T.N));
  const off = Float64Array.from(fix), opt = new core.Optimizer(), t0 = performance.now();
  opt.setup(T, car, core.makeBounds(T, car), off); off.set(fix); opt.rescore(worn, B);
  while (!opt.converged) opt.step();
  const line = opt.current(new Float64Array(T.N)), lap = core.lapEval(T, worn, line, core.makeScratch(T.N));
  let dmax = 0; for (let i = 0; i < T.N; i++) dmax = Math.max(dmax, Math.abs(line[i] - fix[i]));
  console.log(`${name} grip ${s}: fixed line ${fixedLap.toFixed(4)} s, re-optimised ${lap.toFixed(4)} s (gain ${(fixedLap - lap).toFixed(4)} s), max line move ${dmax.toFixed(2)} m, ${((performance.now() - t0) / 1e3).toFixed(1)} s wall, ${opt.evals} evals`);
}
```
