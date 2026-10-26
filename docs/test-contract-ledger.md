# Test-contract deletion ledger

Every assertion removed under `PLAN.md` (the test-contract plan) is recorded here before it goes. This is
`docs/test-contract-plan.md` §7: "record the old assertion, the promise it uniquely protected, its replacement test or
why none is needed, and a demonstrated fault the replacement detects".

Entry format (one per removed assertion):

- **Old:** `file:line`, and what it asserted.
- **Promise:** what it uniquely protected (or "none": it pinned an incidental detail).
- **Replacement:** the new test or assertion by name, or why none is needed.
- **Fault shown:** the mutation (where and what) and the assertion that failed on it.

For a budget, also record the runtime observations, the units, the rationale, and a broken case outside the bound.

## 2.1 — scene3d incidental assertions

- **Old:** `tests/scene3d-car.test.mjs:56`, immediately checked the assigned steer rotation.
  **Promise:** none; this checked three.js property assignment.
  **Replacement:** none needed; `scene3d-car-attitude.test.mjs` already checks steering through `applyAttitude`.
  **Fault shown:** no new fault required for this explicitly approved deletion; existing attitude tests pass.

- **Old:** `tests/scene3d-car.test.mjs:56`, immediately checked the assigned axle-spin rotation.
  **Promise:** none; this checked three.js property assignment.
  **Replacement:** none needed; `scene3d-car-attitude.test.mjs` already checks spin through `applyAttitude`.
  **Fault shown:** no new fault required for this explicitly approved deletion; existing attitude tests pass.

- **Old:** `tests/scene3d-car.test.mjs:63`, `geometries.size === 4`.
  **Promise:** owned geometry is released without leaks or repeated disposal; the count itself is incidental.
  **Replacement:** discover a nonempty set of unique geometries, require each disposed exactly once, and verify wheel meshes share geometry that is disposed once.
  **Fault shown:** `src/views/scene3d/car.js:69`, skip the first geometry disposal or dispose geometry per mesh: both fail "every owned geometry disposed once".

- **Old:** `tests/scene3d-car.test.mjs:63`, `materials.size === 4`.
  **Promise:** owned material is released without leaks or repeated disposal; the count itself is incidental.
  **Replacement:** discover a nonempty set of unique materials (including material arrays) and require each disposed exactly once, including shared materials.
  **Fault shown:** `src/views/scene3d/car.js:70`, skip the first material disposal or dispose material per mesh: both fail "every owned material disposed once".

- **Old:** `tests/scene3d-overlays.test.mjs:7`, exact positive-bend anchor vector `[4.6000000000000005,40,12.8]`.
  **Promise:** anchor is at road height, outside the bend, 3 m beyond the road edge.
  **Replacement:** tolerance checks for height 40, centreline distance 9 m and zero tangent offset; signed normal offset must be outside the positive bend.
  **Fault shown:** `src/views/scene3d/overlays.js:4`, flip the anchor sign: fails "anchor outside bend sign 1". At line 3, default margin 3 → 2 fails "anchor distance from centreline"; at line 5, drop elevation: fails "anchor follows road height".

- **Old:** `tests/scene3d-overlays.test.mjs:8`, exact negative-bend anchor vector `[15.399999999999999,40,27.2]`.
  **Promise:** the same anchor policy holds for the opposite bend sign.
  **Replacement:** the same height, 9 m distance and tangent checks, with the outside-side check for a negative bend.
  **Fault shown:** `src/views/scene3d/overlays.js:4`, invert only the negative-bend offset: fails "anchor outside bend sign -1".

- **Old:** `tests/scene3d-overlays.test.mjs:9`, exact explicit-margin anchor vector `[4,40,12]`.
  **Promise:** the caller's margin overrides the default.
  **Replacement:** for both bend signs, margin 4 gives height 40, centreline distance 10 m, edge clearance 4 m, zero tangent offset and the outside side.
  **Fault shown:** `src/views/scene3d/overlays.js:4`, replace the supplied margin with 3: fails "anchor distance from centreline".

- **Old:** `tests/scene3d-camera.test.mjs:21`, exact `Object.keys(view(s))` order.
  **Promise:** consumers receive the required finite fields and can reconstruct a usable perspective camera; key order is incidental.
  **Replacement:** required vector/scalar fields, finite components, valid FOV/clipping range, nonzero view direction and nonparallel up; reconstruct a camera and require its target at screen centre within the clipping planes.
  **Fault shown:** `src/views/scene3d/cameras/orbit.js:61`, omit `up`: fails "view requires up"; use `[0,NaN,0]`: fails "up components finite"; use `[0,sin(pitch),cos(pitch)]`: fails "up is not parallel to view direction".

- **Old:** `tests/scene3d-car.test.mjs:69`, every discovered resource emits disposal exactly once.
  **Promise:** no owned resource leaks or duplicate disposal, including shared geometry/materials.
  **Replacement:** retain the per-resource disposal contract with separate geometry/material messages and an explicit shared-resource check.
  **Fault shown:** `src/views/scene3d/car.js:69–70`, skip first geometry/material disposal or dispose per mesh: fails "every owned geometry disposed once" / "every owned material disposed once" respectively.

All mutations used direct imports with temporary in-place source edits, restored byte for byte in `finally`.
Camera fixtures used a temporary `APEX_SRC` copy, deleted afterward. `git diff -- src` was empty after verification.

## 2.2 — simple and elevation incidental assertions

- **Old:** `tests/simple.test.mjs:17`, `BASES.length === 6`.
  **Promise:** a nonempty catalog; six presets itself is incidental.
  **Replacement:** require a nonempty catalog; retain centred identity for every declared base.
  **Fault shown:** an empty `CARS` in an `APEX_SRC` copy (`app/presets.js:3`) fails
  "the base catalog is nonempty". Adding a seventh base copied from Road car before freezing (`:12`) passes all
  13 simple tests without test edits.
- **Old:** `tests/simple.test.mjs:49`, the fixed Cartesian count `6 * 2 * 2 * 5 * 4 * 3 ** 4`.
  **Promise:** a complete validation matrix.
  **Replacement:** derive the expected size independently from `CARS` and each `SIMPLE`
  choice list or numeric ends/centre, and require every base and option value in the generated matrix.
  **Fault shown:** temporarily filtering `grid()`'s yield (`tests/simple.test.mjs:32`, restored exactly), while using
  an `APEX_SRC` copy, fails "matrix covers base=Road car" when omitting Road car, "matrix covers pt=ICE" when
  omitting ICE, and "matrix has the full Cartesian size" when omitting just the Road car/minimum-weight slice
  (which leaves every individual option covered).
