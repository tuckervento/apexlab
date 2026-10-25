# Code Review: refactor/plant-driver-split (uncommitted)

## Metadata

| Field | Value |
|-------|-------|
| **Title** | Plant/driver split of `dynLap` (race-mode phase 1, `docs/race-mode.md` §5.1) |
| **Repository** | local (no remote, no PR) |
| **Branch** | `refactor/plant-driver-split` worktree at `/private/tmp/apexlab-plant-driver`, on `72e9637`. **All work is uncommitted.** |
| **Reviewed** | 2026-10-24 |
| **Files Changed** | 12 modified, 6 new (`src/drivers/reference.js`, `src/dynamics/{plant,observe,lap}.js`, `tests/driver.test.mjs`, `tools/scenarios/driver-version.mjs`) |
| **Lines** | +95 −92 in tracked files, plus 374 lines in new files |

---

## Summary

The split does what §5.1 set out to do: physics in `plantStep`, scalar `observe`, the old controller behind `init`/`step`
in `src/drivers/reference.js`, and the dynamic results don't change. I checked this by running the code, not by
reading it. The full suite passes untouched (241/241, `golden.json` unmodified), a driver-gain perturbation still breaks
every dynamic golden, and a replay test shows the plant depends on the driver only through its actions. Two things
should be fixed before committing: the plant hot loop got 1.65–1.83× slower, and the ±0.6 rad steering lock stayed on
the driver's side of the interface. Both have two-line fixes that keep the bits (verified). One design reversal needs
Q's sign-off: the reference driver moved **out** of the physics hash, against §5.1's recorded reasoning.

**Recommendation: Request Changes** (two small fixes) **+ Needs Discussion** (hash boundary).

## Focus Areas

Behaviour preservation (bit-identity) and conformance to the design in `docs/race-mode.md` §5.1/§5.5/§7: interface
boundary, information leaks, hash/versioning, plus a general scan.

## Verification performed

| Check | Result |
|---|---|
| `node --test tests/` in the worktree | 241 pass, 0 fail, 21.9 s; `tests/golden.json` and fixtures untouched |
| Teeth: `APEX_SRC` copy with `GAINS.kr` 0.3 → 0.31 | 36 failures, all golden sub-tests (every car/circuit, flat + hills). The goldens still cover the driver from `src/drivers/` |
| `dynLap` timing, GT racer / Harrow Ring at 0.95, best of 9, old `src/` vs branch | flat 6.42 → 10.61 ms (**1.65×**); 25 m hills 5.98 → 10.92 ms (**1.83×**); lap `t` identical |
| `structuredClone(car)` per lap | 0.02 ms flat, 0.13 ms hills (not the cause) |
| Scratch variant: direct state writes, stable shape | 7.42 ms (1.16×), 7.34 ms (1.25×) |
| `plantStep` with `steer: 2` for 2 s | `delta` = 2.000 rad on branch; 0.600 with the clamp moved into the plant |
| Both scratch fixes: golden + skidpad + parity + driver tests | 95/95 pass |

---

## Findings

### Critical Issues

None in the code.

**Operational risk:** the whole implementation exists only as uncommitted changes in a worktree under `/private/tmp`.
macOS clears `/private/tmp` on reboot, and I believe its periodic cleanup also removes old files there. Commit it (or
move the worktree) before anything else.

### Major Issues

1. **Steering lock is a driver policy, not a plant limit.** `src/drivers/reference.js:23` clamps `dCmd` to ±0.6 rad;
   `src/dynamics/plant.js:21` applies only the rate limit. The plant's own comment (`plant.js:15`) says "steering-rate
   limit and force limits belong to the plant". Any driver other than the reference can steer the wheels to 2 rad
   (verified). Fix: clamp `action.steer` to ±0.6 in `plantStep` before the rate limit. The clamp is idempotent on the
   reference driver's already-clamped command, so the goldens stay bit-identical (verified, 95/95). Keep or drop the
   driver's clamp; either way the bits are the same. Move `0.6` into `DYN` (e.g. `steerMax`) while there.

2. **Hot-loop regression of 65–83% in a refactor.** The cause is per-step overhead, mostly `Object.assign(state,{…17
   keys})` at `plant.js:41`, plus the state object gaining `alf/alr` after creation (a shape change). Writing fields
   directly and pre-declaring `alf:0,alr:0` in `createPlant` brings it to 1.16–1.25× with the lap time unchanged
   (verified). The rest is the fresh `obs`/action objects, which §7 asks for (a fresh `obs` each step), so keep them.
   The absolute cost is small today, but race mode will run this loop for 20 laps × N drivers, and §4.5's 5.4 ms/lap
   budget is now ~10 ms.

### Minor Issues

