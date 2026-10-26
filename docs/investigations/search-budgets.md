# Search budgets: task 5.1 measurement

Status: **proposals awaiting Q approval**; no tests or production files changed. This is calibration on one
machine/runtime, not a performance target or evidence of portability to other V8 builds. No assertions were
removed, so the deletion ledger is unchanged. Do not use the proposed numbers for task 5.2 until Q approves them.

Measured on local date 2026-10-25 (UTC 2026-10-26), source commit
`90642ee4816fd92891a5b38823dbc20449cb9542`, with `git diff -- src` empty.
`node -v`: **v26.12.1**; `process.versions.v8`: **14.6.202.34-node.40**; CPU: **Apple M3**.
Every run below used that runtime and CPU. Load averages are sampled immediately before module loading and
setup, in 1/5/15 minute order. Timing is measured with `performance.now()`, in seconds.

## Method and scope

The retained script is [measure-search-budgets.mjs](measure-search-budgets.mjs). From the repository root:

```sh
node docs/investigations/measure-search-budgets.mjs
node docs/investigations/measure-search-budgets.mjs --only=first,noPolish,stall,reject,evals,steps,delay --check
```

Each run is a fresh child process with its own temporary copy of `src/` and `APEX_SRC` set to that copy.
The parent removes the copy in `finally`, including when a check fails. No mutation touches the worktree source.
The script is outside Node test discovery, uses no dependencies, and emits JSON rows with unrounded values.
`--check` expects each fault to exit 1 with its named assertion; healthy runs must exit 0. The measurement harness
has separate emergency guards (500,000 steps, 175 s between calls, 180 s subprocess timeout). These are not the
proposed search contracts. The delayed probe is deliberately allowed to finish so its wall time can be measured.

Direct runs start from station-wise `min(hi,max(lo,0))`, as in `convergence.test.mjs`. Fixture car parameters equal
the preset exactly. Fixture flat control points have explicit zero heights; after normalizing that representation,
controls and every computed track field match `genCtrl(TRACKS[0].seed,12)` / `buildTrack` exactly. N = 783.
The fixture geometry guard remains active. Reference offsets are checked feasible at every station, without
clamping or optimizing the reference. Both centreline and fixture reference use separate fresh `makeScratch(N)`
instances. These are authored input lines scored under the current model, not historical expected lap times.

Direct timing covers `Optimizer.setup`, all `step()` calls, `current()`, and `exactLap()`; the existing test stops
its timer just before `exactLap()`. Protocol timing covers construction, boot (`setCar`, `setTrack`), `run`, all
20 ms `tick()` calls and final publication. Intermediate snapshots are counted but discarded; there is no
accepted-line observer in this measurement. Steps count every `Optimizer.step()` call, including false returns
and stage transitions, exactly as the direct test does. Evaluations are `opt.evals`: objective evaluations,
excluding fresh reference/result scoring and Solver's snapshot scoring. They are not a total physics-call count.
Stage counts are visited spline stages; polish is listed separately (five plus polish means six phases).
Stage count, exact evaluation count, exact step count and polish presence are diagnostics, not proposed equality
requirements. Final re-scoring happens outside the timer with a new scratch, without calling `exactLap()` to
obtain the independent score. The direct reported lap is `exactLap()`; protocol reported lap is the final snapshot.

The full Node suite ran concurrently with protocol run 3 and part of the hilly run. This is reflected in their
wall times and subsequent load averages; the other timings were not rerun to erase contention.

## Healthy runs and quality

For flat GT racer / Harrow Ring, every run measured:

- `centreLap = 85.78787570797407 s`.
- `referenceLap = 78.37714547025213 s`, from `fixtureCase('GT racer|Harrow Ring')`.
- Denominator `centreLap - referenceLap = 7.4107302377219355 s`: meaningfully positive; the harness requires > 1 s.
- Final independently scored lap `78.37714547025213 s`; gain **1.0**.
- `fresh resultLap - reportedLap = 0 s` for every direct and protocol run.
- Five spline stages, followed by 75,650 polish trials; 78,063 evaluations and 76,851 step calls.

