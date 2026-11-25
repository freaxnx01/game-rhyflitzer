# Pontoon bridge synced in multiplayer (#1190) Implementation Plan

**Goal:** a pontoon bridge laid or removed by any player shows for everyone; the host is authoritative and sends the state at drive start.
**Spec:** `docs/superpowers/specs/2026-11-25-mp-pontoon-sync-design.md`. Buildless repo: vanilla JS, no new packages. Tests: `node --test tests/*.test.mjs`, then only `tests/test_pontoon.py` and the new `tests/test_multiplayer_pontoon.py` (no full Playwright suite).

**Files:** `pontoon.js`, `netcodec.js`, `netsync.js`, `index.html`, `tests/pontoon.test.mjs`, `tests/netcodec.test.mjs`, `tests/netsync.test.mjs`, `tests/test_multiplayer_pontoon.py` (new), `CHANGELOG.md`.

**Global constraints:** validate every inbound message; the host stamps nothing it cannot verify; `CODE_VERSION` +1 over whatever is on `main` when you rebase (#1191 also bumps it; the second to land rebases its bump). CHANGELOG entry is German, timestamped `TZ=Europe/Zurich date '+%F %H:%M'`, under `[Unreleased]` / `### Added`, 1-3 bold keywords, keys in `<kbd>`.

## Task 1: wire format in pontoon.js

**Interfaces:** `deckToWire(d)` -> `{ a:[x,z], b:[x,z], h:[deckH,hNear,hFar], r:[rampNear,rampFar], built, dir }` rounded to 2 decimals; `deckFromWire(w, cfg = PONTOON_CFG)` -> the full deck (`len`, `ux`, `uz`, `hw`, `nBays` derived).

- [ ] **Write the failing test** in `tests/pontoon.test.mjs`:

```js
test('deckToWire/deckFromWire round-trip a crossingLine deck', () => {
  const d = crossingLine(env(), 0, 25), back = deckFromWire(deckToWire({ ...d, built: 0.5, dir: -1 }));
  for (const k of ['len', 'ux', 'uz', 'deckH', 'hNear', 'hFar', 'rampNear', 'rampFar']) close(back[k], d[k], 0.02, k);
  assert.equal(back.nBays, d.nBays); assert.equal(back.hw, d.hw); assert.equal(back.built, 0.5); assert.equal(back.dir, -1);
});
```

- [ ] Run it (fails: not exported), implement both in `pontoon.js` (`len = hypot(b-a)`, `ux,uz = (b-a)/len`, `nBays = Math.ceil(len / cfg.bay)`), run again (passes).

## Task 2: the `pontoon` validator in netcodec.js

- [ ] **Write the failing test** in `tests/netcodec.test.mjs`, next to `parseMessage_knock_validated`:

```js
const WD = { a: [0, 0], b: [100, 0], h: [3, 2.5, 2.5], r: [10, 10], built: 0, dir: 1 };
test('parseMessage_pontoon_validated', () => {
  const j = (o) => JSON.stringify({ type: 'pontoon', ...o });
  assert.deepEqual(parseMessage(j({ op: 'lay', d: WD }), CTX), { type: 'pontoon', op: 'lay', d: WD });
  assert.deepEqual(parseMessage(j({ op: 'take' }), CTX), { type: 'pontoon', op: 'take' });
  assert.deepEqual(parseMessage(j({ op: 'sync' }), CTX), { type: 'pontoon', op: 'sync' });
  assert.equal(parseMessage(j({ op: 'sync', d: { ...WD, built: 0.4, dir: -1 } }), CTX).d.built, 0.4);
  for (const o of [{ op: 'x' }, { op: 'lay' }, { op: 'lay', d: { ...WD, built: 0.5 } }, { op: 'lay', d: { ...WD, dir: -1 } },
    { op: 'sync', d: { ...WD, dir: 0 } }, { op: 'sync', d: { ...WD, b: [700, 0] } }, { op: 'sync', d: { ...WD, a: [60000, 0] } },
    { op: 'sync', d: { ...WD, r: [60, 60] } }, { op: 'sync', d: { ...WD, r: [-1, 5] } }, { op: 'sync', d: { ...WD, h: [3, 2.5, 99999] } },
    { op: 'sync', d: { ...WD, built: 2 } }, { op: 'sync', d: { ...WD, b: [0, 0] } }, { op: 'take', d: WD }, { op: 'sync', d: { ...WD, a: [null, 0] } }])
    assert.equal(parseMessage(j(o), CTX), null, JSON.stringify(o));
});
```

- [ ] Run (fails), then add `pontoon: parsePontoon` to `VALIDATORS`: pure `parsePontoon(m)` with helper `parseDeck(d, op)` returning a fresh `{ a, b, h, r, built, dir }` or null, per the spec's validation list (`len = hypot`, `0 < len <= 600`, `POS_MAX`, `Y_MIN..Y_MAX`, ramp sum, `built` 0..1, `dir` +-1, `lay` needs `built === 0 && dir === 1`, `take` no `d`, `sync` `d` optional). Bump `CODE_VERSION` and update its comment. Fix any `CODE_VERSION` literal in tests (`grep -n "R2" tests/*.mjs`). Run `node --test tests/netcodec.test.mjs`.

## Task 3: pontoonAllowed in netsync.js

- [ ] **Write the failing test** in `tests/netsync.test.mjs` (mirror the `knockAllowed` tests): first call true, a call 100 ms later false and not recorded, a call 250 ms after the first true, another slot independent, non-finite `now` false.
- [ ] Implement beside `knockAllowed`:

```js
export const PONTOON_GAP_MS = 250;
export function pontoonAllowed(seen, slot, now) {
  if (!Number.isFinite(now)) return false;
  if (now - (seen[slot] ?? -Infinity) < PONTOON_GAP_MS) return false;
  seen[slot] = now; return true;
}
```

## Task 4: wiring in index.html

Extend the imports (`pontoon.js` line `index.html:1121`: `deckToWire`, `deckFromWire`; `netsync.js` line `:1051`: `pontoonAllowed`). Reuse the spec section 4-8 exactly:

- [ ] `adoptPontoon(w)` near `freePontoon` (`:5873`): `null` -> `PONTOON.deck = null; freePontoon()`; else build `deck = deckFromWire(w)`; if there is no current deck or its `a`/`b` differ, `PONTOON.deck = deck; buildPontoonMeshes(deck)`, else `PONTOON.deck = { ...PONTOON.deck, built: deck.built, dir: deck.dir }; updatePontoonMeshes(PONTOON.deck)`. Toast `pontoonBuilding` when a bridge appeared or `dir` became 1, `pontoonRemoving` when `dir` became -1, with `TOAST_S.event`.
- [ ] `pressPontoon` (`:5852`): in a session (`NET.session && NET.link`) a guest sends instead of applying. Existing checks (overlay, FLY, `nearDeck`, `crossingLine` errors and toasts) stay in front: `NET.role === 'G'` -> `NET.link.send(HOST_ID, deck ? { type: 'pontoon', op: 'take' } : { type: 'pontoon', op: 'lay', d: deckToWire(line) })` and return without touching `PONTOON`. The host and single-player keep the current code path, and the host (when `NET.session`) then calls `netBroadcastPontoon()`.
- [ ] `netBroadcastPontoon()` and `netSendPontoon(peerId)`: `{ type: 'pontoon', op: 'sync', ...(PONTOON.deck ? { d: deckToWire(PONTOON.deck) } : {}) }` to every slot / one peer.
- [ ] `netHostMessage` (`:7063`), before the `cp` line: `if (msg.type === 'pontoon') { if (msg.op === 'sync' || !pontoonAllowed(pontoonSeen, id, performance.now())) { NET.bad++; return; } if (msg.op === 'lay' && !PONTOON.deck) { PONTOON.deck = deckFromWire(msg.d); buildPontoonMeshes(PONTOON.deck); toast(...) } else if (msg.op === 'take' && PONTOON.deck) { PONTOON.deck = togglePontoon(PONTOON.deck); toast(...) } else return; netBroadcastPontoon(); return; }`. Declare `let pontoonSeen = {}`, reset it in `netEndSession` next to `knockSeen`.
- [ ] `netGuestMessage` (`:7101`): `if (msg.type === 'pontoon') { if (msg.op === 'sync') adoptPontoon(msg.d ?? null); else NET.bad++; return; }`.
- [ ] `netStartSession` (`:7345`), last line: `if (NET.role === 'H') netBroadcastPontoon();`.
- [ ] Test hook: `window.__mm.netPontoonBad`-style is not needed; reuse `window.__mm.pontoon()` and `NET.bad` via the existing multiplayer hooks.

## Task 5: browser test (targeted)

- [ ] New `tests/test_multiplayer_pontoon.py`, built like `tests/test_multiplayer_bump.py` (`pair_fixture` from `test_multiplayer_cruise`, two pages): (1) guest at the Rhine bank (`BANK`, `NORTH` from `tests/test_pontoon.py`) presses <kbd>U</kbd>; poll both `window.__mm.pontoon()` until `built === 1` and equal `a`/`b`; (2) host presses <kbd>U</kbd> near the deck: both end with `on === false`; (3) host lays a bridge, then guest leaves/starts a fresh drive: the guest's `pontoon().on` is true at start. Run only this file and `tests/test_pontoon.py`; console must stay empty.

## Task 6: CHANGELOG, full unit run

- [ ] Add the German entry (example: "Im **Mehrspieler** sehen alle die **Pontonbrücke**, die ein Spieler mit <kbd>U</kbd> legt, und können darüberfahren; jeder kann sie wieder abbauen."). Run `node --test tests/*.test.mjs` (all green), then commit `feat(multiplayer): pontoon bridge synced for every player (#1190)`.
