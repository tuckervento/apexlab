# Tyre degradation and temperature: options

Research notes, not a plan: how tyre wear and temperature could enter the physics, what each path costs, and what was
measured to decide between them. Written 2026-10-24 at commit `b12517d`; no source was changed. Also kept as a Claude
Doc with charts: <https://claude.ai/artifact/3KY3yQiPUYWeuTFXSC1D8L> (this file is the copy in the repo).

## Summary

Recommendation: a per-lap tyre energy map first (path 0), then stint wear as an outer loop with separate front and rear
grip (path 1), with a lap-average temperature per axle (path 1b). Temperature varying within a lap (paths 2 and 3) can
come later; full tyre-management optimisation (path 4) should be skipped.

Path 1 never touches `lapEval` or its hand-written adjoint, keeps flat goldens bit-identical while it is off, and
captures the effect that matters most for a racing line: the front/rear balance shift as one axle goes off. README
TODO #7 already points this way: "maybe not full temperatures, but some sort of deg is needed".

## What the model does today

Grip comes from one tyre law with a fixed peak: there is no tyre state, so every lap runs on tyres at their best.

- **Tyre law:** peak force `F = mu * max(0.25, 1 - sens*(Fz/FZ0 - 1)) * Fz`, with `FZ0 = 3500 N`. One `mu` for both
  axles (`gripTables` in `src/core/car.js`; `dynSetup` in `src/dynamics/bicycle.js` repeats it).
- **Tables:** `buildCar` precomputes the lateral limit (`alat`, `kcrit`, `kcF`, `kcR`) and the braking/traction table
  (GGV: `ggB`, `ggT`, speed × lateral fraction q). About 16 ms flat, about 250 ms with the hills load axis.
- **Lap model (`lapEval`, `src/core/lap.js`):** corner speed per station, a forward pass (acceleration, forward in
  time) from the slowest station, a backward pass (braking, backward in time), the minimum of the two. Exact adjoint.
- **Per-station hook that already exists:** `lim = {cap, bs, ts}` scales braking and traction per station. It has no
  gradient and doesn't cover lateral grip; the dynamic check uses it.
- **Dynamic model (`dynLap`):** 4 ms time-stepped bicycle model, Pacejka-style lateral curve per axle, peak from the
  same law. `dynNominal` (inverse dynamics) returns per-axle `Fy`, `Fx`, slip angles and loads.

Missing for tyre work:

- **No longitudinal slip ratio** in either model. Longitudinal force takes its share of the friction circle with no
  slip, so braking and traction slip energy needs an assumed slip curve.
- **Axle level only.** No left/right tyres, so a circuit that mostly turns one way can't cook one side.

## Measurements

Method: each preset on Harrow Ring, on its committed converged line from `tests/golden.json`, held fixed while the car
is rebuilt with `mu` scaled. Node, commit `b12517d`. Reproduce with the probe in the appendix.

**Lap-time cost of grip.** Losing 1% of grip costs 0.38–0.52% of lap time; the Kart only 0.25%. Per 1% is half the
measured cost of 2% less `mu`.

| Car | Lap (s) | Per 1% less grip | Seconds per 1% |
|---|---|---|---|
| Open-wheeler | 59.627 | 0.52% | 0.31 |
| Road car | 96.359 | 0.46% | 0.44 |
| GT racer | 78.377 | 0.42% | 0.33 |
| EV saloon | 92.428 | 0.41% | 0.38 |
| Hot hatch AWD | 91.378 | 0.38% | 0.35 |
| Kart | 108.835 | 0.25% | 0.27 |

A realistic 0.05–0.2 s per lap of degradation therefore corresponds to roughly 0.1–0.5% of grip lost per lap. That
sizes the wear rate in path 1.

**Can a grip change just scale the existing tables?** Compared: the scale factor times the table built at full `mu`,
against the table actually rebuilt at the scaled `mu` (speeds above 5 m/s).

| Car | Lateral limit, relative error at 0.95 mu | GGV, absolute error at 0.95 mu (m/s²) | GGV, absolute error at 0.85 mu (m/s²) |
|---|---|---|---|
| Open-wheeler | 0.80% | 0.36 | 0.81 |
| GT racer | 0.85% | 0.35 | 0.86 |
| Hot hatch AWD | 0.57% | 0.21 | 0.59 |
| Kart | 0.01% | 0.21 | 0.52 |
| Road car | 0.49% | 0.18 | 0.46 |
| EV saloon | 0.53% | 0.12 | 0.31 |