| Run | UTC start (2026-10-26) | Load 1/5/15 min | Evals | Steps | Stages + polish | Wall s | Result lap s | Gain |
|---|---|---|---:|---:|---|---:|---:|---:|
| direct 1 | 02:35:22.102 | 2.387695/3.168945/3.537598 | 78,063 | 76,851 | 5 + yes | 8.252866 | 78.377145470252 | 1.000000000000 |
| direct 2 | 02:35:30.462 | 2.555176/3.179199/3.536621 | 78,063 | 76,851 | 5 + yes | 8.141215 | 78.377145470252 | 1.000000000000 |
| direct 3 | 02:35:38.710 | 2.696777/3.188965/3.535645 | 78,063 | 76,851 | 5 + yes | 8.221068 | 78.377145470252 | 1.000000000000 |
| protocol 1 | 02:35:47.038 | 2.720703/3.185547/3.532227 | 78,063 | 76,851 | 5 + yes | 8.259086 | 78.377145470252 | 1.000000000000 |
| protocol 2 | 02:35:55.419 | 2.763184/3.178711/3.525391 | 78,063 | 76,851 | 5 + yes | 8.008611 | 78.377145470252 | 1.000000000000 |
| protocol 3 | 02:36:03.537 | 2.645020/3.139160/3.506836 | 78,063 | 76,851 | 5 + yes | 14.288281 | 78.377145470252 | 1.000000000000 |
| 25 m hills | 02:36:17.977 | 8.255859/4.329590/3.922852 | 72,001 | 70,298 | 5 + yes | 21.176494 | 78.454149578501 | 1.000000000000 |

| Timing series | Min s | Median s | Max s |
|---|---:|---:|---:|
| direct (3 runs) | 8.141215 | 8.221068 | 8.252866 |
| protocol (3 runs) | 8.008611 | 8.259086 | 14.288281 |

The protocol runs had 137, 133 and 230 snapshots respectively. Their endpoint, evaluation count and step count
agree despite different publication density and elapsed time.

## Distinct candidate: GT racer / Harrow Ring, 25 m hills

The single candidate in the healthy table uses `fixtureCase('GT racer|Harrow Ring · hills 25 m')`, with load tables
built explicitly. It reached five spline stages plus 69,446 polish trials. `T.flat` is false and all 783 stations
have nontrivial grade cosine or vertical curvature. Consequently the gradient evaluations in the spline stages
exercise `vCornerN`, load-table interpolation, speed-dependent load derivatives and gravity/3D step branches in
`src/core/lap.js:90–108,118–150,179–209`, which the flat case bypasses. The search staging itself is the same.

Centreline = `85.83444232922025 s`; reference = `78.45414957850122 s`; denominator =
`7.380292750719036 s`. Fresh result = reported result = `78.45414957850122 s`, difference `0 s`, gain `1.0`.
Final scratch warnings are stall = air = ntop = 0, as for the flat results. This is evidence for hilly gradient
paths, not a load-clamp stress test; no claim is made about clamps during intermediate trials.

**Recommend including one direct hilly convergence case**, retaining the flat direct and protocol runs. It adds
an algorithmic path without a preset search matrix. One timing is a pilot, not a measured timing distribution;
the proposed bounds admit it, but quality-fault calibration below applies to the flat case only.

## Fault definitions (original source line numbers)

All mutations below are in disposable `APEX_SRC` copies of `src/core/optimiser.js`:

| Fault | Location and exact policy change | Why it is a fault probe |
|---|---|---|
| First stage only | :74, replace the target assignment at entry to `advance()` with `evalc(c,null)`, final clamp, `done=true`, return false | Stops at the first stage boundary; re-evaluation/clamping prevents a stale rejected trial from defining the endpoint. |
| Skip polish | :76, before allocating polish, re-evaluate accepted coefficients, clamp, mark done and return false | Runs all five spline stages but omits local search. |
| Stall threshold halved | :108, `this.stall>12` → `this.stall>6` | Advances earlier after consecutive improvements below 20 microseconds. There is no per-stage iteration limit; this substitution was approved by the user. It means 7 rather than 13 consecutive small improvements. |
| Never accept | :100 and :85, replace both acceptance predicates with `false` | Rejects line-search steps and polish bumps. Restoring accepted coefficients is left intact. |
| No-op step (pilot) | :80, return false immediately | No progress; pilot stopped externally after 40,001 calls. Not used to demonstrate the proposed step budget. |
| Redundant evaluations | :84, call `evalc(c,null)` twice more before each existing polish evaluation | Real wasted objective work, with the same candidates and endpoint. |
| Two idle calls per step | :80, increment a new per-instance counter, return false except on every third call | Lost progress without added evaluations; same endpoint after three times the calls. |
| Stalled final step | :87, after final clamp, busy-wait 121,000 ms before setting done | Models a long synchronous step that prevents a timer callback from firing. It preserves the endpoint and counts. |

