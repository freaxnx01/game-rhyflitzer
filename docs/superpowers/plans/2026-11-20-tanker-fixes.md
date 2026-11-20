# Tanker fixes (#1122) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Rhy Tanker and Rhy Mixer really reach about 80 km/h, the tanker's nitro flames sit at the trailer's tail, and heavy vehicles bend lamps at low speed.

**Architecture:** An optional per-vehicle dry drag (`drive.drag`) in `world.js` `rollingDrag` lets the trucks reach their speed while still pulling away slowly. The flames for a vehicle with a trailer hang on the trailer node. `knock.js` `knockAction` gets the vehicle's mass, and the lamp's bend speed falls with it.

**Tech Stack:** vanilla JS ES modules, three.js r170 (index.html only), `node --test`, Python Playwright.

**Spec:** the body of issue #1122 (findings + maintainer decisions, 2026-11-20). There is no separate spec document.

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Speed targets, on a road, straight, dry, held for 40 s: tanker and mixer **78–84 km/h** without nitro, **95–115 km/h** with nitro; 0 → 50 km/h takes **at least 5 s** without nitro (they stay slow off the line). All other vehicles must be unchanged (no `drive.drag` → the old 0.12).
- Suggested numbers (from `v_eq = (accel − 0.6) / (accel / top + drag)`), adjust within the targets:
  tanker `top: 30, topNitro: 31.5, accel: 3.0, accelNitro: 7, drag: 0.008`; mixer `top: 30, topNitro: 31.7, accel: 3.5, accelNitro: 8, drag: 0.014`.
