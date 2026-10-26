# Apex Lab

racing to find the right line

Apex Lab finds the minimum-time racing line around a closed circuit for a car you configure, then checks how much of that pace a time-stepped vehicle model can actually hold. Everything runs in the browser. The physics is plain JavaScript (ES modules), with no build step and no dependencies. The optional 3D view draws with three.js 0.186.1, vendored in the repo.

## Run

```bash
node serve.mjs        # then open http://localhost:8000   (PORT=8080 node serve.mjs to change the port)
```

- **Requirements:** Node.js to serve the files, and a current browser with module Web Workers (and WebGL2 for the 3D view). Developed with Node v26.12.1 and tested in Chrome.
- **No install step.** The only external resource is Google Fonts.

## What you can do

**Set up a car**
- Six presets: Road car, Hot hatch AWD, EV saloon, GT racer, Open-wheeler, Kart.
- 25 parameters (some apply only to combustion or only to electric), in five groups:
  - chassis: mass, CoG height, track width, wheelbase, weight split, roll stiffness split, yaw inertia;
  - powertrain: combustion or electric, power, torque curve, gears, shift time, RWD/AWD;
  - aero: downforce, balance, drag;
  - brakes: bias;
  - tyres: grip, load sensitivity, peak slip angle.
- Derived readouts: power-to-weight, top speed, lateral grip at 100 and 200 km/h with the limiting axle (understeer or oversteer), braking, and which axle locks first.
- A tractive-force chart: per-gear force, the traction limit, and drag plus rolling resistance.

**Pick or shape a circuit**
- Four preset circuits, or a random one.
- Adjustable track width.
- **Edit shape:** drag control points, tap empty space to add a point, double-tap a point to remove it; revert to the original.
- **Hills:** a slider sets the height from the lowest to the highest point of the circuit (0–40 m), as a smooth profile per circuit. In edit mode, tap a point to set its own height (every point shows its height). The circuit's layout doesn't change, so a pinned lap stays comparable: race the flat lap against the same circuit with hills.
- **Topology in 2D:** the track surface is tinted by height (with a legend), an elevation chart shows height over the lap with the replay car, and telemetry adds height, grade and vertical load.
- **What hills do:** gravity on every climb and descent, and crests and compressions changing the load on the tyres (cars go light over a crest, and grip harder in a compression), in both the lap model and the dynamic check. No banking yet. If a car can't get up a climb, leaves the ground, or is loaded beyond the model's range, the map says so.

**Watch the optimiser**
- The search runs in the background in stages, from coarse to fine.
- A status chip, a count of laps simulated, and a convergence chart.
- Pause or run, *Search again* from the current line, or *Restart from centreline*.
- The GT racer on Harrow Ring converges in about 10 s, to 1:18.348.

**Read the result**
- The map colours the line by speed, pedal state (brake, at the limit, throttle) or tyre use (per-axle grip utilisation).
- Corner labels show each corner's minimum speed.
- Replay at ½×, 1×, 4× or 12×, or paused (car, ghost and readouts held where they are), with an optional follow camera.
- **Telemetry:** the best lap, plus live readouts during replay: speed, gear, lateral and longitudinal g, and the forces on the car: each axle's load, lateral and longitudinal tyre force and grip use, downforce and drag. Forces come from inverse dynamics on the lap model's speed profile.
- **Map tags** beside the car and the ghost show speed, g or grip use.
- Telemetry plots speed over lap distance against the centreline.
- **Ghost:** pin a lap and race against it after changing the car or line, with a time-gap chart. The readouts gain ghost and Δ columns, compared at the same race time or the same place on track, or as each lap's maxima (left and right turns, drive and braking apart). Each map tag adds a Δ against the other car at that same spot.

**See it in 3D**
- The **3D** button beside the zoom controls turns the stage into a 3D scene, with the 2D map as a corner inset (*MAP* collapses and restores it; a click on the inset goes back to 2D). It loads only when first opened, and the 2D map is unchanged when it's off. Editing the circuit switches back to 2D.
- The scene has the road with its hills, kerbs, the racing line coloured as on the map, the start band and gantry, braking boards and signs, corner labels, and the map tags.
- Eight cameras:
  - **Overview:** drag to orbit; right-drag or Shift-drag to pan; wheel or pinch to zoom; *Fit* to reset.
  - **Chase**, **Bonnet**, **Heli** and **TV** (trackside, cutting between positions) follow the car.
  - **Pair** keeps the car and the ghost in frame.
  - **Free:** drag to look; WASD or the arrow keys to move, Q and E for down and up.
  - **Map:** top-down, with a 0–60° tilt slider.