Exploratory fault measurements (all fresh re-score differences = 0 s):

| Run | UTC start (2026-10-26) | Load 1/5/15 min | Evals | Steps | Stages + polish | Wall s | Result lap s | Gain |
|---|---|---|---:|---:|---|---:|---:|---:|
| First stage only | 02:36:39.587 | 7.771973/4.482910/3.987305 | 523 | 176 | 1 + no | 0.169436 | 81.901594998282 | 0.524412653683 |
| Skip polish | 02:36:39.861 | 7.771973/4.482910/3.987305 | 2,413 | 1,201 | 5 + no | 0.608457 | 78.830286618649 | 0.938853374248 |
| Stall threshold halved | 02:36:40.577 | 7.771973/4.482910/3.987305 | 73,900 | 72,850 | 5 + yes | 7.927680 | 78.396141294130 | 0.997436713621 |
| Never accept | 02:36:48.614 | 6.964355/4.416992/3.969727 | 3,137 | 3,006 | 5 + yes | 0.359986 | 85.787875707974 | 0.000000000000 |
| No-op step (pilot) | 02:36:49.078 | 6.964355/4.416992/3.969727 | 1 | 40,001 | 1 + no | 0.007094 | 85.787875707974 | 0.000000000000 |

The no-op pilot did not converge; all other exploratory faults did. The pilot was replaced by the completed
idle-call probe for budget evidence. This avoids confusing a measurement cutoff with a failed budget.

## Proposed bounds, pending Q

- **Minimum gain 0.9987**, with no upper gain bound. The nearest measured broken result is the halved stall
  threshold, gain `0.9974367136208643`, a loss of `0.0189958238778 s` from the healthy endpoint. The midpoint of
  that gain and 1 is `0.9987183568104322`; 0.9987 is its rounded proposal. Healthy margin is **0.0013 gain**, or
  **0.009633949309 s**; the nearest fault misses by **0.001263286379 gain**, or **0.009361874569 s**. This narrow
  margin is the price of separating that mild path change. It is not evidence of a portable margin across
  runtimes, nor a reason to require historical offsets or polish itself. A better feasible result always passes
  quality. If Q wants a broader quality allowance, the halved stall threshold cannot be claimed as caught by it;
  that tradeoff should be explicit rather than padding the minimum until all selected cases pass.
- **At most 160,000 objective evaluations and 160,000 `step()` calls**, with convergence required. These are
  roughly twice the measured healthy values, rounded to a common ceiling: 2.04963× evaluations and 2.08195× steps.
  Remaining headroom is **81,937 evaluations** and **83,149 steps**. The multiplier allows substantial trajectory
  changes in the deterministic polish search while detecting the threefold work/progress probes. A 3× allowance
  would admit both probes; 1.5× would consume more headroom without distinguishing an additional measured fault.
  This is an explicit policy choice from these observations, not a statistically established runtime envelope.
  Counts must become diagnostics, not exact expected values. No minimum count is proposed.
- **120 s wall-clock watchdog per convergence run**, for hangs. This is 8.40× the slowest flat protocol run under
  contention, 14.54× the slowest direct run, and 5.67× the hilly pilot. It is deliberately looser than the work
  budgets, not a speed requirement. Retain an outer test timeout and check elapsed time between steps/ticks;
  a synchronous infinite loop requires an external process/worker watchdog because Node timers cannot interrupt
  it. The probe finishes after its stall and fails the elapsed-time assertion, demonstrating the bound without
  pretending that an in-process timer can pre-empt it.

Do not require exact stage count, equal offsets, fixed polish count or monotone intermediate lap times.
Feasibility and independently scored final-lap correctness remain separate requirements for task 5.2.
The observed zero re-score difference is diagnostic, not a proposal to require cross-runtime bit equality.

## Bound checks and mutation teeth

The following second series ran with `--check`. Each fault subprocess exited 1 with an intended `AssertionError`;
no import, syntax, runtime-version or hash failure was accepted. The parent expected those failures and exited 0.
Each row's fresh re-score difference was again exactly 0 s.