- **Old:** `tests/elevation.test.mjs:497`, the generated preset warning contains `a 32% grade`.
  **Promise:** warn beyond the documented 25% limit and identify grade/radius with a useful rounded number;
  the preset's observed rounding is incidental.
  **Replacement:** authored 24.9% and 25.1% grades produce no warning and a grade warning respectively;
  a 31.6% grade reports 32%. Retain radius identification and the exact-limit check.
  **Fault shown:** in `APEX_SRC` copies, `core/track.js:56` changing 25% to 26% fails
  "25.1% grade exceeds the 25% limit"; changing it to 24% fails "24.9% grade is within the 25% limit".
  At `:60`, replacing `Math.round(100*g)` with `Math.floor(100*g)` fails "31.6% grade rounds to 32%".
- **Old:** `tests/elevation.test.mjs:539`, the Open-wheeler has `load.l0 < -15`.
  **Promise:** the floor reaches zero grip while the next level retains grip, including negative load levels;
  the preset's historical floor index is incidental.
  **Replacement:** retain the floor/next-level properties for every preset and apply them to an explicitly authored
  high-downforce car, requiring its floor below zero. Index slices as `(l - l0)` and speed levels with `Math.floor`.
  **Fault shown:** in `APEX_SRC` copies, `core/car.js:90` replacing the floor's `Math.ceil` with `Math.floor` fails
  "Road car alat: not zero at the floor n = 0"; subtracting another level from the floor fails
  "Road car: the floor is lower than it needs to be". Setting only the constructed car's floor to zero
  (`params.mass===1000 && params.cla===4`) fails "constructed downforce needs negative load levels".
  All source copies were deleted; `git diff -- src` is empty.

## 2.3 — race station goldens

- **Old:** `tests/race.test.mjs:36`, scripted steering's `station === 53`.
- **Promise:** repeatable incident location and an incident caused after the scripted lock; the literal station was a runtime detail.
- **Replacement:** `scripted steering gives exactly one incident at a repeatable station` runs the same input twice, retains DNF and exactly one incident on both runs, compares their incident stations, and requires incident time greater than the hand-authored one-second lock time.
- **Fault shown:** `src/race/judge.js:24`, increment the recorded station on every call → "identical steering repeats the incident station"; record time zero → "steering incident follows the lock at one second". Retained promises: duplicate incidents at `judge.js:25` → "steering lock produces exactly one incident"; force false DNF at `src/race/race.js:81` → "steering incident ends the race as a DNF".

- **Old:** `tests/race.test.mjs:73`, finish incident's `station === T.N-(window===3?2:3)` (both windows).
- **Promise:** a default reset reaching/passing zero scores one crossing and one callback, with the incident and penalties charged to the correct lap; the exact observed station offset was incidental.
- **Replacement:** `default reset across finish accounts once` retains windows 3 and 4 and adds after-finish cases for each. Authored steering windows arrange lap-two incidents. Assert the intended station side, that the before-finish reset reaches/crosses zero and scores at incident time, and that the after-finish reset stays inside lap two. Require completion, three timed laps, four crossings including formation, default-policy penalties (5 seconds per incident plus 5 per three excursions), penalties only on lap two, callbacks numbered exactly `[1,2,3]`, and incident summaries `[0,1,0]`. Existing lap-time bounds and total accounting remain.
- **Fault shown:** `src/race/judge.js:24`, report station zero for before cases → "incident is before the finish"; report station `T.N-1` for after cases → "incident is after the finish". `src/race/race.js:76`, delay reset crossing by one step → "reset crossing is scored at incident time"; also score nonwrapping resets → "after-finish incident stays inside lap two"; omit reset crossings → "reset crossing is scored at incident time". Existing crossing-ready defect at `race.js:42`, leave readiness true → "finish lap times exclude duplicate crossings" (the before-finish window 4 rejects it; before-finish window 3 passes this mutation, and both windows remain). Double incident penalties at `race.js:71` → "finish incident charges the configured penalties"; clear penalty baseline at `race.js:49` → "finish penalties belong only to lap two"; duplicate callback at `race.js:48` → "lap callback fires exactly once per lap". All mutations use disposable `APEX_SRC` copies, with cleanup in `finally`.


## 2.4 — camera fit: the copied function

- **Old:** `tests/camera.test.mjs:24` (original), `deepEqual([a.x, a.y, a.z], [b.x, b.y, b.z])`
  at desktop and phone sizes against the copied `fitOld` implementation.
- **Promise:** fit the whole road inside the area clear of overlays, centred and tight at the documented padding;
  historical bit identity adds no independent promise.
- **Replacement:** `fit() at 1200x800: road edges fit, centred, tight and idempotent` and its `390x760` counterpart.
  Authored centreline bounds `[10,210] × [-30,170]`, width 20 m, give road bounds `[0,220] × [-40,180]`.
  Desktop clear bounds are `[60,1140] × [40,760]`, centre `[600,400]`, tight vertically; phone clear bounds
  are `[20,370] × [150,690]`, centre `[195,420]`, tight horizontally. Expectations never call `pads()`.
  Added inverse round trips and zoom anchoring (including clamps); retained all four `frame()` tests.
- **Fault shown:** `src/views/map2d/camera.js:17`, change `(ch-padT-padB)` to `(ch-padT)` in `fit()`:
  assertion failed with "1200x800: road edges inside clear area". At `camera.js:18`, replace the bounding-box
  midpoint with `x0,y0` (keeping the overlay offset): assertion failed with
  "1200x800: track centred in clear area: 927.2727272727273,727.2727272727273 vs 600,400";
  the phone centring assertion also failed. Each mutation was applied in place for the direct import, restored
  byte-for-byte in a `finally` block, and followed by an empty `git diff -- src`.

## 2.5 — playback: copied logic

Original line numbers below refer to the test before this replacement. The seven fields checked by the old
comparison loop are recorded separately. All faults were tested in temporary `APEX_SRC` copies of `src/` with
`node --test tests/playback.test.mjs`; each failed with an assertion error, and the copies were deleted.