- A *Height* slider exaggerates the hills in Overview and Map.
- The cars lean, pitch, steer and spin their wheels. These movements are cosmetic, not physics. Spoked wheels turn into a blurred disc when they would strobe.
- **Lap model / Dynamic check / Both** chooses the cars: with a current dynamic check, its time-stepped car can drive alongside the lap-model car, and its failure point is marked.
- Chase and Heli widen the field of view with speed and respond to g and to the road. *Streaks* (Chase, Heli, Pair and TV) adds speed streaks.
- With *reduce motion* set in the operating system, the camera effects and streaks are off and Bonnet is unavailable.
- Without WebGL2, or if the GPU context is lost, the view returns to 2D and says so in the status chip.

**Save and compare runs**
- **Export run** saves the car, circuit and line on screen, with the lap it gives, as one JSON file (about 240 KB).
- **Load run** replaces all three and stops on the saved line, re-scored by the current physics, with the saved lap as the ghost. The Δ against the ghost is then the effect of the physics change alone. *Run* re-optimises from there.
- **Load as ghost** keeps your car and races the saved lap, on the saved circuit.
- Each file records separate hashes of the physics and reference driver sources that made it. Loading compares both identities and reports uncommitted physics or driver edits.
- Files from a different file format or car-parameter set are refused, naming the fields.

**Dynamic check**
- A time-stepped bicycle model drives the optimised line. It has yaw inertia, Pacejka-style tyres, load-transfer lag and a steering-rate limit.
- It reports the highest fraction of the lap model's pace it can hold on track without sliding, its lap time at that pace, and the peak tyre use.
- It also shows where it first runs wide or spins, marked on the map. The result goes out of date as soon as the car, track or line changes.

The app's *How the model works* panel summarises the physics. [ARCHITECTURE.md](ARCHITECTURE.md) has the details.

## How it fits together

```
index.html ─ src/app/                 state, worker client, controls, frame loop, telemetry
               │  commands ↓   ↑ events (copies, tagged with car/track/line revisions)
               │
             src/solver/worker.js ─ Solver   (in a Web Worker; owns car, track, line, optimiser, dynamic check)
               │  uses
               ├── src/core/       track spline, car tables (incl. the GGV), lap model + exact gradient, optimiser
               └── src/dynamics/   bicycle model, inverse dynamics, dynamic check

             src/views/map2d/      map and charts, drawn from explicit inputs
             src/views/scene3d/    3D view: WebGL scene (vendored three.js), cameras, pure mesh and motion helpers
             src/playback/         pose(t) along a lap or a dynamic trace; race clock for ghosts
             src/race/             multi-lap race loop and judge (Node only so far), driving src/drivers/
```

| Directory | What it holds |
|---|---|
| `src/core/` | Units boundary (`carSpec`), track generation and spline, car limit tables, the quasi-steady-state lap model `lapEval` with its hand-written adjoint gradient, the staged spline L-BFGS optimiser, and `describeCar` (chart and readout data). No DOM. |
| `src/dynamics/` | The time-stepped bicycle model (`dynLap`), inverse dynamics (`dynNominal`) and the dynamic check (`DynCheck`). No DOM. |
| `src/drivers/` | Driver models behind an observation → action interface. Today only the reference driver, the dynamic check's controller. |
| `src/race/` | A race of several laps at constant grip: continuous state, interpolated lap timing, and a judge that reads only the car's physical state (track limits; off or spin → reset with a penalty, or DNF). Not in the app yet. |
| `src/solver/` | `Solver` behind a message protocol (commands in, events out), and the Web Worker that runs it. The main thread never runs physics. |
| `src/playback/` | `pose()` (position, heading, speed, accelerations, gear; plus steering and slip for dynamic traces) and the race clock. |
| `src/views/map2d/` | Camera, palette, map drawing and side-panel charts: pure functions of what they're given. |
| `src/views/scene3d/` | The 3D view: `scene.js` (the WebGL renderer, loaded on first use), the eight cameras, and pure helpers for meshes, markings, car model, attitude, camera effects, streaks and wheel blur. Like the map, it reads no app state. |
| `vendor/three-0.186.1/` | three.js, pinned and checked by hash (`tests/vendor-three.test.mjs`). |
| `tools/` | `cdp.mjs`, a zero-dependency headless-Chrome driver, and its browser scenarios in `tools/scenarios/` (screenshot references in `ref/`). |
| `src/app/` | The page: one state object, the solver client, controls, input, frame loop and boot. Car and circuit presets. Saved runs (file format, committed physics hash). |
| `tests/` | Node tests: see below. |
| `prototype/` | The original single-file prototype, frozen as a reference. |

