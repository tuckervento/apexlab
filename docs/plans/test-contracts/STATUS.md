# STATUS

_Last updated: 2026-10-26 (wave F, plan complete)_

## Snapshot

**The plan is complete:** 31 of 31 tasks (waves A–F) are merged to `main`.

**What changed:**
- The default suite asserts contracts. There's no `assertRuntime`, no `golden.json` reads, no prototype parity and
  no old-checkout PNG baseline.
- Exact numerical evidence is the opt-in `node tools/numeric-report.mjs`.
- The guidance (`CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md` §8, `README.md`) describes the new workflow, which closes
  the interim-guidance item.

**On `main`:**
- 495/495 tests pass;
- race mutations 22/22 rejected;
- the numeric report says "identical (587 quantities)";
- all 26 scenarios exit 0 in two passes;
- `src/` changed only by 3.5's `client.js` reorder; the goldens are unchanged.

## Completed

- [x] 1.1 ghost-pin asserts its outcome (Codex) — done 2026-10-25 — `tc/1.1` `b744823`, merge `d92bc21` — verified:
  passes twice; with `settled()` always true it exits 1 with `pinDisabledWhilePending` and `pinNothingWhilePending`
  false.
- [x] 1.2 refused asserts its outcome (Codex) — done 2026-10-25 — `tc/1.2` `5ec4f07`, merge `849a942` — verified:
  passes twice; with `refused()` not restoring the panel it exits 1 with `massRestored`, `sliderRestored` and
  `ctrlFirstRestored` false.
- [x] 1.4 references: missing fails, writes explicit (Codex) — done 2026-10-25 — `tc/1.4` `408aa47`, merge `5de8407` —
  verified:
  - `webgl2` passes in verify and update mode;
  - with the old write-on-missing branch restored, `webgl2` exits 1 with `missingReference` false;
  - with `kerbs-chase.png` removed, `kerbs` exits 1 with "MISSING reference";
  - update mode writes it and exits 1 with "UPDATED reference (review)";
  - restored from git, `kerbs` passes.
- [x] 2.6 browser scenario cuts (Codex; context-loss wait fixed by Codex after review) — done 2026-10-25 — `tc/2.6`
  `0e26dee`, merge `bb1b8e9` — verified:
  - `scene3d` and `simple` pass in both full passes on `main`;
  - road hidden → `roadDrawn` false;
  - road geometry leaked on rebuild → `rebuildsStable` false;
  - the Brakes header rendered as "Brake" → `sectionOrder` (and `knobsLeadTheirSection`) false.
- [x] 1.3 runner classifies results (Codex; colour-scheme pin added at review) — done 2026-10-25 — `tc/1.3` `5d96b1a`,
  merge `e45ca09` — verified:
  - `tests/cdp-classify.test.mjs`: 19 tests. Codex's teeth: ignoring console errors fails 3 tests; a pass-through
    `mediaParams` fails 2.
  - all 26 scenarios exit 0 twice;
  - `refused` without its declaration exits 1 naming both unexpected errors;
  - `simple` with a never-logged expectation exits 1 naming it.
- Wave A on merged `main` (`e45ca09`), with the Mac in dark mode: suite 449/449; 26 scenarios exit 0 in two passes;
  `git diff 76b8477 HEAD -- src tests/golden.json prototype vendor` is empty.
- [x] 2.1 scene3d incidental assertions (Codex) — done 2026-10-25 — `tc/2.1` `dbabd9c` — verified: Codex's 12 named
  mutations; the coordinator's own (the margin dropped from `cornerAnchor`) fails "anchor distance from centreline".
- [x] 2.2 simple and elevation incidental assertions (Codex) — done 2026-10-25 — `tc/2.2` `5bdae4c` — verified:
  - Codex's 11 mutations, including a seventh `CARS` base passing with no test edit;
  - the coordinator's own (grade limit 0.24) fails "24.9% grade is within the 25% limit".
