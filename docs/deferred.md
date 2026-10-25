# Deferred work

Items set aside on purpose, with enough context to pick one up cold: why it matters, where things stand (file:line as of
commit `b12517d`, 2026-10-24), the approach and what's already decided, open questions, how to verify, and a rough size.
Most come out of elevation (migration step 8, `ARCHITECTURE.md` §4.7) and its review; a few from saved runs.

When one is picked up: re-check the line references (they drift), turn the item into a plan (`/draft-plan` or plan mode),
and delete or update it here when it lands.

## Summary

| # | Item | Value | Size | Risk | Changes flat goldens? |
|---|---|---|---|---|---|
| A1 | 2.5D tilted map — the 3D Map camera shipped (tilt 0–60°, height exaggeration); close A1 as superseded? Pending Q (`docs/3d-view.md` §13 Q2) | high (topology at a glance) | M–L | medium | no |
| A2 | Banking | high (realistic hilly corners) | L | high | no |
| A3 | Load tables only for the reachable load range — **not workable**; Illinois GGV halved the build instead | — | — | — | no |
| A4 | Grade and vertical curvature from the line driven | low–medium (≤ 44 ms of lap) | M | medium | no |
| A5 | Lateral demand on horizontal speed | low (~1% at 15% grade) | S | low | no |
| A6 | Hilly `lapEval` speed | medium (search time on hills) | S–M | low | no |
| A7 | Rolling resistance under real normal load | low–medium | S | low | **yes** |
| A8 | Merge the flat and hilly code paths | maintainability | M | medium | must not |
| A9 | Cosmetic: height tint, label collisions | low | S | none | no |
| A10 | "Needs load tables" checked at the boundary — **already true**, pinned by a test (`385bbb2`) | robustness | — | none | no |
| A11 | Dynamic traces have no height — **done**, `tr.z` (3D plan 0.2) | — | — | none | no |
| B1 | Saved runs: show more of the comparison | medium (TODO #6) | S | none | no |
| B2 | Ghost from a run whose station count changed | low | S–M | low | no |

Suggested order: A2 (the next physics step; it reshapes A4, so do A4 with or after it). A1's visible win
shipped as the 3D view's Map camera (step 9); keep A1 only if a Canvas 2D tilt is still wanted. A5 can ride along with A2. A7 on its own, with its own golden review.

---

## Lessons to keep (from step 8)

- **Flat stays bit-identical, and that's what makes physics changes safe.** A flat station runs the flat code expression
  for expression, adjoint included: the converged-line goldens depend on the gradient's bits (L-BFGS). Put new terms in
  their own branch, never as zero-valued additions (`+ 0·0` turns −0 into +0). The 24 flat goldens then prove a change
  left flat physics alone, byte for byte (that's how step 8 was checked).
- **Measure before setting a test bound**, and give every new test teeth (break the thing in an `APEX_SRC` copy and watch
  it fail). Three coverage assumptions were wrong in step 8 and only measurement caught them.
- **The lap model is self-consistent in ways that defeat naive coverage.** On curved crests the corner-speed solve keeps
  the tyres loaded (n stays > 0: the car slows until it can grip), so airborne cases need a near-straight crest
  (`tests/golden-util.mjs` `stadium()`).
- **Converged laps are noisy** (restarts scatter ~±0.06 s). Don't read hundredths between two converged laps as physics;
  use fixed-line tests (e.g. the ramp-stadium direction test in `tests/elevation.test.mjs`).
- **Physics hash:** after any edit under `core/`, `dynamics/` or `solver/solver.js`, run
  `node tests/make-physics-version.mjs --write`.

---

## A1. 2.5D tilted map — superseded (pending Q)

**Status.** Superseded by the 3D Map camera (`cameras/ortho.js`, plan task 2.4), which shipped with step 9 (2026-10-25). It frames like `Camera.fit`, follows like `Camera.frame`, has a 0–60° *Tilt* slider and the *Height* exaggeration slider, and keeps the corner labels and map tags (HTML overlays placed by `project()`). The trade-off: it is a WebGL view (WebGL2 needed; editing stays on the flat 2D map). Still pending Q’s confirmation of `docs/3d-view.md` §13 Q2 before A1 is closed. The Canvas 2D sketch below is historical.

**Why.** The 2D cues (height tint, elevation chart, telemetry) work, but you can't *see* a crest at a glance. Q wanted
2.5D if it wasn't a big step up; it was judged a significant one, so step 8 shipped 2D cues.

**Where things stand.**
- Camera: `src/views/map2d/camera.js` — `sx(x)`, `sy(y)` are separable plan-view projections; `fit`, `frame` (follow),
  `zoomAt`; inverse `wx`, `wy`.
- `src/views/map2d/map.js` makes 21 `SX(…)` and 21 `SY(…)` calls, each taking x and y separately. The track surface is
  one thick stroke (`map.js:86`; height-tinted buckets at `map.js:87`). Car markers rotate a plan-view polygon
  (`drawCar`, `map.js:56`).
- `src/app/main.js`: `handleAt` and the edit-mode drag/insert use `WX`/`WY` (4 calls), so pointer input assumes the plan view.
- Heights are available: `T.z` per station, `disp.pz` on snapshots, `pose().z`.

**Approach (sketch).**
- Camera gains a tilt `τ` and a height exaggeration `e`: `P(x, y, z) → [sx, sy]` with
  `sy = (y·cosτ − e·z·sinτ − y0)·zoom + ch/2`. At τ = 0 it must be today's projection, bit for bit (camera tests).
- `map.js` call sites move to `P(x, y, z)`. The track surface becomes projected quads per segment (edges at ±half-width
  along the normal, at the station's height), drawn far-to-near (painter's order by projected depth). With no banking,
  both edges share the station's height.
- Depth cues: thin vertical "curtain" lines from the track down to z = min at intervals, or a ground shadow of the plan
  view, so height reads as height rather than as a distorted plan.
- Cars: project the footprint's four corners rather than rotating a screen polygon.
- Editing: disable tilt while editing (simplest), or unproject at the handle's own height.
- `fit`/`frame` must work on projected extents.
- UI: a "Tilt" toggle or slider near the zoom buttons. `S.cam` holds τ.

**Decided.** Canvas 2D, not WebGL (WebGL is step 9). z is up, in today's y-down frame. The handedness conversion belongs
at the 3D boundary (`ARCHITECTURE.md` §10.3).

**Open questions.** Fixed tilt angle or a slider? Rotate the view (yaw) too, or only tilt? Height exaggeration: auto
(scale the height range to a fraction of the plan size) or fixed? Do corner labels and tags follow the projection?

**Verify.** Camera unit tests (τ = 0 bit-identical; a point's projected y moves by −e·z·sinτ·zoom). Screenshots in
headless Chrome via the CDP driver. Pointer edits still land on the right handle at τ = 0, and tilt is disabled in edit
mode.

**Size.** M–L, about the size of P6 (the UI step of elevation). Risk is in painter's-order artefacts where the projected
track overlaps itself.

## A2. Banking

**Prerequisites** (`reviews/2026-10-24-elevation-review.md`): E-M1, n ≤ 0 clamped to 0 keeps downforce grip off the
ground. E-L6 is done (`5b29646`): closed-form tests on a parabolic crest now guard kv, cth, the cth term of n, the grade
sine, `dynNominal`'s path acceleration and `dynLap`'s plan motion, which banking rewrites; extend them to banked
sections rather than lean on the golden regeneration.

**Why.** Many real hilly corners are banked, which adds `g·sinφ` of lateral support. Without it, hilly corners here are
harder than real ones (`ARCHITECTURE.md` §4.7). It's the natural next physics step after step 8.

**Where things stand.** No bank data anywhere. The track's cross-section is level: both edges sit at the centreline's
height. That's why every elevation input is a per-station constant independent of the line, so none adds a gradient path
through the offsets (§4.7).

**The big change.** With bank φ, height varies across the track: `z(off) = z_c + off·sinφ` (sign convention to decide).
Then `dz`, grade and vertical curvature **depend on the line**, so they become functions of the offsets and new adjoint
paths appear (through `off`, not just `ds`). That's most of the work, and it also covers A4 naturally (grade from the line
driven).

**Physics.**
- Lateral balance in the banked plane. The closed form for a linear tyre is
  `v²·k = g·(sinφ + μ·cosφ)/(cosφ − μ·sinφ)`, use it as the test.
- Normal load gains a lateral component: `n = cosφ·(cth + v²·kv/g) + (v²·k/g)·sinφ` in the banked frame. That needs
  deriving carefully; consider writing the frame transform out in `ARCHITECTURE.md` first.
- The load tables (`car.load`, `src/core/car.js:58-66`) already give grip against n. Banking mainly changes the demand
  and n, not the tables.
- Dynamics: `dynLap` needs the gravity component across the road (`src/dynamics/bicycle.js:87` onwards). `grades(T)`
  (`bicycle.js:48`) gains bank.
- `makeBounds` is unchanged (the plan-view width is the same).

**Data and UI.** Bank per control point (`ctrl[i][3]`? Note that the app already uses index 3 for the generator unit
height `u`, `src/app/state.js:11`, so pick a layout), splined like z. A generator option (bank into corners, scaled by
curvature?) and per-point editing like heights. Run files go to v3 (migration v2 → v3: bank 0, exact).

**Open questions.** Generated banking: none by default, or proportional to corner tightness? Max bank angle (real
circuits: Daytona 31°, typical road courses < 10°)? Is the sign convention relative to the turn direction or absolute?

**Verify.** The closed-form banked corner (as `tests/elevation.test.mjs` does for crests). FD gradient on banked circuits
with coverage asserts (the new offset paths exercised). Flat and unbanked bit-identical (goldens, and the hilly goldens
too). Dynamic check in bounds on banked circuits, with a teeth test as in P4.

**Size.** L, comparable to elevation P1–P4. Risk: the adjoint's new offset dependence.

## A3. Load tables only for the reachable load range

**Not workable as written** (measured 2026-10-24). A table range must hold for any line the optimiser tries, so it has
to be bounded at top speed on every station, and there a 400 m crest already unloads a car below 0: at the Hills
slider's 40 m the static range needs 14–17 of the 17 levels for every car but the Kart (Millbrook Park 10–13). The
0.82–1.33 below is n along laps actually driven, not a bound. What landed instead: the GGV of the load levels by
Illinois regula falsi (`solveIll`), halving the build (about 250 → 140–170 ms per car on hills), which also paid for
E-M1's levels below 0 (Open-wheeler 308 ms). Kept below for the record.

**Why.** `buildCar({loads: true})` takes ~250 ms in Node against ~16 ms flat, on every car change on a hilly circuit
(17 load levels; `NL`, `NSTEP` at `src/core/constants.js:4`; `car.js:63`). Real circuits use a narrow band: n along the
lap was 0.90–1.12 for the GT racer on Harrow Ring at 40 m (gradient-test coverage), and 0.82–1.33 across the presets at
40 m (review).

**Approach.** Bound n per circuit: `n ∈ [min(cth) + vTop²·min(kv)/g, max(cth) + vTop²·max(kv)/g]`, padded and clamped
to [0, 2], snapped to the grid. Build only those levels (keeping n = 1 as a node, and the grid alignment). The solver
already decides when a car needs tables (`needsLoads`, `src/solver/solver.js:12`, `:63`, `:75`, `:87`). It would also
pass the range, and rebuild when a new circuit needs a wider one. Lookups outside the built range must clamp **and
report** (as `ntop` does today), not read garbage.

**Alternative or complement.** Fewer GGV bisection steps (24 today), checked against the existing accuracy test
(`tests/elevation.test.mjs`, "interpolate in n").

**Verify.** Lap times identical to full tables wherever the lap stays in range (bit-identical, since it's the same
slices). Timing before and after. A test that widening the hills triggers a rebuild.

**Size.** S–M.

## A4. Grade and vertical curvature from the line driven

**Why.** Grade (`cth`) and vertical curvature (`kv`) are per station from the centreline (`src/core/track.js:43` onwards).
Energy is exact anyway (`dz` with the line's 3D `ds`), but an inside line sees steeper grade and tighter vertical
curvature. The review measured up to **44 ms of lap** (Open-wheeler, Kestrel Point, 40 m) and a load-factor error up to
0.155.

**Approach.** Derive `cth`/`kv` from the line's own horizontal steps (`dh` in `lapEval`, `src/core/lap.js:82` onwards).
That adds a gradient path through `dh` into `n`.

**Recommendation.** Fold into A2 (banking makes `dz` itself line-dependent, which is the bigger version of the same change).

**Verify.** FD gradient. The measured lap delta (it should match the review's ≤ 44 ms).

## A5. Lateral demand on horizontal speed

**Why.** Demand is `v²·k_h` with the 3D speed. With no banking, the true horizontal acceleration is `(v·cosθ)²·k_h`, so
corner speed is about 1.1% pessimistic at 15% grade.

**Approach.** Corner speed at an effective curvature `k·cth²`. `cth` is a per-station constant, so the adjoint change is a
scale on `gk` (small). Same in `dynNominal`/`dynLap`.

**Recommendation.** Do it with A2 (the banked frame derivation covers it).

**Verify.** Closed form; FD gradient.

## A6. Hilly `lapEval` speed

**Why.** 366 µs per `lapEval` with gradient on 40 m hills against 220 µs flat (GT racer, Harrow Ring). On generated hills
every station takes the slow path (0 "still" stations).

**Ideas (profile first).**
- Precompute the per-station `level`/`still` flags in `buildTrack` instead of the closures (`src/core/lap.js:88`).
- Avoid repeated `loadAt`/`tab3` per step.
- A3 reduces table size, which may help cache behaviour.
- Inlining the load-grid lookup only saved 7%.

**Verify.** Bit-identical results; a micro-benchmark like the one in the P3 commit message.

## A7. Rolling resistance under real normal load

**Why.** Rolling resistance is `g·CRR` per unit mass, ignoring downforce and load factor. Making it follow real normal
load is more accurate, but it **changes flat results**: every golden.

**Approach.** `rr = CRR·(g·n + DF/m)` in the passes and dynamics, plus the adjoint (rr then depends on speed through DF).

**Decided.** Do it on its own, so its golden diff is reviewed in isolation (Q, step 8 planning).

**Verify.** Regenerate goldens and review the diff. The parity test vs the prototype will then fail by design: delete it
then (`CLAUDE.md`).

## A8. Merge the flat and hilly code paths

**Why.** `lapEval` has parallel flat and hilly branches in the forward pass, backward pass and both adjoints. The review
noted that at n ≡ 1 the hilly formulas reduce to the flat ones (`fz = 0`, `−2G·0`, `√(x + 0)`), so one path might be
bit-identical, **unverified**.

**Approach.** Try a merged path in an `APEX_SRC` copy and run the goldens. Any −0/+0 or operation-order difference fails
them. Weigh the speed cost on flat circuits (the hilly path is ~1.7× slower).

**Recommendation.** Only if a future change keeps paying the duplication tax. The goldens make the experiment cheap to judge.

## A9. Cosmetic: height tint, label collisions

- The height tint (`--elev0`, `--elev1` in `index.html`'s light and dark blocks, `src/views/map2d/colors.js`) is subtle.
  Stronger colours are a two-line change, but keep them distinct from the speed ramp of the line on top.
- In edit mode, handle height labels can overlap corner labels (`map.js`, the edit-handles block). Corner labels already
  avoid each other (`placed`), so handle labels could join that.

## A10. "Needs load tables" checked at the boundary

**Already true** (found 2026-10-24, by a probe and by the elevation review): `Optimizer.setup` and the `DynCheck`
constructor both evaluate a lap, so they throw at construction. `tests/elevation.test.mjs` pins it (`385bbb2`). The
original note is kept below.

**Why.** `lapEval` throws "a hilly circuit needs a car built with {loads: true}" deep in the hot loop
(`src/core/lap.js:82` onwards). The solver always builds the right car now, but other callers
(`Optimizer.setup`, `DynCheck`) would only find out on first evaluation.

**Approach.** Check in `Optimizer.setup` and the `DynCheck` constructor (where track and car meet), with the same message.
Keep the `lapEval` check as the last line of defence.

**Size.** S.

## A11. Dynamic traces have no height — **done** (3D plan task 0.2)

`dynLap` (`src/dynamics/lap.js`) now pushes `tr.z` with every trace sample: the centreline height `T.z[seg]` to
`T.z[seg+1]` interpolated by the observation's `f` (the cross-section is level, so it holds for every line). `tracePose`
returns it as `z` (0 for a trace without `z`, e.g. an older one). Pinned by three tests in `tests/elevation.test.mjs`
(`pose: … trace …`). Still no `grade` on a trace pose; add it when something needs it.

---

## B1. Saved runs: show more of the comparison (TODO #6)

**State.** Run files (v2) reload across builds. The pre-elevation v1 fixture reproduces its lap bit for bit through the
migration (`tests/runfile.test.mjs`), so cross-version comparison has been proven once, across the elevation change.

**Gaps.**
- The recorded dynamic-check percentage shows in the load info, but nothing compares it with a fresh check on the new
  build. Add "dynamic check: recorded 97.8%, now —" (running it on demand).
- Files record `userAgent`, but the UI doesn't show it. Node and Chrome differ by tens of ms, so show the runtime when it
  differs from the current one.
- TODO #6 stays open until a real comparison across a physics change has been used in anger. A7 would be a good first one.

## B2. Ghost from a run whose station count changed

If `buildTrack` ever changes the station count for the same control points, *Load run* still works (the line is
resampled), but the recorded lap is refused as a ghost (`ghostFrom` in `src/app/controls.js`). A ghost resampler
(arrays by arc fraction, `tc` re-integrated) would lift that. Not needed until something changes N.

---

## Elsewhere

- **3D view** (migration step 9): **done** 2026-10-25 (`ARCHITECTURE.md` §3 and §11; plan `PLAN.md`, record
  `STATUS.md`). Left open there: whether A1 closes (above); the camera select widening under reduced motion; Streaks
  not offered in Bonnet; pair framing ignoring the inset; a direct check of the 3.6 label positions. Banking (A2) has its
  3D input ready (`stationFrames`' `bank`, zeros today).
- README TODO items 7 (tyre degradation), 8 (weather), 9 (simple controls mapping to the full parameters).
- `ARCHITECTURE.md` §12: presets are seeds (store generated control points as data); the dynamic check's driver gains
  were tuned on two presets; the lap and dynamic models disagree more for some presets (not investigated).
- `tests/golden.json` meta says `dirty: true` (the step 8 tooling was uncommitted when it ran). The next regeneration
  clears it.