- **Old:** `tests/playback.test.mjs:46`, x equals `carStateOld` bit for bit.
- **Promise:** replay position follows the selected segment's coordinates.
- **Replacement:** `playback: known lap boundaries and midpoint` checks explicit boundary positions and the
  midpoint `(12, 6)`; `playback: closing segment and hold just before the finish` checks `(0, 6)` on the wrap.
- **Fault shown:** `src/playback/pose.js:34`, add 1 m to x; failed "boundary pose at t=0".

- **Old:** `tests/playback.test.mjs:46`, y equals `carStateOld` bit for bit.
- **Promise:** replay position follows the selected segment's coordinates.
- **Replacement:** `playback: known lap boundaries and midpoint` checks explicit boundary positions and the
  midpoint `(12, 6)`; the closing-segment test checks `(0, 6)`.
- **Fault shown:** `src/playback/pose.js:34`, add 1 m to y; failed "boundary pose at t=0".

- **Old:** `tests/playback.test.mjs:46`, heading equals the old map's angle bit for bit.
- **Promise:** lap heading points along the selected segment.
- **Replacement:** the known midpoint heading is `π/2`, and the closing segment's heading is `-π/2`.
- **Fault shown:** `src/playback/pose.js:34`, replace lap heading with 0; failed
  "midpoint heading follows the segment".

- **Old:** `tests/playback.test.mjs:46`, speed equals the old map's speed bit for bit.
- **Promise:** speed interpolates between the selected stations in m/s.
- **Replacement:** the known midpoint speed is 6 m/s between 8 and 4 m/s; explicit boundary speeds and the
  closing-segment speed are also checked.
- **Fault shown:** `src/playback/pose.js:35`, hold speed at the segment's starting value; failed
  "midpoint position, speed and distance".

- **Old:** `tests/playback.test.mjs:46`, `abs(ay)/G` equals the old map's unsigned lateral-g readout bit for bit.
- **Promise:** lateral acceleration has the segment's magnitude in SI units; the old assertion did not protect sign.
- **Replacement:** the known right bend gives `ay = +2 m/s²`, and the left bend gives `ay = -8 m/s²`, following
  the documented screen-frame curvature convention.
- **Fault shown:** `src/playback/pose.js:35`, negate lap `ay`; failed "right bend ay is +2 m/s²".

- **Old:** `tests/playback.test.mjs:46`, `ax/G` equals the old map's longitudinal-g readout bit for bit.
- **Promise:** longitudinal acceleration represents the speed change over distance in SI units.
- **Replacement:** braking from 8 to 4 m/s over 12 m gives `(16 - 64)/24 = -2 m/s²`, checked within `1e-9 m/s²`.
- **Fault shown:** `src/playback/pose.js:35`, divide lap `ax` by 9.81; failed
  "longitudinal acceleration is -2 m/s²".

- **Old:** `tests/playback.test.mjs:46`, station equals the old map's station bit for bit.
- **Promise:** exact station times select the segment beginning at that station, including nonuniform timing.
- **Replacement:** times `[0, 2, 5, 9]` select stations `[0, 1, 2, 3]` at fraction 0; time 3.5 selects station 1
  at fraction 0.5, and time 11.5 selects the closing segment at fraction 0.5.
- **Fault shown:** `src/playback/pose.js:24`, change the boundary comparison from `<=` to `<`; failed "station at t=2".

- **Old:** `tests/playback.test.mjs:49`, more than 2000 historical pose comparisons ran.
- **Promise:** none: this counted comparisons against copied logic rather than protecting playback behavior.
- **Replacement:** no count threshold is needed for the explicit examples; the existing dense station/pose,
  telemetry, extrema and trace-kinematics coverage remains.
- **Fault shown:** no separate fault applies to deleting an incidental comparison count; the seven field
  replacements above each have demonstrated faults.

- **Old:** `tests/playback.test.mjs:118`, random race clocks equal `raceClockOld` bit for bit.
- **Promise:** a single car restarts at its lap time; two cars share the slower lap time plus a one-second wait.
- **Replacement:** preserve the two existing explicit cases; add single-car restart, waiting at the line,
  a slower ghost determining the shared restart, and repeated-cycle examples.
- **Fault shown:** `src/playback/pose.js:10`, replace `Math.max(...lapTimes)+1` with `lapTimes[0]+1`; failed
  "slower ghost sets the shared restart".

Additional known-example evidence (same temporary-copy procedure):

| Mutation | Assertion that failed |
|---|---|
| `src/playback/pose.js:59`: use raw heading difference across the seam | "heading seam quarter is 7π/8 on the shortest arc" |
| `src/playback/pose.js:36`: hold telemetry at its starting value | "midpoint telemetry is linearly interpolated" |
| `src/playback/pose.js:31`: clamp the next station instead of wrapping | "closing segment interpolates last to first" |
| `src/playback/pose.js:24`: hold 0.01 seconds before lap end | "lap end holds within the last 0.1% of the final segment" |
| `src/playback/pose.js:37`: force gear 1 | "6 m/s selects gear 3" |
| `src/playback/pose.js:37`: force rpm 0 | "6 m/s selects 0.6 redline" |
| `src/playback/pose.js:34`: default missing snapshot height to 1 m | "legacy snapshot without height is flat" |

The finish bound is geometric: stay strictly before the finish within the last 0.1% of the 12 m closing segment
(0.012 m), with fraction in `(0.999, 1)` and distance in `(47.988, 48)` m. This allows the implementation's hold
epsilon to change. The current implementation passes; the 0.01-second hold samples fraction 0.998 and fails.
This is a sampling-policy tolerance, not a runtime budget. Synthetic trace examples also preserve endpoint clamps
and the legacy missing-height default of 0. The optional clamp mutation was skipped after its target-uniqueness
guard found two matches, before executing a mutated test; it is not counted as mutation evidence.

Validation: `node --test tests/` passed 452 tests in 30 suites, with 0 failed, cancelled, skipped or todo.
`git diff -- src` was empty; no production files or goldens were changed.

## 3.6 — describe adapter contract

Replaced only the per-preset view-parity group; the property, freeze/ownership and rpm tests remain.
All expectations below use hand-authored SI inputs in `describeCar synthetic units and table samples`
(plus the named synthetic EV/ownership cases). Each former `same` call included its helper’s length and
element assertions (`tests/describe.test.mjs:13–14`); its replacement checks shape and explicit samples.
One live ICE and one live EV adapter case check shapes and finiteness, allowing NaN outside a gear’s rpm range.