The GGV doesn't scale as well as the lateral limit (I expected it to). Relative errors reach 4.6–22% because entries
near the friction-circle edge are small remainders (axle capacity minus lateral force). In absolute terms the error at
0.95 mu is close to the 0.27 m/s² the hills load axis already accepts; at 0.85 mu it is about three times that.
Scaling whole-car tables also can't give different front and rear grip, so per-axle grip needs rebuilt tables anyway.

**Slip energy.** Each axle takes 0.8–2.1 MJ of lateral slip energy per lap (the Kart under 0.1 MJ); the rear exceeds
the front for 5 of 6 cars. Computed as `|Fy| * v * |tan(alpha)|` from `dynNominal` at the lap model's speeds.

| Car | Front (MJ) | Rear (MJ) | Peak front / rear (kW) |
|---|---|---|---|
| Road car | 1.13 | 1.57 | 34 / 47 |
| Hot hatch AWD | 1.61 | 1.26 | 47 / 48 |
| EV saloon | 1.86 | 2.10 | 58 / 68 |
| GT racer | 0.95 | 1.78 | 41 / 77 |
| Open-wheeler | 0.82 | 1.66 | 69 / 110 |
| Kart | 0.05 | 0.08 | 2 / 4 |

This is the input any thermal or wear model needs, and `dynNominal` already provides it. Braking and traction slip
energy is missing; I believe it is of the same order as the cornering part, but that is unverified.

## Why temperature inside one lap is hard

Tyre temperature moves forward in time, but `lapEval`'s braking pass runs backwards in time, so temperature can't be
computed in a single pass.

- **Causality.** Grip in a braking zone depends on how hot the tyres got in the corners before it, which the backward
  pass hasn't seen yet. A within-lap temperature needs a fixed-point iteration: lap → temperatures → grip map → lap,
  until it settles.
- **The gradient.** A frozen grip map per optimiser step means the optimiser never learns that a line overheats the
  fronts, and it may oscillate as hot spots move with the line. An exact gradient means a new reverse chain through a
  periodic recurrence: the most expensive change this codebase could take.
- **Per-axle grip inside the lap needs new table axes.** The GGV is a minimum over two axles, so front and rear scales
  need a front × rear grip axis: 25 levels at about 16 ms is about 400 ms flat, and seconds on hills.

Timescales are the way out. Surface temperature changes over seconds, bulk (carcass) temperature over tens of seconds,
wear over laps (typical racing-tyre orders of magnitude, from memory, not measured here). With the tyres held in their
window, today's model already is the "hot lap at optimum temperature" model. Within one lap, temperature adds value
only for warm-up (out-laps) and overheating through a run of corners; wear can be held constant per lap.

## Implementation paths

Paths 0 and 1 avoid `lapEval` entirely; paths 2 and 4 change it, and that is where the cost is.

| Path | What | Where it lives | Gradient and goldens | Cost | What it answers |
|---|---|---|---|---|---|
| 0. Tyre energy map | Per-axle slip energy and power along the line, shown like the tyre-use colouring | Solver and snapshot, from `dynNominal` | No physics change | Small | Where a line works the tyres; the input every other path needs |
| 1. Stint wear, outer loop | Front and rear grip scales; wear builds per lap from energy, constant within a lap; car rebuilt each lap | `gripTables` and `dynSetup` take a grip function per axle; a `stint` solver command | `lapEval` untouched, no adjoint work; scale 1 bit-identical (`x*1 === x`) | Medium: fixed line well under 1 s for 20 laps; re-optimising, seconds per lap | Lap time over a stint, balance shift, whether the line should change late in a stint |
| 1b. Lap-average temperature | One temperature per axle per lap from an energy balance; grip from its place in the window; steady lap | Same as path 1 | Same as path 1 | Small on top of path 1 | Overheating on front-limited circuits; compound choice |
| 2. In-lap temperature, lap model | A grip scale per station per axle, iterated until it settles | `lapEval` plus a front × rear grip axis | Frozen-map gradient (may oscillate) or a hard new adjoint; table builds multiply | Large | Overheating partway through a lap; warm-up |
| 3. In-lap temperature, `dynLap` only | Thermal state per axle in the 4 ms model, which runs forward in time and has slip angle and `Fy` | `bicycle.js` | No adjoint; dynamic goldens safe if off by default | Medium | A realistic replay. Not optimised for; skews the dynamic check (a 90%-pace lap runs cooler), so a separate replay, not `DynCheck` |
| 4. Full tyre management | Minimise total stint time; the line trades pace for tyre life | Optimal control over the stint | Very large | Very large | Not worth it now |

