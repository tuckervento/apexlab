# Simple car controls: findings and recommendations

A proposal for README TODO #9 ("simple" controls that map to the full configurables), not yet started. File:line
references are as of commit `b12517d` (2026-10-24); re-check them when picking this up. Online copy (same content, with
the chart drawn): <https://claude.ai/artifact/Uu4HgKxXom3SUE9qYCkY52>.

## Summary

Build simple controls as a **parametric preset**: pick a base car, turn about eight knobs, and a pure function in
`src/app/` writes all 25 `CarParams` fields. `carChanged()` sends them to the worker exactly as today, so physics,
goldens, the physics hash, the worker protocol and the run-file format are all untouched.

The one finding that shapes the design: a "neutral" handling balance can't be computed with a simple rule on the main
thread (measured below, off by up to 5.7%). So every knob should be **relative to the base car**: centred knobs
reproduce the preset exactly, and the existing balance readout shows the user what a change actually did.

---

## The car today

A car is 25 `CarParams` fields in UI units, edited by 25 sliders and toggles in the `SPEC` table
(`src/app/controls.js:13`), or replaced whole by one of 6 presets (`src/app/presets.js:3`).

- **Groups:** chassis (mass, CoG height, track, wheelbase, yaw index, weight on rear, front roll stiffness), powertrain
  (ICE/EV, power, torque peak, redline, gears, shift time, 1st and top gear speeds, EV base and max speed, RWD/AWD),
  aero (CL·A, aero balance, CD·A), brakes (bias) and tyres (μ, load sensitivity, peak slip angle).
- **Validation:** `carSpec` (`src/core/units.js:5`) converts to SI and throws on any missing or invalid field. It fills in
  no defaults.
- **The main thread has no car.** The worker builds it; the page only sees `describeCar` output (power/weight, top
  speed, lateral g and limiting axle at 100 and 200 km/h, braking g and first axle to lock), shown by `renderDerived`
  (`src/app/controls.js:72`).
- **Run files are strict:** they store exactly the 25 fields, and `readRunFile` (`src/app/runfile.js:51`) refuses
  anything more or less. Any change to the car layout means a version bump and an explicit migration.

---

## Finding: neutral balance needs the full grip model

A tempting rule for a "Balance: 0 = neutral" knob is to set front roll stiffness and front aero share both equal to the
front weight share (`rollF = aeroF = 100 − rear`). Tested on all six presets with `buildCar`, comparing each axle's
steady lateral limit (`ayF`, `ayR`) at 100 and 200 km/h. **It is not neutral.**

Gap = (front − rear) ÷ the larger, in %. Negative: the front axle limits first (understeer); positive: the rear
(oversteer); 0: both saturate together.

| Car | Preset, 100 km/h | Preset, 200 km/h | Rule, 100 km/h | Rule, 200 km/h |
|---|---|---|---|---|
| Road car | −2.9 | −3.0 | −1.1 | −1.1 |
| Hot hatch AWD | −5.6 | −6.6 | −4.6 | −4.8 |
| EV saloon | −1.3 | −1.3 | +0.8 | +0.8 |
| GT racer | +1.0 | +0.5 | +3.9 | +4.6 |
| Open-wheeler | +0.9 | +1.7 | +3.5 | +5.7 |
| Kart | +0.2 | +0.2 | +0.2 | +0.2 |

The Hot hatch still understeers under the rule, and the GT racer and Open-wheeler end up further from neutral than
their presets.

**Why:** tyre load sensitivity (μ falls as load per tyre rises; `gripTables`, `src/core/car.js:13`) penalises the more
heavily loaded axle even before any load transfer. With unequal static axle loads that effect is as large as the roll
and aero split, so "neutral" depends on mass, weight split, sensitivity and downforce together. Finding it needs
`gripTables`, which runs only in the worker.

