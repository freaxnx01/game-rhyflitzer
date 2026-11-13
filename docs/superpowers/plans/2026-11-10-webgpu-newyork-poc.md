# WebGPU New York PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone page `poc/webgpu/` where a Rhyflitzer car drives through Midtown Manhattan rendered with three.js `WebGPURenderer`, with keys to switch time of day and dry/wet.

**Architecture:** Copy mrdoob's MIT-licensed Slop New York (pinned commit) into `poc/webgpu/` nearly verbatim, then make small, marked edits: a WebGPU gate, a look-control module (time + wetness), a glTF car body on the demo's car entity, and a trim (car only, no traffic/pedestrians/audio, Times Square spawn). New logic lives in small `poc-*.js` modules with pure helpers tested by `node --test`; page behaviour is checked by one Playwright file.

**Tech Stack:** Vanilla ES modules, three.js 0.187.0 (`three/webgpu`, `three/tsl`) from jsdelivr via import map, `GLTFLoader` from `three/addons/`, `node --test`, pytest + Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-webgpu-newyork-poc-design.md`

## Global Constraints

- The game is untouched: no edit to repo-root `index.html`, root `*.js`, or its three.js 0.170 import map. Only `poc/webgpu/**`, `tests/poc*`, `CREDITS.md` and docs change.
- three.js only inside `poc/webgpu/`, exactly `three@0.187.0` from `https://cdn.jsdelivr.net/npm/`, no vendoring.
- Demo source: `https://github.com/mrdoob/slop-newyork`, pinned to the commit cloned for this plan (record its SHA in `poc/webgpu/README.md`). MIT © 2026 Mr.doob: keep `LICENSE` and every file header as-is.
- Credits (`CREDITS.md`): demo code (MIT, Mr.doob), NYC Open Data (building footprints/heights, Forestry Tree Points), MTA Subway Entrances, © OpenStreetMap contributors (ODbL), plus the car's existing credit.
- Car: `assets/bulldog.glb` ("Chevrolet Caprice Classic Sedan", CC BY 4.0, see `assets/bulldog.LICENSE.md`), loaded by URL `../../assets/bulldog.glb`, not copied.
- Geodata: the demo's pre-built `js/building-geodata.bin.gz` and `js/tree-geodata.bin.gz` copied as-is; no regeneration. `tools/` and `tests/` of the demo are **not** copied.
- Keys: <kbd>T</kbd> cycles time `golden → midday → twilight → midnight → golden`; <kbd>R</kbd> toggles wet. Both are free in the demo (it binds W A S D Q E C B H M N V, Digit0–9).
- No i18n, no `version.js` bump, no CHANGELOG entry (not a player-facing change), no hub card.
- Clean code rules from `CLAUDE.md` apply to new `poc-*.js` code only; copied demo code keeps its style. Every edit to a copied file carries a `// PoC:` comment.

## Review Focus

1. **Browser without WebGPU** (Firefox Linux, old Safari): `WebGPURenderer` silently falls back to WebGL2, so the page would *run* but not show WebGPU. Expected: a clear message, no renderer start. → Task 1 test `test_no_webgpu_shows_message`.
2. **Car model fails to load** (404, offline): expected: the demo's taxi stays visible and the page keeps running, with a console warning (not an error). → Task 3 test `test_car_load_failure_keeps_taxi`.
3. **Leftover demo state in `localStorage`** (`nyc-player-state` from the real demo on another origin is impossible, but a stale PoC save after a spawn change is not): expected: always start at Times Square in the car. → Task 4 removes the restore; test `test_spawns_at_times_square`.
4. **Wet toggle then time change**: expected: wetness stays on across a time switch (the preset must not reset it). → Task 2 unit test `roadWetness_wetAcrossPresets_staysWet`.
5. **Key held / repeated, or typed with modifiers** (Ctrl+R reload, Ctrl+T new tab): expected: only a plain press switches, the browser shortcuts keep working. → Task 2 unit test `isLookKey_withModifierOrRepeat_ignored`.

---

### Task 1: Copy the demo and gate it on WebGPU

**Files:**
- Create: `poc/webgpu/` ← demo's `index.html`, `css/`, `js/` (all files incl. both `.bin.gz`), `LICENSE`
- Create: `poc/webgpu/README.md` (what this is, source URL + commit SHA, license, how to run, keys)
- Create: `poc/webgpu/js/poc-gate.js`
- Modify: `poc/webgpu/index.html` (no-WebGPU message element), `poc/webgpu/js/main.js` (gate before `initApp()`)
- Modify: `CREDITS.md` (lines per Global Constraints)
- Test: `tests/poc-gate.test.mjs`, `tests/test_poc_webgpu.py`

**Interfaces:**
- Produces: `export async function hasWebGPU(nav): Promise<boolean>` — `true` only if `nav.gpu` exists and `await nav.gpu.requestAdapter()` returns non-null; any throw → `false`.
- Produces: element `#no-webgpu` (hidden by default) with German/English one-liner: "Dieser Browser unterstützt kein WebGPU. / This browser does not support WebGPU." plus a link back to `../../`.
- Produces (pytest): fixture `poc_page` serving the repo root (reuse `conftest.py`'s static server) and opening `/poc/webgpu/`.

- [ ] **Step 1: Copy** the demo tree from the pinned clone into `poc/webgpu/` (without `.git`, `tools/`, `tests/`, `README.md`); write `poc/webgpu/README.md` with the SHA.
- [ ] **Step 2: Write failing unit tests** in `tests/poc-gate.test.mjs`: `hasWebGPU_noGpu_false` (`{}`), `hasWebGPU_nullAdapter_false` (`requestAdapter` resolves `null`), `hasWebGPU_adapter_true` (resolves `{}`), `hasWebGPU_requestThrows_false`.
- [ ] **Step 3: Run** `node --test tests/poc-gate.test.mjs` → FAIL (module missing).
- [ ] **Step 4: Implement `hasWebGPU`** in `poc/webgpu/js/poc-gate.js`; in `main.js` call it before `initApp()`: on `false` show `#no-webgpu`, hide the loading overlay, return.
- [ ] **Step 5: Run** unit tests → PASS.
- [ ] **Step 6: Write Playwright tests** in `tests/test_poc_webgpu.py`: `test_no_webgpu_shows_message` (`add_init_script` deletes `navigator.gpu` → `#no-webgpu` visible, no `canvas`), `test_poc_page_has_no_console_errors` (load, wait for either `#no-webgpu` visible or `window.__poc?.ready === true`, timeout 120 s; zero `console.error`/`pageerror`).
- [ ] **Step 7: Run** `python -m pytest tests/test_poc_webgpu.py -v` → PASS (SwiftShader takes the no-WebGPU or the WebGPU path; both are fine for this test). `window.__poc` does not exist yet: the wait must accept the message path alone for now.
- [ ] **Step 8: Commit** `feat(poc): copy Slop New York as a WebGPU PoC page with a WebGPU gate`

### Task 2: Time-of-day and wet controls

**Files:**
- Create: `poc/webgpu/js/poc-look.js`
- Modify: `poc/webgpu/js/main.js` (keydown hook, wetness after every `selectTime`), `poc/webgpu/index.html` (hint line "T Tageszeit · R Nass/Trocken")
- Test: `tests/poc-look.test.mjs`, `tests/test_poc_webgpu.py`

**Interfaces:**
- Consumes: demo `selectTime(timeId)` in `main.js`, `cityUniforms.uRoadWetness` from `tsl-materials.js`, preset `roadWetness` from `lighting.js` `TIME_PRESETS`.
- Produces: `export const TIME_ORDER = ['golden', 'midday', 'twilight', 'midnight']`
- Produces: `export function nextTimePreset(id: string): string` (unknown id → `'golden'`)
- Produces: `export const WET_ROAD_WETNESS = 0.9`
- Produces: `export function roadWetness(presetWetness: number, wet: boolean): number` → `wet ? Math.max(presetWetness, WET_ROAD_WETNESS) : presetWetness`
- Produces: `export function isLookKey(event): 'time' | 'wet' | null` → `KeyT`/`KeyR` without `ctrlKey/metaKey/altKey` and `!repeat`, else `null`
- Produces: `window.__poc = { ready: boolean, setTime(id), setWet(bool), state(): { time, wet, roadWetness } }` — set `ready = true` after the first rendered frame.

- [ ] **Step 1: Write failing unit tests**: `nextTimePreset_cycles` (all four + wrap), `nextTimePreset_unknown_golden`, `roadWetness_dry_keepsPreset` (0.08 → 0.08), `roadWetness_wet_raisesToFloor` (0.08 → 0.9), `roadWetness_wetAcrossPresets_staysWet` (0.62 → 0.9 for every `TIME_ORDER` preset value 0.28/0.08/0.55/0.62), `isLookKey_plainT_time`, `isLookKey_plainR_wet`, `isLookKey_withModifierOrRepeat_ignored` (Ctrl, Meta, Alt, repeat → `null`).
- [ ] **Step 2: Run** `node --test tests/poc-look.test.mjs` → FAIL.
- [ ] **Step 3: Implement** `poc-look.js`; in `main.js` keep `wet` state, wrap `selectTime` so after the preset applies, `cityUniforms.uRoadWetness.value = roadWetness(preset.roadWetness, wet)`; add the keydown branch and `window.__poc`.
- [ ] **Step 4: Run** unit tests → PASS.
- [ ] **Step 5: Playwright** `test_look_keys_switch_state` (skip unless `window.__poc` gets `ready` within 120 s, i.e. a WebGPU-capable browser): press `T` → `state().time === 'midday'`; press `R` → `state().wet === true` and `roadWetness === 0.9`; press `T` again → still `wet`, `roadWetness === 0.9`.
- [ ] **Step 6: Run** `python -m pytest tests/test_poc_webgpu.py -v` → PASS or SKIP (no WebGPU).
- [ ] **Step 7: Commit** `feat(poc): T cycles time of day, R toggles wet roads`

### Task 3: Rhyflitzer car body on the demo's car

**Files:**
- Create: `poc/webgpu/js/poc-car.js`
- Modify: `poc/webgpu/js/controllers.js` (`createCarEntity`: after the taxi is built, call `attachGltfBody`) and `main.js` (lamp update when the time changes)
- Test: `tests/poc-car.test.mjs`, `tests/test_poc_webgpu.py`

**Interfaces:**
- Consumes: car entity `{ chassisPivot, wheels[].tire, headLights }` from `createCarEntity()`; `lampRole(extras)` from repo-root `gltfvehicle.js` (import `../../../gltfvehicle.js`, pure, no three import).
- Produces: `export const CAR_URL = '../../assets/bulldog.glb'`, `export const TAXI_LENGTH_M = 5.05` (the demo's contact-shadow length).
- Produces: `export function fitScale(modelLength: number, targetLength: number): number` → `targetLength / modelLength`; throws `RangeError` if `modelLength <= 0`.
- Produces: `export async function attachGltfBody(entity, loader): Promise<{ lamps: Material[] } | null>` — loads `CAR_URL`, scales by `fitScale(box.z-length, TAXI_LENGTH_M)`, aligns its forward axis with the demo's `+z`, sits it on `y = 0`, sets `castShadow/receiveShadow`, hides the taxi meshes in `chassisPivot` (body, decals, plates) and the taxi tyres; returns the materials whose `userData` has `lamp` `'head'`/`'tail'` (via `lampRole`). On load error: `console.warn`, leave the taxi visible, return `null`.
- Produces: `export function setLampsLit(lamps, lit: boolean)` → emissive intensity 0 (off) / 3 (on) on head and tail lamp materials; lit for `twilight` and `midnight`.

- [ ] **Step 1: Write failing unit tests**: `fitScale_halfLength_doubles` (2.5, 5.05 → 2.02), `fitScale_zero_throws`, `setLampsLit_on_setsEmissive` / `setLampsLit_off_zero` (plain objects `{ emissiveIntensity }`).
- [ ] **Step 2: Run** `node --test tests/poc-car.test.mjs` → FAIL.
- [ ] **Step 3: Implement** `poc-car.js`; hook into `createCarEntity` (the entity is returned synchronously, the body attaches when loaded) and call `setLampsLit` from the `selectTime` wrapper of Task 2.
- [ ] **Step 4: Run** unit tests → PASS.
- [ ] **Step 5: Playwright** `test_car_load_failure_keeps_taxi` (WebGPU-only, skip otherwise): `page.route('**/bulldog.glb', abort)` → `__poc.ready` becomes true, no `pageerror`, one console warning mentioning `bulldog.glb`. Extend `__poc.state()` with `car: 'bulldog' | 'taxi'` for the assertion.
- [ ] **Step 6: Run** pytest file → PASS or SKIP.
- [ ] **Step 7: Commit** `feat(poc): drive the Rhyflitzer sedan instead of the demo taxi`

