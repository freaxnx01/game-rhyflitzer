# Street View link Implementation Plan

**Goal:** the F3 panel's Street View button opens a picture wherever Google has coverage.
**Spec:** `docs/superpowers/specs/2026-10-11-streetview-link-design.md`
**Local-only:** no.
**Tests:** `node --test prototype/tests/*.test.mjs` plus ONE targeted Playwright run: `python -m pytest prototype/tests/test_debug.py -k map_links`. Never the full ~2 h suite.

### Task 1: [needs maintainer] check the variants in a real browser

Not an agent task (Google's consent wall blocks headless checks). Open these three in a normal browser, logged in as usual, and report which show a picture (default if no answer comes: go with variant A):

- A: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=47.553215,7.990035&heading=187`
- B: `https://www.google.com/maps?layer=c&cbll=47.553215,7.990035&cbp=0,187,0,0,0`
- Control (known coverage): `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=47.5535,7.9876` (Hauptstrasse Sisseln, adjust to a street you know has Street View)

Decision table: A works then Task 2 as written. A black, B works then swap to variant B in Task 2. Control works, A and B black at the issue spot then no coverage there: close #212, skip Tasks 2 and 3. Control black too then Chrome/GPU issue on the tester's machine: close #212 as not-a-bug.

### Task 2: change `streetViewUrl` (TDD)

**Files:** `prototype/debug.js`, `prototype/tests/debug.test.mjs`, `prototype/tests/test_debug.py`

- [ ] In `debug.test.mjs` (test `streetViewUrl: pano at the spot, heading rounded and folded into 0..359`) change the expected string to variant A:

```js
assert.equal(streetViewUrl(47.5506, 7.9671, 86.6), 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=47.550600,7.967100&heading=87');
```

  The `includes(`&heading=${want}&`)` loop must become `endsWith(`&heading=${want}`)`. Run `node --test prototype/tests/debug.test.mjs`: red.
- [ ] `debug.js`: `export function streetViewUrl(lat, lon, heading) { return \`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${deg(lat)},${deg(lon)}&heading=${compass(heading)}\`; }`. (Variant B instead: `https://www.google.com/maps?layer=c&cbll=${deg(lat)},${deg(lon)}&cbp=0,${compass(heading)},0,0,0`.) Green.
- [ ] `test_debug.py`: the `LINK_RE["street"]` regex loses `&pitch=0&fov=90` (A) or follows B's shape. Keep group 3 as the heading (the test reads `re.match(LINK_RE["street"], ...).group(3)`).
- [ ] Run `python -m pytest prototype/tests/test_debug.py -k map_links` in the foreground (`timeout=600000`, no `run_in_background`).

### Task 3: CHANGELOG and commit

- [ ] `### Fixed` under `[Unreleased]`, timestamped: `` `2026-10-11 HH:MM` The **Street View** button in the F3 panel opens the street picture at the car's spot again instead of a black page. ``
- [ ] `node --test prototype/tests/*.test.mjs`. Commit `fix(debug): Street View link without pitch and fov overrides (#212)`. Closes #212.