- **Old:** `tests/describe.test.mjs:22`, rounded power/weight matched renderer formula.
  **Promise:** Unrounded power/weight is W/kg (= kW/t).
  **Replacement:** Explicit 123.456 W/kg, with no rounding.
  **Fault shown:** `src/core/describe.js:21`, `p.Pmax/p.mass` → `Math.round(p.Pmax/p.mass)`; fails “power/weight W/kg (kW/t), unrounded”.

- **Old:** `tests/describe.test.mjs:23`, top speed matched car.vTop.
  **Promise:** Top speed remains in m/s.
  **Replacement:** Explicit 62.5 m/s.
  **Fault shown:** `src/core/describe.js:21`, `vTop:car.vTop` → `vTop:car.vTop*3.6`; fails “top speed m/s”.

- **Old:** `tests/describe.test.mjs:26`, lateral speed labels matched 100/200.
  **Promise:** Lateral balance labels are 100 and 200 km/h.
  **Replacement:** Explicit labels [100, 200] km/h.
  **Fault shown:** `src/core/describe.js:9`, `LAT_REF_KMH=[100,200]` → `LAT_REF_KMH=[90,200]`; fails “lateral speed labels km/h”.

- **Old:** `tests/describe.test.mjs:27`, lateral g matched renderer interpolation formula.
  **Promise:** Lateral balance interpolates acceleration and reports g.
  **Replacement:** Hand-set neighboring acceleration nodes interpolate to 2 g at 100 and 4 g at 200 km/h.
  **Fault shown:** `src/core/describe.js:18`, `tabAt(car.alat,kmh/3.6)/G` → `tabAt(car.alat,kmh/3.6)`; fails “lateral g at 100 km/h”.

- **Old:** `tests/describe.test.mjs:28`, lateral axle matched renderer rounded-index formula.
  **Promise:** Lateral axle uses the nearest speed node and front/rear flag.
  **Replacement:** Hand-set flags give [front, rear] at nearest nodes 56 and 111.
  **Fault shown:** `src/core/describe.js:18`, `car.limF[ix(kmh)]` → `car.limF[Math.floor(kmh/3.6/VSTEP)]`; fails “nearest lateral limiting axle”.

- **Old:** `tests/describe.test.mjs:31`, braking label matched 150.
  **Promise:** Braking balance label is 150 km/h.
  **Replacement:** Explicit 150 km/h label.
  **Fault shown:** `src/core/describe.js:9`, `BRAKE_REF_KMH=150` → `BRAKE_REF_KMH=140`; fails “braking speed label km/h”.

- **Old:** `tests/describe.test.mjs:32`, braking g matched renderer interpolation formula.
  **Promise:** Braking balance interpolates acceleration and reports g.
  **Replacement:** Hand-set acceleration nodes interpolate to 3 g at 150 km/h.
  **Fault shown:** `src/core/describe.js:19`, `tabAt(car.brk,BRAKE_REF_KMH/3.6)/G` → `tabAt(car.brk,BRAKE_REF_KMH/3.6)`; fails “braking g at 150 km/h”.

- **Old:** `tests/describe.test.mjs:33`, braking axle matched renderer rounded-index formula.
  **Promise:** Braking reports the first axle to lock at the nearest speed node.
  **Replacement:** Hand-set flag gives front at nearest node 83.
  **Fault shown:** `src/core/describe.js:19`, `car.brkF[ix(BRAKE_REF_KMH)]` → `car.brkF[Math.ceil(BRAKE_REF_KMH/3.6/VSTEP)]`; fails “nearest braking locking axle”.

- **Old:** `tests/describe.test.mjs:36`, drive array matched renderer mass-times-acceleration formula.
  **Promise:** Drive acceleration becomes force in N.
  **Replacement:** Explicit [2000, 4000] N from 1000 kg and [2, 4] m/s²; grid length 221.
  **Fault shown:** `src/core/describe.js:15`, `drive[i]=car.drv[i]*m` → `drive[i]=car.drv[i]`; fails “drive acceleration converted to N”.

- **Old:** `tests/describe.test.mjs:37`, traction array matched renderer mass-times-acceleration formula.
  **Promise:** Traction acceleration becomes force in N.
  **Replacement:** Explicit [3000, 5000] N from 1000 kg and [3, 5] m/s²; grid length 221.
  **Fault shown:** `src/core/describe.js:15`, `traction[i]=car.trc[i]*m` → `traction[i]=car.trc[i]`; fails “traction acceleration converted to N”.

- **Old:** `tests/describe.test.mjs:38`, resistance array matched renderer drag-plus-rolling formula.
  **Promise:** Resistance combines rolling force and quadratic drag at grid speeds.
  **Replacement:** Explicit 117.72, 240.22 and 607.72 N at 0, 10 and 20 m/s; grid length 221.
  **Fault shown:** `src/core/describe.js:15`, `0.5*RHO*p.cda*(i*VSTEP)**2` → `0.5*RHO*p.cda*(i*VSTEP)`; fails “resistance at 10 m/s N”.

- **Old:** `tests/describe.test.mjs:39`, gear line count matched renderer powertrain branch.
  **Promise:** ICE exposes per-gear force lines.
  **Replacement:** Explicit two ICE gear lines and zero EV gear lines.
  **Fault shown:** `src/core/describe.js:16`, `p.pt==='EV'?[]:car.gearF.map(gf=>Float64Array.from(gf))` → `[]`; fails “ICE gear force lines”.

- **Old:** `tests/describe.test.mjs:40`, gear force arrays matched CarModel tables.
  **Promise:** Per-gear force samples stay in N and preserve unavailable-rpm NaNs.
  **Replacement:** Explicit [NaN, 4000, 3200] N samples preserve unavailable-rpm NaN and force units; each gear grid length 221.
  **Fault shown:** `src/core/describe.js:16`, `Float64Array.from(gf)` → `Float64Array.from(gf, v=>v*2)`; fails “gear force samples N and unavailable rpm”.

- **Old:** `tests/describe.test.mjs:42`, selected gear array matched CarModel table.
  **Promise:** Selected gear samples preserve zero and numbered gears.
  **Replacement:** Explicit selected gears [0, 2]; grid length 221.
  **Fault shown:** `src/core/describe.js:17`, `Int8Array.from(car.gear)` → `new Int8Array(NT)`; fails “selected gear samples”.

