# Test contracts: review and replacement plan

Status: proposed; this document changes no tests or testing requirements. Reviewed 2026-10-25.

The suite has a strong contract-testing foundation. Its main weakness is a second layer that makes historical
implementation behavior a permanent requirement: exact optimizer paths, old implementations copied into tests,
and some rendering construction details. Remove that layer selectively, after replacing the unique coverage it
currently provides. Keep independent physical checks, protocol and ownership boundaries, deterministic replay,
and saved-data preservation.

The target is a failure that explains a broken promise: an invalid line, a materially worse search, incorrect SI
conversion, corrupted saved data, a stale result displayed, a leak, or an inaccessible control. A different valid
optimizer endpoint or mesh triangulation should be free to pass.

## Scope and evidence

Reviewed the 39 `tests/*.test.mjs` files, their fixtures/generators, the 24 browser scenarios, and the CDP and
screenshot helpers. Architectural context comes from [ARCHITECTURE.md](../ARCHITECTURE.md),
[deferred.md](deferred.md), and the [golden-lap investigation](investigations/golden-lap.md).

Validation performed before writing this plan:

- `node --test tests/`: **427 passed, 0 failed**, approximately 39.7 seconds, Node v26.12.1. This matches the
  committed golden runtime, V8 `14.6.202.34-node.40`.
- `node tests/check-race-mutations.mjs`: **all 12 mutations rejected** by their targeted race tests.
- Browser scenarios were inspected, not executed. Findings about their enforcement follow from their source and
  the runner's exit conditions; this review does not establish their current browser pass/fail status.

The golden file contains 30 car/circuit combinations and 19,902 line offsets. It combines reusable input lines,
historical outputs, and optimizer effort. These are different responsibilities. Deleting the file before separating
them would break useful run-file, elevation, and dynamics coverage.

Timings from the concurrent Node run identify expensive areas, not additive savings: direct convergence reported
21.8 seconds, protocol convergence 14.1 seconds, and each of the four parity cases that also runs both optimizers
and dynamic checks roughly 7.1–7.6 seconds. These overlap. Other relatively expensive tests, including interpolation
accuracy and simple-control behavior, protect meaningful contracts; duration alone is no reason to delete them.

## Rules for deciding what survives

1. **Preserve exact data when exact data is the promise.** JSON round trips, unchanged loaded offsets when no
   resampling/clamping is required, detached ownership, identity hashes, and replaying recorded actions within the
   same runtime deserve exact assertions.
2. **Use independent expectations for mathematical behavior.** Closed forms, force/energy relationships, known
   geometric examples, and finite differences are preferable to the old program's answers. A correct gradient can
   differentiate an incorrect model; keep both derivative and physical checks.
3. **Use explicit quality budgets for approximate algorithms.** Search quality, numerical approximation, and
   animation consistency need justified bounds. Neither bit identity nor a loose `isFinite` check is sufficient.
4. **Allow equivalent representations.** Require rendered coverage, orientation, placement, bounded resource use,
   and disposal. Avoid freezing vertex ordering or object counts unless a consumer or explicit budget needs them.
5. **Give migration checks an end condition.** Historical equivalence is valuable during extraction. Once lasting
   contracts have direct coverage, remove the duplicate old implementation.

Some constants are requirements, not accidental snapshots. Centered knobs reproducing the base car, the race judge's
incident thresholds, coordinate handedness, and reduced motion disabling effects should remain pinned. Camera FOV,
lead distance, roll scale, and board spacing should stay tested when they express the documented design. Changing
those requirements can legitimately change a small focused test.

Current repository instructions explicitly require unchanged goldens for mechanical physics refactors and reviewed
regeneration after intentional physics/runtime changes. This plan proposes changing how that evidence is collected,
not silently waiving it. Implement the workflow and update the applicable guidance together; until then the existing
requirements apply.

## 1. Separate numerical regression evidence from correctness

### Current assertions to remove from the ordinary contract gate

