# WebGPU New York PoC

## Intent

Rhyflitzer renders with three.js 0.170 and `WebGLRenderer`. The maintainer saw mrdoob's
[Slop New York](https://mrdoob.github.io/slop-newyork/) (three.js 0.187, `WebGPURenderer`, TSL) and wants to
find out **how good Rhyflitzer could look with WebGPU**. New York is already planned as a future region, so the
PoC is a slice of Manhattan.

The PoC answers one question: *does driving a Rhyflitzer car through a WebGPU city look so much better that
porting the game is worth it?* It is a look-and-feel experiment, not a game feature.

## What the maintainer wants to see

Named by the maintainer, in their words' order:

- **Sky** and **several times of day** (day, golden hour, dusk, night)
- **Light effects**: at night car headlights, tail lights and **street lamps** that light the street
- **Water and wet streets** with **reflections**
- **Trees**
- **Facades** (glass curtain walls, pre-war masonry, lit windows at night)
- **Level of detail** in general

## Goals

- A separate page at `poc/webgpu/index.html`, reachable after merge at
  `https://github.freaxnx01.ch/game-rhyflitzer/poc/webgpu/` (and locally via `python3 -m http.server`).
- A slice of **Midtown around Times Square** (a few blocks in each direction), rendered with `WebGPURenderer`.
- One existing Rhyflitzer glTF car from `assets/` the player drives in third person.
- Keys to switch the **time of day** and **wetness/rain** at once, so the maintainer can compare looks.
- A clear message instead of a black canvas when the browser has no WebGPU.

## Non-goals

- No change to the game: `index.html`, the root `*.js` modules, the three.js 0.170 import map stay untouched.
- No pedestrians, traffic, helicopter, bus, subway, audio, map, minimap, races, checkpoints, HUD.
- No i18n (the PoC carries a few key hints at most; base i18n rule does not apply to a throwaway PoC).
- No `version.js` bump, no hub card, no release.
- No port of Rhyflitzer's GLSL shaders to TSL. That is the follow-up the PoC decides on.
- Not all of Manhattan.

## Anti-goals (fails even if it works)

- The game itself breaks or changes in any way.
- The PoC looks no better than the game today (then it has answered "no", which is a valid result,
  but it must not be because the effects were left out).
- Third-party code or data lands without attribution.

## Constraints

- **Stack:** buildless, static files, ES modules, three.js from `cdn.jsdelivr.net` via an import map (as the demo
  and the game do). No `package.json`, no bundler.
- **License:** the demo's code is MIT (© 2026 Mr.doob). Code taken from it keeps the MIT header/notice; the
  repo-level `CREDITS.md` gets a line for the code and for the data (NYC Open Data, MTA, © OpenStreetMap
  contributors ODbL). The car keeps the credit its `assets/<car>.LICENSE.md` already requires.
- **Game stays non-commercial** (existing constraint from the CC BY-NC-SA car models) — unchanged by this PoC.
- **No recreation of another game:** the PoC uses the real city (open data) and Rhyflitzer's own cars; nothing
  from Midtown Madness (names, art, layouts).
- **Agent-dev memory cap:** should any heavier local job become necessary, it runs under
  `systemd-run --user --scope -p MemoryMax=2G`.
- **Verification:** the agent box and CI have no GPU. WebGPU needs a real GPU browser — the homelab GPU
  Playwright server (#304) or the maintainer's own browser. A headless SwiftShader run can only confirm "page
  loads, shows the no-WebGPU message, no console errors".

## Decided by the maintainer

- **Separate PoC page**, not a port of the game and not a WebGL/WebGPU side-by-side.
- **New York** as the PoC location.
- Reached via URL in the browser.

## Calls made by Claude (maintainer can override)

- **Location:** Midtown around Times Square.
- **Base:** start from the demo's modules (copied, trimmed), not a from-scratch rewrite. The demo already has
  every effect on the list; rebuilding them would cost far more and look worse.
- **three.js version:** whatever the demo pins (0.187.0), only inside `poc/webgpu/`.
- **Keys:** two **separate** keys, listed in a small on-screen hint. One key cycles the demo's four time presets
  (`golden`, `midday`, `twilight`, `midnight`, via its `selectTime()` → `lightingSystem.applyPreset()` +
  `colorGrade.applyPreset()`). In the demo, road wetness is only a per-preset value (`roadWetness` →
  `cityUniforms.uRoadWetness`), so the second key toggles a dry/wet override on top of the active preset (wet =
  high wetness plus the demo's rain/puddle path in `tsl-materials.js`). The key case that matters most is a
  **wet night**.
- **"Level of detail"** means the maintainer's wish for a rich, detailed city (facade detail, street furniture,
  fire escapes, trees), i.e. keep the demo's detail modules. It does **not** mean building a new LOD system;
  the demo's own culling stays as it is.
- **Car handling:** drive plausibly with the demo's vehicle controller/physics, with the Rhyflitzer glb as the
  visible body (and its lamps hooked to the demo's vehicle lights). Matching Rhyflitzer's own handling is out of
  scope.
- **Geodata:** copy the demo's pre-built `building-geodata.bin.gz` / `tree-geodata.bin.gz` as they are (credited).
  No regeneration from Overpass/NYC sources. Limit the slice at runtime (filter by bbox when loading, spawn point,
  fog/draw distance) if needed.
- **three.js:** loaded at runtime from jsdelivr (`three@0.187.0`) through the import map, no vendoring.
- **Evidence:** the pipeline/agent delivers a headless smoke test (page loads, no-WebGPU message on SwiftShader,
  no console errors) and, if the homelab GPU browser (#304) is reachable, one screenshot per time preset dry
  and wet as a bonus. The verdict itself is the maintainer's, in their own browser.

## Left to the builder

- Exactly which demo modules to keep, trim, or stub. Guideline: keep lighting, post-processing (SSR, bloom,
  grading), TSL materials, buildings/facades, roads/road paint, street details/lamps, trees, water,
  vehicle lights; drop pedestrians, traffic, audio, helicopter, bus, subway, map, boroughs, touch/gamepad if
  they drag in too much.
- **How to limit the slice:** clip the building/tree geodata to a bounding box with the demo's own tools, or
  keep the full data and only spawn/limit drawing distance — whichever is simpler and loads in a few seconds.
  Fog or the demo's culling may hide the edge.
- **Which car** (any `assets/*.glb` the game already ships) and how to fit it into the demo's vehicle
  controller (scale, wheel/lamp positions, using its physics or a simple one).
- How the no-WebGPU message looks.
- Layout inside `poc/webgpu/` (e.g. `index.html`, `js/`, `data/`, `README.md` with source + license notes).

## Success

The maintainer opens the URL in a WebGPU browser, drives the car through Midtown, flips through the times of day
and wet/dry, and can judge whether a WebGPU port of Rhyflitzer is worth it.