| Run | UTC start (2026-10-26) | Load 1/5/15 min | Evals | Steps | Stages + polish | Wall s | Result lap s | Gain |
|---|---|---|---:|---:|---|---:|---:|---:|
| First stage only | 02:37:45.681 | 3.669434/3.916992/3.810059 | 523 | 176 | 1 + no | 0.168141 | 81.901594998282 | 0.524412653683 |
| Skip polish | 02:37:45.955 | 3.669434/3.916992/3.810059 | 2,413 | 1,201 | 5 + no | 0.609449 | 78.830286618649 | 0.938853374248 |
| Stall threshold halved | 02:37:46.669 | 3.669434/3.916992/3.810059 | 73,900 | 72,850 | 5 + yes | 7.729582 | 78.396141294130 | 0.997436713621 |
| Never accept | 02:37:54.504 | 3.566406/3.886230/3.800293 | 3,137 | 3,006 | 5 + yes | 0.351139 | 85.787875707974 | 0.000000000000 |
| Redundant evaluations | 02:37:54.973 | 3.566406/3.886230/3.800293 | 229,363 | 76,851 | 5 + yes | 23.169570 | 78.377145470252 | 1.000000000000 |
| Two idle calls per step | 02:38:18.250 | 3.251953/3.782227/3.764160 | 78,063 | 230,553 | 5 + yes | 8.197787 | 78.377145470252 | 1.000000000000 |
| Stalled final step | 02:38:26.552 | 3.311523/3.785645/3.765137 | 78,063 | 76,851 | 5 + yes | 129.193325 | 78.377145470252 | 1.000000000000 |

| Case | Gain ≥ 0.9987 | Evals ≤ 160,000 | Steps ≤ 160,000 | Wall ≤ 120 s | Intended failing assertion |
|---|---|---|---|---|---|
| Healthy direct, all 3 | pass | pass | pass | pass | — |
| Healthy protocol, all 3 | pass | pass | pass | pass | — |
| Hilly pilot | pass | pass | pass | pass | — |
| First stage only | **FAIL** | pass | pass | pass | “search gain >= 0.9987” |
| Skip polish | **FAIL** | pass | pass | pass | “search gain >= 0.9987” |
| Stall threshold halved | **FAIL** | pass | pass | pass | “search gain >= 0.9987” |
| Never accept | **FAIL** | pass | pass | pass | “search gain >= 0.9987” |
| Redundant evaluations | pass | **FAIL** | pass | pass | “search evaluations <= 160000” |
| Two idle calls per step | pass | pass | **FAIL** | pass | “search steps <= 160000” |
| Stalled final step | pass | pass | pass | **FAIL** | “search wall time <= 120 s” |

Every measured broken optimiser falls outside a proposed bound; the exploratory no-op pilot also fails quality
and convergence, independently of its arbitrary stop count. The two wasted-work probes and stalled step retain
gain 1.0, so their failures cannot be attributed to reduced quality.

## Validation, deviations and approval question

`node --test tests/`: **540 tests, 30 suites; 540 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**
(duration 32,100.002458 ms). No test was edited or assertion removed. All temporary source copies were deleted;
`git diff -- src` is empty. `git diff --check` and the measurement script syntax check passed.
No production changes, golden regeneration, ledger edits, PLAN/STATUS edits, network access or commit.

Deviations: the approved stall-threshold mutation substitutes for the nonexistent iteration cap; three additional
termination probes supply evidence for the individual budgets. The initial no-op pilot is recorded separately.
An input-verification slip initially compared raw `[x,y,0]` fixture controls with `[x,y]` preset controls; the second
attempt also included that stored control field in a whole-track comparison. Normalizing the controls and checking
every other track field separately passed. An early commentary line reference of 114 is corrected here to 108.
Those check-construction slips did not alter the measured inputs or results.

Q must approve (or revise) the gain, evaluation/step ceilings and watchdog before 5.2. The material question is
whether the approximately 9.6 ms healthy quality margin is acceptable on this measured runtime; these observations
do not establish that margin on another runtime. The hilly inclusion recommendation also has only one timing
sample and no independent mutation calibration. No approval is inferred or recorded in STATUS by this task.

## Approval (Q, 2026-10-25)

Approved for task 5.2:
- **Minimum gain 0.9987**, as proposed. Q chose the tighter bound, which also catches the halved stall threshold,
  over the coordinator's suggested 0.99 (~74 ms slack). The ~9.6 ms healthy margin is accepted on this runtime. A
  future valid optimiser change that lands just below it is a deliberate re-calibration, not a test to pad.
- **At most 160,000 objective evaluations and 160,000 `step()` calls**, with convergence required.
- **A 120 s wall-clock watchdog** per convergence run (hangs only).
- **Include one direct hilly convergence case** (GT racer, Harrow Ring, 25 m hills, from its fixture), alongside the
  flat direct and protocol runs. The same bounds apply. Its gain is measured against its own hilly fixture
  reference; quality-fault calibration was done on the flat case only.
