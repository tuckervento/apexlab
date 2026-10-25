# STATUS

_Last updated: 2026-10-24 (Wave A: 0.1, 0.2, 0.3, 0.5, 1.6, 2.5, 5.2)_

## Snapshot

7 of 33 tasks done (Wave A), merged to `main` 2026-10-24: 281/281 tests, physics hash current, all 7 scenarios exit 0.
Next: Wave B (0.4, 5.1).

## Completed

Branches are listed with their commit; Claude-subagent branches live in `.claude/worktrees/agent-*`, Codex ones in
`../apexlab-wt/<id>`. "Verified" means re-run by the coordinator, not only the agent's report.

- [x] 0.1 `smoothPose` (Codex) — done 2026-10-24 — `3d/0.1` `017b4fc` — verified: `tests/smooth-pose.test.mjs` 4
  tests pass; full suite 267/267; `tests/playback.test.mjs` diff empty; teeth (linear in place of Hermite) failed the
  boundary-jump (0.389 rad) and 60 Hz (0.388 > 0.029) checks; max 60 Hz heading change 0.0266 vs bound 0.0284 rad.
- [x] 0.2 A11 trace heights (Claude Opus; Sonnet attempt blocked) — done 2026-10-24 —
  `worktree-agent-add1e1f07e2829301` `7948f65` — verified: full suite 266/266; `make-physics-version` "committed file is
  current", driver sha unchanged; golden/playback diffs empty; three new tests in `tests/elevation.test.mjs`; teeth: 4
  mutations (no interpolation, wrong segment, `z:0` in pose, lateral leak) each fail a test.
- [x] 0.3 vendor three.js 0.186.1 (Claude Opus) — done 2026-10-24 — `worktree-agent-ace2684247e79fd5f` `65bf59f` —
  verified: coordinator re-downloaded the tarball, sha512 = registry `dist.integrity`, vendored `three.core.js`,
  `three.module.js`, `LICENSE` byte-identical (`cmp`); `tests/vendor-three.test.mjs` 4 tests pass; full suite 267/267.
- [x] 0.5 headless WebGL2 + screenshot compare (Claude Sonnet) — done 2026-10-24 — `worktree-agent-abe963dfb64bf3214`
  `a58d188` — verified: `APEX_PORT=8771 APEX_DEBUG_PORT=9341 node tools/cdp.mjs tools/scenarios/webgl2.mjs` exit 0,
  renderer "ANGLE (… SwiftShader driver)", `EXT_clip_control: true`, diff identical 0 / 1 px shift 0.0117;
  `refused.mjs` exit 0.
- [x] 1.6 stage layout, 3D canvas + inset minimap (Claude Opus; Sonnet attempts blocked) — done 2026-10-24 —
  `worktree-agent-afeb5ccf91731d6ff` `d42e9ab` — verified: `VIEW_TOGGLE_BASELINE=<main baseline> node tools/cdp.mjs
  tools/scenarios/view-toggle.mjs` exit 0, `allTrue`, `unchanged2d1280`/`unchanged2d390` true (byte-identical to
  main); full suite 263/263.
- [x] 2.5 cosmetic attitude/steer/spin (Codex) — done 2026-10-24 — `3d/2.5` `7b0670c` — verified:
  `tests/scene3d-attitude.test.mjs` 4 tests pass; full suite 267/267; teeth: roll forcing sign reversed fails the
  peak-roll check.
- [x] 5.2 `traceClock` (Codex) — done 2026-10-24 — `3d/5.2` `f9158a7` — verified: `tests/trace-clock.test.mjs` 3 tests
  pass; full suite 266/266; teeth: no alignment subtraction / forced `ended:false` each fail.

## In Progress

## Blocked


## Deviations & Decisions

- 2026-10-24: the plan file is `PLAN.md` (committed in `268d3f9`); its text still calls itself `PLAN-3D.md` in four
  places (the API revision checkpoints and tasks 0.3, 1.7, 1.8). Read those as `PLAN.md`.
- 2026-10-24: Wave A ran as one parallel cycle of 7 tasks (Q's request), not iterate-plan's one task per cycle.
- 2026-10-24: Sonnet 5.5 subagents were blocked 6 times by the API safeguard `[reasoning_extraction]` (0.2, 0.3, 1.6;
  rewording the prompts didn't help). The likely trigger is the DOING/EXPECT format Q's global CLAUDE.md requires. Q
  decided: Codex is the default subagent; Claude subagents run on Opus; the main session coordinates and reviews.
- 0.1: acceptance (a) is met at every station but the lap's final timestamp `tc[N]`, where `pose()` clamps to `t − 1e-6`
  and Hermite and linear differ by 2.2 µm. Accepted as met.
- 0.1: `ARCHITECTURE.md` §10.2 still says "Not yet: `pitch`"; `smoothPose` now gives pitch. Fix at merge.
- 0.2: PLAN's "between the heights of its station and the next" is loose. A sample's height comes from its observed
  segment, which is `st` or `st − 1` (about half the samples), and the test checks that. The height is also from one
  4 ms step before the sample's `x`/`y` (`observe` runs before `plantStep`): a few mm, invisible, but relevant to any
  exact `z`-vs-`x`/`y` comparison.
- 0.3: the "Importing three" Context paragraph in PLAN.md was corrected (on its branch). `three.module.js` imports in
  Node without a DOM (only `new WebGLRenderer()` throws); addons import the bare `'three'`, so any module that imports an
  addon can't load in Node.
- 0.5: options come from env (`APEX_PORT`, `APEX_DEBUG_PORT`, `APEX_WEBGL=1`) or a scenario's `export const options`;
  the compare helper is `tools/shot.mjs` (not inside `cdp.mjs`). No reference images committed yet.
- 1.6: "full-page screenshot" became viewport screenshots at 1280×800 and 390×844, with `#zView` set to
  `visibility:hidden` for the comparison (it's new pixels). The comparison needs a main baseline
  (`VIEW_TOGGLE_BASELINE`). `S.camMini` overrides `pads()` to 8 px.
- 2.5: sign conventions are defined in `attitude.js`'s header (roll > 0 leans right, so +ay gives negative roll; +ax
  raises the nose); 1.3 should adopt them. Codex added an optional `sample(tAnim)` for frame-rate independence.

- 2026-10-24: Wave A merged to `main` in the order 0.5, 0.3, 0.2, 0.1, 5.2, 2.5, 1.6 (`--no-ff`, one merge commit per
  task). Two `ARCHITECTURE.md` §10.2 conflicts, both resolved by keeping every bullet. The 0.1-vs-0.2 one was expected.
  The 5.2 one wasn't (the trial was clean): the merge of 0.1 also updated the "Not yet: `pitch`" line, which sits next
  to 5.2's insertion. The merged tree differs from the tested trial tree only in that doc line.
- 2026-10-24 (Q, on 1.6's questions):
  - (1) The inset's scale bar gets a `drawMap` option, in task 1.8 (added to its Scope in PLAN.md).
  - (2) The zoom buttons are disabled in 3D now: `setView` in `src/app/controls.js`, checked by `zoomDisabledIn3d` and
    `zoomEnabledIn2d` in `view-toggle.mjs` (teeth: removing the line fails `zoomDisabledIn3d`). 1.8 re-enables the ones
    with 3D meanings.
  - (3) A drag on the inset counting as a click is accepted.
- 2026-10-24: `.gitignore` added with `.claude/worktrees/` only (not all of `.claude/`, which may later hold project
  settings).

## Next Up

- Wave B: 0.4 (frame helper; depends on 0.3) and 5.1 (smooth trace pose; depends on 0.1, 0.2). Both go to Codex.
