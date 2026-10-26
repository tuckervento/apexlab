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

_(pending)_
