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

## Headless measurement — pending coordinator run

Run `node tools/cdp.mjs tools/scenarios/perf3d.mjs`.
The scenario navigates again to `/?perf` locally, leaving the shared driver unchanged. It waits for boot and
camera state plus two animation frames, presses Restart from centreline (`#resetC`), waits for the new line
and running state, then flushes before each 12-second measurement. It restarts again whenever search converges.
It combines the automatic 10-second window with the tail using raw intervals, recomputing percentiles.
It checks ≥ 30 running frames, matching unmixed mode, and no frame error (`S.frameErr` null). No speed threshold.

**SwiftShader software rendering: these numbers are not representative of hardware GPU performance.**

| Mode | Running p50 ms | Running p95 ms | Running long tasks | Running long-task ms | Running frames | Idle frames / p50 / p95 ms |
|---|---|---|---|---|---|---|
| 2D | | | | | | |
| 3D overview | | | | | | |
| 3D chase | | | | | | |

Browser checks: **DID NOT RUN** in the implementation sandbox.

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

Machine / GPU / OS / browser / DPR / power mode: pending Q.

| Mode | Running p50 ms | Running p95 ms | Running long tasks | Running long-task ms | Running frames | Idle frames / p50 / p95 ms |
|---|---|---|---|---|---|---|
| 2D | | | | | | |
| 3D overview | | | | | | |
| 3D chase | | | | | | |

## Verdict rule

If 3D's **running-frame p95** exceeds 16.7 ms **because of main-thread long tasks**, trigger P6 (render worker) and tell Q;
otherwise P6 is not triggered. Unsupported long-task observation needs trace evidence before attributing a cause.

**Verdict: pending Q's numbers.**