| Location | Remove or relocate | Retain |
| --- | --- | --- |
| [convergence.test.mjs](../tests/convergence.test.mjs), `golden` subtest | Exact lap, evaluation/step counts, and every converged offset | Termination, finite independently scored result, final feasibility, useful improvement |
| [solver.test.mjs](../tests/solver.test.mjs), convergence `golden` subtest | Repeating the same historical endpoint and effort through the protocol | Correct protocol completion, revisions, copies, accepted-line publication, progress |
| `solver.test.mjs`, dynamic-check `golden` subtest | Historical `dynResultSummary` equality | Result delivery, revisions, paused state, coherent passing/failing results |
| [golden.test.mjs](../tests/golden.test.mjs) | Runtime-specific centreline and full dynamic-summary equality | Cross-preset model/driver sanity coverage, moved to a clearly named contract file |
| [skidpad.test.mjs](../tests/skidpad.test.mjs), `golden` subtests | Exact completion time and error summary for each pace | Clean tracking and the existing 0.2 m mean-error requirement |

These assertions detect changes, including small unintended ones. They do not independently establish correctness.
The architecture even records changes to rolling resistance and driver gains that fail goldens while every broad
sanity assertion passes. Do not simply delete the goldens and declare the remaining bounds adequate.

### Replacement contracts

**Search quality and termination.** Keep a direct optimizer test and one protocol integration run; they exercise
different boundaries. Replace historical equality with:

- A finite evaluation/step budget and a generous wall-clock watchdog. The current five-million-step ceiling is an
  emergency guard, not a useful efficiency requirement. Measure supported runtimes, record the chosen budgets, and
  allow headroom; exact historical counts become diagnostics.
- Final offsets inside bounds, all speeds and relevant telemetry finite, and a positive lap. Independently call
  `lapEval` with fresh scratch on the returned line and compare it to the reported time within numerical tolerance.
  Calling `opt.exactLap()` alone shares the wrapper under test and is weaker evidence.
- A one-sided quality bound: the result must achieve a documented fraction of the available improvement from a
  centreline baseline to a fixed feasible reference line, both rescored under the current model. For example define
  `gain = (centreLap - resultLap) / (centreLap - referenceLap)` and require `gain >= chosenMinimum`. Assert that the
  denominator is meaningfully positive. Calibrate the minimum before deletion; this document does not invent an
  unmeasured percentage. An absolute maximum lap for a fixed model can supplement this where justified.
- Better valid results pass. Do not demand identical offsets, exact stage count, or a monotone lap across changes
  of smoothing/objective or a fresh search. Apply feasibility to the final published line; intermediate search
  candidates use soft penalties and need not all satisfy the final hard bounds.

Use GT/Harrow as the first convergence case and a small hilly/EV or other distinct case if measurement shows it
exercises a missing algorithmic path. Keep the full preset matrix for fixed-line evaluation and dynamic sanity,
rather than reconverging every combination on every contract run.

**Accepted-line publication.** Keep the regression for rejected polish candidates and car changes seeded from the
published/loaded line. The current `acceptedObserver` reaches into `spl(i, c)`. Prefer comparing the protocol payload
against the optimizer's `current(out)` boundary, plus a targeted accepted/rejected sequence that distinguishes a
working trial buffer from the accepted line. Retain a real run that actually reaches rejection/polish. A fixture
with no rejection cannot replace this coverage. Re-scoring alone is insufficient: a rejected trial has a valid score.

**Model and driver behavior.** Preserve the 30 fixed-line cases, the skidpad, and the separate hilly stress cases.
Keep clean completion, bounds on tracking error/utilization/pace fraction, warning consistency, and finite outputs.
Strengthen the dynamic-check contract with a bounded iteration count, a final passing run at the reported fraction,
and, when a failing bracket exists, evidence that its recorded run fails the documented clean-run criterion. Do
not assume the binary search proves global monotonicity of driver success.

Add focused flat-model tests for quantities otherwise guarded mainly by exact goldens: drag proportional to speed
squared, rolling loss under the documented current law, EV torque/power regimes, and an analytic constant-radius
lateral limit with deliberately simplified tyres/aero. Use explicit car parameters. The hilly closed forms are
already strong; use the same approach for flat behavior. Driver gain changes can be intentional, so detect harmful
tracking or transient behavior rather than require an unchanged error maximum to its final bit.

