# 3D frame-time measurement (R10 / P6)

R10 targets 60 fps on an integrated laptop GPU at DPR ≤ 2 while the optimiser searches.
This measurement informs whether rendering should move from the main thread (T1) to a render worker (P6 / T2).

With `?perf`, the app records uncapped requestAnimationFrame timestamp differences, reporting nearest-rank
p50/p95 in milliseconds every 10 seconds. Each interval is classified by `S.running` at its ending frame:
`p50`, `p95`, `runningFrames` and acquisition-order `intervals` cover running samples only. `idleP50`,
`idleP95`, `idleFrames` and `idleIntervals` separately describe idle samples. No samples means null percentiles.
The first frame in each window establishes the baseline; intervals never span windows.

`PerformanceObserver` counts `longtask` entries and sums their full durations. Window and running/idle
attribution both use the entry's start time: the latest sampled search state holds until the next frame,
with the first sample also covering the period from window start to that sample. `longTasks` and `longTaskMs`
cover running tasks; `idleLongTasks` and `idleLongTaskMs` cover idle tasks. This is frame-sampled state,
not continuous worker instrumentation. Unsupported observation is marked `longTaskSupported: false`;
zero then means unavailable, not absence of long tasks.

The console line leads with running-frame statistics. `window.__perf` holds the last completed window,
including the fields above, start/end timestamps, mode, `mixed` (mode changed), support flag and serial number.
`window.__perf.flush()` closes and logs the current window early and starts a fresh one.
Without the flag there is no collector, observer or sample array; the frame hook is a single boolean check.

## Headless measurement

Run `node tools/cdp.mjs tools/scenarios/perf3d.mjs`.
The scenario navigates again to `/?perf` locally, leaving the shared driver unchanged. It waits for boot and
camera state plus two animation frames, presses Restart from centreline (`#resetC`), waits for the new line
and running state, then flushes before each 12-second measurement. It restarts again whenever search converges.
It combines the automatic 10-second window with the tail using raw intervals, recomputing percentiles.
It checks ≥ 30 running frames, matching unmixed mode, and no frame error (`S.frameErr` null). No speed threshold.

**SwiftShader software rendering: these numbers are not representative of hardware GPU performance.**

| Mode | Running p50 ms | Running p95 ms | Running long tasks | Running long-task ms | Running frames | Idle frames / p50 / p95 ms |
|---|---|---|---|---|---|---|
| 2D | 66.7 | 100.1 | 0 | 0 | 154 | 1 / 66.6 / 66.6 |
| 3D overview | 133.4 | 166.7 | 81 | 11663 | 81 | 2 / 133.3 / 133.3 |
| 3D chase | 133.3 | 166.7 | 83 | 11722 | 82 | 2 / 133.3 / 166.8 |

Run by the coordinator on 2026-10-25 on merged `main` after Wave F batch 1 (`d3ee86d`): headless Chrome 155.0.8059.85
with `--use-angle=swiftshader`, macOS, Node v26.12.1, viewport 1280×800 at DPR 1, ~12 s per mode, long-task observation
supported. In 3D nearly every frame is a long task (81 of 81 running frames in overview): software rasterisation makes
each render ~130 ms, so these numbers say nothing about the main thread's share on a GPU. They only show the
measurement works end to end; the verdict rests on Q's hardware numbers below.

## Q's hardware procedure

1. Run `node serve.mjs`; open `http://localhost:8000/?perf` and the browser console.
2. Note machine, CPU, GPU, OS, browser/version, screen size, DPR and power mode. Use DPR ≤ 2.
3. In 2D press **Restart from centreline**, wait for the search to start, then call `window.__perf.flush()`
   to discard setup. Stay about 15 seconds; press Restart from centreline again whenever it converges.
   Copy the complete 10-second console line's **running-frame** p50/p95, running frame count and running long-task
   numbers. Also note the separately reported idle frames/percentiles and `window.__perf.longTaskSupported` / `.mixed`.
