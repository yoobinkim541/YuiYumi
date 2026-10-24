# Ayagami as the Live2D core: feasibility spike (Track E)

Date: 2026-10-24. Ayagami revision: `0d1d7aa3efe57b1b363b72e672e353c52a9c15d6` (git, MIT/Apache-2.0).

## Verdict

**GO for today**, with the official Cubism Core kept as a one-line fallback.

Ayagami, built to `wasm32-unknown-unknown` and wrapped in a `Live2DCubismCore`-shaped JS facade,
drops in under pixi-live2d-display 0.4.0 (Cubism 4 framework) and `cubism-web-batched-renderer`
without changes to either. TT2.0 renders in headless Chrome (WebGL2) on the batched path (no SDK
fallback), with motions, physics, breath and blink running in the framework, and matches the
official Core render of the same frozen pose to within 28 pixels over 3/255 out of 125,418 model
pixels. The integration into the app is a loader swap (see "Integration" below).

## What was built

| Path | Purpose |
|---|---|
| `Cargo.toml` | Standalone package (`[workspace]` table), `cdylib` + `rlib`, LTO, `panic = "abort"`. Depends on the vendored, patched Ayagami. |
| `vendor/ayagami/` | Ayagami crate at the revision above plus a one-line fix (`vendor/ayagami-double-visual.patch`, see Fidelity). Licenses copied alongside. |
| `src/lib.rs` | `Instance` (loader + driver + flat Core-layout arrays) and the `extern "C"` surface (`ayg_*`). No wasm-bindgen, no imports. |
| `src/main.rs` | Native test binary: load, counts, pose, timing. `cargo run --release -- <moc3>` |
| `examples/opacity_probe.rs` | Diagnostic used to find the opacity divergence. |
| `compare.mjs` | Node: wasm build vs official Core (static data, vertices, opacities, flags, order, colors). |
| `js/ayagami-cubism-core.mjs` | The `Live2DCubismCore` facade over the wasm module. |
| `js/shim-compare.mjs` | Node: facade vs official Core over 300 animated frames through the Core API. |
| `demo/` | Vite page (pixi 6 + pixi-live2d-display/cubism4 + batched renderer), `?core=ayagami|official`, `&freeze`; `cdp-shot.mjs` (headless Chrome screenshot + raw pixels), `pixel-diff.mjs`. |

Model files are referenced from `models/`, not copied.

## Numbers

Native (Apple Silicon, release):

| | TT2.0 | Yui |
|---|---:|---:|
| MOC3 | 7.3 MB, version 5 | 10.3 MB, version 5 |
| Parameters / parts / ArtMeshes | 196 / 63 / 430 | 262 / 54 / 532 |
| Vertices / indices | 23,801 / 108,186 | 37,131 / 168,249 |
| Load (parse) | 8 ms | 2 ms |
| First full update | 1.6 ms | 1.4 ms |
| ParamAngleX=30, MouthOpenY=1, EyeLOpen=0 | 91 meshes, 2,284 vertices moved | 84 meshes, 3,621 vertices moved |
| Animated, 4 params/frame | 0.97 ms/frame | 0.15 ms/frame |
| All parameters changing every frame | 1.4 ms/frame | 1.7 ms/frame |

WASM: 470,945 bytes (115 KB gzip), no imports, 16 MiB (TT2.0) / 22 MiB (Yui) linear memory, no
memory growth after load during 300 animated frames.

In the browser (headless Chrome, TT2.0, framework-driven, `coreModel._model.update()` time):
Ayagami 1.1 ms/frame animated, 0.10 ms/frame frozen (it recomputes only changed meshes); official
Core 1.8 ms/frame animated, 1.4 ms/frame frozen. In Node the steady-state 3-parameter sweep is
0.10 ms (Ayagami) vs 2.4 ms (Core) for TT2.0.

## Fidelity against the official Cubism Core 5.0.0

Static data (vertex counts, index counts, indices, UVs, texture indices, masks, constant flags,
canvas info, parameter/part/drawable ids and order, part and drawable parent indices): identical
for both models once conventions are converted (below).

Dynamic data, TT2.0, 300 frames of drifting random poses plus part-opacity changes through the
Core API (`js/shim-compare.mjs`): vertex max error 2.2e-5 model units, opacity max error 3e-7,
visibility identical, back-to-front order of the drawables that draw identical in every frame.
Yui: vertex max error 6.3e-5; opacity differs in 7 drawable-frames (below).

Rendered pixels, TT2.0, frozen pose, 720x960, batched renderer, Ayagami vs official Core:
125,418 model pixels, 88 differ by more than 1/255, 28 by more than 3/255, 6 by more than 16/255
(max 26/255), on edges.