**Consequence:** a closed-form absolute balance knob on the main thread would mislabel cars by several percent. Knobs
relative to the base car avoid the problem, and the existing readout already reports which axle limits.

To re-run (from the repo root):

```sh
node --input-type=module -e "
const {buildCar}=await import('./src/core/car.js'),{CARS}=await import('./src/app/presets.js');
for(const [n,P] of Object.entries(CARS))for(const rule of [false,true]){const p={...P};if(rule)p.rollF=p.aeroF=100-p.rear;const c=buildCar(p);
console.log(n.padEnd(14),rule?'rule  ':'preset',[100,200].map(k=>{const i=Math.round(k/3.6/0.5),f=c.ayF[i],r=c.ayR[i];return (100*(f-r)/Math.max(f,r)).toFixed(1).padStart(5);}).join(' '));}"
```

---

## Proposed knobs

Eight controls cover all 25 fields: one picks a base car and seven are knobs; brake bias is derived with no control.
Every knob is centred on the base car's own value.

| Knob | Fields it sets | Mapping rule |
|---|---|---|
| Base car (the 6 presets) | all 25, including those not exposed: `cg`, `track`, `wb`, `yawDI`, `rear`, `gears`, `nRed`, `nT` | starting point |
| Weight (±25 %) | `mass` | base × (1 + w/100); also moves the gearing (below) |
| Power (±50 %) | `power`; `vTopG`, `v1` (ICE) and `evMax`, `evBase` (EV) | auto gearing: both gear sets scaled by new ÷ base drag-limited top speed, from P·η = (½ρ·CdA·v² + m·g·Crr)·v, so Weight and Downforce move it too. At base power, mass and drag the ratio is exactly 1. |
| Tyres: Street / Sport / Semi-slick / Slick / as base | `mu`, `sens`, `slipPk` | values taken from the presets: 1.00 / 0.10 / 8°, 1.08 / 0.10 / 8°, 1.38 / 0.15 / 6°, 1.60 / 0.20 / 5° |
| Downforce | `cla`, `cda` | one knob; drag follows downforce: `cda = base_cda + Δcla / LD`, LD ≈ 8 (presets imply about 7–11) |
| Balance: understeer ↔ oversteer, 0 = base | `rollF`, `aeroF` | e.g. `rollF − 10b`, `aeroF + 5b` for b in [−1, 1], clamped |
| Drivetrain | `pt`, `drive` | the existing ICE/EV and RWD/AWD toggles |
| Gearbox: Manual / DCT / Sequential (ICE) | `shiftT` | 0.2 / 0.1 / 0.04 s |
| Brake bias (no knob) | `brakeF` | **the base car's, unchanged** (decided 2026-10-24): the derived ideal-bias rule ignored load sensitivity and braked worse than the base bias on some cars (EV saloon on slicks 1.17 g against 1.35 g). The Advanced slider tunes it |

Optional extras: **Engine character** (torquey ↔ peaky, sets `nT`) and **Layout** (front / mid / rear engine, sets
`rear`).

---

## Architecture

Simple mode is an editor over `S.P`, like the preset dropdown already is: `S.P` stays the only car the worker sees, so
nothing below the app layer changes.

```
 ┌───────────────────────────┐
 │ Simple knobs (new)        │
 │ base car + 7 knobs        ├──┐
 │ deriveParams() simple.js  │  │   ┌─────────────────────┐  setCar   ┌────────────────────────┐
 └─────────────▲─────────────┘  └──▶│ S.P                 ├──────────▶│ Worker                 │
               ┆ detaches       ┌──▶│ 25 CarParams fields │           │ carSpec, then buildCar │
 ┌─────────────┴─────────────┐  │   │ the only car sent   │           │ unchanged              │
 │ Advanced sliders          │  │   └──────────▲──────────┘           └───────────┬────────────┘
 │ 25 fields, as today       ├──┘              │ save / load                      │ carInfo
 │ an edit detaches Simple   │      ┌──────────▼──────────┐           ┌───────────▼────────────┐
 └───────────────────────────┘      │ Run file            │           │ Derived readout        │
                                    │ stores the 25 fields│           │ limiting axle 100/200  │
                                    │ format unchanged    │           │ shows what Balance did │
                                    └─────────────────────┘           └────────────────────────┘
```