- **Old:** `tests/describe.test.mjs:43`, vstep matched VSTEP.
  **Promise:** Speed grid step is in m/s.
  **Replacement:** Explicit 0.5 m/s grid step.
  **Fault shown:** `src/core/describe.js:20`, `vstep:VSTEP` → `vstep:VSTEP*3.6`; fails “speed grid step m/s”.

- **Old:** `tests/describe.test.mjs:43`, n matched NT.
  **Promise:** Speed grid count includes its final node.
  **Replacement:** Explicit 221 speed nodes.
  **Fault shown:** `src/core/describe.js:20`, `n:NT` → `n:NT-1`; fails “speed grid sample count”.

Additional teeth for EV availability, shape, rolling force and ownership:

- `src/core/describe.js:16`, `p.pt==='EV'` → `p.pt==='NO_EV'`; fails “EV has no gear force lines”.
- `src/core/describe.js:14`, `drive=new Float64Array(NT)` → `drive=new Float64Array(NT-1)`; fails “drive grid length”.
- `src/core/describe.js:15`, `+m*G*CRR` → `+0`; fails “rolling resistance at rest N”.
- `src/core/describe.js:17`, `Int8Array.from(car.gear)` → `car.gear`; fails “gear is a copy”.
- `src/core/describe.js:16`, `gf=>Float64Array.from(gf)` → `gf=>gf`; fails “gear 1 is a copy”.

All 21 mutations ran separately through an `APEX_SRC` temporary copy, each exited 1 with the named
assertion failure (no syntax/import/runtime failure); the copy was deleted. Production source was never edited.


Validation: `node --test tests/` passed 456 tests in 30 suites: 456 passed, 0 failed, cancelled, skipped or todo.
`git diff -- src` was empty; only this ledger section and `tests/describe.test.mjs` changed.


## 5.4 — accepted-line publication through the boundary

- **Old:** `tests/solver.test.mjs:263` (original), no pre-convergence snapshot differed from the accepted spline,
  tallied by comparing `Solver.pub` with private `Optimizer.spl(i, c)` in `acceptedObserver`.
- **Promise:** a published search line is one the optimiser accepted, never a rejected working trial.
- **Replacement:** `solver: publishes only lines the optimiser accepted` compares every snapshot's `line.off`
  exactly with `Optimizer.current(out)` in the emission tick, including convergence. Retain the polish-snapshot
  assertion and require a real polish rejection. The mid-polish car-change test now drives acceptance followed
  by a distinct rejection, saves the accepted line before the rejected step, and requires both `current()` and
  the next published payload to preserve it exactly and exclude the rejected trial. Independently scoring the
  trial confirms it has a finite lap score; a score-only check would not protect this promise. Existing published-
  and loaded-line car-change seed checks remain.
- **Fault shown:** `src/solver/solver.js:137`, replace `this.opt.current(new Float64Array(N))` with
  `Float64Array.from(this.opt.off)` in `publish(true)`. Both targeted tests fail with assertion messages
  "every snapshot line equals Optimizer.current() at publication" and
  "publication after rejection shows the previously accepted line". The in-place edit was restored byte for byte
  in `finally`; `git diff -- src` was empty. Additional fault: in a disposable `APEX_SRC` copy,
  `src/core/optimiser.js:71`, make `current(out)` immediately copy `off` and return; the targeted sequence fails
  "rejection preserves the previously accepted line". The copy was deleted. All failures were intended assertion
  failures, not hash, runtime, syntax or import failures.

## 4.3 — saved-file compatibility

Original line numbers refer to `tests/runfile.test.mjs` before task 4.3. The recorded-data, migration,
validation, atomicity, physical-limit, resampling, `run:true`, hash and same-build round-trip tests remain.
The same-build JSON test additionally covers pz, driver/physics identity and the authored evaluation count.
`recorded()` now uses `fixtureCase('GT racer|Harrow Ring')`, with its geometry guard, rather than golden outputs.

- **Old:** `tests/runfile.test.mjs:33`, full event-list equality with `[carInfo, track, snapshot, progress, loaded]`.
  **Promise:** clients have the new car, track and snapshot installed before load completion; no unique promise requires the full list.
  **Replacement:** the normal `property` subtest requires carInfo and track before snapshot, snapshot before loaded, and matching revisions; existing pause, station-count and no-clamp checks remain.
  **Fault shown:** `src/solver/solver.js:107`, move loaded before `publish(false)` while preserving all events; fails "snapshot before loaded".

- **Old:** `tests/runfile.test.mjs:42`, `assertRuntime(g)` gates the loaded-line checks.
  **Promise:** none independently; the runtime gate made historical expected laps comparable, rather than checking file compatibility.
  **Replacement:** no runtime gate is needed for authored fixture inputs, unconditional exact offsets and fresh current-physics scoring.
  **Fault shown:** no distinct fault applies to removing the gate; the offset and lap faults below fail their replacement contracts without a runtime failure.

- **Old:** `tests/runfile.test.mjs:43`, loaded lap equals the historical golden lap.
  **Promise:** the solver correctly scores the input line; the historical value is not a compatibility promise.
  **Replacement:** `current physics` compares the loaded lap with fresh-scratch `lapEval` of the fixture's exact line under current physics, built independently of solver state.
  **Fault shown:** `src/solver/solver.js:152`, publish `lap:t+1` instead of `lap:t`; fails "loaded lap equals fresh current-physics evaluation".

- **Old:** `tests/runfile.test.mjs:46`, zero differing published/retained offsets, inside the runtime-gated golden subtest.
  **Promise:** unchanged station count and feasible offsets are published and retained exactly.
  **Replacement:** unconditional `exact offsets` subtest compares snapshot offsets and retained `s.pub` exactly with fixture inputs; no-clamp and station-count checks remain.
  **Fault shown:** `src/solver/solver.js:105`, add 0.125 m to offset 0 before copying the loaded line; fails "published offsets[0]: -4.919328310263691 !== -5.044328310263691".