4. Open 3D overview, wait for it to render, press **Restart from centreline**, wait for search to start, flush,
   and repeat the same ~15-second procedure, restarting whenever it converges. Repeat for 3D chase.
   Discard setup/tail windows; use unmixed windows with at least 30 running frames. Idle samples do not enter
   the running percentiles, so brief gaps before restarting do not invalidate the whole window.
5. Keep replay playing and the tab foreground. If paused, restart from centreline and continue measuring.
6. If **running-frame p95** is above 16.7 ms, record a browser Performance trace to determine whether main-thread
   long tasks during search coincide with missed frames. Counts alone cannot establish causation. Record
   rebuild/edit-drag behaviour separately if assessing R10's track rebuild target; this scenario measures search/playback.

Q ran it on 2026-10-25: a MacBook Air, Chrome. GPU, OS version, Chrome version and DPR weren't recorded. Each row is
one 10 s window as logged (two per mode, plus TV, which 2.1 added before the run).

**Run 1, on battery (a 30 Hz cap; not used for the verdict).** Every window, 2D included, had running p50 = 33.3 ms
and p95 = 34.0–34.3 ms, with zero long tasks, running or idle. A constant 33.3 ms in every mode, with no long tasks,
is a frame-rate cap (Chrome's Energy Saver or macOS Low Power Mode), not load. It hides any headroom, so it can't
answer R10.

**Run 2, on mains power, Low Power Mode off:**

| Mode | Running p50 ms | Running p95 ms | Running long tasks | Running long-task ms | Running frames | Idle frames / p50 / p95 ms |
|---|---|---|---|---|---|---|
| 2D | 16.7 | 17.5 | 0 | 0 | 162 | 438 / 16.7 / 17.5 |
| 2D | 16.7 | 17.5 | 0 | 0 | 316 | 284 / 16.7 / 17.6 |
| 3D overview | 16.7 | 17.6 | 0 | 0 | 397 | 199 / 16.7 / 17.5 (1 idle long task, 54 ms) |
| 3D overview | 16.7 | 17.6 | 0 | 0 | 91 | 508 / 16.7 / 17.6 |
| 3D chase | 16.7 | 17.6 | 0 | 0 | 457 | 143 / 16.7 / 17.6 |
| 3D chase | 16.7 | 17.6 | 0 | 0 | 36 | 564 / 16.7 / 17.6 |
| 3D TV | 16.7 | 17.5 | 0 | 0 | 318 | 282 / 16.7 / 17.5 |
| 3D TV | 16.7 | 17.4 | 0 | 0 | 175 | 425 / 16.7 / 17.6 |

Reading it: p50 sits on the 60 Hz frame (16.7 ms) in every mode. p95 is 17.4–17.6 ms; a dropped frame would show as
~33 ms, so this is timestamp jitter, and fewer than 5% of frames can have been dropped (otherwise p95 would be ~33 ms).
The log lines don't carry the maximum, so they don't show that no frame was dropped. There were no long tasks during
a search in any mode. The one 54 ms long task was outside a search, in the 3D overview window, and is probably the
view being created or rebuilt (not traced). 3D (overview, chase, TV) is indistinguishable from 2D.

## Verdict rule

If 3D's **running-frame p95** exceeds 16.7 ms **because of main-thread long tasks**, trigger P6 (render worker) and tell Q;
otherwise P6 is not triggered. Unsupported long-task observation needs trace evidence before attributing a cause.

**Verdict (2026-10-25, Q's run 2): P6 is not triggered.** 3D's running-frame p95 is 17.4–17.6 ms, which is vsync jitter
on a 60 Hz frame, not missed frames, and there are no main-thread long tasks during a search in any mode. **R10 (60 fps
while the optimiser searches) is met on this machine**: p50 16.7 ms everywhere, and fewer than 5% of frames dropped
at most. The main thread (T1) stays. Two things stay open, should they matter later:
- R10's other target, a track mesh rebuild within one frame during an edit drag, isn't measured here (editing is 2D).
- Measure with the browser's energy saver off: run 1 shows that a 30 Hz cap hides everything.
