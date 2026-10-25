# Repository Guidelines

## Project Structure & Module Organization

Apex Lab is a browser-based racing-line optimiser using plain JavaScript ES modules. `index.html` contains markup and CSS; `src/app/` handles state, controls, telemetry and worker communication. Physics lives in `src/core/` and `src/dynamics/`; `src/solver/` runs optimisation in a Web Worker. Rendering lives in `src/views/map2d/`, and replay logic in `src/playback/`.

`tests/` contains Node tests, golden results and fixtures. `tools/scenarios/` contains browser scenarios. Read `ARCHITECTURE.md` before changing physics and `docs/deferred.md` before starting deferred work. Keep `prototype/apex-lab.html` frozen as a reference.

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

Use `node:test` and `node:assert/strict`; name tests `*.test.mjs`. Cover physical properties and regressions; no numeric coverage threshold is documented. Changes to `lapEval` must pass finite-difference gradient checks. Mechanical refactors must preserve golden results exactly.

After intentional physics changes or a Node runtime upgrade, regenerate with `node tests/make-golden.mjs --write` and review the diff. Goldens are runtime-specific.

## Commit & Pull Request Guidelines

History uses short, descriptive subjects, sometimes prefixed by a component (`Solver:`, `docs:`, `tools:`). Follow that style and keep commits focused.

For pull requests, explain the behavior change, relevant issue or design reference, and validation commands/results. Include screenshots for visible UI changes and explain any golden-result changes.
