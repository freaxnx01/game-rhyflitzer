# Join-link handoff (#1111) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An invite link opened in a new tab while the game runs in another tab hands the code to that tab, shows a notice, and does not start a join of its own. With no answer it joins itself as today.

**Architecture:** A pure module `joinhandoff.js` speaks a three-message protocol over an injected `BroadcastChannel`: `offer` → `ready` → `go`. `index.html` wires it into the load-time `openJoinLink()`.

**Tech Stack:** vanilla JS ES modules, `node --test`, Python Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-join-link-handoff-design.md`

## Global Constraints

- TDD for the module: failing node test first. Match the dense one-line style of `index.html`, `// #1111:` comments.
- Visible text de + en in `strings.js`, real umlauts. Channel name `rhyflitzer-join`.
- Run only targeted tests: `node --test tests/joinhandoff.test.mjs` and `tests/test_join_handoff.py`, foreground. Playwright: `PW_CDP_ENDPOINT=http://192.168.1.120:9223 /home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python -m pytest tests/test_join_handoff.py -q`.
- Commits end their subject with `(#1111)`. No `window.close()`. Do not touch `netcodec.js`.

## Task 1: `joinhandoff.js`

**Files:** Create `joinhandoff.js`, `tests/joinhandoff.test.mjs`.

**Interfaces:**
```js
export const WAIT_MS = 500;
export const MAX_CODE = 4000;
export function parseHandoff(msg)                               // -> msg | null (shape check)
export function offerJoin(code, { open, wait = WAIT_MS, id })   // -> Promise<boolean>, true = another tab took it
export function listenForJoin({ open, canAccept, onJoin, id })  // -> () => void (close)
```
`open()` returns a channel-like `{ postMessage, addEventListener('message', fn), close }`. Production passes `() => new BroadcastChannel('rhyflitzer-join')`. If `open` throws or `BroadcastChannel` is missing, `offerJoin` resolves `false` and `listenForJoin` returns a no-op.

- [ ] **Step 1: Write the failing tests** in `tests/joinhandoff.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offerJoin, listenForJoin, parseHandoff } from '../joinhandoff.js';
function makeBus() {
  const chans = new Set();
  return () => {
    const ls = new Set();
    const ch = { postMessage(d) { for (const o of chans) if (o !== ch) queueMicrotask(() => o._get(structuredClone(d))); }, addEventListener(_, f) { ls.add(f); }, _get(d) { for (const f of ls) f({ data: d }); }, close() { chans.delete(ch); } };
    chans.add(ch); return ch;
  };
}
test('offerJoin_noOtherTab_resolvesFalseAfterWait', async () => { assert.equal(await offerJoin('CODE', { open: makeBus(), wait: 20, id: 'n1' }), false); });
test('offerJoin_openTabAccepts_resolvesTrueAndTabGetsCode', async () => {
  const open = makeBus(); const got = [];
  listenForJoin({ open, canAccept: () => true, onJoin: (c) => got.push(c), id: 'A' });
  assert.equal(await offerJoin('CODE', { open, wait: 50, id: 'N' }), true);
  assert.deepEqual(got, ['CODE']);
});
test('offerJoin_twoOpenTabs_onlyOneGetsTheCode', async () => {
  const open = makeBus(); const got = [];
  listenForJoin({ open, canAccept: () => true, onJoin: (c) => got.push('a' + c), id: 'A' });
  listenForJoin({ open, canAccept: () => true, onJoin: (c) => got.push('b' + c), id: 'B' });
  assert.equal(await offerJoin('X', { open, wait: 50, id: 'n1' }), true);
  assert.equal(got.length, 1);
});
test('offerJoin_openTabBusy_resolvesFalseAndNothingReceived', async () => {
  const open = makeBus(); const got = [];
  listenForJoin({ open, canAccept: () => false, onJoin: (c) => got.push(c), id: 'A' });
  assert.equal(await offerJoin('X', { open, wait: 20, id: 'n1' }), false);
  assert.deepEqual(got, []);
});
test('listenForJoin_ownOffer_ignored', async () => {
  const open = makeBus(); const got = [];
  listenForJoin({ open, canAccept: () => true, onJoin: (c) => got.push(c), id: 'SAME' });   // the offering tab's own listener
  assert.equal(await offerJoin('X', { open, wait: 20, id: 'SAME' }), false);   // same tab id: the offer carries from:'SAME', the listener skips it
  assert.deepEqual(got, []);
});
test('parseHandoff_badShapes_null', () => {
  for (const m of [null, 'x', {}, { type: 'go' }, { type: 'offer', nonce: 1, from: 'A' }, { type: 'go', nonce: 'n', to: 'A', code: 5 }, { type: 'go', nonce: 'n', to: 'A', code: 'x'.repeat(4001) }]) assert.equal(parseHandoff(m), null);
  assert.ok(parseHandoff({ type: 'offer', nonce: 'n', from: 'A' }));
});
```
- [ ] **Step 2:** `node --test tests/joinhandoff.test.mjs` fails (module missing).
- [ ] **Step 3: Implement.** `offerJoin` opens a channel, posts `{type:'offer', nonce, from:id}` (`nonce` random per offer), listens for `{type:'ready', nonce, from}`; on the first one it posts `{type:'go', nonce, to:from, code}`, closes, resolves `true`; after `wait` ms without a `ready` it closes and resolves `false`. `listenForJoin` listens: on `offer` (valid shape, `from !== id`, `canAccept()` true) it posts `{type:'ready', nonce, from:id}` and remembers the nonce; on `go` with `to === id` and a remembered nonce it forgets the nonce and calls `onJoin(code)` once. Every inbound message passes `parseHandoff` first (type `offer|ready|go`; string `nonce`;  `offer` and `ready` need string `from`; `go` needs string `to` and string `code` of 1..`MAX_CODE` chars). Production passes one tab id (`crypto.randomUUID()`, fallback `Math.random().toString(36).slice(2)`) to both functions, so a tab ignores its own offer (a `BroadcastChannel` instance also receives from other instances in the same page).
- [ ] **Step 4:** tests green; commit `feat(multiplayer): join-link handoff protocol (#1111)`.