3. **`driver.test.mjs` bypasses `APEX_SRC`.** `tests/driver.test.mjs:8` imports `../src/drivers/reference.js` directly,
   while `core.dynLap` comes from `loadCore()`. Under `APEX_SRC`, the recorder test mixes the real driver with the
   copied plant. `loadCore`'s `ENTRIES` (`tests/load-core.mjs:11`) has no drivers entry, and `dynamics/index.js` doesn't
   re-export `referenceDriver`. Suggest a `src/drivers/index.js` (also the §5.8 registry's eventual home) added to
   `ENTRIES`.
4. **Run-file layout changed without a version bump.** The `runfile.js:4` header says "a change to … this layout bumps
   RUN_VERSION and adds an explicit migration". The optional top-level `driver` is additive, and older builds ignore
   unknown top-level keys, so it is forward compatible. Either bump the version or reword the rule to allow optional
   additive fields. Right now the code and its own stated rule disagree.
5. **Stale leftovers.**
   - `src/dynamics/bicycle.js:2` still imports `VSTEP`, `NT`, which are now unused.
   - `bicycle.js:9–13` still describes the driver ("eases off … and tries again"), which now lives in `drivers/`.
   - `plant.js:18` destructures `L`, which is unused.
   - `lap.js:16` declares `curG` uninitialised and only assigns it from state.
6. **The `DRIVER.name` literal is duplicated.** `tests/make-physics-version.mjs` hard-codes `'reference-v1'` instead of
   reading `referenceDriver.name`. `driver.test.mjs:38` catches drift, but the generator could just import it.
7. **Doc wording.** ARCHITECTURE §3 says "per-step observations do not expose plant state". They expose *copies* of
   `x, y, vx, vy, r, psi, delta, ax, ay, gear`, which is intended (§5.5), so "no references to plant state" is the
   accurate claim.

### Needs Discussion (Q's call)

8. **The reference driver moved out of the physics hash, reversing §5.1.** The original §5.1 reasoning was: "the
   dynamic check's result (in run files) depends on it, so it is part of 'the rules'". The branch rewrites that bullet
   in `docs/race-mode.md` and cites "the requirement for independent physics and driver identity" without saying
   whose requirement.
   - Consequence: `PHYSICS.sha256` alone no longer identifies a run file's `result.dyn`. You need `PHYSICS` +
     `DRIVER`, and pre-branch files have only the first. That's handled honestly ("no separate driver identity").
   - Benefit: the DynCheck driver becomes "just a driver" under the §5.7 rules/driver hash model.

   Both are defensible. If this was your instruction, fine. If not, the implementer reversed a recorded decision. In
   either case, keep the superseded reasoning visible in the doc. Today the update paragraph says "the version boundary
   **below** is superseded", but the bullet below was rewritten too, so the original rationale is gone.
9. **The interface differs from the §5.1 sketch.** `plantStep(state, action, car, dc, line, idx, dt)` versus
   `plantStep(state, action, dt)`.
   - The plant reads hill grade from the *line's* `sn/cth/kv` at a station index the lap loop computes. That was true
     before and is fine with a fixed line.
   - Once D4 (line switching, §5.10) exists, the plant's gravity would follow whichever line the race loop localises
     against. Worth deciding now whether plant hill data should come from the track, not the line.

### Positive Observations

- **The replay test** (`driver.test.mjs:42–59`) records the reference driver's actions and replays them without it,
  and gets an identical lap, flat and on hills. That's the strongest evidence the plant doesn't depend on driver
  internals.
- **The judge stays independent of the driver.** `lap.js:28` computes `vyN`/`vt` from its own nominal, not the
  driver's, so a custom driver can't move its own trouble threshold. This partly closes the §3 concern early.
- **`plantStep` rejects non-finite actions before mutating state** (tested). Before, a NaN command made a lap that
  never progressed and, with no trouble or spin recorded, counted as *clean* in `DynCheck`. Now it fails loudly.
- **Copies at `init`, fresh scalar `obs`, and a frozen `car.spec`** together mean a driver can't corrupt the plant
  (checked: `ctx.dc.p` is the frozen spec).
- **Hash independence is tested both ways** (`driver.test.mjs:19–34`), and the browser's live hash is checked against
  Node's.
- The goldens' teeth were moved correctly: the ARCHITECTURE note now names `GAINS.kr`, and the perturbation fails
  every dynamic golden as it claims.

---

## Inline Comments

### `src/dynamics/plant.js`

**Line 21** [Major] Clamp `action.steer` to ±0.6 (as `DYN.steerMax`) before the rate limit; the lock is an actuator
limit.

**Line 41** [Major] Replace `Object.assign` with direct field writes; add `alf:0,alr:0` to `createPlant` so the shape
is fixed from the start. Measured 1.65× → 1.16× (flat).

**Line 18** [Minor] `L` is unused.

### `src/drivers/reference.js`

**Line 23** [Major, paired with plant.js:21] The ±0.6 clamp here is the only steering lock in the system.

### `src/dynamics/bicycle.js`

**Line 2** [Minor] `VSTEP`, `NT` are unused after the split.
**Lines 9–13** [Minor] The header still describes the driver.

### `tests/driver.test.mjs`

**Line 8** [Minor] Import the driver through `loadCore` so `APEX_SRC` copies are tested consistently.

### `src/app/runfile.js`

**Line 4 / 28** [Minor] The optional `driver` field contradicts "layout change bumps RUN_VERSION". Reconcile the rule
or the version.

### `docs/race-mode.md`

**§5.1** [Discussion] Keep the superseded "inside the physics hash" rationale visible, and say who decided the
reversal.

---

## Files Reviewed

| File | Change | Notes |
|---|---|---|
| `src/dynamics/plant.js` | new | Line by line against old `dynLap` lines 118–137: same expressions, same order |
| `src/dynamics/observe.js` | new | Matches old lines 104–108 |
| `src/dynamics/lap.js` | new | Loop, localisation and judge match old lines 87–148 |
| `src/drivers/reference.js` | new | Matches old lines 109–120; gains moved out of `DYN` |
| `src/dynamics/bicycle.js` | modified | Lost `dynLap` and the gains; stale imports and comment |
| `src/dynamics/check.js`, `index.js` | modified | Import changes only |
| `src/app/physics-version.js`, `tests/make-physics-version.mjs`, `tests/load-core.mjs` | modified | `DRIVER` manifest, `driverSource()` |
| `src/app/runfile.js`, `src/app/controls.js` | modified | Optional driver identity, live driver hash, load note |
| `tests/driver.test.mjs`, `tools/scenarios/driver-version.mjs` | new | The CDP scenario was not run in this review |
| `ARCHITECTURE.md`, `CLAUDE.md`, `README.md`, `docs/race-mode.md` | modified | See #7, #8 |