## Recommended design: paths 0, 1 and 1b

The tyre state is two numbers per lap, a front and a rear grip scale, applied when the car is built. The lap model and
its gradient don't change. A sketch, not a reviewed design.

**Path 0: energy map**

- Lateral slip power per axle and station from `dynNominal` at the lap model's speeds: `P = |Fy| * v * |tan(alpha)|`;
  energy per step = power × the step's time `2*ds/(v_i + v_j)`.
- Longitudinal slip power needs an assumed slip ratio (for example from force fraction and a peak slip-ratio
  parameter). Open decision 4.
- Carry it on the snapshot beside `u`, behind the same `view` command, and colour the line with it.
- Check: on the skidpad (constant radius and speed), power must equal `Fy * v * tan(alpha)` from the closed-form
  steady state.

**Path 1: wear, per lap**

- `CarSpec` gains front and rear grip scales `sF`, `sR` (1 = new tyres). In `gripTables` the front axle's sums (`lat`
  for the front, `bf`, the front term of `trc`, `cap(Wf, ...)` in the GGV) use `mu*sF`, the rear's `mu*sR`.
  `dynSetup`'s `tireF` splits the same way, so `axleCaps` stays consistent with the lap model.
- After each lap, wear builds up from that lap's energy per axle `a`:
  `w[a, n+1] = w[a, n] + k_w * E[a, n] * f(T[a, n])`, with `s_a = 1 - w_a`.
- Size `k_w` from the measurements: 0.05–0.2 s per lap needs about 0.1–0.5% of grip lost per lap.
- Stint loop in the solver: rebuild the car (about 16 ms flat, 250 ms on hills), then either re-score the fixed line
  (about 0.2 ms) or rescore the optimiser from stage 3 (seconds). Output: lap time per lap, `sF`/`sR` per lap, and
  which axle limits (`limF`) as the balance shifts.

**Path 1b: lap-average temperature**

- One temperature per axle per lap from a steady energy balance, `C * dT/dt = P - h(v) * (T - T_amb)`, so over a
  periodic lap `T_mean = T_amb + E / ∫ h(v) dt`.
- Grip window: `s_T = 1 - c * (T - T_opt)^2`, with a floor. Grip → lap → energy → temperature → grip is a two-number
  fixed point per lap; I expect it to settle in a few iterations (not tested).
- Parameters as compound presets (soft, medium, hard: `T_opt`, window width `c`, cooling, `k_w`), not raw sliders.
  There is no data to calibrate 5–8 raw knobs, and sliders would produce precise-looking numbers nobody can check.

**Verification to plan for**

- With `sF = sR = 1` and tyres off: all 30 goldens, prototype parity and the pre-elevation run file unchanged.
- Properties: lower scale → slower lap; a front-only scale moves `limF` toward front-limited; stint lap times rise
  monotonically with wear on a fixed line.
- Each property shown to fail on code broken on purpose (`APEX_SRC`), as for elevation.

## Open decisions and shared work

Four decisions set the scope before any code:

1. **What should the app answer:** a qualifying lap (today's model is mostly right already) or a stint (paths 1/1b)?
2. **Per axle or per tyre?** Left/right needs a four-wheel model, or a rough split of each axle's energy by load and
   corner direction.
3. **Re-optimise the line each lap, or keep it fixed?** Re-optimising is more interesting and about 100× slower.
4. **Accept an assumed longitudinal slip curve?** Without one, the energy covers cornering only.

Work any path needs:

- [ ] New `CarParams` fields → `carSpec` validation, presets, and a run-file v3 migration that fills them (`carSpec`
  allows no defaults).
- [ ] Regenerate `src/app/physics-version.js` (`node tests/make-physics-version.mjs --write`) after editing physics.
- [ ] Keep flat goldens bit-identical while tyres are off; if tyres default on, regenerate `tests/golden.json`, review
  the diff, and delete `tests/parity.test.mjs`.
- [ ] Solver protocol: a `stint` command plus progress and result events (`ARCHITECTURE.md` §10.1).
- [ ] An entry in `docs/deferred.md`, and README TODO #7 updated, when work starts.

## Appendix: the probe

Prints all three measurement tables. Save as a file and run from the repo root (`node <file>`, ~10 s); it reads
`src/` and `tests/golden.json` and writes nothing. Output at `b12517d` matched the tables above exactly.

```js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { loadCore, setupPreset } = await import(pathToFileURL(resolve('tests/load-core.mjs')).href);
const core = await loadCore(), g = JSON.parse(readFileSync('tests/golden.json', 'utf8')), track = core.TRACKS[0];
const fixture = name => Float64Array.from(g.combos[`${name}|${track.name}`].off);

console.log(`(1) lap on the committed converged line (${track.name}) vs mu scale`);
for (const name of Object.keys(core.CARS)) {
  const { T, P } = setupPreset(core, name, { seed: track.seed }), off = fixture(name);
  const lap = s => core.lapEval(T, core.buildCar({ ...P, mu: P.mu * s }), off, core.makeScratch(T.N));
  const t1 = lap(1), t98 = lap(0.98), t95 = lap(0.95);
  console.log(`  ${name.padEnd(14)} ${t1.toFixed(3)} s | mu-2%: +${(t98 - t1).toFixed(3)} s (${(100 * (t98 / t1 - 1)).toFixed(2)}%) | mu-5%: +${(t95 - t1).toFixed(3)} s`);
}

console.log('\n(2) s*table(mu) vs table(s*mu), speeds > 5 m/s: alat max relative error; GGV (ggB, ggT) max absolute error');
for (const name of Object.keys(core.CARS)) {
  const p = core.carSpec(core.CARS[name]), base = core.gripTables(p, 1), row = [];
  for (const s of [0.95, 0.85]) {
    const t = core.gripTables({ ...p, mu: p.mu * s }, 1);
    const err = (a, b, stride, rel) => { let m = 0; for (let i = 0; i < a.length; i++) if (Math.floor(i / stride) * 0.5 > 5 && (!rel || b[i] > 0.5)) m = Math.max(m, Math.abs(s * a[i] - b[i]) / (rel ? b[i] : 1)); return m; };
    row.push(`s=${s}: alat ${(100 * err(base.alat, t.alat, 1, true)).toFixed(2)}%, ggB ${err(base.ggB, t.ggB, 33).toFixed(2)}, ggT ${err(base.ggT, t.ggT, 33).toFixed(2)} m/s²`);
  }
  console.log(`  ${name.padEnd(14)} ${row.join(' | ')}`);
}

console.log('\n(3) lateral slip energy per lap, |Fy|*v*|tan(alpha)| from dynNominal at the lap model\'s speeds');
for (const name of Object.keys(core.CARS)) {
  const { T, car } = setupPreset(core, name, { seed: track.seed }), N = T.N, S = core.makeScratch(N), lapT = core.lapEval(T, car, fixture(name), S);
  const px = S.px, py = S.py, th = new Float64Array(N), ds = new Float64Array(N);
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; th[i] = Math.atan2(py[j] - py[i], px[j] - px[i]); ds[i] = Math.hypot(px[j] - px[i], py[j] - py[i]); }
  const v = S.v, nom = core.dynNominal(car, core.dynSetup(car), { N, px, py, k: S.k, th, ds }, v);
  let Ef = 0, Er = 0, Pf = 0, Pr = 0;
  for (let i = 0; i < N; i++) {
    const dt = 2 * ds[i] / (v[i] + v[(i + 1) % N]);
    const pf = Math.abs(nom.Fyf[i]) * v[i] * Math.abs(Math.tan(nom.af[i])), pr = Math.abs(nom.Fyr[i]) * v[i] * Math.abs(Math.tan(nom.ar[i]));
    Ef += pf * dt; Er += pr * dt; Pf = Math.max(Pf, pf); Pr = Math.max(Pr, pr);
  }
  console.log(`  ${name.padEnd(14)} lap ${lapT.toFixed(2)} s | front ${(Ef / 1e3).toFixed(0)} kJ (peak ${(Pf / 1e3).toFixed(0)} kW) | rear ${(Er / 1e3).toFixed(0)} kJ (peak ${(Pr / 1e3).toFixed(0)} kW)`);
}
```
