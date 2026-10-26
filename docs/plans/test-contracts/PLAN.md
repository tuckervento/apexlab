# PLAN: Test contracts — replace historical-equivalence tests with contracts

_Drafted: 2026-10-25_

## Goal

Implement `docs/test-contract-plan.md`: every test asserts a promise (a correct line, a materially good search, SI
conversion, preserved saved data, a fresh result on screen, no leaks, an accessible control) rather than an old
program's outputs. A valid improvement (a better optimizer endpoint, a different triangulation) passes
`node --test tests/` and the browser scenarios without mass snapshot updates, while each named fault still fails a
named contract. Exact numerical comparison survives as an opt-in report, and the guidance documents describe the new
workflow.

## Context

- **Source of truth:** `docs/test-contract-plan.md` (reviewed 2026-10-25). Its §1–§6 give the reasoning and the
  per-file dispositions; §7 gives the phase order this plan follows. Each task names the doc section it implements.
  Read that section before starting. Since the review, the suite has grown from 39 to 40 files (wheel blur) and the
  browser scenarios from 24 to 26 (`wheels3d`, `ui3d`).
- **Commands:**
  - `node --test tests/` (~25–40 s);
  - `node tools/cdp.mjs tools/scenarios/<x>.mjs` (exit 0 pass, 1 a check failed, 2 driver);
  - `node tests/check-race-mutations.mjs`;
  - `node tests/make-golden.mjs --write`.

  `CLAUDE.md` covers WebGL, ports and references. Scenario rules: deterministic shots, wait on state and never on a
  fixed sleep, wait for the precondition and never for the behaviour under test, and run twice so each reference
  compares at fraction 0.
- **Known flake source:** on 2026-10-25, `view-toggle`'s byte comparison and `view3d`'s references drifted once
  (fractions 0.003–0.008 and 0.001), with the differences only in the side panel's paragraph text. They passed at
  fraction 0 on rerun. The suspected cause is the web font (Google Fonts, loaded on every run). Tasks 1.4 and 6.3
  should not make byte-exact text rendering a requirement.
- **Goldens are per-runtime:** `tests/golden.json`, V8 `14.6.202.34-node.40`, Node v26.12.1. Its consumers are
  `golden-util.mjs`, `golden.test.mjs`, `convergence.test.mjs`, `solver.test.mjs`, `skidpad.test.mjs`,
  `runfile.test.mjs`, `elevation.test.mjs` (the hilly cases, through `loadGolden`/`comboKey`) and `make-golden.mjs`.
  `assertRuntime` is used in `golden-util`, golden, convergence, solver, runfile and skidpad.
- **The current golden rule stands until 6.2 lands:** mechanical refactors keep goldens unchanged, and no task
  regenerates them. Q approved replacing that rule with the opt-in report (5.5) in 6.2.
- **Mutation evidence:**
  - every replacement must be shown to fail on its named fault (§7);
  - use `APEX_SRC=<copy>` with `tests/load-core.mjs`, or the `check-race-mutations.mjs` approach;
  - when a test imports directly, make sure the mutated copy is the one actually loaded;
  - the failure must be the intended assertion, not a hash, runtime or import error.
- **Deletion ledger:** `docs/test-contract-ledger.md`, created by the first task that removes an assertion. For every
  removed assertion it records:
  - the old assertion;
  - the promise it uniquely protected;
  - its replacement, or why none is needed;
  - the fault the replacement was shown to catch.

  For budgets it also records the runtime observations, the units, the rationale, and a broken case outside the bound.
- **Execution:** Codex implements in worktrees, in parallel waves. The coordinator (Claude) reviews, mutates, runs the
  browser scenarios and commits; Codex can't run Chrome, so browser acceptance is run by the coordinator.

## Non-Goals

- **Production changes:** nothing under `src/` (physics, solver, app, views), and no regenerated goldens or physics
  hash. If a task finds a production change necessary, it stops and asks Q.
