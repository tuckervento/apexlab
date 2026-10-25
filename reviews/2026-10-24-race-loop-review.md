# Code Review: race loop (race-mode phase 2, uncommitted)

## Metadata

| Field | Value |
|-------|-------|
| **Title** | Constant-grip multi-lap race loop and judge (`docs/race-mode.md` §5.2, §5.6, §8; phase 2 in §9) |
| **Repository** | local (no remote, no PR) |
| **Files** | new, untracked: `src/race/{race.js,judge.js,index.js,README.md}`, `tests/race.test.mjs`, `tests/check-race-mutations.mjs` |
| **Where it sits** | the main checkout `/Users/tucker/code/apexlab`, on branch `perf/illinois-load-tables` (another agent's branch, with its uncommitted `src/core/car.js`, `src/core/index.js`, `tests/elevation.test.mjs`) |
| **Reviewed** | 2026-10-24, Node v26.12.1, base `6ec9c5c` |

---

## Summary

A compact and mostly correct loop. It builds only on `createPlant` / `plantStep` / `observe` and the driver interface,
with no edits to `core/`, `dynamics/` or `src/drivers/reference.js`, and it stays out of the physics hash, as briefed.
The judge reads plant state and circuit geometry only, and crossings are interpolated inside the step.

**One verified Major bug** (R1): an incident reset that jumps past the finish plane loses a lap, and the race still
reports `complete: true`. The tests are thin exactly where the bug lives (the reset path), and that is why it survived.

**Recommendation: Request Changes.** Do R0–R3 below. R4–R8 are smaller and each states whether it is a fix or a
"document your choice".

## Verification performed

| Check | Result |
|---|---|
| `node --test tests/race.test.mjs` | 5 pass, 0 fail, 0.7 s (run against the other agent's in-progress `src/core/car.js`; see R0) |
| `node tests/check-race-mutations.mjs` | 4/4 mutations fail their targeted test, as intended |
| Probe: driver writes `ctx.dc.p.cda = 0` in `init` | throws (`car.spec` is frozen); lap times unchanged. **Not a leak**, no action needed |
| Probe: scripted spin at station 776/783 late in lap 2, `resetStations: 3` | reset to 779 (before the line); laps `[107.465, 111.864, 107.494]`: correct (5 s penalty, ~0.6 s of skipped track) |
| Probe: the same spin with `resetStations: 10` (reset lands on station 3) | laps `[107.465, 216.551, 107.466]`, `complete: true`: **one lap lost** (R1) |

Probe setup (all probes): GT racer, `setupPreset(core, 'GT racer')`, centreline line from
`new DynCheck(T, car, new Float64Array(T.N))`, `v = check.vq × 0.8`, `laps: 3`; `start = 32`, `N = 783`. The kicking
driver:

```js
let kicked = false;
const kick = { init: c => core.referenceDriver.init(c), step(s, o) {
  if (o.incident) kicked = true;
  if (!kicked && o.lap >= 1 && o.station >= N - 12 && o.station < N - 3) return { steer: 0.6, fx: 0 };
  return core.referenceDriver.step(s, o); } };
race(T, car, dc, line, v, { laps: 3, driver: kick, resetStations: 10 });
```

---

## Required changes

Work red before green: write each test, run it against today's code, watch it fail for the predicted reason, then fix
(`docs/review-remaining.md`, "Picking one up").

### R0. Move the work onto its own branch first

The files are untracked in the main checkout, which another agent is using for `perf/illinois-load-tables`. Its
`src/core/car.js` changes are uncommitted there, and the race tests import that same `src/`.
- Create a worktree off `main` (e.g. branch `feat/race-loop`).
- Move `src/race/`, `tests/race.test.mjs`, `tests/check-race-mutations.mjs` and this review into it.
- Remove them from the main checkout **only after** confirming the copies exist in the worktree.
- Do not touch the other agent's modified files.
- Rerun `node --test tests/` in the worktree and confirm `git diff --stat tests/golden.json` is empty.
- Stage files by name; `git add .` is forbidden.

### R1. A reset that jumps past station 0 loses a lap (Major, verified)

**Where.** `src/race/race.js:62-67`. The reset sets `idx = (idx + resetStations) % N` and re-places the car. The
crossing test (`race.js:42`, `:48`) needs `before <= 0` on a step, and after a reset from station ≥ `N − resetStations`
the car is already past the plane. So no crossing is recorded, and the next one is a full lap later. With the default
`resetStations = 3` this fires for incidents at stations N−3..N−1. That case follows from the same branch; it was
not provoked directly (the probe used `resetStations: 10`).

**Fix (pick one, and say which in the commit).**
- (a) **Score the crossing at the reset**: when the reset wraps past station 0 and timing has started (or is about to
  start), record a crossing at the incident time `t` and run the same lap bookkeeping as a normal crossing (lap
  summary, `driver.lap`, `penaltyAtStart`, the `lapTimes.length === laps` exit). Factor the bookkeeping into one local
  function rather than duplicating it.
- (b) **Never reset across the line**: clamp the reset station so it stops short of station 0.

(a) keeps the reset rule the same everywhere and is the recommendation. Either way, update the README sentence "A reset
jump cannot score a finish crossing" to say what now happens.

**Tests (red first).**
- A scripted incident near the end of a timed lap **with the default options**. Find a kick window that makes the
  incident land on N−3..N−1, and assert the station, so the test can't silently stop exercising the wrap. Then assert:
  - `lapTimes.length === laps`;
  - no lap is more than (normal lap + penalties + 1 s);
  - the lap times still sum to `total`.
- Add an entry to `check-race-mutations.mjs` that reverts the fix and must fail this test.

### R2. The reset test must assert exact penalties

**Where.** `tests/race.test.mjs:60`: `assert.ok(r.penalties>=5)` would pass if the incident penalty were charged twice.

**Fix.** Assert `r.penalties === incidentPenalty + trackPenalty × Math.floor(r.violations / warnings)` (with the options
the test uses), and add a mutation to `check-race-mutations.mjs` that charges the incident penalty twice
(`judge.penalties+=incidentPenalty` → `judge.penalties+=2*incidentPenalty`), which this test must catch.

### R3. Unit tests for the judge's classification branches

Only the edge-excursion counter has a direct test. `type: 'off'` (`over > 3`) and the velocity-against-tangent spin
(`angle > 0.45` with small sideslip) are untested. On the existing fake straight track in `race.test.mjs`:
- an offset 3.1 m beyond the usable edge gives `type: 'off'`;
- `psi = 0.5`, `vy = 0` (sideslip 0, so only the tangent test can fire) gives `type: 'spin'`;
- `vy/vx` with `|atan2(vy, vx)| = 0.5` and `psi = −atan2(vy, vx)` (velocity along the tangent, so only the sideslip test
  can fire) gives `type: 'spin'`;
- just under each threshold returns `null`.

Add one mutation per branch (e.g. `over>3` → `over>30`, `angle>0.45` → `angle>4.5`).

---

## Smaller changes

### R4. Reset state is half-scaled (fix or justify)

`race.js:20-23`, `initial(i, scale)`:
- `vx`, `vy` and `r` are scaled by `resetSpeed`;
- `delta: nom.delta[i]` and `axF: nom.ax[i]` are the full-speed nominal values;
- `ayF` uses the scaled `vx`.

The car recovered in the probe, but every driver inherits this arbitrary transient.
- Keeping `delta` is defensible: at fixed curvature, kinematic steer barely depends on speed.
- `axF` should be scaled consistently or set to 0.

Do that, or add a one-line comment saying why not. Don't change the `scale = 1` start: lap 1 must still match the
existing tests.

### R5. `obs.lap` can't tell the formation lap from lap 1 (fix)

`race.js:43`: `lap: lapTimes.length` is 0 both before the first crossing and during the first timed lap. Make it the
current lap number, with 0 meaning formation (`lapStart === null ? 0 : lapTimes.length + 1`), and document it in the
README. Check every use of `o.lap` in the tests (the probe above used `o.lap >= 1` to mean "after timed lap 1").

### R6. An off counts as a track-limit violation too (document)

`judge.js:15-22`: an excursion past 3 m increments `violations` (and can trigger the warning penalty) and then is also an
`off` incident with its own penalty. This is probably fine, but it is a rule. State it in the README's rule paragraph.
If you'd rather not double-charge, don't change it; flag it in your report for Q (it overlaps the open penalty-model
decision, `docs/race-mode.md` §10, item 2).

### R7. `summary.incidents` is cumulative (fix)

`race.js:53` passes every incident so far into each lap's summary. Pass only the ones whose `t` is after the previous
crossing (formation incidents go with lap 1, matching how their penalties are charged). Or keep it cumulative and rename
it `allIncidents`. A test should pin whichever you choose.

### R8. Tests for rules the README states

- **Formation penalties charged to lap one** (README line 17): a scripted incident before the first crossing; assert
  lap 1 carries the penalty and laps 2+ don't.
- **§8: lap 1 against a lone `dynLap` at the same plan differs only by the start.** Compare the race's first timed lap
  with `dynLap(T, car, dc, line, v, false).t` (same `v`, constant grip). Measure the difference first, then set the bound
  from the measurement (`docs/deferred.md`, "Lessons to keep": measure before setting a bound).
- **Station 53** in "scripted steering gives exactly one incident" (`race.test.mjs:36`) is a per-runtime value. Add a
  comment saying it is a golden for this V8, as `golden.json` values are.

---

## Optional (no action required)

- `start === 0` gives a zero-length formation (`before = 0` gives a crossing at `t = 0`). Harmless at constant grip; it
  matters once warm-up exists (§5.10). Note it in the README if you like.
- `maxTime = 900 × (laps + 1)` allows hours of simulated time for a stuck car. A no-progress cut-off (no station
  advance in 30 s gives a DNF) would end hopeless runs sooner. Leave it unless it is cheap.
- `Math.ceil(maxTime/dt)` is evaluated every iteration (`race.js:40`); hoist it.
- The straightest-station search and the nominal initial state are copied from `dynLap`. This is the second copy, so
  leave it (three examples before extracting).

## Constraints (unchanged from the brief)

- No edits to `src/core/`, `src/dynamics/` or `src/drivers/reference.js` (the `PHYSICS` and `DRIVER` hashes must not
  move: in the worktree, `node tests/make-physics-version.mjs` without `--write` must print `committed file is current`).
- `src/race/` stays out of the physics hash in this phase.
- No DOM and no module-level mutable state in `src/race/`.
- `node --test tests/` passes, and `git diff --stat tests/golden.json` is empty.

## Done when

- R0–R3 are done, and each new test was seen failing on today's code before the fix.
- R4–R8 are each fixed, or documented as stated.
- `node --test tests/race.test.mjs` and `node tests/check-race-mutations.mjs` pass, with every new mutation reported as
  an expected failure.
- Report back: which R1 option you chose, the measured lap-1-vs-`dynLap` difference (R8), and anything you flagged
  for Q (R6).


## Resolution (2026-10-24)

R0: moved the named artifacts to branch `feat/race-loop`, worktree
`/private/tmp/apex-race-loop`, based on `main` at `6ec9c5c`. Verified copies before
removing the originals; no other branch's source files were edited.

R1: chose option (a). A wrapping reset records the crossing at incident time using
shared lap bookkeeping. Crossing rearming prevents a reset onto station zero from
counting twice. Default-reset regression trajectories pin incident stations 781
and 780 (N = 783). The lost-lap assertion failed before the fix; the exact-zero
case separately failed its lower lap-time bound before the rearming fix.

R2–R3: exact penalty assertions and isolated off, tangent-spin and sideslip-spin
classification tests are covered by mutations. These existing classification
branches already passed their direct tests; disabling each branch produces the
expected assertion failure. Doubling the incident penalty fails the reset test.

R4: reset longitudinal load transfer starts at zero; nominal steering is retained
for the same curvature. Full-speed rolling-start initialization is unchanged.
R5: observations number formation as zero and timed laps as 1..N.
R6: documented that an off also counts toward track-limit penalties. This preserves
the existing rule; penalty calibration remains Q's open decision.
R7: summaries contain incidents for that lap only, with formation assigned to lap
one. R8: formation penalties and summaries are tested; station 53 is marked as a
runtime golden. Measured on Node v26.12.1: first timed lap 107.46541408341261 s,
lone dynLap 107.40800000003934 s, difference +0.05741408337327414 s; bound 0.1 s.

The lap-number/formation regression failed on the original implementation. Mutation
checks additionally pin per-lap incident slicing and reset-crossing rearming.