### Fixture and tooling changes

1. Extract fixed-line **inputs** from `golden.json` into dedicated fixtures: explicit control points, width, car
   parameters, offsets, and enough station/generator metadata to detect an incompatible sampling change. Saving
   inputs avoids silently changing every case when a preset seed or preset car is edited. Keep separate tests that
   exercise the live presets as presets.
2. Switch run-file helpers and hilly dynamics cases to those fixtures. Keep diagnostic historical metrics separate
   from asserted contract bounds. A changed station count must be handled explicitly through the resampling
   contract or a reviewed fixture revision, rather than pretending old offsets index the new geometry.
3. Keep one opt-in numerical comparison tool outside automatic `*.test.mjs` discovery. Initially it can use the
   existing baseline/generator. A mechanical refactor must still compare against the unchanged baseline on the
   pinned runtime; intended physics changes must show a reviewed before/after report with meaningful deltas.
   Include a compact converged case as well as fixed-line results so this evidence still checks optimizer behavior.
4. Version inputs independently from expected outputs. Ordinary contracts must work on supported runtimes without
   an `assertRuntime` dependency. Exact historical comparison should report an unsupported runtime once, with a
   clear non-success result, instead of cascading failures or silently passing.
5. Retire redundant historical assertions from each integration layer. Once dependencies are moved, either replace
   `golden.test.mjs` with the fixed-line contract file or delete it. Keep `make-golden.mjs` only while the numerical
   comparison workflow consumes it; remove unused summary/hash helpers after checking their callers.

Expected fault checks before removing the old gate: bypass optimization, return an infeasible line, corrupt a
reported time, publish a rejected candidate, stop the dynamic check before finding a clean run, ignore drag, and
change a unit conversion. Each should fail a named contract rather than only the historical baseline.

### Test the consuming boundary as well as revision labels

The solver's revision test defines a local `current(r, snap)` predicate. That verifies the emitted tags can express
staleness; it does not execute the client's decision to accept or hide a result. Keep the producer checks, but add
focused fake-worker cases in `client.test.mjs` for the actual consuming contract:

- Deliver an older car or track snapshot after a newer displayed one and require the display to remain unchanged.
- Deliver a track event before its matching snapshot and require track and line to swap together, including a
  changed station count. A mixed old-line/new-track state must never become the displayed state.
- Deliver a dynamic result whose car, track, or line revision differs, one dimension at a time; require
  `S.dynStale` and the rendering hook to reflect that. An unchanged-line view update must keep a current result
  current. A genuine new line must make it stale.
- Exercise `settled()` while commands/loads are pending and after their matching snapshot has installed. Export
  and pin readiness must depend on matching accepted state rather than elapsed time.

Once these exist, the test-local staleness predicate needs no separate behavioral claims. Deliberately remove the
client's old-snapshot guard or ignore one revision dimension and verify that the new client cases fail. These are
small missing boundary tests, not a reason to replace the real protocol integration run with mocks.

## 2. Retire extraction-era equivalence tests

### Prototype parity: delete after filling the gaps

[parity.test.mjs](../tests/parity.test.mjs) compares generated tracks, car tables, lap values, gradients, intermediate
optimizer state, and dynamics to the frozen HTML. Its own comment says it is temporary. It also supplies seeded
parameter perturbations outside the preset grid, which would otherwise be lost.

Before removing it:

- Add `track.test.mjs` with a synthetic circle and hand-authored closed track: length/curvature within a justified
  discretization error, unit normals perpendicular to local tangents, orientation, finite periodic geometry, and
  line bounds that respect car width and the inside fold limit. Add translation/rotation invariance with numerical
  tolerances. Transform explicit control points, not a freshly regenerated track. Cover tight/overlapping and
  zero-length rejection cases using the documented boundary responsible for each.
- Add `units.test.mjs` with hand-computed SI conversions: km/h to m/s, kW to W, percentages to fractions, degrees to
  radians, unchanged SI inputs, frozen snapshot ownership, missing/nonfinite/invalid values, and valid unusual
  parameters. The existing run-file tests check missing fields and physical ranges, but do not directly enumerate
  the conversion contract.