- **Scope:** no new test framework or dependency, and no mass rewrite: the files listed in §6 stay substantially as
  they are.
- **Integration runs:** the real protocol integration runs are not replaced with mocks (§6).
- **Prototype:** `prototype/apex-lab.html` stays frozen, even after parity is deleted.
- **Performance targets:** none; `perf3d` stays a health check.

## Tasks

### Phase 1: Make browser results trustworthy (doc §5)

- [ ] **1.1 — Ghost-pin scenario asserts its outcome**
  - Scope: `tools/scenarios/ghost-pin.mjs`. Return boolean `checks` and `allTrue`:
    - Pin is disabled with no ghost while a replacement track is pending;
    - after installation it is enabled and pins the new revision.

    Hold the pending state with a controlled barrier or a delayed response (so a fast build can't skip it), and poll
    the revision against a deadline instead of `sleep(3000)`.
  - Depends on: none
  - Acceptance:
    - the coordinator runs it twice with exit 0;
    - with `settled()` in `src/app/client.js` mutated to always return true (an `APEX_SRC` copy, or an in-page stub),
      it exits 1 naming the pending check.

- [ ] **1.2 — Refused-commands scenario asserts its outcome**
  - Scope: `tools/scenarios/refused.mjs`. Check:
    - restored parameter, slider values and track geometry;
    - an unchanged accepted track revision;
    - a refusal note naming the problem;
    - the search still running when it was running before.

    Hold the search in a known active state so convergence can't race the test.
  - Depends on: none
  - Acceptance: two passing runs; mutating the client's `refused` hook to skip restoring the panel exits 1 on the
    restore checks.

- [ ] **1.3 — Runner classifies results and console errors**
  - Scope:
    - Factor `tools/cdp.mjs`'s pass/fail decision into a pure exported function, e.g.
      `classify({result, exceptions, consoleErrors, options})`. It fails on:
      - a missing or non-object result;
      - an empty or non-boolean `checks`;
      - `allTrue: false`;
      - page exceptions;
      - unexpected console errors.
    - A scenario declares expected errors narrowly (e.g. `options.expectedConsoleErrors: [regex]`), and each one must
      occur. Diagnostic modes (`VIEW_TOGGLE_SAVE`, benchmark output) declare themselves explicitly.
    - Tests: `tests/cdp-classify.test.mjs`, in Node, with no Chrome.
  - Depends on: 1.1, 1.2 (every scenario must already return checks)
  - Acceptance:
    - the new test file passes, with cases for false or missing checks, an exception, expected versus unexpected
      console errors, and an expected error that is absent;
    - all 26 scenarios exit 0 twice (coordinator);
    - `refused.mjs` still passes, with its expected errors declared.
  - Context: `cdp.mjs:107–118` is today's exit logic. The console collector is at `:64`.

- [ ] **1.4 — References: missing fails, writes are explicit**
  - Scope: `tools/shot.mjs` `compareToReference`. A missing reference fails in verification mode, and only
    `APEX_UPDATE_REFS=1` writes. A write reports `{wrote: true, ok: false, update: true}` (an update needing review,
    not a pass), and an empty capture fails. Adapt `tools/scenarios/webgl2.mjs` (it relies on writing a missing
    reference) so it passes in both modes, and update the `CLAUDE.md` browser notes.
  - Depends on: none
  - Acceptance:
    - with one reference renamed away, its scenario exits 1 naming that reference;
    - `APEX_UPDATE_REFS=1` writes it and exits non-zero with an "updated, review" note;
    - with all references present, all 26 scenarios pass twice.

### Phase 2: Low-risk surgical cuts (doc §2, §4, §5; no physics change, no golden regeneration)

- [ ] **2.1 — scene3d incidental assertions**
  - Scope (doc §4 table):
    - `scene3d-car.test.mjs`: replace the fixed geometry and material counts (now 4/4 after wheel blur) with
      discovered resources, each disposed exactly once; delete the `pivot.rotation` self-assignment check.
    - `scene3d-overlays.test.mjs`: geometric checks within a tolerance instead of full-vector equality.
    - `scene3d-camera.test.mjs`: required fields and a usable projection instead of `Object.keys` order.
  - Depends on: none
  - Acceptance:
    - the three files pass;
    - mutations fail: a material never disposed fails the disposal test; an overlay on the inside of a bend fails
      the side check;
    - ledger entries are written.

- [ ] **2.2 — Simple and elevation incidental assertions**
  - Scope (doc §4 table):
    - `simple.test.mjs`: derive the matrix size from its dimensions, and require coverage of every base and option.
    - `elevation.test.mjs`:
      - replace the Open-wheeler `l0 < -15` check with zero grip at the floor and nonzero grip one level above (plus
        a constructed downforce case if that branch needs it);
      - replace the 32% warning check with synthetic threshold cases.

    Keep Illinois-versus-bisection and the rest of `elevation.test.mjs`.
  - Depends on: none
  - Acceptance:
    - both files pass;
    - adding a seventh base to `CARS` in an `APEX_SRC` copy needs no test edit;
    - a warning threshold off by 1% fails;
    - ledger entries are written.

- [ ] **2.3 — Race station goldens**
  - Scope: `race.test.mjs` (doc §4 table):
    - scripted steering: replace station `53` with run-twice determinism, exactly one incident plus DNF, and the
      incident coming after the steering change;
    - reset across the finish: arrange an incident on each side, and assert side, lap accounting, penalties and
      callback uniqueness.

    Add a `check-race-mutations.mjs` mutation for each new property (`CLAUDE.md` requires it).
  - Depends on: none
  - Acceptance:
    - `race.test.mjs` passes, and `node tests/check-race-mutations.mjs` rejects every mutation, old and new;
    - the crossing-reset defect mutation still fails a test.

- [ ] **2.4 — Camera fit: drop the copied function**
  - Scope: `camera.test.mjs` (doc §2):
    - delete `fitOld` and "matches the pre-frame() version";
    - add direct `fit()` checks on a hand-authored rectangle at desktop and narrow sizes: the edges inside the
      unobscured area, centred, one axis tight at the documented padding, idempotent; plus inverse round trips and
      zoom anchoring.

    Derive the expected values from the track and the padding policy, not from the production padding helper.
  - Depends on: none
  - Acceptance:
    - passes;
    - a fit that ignores `padB` fails;
    - a fit that centres on the bounding-box corner fails;
    - ledger entry written.

- [ ] **2.5 — Playback: known examples instead of copied logic**
  - Scope: `playback.test.mjs` (doc §2):
    - remove `carStateOld`, `raceClockOld` and their equality checks;
    - add a hand-authored snapshot with nonuniform segment times (boundaries, midpoint, signed `ay`, the closing
      segment, gear and rpm), and a trace crossing the heading seam;
    - keep bounded final-segment sampling, not the `1e-6` epsilon.
  - Depends on: none
  - Acceptance:
    - passes;
    - a pose taking the long way across the heading seam fails;
    - an `ay` with the wrong sign fails;
    - ledger entries are written.

- [ ] **2.6 — Browser scenario cuts**
  - Scope (doc §5):
    - `tools/scenarios/scene3d.mjs`: replace the triangle formula built from the production mesh builders with
      evidence that the road, line, cars and markings are present and drawn (found by name), a positive count, and
      no growth across frames and rebuilds. Note: the lap car is drawn twice, in the main and shadow passes.
    - `tools/scenarios/simple.mjs`: relax the `3px` border and section-order details; keep visibility, enabled
      state, precedence, refusal recovery and labels.
  - Depends on: none
  - Acceptance:
    - both pass twice (coordinator);
    - hiding the road mesh fails `scene3d`;
    - leaking one geometry per rebuild fails `scene3d`.

### Phase 3: Independent coverage (doc §1, §2)

- [ ] **3.1 — `track.test.mjs`**
  - Scope:
    - synthetic circle and hand-authored closed track: length and curvature within a justified discretisation
      error, unit normals perpendicular to the tangents, orientation, periodicity;
    - bounds respecting the car's width and the inside fold limit;
    - translation and rotation invariance (transforming explicit control points);
    - tight, overlapping and zero-length rejection at their documented boundaries.
  - Depends on: none
  - Acceptance: passes; a flipped normal sign, a missing fold limit and a lost car half-width each fail in
    `APEX_SRC` copies.

- [ ] **3.2 — `units.test.mjs`**
  - Scope: hand-computed `carSpec` conversions (km/h, kW, %, degrees, SI unchanged), the frozen snapshot, and
    missing, non-finite and invalid fields, plus valid unusual values.
  - Depends on: none
  - Acceptance: passes; a km/h→m/s factor of 3.5 fails, as does a percentage left unconverted.

- [ ] **3.3 — Flat physical laws**
  - Scope: a new `tests/flat-model.test.mjs` with explicit car parameters:
    - drag ∝ v²;
    - rolling loss under the documented law;
    - EV torque and power regimes;
    - the analytic constant-radius lateral limit, with simplified tyres and aero.
  - Depends on: none
  - Acceptance: passes; ignoring drag fails, and so does halving rolling resistance, in an `APEX_SRC` copy.

- [ ] **3.4 — Seeded perturbations off the preset grid**
  - Scope: carry `parity.test.mjs`'s four seeded car perturbations and its track `SEEDS` into finite-output and
    feasibility checks, plus a small finite-difference matrix in `gradient.test.mjs`. Keep the existing
    branch-coverage assertions and clamp cases.
  - Depends on: none
  - Acceptance: passes; a dropped adjoint term on one perturbed car fails.

- [ ] **3.5 — Client consuming boundary**
  - Scope: fake-worker cases in `client.test.mjs` (doc §1, "Test the consuming boundary"):
    - an older snapshot is ignored;
    - a track and its snapshot swap in together (including a station-count change);
    - a dynamic result with each revision dimension stale in turn sets `S.dynStale`;
    - `settled()` behaves correctly while a change is pending.
  - Depends on: none
  - Acceptance: passes; removing the old-snapshot guard fails, and ignoring one revision dimension fails.
  - Context: module state persists across tests in a file (`CLAUDE.md`), so give each case fresh state where needed.

- [ ] **3.6 — `describe.test.mjs` adapter contract**
  - Scope: replace the verbatim old-renderer formulas with a synthetic car and table fixture with known values:
    - force units, resistance, table samples, EV/ICE gears, ownership;
    - one live preset per powertrain.

    Keep the immutability checks.
  - Depends on: none
  - Acceptance: passes; acceleration not multiplied by mass fails; ledger entries are written.

### Phase 4: Decouple fixtures and compatibility (doc §1 "Fixture and tooling", §3)

- [ ] **4.1 — Input fixtures out of `golden.json`**
  - Scope:
    - extract the 30 fixed-line inputs (control points, width, car parameters, offsets, station and generator
      metadata to detect a sampling change) into `tests/fixtures/`, versioned separately from the expected outputs;
    - add a generator script that is not a `*.test.mjs` file;
    - a fixture check fails loudly on a station-count mismatch.
  - Depends on: none
  - Acceptance:
    - the fixtures load, and re-scoring them reproduces the `golden.json` laps on the pinned runtime (a one-off
      check, recorded in the task's evidence);
    - a fixture with a changed station count is rejected by name.

- [ ] **4.2 — Migrate the fixture consumers**
  - Scope: switch the hilly cases in `elevation.test.mjs` and the dynamics helpers to the 4.1 fixtures. Diagnostic
    metrics are kept separate from asserted bounds.
  - Depends on: 4.1
  - Acceptance: with `golden.json`'s expected outputs moved away in a scratch copy, these files still run and pass.

- [ ] **4.3 — Saved-file compatibility, not physics equality**
  - Scope: `runfile.test.mjs` (doc §3):
    - three contracts: recorded data survives (v1 → v2 defaults), loading preserves usable input (re-scored against
      a fresh `lapEval`), and same-build round trips are lossless;
    - `recorded()` reads a 4.1 fixture;
    - remove the runtime-gated historical-lap equality and the 0.5 s delta;
    - add a case where the recorded lap and identity differ.

    Keep hash freshness, validation, atomicity, resampling and `run:true`.
  - Depends on: 4.1
  - Acceptance: passes; a v1 file whose recorded lap differs from the current physics passes reading and re-scores
    on load; corrupting one stored offset fails.

### Phase 5: Replace optimizer and dynamic-check endpoint requirements (doc §1)

- [ ] **5.1 — Measure search budgets (stops for Q)**
  - Scope: on GT/Harrow (plus one distinct case if the measurements show another path), measure:
    - evaluations and steps;
    - wall time;
    - `gain = (centreLap − resultLap)/(centreLap − referenceLap)` against a fixed feasible reference line from 4.1.

    Write them up in `docs/investigations/search-budgets.md`, with:
    - the runtimes;
    - the proposed minimum gain, budgets and watchdog, with their rationale;
    - one broken optimiser case outside each bound.
  - Depends on: 4.1
  - Acceptance: the investigation file exists with the measurements and proposals, and **Q has approved the
    numbers** (recorded in STATUS). No test changes.

- [ ] **5.2 — Search contracts**
  - Scope:
    - replace the `golden` subtests in `convergence.test.mjs` and the protocol convergence one in `solver.test.mjs`
      with: termination within the approved budgets; final offsets in bounds; finite telemetry; a positive lap equal
      to a fresh-scratch `lapEval` of the returned line; and `gain ≥` the approved minimum;
    - keep one direct optimiser run and one protocol run;
    - exact counts become diagnostics.
  - Depends on: 5.1
  - Acceptance:
    - passes;
    - each of these fails a named contract in an `APEX_SRC` copy: optimisation bypassed, an infeasible line returned,
      a corrupted reported time;
    - a better endpoint (offsets nudged to a lower lap) passes.

- [ ] **5.3 — Fixed-line and dynamic-check contracts**
  - Scope:
    - replace `golden.test.mjs` with a fixed-line contract file over the 4.1 fixtures: clean completion, bounded
      tracking error, utilisation and pace fraction, warning consistency, finite outputs;
    - in `solver.test.mjs`'s dynamic-check subtest, replace `dynResultSummary` equality with: bounded iterations, a
      final passing run at the reported fraction, and a failing bracket that fails the clean-run criterion;
    - in `skidpad.test.mjs`, replace the `golden` subtests with clean tracking and the existing 0.2 m mean error.
  - Depends on: 4.1
  - Acceptance: passes without `assertRuntime`; a dynamic check stopped before a clean run fails, and so does a
    driver with gain ×0.3.

- [ ] **5.4 — Accepted-line publication through the boundary**
  - Scope: in `solver.test.mjs`, replace `acceptedObserver`'s reach into `spl(i, c)` with a comparison of the
    protocol payload against `Optimizer.current(out)`, plus a targeted accepted/rejected sequence. Keep a real run
    that reaches rejection and the polish stage.
  - Depends on: none
  - Acceptance: passes; publishing the trial buffer instead of `current()` fails.

- [ ] **5.5 — Opt-in numerical comparison report**
  - Scope: a tool outside `*.test.mjs` discovery (e.g. `tools/numeric-report.mjs`) that:
    - compares the current source against the baseline (initially `golden.json` and `make-golden.mjs`), covering the
      fixed lines and one compact converged case;
    - reports an unsupported runtime once, as a non-success.
  - Depends on: 4.1
  - Acceptance:
    - on the pinned runtime, a mechanical refactor (reordering two independent statements in `lap.js` in a copy)
      reports "identical";
    - a rolling-resistance change reports a reviewed delta table;
    - on a mismatched runtime it prints one clear non-success.

### Phase 6: Delete obsolete machinery (doc §2, §7)

- [ ] **6.1 — Delete prototype parity**
  - Scope: delete `tests/parity.test.mjs` and `tests/load-prototype.mjs`; keep the prototype file.
  - Depends on: 3.1, 3.2, 3.3, 3.4, 5.2
  - Acceptance: the suite passes; the ledger lists every parity assertion with its replacement or a no-replacement
    rationale.

- [ ] **6.2 — Retire historical gates and update the guidance**
  - Scope:
    - remove the remaining historical subtests and default `assertRuntime` gates, and unused `golden-util` and
      `make-golden` helpers (callers checked);
    - update `CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md` §8, the test headers and `docs/deferred.md` to describe the
      new contract and the 5.5 report as the mechanical-refactor and physics-change evidence (Q approved).
  - Depends on: 4.2, 4.3, 5.2, 5.3, 5.4, 5.5
  - Acceptance:
    - `node --test tests/` passes on the pinned runtime and with `assertRuntime` gates absent;
    - a grep shows no default-run test reading `golden.json` expected outputs;
    - the docs name the new commands;
    - the ledger is complete.

- [ ] **6.3 — `view-toggle`: drop the old-checkout PNG workflow**
  - Scope: in `tools/scenarios/view-toggle.mjs`, remove `VIEW_TOGGLE_SAVE`/`VIEW_TOGGLE_BASELINE`. Keep camera
    survival, inset click, edit fallback, sizing, phone clearance and the inset collapse. Optionally add one reviewed
    2D reference under the 1.4 policy. Update the `CLAUDE.md` note.
  - Depends on: 1.4
  - Acceptance: passes twice; moving the inset over the zoom buttons at 390 px fails.

### Phase 7: Relax mesh internals where consumers allow (doc §4, "Geometry layout")

- [ ] **7.1 — Road and world meshes**
  - Scope: in `scene3d-meshes.test.mjs` and `scene3d-world.test.mjs`, after checking each consumer in `scene.js`:
    - keep the Float32/Uint32 typing the renderer needs;
    - replace exact index arrays with ordering-invariant checks: valid indices, no degenerate triangles, consistent
      winding, coverage, and seams.
  - Depends on: none
  - Acceptance: an equivalent re-triangulation (a flipped quad diagonal in a copy) passes; reversed winding fails,
    and so does a seam gap.

- [ ] **7.2 — Line ribbon**
  - Scope: `scene3d-line.test.mjs`, the same approach; keep the bucket-colour and sRGB→linear checks at known
    positions.
  - Depends on: none
  - Acceptance: a reordered vertex packing passes; a colour bleeding across a station boundary fails.

- [ ] **7.3 — Markings**
  - Scope: in `scene3d-markings.test.mjs`:
    - keep: the three braking boards, the start band, every label covered once, disjoint UV tiles, texture limits,
      fronts and backs, post contact, road clearance;
    - relax: twelve triangles per post, the start-band triangulation, the atlas layout.
  - Depends on: none
  - Acceptance: a different atlas packing passes; overlapping UV tiles fail, and so does a missing board.

## Parallelizable Tracks

The waves follow from Depends-on. Run at most about 4 Codex tasks at once, because the coordinator reviews and runs
the browser checks for each.

| Wave | Tasks |
|---|---|
| A | 1.1, 1.2, 1.4, 2.6 (browser; coordinator-heavy), then 1.3 |
| B | 2.1, 2.2, 2.3, 2.4, 2.5 |
| C | 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 |
| D | 4.1, 5.4, then 4.2, 4.3, 5.5 |
| E | 5.1 → Q approves the numbers → 5.2; 5.3 alongside |
| F | 6.1, 6.2, 6.3 |
| G | 7.1, 7.2, 7.3 (lowest priority; no dependencies, kept last by choice) |