- **Old:** `tests/runfile.test.mjs:94`, exact format-error prose.
  **Promise:** invalid format is refused with an actionable field name.
  **Replacement:** keep the invalid input and require `/format:/` in its thrown error, without pinning explanatory prose.
  **Fault shown:** `src/app/runfile.js:57`, replace the format error's field with unknown; fails "The input did not match the regular expression /format:/".

- **Old:** `tests/runfile.test.mjs:95`, exact unsupported-version prose and supported-version list.
  **Promise:** unsupported versions are refused with the version field identified.
  **Replacement:** keep version 3 input and require `/version:/` in its thrown error.
  **Fault shown:** `src/app/runfile.js:58`, replace the version error's field with unknown; fails "The input did not match the regular expression /version:/".

- **Old:** `tests/runfile.test.mjs:96`, malformed-control-point error includes exact expected-shape prose.
  **Promise:** malformed control points are refused and the offending point is identified.
  **Replacement:** keep the short point and require `/track\.ctrl\[2\]:/`.
  **Fault shown:** `src/app/runfile.js:77`, replace the indexed control-point error field with unknown; fails "The input did not match the regular expression /track\.ctrl\[2\]:/".

- **Old:** `tests/runfile.test.mjs:97`, missing-pz error includes exact expected-array prose.
  **Promise:** missing v2 snapshot heights are refused with the pz field identified.
  **Replacement:** keep the missing pz input and require `/snapshot\.pz:/`.
  **Fault shown:** `src/app/runfile.js:88`, label the pz array validation unknown; fails "The input did not match the regular expression /snapshot\.pz:/".

- **Old:** `tests/runfile.test.mjs:98`, missing-car-fields error equals the prose pattern `car: missing fields mu, sens`.
  **Promise:** every missing car field is named, including when more than one is absent.
  **Replacement:** delete both mu and sens; require `car:` and each whole field name independently in the diagnosis before the parenthetical valid-field inventory. Neither name may be satisfied by that inventory; field order and explanatory prose are not frozen.
  **Fault shown:** `src/app/runfile.js:71`, omit names by replacing `missing.join(', ')` with question marks; fails "missing car field names mu". Report only mu via `missing.slice(0, 1).join(', ')`; fails "missing car field names sens". Report only sens via `missing.slice(1).join(', ')`; fails "missing car field names mu". The initial broad regex incorrectly accepted names from the inventory; task work stopped, and this corrected replacement was verified after the user's follow-up.

- **Old:** `tests/runfile.test.mjs:99`, unknown-car-field error includes exact unknown-field prose.
  **Promise:** unknown car fields are refused and named.
  **Replacement:** keep turbo input and require `/car:.*turbo/`.
  **Fault shown:** `src/app/runfile.js:71`, omit unknown-field names by substituting question marks; fails "The input did not match the regular expression /car:.*turbo/".

- **Old:** `tests/runfile.test.mjs:100`, short-offset-array error includes exact expected/actual-count prose.
  **Promise:** an offset array with the wrong length is refused with the field identified.
  **Replacement:** keep the shortened array and require `/line\.off:/`.
  **Fault shown:** `src/app/runfile.js:83`, label offset validation unknown; fails "The input did not match the regular expression /line\.off:/".

- **Old:** `tests/runfile.test.mjs:101`, short-timing-array error includes exact expected/actual-count prose.
  **Promise:** a timing array with the wrong length is refused with the field identified.
  **Replacement:** keep the shortened tc array and require `/snapshot\.tc:/`.
  **Fault shown:** `src/app/runfile.js:87`, label tc validation unknown; fails "The input did not match the regular expression /snapshot\.tc:/".

- **Old:** `tests/runfile.test.mjs:102`, invalid-force-sample error includes exact finite-number/null prose.
  **Promise:** nonnumeric telemetry is refused and its field and sample index are identified.
  **Replacement:** keep the null force sample and require `/phys\.fxf\[3\]:/`.
  **Fault shown:** `src/app/runfile.js:90`, label physics arrays unknown; fails "The input did not match the regular expression /phys\.fxf\[3\]:/".

- **Old:** `tests/runfile.test.mjs:103`, too-few-control-points error includes exact minimum-count prose.
  **Promise:** unusably short control-point arrays are refused with the field identified.
  **Replacement:** keep three control points and require `/track\.ctrl:/`.
  **Fault shown:** `src/app/runfile.js:75`, replace the control-point-array error field with unknown; fails "The input did not match the regular expression /track\.ctrl:/".

- **Old:** `tests/runfile.test.mjs:104`, negative-width error includes exact positive-value prose.
  **Promise:** negative width is refused with the field identified.
  **Replacement:** keep width -1 and require `/track\.width:/`.
  **Fault shown:** `src/app/runfile.js:74`, replace the width error field with unknown; fails "The input did not match the regular expression /track\.width:/".

- **Old:** `tests/runfile.test.mjs:106`, nonfinite-export error includes exact `is NaN` prose.
  **Promise:** exporting a nonfinite offset is refused and identifies its field and index.
  **Replacement:** keep NaN at offset 0 and require `/export: line\.off\[0\]/`.
  **Fault shown:** `src/app/runfile.js:31`, label exported array samples unknown; fails "The input did not match the regular expression /export: line\.off\[0\]/".

- **Old:** `tests/runfile.test.mjs:182`, current v1-line lap differs from the historical lap by less than 0.5 seconds.
  **Promise:** loading correctly re-scores usable saved input; closeness to historical physics is not required.
  **Replacement:** `cross-version: loading re-scores the exact v1 line under current physics` retains exact offsets, station count and no clamp; compares with fresh-scratch `lapEval`. A second input deliberately records lap 1234.5 and different physics identity; reading preserves these and loading recomputes the current lap.
  **Fault shown:** `src/solver/solver.js:152`, publish `lap:t+1`; fails "v1 loaded lap equals fresh current-physics evaluation".

- **Old:** `tests/runfile.test.mjs:185`, `assertRuntime(loadGolden())` gates cross-version equality and offsets.
  **Promise:** none independently; saved-file compatibility is not tied to the fixture's runtime.
  **Replacement:** no gate needed; exact v1 offsets are checked normally, recorded data is compared directly with immutable file inputs, and loaded laps are freshly evaluated.
  **Fault shown:** no distinct fault applies to gate removal; the offset and lap mutations fail the unconditional contracts with assertion failures.

