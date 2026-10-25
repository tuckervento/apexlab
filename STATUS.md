# STATUS

_Last updated: 2026-10-25 (wave A)_

## Snapshot

5 of 31 tasks done. Wave A (1.1, 1.2, 1.3, 1.4, 2.6) is merged to `main`. Phase 1 is complete: browser results are
now trustworthy. On `main`:
- 449/449 tests pass;
- all 26 scenarios exit 0 in two full passes, with the Mac in dark mode;
- `src/` and the goldens are unchanged.

Next: wave B (2.1–2.5).

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

## Next Up

- Wave B: 2.1, 2.2, 2.3, 2.4, 2.5 (no dependencies; Node-only test cuts).