- [x] 2.3 race station goldens (Codex) — done 2026-10-25 — `tc/2.3` `3185965` — verified: `check-race-mutations`
  rejects all 22 mutations (10 new, each tied to its assertion message), including the crossing-reset defect
  (caught by before-finish window 4).
- [x] 2.4 camera fit (Codex) — done 2026-10-25 — `tc/2.4` `a104b89` — verified:
  - the expected bounds are hand-derived from the padding policy;
  - Codex's mutations (`padB` ignored, corner-centred) fail;
  - the coordinator's own (half the side padding) fails "390x760: road edges inside clear area".
- [x] 2.5 playback known examples (Codex) — done 2026-10-25 — `tc/2.5` `c600954` — verified: Codex's 15 mutations each
  fail a quoted assertion; the coordinator's own (`ay` sign flipped) fails "right bend ay is +2 m/s²".
- Wave B on merged `main` (`5899dfb`): suite 457/457; race mutations 22/22 rejected;
  `git diff daaf7f7 HEAD -- src tests/golden.json prototype vendor tools` is empty; ledger complete for 2.1–2.5 (no
  placeholders).
- [x] 3.1 `track.test.mjs` (Codex) — done 2026-10-25 — `db1db8d` — verified: Codex's mutations (normal sign, fold
  limit, half-width); the coordinator's (fold limit loosened on one side) fails "positive bound reserves car width and
  inside fold clearance".
- [x] 3.2 `units.test.mjs` (Codex) — done 2026-10-25 — `8705cd8` — verified: Codex's (km/h factor 3.5, % left
  unconverted); the coordinator's (slip angle ×π/90) fails "slipPeak: 30 degrees is π/6 radians".
- [x] 3.3 `flat-model.test.mjs` (Codex) — done 2026-10-25 — `65318fa` — verified: Codex's (drag 0, CRR halved); the
  coordinator's (`RHO` 1.2) fails the drag test and the downforce corner-speed test.
- [x] 3.4 seeded perturbations in `gradient.test.mjs` (Codex) — done 2026-10-25 — `6ba0bb9` — verified: +124 ms;
  Codex's (one adjoint term dropped) fails all eight new checks; the coordinator's (a different term, `gk[b]`) fails
  36 gradient checks.
- [x] 3.5 client consuming boundary (Codex; `client.js` fix by Q's decision) — done 2026-10-25 — `bcc1796`, merge
  `ac7b75f` — verified:
  - the old-snapshot guard removed fails "an older car snapshot cannot replace the displayed line";
  - `trackRev` dropped from currency fails "track revision change makes the displayed result stale";
  - the old hook order fails "trackArrived observes the new track together with its matching line";
  - all 26 scenarios pass twice on `main` after the reorder.
- [x] 3.6 `describe` adapter contract (Codex) — done 2026-10-25 — `3dee41b` — verified: Codex's (mass dropped from
  the force conversion); the coordinator's (traction not ×mass) fails "traction acceleration converted to N"; ledger
  filled.
- Wave C on merged `main` (`ac7b75f`): suite 506/506; race 22/22;
  `git diff 9ed63cc HEAD -- src tests/golden.json tools prototype vendor` = `src/app/client.js` only (+6/−4); all 26
  scenarios exit 0 in two passes.
- [x] 4.1 input fixtures (Codex) — done 2026-10-25 — `ff3228f` — verified:
  - all 30 fixture lines and centreline laps re-score to `golden.json` exactly (`Object.is`) on V8
    14.6.202.34-node.40;
  - regeneration is byte-identical;
  - Codex's sampling mutations (stations /5, L+1) are rejected by name;
  - the coordinator's (one control point moved 40 m) → "Fixture GT racer|Harrow Ring: geometry mismatch (N 775 vs
    783, …)".
- [x] 5.4 accepted-line publication at the boundary (Codex) — done 2026-10-25 — `de206bb` — verified: publishing the
  trial buffer (`solver.js:137`, rerun by the coordinator) fails "every snapshot line equals Optimizer.current() at
  publication" and "publication after rejection shows the previously accepted line"; `current()` returning `off`
  fails "rejection preserves the previously accepted line".
