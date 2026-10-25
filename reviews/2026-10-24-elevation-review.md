# Apex Lab: elevation review (migration step 8)

- **Date:** 2026-10-24. **Scope:** commits `f115053..b12517d` (git range `15a8872..b12517d`), the elevation work the previous review (`reviews/2026-10-23-progress-review.md`) left out. Line numbers are for HEAD `00b29ff`; `src/`, `tests/` and `index.html` are byte-identical to `b12517d`.
- **Who:** the senior-code-reviewer subagent, at Q's request. Read-only: no source, test or golden was edited, and nothing with `--write` was run. This file is the only one written in the repo.
- **Purpose:** a work list. Each finding has an ID, a status box, evidence, a fix, how to verify it, and whether the fix touches the physics hash (`src/app/physics-version.js`) or the goldens.

## Caveats

- **Evidence labels:** VERIFIED means reproduced by running something, with the output quoted, or confirmed by reading the exact code. SUSPECTED means inferred from reading, not observed.
- **Baseline (VERIFIED):** `node --test tests/` on Node v26.12.1 gave 203 tests, 203 pass, 0 fail, 35.8 s. That is slower than the ~26 s in `CLAUDE.md`, probably machine load; the count matches.
- **Known simplifications are not re-reported:** `docs/deferred.md` A3–A11 and "Lessons to keep". Where this review measured one against the doc's claim, it says so under "Checked and fine".
- **Probe scripts** are outside the repo, in the session scratchpad `/private/tmp/claude-501/-Users-tucker-code-apexlab/3647760f-19ab-471b-a38e-4643a0c7de6f/scratchpad/`:
  - `probe_warn.mjs`: E-H1 (fake Worker driving the real `client.js`)
  - `fd.mjs` + `probe_fd.mjs`: finite-difference gradient checks in six regimes the tests don't cover
  - `probe_air.mjs`: E-M1
  - `probe_grade.mjs`: E-M2
  - `probe_vtop.mjs`: E-L1
  - `probe_kv.mjs`: vertical-curvature definition (under "Checked and fine")
  - `probe_a10.mjs`: E-L2
  - `mutate.mjs` + `mutations.json`: the 19 deliberate breakages under "Test teeth" (each applied to a fresh copy of `src/` under `mut/`, run with `APEX_SRC`)
  - The scratchpad is session-specific. Copy what you want to keep.

## Summary

The hilly physics and its adjoint are in very good shape:

- The forward pass matches ARCHITECTURE §4.7 term for term.
- Every hilly term has its derivative in the adjoint.
- The gradient stays exact, err/scale ≤ 1e-7 against a 1e-6 limit, in six regimes the tests don't cover: stalled climbs, the vTop cap, a downforce car with n clamped to 0, braking that can't hold a 35% descent, and hand-edited ±60 m heights on two circuits.
- Flat circuits are untouched. Every flat-reachable change is either guarded by `T.flat`/`still`/`level` or is a multiply by exactly 1.

**Counts:** 1 High, 2 Medium, 7 Low.

| ID | Finding | Area | Hash | Goldens |
|---|---|---|---|---|
| E-H1 | The snapshot's `warn` (stall / airborne / over-range) never reaches the page — **fixed**, `8db6b21` | app (`client.js`) | no | no |
| E-M1 | n ≤ 0 is clamped to 0, so a downforce car keeps its downforce grip while it is really off the ground — **fixed**: tables down to each car's zero-grip floor (no golden changed) | core, dynamics | yes | none changed |
| E-M2 | Height editing reaches 125–158% grades and 16 m crests, far outside what the model and tests cover, with no guard — **fixed** (a warning, Q's choice) | app | no | no |
| E-L1 | Speed is capped at the flat `vTop` even downhill (undocumented) | core | yes, if changed | hilly yes |
| E-L2 | Deferred A10 is effectively already done, and its premise is wrong | docs | no | no |
| E-L3 | `dynLap` scales lateral velocity by cos(grade) too | dynamics | yes | hilly yes |
| E-L4 | Stale selected handle when the circuit is replaced in edit mode; "Point N" label not renumbered on insert | app | no | no |
| E-L5 | After loading a hilly run, *Revert shape* doesn't re-enable Hills, contrary to the note | app | no | no |
| E-L6 | Property-test gaps: cos-grade in n, the track's kv, and the dynamics' hill terms are guarded only by bit-exact goldens — **fixed**, `5b29646` (M12, kv smoothing, stays golden-only on purpose) | tests | no | no |
| E-L7 | Docs drift (6 items) | docs | no | no |

**Before banking or tyres:** fix E-H1 first. Both features add regimes where the clamps and `warn` matter more, and right now the only signal that a lap time isn't real is invisible. E-L6 should land before banking too: banking replaces exactly the terms (cth, kv, the n formula, `dynLap`'s plan motion) that only goldens guard. When banking forces a golden regeneration, a wrong term would go in with it. Nothing in the core blocks building on this code.