- **Old:** `tests/runfile.test.mjs:186`, re-evaluated v1 line equals its historical lap exactly.
  **Promise:** parsing preserves the historical record and loading scores the input correctly; equality between different physics builds is not promised.
  **Replacement:** `cross-version: reading preserves the v1 record and ghost samples` checks recorded lap, snapshot arrays, offsets and metadata directly against file inputs; ghost samples replay stored stations. The loading test compares with fresh current-physics evaluation, including the deliberately different record.
  **Fault shown:** `src/solver/solver.js:152`, publish `lap:t+1`; fails "v1 loaded lap equals fresh current-physics evaluation". Stored data and ghost checks remain separate from the solver result.

Teeth ran as targeted tests so the deliberately mutated solver did not fail hash freshness first. Solver faults were
applied in place, copied to disposable `APEX_SRC` trees for `loadCore`, and restored byte for byte; every copy was
deleted in `finally`. Run-file reader/exporter faults used in-place edits for their direct imports, restored byte
for byte in `finally`. Each of the 18 mutations failed with its intended assertion, not an import, syntax, hash or
runtime error. `git diff -- src` was empty after every mutation.
Additional migration evidence: `src/app/runfile.js:88`, omit synthesized v1 pz samples (empty array instead of N zeros)
→ "v1 pz has one zero per station". Existing z = 0, pz = 0 and nz = 1 checks remain.

Validation: `node --test tests/` passed 540 tests in 30 suites: 540 passed, 0 failed, cancelled, skipped or todo.
The focused run-file test passed 19 tests. `git diff --check` passed; `git diff -- src` was empty.
Only `tests/runfile.test.mjs` and this ledger section changed; no production files, goldens or hashes changed.

## 5.3 — fixed-line and dynamic-check contracts

Original line numbers refer to the files before task 5.3. All original fixed-line property assertions
(length, every offset bound, faster than centreline, fraction [0.85, 1], utilisation ≤ 1.15, clean final lap)
remain over every one of the 30 immutable 4.1 cases. Skidpad `property` and solver revision/fraction/pause
checks remain. Only the dynamic-check subtest in `solver.test.mjs` changed.

- **Old:** `tests/golden.test.mjs:17–26`, runtime-gated exact centreline laps for all cars × circuits.
  **Promise:** preset centreline laps remain finite, positive and usable; historical bits are incidental.
  **Replacement:** `centreline laps: all preset cars × circuits` exercises the live flat/hilly preset matrix,
  requiring finite geometry/speeds and a positive lap below the dynamic model's 900 s integration horizon.
  Each immutable fixed-line case also checks its centreline under that ceiling.
  **Fault shown:** `src/core/lap.js:154`, start the lap sum at 1000 instead of 0; fails
  “Road car, Harrow Ring, hills 0: positive centreline lap within the dynamic lap horizon”.

- **Old:** `tests/golden.test.mjs:50–54`, runtime-gated exact lap and full dynamic summary for each of 30 cases.
  **Promise:** model/driver sanity across cars and circuits, including clean completion; exact historical
  continuous errors, times and quantised endpoints are not requirements.
  **Replacement:** `fixed line: <case>` retains every original property bound and requires termination within
  eight probes, tracking error within the usable road span plus 0.5 m, edge overshoot ≤ 0.5 m, nominal sideslip
  deviation ≤ 0.1 rad, positive completion within 900 s, and finite lap/geometry/speed/utilisation/nominal/trace
  outputs. Solver snapshots must expose warning counts consistent with the lap's speed floor and pass load
  factors, calculated from the documented floor and load equation without calling the production load helper.
  **Fault shown:** `src/dynamics/check.js:24`, finish the first probe at fraction 1 before seeking a clean run;
  fails “final lap at frac 1 not clean”. `src/drivers/reference.js:3`, scale all four steering feedback gains
  by 0.3; fails “dynamic check fraction 0.828125 outside [0.85, 1]”. `src/solver/solver.js:152`, publish
  `stall:S.stall+1`; fails “snapshot warnings describe the lap floor and pass load clamps”.

- **Old:** `tests/solver.test.mjs:92–97`, dynamic-check runtime gate and exact `dynResultSummary` equality.
  **Promise:** the protocol delivers a coherent passing result and, if present, a genuinely failing bracket.
  **Replacement:** `clean bracket` requires integer iterations in [1, 8], a clean recorded final run,
  clean replay at the reported fraction with matching recorded time and station speeds, and a failing bracket
  above that fraction whose replay fails completion/no-spin/no-trouble and matches recorded spin/first-trouble
  metadata. These are same-run consistency checks; no historical expected outputs are used.
  **Fault shown:** premature completion at `src/dynamics/check.js:24` fails
  “reported fraction has a clean recorded final run”. At `src/dynamics/check.js:34`, report `iters:this.iter+8`
  → “dynamic check finishes within eight probes”; report `frac:this.lo-0.01`
  → “recorded final run is at the reported fraction”; change the failing fraction to `this.lo+0.000001`
  → “recorded failing bracket fails the clean-run criterion”.

- **Old:** `tests/skidpad.test.mjs:19–23`, runtime-gated exact completion time/error summary at 90/95/98% v².
  **Promise:** the reference driver cleanly tracks the circle with mean absolute error ≤ 0.2 m (§8.4).
  **Replacement:** retain `property` unchanged; `clean tracking` also requires finite outputs and positive
  completion within the 900 s dynamic horizon, with clean status and the existing 0.2 m mean-error limit.
  **Fault shown:** `src/drivers/reference.js:3`, gains 15/2.5/0.3/0.01 → 4.5/0.75/0.09/0.003; at 98% v²,
  fails “skidpad tracks cleanly within 0.2 m mean error” (also fails the retained clean-lap property).

Budget rationale and observations (Node v26.12.1 / V8 14.6.202.34-node.40): eight probes come from two
endpoint checks plus ceil(log2(0.20/0.004)) = six bisections, not measured effort. Road tracking allowance
is width − (car track + 0.25 m) + 0.5 m: two positions within the usable road span, allowing the documented
edge tolerance. Edge/sideslip thresholds come from ARCHITECTURE §6; pace/utilisation bounds are the unchanged
§8.5/8.6 policies. The 900 s ceiling is the existing `dynLap` horizon, expressing supported-circuit usability,
not padded observed laps. Observed fixture laps were 31.1772–109.5676 s, centrelines 36.1669–122.9899 s,
fractions 0.9125–1 and utilisation 1.039–1.117; skidpad mean errors were 0.0590/0.0675/0.0766 m.
The mutations above demonstrate out-of-budget iterations, lap duration, reduced pace and unclean tracking.
No runtime gate is needed: fixture inputs and documented policy supply the expectations. Removing the gates
has no separate fault; the replacements catch these faults without runtime errors.