### Task 4: Trim to a car-only Midtown slice

**Files:**
- Modify: `poc/webgpu/js/main.js`, `poc/webgpu/index.html`, `poc/webgpu/js/controllers.js` (only if the spawn lives there)
- Test: `tests/test_poc_webgpu.py`

**Interfaces:**
- Consumes: `TELEPORT_LOCATIONS.timessq` (`city-config.js`), `controllerManager.setMode('car')`, `teleportActiveTo(x, z, heading)`, `trafficSystem.group`, `highwayTraffic.group`.
- Produces: `__poc.state()` gains `mode` and `position: { x, z }`.

- [ ] **Step 1: Write failing Playwright test** `test_spawns_at_times_square` (WebGPU-only): with `localStorage['nyc-player-state']` pre-set to a far-away position, after `ready`: `mode === 'car'` and `position` within 30 m of `timessq`.
- [ ] **Step 2: Run** → FAIL (restore wins, or `mode`/`position` missing).
- [ ] **Step 3: Implement**: drop the `nyc-player-state` restore and save; spawn the car at `timessq`; mode switch locked to `car` (remove the mode buttons and their keys from the HUD, keep the camera keys); traffic and highway groups `visible = false` and not updated (road network and road paint still built, the paint needs it); audio not created and its button removed; helicopter/cyclist/person entities stay built but unused if removing them drags in edits across `controllers.js`. Add `scene.fog` or the demo's draw distance only if Midtown edges show; record in a `// PoC:` comment what was chosen.
- [ ] **Step 4: Run** full `python -m pytest tests/test_poc_webgpu.py -v` and `node --test tests/poc-*.test.mjs` → PASS or SKIP.
- [ ] **Step 5: Commit** `feat(poc): car-only Midtown slice, start at Times Square`

### Task 5: GPU screenshots and handoff

**Files:**
- Create: `tests/test_poc_webgpu_shots.py`
- Modify: `poc/webgpu/README.md` (how to view, keys, what was trimmed, link to the spec)

**Interfaces:**
- Consumes: `window.__poc.setTime`, `setWet`, `ready`; `conftest.py` GPU hook (`PW_CDP_ENDPOINT`).

- [ ] **Step 1: Write** `test_poc_shots` — skipped unless `PW_CDP_ENDPOINT` is set; at 1920×1080 for each of `TIME_ORDER` × `{dry, wet}`: `setTime`, `setWet`, wait 2 s, save `poc-<time>-<dry|wet>.png` to `$POC_SHOTS_DIR` (default: a `tmp_path`). Never committed.
- [ ] **Step 2: Run** without endpoint → SKIP. If the homelab GPU browser (#304) is reachable from the runner, run with it and attach the eight PNGs to the PR description; otherwise state in the PR that screenshots are pending the maintainer's browser.
- [ ] **Step 3: Update README**, run `node --test tests/*.test.mjs` (whole node suite, it is fast) and the two `test_poc*` files.
- [ ] **Step 4: Commit** `docs(poc): README and GPU screenshot script for the WebGPU PoC`