- [x] 4.2 fixture consumers (Codex) — done 2026-10-25 — `4f28916` — verified: `elevation.test.mjs` passes 32/32 with
  a `golden.json` copy that has no combos at all (the coordinator reran this); a broken clean-lap condition fails
  "Road car: final lap not clean".
- [x] 4.3 saved-file compatibility (Codex) — done 2026-10-25 — `8ed26c3` — verified:
  - 18 mutations each fail their intended assertion: a corrupted published offset, a missing v1 pz, a lap +1 s, the
    completion order, each error field name;
  - the coordinator's (the level-ground `nz` default set to 0.5) fails "load factor filled with 1 (level ground)";
  - ledger filled.
- [x] 5.5 numerical comparison report (Codex) — done 2026-10-25 — `282ca69` — verified:
  - on unchanged source, "identical (587 quantities …)", exit 0, ~11–15 s;
  - a mechanical refactor (independent `px`/`py` assignments swapped): identical;
  - `CRR` 0.013 and (coordinator) `ETA` 0.91: delta tables, exit 1;
  - a simulated runtime mismatch: one non-success line, exit 2.
- Wave D on merged `main`: suite 540/540; race 22/22;
  `git diff fae8411 HEAD -- src tests/golden.json tools prototype vendor` = `tools/numeric-report.mjs` only; no ledger
  placeholders.
- [x] 5.3 fixed-line and dynamic-check contracts (Codex) — done 2026-10-25 — `ea06561` — verified:
  - `golden.test.mjs` is deleted; `fixed-line.test.mjs` covers all 30 fixtures, with bounds from model constants
    (the 900 s horizon, the trouble thresholds, at most 8 probes = 2 + six halvings of [0.80, 1.0] to < 0.004);
  - Codex's 7 mutations (including driver gains ×0.3) fail named contracts;
  - the coordinator's (bisection accepting a run with trouble) fails 22 cases, "final lap at frac 0.940625 not
    clean".
- [x] 5.1 search budgets (Codex) — done 2026-10-25 — `1057425` — verified:
  - the measurements are in `docs/investigations/search-budgets.md`: healthy direct and protocol runs reach gain
    1.0, 78,063 evaluations, ~8.2 s;
  - each of 7 broken optimisers falls outside a named bound;
  - **Q approved** gain ≥ 0.9987, ≤ 160k evaluations and steps, a 120 s watchdog, and a hilly case;
  - the coordinator reran the skip-polish fault: it fails "search gain >= 0.9987".
- [x] 5.2 search contracts (Codex) — done 2026-10-25 — `430e20a` — verified:
  - optimisation bypassed fails the gain contract;
  - an out-of-bounds offset fails "returned line inside bounds";
  - `exactLap` or the snapshot lap +1 s fails the fresh-rescore check;
  - a better feasible line (78.37714547 → 78.37710768 s) passes;
  - the coordinator's (halved stall threshold) fails "search gain >= 0.9987";
  - the hilly run adds ~18 s.
- Wave E on merged `main` (`1a110c9`): suite 513/513; race 22/22;
  `git diff 90642ee HEAD -- src tests/golden.json tools prototype vendor` is empty; no ledger placeholders; numeric
  report "identical".
- [x] 6.1 delete prototype parity (Codex) — done 2026-10-25 — `ee70c6f` — verified:
  - `parity.test.mjs` and `load-prototype.mjs` are deleted; nothing imports them; `prototype/apex-lab.html` is
    unchanged;
  - the ledger maps every parity group to its replacement;
  - eight mutations across `src/` (normals, clearance, units, drag, lap time, gradient, search, dynamic check) still
    fail named contracts without parity.
