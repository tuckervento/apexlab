# three.js 0.186.1 (r186), vendored

The project's first third-party runtime code (Q, 2026-10-24; `docs/3d-view.md` §6.3). MIT, see `LICENSE`. Pinned on
purpose: three makes breaking changes almost every release, so upgrade deliberately (below), never by drift.

## Source

- Tarball: `https://registry.npmjs.org/three/-/three-0.186.1.tgz`
- Registry `dist.integrity` (from `https://registry.npmjs.org/three/0.186.1`):
  `sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==`
  (`dist.shasum` `6d50f70c2c437f844179bbb56d6f5b774e1ca38a`). Both matched the downloaded tarball on 2026-10-24, before
  it was extracted.
- Files copied unmodified from the tarball's `package/` directory. This release has no `.min.js` builds, so they are the
  unminified ones.

## Files

`tests/vendor-three.test.mjs` checks every file in this directory except this README against the table below, and fails
on a file that isn't listed or a listed file that is missing.

| File | SHA-256 | Bytes |
|---|---|---|
| `build/three.core.js` | 9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6 | 1458113 (287 KB gzipped) |
| `build/three.module.js` | 9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea | 662772 (131 KB gzipped) |
| `LICENSE` | 8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc | 1081 |

Not vendored: `build/three.cjs`, the WebGPU and TSL builds, `src/`, and every addon. The task that first needs an addon
copies it (and anything it imports) to `examples/jsm/…` here, the path the import map's `"three/addons/"` points at,
and adds a row for each file.

## Import rule

`index.html` maps `"three"` to `./vendor/three-0.186.1/build/three.module.js` and `"three/addons/"` to
`./vendor/three-0.186.1/examples/jsm/`. `three.module.js` has one import, `./three.core.js`, and re-exports its classes.

Measured in Node v26.12.1, with no DOM (`typeof document`, `window` and `self` all `'undefined'`):
- The bare specifier fails: `import('three')` throws `ERR_MODULE_NOT_FOUND` ("Cannot find package 'three'"). Node has
  no import map and the repo has no `package.json` or `node_modules`.
- Both build files import by path. `three.core.js`: 447 exports, ~19 ms. `three.module.js`: 444 exports, ~25 ms
  including core. `Vector3`, `Matrix4` and `PerspectiveCamera` projection work. Only constructing a renderer touches
  the DOM: `new WebGLRenderer()` throws `ReferenceError: document is not defined`.
- `three.module.js` re-exports core's own classes (`module.Vector3 === core.Vector3`), so there is one copy of each.

So:
- A module that Node tests import never uses the bare `'three'` or `'three/addons/…'` specifiers. It imports nothing
  from three, or `vendor/three-0.186.1/build/three.core.js` by relative path.
- The renderer-facing module(s) import `three.module.js`, also by relative path. Node can load those too as long as
  nothing constructs a renderer, so keeping them out of Node tests is a convention, not a Node limit.
- In the browser both relative paths resolve to the same URLs as the import map's targets and `three.module.js`'s own
  `./three.core.js`, so every route loads one instance. A second copy would make three warn
  `Multiple instances of Three.js being imported.` (it records `window.__THREE__`).
- Addons import the bare `'three'`, so a module that imports an addon loads only in the browser, never in Node.

## Upgrading

1. Read three's release notes and migration guide for every revision skipped.
2. Download `https://registry.npmjs.org/three/-/three-<version>.tgz` into a new empty directory outside the repo. Check
   its sha512 (`openssl dgst -sha512 -binary <tgz> | base64`) against `dist.integrity` from
   `https://registry.npmjs.org/three/<version>` before extracting it.
3. Create `vendor/three-<version>/` beside this one with the same files (plus any addons in use), copied unmodified,
   and a README like this one with the new URL, integrity and SHA-256s (`shasum -a 256 <file>`). Run nothing from the
   package.
4. Point everything at the new directory: the import map in `index.html`, every relative import of the build files,
   and the directory and `REVISION` in `tests/vendor-three.test.mjs`.
5. Run `node --test tests/` and the 3D screenshot scenarios in `tools/scenarios/` (compared with a tolerance), and look
   at the 3D view by hand.
6. Delete the old directory in the same commit, so only one version is ever loaded.
