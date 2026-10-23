# Investigation: headless converged lap 78.377 s vs documented browser 78.29 s

GT racer, Harrow Ring (seed 27), 12 m. Started 2026-10-18. Line numbers refer to the page as it was then, now `prototype/apex-lab.html` (unchanged). The fingerprint snippet used in E6–E8 is in the appendix.

## FACTS (verified)

- F1. Headless `tests/convergence.test.mjs`: exact lap 78.3771 s, pre-clamp 78.3770 s, 76,851 steps, 78,063 evals. Identical on two runs (to the 4 decimals logged).
- F2. 78.29 s appears only in docs (ARCHITECTURE.md §8.3, CLAUDE.md). Git history has no earlier source: repo has 2 commits, both 2026-10-18 (prototype + docs).
- F3. Browser boot path (`apex-lab.html:1226-1230`): `rebuildTrack(false)` → `opt.setup(T,car,B,off)` with `off` = zeros clamped — same as the test. No `carChanged`/`rescore` on boot.
- F4. Browser loop (`frameBody`, line 1205): calls `opt.step()` repeatedly within a 10 ms (7 ms narrow) budget. The step sequence doesn't depend on timing; the budget only affects how many steps run per frame.
- F5. The displayed lap is `disp.t` (line 1216), set by `refreshDisplay()` = `lapEval(T,car,off,…)`. That's called only if a step in that frame returned true (line 1206). Not at the end otherwise.
- F6. In polish, a rejected trial leaves `off` holding the **rejected** line (`evalc` writes `off`; only `c` is restored). So `refreshDisplay()` after a frame with an improvement then a rejection shows a lap ≥ the true best. Display bias goes **slower**, not faster.
- F7. The polish uses `mulberry32(777)` and L-BFGS is deterministic, so any variation must come from the inputs, the code path or floating point.
- F8. "Search again" (`runBtn`, line 952) after convergence calls `opt.setup(T,car,B,off)` from the converged line, a second full stage 1–6 run. Any slider touch calls `rescore` (restart at stage 3).

## THEORIES