Conventions Ayagami uses differently, converted in `src/lib.rs`: y is down (negated), UV v is
flipped (`1 - v`), triangle winding is reversed, zero-opacity drawables are reported visible (Core
reports them not visible), flag layouts (rewritten to Core's bits).

Divergences found:

1. **Fixed (local patch):** a rotation deformer whose parent is a warp deformer applied the
   parent's visual twice, so opacity became t² (and multiply/screen colors were applied twice).
   On Yui this broke the fade of `ParamSkinhead`, `ParamhaoriOnOff` and the effect toggles
   (0.5 -> 0.25). One-line fix in `vendor/ayagami-double-visual.patch`; after it, opacity matches.
   This is a fork of upstream; we do not contribute upstream.
2. **Open, minor:** Yui `ArtMesh19` at `Param40 = 10` (the exact maximum; keys 0/2/3/4/10)
   gets opacity 0 in Ayagami and the keyform-0 value in Core. Likely Core wraps a repeat
   parameter at its maximum; not verified. Only that exact value is affected.
3. **Open, cosmetic:** keyforms out of range (e.g. TT2.0 `ArtMesh351/352`, keyed by
   `ParamMouthOpenY` with a single key at 0) are hidden in both, but Ayagami gives them depth 0
   and multiply color 0. Absolute `renderOrders` numbers therefore shift by 2 on TT2.0; the
   relative order of drawn meshes is identical, which is what the renderer uses.
4. Ayagami recomputes only changed meshes, so `vertexPositionsDidChange` is not set for meshes
   Core re-flags every frame. Positions match; the batched renderer uploads the whole span anyway.

## What the batched renderer needs vs what the facade provides

`cubism-web-batched-renderer` hooks the SDK renderer (`CubismRenderer_WebGL`) of
pixi-live2d-display's Cubism 4 internal model and reads the framework model (`CubismModel`) and
its Core model `_model.drawables`. Because the facade replaces only Core, the framework, its
clipping manager and the renderer stay the stock ones.

| Renderer needs | Facade provides |
|---|---|
| `vertexPositions[i]` as views into one buffer, 8-byte aligned, non-overlapping | Views into one Rust `Vec<f32>` in wasm memory at `texcoord_offset * 8`; passes the renderer's heap-span check. Views are re-created if `memory.buffer` changes; the renderer's `isCurrent` then rebuilds its pipeline. |
| `vertexUvs`, `indices`, `vertexCounts`, `indexCounts` | Copied once at load, Core conventions. |
| `opacities`, `dynamicFlags` (visible bit), `renderOrders` | Views into wasm memory, Core bit layout, updated by `update()`. |
| `multiplyColors`, `screenColors` (RGBA) | Views into wasm memory (Ayagami computes them from keyforms and deformers). |
| `getDrawableBlendMode`, `getDrawableCulling`, `getDrawableInvertedMaskBit` (via `constantFlags`) | `constantFlags` in Core layout (additive, multiplicative, double-sided, inverted mask). |
| `getDrawableTextureIndices`, `masks`, `maskCounts` | Copied once. |
| Clipping contexts, mask layout, MVP | Unchanged framework code over the data above. |

Not representable on this path: SDK 5.3 advanced blend modes and offscreen parts (Ayagami
supports them; the Cubism 4 framework does not). The facade marks advanced blends with bit 7 of
`constantFlags` and inlines offscreen parts into the order. Both test models use neither (0
advanced-blend meshes, 0 offscreen parts).

## Missing features

Ayagami's README lists expressions, motions and pose as TODO. On this path they are not needed
from Ayagami: the Cubism 4 framework in pixi-live2d-display implements motions, expressions,
pose, physics, eye blink and breath in JavaScript and only writes `parameters.values` /
`parts.opacities` before `update()`. The facade keeps those arrays JS-owned (the framework caches
them) and copies them into wasm on every `update()`. Motions, physics, breath and blink ran in the
browser test; expressions and pose use the same path but were not exercised explicitly.

## Integration into the app

1. Build: `cargo build --release --target wasm32-unknown-unknown --lib` in `crates/ayagami-web`,
   serve `ayagami_web.wasm` as a static asset.
2. Before importing `pixi-live2d-display/cubism4`:
   `window.Live2DCubismCore = await createAyagamiCubismCore(await (await fetch(wasmUrl)).arrayBuffer())`
   instead of loading `live2dcubismcore.min.js`. Keep the official loader behind a flag.
3. Everything after that (`Live2DModel.from`, `installCubismBatchedRenderer`) is unchanged.

Estimate: 1-2 hours to wire into the app's character runtime (build step, asset serving, flag),
plus about 1 hour of checks on the real app (expressions, pose, mobile Safari WebGL2). The patched
fork needs an owner decision (vendor it, or keep a patched git fork).

## Risks and blockers

- No blocker found for TT2.0 on desktop Chrome.
- Not yet run inside the app itself, on Safari/iOS, or with expressions/pose explicitly.
- Depends on a locally patched Ayagami (one line); upstream is pre-release with an unstable API.
- Ayagami's README notes that inconsistent models may panic; with `panic = "abort"` a bad model
  traps the wasm instance. `ayg_load` returns null on parse errors only.
- The facade implements the Core API subset used by pixi-live2d-display 0.4.0 and the batched
  renderer; other consumers of Core may need more of it (e.g. `parameters.keyValues`).
- Licensing: this removes Cubism Core only. pixi-live2d-display's bundled Cubism Framework and
  `cubism-web-batched-renderer` remain under the Live2D Open Software License.

## Reproduce

```sh
cd crates/ayagami-web
cargo run --release -- ../../models/TT2.0/TT2.0.moc3
cargo build --release --target wasm32-unknown-unknown --lib
node compare.mjs ../../models/TT2.0/TT2.0.moc3
node js/shim-compare.mjs ../../models/TT2.0/TT2.0.moc3
# browser (from the repo root):
npx vite --config crates/ayagami-web/demo/vite.config.mjs &
node crates/ayagami-web/demo/cdp-shot.mjs "http://localhost:5199/?core=ayagami&freeze" /tmp/a.png 9335 /tmp/a.rgba
node crates/ayagami-web/demo/cdp-shot.mjs "http://localhost:5199/?core=official&freeze" /tmp/o.png 9336 /tmp/o.rgba
node crates/ayagami-web/demo/pixel-diff.mjs /tmp/a.rgba /tmp/o.rgba
```

`compare.mjs`, `js/shim-compare.mjs` and the `?core=official` page need
`public/vendor/live2dcubismcore.min.js`.