- Carry the existing four seeded car perturbations and track seeds into finite-output/feasibility checks and a
  small additional finite-difference matrix. Do not preserve the old output arrays. Keep the current gradient
  branch-coverage assertions and hilly clamp cases.
- Establish the flat-model checks and search-quality coverage in section 1. Preserve a fixed-input repeat-run
  determinism check within one runtime; sameness between two current runs is a different promise from sameness
  with the prototype forever.

Then delete `parity.test.mjs` and its sole-purpose loader [load-prototype.mjs](../tests/load-prototype.mjs). Keep
`prototype/apex-lab.html` frozen as the repository requires. The deleted historical tests need no permanent second
implementation; history and the numerical comparison workflow provide migration evidence.

### 2D fit: remove the copied function

In [camera.test.mjs](../tests/camera.test.mjs), remove `fitOld` and the test named “matches the pre-frame() version”.
Keep all `frame()` tests. Add direct `fit()` checks on a simple rectangular track at desktop and narrow dimensions:
road edges fit the unobscured area, the track is centered in that area, one axis is tight at the intended padding,
and fit is idempotent. Test world/screen inverse round trips and zoom anchoring if no other test covers them.
Expected screen-space properties must come from the hand-authored track and documented padding policy, rather
than calling the same production padding helper to derive every expected value.

### Playback: replace copied map logic with known examples

In [playback.test.mjs](../tests/playback.test.mjs), remove `carStateOld`, `raceClockOld`, and their historical-equality
assertions. Keep the existing explicit race-clock cases and all trace kinematics, station/pose consistency, telemetry,
and extrema coverage.

Add a small hand-authored snapshot with nonuniform segment times and known coordinates/speeds. Check station
selection at exact boundaries, midpoint position/speed/telemetry, signed lateral acceleration, longitudinal units,
the closing segment, and optional gear/rpm. Add a synthetic trace crossing the heading seam so shortest-arc
interpolation has an independent expected answer. Keep trace endpoint clamps and legacy missing-height defaults.
For lap-end sampling, retain the documented “hold just before the finish” behavior; test bounded final-segment
sampling rather than freezing the particular `1e-6` implementation epsilon. No production behavior change is
required for these replacements.

### Car description: rewrite selected assertions, keep the adapter contract

[describe.test.mjs](../tests/describe.test.mjs) calls its first group “view parity”, but much of it is a real unit and
adapter contract: acceleration to force in N, speed labels, axle selection, selected gear/rpm, and copied arrays.
Do not delete that entire group on the strength of its migration-era name.

Replace the verbatim old-renderer formulas with a small synthetic car/table fixture with known values. Assert
unrounded power/weight units, acceleration-to-force conversion, resistance at known speeds, selected table samples,
EV/ICE gear availability, shapes, and ownership. Preserve all current immutability checks. One live preset per
powertrain is enough for adapter integration; preset validity remains covered elsewhere. Do not require the old
renderer to remain the oracle for display policy forever.

## 3. Separate saved-file compatibility from physics equivalence

The [runfile.test.mjs](../tests/runfile.test.mjs) cross-version case currently requires a v1 line re-evaluated by the
current model to equal its historical lap exactly, and its “property” subtest also requires a delta below 0.5 seconds.
Both can reject a legitimate physics improvement. The historical file remains compatible even when current physics
scores the same input differently.

Replace those assertions with three distinct contracts:

- **Recorded data survives.** Parse the immutable v1 fixture and preserve recorded lap, snapshot, offsets, and
  identity metadata exactly. Preserve v1-to-v2 defaults (`z = 0`, `pz = 0`, `nz = 1`). A ghost replays the stored
  samples, not a reconstruction by current physics.
- **Loading preserves usable input.** For unchanged station count and feasible offsets, publish the recorded line
  exactly, with no unexpected clamp, correct revisions, and coherent completion events. Compare the new lap with a
  fresh evaluation of that line using current physics. Do not assert closeness to the old lap as compatibility.