- **`src/app/simple.js`** (new, pure, no DOM): `SIMPLE` knob definitions, `defaults(base)` for the centred knobs, and
  `deriveParams(simple)` returning `CarParams`. It reads only `CARS` and constants, so the physics hash is unchanged.
- **Clamping:** derived values are clamped to the Advanced slider ranges, which means exporting the ranges from `SPEC`.
  Advanced then never shows an out-of-range value, and `carSpec` still validates in the worker.
- **State:** `S.simple = {base, weight, power, tyre, downforce, balance, gearbox}` beside `S.P`.
- **Simple / Advanced toggle** in `#carSection` (`index.html:228`). Switching to Advanced loses nothing: the derived
  numbers appear as sliders. An Advanced edit *detaches* the simple panel, which then says that changing a knob
  re-derives from the base and replaces those edits.
- **Derived readout** stays visible in both modes; it is how a user sees what Balance actually did.
- **Run files unchanged:** they store the 25 fields. A loaded run opens detached, or matches a preset as now. Saving
  knob positions would need run-file v3 and a migration; not worth it yet.

---

## Verification

A new `tests/simple.test.mjs` pins the mapping. No physics changes, so goldens, prototype parity and
`physics-version.js` stay untouched.

1. **Identity:** for every preset, `deriveParams(defaults(base))` deep-equals `CARS[base]`, bit for bit.
2. **Validity:** over a grid of knob values, every result passes `carSpec` and stays inside the slider ranges.
3. **Each knob does what its label says**, via `buildCar` / `describeCar` on every base car:
    - more power gives higher kW/t and top speed;
    - more downforce gives more lateral g at 200 km/h;
    - a grippier tyre gives more lateral g;
    - Balance at its understeer end makes the front axle the limit at 100 and 200 km/h, and at its oversteer end the
      rear.
4. **Auto gearing:** as the knobs move the drag-limited top speed, top speed moves with it (within 1 %). Not "set by drag": three presets (Hot hatch, EV saloon, GT racer) sit on their rev limiter, and identity keeps them there.

---

## Order of work and risks

Three steps, each ending at a checkpoint that can be observed:

1. **Mapping and tests, no UI.** `simple.js` plus `tests/simple.test.mjs`. Checkpoint: the identity test passes exactly
   for all six presets.
2. **UI.** Mode toggle, knob panel, detach behaviour. Checkpoint: every preset shows identical numbers and lap in both
   modes in the running app.
3. **Docs.** `S.simple` shape in `ARCHITECTURE.md` §7, the app-layer list in `CLAUDE.md`, README TODO #9 ticked.

Risks:

- **Extreme cars get easy to build.** The dynamic check's driver gains were tuned only on the GT and Road presets
  (`ARCHITECTURE.md` §12), so its pass rate is less reliable on cars far from those.
- **Rebuild cost is unchanged** (one `setCar` per knob change), but on a hilly circuit that is still about 250 ms per
  change.

---

## Open decisions

| Decision | Options | Recommendation |
|---|---|---|
| Balance knob reference | relative to base car; or absolute 0 = neutral, via a new worker command that solves for neutral `rollF` | relative now; the finding above shows a closed form is wrong, and the solver route widens the protocol |
| Knob set | the 7 above; add Engine character and/or Layout | the 7, add extras only if wanted |
| Advanced edits | detach the simple panel; or knobs apply as changes on top of the current car | detach: knob positions keep a stable meaning |
| Knob positions in run files | no; or run-file v3 with a migration | no: the 25 fields are the truth |
| Default mode for new users | Simple; or Advanced | open |
