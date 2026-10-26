# STATUS

_Last updated: 2026-10-25 (wave C)_

## Snapshot

16 of 31 tasks done. Waves A–C are merged to `main`, completing phases 1–3: the independent coverage that parity and
the goldens will be replaced by now exists. On `main`:
- 506/506 tests pass;
- `check-race-mutations` rejects all 22 mutations;
- all 26 scenarios exit 0 in two passes (Mac in dark mode);
- the goldens and `tools/` are unchanged;
- `src/` differs only by the Q-approved `client.js` reorder (3.5).

Next: wave D (4.1 and 5.4, then 4.2, 4.3 and 5.5).

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

## Next Up

- Wave D: 4.1 (input fixtures out of `golden.json`) and 5.4 (accepted-line publication), then 4.2, 4.3 and 5.5 (all
  need 4.1).
