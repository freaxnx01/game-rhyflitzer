# Hübel ring and room stats (#1171) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Umami shows how many visits reach Ring 1, Ring 2 and each Hübel room.

**Architecture:** A pure helper in `analytics.js` maps a level id to `{ ring, room }` from `rooms.js` `RINGS`. A small "once" reporter sends `hideout-ring` and `hideout-room` the first time each value is seen in a page load. The existing once-a-second stats interval in `index.html` (`// #538: Umami bookkeeping`) feeds it `LEVELS.id`.

**Tech Stack:** buildless ES modules, `node --test`, Playwright (pytest).

**Spec:** issue #1171 (no separate spec; the issue body is the spec).

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Event names: `hideout-ring` with `{ ring: 1 | 2 }`; `hideout-room` with `{ ring: 1 | 2, room: <room name, or its level id when the name is null> }`.
- Each distinct ring / room is sent at most once per page load. No positions, no other data (coarse ids only, as #538).
- `analytics.js` must not import `rooms.js` (keep it pure and cheap): the caller passes `RINGS`.
- README privacy paragraph (de + en): add the Hübel rings and rooms to the list of counted things. German: real umlauts, capitalised Du/Dir.
- CHANGELOG is for players; this is not a player-visible change, so no CHANGELOG entry.
- Tests: `node --test tests/*.test.mjs` (bare directory fails); browser: only `tests/test_analytics.py`, foreground, under `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0`.
- Commits reference #1171.

## Review Focus

1. Driving ring → room → ring → same room sends that room once, not twice.
2. Surface, the old cave levels and any non-ring level send nothing.
3. A ring-2 room without a name (e.g. `r2room3`) is sent as its id, never `null`.
4. Entering a room counts its ring too, even if the ring sample was skipped (a room is reached through its ring, but sampling is once a second).
5. A blocked or missing `umami` still never breaks the game (existing test stays green).

---

### Task 1: `hideoutData` and the once reporter, wired into the game

**Files:**
- Modify: `analytics.js`, `index.html` (the `#538` STATS block, ~line 8750), `README.md` (privacy paragraphs, de + en, ~lines 99 and 101)
- Test: `tests/analytics.test.mjs`, `tests/test_analytics.py`

**Interfaces:**
- `hideoutData(levelId, rings) -> null | { ring: number, room?: string }` — `rings` has the `RINGS` shape `[{ id, rooms: [{ id, name }] }]`; ring number is index + 1.
- `createOnceReporter({ send = track } = {}) -> { see(levelId, rings) }` — sends `hideout-ring` for a ring not yet sent (also when `levelId` is a room of it) and `hideout-room` for a room not yet sent.

- [ ] **Step 1: node tests** in `tests/analytics.test.mjs` with a fake `rings` (two rings, one named room and one with `name: null` each):
  - `hideoutData('surface', rings) === null`, unknown id → `null`;
  - ring ids → `{ ring: 1 }` / `{ ring: 2 }`;
  - named room → `{ ring: 1, room: 'La Tour Eiffel' }`; unnamed ring-2 room → `{ ring: 2, room: 'r2room3' }`;
  - once reporter: `see` sequence `surface, ring, eiffel, ring, eiffel, ring2, r2room3, r2room3` sends exactly `hideout-ring {ring:1}`, `hideout-room {ring:1, room:'La Tour Eiffel'}`, `hideout-ring {ring:2}`, `hideout-room {ring:2, room:'r2room3'}` in that order;
  - `see('eiffel')` first (ring never sampled) sends `hideout-ring {ring:1}` then the room.
- [ ] **Step 2:** run `node --test tests/analytics.test.mjs`, watch it fail.
- [ ] **Step 3:** implement both in `analytics.js`; in `index.html` import them, add `hideout: createOnceReporter()` to `STATS` and call `STATS.hideout.see(LEVELS.id, RINGS)` in the existing 1 s interval.
- [ ] **Step 4:** browser test in `tests/test_analytics.py` (reuse `boot`/`named`): put the game on ring 1 and into a room the way `tests/test_hideout.py` does it, wait for `hideout-room`, assert `hideout-ring {ring: 1}` and one `hideout-room` with `ring == 1` and a non-empty `room`. Watch it fail before Step 3 if run order allows, else at least green after.
- [ ] **Step 5:** README privacy paragraphs (de + en).
- [ ] **Step 6:** `node --test tests/*.test.mjs` green; `tests/test_analytics.py` green (foreground, capped).
- [ ] **Step 7:** commit `feat(analytics): count Hübel ring and room visits in Umami (#1171)`.