- T1. **Second run.** The 78.29 came after "Search again" (or a slider wiggle → rescore) from an already converged line. Test: headless, re-`setup` from the converged line and run again.
- T2. **Chaotic sensitivity + engine maths.** The optimiser's endpoint is sensitive to ulp-level differences. A browser whose `Math.exp/log1p/pow/sin` differ from Node's V8 (Safari/JSC uses system libm) lands elsewhere. Test: perturb the start by ~1 ulp headless and measure endpoint spread. If ~0.1 s, T2 is viable. If ≪0.087 s, it isn't.
- T3. **Stale reference.** 78.29 was measured on an earlier version of the code (before a physics or optimiser change) and never re-measured. Test: only Q's memory, or a browser run of the current file.
- T4. **Display ≠ exactLap.** The readout shows something other than the converged exact lap. F5/F6 say the bias is ≥, so this can't produce a *faster* browser value on its own. Weak.
- T5. **Different setup in the browser run.** Different width, preset or edited track (e.g. a dragged control point, `keepLine` path from a previous circuit, narrow screen doesn't matter per F4). Test: Q's recollection, or a fresh browser run.
- T6. **Harness differs from the page.** Extraction or context differs subtly (e.g. the presets slice, a global the page sets). F3 says the setup is the same; a browser run of the current file would show it.

## TESTS

| # | What | Why | Found | Means |
|---|---|---|---|---|
| E1 | Converge, then `opt.setup` again from the converged line ("Search again") and converge | T1 | Run 1 78.3771 s (78,063 evals); run 2 **78.3002 s** (73,258 evals) | A second run gets within 10 ms of 78.29. Supports T1. |
| E2 | GT `mu` ±1 ulp, converge from the centreline | T2 | +1 ulp: 78.3771 s, 78,063 evals (bit-identical path, the bisection tables absorb it); −1 ulp: **78.3826 s**, 71,613 evals | The endpoint is chaotic but the spread is ~5 ms, not 87 ms. T2 alone is unlikely (2 samples). |

| E3 | Q, in the browser (which browser: not yet known): converge, then "Search again" ×5 | T1, T3/T5/T6 | 78.348, 78.278, 78.319, 78.382, 78.398, 78.289 s | Restarts don't improve monotonically: they scatter over ~120 ms (mean 78.336). 78.29 is one draw from that spread. The first run is **29 ms faster** than headless 78.377. I predicted "78.377 or a hair slower", so the prediction failed. |

| E4 | Headless replay of the readout: `lapEval(off)` after every step from the last improving step k* to convergence | T4 (now "A") | k* = 76,849 of 76,851 steps; every possible readout is 78.3770–78.3771 | With Node's trajectory the readout can't show 78.348. **A ruled out.** Chrome's optimiser took a different path. |
| E5 | Read-only: duplicate function/class declarations in the page script; app-region writes to `P`/CORE state at boot | T5/T6 | None. `P` is written only in user event handlers | No page-side override found. |
| E6 | Stage fingerprint (snippet in the appendix) in Node v26.12.0 / V8 14.6.202.34 | localise the divergence | `{"ctrl":-1543.948446703365,"N":783,"track":44736.19302159477,"bounds":15785.805000000146,"alat":13992.476506664188,"ggB":330753.2366386127,"ggT":257637.70778531957,"drv":4750.868898350019,"lap0":85.78787570797407,"setupEvals":1,"f2000":78.80591405168128,"evals2000":3211,"stage2000":4}` | Reference for the Chrome run of the same snippet. |

| E6b | Same snippet, Q's Chrome | localise | `ctrl`, `bounds`, `alat`, `ggB`, `ggT`, `drv` **identical**; `track` 44736.19302159354 (Node …477, rel 2.7e-14); `lap0` 85.78787570797387 (Node …407); `f2000` 78.65696577877716 (Node 78.806), evals 3629 vs 3211 | The split starts in `buildTrack`, after `genCtrl`. Everything after it is chaotic amplification. |
| E7 | Bit-hash of `Math.hypot` over 200k pseudo-random pairs in ±500, Node vs headless Chrome 155 (the installed `/Applications/Google Chrome.app`) | `hypot` is the only library function in `buildTrack` beyond `sqrt` | **Identical** hashes (`7c16148e7ae36e0a`); `hypot ≠ sqrt(x²+y²)` in 76,632/200k in both | Theory "V8 versions differ in `hypot`" is refuted for this input range. Not exhaustive: `buildTrack`'s `hypot` inputs include ~0.25 m segments. |

| E8 | Q's Chrome: `navigator.userAgent`, `location.href`, `buildTrack.toString().length`. Then the snippet appended to a scratch copy of the repo page, run in headless Chrome 155 | separate "Q's environment" from "Chrome vs Node" | Q: Chrome **153**, `file:///Users/tucker/code/apexlab/apex-lab.html`, length 2835 (Node: 2835). Headless 155: fingerprint **identical to Q's Chrome 153**, including `f2000 = 78.65696577877716` | Same file, same code. Chrome 153 = Chrome 155 ≠ Node 26 (V8 14.6.202.34). Rules out a stale copy, the Chrome version, and page state. |

Q confirmed E3 was in **Chrome** (V8).

## CONCLUSIONS (investigation closed 2026-10-18; Q: "29 ms is small")

1. **78.29 s is not a golden value.** It's one draw from the optimiser's run-to-run scatter. In the browser, six consecutive "Search again" runs gave 78.278–78.398 s (spread ~120 ms, no trend). A restart is a fresh draw, not a refinement.
2. **The optimiser's endpoint is chaotic.** A ~1e-14 relative difference in track geometry (E6b), or a 1-ulp change in `mu` (E2: 5 ms), sends it to a different local optimum. Endpoints land within roughly ±60 ms.
3. **Node and Chrome compute the same track differently in the last bits.** It starts in `buildTrack`. `genCtrl` output and every car table match bit for bit. So the converged lap differs: Node 78.3771 s, Chrome 78.348 s (Q, first run). Reproducible in Chrome 153 and 155.
4. **Determinism is per runtime.** "Same seed gives the same lap bit for bit" (§8.3) holds within one JS engine build, not across Node and the browser. Golden values must be tagged with the runtime (Node + V8 version) as well as the track-generator version, and produced by a named procedure (single run from the centreline).
5. The readout is not the cause (E4): with a given trajectory, the "Converged" display equals the converged line's lap to 1e-4 s.

## OPEN (not pursued)

- **Which operation in `buildTrack` differs between Chrome's V8 and Node 26's V8.** `Math.hypot` bit-matched on 200k pairs in ±500 (E7), so either `hypot` differs on inputs that test didn't cover (e.g. ~0.25 m dense segments) or something else does. Next step if ever needed: dump `buildTrack`'s intermediate arrays (dense points, `h`, `Mx/My`, `cum`, `cx/cy`, `nx/ny`, `kc`) in both runtimes and find the first that differs.
- Whether the polish's stopping rule (3000 tries without 1 ms) should be tightened, given ±60 ms endpoint scatter. That's a design question, not a bug.
- F6 (corrected): the live readout is `lapEval` of whatever trial line was evaluated last in the last improving frame. E4 shows it's harmless at convergence; mid-run it can differ from the kept line. Engine family is the same, so B ("different JS engine") needs a V8-version maths difference to survive.

**Correction to F6:** a rejected polish trial is rejected on `f = lap + edge penalty`, not on lap. A trial that pokes slightly outside the bounds can have a *faster* lap and still be rejected (W = 2000/m² in stage 5, so 3.8 mm outside costs 0.029 s). The readout can therefore be faster **or** slower than the converged line. F6's "bias goes slower" was wrong.

## STATUS (checkpoint after E1–E2, superseded by CONCLUSIONS below)

Leading theory was T1: the documented 78.29 s came from a second (or later) run, not a single run from the centreline. E3 later showed a single Chrome run gives 78.348 s, not 78.377 s. That led to E4–E8.

## APPENDIX: fingerprint snippet

An expression to paste into a console (or evaluate with the names in scope). It hashes each pipeline stage for GT racer on Harrow Ring and runs 2000 optimiser steps. On the prototype page the names are globals. On `index.html` (modules), wrap it: `(async()=>{const c=await import('/src/core/index.js'),{CARS}=await import('/src/app/presets.js');const {buildCar,genCtrl,buildTrack,makeBounds,makeScratch,lapEval,Optimizer}=c;return <snippet>;})()`. After migration step 2 the modules reproduce both reference fingerprints exactly: Node `track …477, f2000 78.80591405168128`; Chrome 155 `track …354, f2000 78.65696577877716`.

```js
(()=>{const h=a=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*(1+(i%7));return s;};
const P0={...CARS['GT racer']},c0=buildCar(P0),g=genCtrl(27,12),T0=buildTrack(g,12),B0=makeBounds(T0,P0);
const z=new Float64Array(T0.N);for(let i=0;i<T0.N;i++)z[i]=Math.min(B0.hi[i],Math.max(B0.lo[i],0));
const lap0=lapEval(T0,c0,z,makeScratch(T0.N));
const o=new Optimizer();o.setup(T0,c0,B0,z);const s1=o.evals;for(let k=0;k<2000;k++)o.step();
return JSON.stringify({ctrl:h(g.flat()),N:T0.N,track:h(T0.cx)+h(T0.cy)+h(T0.kc),bounds:h(B0.hi),alat:h(c0.alat),ggB:h(c0.ggB),ggT:h(c0.ggT),drv:h(c0.drv),lap0,setupEvals:s1,f2000:o.f,evals2000:o.evals,stage2000:o.stage});})()
```