- **Same-build export/import is lossless.** Keep the existing exact JSON and same-build lap round trips, including
  hilly heights and driver metadata. These compare current output with its own serialized representation, not with
  a historical model's result.

In the first “recorded line comes back bit for bit” test, remove the runtime-gated historical lap equality but retain
exact offsets in a normal contract subtest. Change `recorded()` to use an input fixture, not a lookup in golden
expected outputs. Its nontrivial double values are useful; its arbitrary `evals: 78063` can be any explicitly authored
metadata value because the promise is preservation of that value.

Keep hash freshness, browser/Node hashing agreement, file validation, invalid-load atomicity, physical car limits,
resampling, and `run:true` behavior. Check only event-order constraints actually required by clients (new car/track
and snapshot installed before `loaded`); a full event-list equality should remain only if the exact sequence is a
documented protocol promise. Keep actionable error field identification without unnecessarily freezing prose.

Add a focused case with a deliberately different recorded lap/physics identity: reading the file must preserve the
record, while loading recomputes the current lap. This directly guards the distinction that removing the old
equality is meant to allow.

## 4. Remove incidental assertions inside otherwise useful tests

These are surgical changes. The surrounding test files remain.

| Location | Remove or relax | Replacement / reason |
| --- | --- | --- |
| `race.test.mjs`, scripted steering | Hardcoded incident station `53` | Run the same scripted input twice and require the same incident location within that runtime; retain exactly one incident and DNF. Add a causal check that it occurs after the steering change. Judge threshold tests independently establish classification. |
| `race.test.mjs`, reset across finish | Exact observed incident station offset | Inject or arrange an incident on either side of the finish and assert the intended side/precondition, lap accounting, penalties, and callback uniqueness. Preserve both windows until replacement demonstrably exercises the crossing-reset defect. |
| `scene3d-car.test.mjs`, disposal | Exactly three geometries and two materials | Discover the nonempty unique owned resources, listen for disposal, require each released once. Check shared-resource disposal without demanding the current model's construction count. |
| `scene3d-car.test.mjs`, placement | Setting `pivot.rotation` and immediately asserting the assigned value | Delete without replacement: this tests a library property assignment. Steering/spin behavior is already exercised through `applyAttitude` in `scene3d-car-attitude.test.mjs`. |
| `scene3d-overlays.test.mjs` | Full-vector equality to values such as `4.6000000000000005` | Check height, intended offset distance, outward side for both bend signs, and explicit margin within a geometric tolerance. Floating operation order is irrelevant. |
| `scene3d-camera.test.mjs` | Exact `Object.keys(view(s))` order | Required fields, finite values, and usable reconstructed projection. Property insertion order is not a view contract. |
| `simple.test.mjs` | Exactly six bases and the hardcoded Cartesian count `6 * 2 * 2 * 5 * 4 * 3 ** 4` | Derive the matrix size from the independent dimensions and require nonempty coverage of each declared option/base. Keep centered identity, validation, ownership/override, and directional behavior. Adding a preset should not require updating a magic count. |
| `elevation.test.mjs`, “load tables reach down to zero grip” | Open-wheeler's observed `l0 < -15` | Keep zero grip at the floor and nonzero grip one level above. Add a constructed downforce case that needs negative load levels if this branch needs explicit coverage. The preset's historical floor index adds no unique promise. |
| `elevation.test.mjs`, steep-hill warning | An observed preset rounding specifically to `32%` | Keep warning/no-warning threshold boundaries, grade/radius identification, and a synthetic value whose rounded number is known. |

### Geometry layout needs a boundary decision

`scene3d-meshes.test.mjs`, `scene3d-line.test.mjs`, `scene3d-world.test.mjs`, and `scene3d-markings.test.mjs` assert
specific vertex counts, per-vertex slots, and triangle arrays. Some array shapes/types are the explicit mesh-to-GPU
adapter contract; winding, closure, widths, heights, normal orientation, UV bounds, and color-space conversion are
also valuable. Arbitrary vertex numbering and diagonal choice are usually not.

