# WebGPU PoC: Slop New York

Proof of concept: a WebGPU city demo running inside the Rhyflitzer repo, separate from the game (the game is untouched).

- Source: https://github.com/mrdoob/slop-newyork at commit `536a907c605964421563f12f15c5e00d735fc94f`
- License: MIT, see `LICENSE` (Mr.doob). Data credits: see `CREDITS.md` in the repo root.
- three.js 0.187.0 from jsDelivr via the import map in `index.html`.
- Changes to the copied files are marked with `PoC:` comments. `js/poc-gate.js` is new: without a WebGPU adapter the page shows a message (`#no-webgpu`) and does not start the renderer, because three's WebGPURenderer would otherwise silently fall back to WebGL2.

## Run

    python3 -m http.server 8000   # from the repo root
    # open http://localhost:8000/poc/webgpu/ in a WebGPU-capable browser

`?webgl=1` is a test/compare hook that renders through WebGL2, not WebGPU.

## Keys

See the demo's own on-screen help (HUD and camera presets).
