# Remaining work from the progress review

What is left of the findings in [`reviews/2026-10-23-progress-review.md`](../reviews/2026-10-23-progress-review.md), re-checked
against commit `b12517d` (2026-10-24, after elevation landed). That file keeps the evidence, probe results and the full
history of each finding; this one is the work list, with current file:line references, a fix, and how to verify.
Items set aside on purpose for other reasons (2.5D map, banking, hilly speed, saved-run gaps) are in
[`deferred.md`](deferred.md), not here.

**Baseline:** `node --test tests/` gave 203 tests, 203 pass, 0 fail, 26.3 s at `b12517d` (Node v26.12.1).

**Not covered.** The review looked at the code up to `ddc1299`, then at the save/load commits. It did **not** review the
elevation work (migration step 8, `f115053`..`b12517d`: track heights, load-factor grip tables, the hilly lap model, run
files v2, the Hills UI). Treat that code as unreviewed. Where a finding below touches code elevation changed, the line
references were re-read; nothing else in those files was.

## Already done (for context)

| Finding | Fix | Commit |
|---|---|---|
| M1 dyn label sticks at "running" | `dynProgress` applied only while a check runs | `b1d4c6f` |
| L1, L12 error ends the wrong command or a load | `error` carries the failing command's `rev`; the client matches it | `7ee8c2a`, `b1d4c6f` |
| M5 edit during a load diverges solver and panel | load holds both kinds until `loaded`; sections `inert` meanwhile | `b1d4c6f` |
| M3 `running` has several owners; frame error doesn't pause | worker owns it, `S.running` mirrors `progress`; `resume` flag on `setCar`/`setTrack` | `b98ddd0`, `3a90158` |
| M4 (part) app layer untested | `tests/client.test.mjs` covers `client.js` | `b1d4c6f`, `3a90158` |
| L2 (part) zero-length circuit | `load` refuses it; `setTrack` still doesn't (see L2 below) | `e4f467c` |

## Needs a person at a browser first

`controls.js`, `main.js` and the panel lock can't run under Node, so these were never exercised. Do them before relying on
the phase 1 and 2 changes (they are the first thing to check if the app misbehaves after pulling).

1. Page loads and starts searching; the button reads "Pause"; the status chip walks the stages.
2. Pause, then Run: the label follows within a frame or two. At convergence the button reads "Search again".
3. Converged, then drag a car slider (also right as it converges): the search restarts each time.
4. Circuit preset, "New random" and the width slider each restart the search. Editing the shape keeps it paused (the button
   reads "Run" while editing, which is new); "Done editing" resumes it.
5. Export a run, then Load run: the car, circuit and saved-runs sections dim and ignore input until the "Loaded…" note
   appears, then unlock; the search stays paused. Load as ghost on a different circuit locks and unlocks the same way,
   and searches.
6. A file with a car field deleted shows the reader error and never locks the panel.
7. Dynamic check: the search pauses; changing the car ends the check, resets the label to "not run", and resumes.

A frame-loop error can't be provoked from the UI. The fix is one line (`main.js`, the `frame()` catch sends `pause`), reviewed
by reading only.

## Summary of what is left

"Hash" = the fix edits `core/`, `dynamics/` or `solver/solver.js`, so `node tests/make-physics-version.mjs --write` is
needed in the same commit (`CLAUDE.md`). **No fix here may change a golden**: every one is a validation, bookkeeping or
robustness change, and a `golden.json` diff means something went wrong.