- [x] 6.3 `view-toggle` without the old-checkout PNG workflow (Codex) — done 2026-10-25 — `189ddfa` — verified:
  - one reviewed tolerant 2D reference (`view-toggle-2d.png`) generated by the coordinator, then two runs at
    fraction 0;
  - the inset moved to the top on phones fails `phoneInsetClear844` and `phoneInsetClear520`.
- [x] `view3d` `kartSmaller` wait (Codex; Q asked for it before the closing checks) — done 2026-10-25 — `76e241f` —
  verified:
  - it had failed 2 of 5 runs at load 14–23 (a fixed 100 ms wait after the car switch); with the fix, 4/4 pass at
    load 11–16;
  - with the scene never rebuilding cars it fails "check kartSmaller is false" (exit 1, a named check).
- [x] 6.2 retire historical gates and rewrite guidance (coordinator; reviewed by Q) — done 2026-10-26 — `942d296` —
  verified:
  - no default-run test reads `golden.json` or calls `assertRuntime` (grep);
  - `CLAUDE.md`, `AGENTS.md`, `README.md` and `ARCHITECTURE.md` name `tools/numeric-report.mjs`;
  - no ledger placeholders;
  - no helper removed: every `golden-util` export is still used by the generators, the report or the fixed-line
    test.
- Wave F on merged `main` (`bd5c2fa` plus `942d296`): suite 495/495; race 22/22; numeric report identical;
  `git diff a57e749 HEAD -- src tests/golden.json prototype vendor` is empty; all 26 scenarios exit 0 in two passes.

## In Progress

## Blocked

## Deviations & Decisions