Inspect each consumer before changing these assertions. For arrays required to be Float32/Uint32 by the renderer,
keep that requirement. For interchangeable triangulations, replace the exact index arrays with valid-index bounds,
nondegenerate triangles, consistent winding, expected surface coverage, and geometric seam/edge checks. Make the
checks invariant to vertex ordering; do not decode every mesh with the old hardcoded packing and call that a
replacement. Verify colors and UVs at known positions or through a minimal adapter fixture.

For markings, preserve count/label/distance semantics when they specify the three braking boards and start band.
Relax incidental “twelve triangles per post”, exact start-band triangulation, and atlas tile/page layout if the
consumer supports alternatives. Keep every label covered once, disjoint UV tiles, texture-size limits, correctly
facing fronts/backs, panel/post contact, and road clearance. This is lower priority than the numerical and migration
work: these tests are mostly inexpensive and already catch visible defects.

Keep the Illinois-versus-bisection checks in `elevation.test.mjs`. They use an alternate numerical method and a
precision-derived tolerance, including a multi-root trap. That is a useful algorithm check despite mentioning the
implementation. Keep flat/load-table consistency, interpolation accuracy, load clamps and zero-grip floors as well;
the underlying table API currently exposes their layouts to callers.

## 5. Make browser checks enforce their promises

### Close the existing enforcement gaps first

[ghost-pin.mjs](../tools/scenarios/ghost-pin.mjs) and [refused.mjs](../tools/scenarios/refused.mjs) return observations
without assertions or `allTrue`. [cdp.mjs](../tools/cdp.mjs) exits unsuccessfully for exceptions or an explicit
`allTrue: false`; an incorrect ordinary observation can therefore pass. The other scenarios have explicit result
checks or assertions, though not every reported metric is a gated requirement.

- Ghost pin: explicitly check pin disabled/no ghost while a replacement track is pending, then enabled/pinning the
  new revision after installation. Use a controlled pending-state barrier or delayed response so a fast build
  cannot skip the state under test. Poll the relevant revision with a deadline rather than sleeping three seconds.
- Refused commands: explicitly check restored parameter/slider values and track geometry, unchanged accepted track
  revision, a useful refusal note, and continued search when it was running. Hold the search in a known active
  state so natural convergence does not turn the test into a timing race.
- Require every verification scenario to return a nonempty set of boolean checks or throw on failure. Make
  diagnostic-only capture/update modes explicit; reject malformed/missing verification results. Keep benchmark
  numbers as diagnostics unless a supported-machine budget is documented.
- Unexpected console errors should fail. Refusal scenarios deliberately log expected errors: identify those narrowly
  and check that they occurred; do not suppress every console error. Currently the runner prints console errors
  without failing on them.

Add small harness-level tests for false/missing checks, page exceptions, expected versus unexpected console errors,
and timeouts. They should test result classification without requiring a full app or Chrome session for every case.

### Keep visual comparisons, stop silently creating expectations

[shot.mjs](../tools/shot.mjs) treats a missing reference as `ok: true` and writes the current image automatically.
That allows a deleted reference to become a newly approved answer. Change verification mode to fail on a missing
reference; reserve writes for explicit `APEX_UPDATE_REFS=1`. Report updates as updates requiring review, not as a
successful historical comparison. Keep the existing tolerant pixel comparisons and their known viewport/theme/
replay inputs. Require nonempty captures and check `wrote` where verification expects comparison.

In [view-toggle.mjs](../tools/scenarios/view-toggle.mjs), remove the completed migration's optional main-checkout
PNG byte comparison and its save/baseline workflow after preserving the layout checks. Retain camera-state survival,
inset click behavior, edit-mode fallback, sizing, and phone control clearance. Use a small reviewed 2D visual baseline
if continuing appearance protection is wanted; PNG byte identity to an old checkout is not a lasting toggle contract.

In `scene3d.mjs`, replace the triangle-total calculation built by invoking the same production mesh builders again
with evidence that the intended surfaces/line/cars are actually present and rendered. Keep positive output and a
documented upper budget if one is needed. Preserve stable resources across frames/rebuild cycles, released resources,
depth fallback, shadow coverage, theme updates, and context-loss recovery. “No growth across equivalent cycles” is
a useful resource contract; an immutable global construction count is much weaker.