Standalone file timings on this runtime: old `golden.test.mjs` 4636.736125 ms; new `fixed-line.test.mjs`
6188.114375 ms (about 33.5% longer, including live preset centrelines and snapshot warning/finite checks).
Every mutation used a disposable `APEX_SRC` copy, removed in `finally`; production source was never edited.
All reported failures were intended assertions, not syntax/import/runtime/hash failures.

Validation: `node --test tests/` passed 510 tests in 0 suites: 510 passed, 0 failed, cancelled, skipped or todo
(32353.947292 ms). Focused solver validation passed all 22 tests. `git diff --check` passed and
`git diff -- src` was empty. Only the five authorized task paths changed; no commits were made.

## 5.2 — Search contracts

- **Old:** `tests/convergence.test.mjs:39–43`, runtime gate and exact `{centreLap, lap, evals, steps}` equality.
  **Promise:** useful search quality, correct reported time and bounded completion; exact historical values and runtime identity are incidental.
  **Replacement:** flat and 25 m hilly direct searches require convergence, at most 160,000 objective evaluations (`opt.evals`) and 160,000 `step()` calls, and a 120 s watchdog checked between steps (180 s outer timeout). Both baseline and feasible fixture reference are freshly scored with separate scratch; their improvement must exceed 1 s. Fresh final lap is positive and agrees with reported lap within 1e-9 s; gain must be >= 0.9987 with no upper bound. Exact endpoint, counts and visited stage count are diagnostics.
  **Fault shown:** disposable `APEX_SRC` copies: `src/core/optimiser.js:21`, mark done immediately after setup (zero steps), fails "search gain >= 0.9987"; `:68`, add 1 s to `exactLap()`, fails "reported lap matches fresh rescore within 1e-9 s". A feasible gradient nudge after final clamp at `:87` lowers the fresh flat lap from 78.37714547025213 s to 78.37710768402341 s and passes all contracts.

- **Old:** `tests/convergence.test.mjs:44–46`, every converged offset equals the historical fixture.
  **Promise:** a feasible final line; historical coordinate identity is incidental.
  **Replacement:** require every returned offset inside its station's `[B.lo, B.hi]`, finite fresh speeds/geometry and warning telemetry, and the fresh-score/quality contracts above. Existing polish, working-line bounds and faster-than-centreline properties remain.
  **Fault shown:** `src/core/optimiser.js:87`, after final clamp set `off[0] = B.hi[0] + 0.01`, fails "returned line inside bounds" (and the retained working-line bounds property). The feasible better endpoint described above passes.

- **Old:** `tests/solver.test.mjs:67–70`, runtime gate and exact protocol `{centreLap, lap, evals}` equality.
  **Promise:** the real protocol completes a materially good search with a correct reported time and bounded work; historical effort/time identity is incidental.
  **Replacement:** the protocol convergence search uses the same 0.9987 minimum gain, > 1 s reference improvement, positive fresh lap with 1e-9 s reporting tolerance, 160,000 evaluation/call ceilings and 120 s watchdog (180 s outer timeout). Count every call, including false returns and stage transitions, in the existing shared convergence run; check budgets between steps/ticks. Preserve all existing protocol properties. Counts, visited stage count and endpoint are diagnostics.
  **Fault shown:** `src/core/optimiser.js:21`, setup then done without steps, fails "search gain >= 0.9987" through the protocol. `src/solver/solver.js:152`, add 1 s to the converged snapshot's lap, fails "reported lap matches fresh rescore within 1e-9 s". The same feasible improved endpoint at optimiser `:87` passes the protocol contracts.

- **Old:** `tests/solver.test.mjs:71–73`, every published offset equals the historical fixture.
  **Promise:** the published final line is feasible and useful; historical coordinate identity is incidental.
  **Replacement:** every final snapshot offset is in bounds; snapshot speeds, geometry, cumulative times, force/load telemetry, extrema and warnings are finite. Freshly score that snapshot line for positive lap, reporting agreement and minimum gain; retain existing revision, publication and copy properties.
  **Fault shown:** `src/core/optimiser.js:87`, push final `off[0]` 0.01 m beyond `B.hi[0]`, fails protocol "returned line inside bounds". The feasible improved endpoint passes with fresh lap 78.37710768402341 s.

Budget evidence and rationale (Q approval in `docs/investigations/search-budgets.md`): measured Node v26.12.1 / V8 14.6.202.34-node.40 on Apple M3. Healthy flat direct/protocol: 78,063 objective evaluations, 76,851 calls, direct 8.141–8.253 s, protocol 8.009–14.288 s; hilly pilot: 72,001 evaluations, 70,298 calls, 21.176 s. The 160,000 ceilings allow roughly twice healthy flat work; evaluations exclude snapshot/reference/final scoring. The 120 s watchdog is a hang guard with contention headroom, not a speed target; an in-process timer cannot interrupt an infinite synchronous step. The approved investigation demonstrated redundant objective evaluations (229,363) failing "search evaluations <= 160000", idle calls (230,553) failing "search steps <= 160000", and a stalled final step (129.193 s) failing "search wall time <= 120 s". Quality calibration: healthy gain 1; halved stall threshold gain 0.997436713621 fails "search gain >= 0.9987". The approved 0.9987 threshold permits about 9.6 ms loss on the measured flat case; better results pass. Hilly quality uses its own reference, with no claim of independent hilly fault calibration.

Task validation timings: focused direct flat 8.527 s, direct hilly 17.818 s (17.619 s timed search), protocol search 8.619 s; 28 focused tests pass. The added hilly run therefore costs 17.818 s in this focused run. All task mutations use deleted disposable source copies; `git diff -- src` is empty.
Full suite: `node --test tests/` — 513 tests, 0 suites; 513 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo; 39,301.265625 ms. Under full-suite/mutation contention the added hilly run took 22.805 s (22.397 s timed search). `git diff --check` passes. Protocol convergence helper instrumentation is necessary to count and bound the existing shared run; the dynamic-check subtest and all other test bodies are unchanged.
