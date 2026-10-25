# Apex Lab

racing to find the right line

Apex Lab finds the minimum-time racing line around a closed circuit for a car you configure, then checks how much of that pace a time-stepped vehicle model can actually hold. Everything runs in the browser. The physics is plain JavaScript (ES modules), with no build step and no dependencies.

## Run

```bash
node serve.mjs        # then open http://localhost:8000   (PORT=8080 node serve.mjs to change the port)
```

- **Requirements:** Node.js to serve the files, and a current browser with module Web Workers. Developed with Node v26.12.1 and tested in Chrome.
- **Use `serve.mjs`, not `file://`:** browsers won't load ES modules or Workers from `file://`. `serve.mjs` is a zero-dependency static server bound to 127.0.0.1.
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
             src/playback/         pose(t) along a lap or a dynamic trace; race clock for ghosts
```

| Directory | What it holds |
|---|---|
| `src/core/` | Units boundary (`carSpec`), track generation and spline, car limit tables, the quasi-steady-state lap model `lapEval` with its hand-written adjoint gradient, the staged spline L-BFGS optimiser, and `describeCar` (chart and readout data). No DOM. |
| `src/dynamics/` | The time-stepped bicycle model (`dynLap`), inverse dynamics (`dynNominal`) and the dynamic check (`DynCheck`). No DOM. |
| `src/solver/` | `Solver` behind a message protocol (commands in, events out), and the Web Worker that runs it. The main thread never runs physics. |
| `src/playback/` | `pose()` (position, heading, speed, accelerations, gear; plus steering and slip for dynamic traces) and the race clock. |
| `src/views/map2d/` | Camera, palette, map drawing and side-panel charts: pure functions of what they're given. |
| `src/app/` | The page: one state object, the solver client, controls, input, frame loop and boot. Car and circuit presets. Saved runs (file format, committed physics hash). |
| `tests/` | Node tests: see below. |
| `prototype/` | The original single-file prototype, frozen as a reference. |

## Tests

```bash
node --test tests/    # Node's built-in runner, zero dependencies, about 15 s
```

- **Gradient check:** the exact gradient against finite differences.
- **Convergence:** the optimiser run to the end.
- **Skidpad:** the dynamic model on a constant-speed circle.
- **Golden values:** 6 cars × 4 circuits, bit for bit.
- **Parity:** the modules against the prototype.
- **Solver protocol, `describeCar` and playback.**
- **Saved runs:** the solver's `load` command (a recorded line comes back bit for bit), the file format and its refusals, the committed physics hash, and a run file recorded before elevation that must still reload exactly.
- **Elevation:** flat circuits unchanged bit for bit; the gradient on hills; closed forms (crest and compression corner speeds, terminal speed up a ramp); the dynamic check on hills.

Golden values are per JavaScript runtime. After an intended physics change (or a Node upgrade), regenerate them with `node tests/make-golden.mjs --write` and review the diff. After any edit to the physics files, also run `node tests/make-physics-version.mjs --write`. Run the same command after driver edits; it regenerates independent physics and driver identities.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): conventions, physics, optimiser, data shapes, the worker protocol, the pose contract, and the migration plan with its status.
- [CLAUDE.md](CLAUDE.md): a short guide for working on the code, including the things that bite.
- [investigations/](investigations/): write-ups of past investigations (e.g. why Node and Chrome converge to slightly different laps).

## TODO

1. ~Decouple sim and UI~
2. ~"car" camera expands to fit ghost~
3. ~more physics observability~
4. ~Add Z axis / elevation changes~
5. ~save/load car config + simmed line~
6. support comparison of cars/simmed lines between apex lab versions
7. improved tyre physics (maybe not full temperatures, but some sort of deg is needed)
8. weather?
9. ~add "simple" controls that map to the full configurables~

### idea
after finding ideal line, make 'driver' repeat laps with realistic deg, and it needs to try to maintain the line / compensate for the loss of grip.  this would provide another layer of 'competition' as we try to improve the driving algorithms and see if we can beat prior 'race times'