| ID | Item | Severity | Size | Hash? | Order |
|---|---|---|---|---|---|
| M6 | `carSpec` doesn't range-check; a run file can feed in `mass: 0` | Medium | S | yes | 1 |
| L2 | `setTrack` still publishes a NaN lap for a zero-length circuit | Low | S | yes | 1 |
| L4 | `setTrack`/`setCar`/`load` can fail after they start changing state | Low (suspected) | S–M | yes | 2 |
| M2 | A car change mid-polish seeds the re-score from a rejected line | Medium (small effect) | S–M | yes | 3 |
| L3 | `dynResult` isn't a copy and is much bigger than documented | Low | S | yes | 4 |
| L7 | `STAGES` is exported unfrozen | Low | XS | yes | 4 |
| L5 | A ghost can be pinned on the previous circuit's stations | Low (suspected) | S | no | 2 |
| M4 | The rest of the app layer has no tests | Medium | M | no | 3 |
| L10 | The same convergence runs several times in the suite | Low | S | no | any |
| L8 | An adjoint nit that can't be reached | Low | XS | maybe | any |
| L9, L11 | Dead code; DOM refs stored on shared constants | Low | XS | no | any |
| — | Docs drift (3 of 11 left, all waiting on M6 and L3) | Low | S | no | any |
| G1, G2 | Camera lives in app state; three shapes of the track | Growth | M | no | before 3D |

