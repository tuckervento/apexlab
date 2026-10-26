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

_(pending)_

## 2.4 — camera fit: the copied function

_(pending)_

## 2.5 — playback: copied logic

_(pending)_