- Lamps: `export const LAMP_BEND = { kmh: 30, minMass: 1 }`; the bend speed in km/h is `max(KNOCK_MIN * 3.6, LAMP_BEND.kmh / max(LAMP_BEND.minMass, mass))`. So a car (mass ≤ 1) bends one from 30 km/h, the bus (5) from 6 km/h, and the mixer (6) and the tanker (9) from 5.4 km/h (walking pace). `knockAction(kind, speed, mass = 1)`. `BEND_KMH` goes; a test that pinned 40 is changed to the new rule (the maintainer's decision).
- Flames: tanker only (the only vehicle with `trailer`); they swing with the trailer, at its tail, pointing backward along the trailer; everything else as today. The truck's `exhaustAt` is no longer used for the tanker's flames.
- Run only targeted tests: `node --test tests/*.test.mjs` and the named Playwright files, never the whole Playwright suite.
  Playwright: `PW_CDP_ENDPOINT=http://192.168.1.120:9223 /home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python -m pytest <file> -q`, foreground.
- Commits end their subject with `(#1122)`; one CHANGELOG entry under `[Unreleased]` → `### Fixed` (added by the last task, covering all three), timestamp `TZ=Europe/Zurich date '+%F %H:%M'`, bold 1–3 keywords, German like the tanker's entry.
- Match the dense one-line style and `// #1122:` comments of `index.html` and the header-comment style of the modules.

## Review Focus

- Wet / underwater and forest floor: `drive.drag` replaces only the dry base 0.12; the wet drag and the forest floor stay as they are. Task 1 node test.
- Reversing and braking feel unchanged for the trucks (reverseMax and brake untouched). The old 0.6 constant stays.
- Remote cars and parked/gallery tankers: the trailer flames stay hidden unless that car's nitro is lit (as today for the truck flames). Task 2 checks the parked depot tanker.
- A lamp hit by a car at 25 km/h still stands (mass 1); a tanker at 8 km/h bends it. Task 3 node tests.
- Switching from the tanker to a hatchback: no flames left on a stale trailer node (#1103 cleared `userData.trailer` on build). Task 2 test.

---

### Task 1: the trucks reach their speed

**Files:** Modify `world.js` (`rollingDrag`), `index.html` (pass `D.drag` at the one `rollingDrag(` call in `stepCar`), `tanker.js`, `mixer.js`, `tests/world.test.mjs` (or the node test that covers `rollingDrag`; find it), `tests/tanker.test.mjs`, the mixer's node test; Create `tests/test_truck_speed.py`.

- [ ] Step 1: node tests: `rollingDrag(false, w, false, 1)` stays 0.12 without a base; with a base of 0.008 it is 0.008; wet ignores the base; the forest floor adds on top of the base. The tanker and mixer tests pin the new drive numbers. Playwright `tests/test_truck_speed.py`, harness like `tests/test_sidecam.py` (`open_hand`), vehicles picked as `tests/test_tanker.py` `pick_tanker` does. Drive straight on the start heading with `__mm.sim(0, 0, heading, 0, secs, ['KeyW'])` and `['KeyW','KeyN']` for nitro. Tanker and mixer: 40 s gives 78–84 km/h, with nitro 95–115 km/h, and 5 s from standstill gives under 50 km/h. The compact's 40 s speed is unchanged against main: measure it once on main first and pin it ±2 km/h.
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement: `rollingDrag(wet, wetDrag, inWood, roadD, dry = 0.12)`, and `drive.drag` with a comment on both trucks.
- [ ] Step 4: `node --test tests/*.test.mjs`; `tests/test_truck_speed.py`, `tests/test_tanker.py`, `tests/test_carselect.py` → pass. #993 is red on main already; report it, don't fix it.
- [ ] Step 5: commit `fix(tanker): the tanker and the mixer reach 80 km/h (#1122)`.

### Task 2: the nitro flames ride on the trailer

**Files:** Modify `index.html` (build: `addFlames` / `exhaustSpots` call at `wireWheels(g, root); addFlames(...)`; the trailer rig `rigTrailer`), `tanker.js` (`trailer.exhaustAt: [x, y]` in the trailer node's metres, the tail of `trailer_body`), `tests/test_tanker.py`.

- [ ] Step 1: tests in `tests/test_tanker.py`: with nitro lit and the trailer swung (a left circle as the existing swing test drives), every visible flame mesh's world position lies behind the trailer's tail along the trailer's heading (project on the trailer's forward: < −(length+tail) − 0.5 relative to the hitch). Picking the hatchback after the tanker leaves no flame meshes under a detached trailer node. The parked depot tanker shows no lit flames. Add a read-only hook if needed, e.g. `__mm.flames()` → `[{ x, y, z, visible }]` world positions.
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement. For a vehicle with `trailer`, the flames are placed from `trailer.exhaustAt` and parented under the trailer node. Their nitro visibility works as before.
- [ ] Step 4: `node --test tests/*.test.mjs`; `tests/test_tanker.py`, `tests/test_tanker_model.py` → pass; a screenshot (chase cam, nitro, trailer swung) into your own `mktemp -d`.
- [ ] Step 5: commit `fix(tanker): the nitro flames ride on the trailer's tail (#1122)`.

### Task 3: heavy vehicles bend lamps at low speed

**Files:** Modify `knock.js` (`LAMP_BEND`, `knockAction(kind, speed, mass = 1)`, the `step()` call passing `c.mass`), `index.html` (`createKnock` car hook: `kcar.mass = VEH.mass`), `tests/knock.test.mjs`, `CHANGELOG.md`.

- [ ] Step 1: node tests: a lamp at 29 km/h with mass 1 gives null and at 31 km/h gives 'bend'; mass 0.6 behaves like 1; mass 5 gives 'bend' at 7 km/h and null at 5; mass 9 gives 'bend' at 6 km/h; under `KNOCK_MIN` it is null for any mass; the other kinds are unchanged ('fly' at or above `KNOCK_MIN`). If `tests/test_knock.py` has a lamp case, add one in-game check: the tanker driving at 10 km/h into a lamp bends it (`sim(..., props = true)` as that file does).
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement.
- [ ] Step 4: `node --test tests/*.test.mjs`; `tests/test_knock.py` → pass.
- [ ] Step 5: CHANGELOG `### Fixed`, one German entry for all three points, e.g. "Der **Rhy Tanklaster** und der Fahrmischer fahren jetzt wirklich bis 80 km/h; die **Nitroflammen** kommen hinten aus dem Anhänger; schwere Fahrzeuge knicken **Strassenlaternen** schon langsam um, Autos ab 30 km/h". Commit `fix(knock): heavy vehicles bend lamps at low speed (#1122)`.
