# Repository Guidelines

## Project Structure & Module Organization

Apex Lab is a browser-based racing-line optimiser using plain JavaScript ES modules. `index.html` contains markup and CSS; `src/app/` handles state, controls, telemetry and worker communication. Physics lives in `src/core/` and `src/dynamics/`; `src/solver/` runs optimisation in a Web Worker. Rendering lives in `src/views/map2d/`, and replay logic in `src/playback/`.

`tests/` contains Node tests, fixtures and the opt-in golden baseline. `tools/scenarios/` contains browser scenarios. Read `ARCHITECTURE.md` before changing physics and `docs/deferred.md` before starting deferred work. Keep `prototype/apex-lab.html` frozen as a reference.

## Build, Test, and Development Commands

There is no install step, package manifest or build pipeline.

- `node serve.mjs`: serve locally at `http://localhost:8000`; use `PORT=8080` to change ports. ES modules and Workers require HTTP.
- `node --test tests/`: run the complete Node test suite.
- `node --test tests/gradient.test.mjs`: run a focused test file.
- `node tools/cdp.mjs tools/scenarios/ghost-pin.mjs`: exercise the app in headless Chrome; set `CHROME` for a nonstandard executable path.
- `node tests/make-physics-version.mjs --write`: refresh the committed source hash after any edit to core, dynamics or `src/solver/solver.js`.

## Coding Style & Naming Conventions

Follow surrounding code: two-space indentation, semicolons, single-quoted imports and compact numerical expressions. Use camelCase for functions and variables, PascalCase for classes and uppercase constants. No formatter or linter is configured.

Keep core, dynamics, solver and playback free of DOM access. Views consume explicit inputs. Avoid module-level mutable state in physics; use caller-owned scratch buffers. Convert UI units through `carSpec`; physics uses SI units.

## Testing Guidelines

Use `node:test` and `node:assert/strict`; name tests `*.test.mjs`. Tests assert contracts: physical bounds, closed
forms, finite differences, protocol boundaries and saved-data preservation. They don't assert historical outputs, and
no numeric coverage threshold is documented.
- Changes to `lapEval` must pass the finite-difference gradient checks.
- A replacement test must be shown to fail on a named fault, and every removed assertion is recorded in
  `docs/test-contract-ledger.md`.
- Fixed-line inputs live in `tests/fixtures/fixed-lines.json`, loaded through `tests/fixture-util.mjs`.
- Search budgets are in `docs/investigations/search-budgets.md`.

`node tools/numeric-report.mjs` is the opt-in exact comparison against `tests/golden.json`, on the pinned runtime:
- a mechanical refactor must report "identical";
- an intentional physics change shows a delta table; review it, then regenerate with
  `node tests/make-golden.mjs --write` and review the diff;
- the baseline is runtime-specific: on another V8 build the report says so and exits 2.

## Commit & Pull Request Guidelines

History uses short, descriptive subjects, sometimes prefixed by a component (`Solver:`, `docs:`, `tools:`). Follow that style and keep commits focused.

For pull requests, explain the behavior change, relevant issue or design reference, and validation commands/results. Include screenshots for visible UI changes; for physics changes, include the numeric report's delta table and explain it.
