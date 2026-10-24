# Apex Lab: whole-project progress review

- **Original review:** 2026-10-23, commit `ddc1299`, by the senior-code-reviewer subagent (invoked at Q's request).
- **Updated:** 2026-10-24 against `9955ccf`, after save/load landed (`e4f467c` "Saved runs: export/load a car with its line", `9955ccf` "Run-file physics hash: cover solver.js, drop the presets").
- **Who wrote the update:** the main Claude session, not the subagent. It re-checked every original finding against the new code, read the save/load diff, ran the suite and wrote two small probes. **The save/load code has not had an independent subagent review.** Say so if you want one; the new findings (M5, M6, L12, and the notes under L1, L2, L4) come only from this update.
- **Purpose of this file:** a work list for remediation. Each finding has an ID, a status box, evidence, and a proposed fix. Tick the box and add the commit hash when one is done.

## Caveats

- **Working tree at update time:** `README.md` has one uncommitted line (TODO #9, "simple controls"), unrelated to this review. This file is untracked.
- **Evidence labels:** VERIFIED means reproduced or confirmed by running something or reading the exact code. SUSPECTED means inferred from reading, not observed.
- **Line numbers** are for `9955ccf`. The original numbers for `client.js` and `solver.js` have shifted; where a finding was re-checked, the current line is given.
- **Probe scripts** (outside the repo, in the session scratchpad
  `/private/tmp/claude-501/-Users-tucker-code-apexlab/d32aa3d0-ea94-4e33-ba84-8887b8039b51/scratchpad/`):
  - `probe1.mjs`: M2
  - `probe2.mjs`: L2, L3
  - `probe3.mjs`: M1, L1 (fake Worker and fake DOM driving the real `client.js` and `controls.js`)
  - `probe4.mjs`: M5, L12 (fake Worker driving `client.js` through a load)
  - `probe5.mjs`: M6 (`Solver` `load` with out-of-range car values)
  - The scratchpad is session-specific. Copy the probes into `tests/` if you want to keep them. `probe3.mjs` and `probe4.mjs` are the starting point for the M4 client test.

## Remediation constraint introduced by save/load (read before editing)

Per `CLAUDE.md`, `src/app/physics-version.js` holds the SHA-256 of `core/`, `dynamics/` and `solver/solver.js`. After **any** edit to those files, mechanical refactors included, run `node tests/make-physics-version.mjs --write` and commit the result, or `runfile.test.mjs` fails.

- Findings that touch the hashed files, so each fix needs the hash regenerated: M2, M3 (done 2026-10-24: it did, `resume`), M6, L2, L3, L4, L7, L8 (if touched).
- Findings that do **not** touch the hashed files: M1, M4, M5, L5, L9, L10, L11, G1–G4, docs drift. These are `app/`, `views/`, `tests/` or markdown.
- **Correction (2026-10-24):** this list first included L1 and L12. They needed the error event tagged with a `rev`, which is emitted in `Solver.guard` (`solver.js`), so they did change the hash.
- The hash identifies source, not results. None of these fixes should change physics, so `golden.json` must still pass untouched. A golden diff means something went wrong. A hash-only diff is expected.

## Summary

No Critical or High issues, before or after save/load. The physics core and its tests are in very good shape. The open findings are mostly in the app and protocol-client layer, which still has no tests, and save/load added more surface there.

**Test run (VERIFIED, 2026-10-24, `9955ccf`):** `node --test tests/` gave 139 tests, 139 pass, 0 fail, 17.4 s. The first review had 127; the 12 new tests are save/load.

### Status of the original findings after save/load

| ID | Original finding | Status at `9955ccf` |
|---|---|---|
| M1 | dyn label sticks at "running" | **Fixed** 2026-10-24 (uncommitted), test in `tests/client.test.mjs` |
| M2 | car change mid-polish seeds from a rejected candidate | **Open**, unchanged; **proposed fix revised** (see M2) |
| M3 | frame error doesn't pause the worker; two owners of `running` | **Fixed** 2026-10-24 (uncommitted): worker owns `running`, `S.running` mirrors `progress`, `resume` flag on `setCar`/`setTrack`; browser check pending |
| M4 | app layer untested | **Partly done**: `client.js` now has `tests/client.test.mjs` (7 tests); `controls.js`, `telemetry.js`, `main.js` still untested |
| L1 | tick error breaks the one-in-flight invariant | **Fixed** 2026-10-24 (uncommitted) with L12 |
| L2 | degenerate track publishes NaN | **Partly fixed**: `load` refuses `T.L>0` false; `setTrack` still doesn't |
| L3 | `dynResult` not a copy, wrong shape | **Open**, unchanged |
| L4 | non-atomic `setTrack`/`setCar` | **Open** for both; `load` validates first (tested) but can still fail after it mutates |
| L5 | ghost/track mismatch race | **Open** for `#pinBtn`; the new load paths use `ghostFrom`, which checks N and telemetry channels but not `trackRev` |
| L6 | no range checks in `carSpec` | **Raised to Medium (M6)**: a run file can now feed unchecked values in; verified |
| L7 | `STAGES` unfrozen | **Open** |
| L8 | adjoint nit | **Open**, theoretical |
| L9 | dead code | **Done** (`drawConv` null handling kept: unreachable from callers, part of the view's contract) |
| L10 | repeated convergence in tests | **Open** |
| Docs drift | 10 items | **Open** (see list); save/load added its own docs, plus one inaccurate sentence (below) |

### What save/load got right (VERIFIED by reading and by the passing tests)

- `Solver.load` builds car and track and validates the line before changing any state. The `bad input` test covers three cases (NaN mass, non-finite line, circuit with no length) and checks car, track, bounds, line and revisions are all unchanged.
- `load` publishes the exact recorded line, not the optimiser's spline fit. The test compares the lap bit for bit with the golden for the GT racer on Harrow Ring.
- `load` is one command, not `setCar` + `setTrack` + `setLine`, and the docs say why: those are coalesced per kind, so the line could land on a different track.
- `readRunFile` is strict. It names every missing or unknown car field, checks array lengths and finiteness, and fills in nothing.
- The physics hash has a freshness test, plus a test that the browser-side `liveHash` equals Node's `runSource()`.
- File text reaches the DOM as text nodes only (`runMsg`), never as HTML.
- The snapshot's `off` is a copy, and `solver.test.mjs` asserts it.

### Migration plan status (ARCHITECTURE.md)

Unchanged from the first review: steps 1–7 done, 8 (elevation) and 9 (3D view) not started. Save/load is outside the migration plan (README TODO #6).

| Step | Status |
|---|---|
| 1 Harness | Done |
| 2 Mechanical split | Done (parity bit-exact; `prototype/apex-lab.html` unchanged) |
| 3 Hidden state | Done |
| 4 describeCar | Done |
| 5 Worker | Done |
| 6 Views/app split | Done |
| 7 Playback | Done |
| 8 Elevation | Not started |
| 9 3D view | Not started |

### Layering (VERIFIED by grep and import graph in the original review; not re-run in full)

- core, dynamics, solver and playback have no DOM access; `worker.js` is the only file that uses worker APIs.
- Views are pure.
- The main thread holds no car, bounds, line or optimiser. From core, the app imports only `genCtrl` and `G`.
- Save/load keeps this: `runfile.js` imports only `presets.js`, and `Solver.load` runs in the worker.
- Caveats from the original review still stand:
  - `genCtrl` calls `buildTrack` up to 200 times on the main thread (`track.js:44`).
  - Importing `core/index.js` loads the whole core graph into the page.
  - `S.cam` is a map2d `Camera` living in app state (see G1).

## Findings

### Medium

#### [x] M1. Dynamic-check label sticks at "running · lap N" after a car or track change (VERIFIED; unchanged)

- **Where:** `src/app/client.js:36` (`case 'dynProgress':ui.dynLap(m.lap)` is unconditional); resets in `controls.js` (`carChanged`, `rebuildTrack`); `onSnapshot` only calls `renderDyn` when the stale flag flips.
- **Cause:** `dynProgress` events the worker emitted before it processed `setCar`/`setTrack` arrive after the label reset and overwrite it. The worker emits one per 15 ms slice, so this is the normal case.
- **Evidence (`probe3.mjs`):** after `carChanged` the label is `"not run"`. After a late `dynProgress` it is `"running · lap 3"`. After `carInfo` it is still `"running · lap 3"` with `dynRunning=false`.
- **Fix:** `case 'dynProgress': if(S.dynRunning) ui.dynLap(m.lap)`.
- **Load path:** not a new exposure. Events arrive in order, so a stale `dynProgress` lands before `loaded`, and `loaded()` resets the label.
- **Fixed 2026-10-24 (uncommitted):** `client.js` `dynProgress` case now has the `if(S.dynRunning)` guard. Test: "dynProgress only updates the label while a dynamic check is running" (red before, green after).

#### [ ] M2. Car change during the polish stage seeds the re-score from a rejected candidate (VERIFIED; unchanged; proposed fix revised)

- **Where:** `src/core/optimiser.js:23` (`rescore` does `target=Float64Array.from(this.off)`); polish acknowledged at `optimiser.js:59-60`, candidate stored at `:76`; consumer `Solver.setCar` in `solver.js`.
- **Cause:** during the polish, `off` holds the last candidate tried even when it was rejected. `setCar` then publishes a stage-3 fit of that rejected line, which breaks step 6's "only accepted lines".
- **Evidence (`probe1.mjs`, GT racer on Harrow Ring):** the first polish try was rejected, leaving `off` up to 0.13 m from the accepted line. lap(accepted) = 78.8303 s, lap(rejected) = 78.8547 s. After `setCar`, `target` equalled the rejected `off` exactly.
- **Impact:** small. It is a restart seed and stage 3 smooths it out.
- **Original fix, now rejected:** use `this.current(new Float64Array(N))`. This is wrong since save/load. `current()` returns the spline fit `spl(i,this.c)` unless the search is `done` (`optimiser.js:61`). On a **paused loaded run** (no tick yet) that is the coarse stage-0 fit, so a car change would degrade the exact loaded line. `load` restores the exact line with `off.set(line)` after `setup` precisely so `rescore` can start from it.
- **Revised fix:** seed the rescore from `Solver.pub`, the last accepted line. It is the exact loaded line after a load, and `opt.current` during a search (`solver.js:117`: `this.pub=this.opt.current(...)`). Concretely: give `rescore` a seed argument, e.g. `rescore(car,B,seed)`, and pass `this.pub`. Verify against the cases below.
- **Tests to add:**
  - car change mid-polish: the published line equals a spline fit of the accepted line, not of the rejected candidate
  - car change on a paused loaded run: the published line is still the loaded line, within what the stage-2 refit allows
  - the existing test checks `pub === spl(c)`, which holds trivially after a refit, so it cannot catch this
- **Hash:** touches `core/optimiser.js` and `solver.js`, so regenerate `physics-version.js`.

#### [x] M3. Frame-loop error does not pause the worker; `running` has multiple owners (VERIFIED by reading)

- **Where:** `src/app/main.js:88` (`frame()` catch sets `S.running=false`, sends no `pause`); `client.js` `progress` case only handles `converged&&S.running`.
- **Cause:** the running flag is mirrored: `S.running` on the main thread and `Solver.running` in the worker. The worker keeps searching after a frame error, contradicting ARCHITECTURE §3.3 and CLAUDE.md ("errors pause the search").
- **Added by save/load:** `controls.js` `loaded()` also writes `S.running` directly (`S.running=L.mode==='ghost'`) while the worker sets its own from `c.run`. It's a third writer, and the two only agree because the code keeps them in step by hand.
- **Related race (SUSPECTED; inferred, not observed):** `setCar` never resumes the worker. If convergence and a single discrete car change cross in flight, the search stays paused. Slider drags recover on the next input.
- **Fix:** make the worker the single owner of `running`, and have the client mirror `m.running` from `progress`. Make the frame-error path send `pause`.
- **Fixed 2026-10-24 (uncommitted):**
  - `Solver` `setCar`/`setTrack` take `resume`: once the new line exists the worker sets `running` itself. The app's auto-resume rides on those commands (`resume:!S.editing`) instead of a separate `run`, which closes the race. A queued `resume` is dropped by `landed()` if the circuit is being edited by then. Test: "setCar and setTrack with resume start the search; without it they leave it as it was". `physics-version.js` regenerated (hash line only).
  - `client.js` `progress` mirrors `m.running` and redraws the label when it or `converged` changes; an `error` event and `solver.onerror` set `S.running=false`. Tests: three in `tests/client.test.mjs`.
  - Removed the writers: `setRunning`, `dynBtn`, `loaded()`, `showError`, the frame catch and the boot `setRunning(true)`. The frame catch now sends `pause`.
  - **Not covered by a Node test (needs the browser):** the frame-catch `pause`, and the label/auto-resume behaviour in `controls.js`.
  - **Behaviour changes to be aware of:** the Run/Pause label follows the worker's `progress`, so it lags a command by up to one 15 ms slice. While the circuit is being edited the worker is paused, so the button reads "Run" (it used to read "Pause"). After a frame error `S.running` stays true until the worker's `progress` arrives, so the same error can repeat for a frame or two, re-sending an idempotent `pause`.

#### [ ] M4. The app layer and protocol client have no tests (VERIFIED; surface has grown)

- **Where:** nothing imports `src/app/client.js` or `controls.js` from `tests/`. `tests/runfile.test.mjs` covers `runfile.js`, `physics-version.js` and `Solver.load`, but not the code that drives them.
- **Untested:** coalescing; `onSnapshot` stale and step-back rules; the `pendingT` swap; dyn state; `telemetry.tagText` and `renderTelemetry`; and new since save/load: `sendLoad`, `settled()`, the `loaded` and `loadFailed` handling, `loadPicked`, `loaded()`, `exportRun`.
- **Feasibility:** stubbing `Worker` and `document` in about 15 lines is enough to drive `client.js` (`probe3.mjs`, `probe4.mjs`). `controls.js` also runs a `fetch` at import (`liveHash`), which logs an error under Node but doesn't break.
- **Progress 2026-10-24:** `tests/client.test.mjs` exists (stubbed `Worker` and `document`; `controls.js` not imported) and pins coalescing, M1, L1, L12, M5 and the worker-crash path. Still untested: `onSnapshot` stale/step-back rules, the `pendingT` swap, dyn state, `controls.js` (`loadPicked`, `loaded`, `exportRun`, the panel lock), `telemetry.js`.

#### [x] M5. A UI edit made while a load is in flight is sent after it, and the solver ends on a different car than the panel shows (VERIFIED at the client level; NEW)

- **Where:** `src/app/client.js` `sendLoad`/`landed`; `controls.js` `loaded()`.
- **Mechanism:**
  1. `sendLoad` sets both `flight.setCar.busy` and `flight.setTrack.busy` to the load's rev, and the comment says it "holds both kinds busy until the worker has answered".
  2. But `Solver.load` emits `carInfo` and `track` first, and the client's handlers for those call `landed(...)`. That releases the hold **before** `loaded` arrives, and sends whatever was queued.
  3. The panel isn't disabled during a load, so a slider drag in that window queues a `setCar` with the pre-load params (`sendState` sees `busy` and stores it in `next`).
  4. When the load's `carInfo` arrives, that stale `setCar` is sent. `loaded()` then overwrites `S.P` with the file's car.
- **Evidence (`probe4.mjs`, scenario C):**
  - after the load's `carInfo`: sent = `load#1:LOADED-CAR setCar#2:EDITED-OLD-CAR`
  - after `loaded`: ui = `loaded:1`
  - So the solver is now building the edited old car while the panel (`S.P`, `syncFields`) shows the file's car.
- **Not verified in a real browser:** the window is the load's build time, so it needs a control touched in roughly that interval. The same applies to `rebuildTrack` (circuit edits): the solver can end on the old circuit while `S.ctrl` holds the loaded one, and `exportRun` would then write mismatched car, circuit and line (`settled()` compares revisions, not content).
- **Impact:** silent divergence between the panel and the solver, in an interval that is short but not rare.
- **Fix options (pick one):**
  - ignore or disable panel input while `loadRev` is non-zero
  - have `landed()` skip releasing a hold that belongs to a load, and release both kinds only on `loaded` or `error`
  - drop `next` in `loaded()` as well as in `sendLoad`
  The first is simplest to reason about; the second matches the existing comment.
- **Fixed 2026-10-24 (uncommitted), both options 1 and 2:**
  - `client.js`: the `carInfo` and `track` cases no longer land a flight whose `busy` is the load's rev. `loaded` frees both kinds and drops the queued edits (made against the state the load replaced). Test: "an edit made while a load is in flight is dropped, not sent after it".
  - `controls.js` `lockPanel`: the car, circuit and saved-runs sections are `inert` (dimmed by a `[inert]` rule in `index.html`) from `sendLoad` until `loaded` or `loadFailed`. **Not covered by a Node test** (`controls.js` fetches at import); needs the browser check.
  - Side effect, also fixed: a `carInfo` from a setCar that was in flight *before* the load was sent used to release the hold early too.

#### [ ] M6. A run file can feed unchecked car values into the solver; garbage or NaN laps are published and `loaded` fires (VERIFIED; was L6, severity raised)

- **Where:** `src/core/units.js:6-8` (`carSpec` checks `typeof number`/finite and `slipPk>0` only); `src/app/runfile.js` `readRunFile` checks that car fields are present and no others are unknown, but not their values; ARCHITECTURE §7 says "Value-level car checks stay with `carSpec` in the worker", which is not what `carSpec` does.
- **Evidence (`probe5.mjs`, `Solver.load` on the GT racer, Harrow Ring, no `error` event in any case):**

  | Override | Lap published | `loaded` event |
  |---|---|---|
  | `mass: 0` | NaN | yes |
  | `mass: -500` | 31106.99 s | yes |
  | `wb: 0` | 174.16 s | yes |
  | `gears: 0.4` | 95.72 s (silently clamped to 1 gear, `powertrain.js:18`) | yes |
  | `mu: -1` | 10429.47 s | yes |

- **Also silent today:** `Math.max(1,p.vBase)` (`powertrain.js:13`), `Math.max(0.3,p.yawDI)` (`bicycle.js:20`), `genCtrl`'s rectangle fallback (`track.js:47`).
- **Impact:** only UI slider ranges protected these before. A hand-edited or corrupted run file now bypasses them, and a NaN lap would make export throw (`num('lap')`) while the panel shows a loaded run.
- **Fix:** range-validate in `carSpec` (positive mass, wheelbase and track; `0 < mu`; fractions in range; integer `gears` ≥ 1), throwing with the field name and value. Then fix the §7 sentence if the checks live elsewhere. Add `load` tests for out-of-range values next to the existing "bad input" test.
- **Hash:** `units.js` is in `core/`, so regenerate `physics-version.js`. Goldens should be unaffected, since valid cars pass.

### Low

#### [x] L1. Coalescing invariant breaks after a tick error (VERIFIED; unchanged; see L12)

- **Where:** `src/app/client.js:41` (`for(const f of Object.values(flight))landed(f)` runs on any `error`, including errors from a tick rather than from the command in flight).
- **Evidence (`probe3.mjs`):** with `setCar:1` in flight and `:3` pending, a tick error sent `:3`, giving two in flight.
- **Impact:** harmless for correctness (the worker processes commands in order), but "one in flight" no longer holds.
- **Fixed 2026-10-24 (uncommitted), with L12:** `Solver.guard(fn, rev)` emits `{type:'error', rev, …}` (the command's rev, `null` for a slice or a command without one; test in `solver.test.mjs`). The client lands a flight only when `m.rev` equals its `busy`. Test: "only the error of the command in flight releases it". `physics-version.js` was regenerated (hash line only; `golden.json` untouched).

#### [ ] L2. Degenerate track publishes NaN silently (VERIFIED; partly fixed)

- **Fixed for `load`:** `solver.js` `load` throws `load: the circuit has no length` when `!(T.L>0)`, and the test covers it. The comment there confirms the original finding: "`buildTrack` reports this neither by throwing nor in `T.issue`".
- **Still open:** `setTrack` has no such guard (`solver.js`, `setTrack`), so `rebuildTrack` with all control points coincident still publishes `L=0`, `issue=null`, a NaN lap and non-finite `v`/`tc` with no `error` event (`probe2.mjs`).
- **Fix:** move the check into `buildTrack` (set an `issue` or throw when `L≈0`), so `setTrack` and `load` share it, and have `publish` assert that the lap is finite.

#### [ ] L3. `dynResult` is neither a copy nor the documented shape (VERIFIED; unchanged)

- **Where:** `solver.js` `dynResult` emit: `d.result` goes out with no transfer list. `r === dc.result`, so `uf` is shared with the `DynCheck`. This contradicts the header comment at `solver.js:3` ("Everything it emits is a fresh copy").
- **Payload:** the full `LapRun` (`nom` with 17 arrays × N, `stV`, `stE`, `trouble`, `trace`), about 1.3 MB as JSON for GT on Harrow. ARCHITECTURE documents only `{t, trace}`. Run files store only `frac`, `t`, `umax`, `uaxle` and `fail`, so exports are unaffected.
- **Test gap:** the "emitted arrays are copies" test does not cover `dynResult`. In the browser, structured clone copies it anyway.
- **Fix:** trim the payload to what the docs say and copy it, or document the real shape. Add `dynResult` to the copies test.

#### [ ] L4. Non-atomic `setTrack` / `setCar` / `load` after validation (SUSPECTED; nothing tried made it throw)

- **Where:** `setTrack` assigns `this.T`/`trackRev` and emits `track` before `makeBounds`/`resetLine`; `setCar` has the same shape after `buildCar`.
- **`load`:** validates everything first (tested). But it then assigns `this.car`, `this.T`, `this.B` and the revs, emits `carInfo` and `track`, and only then runs `opt.setup`, `computeRef` and `publish`. If one of those threw, the solver would hold new car and track with the old `off`/`opt`, and `client.js` would report "Not loaded: … Nothing was changed", which would be false. The comment "the solver validates before it changes anything, so S still matches it" only holds for the validation errors.
- **Fix:** build `opt.setup`/`computeRef` results into locals, then commit and emit. Or make the post-validation steps provably non-throwing and say so.
- **Test gap:** the error tests only cover failures that happen before any state changes.

#### [ ] L5. Ghost / track station mismatch race (SUSPECTED, by reading; `#pinBtn` unchanged)

- **Where:** `src/app/controls.js:128` (`#pinBtn`).
- **Risk:** the ghost is cleared on a track change, but `#pinBtn` can pin the old track's `disp` before the new snapshot arrives. The ghost then has the old N against the new disp, so `stationPose` and the gap chart index out of range and draw NaN. `pinBtn` also throws if `S.disp` is null, and takes `wb`/`track` from `S.P`, which may already differ from the snapshot's car.
- **Partial guard in the new code:** `ghostFrom(run)` refuses a ghost when `S.T.N !== run.line.N` or telemetry channels are missing. It does not check `trackRev`, so it can't tell two different circuits with the same N apart (the "same circuit" fast path uses `ctrlEqual`, which does).
- **Fix:** store `trackRev` (and `carRev`) on the ghost and ignore it on mismatch. Do the same for saved lines.

#### L6. → moved to M6 (severity raised after save/load).

#### [ ] L7. `STAGES` exported unfrozen (unchanged)

- **Where:** `src/core/optimiser.js:10`. Every other shared constant (`DYN`, `CARS`, `TRACKS`) is frozen.
- **Fix:** `Object.freeze` it and each stage object. **Hash:** regenerate `physics-version.js`.

#### [ ] L8. Adjoint nit, theoretical only (unchanged)

- **Where:** `v=max(0.1,…)` at `src/core/lap.js:87` is not reflected in the reverse pass at `:97`.
- **Impact:** unreachable in practice, since speeds are floored by `VSTEP`/the backward pass. Otherwise the adjoint reads correctly through the yaw, shift and GGV terms, and the gradient test exercises those branches with coverage assertions.
- **Fix:** probably document it. If touched, re-run finite-difference checks (≥4 sig figs, hard and `tau > 0`) and regenerate `physics-version.js`.

#### [x] L9. Dead code (unchanged)

- `src/app/main.js:107`: `convCap` is set to `''` in both branches.
- `src/views/map2d/map.js:44`: `(cw<560?0:0)`.
- `src/views/map2d/charts.js:26,29`: `drawConv` handles null gaps, but `hist` never contains null (not re-checked in this update).
- Per Chesterton's fence, trace git history before deleting each.
- **Done 2026-10-24:** both dead expressions removed (present since the initial commit `456a0fc`, never non-trivial). `drawConv`'s null handling re-checked: no writer of `hist` pushes null, but it is kept as part of the view's input contract.

#### [ ] L10. Test cost

- The same GT/Harrow convergence runs three times: `convergence.test`, solver "converges", and solver "publishes only accepted" (about 8 s each). The new `load: the recorded line comes back bit for bit` test also compares against the same golden, so check whether it adds a fourth run.
- **Fix:** the repeated runs could share `converged()`.

#### [x] L11. `telemetry.build` stores DOM refs on the shared `ROWS` constants

- **Where:** `src/app/telemetry.js:52`. Works, but it is mutable module state. Low priority.

#### [x] L12. A tick error during a load makes the panel report "Not loaded" while the solver did load (VERIFIED; NEW; same root cause as L1)

- **Where:** `client.js` `error` case: `if(loadRev){loadRev=0;ui.loadFailed();}` runs on **any** `error`.
- **Evidence (`probe4.mjs`, scenario D):** a `tick blew up (not the load)` error arrives, then the load's `carInfo` and `loaded`. The UI sees `showError`, then `loadFailed`; `loaded` is ignored because `loadRev` is already 0. `S.P`, `S.ctrl` and the line controls are never updated. The panel says "Not loaded … Nothing was changed" while the solver holds the loaded run.
- **Likelihood:** low (it needs an optimiser or dyn tick to throw while a load is queued behind it), but the failure is silent and the two sides then disagree.
- **Fixed 2026-10-24 (uncommitted):** with the L1 change the client fails a load only when `m.rev === loadRev`. Tests: "an error in a slice does not fail a load in flight" and "the error of a load fails it and frees both kinds". Also added: `solver.onerror` (the worker itself failing) releases every hold and fails a pending load, so the panel can't stay locked; test "a crashed worker fails a load…".

### Docs drift (all VERIFIED against code at `9955ccf`)

- [x] `ARCHITECTURE.md:5` says "the app in `index.html`"; the app is now in `src/app/`.
- [x] `ARCHITECTURE.md:17` lists `src/app` without `telemetry`. (The save/load commit added `runfile` and `physics-version` to that line but not `telemetry`.)
- [x] `ARCHITECTURE.md:68` says "(and the views use G)"; no view imports `G`, only `telemetry.js` does.
- [x] `ARCHITECTURE.md:224-226`: `CarInfo.curves` omits `rpm` (`describe.js:17`).
- [x] `ARCHITECTURE.md:247` says "built by `refreshDisplay`"; no such function exists. (The save/load commit edited this snapshot block to add `off` and left the heading.)
- [x] `ARCHITECTURE.md:257-258` is an empty code fence.
- [ ] `ARCHITECTURE.md:262-269` documents `DynCheck.result.dyn` as `{t, trace}`; it is the full `LapRun` (see L3). (Line numbers shifted by the new run-file section.)
- [x] `ARCHITECTURE.md:331` §9 item 4 ("No pose contract") is not ticked, although step 7 is done.
- [x] `ARCHITECTURE.md:452` cites "stale HUD gear digit (§12)"; that item is fixed (commit 0f3d61f) and no longer in §12.
- [ ] `src/solver/solver.js:3` header says everything emitted is a fresh copy and transferable; `dynResult` is neither (see L3).
- [ ] **New:** the run-file section of `ARCHITECTURE.md` says "Value-level car checks stay with `carSpec` in the worker"; `carSpec` checks type and finiteness and `slipPk>0` only (see M6).
- [x] **New:** `client.js`'s `sendLoad` comment said it "holds both kinds busy until the worker has answered"; the load's own `carInfo`/`track` events released the hold early. Now true (see M5). `ARCHITECTURE.md` §10.1 updated for the `error` `rev` and the load hold.

### Growth risks before steps 8 and 9

- [ ] **G1.** Move the camera out of shared app state (`S.cam`), and split the frame loop from map2d. `main.js` mixes map input, the frame loop and the lap readout. A second view needs a view-agnostic frame loop.
- [ ] **G2.** The track exists in three shapes: core `Track`, the `track` event, and `S.T`. §10.3's station record will need one canonical shape.
- [ ] **G3.** Presets are seeds. Elevation means bumping the generator version and regenerating goldens, and `tests/parity.test.mjs` gets deleted at that point (per CLAUDE.md). Run files store `ctrl`, not the seed, so they survive a generator change. They will also need the `RUN_VERSION` bump and migration that `runfile.js` already describes once `z` exists.
- [ ] **G4.** "Lap max" comparison is reachable only with a ghost pinned (`main.js:77`, `deltaRow` hidden). Check whether that is intended. Loading a run now pins a ghost, which makes it easier to reach.

## Test-quality notes

- **Strong:**
  - property and golden split, with a runtime guard (`golden-util.mjs:18`)
  - the gradient test measures error against `Σ|g·d|` and asserts that the yaw and shift branches actually bind (`gradient.test.mjs:47-55`)
  - parity against the prototype
  - solver tests drive real revisions and staleness
  - `lapExtremes` checked against brute force
  - new: the bit-for-bit load test, the state-unchanged-on-bad-input test, the freshness test for the physics hash, and the `liveHash` equivalence test
- **Gaps:**
  - the whole app layer (M4), now including the load handshake
  - solver paths: `setTrack keepLine:true` resampling, `run fresh`, `setLine`, a car change during polish (M2) and on a paused loaded run, `dynResult` copying, failure after state mutation (L4), out-of-range car values on `load` (M6)
  - degenerate tracks through `setTrack` (L2)
  - the gradient test uses one circuit and one direction per car

## Recent commits

- Original five (`ddc1299` and back): focused, well-measured; a real bug fix (`sizeChart` drawing at 2× height). Loose ends: M1, L5, L11, G4.
- `e4f467c` and `9955ccf` (save/load): the design is careful about exactness and atomicity, and the tests check both. The weak points are the client handshake (M5, L12), value validation (M6) and the lack of app-layer tests (M4).

## Suggested remediation order

Each phase should end with `node --test tests/` green and `golden.json` untouched. Regenerate `physics-version.js` in every commit that touches `core/`, `dynamics/` or `solver/solver.js` (see the constraint above).

1. **Now, app/tests/docs only (no hash change):**
   - ~~M1~~, ~~the M4 client test harness~~, ~~M5~~, ~~L1 with L12~~: done 2026-10-24, uncommitted (L1/L12 did change the hash, see the correction above)
   - still to do: L5, L9, L11 and the docs drift list
2. **Protocol ownership:** ~~M3~~ done 2026-10-24, uncommitted (see M3).
3. **Before anyone relies on run files:**
   - M6 (`carSpec` ranges, plus `load` tests); this touches `core/`
   - L2 (`buildTrack` rejects `L≈0`, shared by `setTrack` and `load`); this touches `core/`
   - L4 (make `setTrack`/`setCar` and the post-validation part of `load` atomic); this touches `solver.js`
4. **Optimiser:** M2 with the **revised** fix (seed from `Solver.pub`), plus the two tests (mid-polish, and paused loaded run).
5. **Cleanup:** L3, L7, and L8 if you want it documented.
6. **Before step 9:** G1–G3.
7. **Opportunistic:** L10.