## Tests

```bash
node --test tests/    # Node's built-in runner, zero dependencies, about 35–40 s
```

The tests assert contracts (physical bounds, closed forms, finite differences, budgets), not historical outputs: a
better optimiser result or an equivalent mesh passes, while a broken promise fails a named check.

- **Gradient check:** the exact gradient against finite differences.
- **Convergence:** the optimiser run to the end, within approved effort budgets and a minimum search quality, flat
  and on hills.
- **Skidpad:** the dynamic model on a constant-speed circle.
- **Fixed lines:** the dynamic check on 30 committed lines (6 cars × 4 circuits, plus 25 m hills), within physical
  bounds.
- **Track, units and flat physics:** geometry, conversions, drag, rolling loss, EV regimes and the cornering limit,
  against hand-computed values.
- **Solver protocol, `describeCar` and playback.**
- **Saved runs:** the solver's `load` command (a recorded line comes back bit for bit), the file format and its refusals, the committed physics hash, and a run file recorded before elevation whose recorded data survives, re-scored by current physics on load.
- **Elevation:** flat circuits unchanged bit for bit; the gradient on hills; closed forms (crest and compression corner speeds, terminal speed up a ramp); the dynamic check on hills.
- **Race:** steady laps, lap times that add up, resets (including across the finish line), and the judge's thresholds. `node tests/check-race-mutations.mjs` (run separately) checks that each of these tests fails on deliberately broken code.
- **3D view:** the pure modules (frames, meshes, cameras, attitude, effects, streaks, wheel blur) in Node, and the vendored three.js against its hashes.

The browser side (the panel, the frame loop, the WebGL scene) is checked by scenarios driving headless Chrome:

```bash
node tools/cdp.mjs tools/scenarios/view3d.mjs   # exit 0 pass, 1 a check failed, 2 the driver couldn't run it
```

The 3D scenarios compare screenshots against references in `tools/scenarios/ref/`. `APEX_UPDATE_REFS=1` rewrites them; review the images before committing.

Exact numbers are an opt-in report: `node tools/numeric-report.mjs` compares the current source with `tests/golden.json`
bit for bit on the pinned runtime. It reports "identical" (a mechanical refactor must), a delta table to review (a
physics change), or one message on another runtime. After an intended physics change, regenerate the baseline with
`node tests/make-golden.mjs --write` and review the diff. After any edit to the physics files, also run `node tests/make-physics-version.mjs --write`. Run the same command after driver edits; it regenerates independent physics and driver identities.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): conventions, physics, optimiser, data shapes, the worker protocol, the pose contract, and the migration plan with its status.
- [CLAUDE.md](CLAUDE.md): a short guide for working on the code, including the things that bite.
- [docs/3d-view.md](docs/3d-view.md): the 3D view's requirements and design options (the plan it came from is `docs/plans/3d/PLAN.md`, its record `docs/plans/3d/STATUS.md`).
- [docs/deferred.md](docs/deferred.md): work set aside on purpose, with the context to pick it up.

## TODO

6. support comparison of cars/simmed lines between apex lab versions
7. improved tyre physics (maybe not full temperatures, but some sort of deg is needed)
8. weather
10. speed streaks are lame
11. control for 'number of hills' in elevation
12. banking
13. movable/collapsible minimap in 3d
14. ghost waits for you, you don't wait for ghost
15. smoothing turning rotations

Progress ([docs/race-mode.md](docs/race-mode.md) §9): phase 1 (plant/driver split) and phase 2 (race loop and judge at constant grip, Node only) are done. Next: per-axle grip scales, then tyre wear.