- 2026-10-25: wave A runs as one parallel cycle (Q's request, `/iterate-plan wave A`), not iterate-plan's one task per
  cycle, as the 3D plan did. Its waves are in PLAN.md "Parallelizable Tracks".
- **1.3 ran after 1.4** as well as after 1.1 and 1.2: both touch `webgl2.mjs`.
- **2.6 went beyond its task text:** it also replaced the fixed sleeps in `simple.mjs` and `scene3d.mjs` with
  `settled()` and event waits. Its first context-loss wait listened for `webglcontextrestored` on the canvas and
  never saw it (both three.js and `scene.js` `preventDefault` the lost event; the exact timing cause wasn't pinned
  down). With Q's OK, Codex changed it to poll the `events` list that `onLost` fills, against a deadline; a timeout
  is now a named false check.
- **1.3 additions:**
  - `driver-version.mjs` returned no checks. Its five asserts became named boolean checks (within 1.3's scope).
  - **Colour-scheme pin (Q approved):**
    - Cause: headless Chrome follows the macOS appearance, and this Mac switches to Dark at sunset, after which every
      light-theme reference failed (`scene3d` at 0.9997).
    - Fix: the driver now sets `prefers-color-scheme: light` before navigation, and `mediaParams` merges it into
      scenarios' `setEmulatedMedia` calls unless they name a scheme. `theme3d` uses `data-theme`, so it's unaffected.
- **Coordinator mutation choices:**
  - Deleting or renaming the Brakes group in `sliders.js` broke the car panel (`settled()` never returned).
  - The section check was shown instead by changing only the rendered `<h3>` text (`controls.js:128`).
- **Open observation:**
  - **`trace3d`:** in pass 2 its reference compared at 0.0000078 (8 px), after 0 in pass 1. That's inside tolerance
    and the scenario passed, but it breaks the run-twice-at-0 discipline. Like the earlier `view-toggle`/`view3d`
    panel-text drift, it's a candidate flake to pin down; not acted on.
  - **`webgl2`'s 0.0117** is its deliberate shifted-image self-test.
- **Wave B:**
  - The ledger was created on `main` before the wave, with one placeholder section per task, so five parallel branches
    could fill it without conflicts.
  - Three Codex jobs stopped under an over-broad "stop if surprised" prompt line (2.1 on its own mistyped path, 2.5
    on an optional mutation, 2.3 on an error in its own ledger entry) and were resumed with the rule narrowed to
    surprises about the code or the task. Future prompts say this up front.
  - 2.3 split the finish test into four cases (windows 3 and 4 × before/after the finish). Only window 4 rejects the
    crossing-reset mutation; both windows are kept, as the task required.
- **Wave C:**
  - Ran as six Codex jobs at once (above PLAN's ~4); Node-only review kept that manageable.
  - **3.5 found a real ordering issue** and Q chose to fix it, a deliberate exception to PLAN's "nothing under
    `src/`". `onSnapshot` called `trackArrived()` (and the ghost drop) after installing `S.T` but before `S.disp`, so
    the hook saw a new track with the old line. Nothing rendered in that gap, and the hooks read only `S.T` and
    `S.ghost`, but the order is now: install both, then run the hooks. `client.js` is outside both hashes.
- **Recurring flake (open):** a small second-run drift in a screenshot reference, now seen three times:
  - `view-toggle`/`view3d` (panel text) at wave A;
  - `trace3d` (8 px) at wave A;
  - `streaks3d` (0.001) at wave C.

  It's always on the second run, always within tolerance, and always 0 on rerun. It looks like one cause (the web
  font or text rasterisation is the leading theory) and deserves an investigation before 6.3 decides `view-toggle`'s
  byte comparison.
- **Wave D:**
  - Ran in two stages: 4.1 and 5.4, then 4.2, 4.3 and 5.5 on the merged fixtures. The coordinator fixed 4.1's API in
    the plan (`fixed-lines.json`; `fixture-util.mjs`'s `loadFixedLines`/`fixtureCase`, which reject a geometry
    mismatch by name), so stage 2 could rely on it.
  - 4.2 builds the hilly track from the hilly fixture case after checking its x/y match the flat case exactly, and
    dropped the flat-fraction diagnostic.
  - 4.3 stopped correctly when its first missing-fields replacement passed a mutation that stopped naming the
    fields; it now requires every name, with two missing at once.
  - **5.5 counts quantities by shape:** a structural change (an object becoming `null`) counts as one quantity, so a
    differing run can show fewer than 587. The change is still listed; objects print as `[object Object]`
    (cosmetic).
- **Wave E:**
  - **Gain threshold (Q's decision):** Q chose 0.9987 over the coordinator's suggested 0.99. That leaves the healthy
    run ~9.6 ms of slack, and it also catches a halved stall threshold, which the coordinator had argued is a
    tuning variant. A valid future optimiser change that lands just under it means a deliberate re-calibration,
    recorded in `search-budgets.md`.
  - 5.1 had no per-stage iteration limit to halve, so a halved stall threshold stood in for that broken case.
  - **Interim guidance (open until 6.2):** the default suite now asserts no historical values, but `CLAUDE.md`
    still states the old golden rule. Until 6.2 rewrites it, exact mechanical-refactor evidence is
    `node tools/numeric-report.mjs`.
- **Wave F:**
  - 6.1 and 6.3 changed code only, so 6.2 could do all the guidance in one reviewed pass. The 6.1/6.3 ledger merge
    conflict was resolved by keeping both sections.
  - The drift investigation **didn't reproduce** the second-run screenshot drift (15 runs, load 8–23, all at 0). It
    did find the `view3d` `kartSmaller` fixed-wait flake, fixed with Q's OK.
  - The drift appeared once more in the closing checks (`view-toggle`'s new reference, 0.001 on pass 2). It's
    recorded as open in `docs/deferred.md` "Elsewhere"; the suspected cause is web-font or text rasterisation.
  - **Interim guidance: closed** by 6.2.
- **Plan close:** the plan is archived to `docs/plans/test-contracts/` (PLAN.md, STATUS.md), as the 3D plan was.

## Next Up

Nothing: every PLAN.md task is done. Left open, outside the plan:
- **The second-run screenshot drift** (`docs/deferred.md` "Elsewhere").
- **Search budgets:** re-calibrate them deliberately if an optimiser change lands below them.