For `simple.mjs`, relax CSS details such as a `3px` border and exact section order unless explicitly required by the
UI design. Keep visibility, enabled state, hand-edit precedence, refusal recovery, loaded-base behavior, accessible
labels, and an observable relationship between a knob and its advanced controls. `perf3d.mjs` checks collection and
rendering health, not a p95 performance target; keep it labeled accordingly.

## 6. Coverage to keep substantially as it is

This accounts for the remaining files and prevents the cleanup becoming a rewrite of good tests.

| Files | Disposition |
| --- | --- |
| `gradient.test.mjs` | Keep hard/soft finite differences, coverage checks, hills, and load-factor clamps; extend selected seeded cases when parity is retired. |
| `elevation.test.mjs` | Keep closed forms, directional/stress behavior, warnings, dynamics agreement, lookup accuracy, and trace-height compatibility; make the narrow changes above. |
| `client.test.mjs` | Keep coalescing, error matching, load barriers, resume/edit interactions, warning delivery, refusal recovery, and ghost revisions; add the consuming-boundary cases in section 1. Give cases fresh state eventually; current module state persists across tests. |
| `solver.test.mjs` | Keep transactions, copies, revisions, telemetry consistency, recovery, resume behavior, hilly transitions, and accepted-line regressions; replace only historical numerics and unnecessary algorithm-private comparisons. |
| `driver.test.mjs` | Keep separate identity hashes, malformed-action atomicity, steering limits, isolation, and exact recorded-action replay. These are contracts even though several use deep equality. |
| `race.test.mjs` and `check-race-mutations.mjs` | Keep race/judge/accounting/reset coverage and the mutation runner; replace the incidental station goldens above. |
| `runfile.test.mjs`, `simple.test.mjs`, `describe.test.mjs`, `camera.test.mjs`, `playback.test.mjs` | Keep each file; make the targeted replacements in sections 2–4. |
| `smooth-pose.test.mjs`, `trace-clock.test.mjs`, `trace3d.test.mjs` | Keep geometry/telemetry agreement, interpolation derivatives, heading continuity, clock boundaries, stale-result handling, visibility, and failure seeking. Same-build cross-API consistency is useful, complemented by known examples. |
| `scene3d-frame.test.mjs`, `scene3d-heights.test.mjs`, `scene3d-ortho.test.mjs` | Keep handedness, grade/bank frame behavior, height/pitch scaling, and agreement between the two current map projections. Current cross-view agreement expresses a product contract, unlike equality to a copied historical camera. |
| `scene3d-chase.test.mjs`, `scene3d-heli-pair.test.mjs`, `scene3d-tv.test.mjs`, `scene3d-bonnet-free.test.mjs` | Keep framing, motion/paused behavior, frame-rate consistency, yaw seams, rigid placement, camera hysteresis, ghost framing, and fallback. Avoid full private-state equality for cross-frame-rate cases where public view equivalence suffices. |
| `scene3d-attitude.test.mjs`, `scene3d-car-attitude.test.mjs`, `scene3d-effects.test.mjs`, `scene3d-streaks.test.mjs` | Keep signs, distance-based spin, recorded steering, determinism, bounds, zero-time behavior, and reduced motion. Preserve documented design constants in focused examples. |
| `scene3d-car.test.mjs`, `scene3d-camera.test.mjs`, `scene3d-overlays.test.mjs`, `scene3d-meshes.test.mjs`, `scene3d-line.test.mjs`, `scene3d-world.test.mjs`, `scene3d-markings.test.mjs`, `scene3d-kerbs.test.mjs` | Keep geometric/rendering contracts; remove the construction/order/rounding details identified above where consumers permit it. Keep kerb side, threshold, height, striping, theme recoloring, and empty-input behavior. |
| `perf.test.mjs` | Keep statistical examples, running/idle attribution, and input preservation. These test specified math and accounting, not today's measured performance. |
| `vendor-three.test.mjs` | Keep exact vendored revision/checksums, class identity, and import-map wiring. Pinning a dependency is the intended contract. |
| Remaining browser scenarios | Keep behavioral and visual verification for WebGL, rendering, themes, cameras, heights, markings, kerbs, world/fog, overlays, trace replay, attitude, effects, streaks, steep hills, and driver identity; apply the runner/reference policy above. |

