# WebGPU PoC: Slop New York

Proof of concept: a WebGPU city demo running inside the Rhyflitzer repo, separate from the game (the game is untouched).

- Source: https://github.com/mrdoob/slop-newyork at commit `536a907c605964421563f12f15c5e00d735fc94f`
- License: MIT, see `LICENSE` (Mr.doob). Data credits: see `CREDITS.md` in the repo root.
- three.js 0.187.0 from jsDelivr via the import map in `index.html`.
- Changes to the copied files are marked with `PoC:` comments. `js/poc-gate.js` is new: without a WebGPU adapter the page shows a message (`#no-webgpu`) and does not start the renderer, because three's WebGPURenderer would otherwise silently fall back to WebGL2.

## View

- After merge: https://github.freaxnx01.ch/game-rhyflitzer/poc/webgpu/
- Locally: `python3 -m http.server 8000` from the repo root, then open http://localhost:8000/poc/webgpu/
- Needs a browser with WebGPU: Chrome or Edge, Safari 26+, Firefox on Windows. Without it the page shows a message instead of starting.
- `?webgl=1` is a test/compare hook that renders through three's WebGL2 backend, not WebGPU. The HUD still says "WebGPU" there (demo text).

## Keys

- `T` cycles time of day (golden, midday, twilight, midnight)
- `R` toggles wet roads
- `W` `A` `S` `D` drive the Rhyflitzer sedan
- `V` cycles the camera
- `H` toggles the HUD

## Trimmed vs the demo

- Car only, in a Midtown slice, always starting at Times Square (no helicopter, no map, no teleports, no stale hints).
- The demo's taxi is replaced by the Rhyflitzer sedan (`bulldog.glb`); if it fails to load, the taxi stays.
- Look keys `T` and `R` are new (`js/poc-look.js`), as is the WebGPU gate (`js/poc-gate.js`).

## Screenshots

`tests/test_poc_webgpu_shots.py::test_poc_shots` writes eight PNGs (4 times of day, dry and wet) when `PW_CDP_ENDPOINT` points at the GPU browser. They are never committed. That browser has no WebGPU adapter, so they show the WebGL2 backend via `?webgl=1`, not the true WebGPU look.

Design: `docs/superpowers/specs/2026-11-10-webgpu-newyork-poc-design.md`