## Task 2: Strings

**Files:** Modify `strings.js` (en after `mpMaking` near line 832, de near 1701).

- [ ] Add `mpJoinedElsewhere` (en `'Joined in your other tab'`, de `'Im anderen Tab beigetreten'`) and `mpJoinReceived` (en `'Invitation received'`, de `'Einladung erhalten'`). Run the strings test file if one checks en/de key parity. Commit `feat(multiplayer): handoff notice strings (#1111)`.

## Task 3: Wire into `index.html`

**Files:** Modify `index.html` — the import line (~1041) and the block at ~7509-7517.

- [ ] Add `import { offerJoin, listenForJoin } from './joinhandoff.js';` next to the `netcodec.js` import.
- [ ] Replace the `openJoinLink` block with:
```js
// #980: a `#join=<code>` link fills the guest screen; the fragment goes at once, nothing connects before the click
// also on hashchange: a link pasted into a tab that already runs the game only changes the fragment, it does not reload
const TAB_ID = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
function joinWithCode(linked) { if (linked && !REGION.generated && !NET.role) { openMp(); netGuestRole(); $('mpin').value = linked; $('mpmake').focus(); } }
function dropJoinHash() { if (location.hash.startsWith('#join=')) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* harmless */ } } }
function openJoinLink() { const linked = readJoinHash(location.hash); dropJoinHash(); joinWithCode(linked); }
// #1111: a link clicked while the game is open in another tab: that tab takes the code, this one only says so; nobody answers -> join here as before
async function openJoinLinkAtLoad() {
  const linked = readJoinHash(location.hash); dropJoinHash();
  if (!linked || REGION.generated) return;
  const taken = await offerJoin(linked, { open: () => new BroadcastChannel('rhyflitzer-join'), id: TAB_ID }).catch(() => false);
  if (taken) toast(tr('mpJoinedElsewhere'), 3600); else joinWithCode(linked);
}
openJoinLinkAtLoad();
window.addEventListener('hashchange', openJoinLink);
listenForJoin({ id: TAB_ID, open: () => new BroadcastChannel('rhyflitzer-join'), canAccept: () => !REGION.generated && !NET.role, onJoin: (code) => { joinWithCode(code); toast(tr('mpJoinReceived')); } });
```
- [ ] `node --test tests/joinhandoff.test.mjs` still green. Commit `feat(multiplayer): hand an invite link to the open tab (#1111)`.

## Task 4: Playwright test

**Files:** Create `tests/test_join_handoff.py`.

- [ ] Use the `server` fixture and `open_page` helper from `test_multiplayer_cruise.py`, with `ARGS + NO_THROTTLE`, but both pages in **one** `browser.new_context()` (`BroadcastChannel` does not cross contexts). Get a real code from a separate host page (reuse `connect` helpers in `test_multiplayer_lobby.py`) or build a link from `joinLinkFor`.
- [ ] `test_linkInSecondTab_opensGuestScreenInFirstTab`: page A idle, page B opens `<server>/#join=<code>` in A's context. Assert A shows `#mpinbox` with `#mpin` equal to the code within `T`; B's `#toast` text is the en/de `mpJoinedElsewhere`; B's `#mp` stays hidden; hash empty in both; no console errors.
- [ ] `test_linkInOnlyTab_joinsItself`: a single page with the link opens the guest screen as today.
- [ ] `test_openTabAlreadyInSession_newTabJoinsItself`: A has `window.__mm.net().role` set; B's `#mpin` is filled, A unchanged.
- [ ] Run the file in the foreground. Commit `test(multiplayer): invite link handoff between tabs (#1111)`.

## Task 5: CHANGELOG

- [ ] Under `[Unreleased]` → `### Changed`, newest first, German, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`, 1–3 bold keywords: "Ein angeklickter **Einladungslink** tritt jetzt im schon offenen **Tab** bei; der neue Tab sagt nur 'Im anderen Tab beigetreten'." Commit `docs(changelog): invite link joins in the open tab (#1111)`.

## Acceptance check

`node --test tests/joinhandoff.test.mjs` and `tests/test_join_handoff.py` green; manual: click an invite link from another app with the game open.