Suggested order: **M6 + L2 together** (both are "a hand-edited run file or a bad circuit reaches the solver and nothing
says no"; one new test next to the existing `load: bad input` test covers both), then **L4 + L5** (state that can end up
half-changed or mismatched), then **M2 with M4** (M2's test needs the paused-loaded-run case), then the cleanups.

---

## M6. Range checks in `carSpec` (Medium, hash)

**Why.** `carSpec` accepts any finite number. A run file's reader checks that the car's *fields* are exactly the expected
set, not their values, so `Solver.load` accepts values the sliders never allow and publishes the result with no `error`
event. Measured on the GT racer, Harrow Ring (`probe5.mjs` in the review's scratchpad; re-run it on the current solver
before trusting these numbers, since elevation changed `buildCar`):

| Override | Lap published | `loaded` fired |
|---|---|---|
| `mass: 0` | NaN | yes |
| `mass: -500` | 31106.99 s | yes |
| `wb: 0` | 174.16 s | yes |
| `gears: 0.4` | 95.72 s (clamped to 1 gear) | yes |
| `mu: -1` | 10429.47 s | yes |

**Where.** `src/core/units.js` (`carSpec`: finiteness plus `slipPk>0` only). Silent clamps hide the rest:
`Math.max(1,p.vBase)` (`src/core/powertrain.js:13`), `Math.max(1,Math.round(p.gears))` (`:18`), `Math.max(0.3,p.yawDI)`
(`src/dynamics/bicycle.js:20`) and `genCtrl`'s rectangle fallback after its 200-attempt loop (`src/core/track.js:73`).
`ARCHITECTURE.md:295` says "Value-level car checks stay with `carSpec` in the worker"; today that is not true.

**Approach.** Throw from `carSpec` with the field, the value and the allowed range, for: `mass`, `track`, `wb`, `cg` > 0;
`mu` > 0; `sens` ≥ 0; the percentage fields inside (0, 100) or the range the sliders use; `gears` an integer ≥ 1 for ICE;
`yawDI` > 0. Take the bounds from the slider `SPEC` in `controls.js` so UI and core agree (the sliders are the only
inputs that ever worked); decide whether to import them or restate them in `units.js` (core can't import app). Then the
clamps in `powertrain.js` and `dynamics/bicycle.js` are unreachable and can become assertions or go. Keep `carSpec`'s operation order
(the header says the conversions are bit-exact with the prototype).

**Interaction.** [`deferred.md` A10](deferred.md#a10-needs-load-tables-checked-at-the-boundary) is the same idea for
"hilly circuit needs a car built with loads": one boundary-validation pass could do both.

**Verify.** Extend `tests/runfile.test.mjs`'s "bad input leaves car, track, line and revisions as they were" with
`mass: 0`, `mass: -500`, `gears: 0.4`, `mu: -1`: each must give exactly one `error` and unchanged state. All 24 flat goldens
and the hilly ones must still pass untouched. Also check every preset car and every `SPEC` slider min/max passes.

## L2. Zero-length circuit through `setTrack` (Low, hash)

**Why.** `load` refuses `T.L > 0` being false (`src/solver/solver.js:89`), with a comment saying `buildTrack` reports this
neither by throwing nor in `T.issue`. `setTrack` has no such check, so `rebuildTrack` with all control points in one place
still publishes `L = 0`, a NaN lap and non-finite `v`/`tc`, with no `error` event. Hard to reach from the UI (the handles
can't be dragged together exactly), but loading is not the only way in: hand-written circuit data is.

**Approach.** Move the check into `buildTrack` (`src/core/track.js`, after `L` is computed) and throw, so `setTrack`, `load`
and any future caller share it; drop the duplicate in `load`. Add a finiteness assertion on the lap in `publish` as the last
line of defence.

**Verify.** A `setTrack` test with coincident control points expects one `error` and unchanged state (mirror the `load` test).

## L4. Half-changed state after a post-validation failure (Low, suspected, hash)

**Why.** `load` builds and validates everything before assigning (tested). But it then assigns `this.car`, `this.T`, `this.B`
and the revisions, emits `carInfo` and `track`, and only then runs `opt.setup`, `computeRef` and `publish`
(`solver.js:86`..). If one of those threw, the solver would hold the new car and track with the old `off`/`opt`, and the
client would say "Not loaded … Nothing was changed", which would then be false. `setCar` (`:62`) and `setTrack` (`:72`) have
the same shape: elevation made `setTrack` build the hills-aware car before it mutates anything, which helps, but
`makeBounds`/`resetLine` still run after the assignments. Nothing tried made any of them throw.

**Approach.** Compute `B`, the optimiser setup and the reference lap into locals (or on a scratch `Optimizer`), then assign
and emit in one block that can't throw. Or, if that costs too much, make the failure honest: on a post-assignment throw,
restore the previous fields from a saved copy.

**Verify.** Make `opt.setup` throw (patch the instance in a test, as `tests/solver.test.mjs` does for `opt.step`) during a
`load`, a `setCar` and a `setTrack`, and check the previous car, track, line and revisions are all still there. Watch how this
interacts with [`deferred.md` A8](deferred.md#a8-merge-the-flat-and-hilly-code-paths) if the flat/hilly paths are merged
first; both edit the same few lines.

## M2. Re-score seeded from a rejected polish candidate (Medium, hash)

**Why.** During the polish stage `Optimizer.off` holds the last candidate tried, even when it was rejected
(`src/core/optimiser.js:58`). `rescore` seeds from it (`:23`: `this.target=Float64Array.from(this.off)`), so a car change
mid-polish publishes a stage-3 fit of a rejected line. Measured: the first rejected try left `off` up to 0.13 m from the
accepted line, laps 78.8303 s accepted against 78.8547 s rejected. The effect is small (stage 3 smooths it) but it breaks
"only accepted lines are published".

**Do not** use `this.current(...)` as the seed: it returns the coarse stage-0 spline fit until the search converges
(`optimiser.js:61`), so on a **paused loaded run** a car change would replace the exact loaded line with that fit. `load`
restores the exact line with `off.set(line)` after `setup` for exactly this reason.

**Approach.** Seed from `Solver.pub`: it is the last accepted line, and after a load it is the exact loaded line
(`solver.js`: `publish(true)` sets `pub = opt.current(...)`, `load` sets `pub = line`). Give `rescore` a seed argument
(`rescore(car, B, seed)`) and pass `this.pub` from `Solver.setCar` (`solver.js:70`).

**Verify.** Two tests, each red before the fix:
1. Car change mid-polish: the published line is a spline fit of the accepted line, not of the rejected candidate (the
   existing test compares `pub === spl(c)`, which holds trivially after a refit, so it can't catch this).
2. Car change on a paused loaded run: the published line is still the loaded line, to within what the stage-2 refit allows.

## L3. `dynResult` payload (Low, hash)

**Why.** `solver.js:42` emits `d.result` as it is: no copy, no transfer list, and the whole `LapRun` (`stV`, `stE`, `trouble`, `trace`, …;
the reviewer measured about 1.3 MB as JSON for GT on Harrow at `ddc1299`, with a 17-array `nom` that this check did not find in
the `LapRun` return at `src/dynamics/bicycle.js:148`; re-measure before trusting the size). `ARCHITECTURE.md` §7 documents only `{t, trace}`,
and `src/solver/solver.js:3` says everything emitted is a fresh copy. In the browser structured clone copies it anyway, so
nothing is wrong yet. Run files store only `frac`, `t`, `umax`, `uaxle` and `fail`, so exports aren't affected.

**Approach.** Decide what the app reads (grep `S.dynRes` and `dynTrace` use in `controls.js`, `main.js`, `playback/pose.js`),
send only that as fresh copies with a transfer list, and document the shape. Or document the real shape and fix the header
comment. Either way add `dynResult` to the "emitted arrays are copies" test.

## L5. Ghost pinned on the wrong station set (Low, suspected, app)

**Why.** `#pinBtn` (`src/app/controls.js:143`) copies `S.disp` into the ghost and takes `wb`/`track` from `S.P`. After a
circuit change the ghost is cleared, but the button can pin the old circuit's `disp` before the new snapshot arrives, giving
a ghost with the old N against the new circuit: `stationPose` and the gap chart then index out of range and draw NaN. It also
throws if `S.disp` is null, and `S.P` may already differ from the snapshot's car. The load paths use `ghostFrom`, which
checks the station count and telemetry channels but not `trackRev`, so it can't tell two circuits with the same N apart (the
same-circuit fast path uses `ctrlEqual`, which can).

**Approach.** Store `carRev` and `trackRev` on the ghost (from `S.disp`) and have the code that consumes it ignore a ghost
whose `trackRev` isn't the displayed one. Disable the Pin button while `S.disp` is null or not `settled()`
(`client.js` exports it).

**Verify.** Needs a controls-level test (see M4) or a browser check: pin, change the circuit, and click Pin again before the
new snapshot lands. Related: [`deferred.md` B2](deferred.md#b2-ghost-from-a-run-whose-station-count-changed).

## M4. The rest of the app layer is untested (Medium, app)

`tests/client.test.mjs` (10 tests, see "Already done") covers `client.js`'s command handling. Still untested:
- `client.js`: `onSnapshot`'s stale and step-back rules, the `pendingT` swap, `dynCurrent`.
- `controls.js`: `loadPicked`, `loaded()`, `exportRun`, the panel lock, `carChanged`/`rebuildTrack` (the `resume` flags).
- `telemetry.js`: `tagText`, `renderTelemetry`. `main.js`: the frame loop.

`controls.js` runs a `fetch` at import (`liveHash` for the physics hash), which logs an error under Node but doesn't break;
`main.js` needs a DOM and `requestAnimationFrame`. The practical route is to make `controls.js` testable by guarding the
fetch (or injecting it) and extending the fake `document` in `tests/client.test.mjs`; do `onSnapshot` first, since the
revision rules are what the architecture leans on.

## Small items

- **L7.** `export const STAGES=[` (`src/core/optimiser.js:10`) is unfrozen; every other shared constant (`DYN`, `CARS`,
  `TRACKS`) is frozen. `Object.freeze` it and each stage. Hash.
- **L8.** `v[i]=Math.max(0.1,r)` (`src/core/lap.js:148`) isn't mirrored in the reverse pass. Unreachable in practice (speeds
  are floored by `VSTEP`/the backward pass), and elevation added a `stall` counter for stations at that floor (`lap.js:23`).
  Document it at the line; if the adjoint is ever touched, re-check against central finite differences (≥4 sig figs, hard
  and `tau > 0`, flat and hilly) and regenerate the hash.
- [x] **L9.** Dead code: the `convCap` line in `main.js` and `(cw<560?0:0)` in `map.js` are removed (both were already in
  the initial commit, so they never did anything). `drawConv`'s null-gap handling (`charts.js`) was checked and **kept**:
  nothing pushes a null into `S.hist` (the only writers push `[evals, t]` or reset to `[]`), but the pen-up marker is part
  of that pure view's input contract, so it is unreachable from today's callers only.
- [x] **L10.** The GT/Harrow convergence ran three times (`convergence.test.mjs`; `solver.test.mjs` "converges" and
  "publishes only accepted"), about 8 s each, and `runfile.test.mjs`'s bit-for-bit load test compares against the same
  golden. `solver.test.mjs` now runs it once: `converged()` installs the accepted-lines check as an observer on the shared
  run and the test reads its tally (same check, same 20 ms ticks; with a solver that publishes `opt.off` it still fails,
  119 of 137 snapshots flagged). `solver.test.mjs` went from 22.4 s to 12.7 s. `convergence.test.mjs` keeps its own run
  (it tests the optimiser without the solver), and the runfile test is untouched.
- [x] **L11.** `telemetry.js` stored DOM refs on the shared row constants (`r.tr=…`, `r.c=…` in `build`, `:60`). Now the
  built table holds them in a per-table `cells` array (`built = {rows, cells}`). Checked by driving the old and new module
  through the same ten `renderTelemetry` calls against a recording fake DOM: identical writes.

## Docs drift (all re-checked at `b12517d`)

Line numbers are for `ARCHITECTURE.md` unless noted.

- [x] `:5` says "the app in `index.html`"; the app is in `src/app/`.
- [x] `:17` lists `src/app` without `telemetry`.
- [x] `:69` says "(and the views use `G`)"; no view imports `G`, only `telemetry.js` does.
- [x] `:240` `CarInfo.curves` omits `rpm` (`src/core/describe.js`). Not re-read after elevation.
- [x] `:266` says the snapshot is "built by `refreshDisplay`"; no such function exists.
- [x] `:276` is an empty code fence.
- [ ] `:300` `DynCheck.result.dyn` is documented as `{ t, trace }`; at runtime it is the whole `LapRun` (also `stV`, `stE`, `trouble`, …; `src/dynamics/bicycle.js:148`) (L3).
- [x] `:353` §9 item 4 ("No pose contract") isn't ticked, although migration step 7 is done.
- [x] `:474` cites the "stale HUD gear digit (§12)"; that item is fixed (`0f3d61f`) and is no longer in §12.
- [ ] `:295` says "Value-level car checks stay with `carSpec` in the worker"; they don't (M6).
- [ ] `src/solver/solver.js:3` says everything emitted is a fresh copy and transferable; `dynResult` is neither (L3).

## Growth: before the 3D view (migration step 9)

- **G1.** `S.cam` is a map2d `Camera` held in app state (`src/app/state.js:6,19`), so `S` depends on one view. A second view
  needs it out of `S`, and a frame loop that isn't tied to map2d (`main.js` mixes map input, the loop and the lap readout).
  [`deferred.md` A1](deferred.md#a1-25d-tilted-map) (2.5D map) is a stepping stone and will hit this first.
- **G2.** The track exists in three shapes: core `Track`, the `track` event, and `S.T`. Elevation added `z`, `dz`, `cth`,
  `kv` and `flat` to the first; check what the event and `S.T` carry before adding more. §10.3's station record would be the
  one canonical shape. Not re-checked after elevation.
- **G4.** The "Lap max" telemetry comparison was reachable only with a ghost pinned (`deltaRow` hidden). Loading a run now pins
  one, which makes it easier to reach. The code has moved since; re-check whether the original constraint still holds.

---

## Picking one up

1. Re-check the line references (they drift; this file is pinned to `b12517d`), then turn the item into a plan
   (`/draft-plan` or plan mode).
2. One test at a time, **red before green**: write the test, run it against the unfixed code and see it fail for the
   predicted reason, then fix. For tests that guard physics, break the thing in an `APEX_SRC` copy and watch the test fail
   (`tests/load-core.mjs`; [`deferred.md`, "Lessons to keep"](deferred.md#lessons-to-keep-from-step-8)).
3. After any edit to `core/`, `dynamics/` or `solver/solver.js`, run `node tests/make-physics-version.mjs --write` and commit
   `src/app/physics-version.js` with it. The diff should be the hash line only.
4. `node --test tests/` must pass, and `git diff --stat tests/golden.json` must be empty. Flat physics stays bit-identical:
   put new terms in their own branch, never as zero-valued additions.
5. Tick the item in `reviews/2026-10-23-progress-review.md` and delete or update it here.