Do not replace every integration setup with a mock. Some camera/playback tests obtain snapshots by running the solver
for time-budgeted slices; the precise fixture varies with machine load. Move most arithmetic/geometry examples to
small authored data and keep selected real snapshots/traces for integration. This removes setup coupling without
turning every layer into an isolated test of its own assumptions.

## 7. Implementation sequence and deletion gates

| Phase | Work | Completion condition |
| --- | --- | --- |
| 1. Make browser results trustworthy | Assert ghost-pin/refusal outcomes; validate scenario result shape; classify console errors; require explicit reference updates | A false check, missing reference, or unexpected console error fails; intentional captures/updates are clearly distinguished. Existing expected refusals still pass. |
| 2. Make low-risk surgical cuts | Remove self-assignment checks, fixed resource counts, key order, observed rounding, and hardcoded catalog counts; replace the copied fit/playback examples | Named geometric/behavioral replacements pass and detect their corresponding faults. No physics change or golden regeneration. |
| 3. Establish independent coverage | Add track, units, flat physical laws, selected perturbed-input gradient cases, and actual client revision/readiness checks; rewrite description adapter examples | Faults in normal direction, bounds, units, drag, selected adjoint terms, and stale-event consumption fail independently of prototype/goldens. |
| 4. Decouple fixtures and compatibility | Extract immutable input fixtures; migrate fixture consumers; split historical data preservation from current rescoring | Contracts run without `golden.json` expected outputs; stored metadata/offsets remain exact; a changed historical recorded lap does not falsely fail current rescoring. |
| 5. Replace optimizer/dynamic endpoint requirements | Calibrate quality/effort budgets; keep direct and protocol runs; retain accepted-line coverage; build the opt-in numerical report | A no-op/poor optimizer, invalid output, rejected publication, and false clean dynamic result fail. Better feasible endpoints pass. Mechanical-refactor evidence remains available. |
| 6. Delete obsolete machinery | Delete parity and its loader; remove historical subtests/default runtime gates; remove unused helpers and optional old-checkout PNG workflow | Every deleted assertion has its replacement or explicit no-replacement rationale recorded. All applicable guidance names the new contract and numerical-review commands. |
| 7. Relax mesh internals where justified | Check consumers, replace exact triangulation/packing expectations with geometry contracts | Equivalent vertex ordering/triangulation passes; reversed winding, seam gaps, missing surfaces, bad UVs, and leaks fail. |

Use focused changes, not one mass rewrite. Run each affected Node file during development, then `node --test tests/`
at each completed phase. Run relevant browser scenarios after runner/UI verification changes, including their
negative cases. Re-run `node tests/check-race-mutations.mjs` after race replacements. Extend the existing temporary
source-copy mutation approach only for named faults in this plan; this does not require introducing a framework.
When a file uses direct imports or a dedicated override variable, make sure the mutated copy is actually loaded.
Require the intended assertion failure, not a hash/runtime mismatch or a harness/import error.

Before deleting a test, record: the old assertion, the promise it uniquely protected, its replacement test or why
none is needed, and a demonstrated fault the replacement detects. For a replacement budget, record the supported
runtime observations, units, numerical/behavioral rationale, and a broken case outside the bound. Avoid simply
measuring current min/max and padding them until green.

Update `AGENTS.md` testing guidance where the proposed workflow changes it, `ARCHITECTURE.md` §8 and migration
claims, relevant active guidance in `CLAUDE.md`, test headers, and `docs/deferred.md` when implementation lands.
Keep dated investigations as history. This documentation-only review does not alter those existing requirements.

Success means a valid algorithm or representation improvement passes the contract suite without mass snapshot
updates, while wrong physics, corrupted files, stale UI state, broken search quality, and resource leaks still
produce specific failures. A smaller test count or a faster green run alone does not establish that outcome.