## Findings

### High

#### [x] E-H1. The lap's warnings (stall, airborne, over-range) never reach the page (VERIFIED)

- **Why it matters:**
  - `Scratch.stall/air/ntop` exist so that a lap time distorted by the 0.1 m/s floor or the load clamps is never presented as real. CLAUDE.md says "don't hide them". ARCHITECTURE §4.7 (line 143) says they are "shown over the map".
  - They are computed and sent, but dropped by the client. So a hilly lap of 462 s with 7 stalled stations (E-M2's case), or an airborne lap gripping on phantom downforce (E-M1), shows with no explanation.
- **Where:**
  - `src/solver/solver.js:141` puts `warn` at the top level of the snapshot event: `{type:'snapshot', …, lap:t, line, vmin, vmax, warn:{…}}`.
  - `src/app/client.js:61`: `S.disp={...m.line,t:m.lap,vmin:m.vmin,vmax:m.vmax,carRev:…,trackRev:…,lineRev:…}` copies `m.line` but not `m.warn`.
  - `src/app/main.js:118`: `showWarn(T,disp.warn)` therefore always gets `undefined`, and `showWarn` (`main.js:85`) shows only `T.issue`.
- **Evidence (VERIFIED, `probe_warn.mjs`):** a `track` event, then a `snapshot` with `warn:{stall:3,air:2,ntop:1}`, delivered to the real `client.js`:
  ```
  S.disp keys: px,t,vmin,vmax,carRev,trackRev,lineRev
  S.disp.warn = undefined
  ```
- **Why tests missed it:** `tests/solver.test.mjs:265` asserts `snap.warn` on the solver's event, but `tests/client.test.mjs` never checks it. The headless-Chrome check in `bb5fefc`'s message never put the page in a warning state.
- **Fix:** in `client.js:61` add `warn:m.warn` to `S.disp`. Add a client test: deliver a snapshot with a non-zero `warn` and assert `S.disp.warn` deep-equals it.
- **Verify:** the new client test goes red before the fix and green after. In the browser, Road car with `power: 40, mass: 2400` on 80 m hills (the stall case of `tests/elevation.test.mjs:184`; set the heights by hand, since the slider stops at 40 m), or E-M2's alternating ±60 m heights: the warning line appears.
- **Hash/goldens:** no (`app/` is not hashed).

### Medium

#### [x] E-M1. At n ≤ 0 a downforce car keeps its full downforce grip, even where it is really off the ground (VERIFIED)

- **Why it matters:**
  - The tyres' real normal load is `DF + m·g·n`. When n < 0 (a crest taken faster than √(g/|kv|)) that is less than DF, and below zero once `m·g·|n| > DF`; the car is then airborne.
  - `loadAt` clamps n to 0, so the tables give downforce-only grip at full DF. That overstates traction and braking over the crest (the model is optimistic).
  - ARCHITECTURE §4.7 and the comments describe only the no-downforce case ("a car with no downforce then has no grip and coasts"), so the error for downforce cars is undocumented.
  - With E-H1, nothing on the page reveals it either.
- **Where:**
  - `src/core/lap.js:38` (`loadAt`: `if(n<=0){… return out[0]=0;}`)
  - `lap.js:42` (`kN`: `n=n<0?0:…`)
  - `src/dynamics/bicycle.js:68` and `:125` (`Math.max(0, …)`: the dynamics clamp the same way, so the two models agree with each other, not with physics)
- **Evidence (VERIFIED, `probe_air.mjs`):** centreline of `stadium(1000,120,bump)`, the same crest shape as `tests/gradient.test.mjs:124`. "Really airborne" means `DF/(m·g) + n < 0`.
  ```
  GT racer, 40 m crest: air steps 49; stations at n<=0: 23, of which DF+m·g·n<0 (really airborne, model still grips on DF): 19, worst (DF/mg + n) -13.11
  GT racer, 20 m crest: air steps 37; stations at n<=0: 17, of which DF+m·g·n<0 ...: 17, worst -6.45
  Open-wheeler, 20 m crest: air steps 39; stations at n<=0: 18, of which DF+m·g·n<0 ...: 15, worst -7.48
  ```
- **Reachability:** not on generated hills (slider ≤ 40 m keeps n ≥ ~0.82). It is reachable from the height editor: alternating ±60 m on Kestrel Point gave the Open-wheeler n down to −5.1 and 394 airborne pass steps (`probe_fd.mjs` R6b).
- **Fix (pick one):**
  - (a) Extend the load grid below 0, e.g. n ∈ [−1, 2] or [−2, 2], keeping NSTEP so n = 1 stays a node. `gripTables(p, n<0)` already handles it: `W = m·G·n·w + DF·a` can go ≤ 0, and `tireF(Fz≤0)=0` / `cap(W≤0)=0` return zero grip. Then lower the clamp in `loadAt`/`kN`/`tab3`/`gg3` and drop the `Math.max(0, …)` in the dynamics. `air` then means "below the grid".
  - (b) At minimum, document the optimism in §4.7 and the `loadAt` comment, and have `air` also count "really airborne" stations for downforce cars.
- **Verify:**
  - The gradient clamp tests (`gradient.test.mjs:129`) pass, with a GT racer crest case added.
  - A closed-form check: a straight crest at speed where `DF = m·g·|n|` gives zero GGV.
  - The flat goldens are unchanged.
- **Hash/goldens:** hash yes. Flat goldens no. Hilly goldens: none reaches n ≤ 0, but shifting the grid origin changes the floating-point level index (`z = (n − n0)/NSTEP`), so expect last-bit changes; regenerate and review.

#### [x] E-M2. The height editor reaches 125–158% grades and 16 m crests with no guard (VERIFIED)

- **Why it matters:**
  - The edit bar's slider allows −60…60 m per control point (`index.html:140`, applied in `src/app/controls.js:133`). Control points are ~100–200 m apart, so neighbouring points can be 120 m apart in height.
  - Generated hills are checked to stay under 20% grade (`tests/elevation.test.mjs:45`). The only tests past that are the 250 m stress cases (finite lap, gradient through the clamps), which check robustness, not physical validity.
  - Out there, lateral demand on the 3D speed (A5), centreline grade (A4) and the load clamps (E-M1, `ntop`) dominate, and laps stall.
  - The only cue is the elevation caption's "steepest N%" (`controls.js:83`), plus the warnings E-H1 drops.
- **Evidence (VERIFIED, `probe_grade.mjs`, `probe_fd.mjs` R6):**
  ```
  Harrow Ring, 15 points alternating ±60 m: steepest 158%, crest radius 16 m, compression radius 24 m; GT racer flat centreline lap 85.79 s
  Kestrel Point, 12 points alternating ±60 m: steepest 125%, crest radius 30 m, compression radius 18 m
  R6 (GT racer, Harrow Ring, ±60 m), tau=0: lap 462.177 err/scale 1.23e-9 ... stall 7 air 27 ntop 549 n 0.01..7.00
  ```
  The gradient is still exact there. The problem is physical validity, not the adjoint.
- **Fix:**
  - Fix E-H1 first.
  - Then pick one: warn when the steepest grade exceeds ~25% or a vertical radius is under ~50 m (both computed in `trackArrived` already); or cap the height slider so a point can't make a grade steeper than X% to its neighbours.
  - Q's call which: a hard cap removes the "what if" playground.
- **Verify:** headless Chrome with alternating ±60 m shows the warning; ordinary hills (≤ 40 m slider) don't.
- **Hash/goldens:** no.

### Low

#### [ ] E-L1. Speed can never exceed the flat `vTop`, even downhill (VERIFIED; undocumented)

- **Why it matters:**
  - `vCorner`/`vCornerN` return `car.vTop` on straights. Both passes take `smin(vn, vc[j])`, so gravity can't carry a car past its flat top speed.
  - That is defensible for rev- or motor-limited cars (limiter or regen holds the speed).
  - It is pessimistic for drag-limited cars (Road car, Open-wheeler), which would really run faster down a long descent.
  - Neither §4.7 nor `deferred.md` mentions it.
  - ARCHITECTURE §8.7 (line 340) lists the Kart's +0.69 s hilly golden among differences that "don't measure what hills cost". Part of it is real: the Kart is held at vTop on 82–107 stations.
- **Where:** `src/core/lap.js:7,14` (`vCorner`), `:48,:54` (`vCornerN`), `:128` / `:140,:145` (`smin` with `vc[j]`).
- **Evidence (VERIFIED, `probe_vtop.mjs`, Harrow Ring centreline):**
  ```
  Road car: vTop 271.2 km/h, drag-limited         H=0/25/40: stations at vTop 0/783
  Open-wheeler: vTop 307.6 km/h, drag-limited     H=0/25/40: stations at vTop 0/783
  Kart: vTop 111.6 km/h, rev/motor-limited        H=0: 0/783   H=25: 82/783   H=40: 107/783
  ```
  (Hot hatch, EV saloon and GT racer are rev/motor-limited and never reach vTop here.)
- **Fix:**
  - Document it in §4.7 at minimum.
  - To lift it for drag-limited cars, change only the hilly branch (`vCornerN`, or the hilly forward step): return a separate ceiling (rev/motor speed or `VMAX−1`) where `drv > 0` above vTop.
  - Don't change `vCorner`: it sets `vc` and `i0` on flat circuits and would move the flat goldens.
- **Verify:** a long steep descent on a stadium. A drag-limited car exceeds vTop; a rev-limited one doesn't. The flat goldens are unchanged.
- **Hash/goldens:** hash yes if code changes. Hilly goldens likely change; flat must not.

#### [ ] E-L2. Deferred A10 is effectively already done, and its premise is wrong (VERIFIED)

- **Where:** `docs/deferred.md:221` says `lapEval` throws "deep in the hot loop" and that `Optimizer.setup`/`DynCheck` "would only find out on first evaluation".
- **What the code does:**
  - The check is at `lapEval` entry (`src/core/lap.js:87`), before any loop.
  - `Optimizer.setup` → `startStage` → `evalc` → `lapEval` (`optimiser.js:21,41,47`) and the `DynCheck` constructor (`check.js:12`) both evaluate straight away. `rescore` also reaches `startStage`.
- **Evidence (VERIFIED, `probe_a10.mjs`, flat-built car on 25 m hills):**
  ```
  Optimizer.setup: throws at construction: lapEval: a hilly circuit needs a car built with {loads: true}
  new DynCheck: throws at construction: lapEval: a hilly circuit needs a car built with {loads: true}
  ```
- **Fix:** close A10, or reduce it to "add an explicit check with the same message, for clarity". Fix the "hot loop" wording.
- **Hash/goldens:** no (docs).

#### [ ] E-L3. `dynLap`'s plan-view motion scales lateral velocity by cos(grade) too (VERIFIED by reading; effect SUSPECTED negligible)

- **Where:** `src/dynamics/bicycle.js:137`: `x+=(vx*c-vy*s)*dt*ch; y+=(vx*s+vy*c)*dt*ch`.
- **Why:** with no bank, the body's lateral axis is horizontal, so only the along-road component `vx` should be scaled by `cth`: `x+=(vx*ch*c−vy*s)*dt`.
- **Size:** the error is `vy·(1−cth)`, about v·β·θ²/2: at 15% grade, sideslip 0.05 rad and 60 m/s, ~3 mm/s.
- **Related, same family as A5:**
  - `dynNominal` uses `r = u·k` and `ay = u²·k` with the 3D speed and horizontal curvature, while the car covers plan distance at `u·cth`. The car turns ~1/cth too fast in plan, and the feedback absorbs it.
  - Do both with A2/A5, when the banked frame is written out.
- **Hash/goldens:** hash yes; hilly dynamic goldens change.

#### [ ] E-L4. Stale selected handle when the circuit is replaced in edit mode; "Point N" not renumbered on insert (VERIFIED by reading)

- **Where:**
  - `S.sel` is reset only by `selectHandle(-1)` on edit toggle, revert and delete. The preset picker (`controls.js:127`), *Random* (`:128`) and `loaded()` (`:212–220`) replace `S.ctrl` without resetting it.
  - The edit bar then still shows the old point. Moving its height slider (`:133`) sets the height of point `S.sel` on the new circuit and clears every `u`, disabling Hills.
  - Separately, inserting a point before the selection does `S.sel++` (`main.js:59`) without refreshing `#selN`.
- **Fix:** call `selectHandle(-1)` wherever `S.ctrl` is replaced. After `S.sel++`, call `selectHandle(S.sel)`.
- **Hash/goldens:** no.

#### [ ] E-L5. After loading a hilly run, *Revert shape* doesn't re-enable Hills, contrary to the note (VERIFIED by reading)

- **Where:**
  - `loaded()` stores a non-preset run's points with `u = null` (`controls.js:219`), and `origCtrl` is a copy of them (`:220`).
  - *Revert* (`:137`) restores `origCtrl`, so `hillsFollow` stays false.
  - The note (`index.html:253`) says "*Revert shape*, or pick a circuit, to use the slider again". Only picking a circuit works.
- **Fix:** reword the note for loaded runs ("pick a circuit"), or hide *Revert* from the note when `origCtrl` has no `u`.
- **Hash/goldens:** no.

#### [x] E-L6. Several hilly terms are guarded only by the bit-exact goldens, not by any physical-property test (VERIFIED, see "Test teeth")

- **Why it matters:**
  - Goldens catch any change but can't tell right from wrong. When a physics change (E-M1, E-L1, banking) forces a regeneration, a wrong term goes in with it.
  - M11–M16 (kv 3% off, kv unsmoothed, **cos-grade dropped from n entirely**, `dynLap` plan motion unscaled, `dynNominal` on plan steps, one-sided grade sine) pass every property test and fail only the 6 hilly golden assertions.
  - M13 is the notable one. The closed-form crest test (`elevation.test.mjs:103`) passes `cth = 1` straight to `vCornerN`, so the `cth` term of `n = cth + v²·kv/g` is never checked against physics.
- **Fix (tests only):**
  - A corner on a constant grade in closed form: linear tyre, no downforce, `v = √(μ·g·cth / k)`, read through `buildTrack` so `track.js`'s `cth` is exercised.
  - A vertical-curvature closed form read through `buildTrack` (a circular-arc crest of known radius, checking `T.kv` ≈ −1/R away from the ends).
  - A dynamics check that `dynLap`'s lap time on a straight ramp matches the lap model's within a tight bound; with M14 the plan distance is off by 1/cth.
- **Verify:** each new test fails on its mutation (`mutations.json` M11–M16), using `APEX_SRC`.
- **Hash/goldens:** no.

#### [ ] E-L7. Docs drift (VERIFIED against code)

1. ARCHITECTURE §4.7 (line 143) and CLAUDE.md say the warnings are "shown over the map". They aren't (E-H1).
2. ARCHITECTURE §7 display snapshot (`disp`, line 269) lacks `pz` (present since 6a) and `warn` (once E-H1 is fixed).
3. ARCHITECTURE §4.7 "airborne … a car with no downforce then has no grip and coasts" says nothing about downforce cars (E-M1).
4. ARCHITECTURE §8.7 line 340: the Kart's +0.69 s is partly the vTop cap (E-L1), not only optimiser noise.
5. `docs/deferred.md` A10 (E-L2).
6. Test runtime: ARCHITECTURE §8 says "~15 s", CLAUDE.md "~25 s"; measured 35.8 s here (load-dependent).

## Test teeth

Each breakage was applied to a fresh copy of `src/` (exact single-occurrence replacement; `mutations.json` has the literal strings). It was then run against `tests/gradient.test.mjs` (28 tests), `tests/elevation.test.mjs` (18), and the 12 hilly subtests of `tests/golden.test.mjs` (`--test-name-pattern hill`: 6 property, 6 golden). All VERIFIED; output in `scratchpad/mutate.out`.

| # | Breakage | gradient | elevation | hilly golden | Caught by |
|---|---|---|---|---|---|
| M1 | fwd adjoint: drop `gg3` ∂/∂n in dAv | 16 fail | 0 | 0 | gradient |
| M2 | fwd adjoint: drop `tab3` ∂/∂n in dal | 16 fail | 0 | 0 | gradient |
| M3 | bwd adjoint: drop `gg3` ∂/∂n in dBv | 16 fail | 0 | 0 | gradient |
| M4 | bwd adjoint: drop `tab3` ∂/∂n in dal | 15 fail | 0 | 0 | gradient |
| M5 | bwd adjoint: drop gravity from recomputed vn | 16 fail | 0 | 0 | gradient |
| M6 | fwd adjoint: drop gravity from recomputed v2 | 16 fail | 0 | 0 | gradient |
| M7 | `loadAt` dn/dv halved | 16 fail | 1 fail | 0 | gradient, loadAt values |
| M8 | `vCornerN` ignores n's speed dependence | 0 | 4 fail | 6 fail | closed form, monotonicity, crest dynamics, goldens |
| M9 | fwd pass reads n at step end j (fwd only) | 16 fail | 0 | 6 fail | gradient (forward/adjoint mismatch), goldens |
| M10 | hilly steps use horizontal ds | 0 | 1 fail | 6 fail | ramp terminal speed, goldens |
| M11 | track `kv` × 1.03 | 0 | 0 | 6 fail | **goldens only** |
| M12 | track `kv` unsmoothed | 0 | 0 | 6 fail | **goldens only** |
| M13 | track `cth = 1` (cos-grade dropped from n) | 0 | 0 | 6 fail | **goldens only** |
| M14 | `dynLap` plan motion not × cos(grade) | 0 | 0 | 6 fail | **goldens only** |
| M15 | `dynNominal` uses plan steps for ax | 0 | 0 | 6 fail | **goldens only** |
| M16 | `grades()` one-sided sine | 0 | 0 | 6 fail | **goldens only** |
| M17 | `dynLap` tyre loads ignore n | 0 | 2 fail | 6 fail | 150 m-hills fraction, ramp tracking, goldens |
| M18 | bwd pass: `air`/`ntop` counters dropped | 2 fail | 1 fail | 0 | Kart crest clamp tests |
| M19 | `dynNominal` gravity at half strength | 0 | 1 fail | 6 fail | ramp tracking, goldens |

What this shows:

- **The adjoint has strong teeth.** Every adjoint breakage (M1–M7) fails 15–16 of the 16 hilly gradient tests. ARCHITECTURE §8.7's "breaking any new adjoint term fails all 12" holds, and more: the clamp cases fail too, except M4 on one clamp case. A forward-only change that leaves the adjoint behind (M9) is also caught, by the forward/adjoint mismatch.
- **The documented dynamics tests have the teeth claimed** (M17 fails the 150 m test, M19 the ramp test).
- **Gap: E-L6.** Six physically wrong changes (M11–M16) are caught only by bit-exact goldens.
- In every row the hilly *property* subtests passed; only the `golden` subtests failed.

## Checked and fine (VERIFIED unless noted)

**Forward pass against §4.7** (read line by line, `lap.js:82–151`):
- 3D `ds` with curvature on horizontal `dh` (`:90,:95`).
- Gravity `−2g·dz[i]` forward (`:123`) and `+2g·dz[j]` braking (`:144`), each on the step's own index.
- n read at the step's start station (`:119`, `:142`).
- The upshift test applied after gravity (`:126`).
- The `al>0` guard for airborne-without-downforce (`:120`, `:143`).

**The adjoint.** Every hilly term has its derivative:
- dn/du via `loadAt` into both `tab3` and `gg3`.
- Gravity in the recomputed `v2`/`vn`, for both passes.
- 3D `ds` → points via `dx/ds` (`:244`).
- Curvature on `dh` (`:231`).
- The yaw-limit `dk` denominators on 3D `ds` (`:224`).
- Clamps give zero slope consistently: `loadAt` `out[1]=0`, `tab3`/`gg3` `dn=0`.

**FD gradient in six untested regimes** (`probe_fd.mjs`, h = 1e-6, the test's own error measure):
```
R1 stall: 40 kW/2400 kg Road car, 80 m hills      tau 0: err/scale 2.29e-8 (stall 33)   tau 0.5: 1.00e-7
R2 vTop cap: Kart, 40 m hills                     tau 0: 5.01e-9                         tau 0.5: 5.01e-9
R4 n clamped 0 with downforce: GT racer, crest    tau 0: 4.08e-11 (air 48, ntop 56)      tau 0.5: 1.85e-9
R3 35% descent into a hairpin, mu 0.6 Road car    tau 0: 1.51e-8 (stall 73, ntop 9)      tau 0.5: 4.18e-9
R6 alternating ±60 m, GT racer, Harrow Ring       tau 0: 1.23e-9 (n 0.01..7.00)          tau 0.5: 3.07e-8
R6b alternating ±60 m, Open-wheeler, Kestrel      tau 0: 2.33e-10 (n −5.1..12.4)         tau 0.5: 4.90e-9
```
Floored stations (v = 0.1) don't corrupt the gradient: where `vf` hits 0 the adjoint's `v2 ≤ 1e-12` / `vn ≤ 1e-9` guard drops the path, which is the correct zero derivative.

**Flat bit-identity** (by reading the full diff, `git diff 15a8872..b12517d -- src/`):
- Every hilly term in `lapEval` is behind `flat`/`still(i)`/`level(i)`.
- `ds[i]=flat?dh[i]:…` and `dh` replacing `ds` in curvature are value-identical on flat.
- The new `n` factors (`gripTables`, `axleLoads`, `axleCaps`) are `·1`, exact in IEEE; with `m*G*n*wf` the left-to-right order makes `(m*G)*1*wf = (m*G)*wf`.
- `dynNominal`/`dynLap` take the old expressions when `hs` is null.
- `track.js` splines z in separate arrays (`Mz`, `rz`) without touching `Mx`/`My`.
- A constant height (including a ±0 mix, which the Hills slider at 0 produces as `0·u`) is filled exactly and gives `flat`.
- A flat circuit with a loads-built car (the solver keeps tables after hills go to 0) never reads `car.load`, and `car.alat` etc. are the same `g1` arrays.
- The 24 flat goldens, prototype parity and the v1 run fixture all pass.

**`kv` is d²z/dx² over plan distance, not true curvature `z''/(1+z'²)^{3/2}`** (`track.js:45`). Measured effect on n at 40 m hills, `probe_kv.mjs`: max |Δn| 0.0004–0.0025 across Road car, GT racer and Open-wheeler on Harrow Ring and Kestrel Point. Negligible next to A4's 0.155; not worth a change.

**`vCornerN` monotonicity:** pinned by `elevation.test.mjs:242`. M8 shows the test is live.

**Solver:**
- `needsLoads` is applied in `setCar`, `setTrack` (rebuilds the same car with tables, no new `carInfo`, built before state changes) and `load`.
- `publish` passes `grades(T)` and 3D `S.ds` to `dynNominal`; `{...null}` is safe on flat.
- `pz` is a copy.

**Run files v2:**
- v1 → v2 migration is exact: z = 0 → `buildTrack` sees a constant height → flat. The fixture reloads bit for bit.
- v2 requires exactly `[x, y, z]`, finite.
- `nz = 1` is filled only for level circuits, matching `buildTrack`'s own flatness test (all control-point heights equal).

**Deferred items measured against the doc:** A5 and A4 are as described. A10 is better than described (E-L2).

## Not covered

- No browser run. The UI findings (E-H1 consequences, E-L4, E-L5) come from reading and the fake-Worker probe, not from a page.
- `src/views/map2d/map.js` height tint and `charts.js` `drawElevChart`: read for crashes only (bucket index stays in range; the chart's x-axis is station index, uniform in plan distance). Not checked visually.
- `tests/solver.test.mjs` and `tests/runfile.test.mjs` hilly cases: read, not mutated.
- `golden.json`'s hilly fixtures were not regenerated or diffed against a regeneration (no `--write`).
- Performance claims (366 µs hilly vs 220 µs flat; ~250 ms load tables): not re-measured.
- Merging the flat and hilly paths (A8) was not tried.
- The flat-path mutations needed to show the flat goldens catch a flat-leak were not run. Flat identity is argued by reading above, plus the passing flat goldens.

## Suggested order

1. **E-H1**: one line in `client.js` plus a client test. No hash.
2. **E-L6**: tests only. Before any physics change that regenerates hilly goldens.
3. **E-M1**: decide grid extension or doc-only. Then hash, and regenerate hilly goldens.
4. **E-M2**: warning thresholds, Q's call on cap vs warn.
5. **E-L1, E-L3**: with banking (A2), since both touch the hilly frame and regenerate hilly goldens anyway.
6. **E-L2, E-L4, E-L5, E-L7**: docs and small UI fixes, any time.
