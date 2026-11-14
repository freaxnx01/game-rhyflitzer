# Multiplayer connect: guest deadline, 10-minute codes, join link (plan, #980)

> Carry out task by task. Spec: `docs/superpowers/specs/2026-11-14-mp-guest-deadline-join-link-design.md`.

**Goal:** a guest stays open while its answer code is carried to the host; codes live 10 minutes; the host can copy an
invite link that opens the guest screen with the code filled in.

**Architecture:** `netlink.js`: a guest lifetime timer (`CODE_TTL` s, only in state `'new'`) replaces the 20 s deadline.
`netcodec.js`: `CODE_TTL = 600`, `joinLinkFor`, `readJoinHash`. `index.html`: a button and a load-time block beside the
region-switch block (`MP_JOIN_KEY`).

## Global constraints

- Files: `netlink.js`, `netcodec.js`, `index.html`, `strings.js`, the tests below, `CHANGELOG.md`. Nothing else.
- Do not change the host's 20 s deadline (`hostAccept`), the code format, `CODE_VERSION`, `CODE_SKEW`.
- Run `node --test tests/netlink.test.mjs tests/netcodec.test.mjs tests/strings.test.mjs` and one Playwright file,
  `tests/test_multiplayer_lobby.py` (foreground, `PW_CDP_ENDPOINT=http://192.168.1.120:9223`). No full suite. Red after 3 attempts: stop.
- New strings in `strings.js` en and de (German: `Du`, umlauts). Push before the browser run.

### Task 1: guest deadline (tests first)

**Files:** `tests/netlink.test.mjs`, `netlink.js`

- [ ] **Step 1: Write the failing tests.** Add `import { CODE_TTL } from '../netcodec.js';`, add `const PCS = [];` above
  `FakePc` and `PCS.push(this);` at the end of its constructor. Replace the test `guestAnswer_neverConnects_timeoutDropsTheHostPeer`
  with:

```js
// #980: the guest must not give up after 20 s
async function answered(onPeerState = () => {}) {
  PCS.length = 0;
  const link = createLink({ onPeerState });
  await link.guestAnswer('offer');
  return link;
}
const withTimers = async (fn) => { mock.timers.enable({ apis: ['setTimeout'] }); try { await fn(); } finally { mock.timers.reset(); } };

test('guestAnswer_codeStillInTransit_staysOpenPastTwentySeconds', () => withTimers(async () => {
  const states = [];
  const link = await answered((id, s) => states.push([id, s]));
  mock.timers.tick(20000); mock.timers.tick(100000);
  assert.deepEqual(link.peerIds(), [0]);
  assert.deepEqual(states, []);
}));

test('guestAnswer_hostNeverTakesTheAnswer_timeoutAfterTheCodeLifetime', () => withTimers(async () => {
  const states = [];
  const link = await answered((id, s) => states.push([id, s]));
  mock.timers.tick(CODE_TTL * 1000 - 1);
  assert.deepEqual(link.peerIds(), [0]);
  mock.timers.tick(1);
  assert.deepEqual([link.peerIds(), states], [[], [[0, 'timeout']]]);
}));

test('guestAnswer_iceAlreadyStarted_lifetimeTimerLeavesTheConnectionAlone', () => withTimers(async () => {
  const link = await answered();
  PCS[0].connectionState = 'connecting';
  mock.timers.tick(CODE_TTL * 1000);
  assert.deepEqual(link.peerIds(), [0]);
}));

test('guestAnswer_connectionFailed_isReportedAsFailed', () => withTimers(async () => {
  const states = [];
  await answered((id, s) => states.push([id, s]));
  PCS[0].connectionState = 'failed';
  PCS[0].dispatchEvent(new Event('connectionstatechange'));
  assert.deepEqual(states, [[0, 'failed']]);
}));
```

- [ ] **Step 2: Implement** (red first: `node --test tests/netlink.test.mjs`). In `netlink.js` `guestAnswer`, replace `armConnectDeadline(HOST_ID, entry);` with
  `armAnswerLifetime(entry);`, add before `attachChannel`, and reword the `CONNECT_MS` comment to "the host's deadline after hostAccept":

```js
  // armAnswerLifetime(entry) — no 20 s deadline: the answer travels by hand. The host's slot lives CODE_TTL s; after that an
  // untaken answer is dead; once ICE runs (not 'new') the host has it.
  function armAnswerLifetime(entry) {
    entry.timers.push(setTimeout(() => {
      if (entry.pc.connectionState !== 'new') return;
      onPeerState(HOST_ID, 'timeout');
      close(HOST_ID);
    }, CODE_TTL * 1000));
  }
```

  Commit `fix(multiplayer): the guest stays open while its answer code is in transit (#980)`.

### Task 2: ten-minute codes and join-link helpers

**Files:** `tests/netcodec.test.mjs`, `netcodec.js`, `strings.js`

- [ ] **Step 1: Failing tests.** In `tests/netcodec.test.mjs`: import `joinLinkFor, readJoinHash`; line 28 becomes
  `assert.equal(CODE_TTL, 600);`; the expiry line becomes
  `assert.equal((await decodeCode(h, 'H', 1601)).error, 'expired'); assert.equal((await decodeCode(h, 'H', 939)).error, 'expired'); assert.equal((await decodeCode(h, 'H', 1600)).ok, true);`. Append:

```js
test('joinLinkFor_readJoinHash_roundTrip', () => {
  const link = joinLinkFor('https://github.freaxnx01.ch', '/game-rhyflitzer/index.html', 'R1H.abc-_XYZ');
  assert.equal(link, 'https://github.freaxnx01.ch/game-rhyflitzer/index.html#join=R1H.abc-_XYZ');
  assert.equal(readJoinHash(new URL(link).hash), 'R1H.abc-_XYZ');
});

test('readJoinHash_noJoinOrEmpty_null', () => {
  for (const h of ['', '#', '#join=', '#join=   ', '#other=R1H.x', undefined, 7]) assert.equal(readJoinHash(h), null, String(h));
});
```

- [ ] **Step 2: Implement** (red first) in `netcodec.js`: `export const CODE_TTL = 600;        // seconds a code stays valid (10 minutes, shown as a countdown)`; append:

```js
// ---- the invite link (#980) ----
const JOIN_PREFIX = '#join=';
export function joinLinkFor(origin, pathname, code) { return `${origin}${pathname}${JOIN_PREFIX}${encodeURIComponent(code)}`; }
// readJoinHash(hash) — the code a `#join=` fragment carries, or null; decodeCode judges the code itself
export function readJoinHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(JOIN_PREFIX)) return null;
  let code = hash.slice(JOIN_PREFIX.length);
  try { code = decodeURIComponent(code); } catch (e) { /* a broken escape: hand the raw text on */ }
  return code.trim() || null;
}
```

- [ ] **Step 3: Strings** (`strings.js`, both languages): `mpErrExpired` "five minutes" -> "ten minutes" / "fünf" -> "zehn Minuten".
  New keys: en `mpCopyLink: 'Copy invite link'`, `mpLinkCopied: 'Link copied'`, `mpAnswerUnused: 'The host never took your answer code. Ask for a fresh invite.'`;
  de `mpCopyLink: 'Einladungslink kopieren'`, `mpLinkCopied: 'Link kopiert'`, `mpAnswerUnused: 'Der Host hat Deinen Antwort-Code nicht übernommen. Lass Dir eine frische Einladung schicken.'`.
  Commit `feat(multiplayer): ten-minute codes and join-link helpers (#980)`.

### Task 3: wire the dialog (`index.html`)

- [ ] **Step 1: Markup and comments.** In `#mpoutbox`, after `#mpcopy`, add
  `<button id="mpcopylink" class="btn" type="button" data-i18n="mpCopyLink">Copy invite link</button>`. Change the
  "five minutes" comments (near the `mpoutbox` markup, `stopCodeClock`'s header, `netHostAccept`) to "ten minutes". Add
  `joinLinkFor, readJoinHash` to the `./netcodec.js` import.
- [ ] **Step 2: Host only.** `netHostCode()`, after `$('mpoutbox').hidden = false;`:
  `$('mpcopylink').hidden = false; $('mpcopylink').textContent = tr('mpCopyLink'); $('mpcopy').textContent = tr('mpCopy');`.
  `netGuestAnswer()`, after its `$('mpoutbox').hidden = false;`: `$('mpcopylink').hidden = true;`.
- [ ] **Step 3: Handler** after the `$('mpcopy').onclick` block:

```js
$('mpcopylink').onclick = () => {
  if (!navigator.clipboard) { netWarn(tr('copyFailed')); return; }
  const link = joinLinkFor(location.origin, location.pathname, $('mpcode').value);
  navigator.clipboard.writeText(link).then(() => { $('mpcopylink').textContent = tr('mpLinkCopied'); }, () => netWarn(tr('copyFailed')));
};
```

- [ ] **Step 4: Read the link at load**, as a second block right after the parked-join block (`MP_JOIN_KEY`):

```js
// #980: a `#join=<code>` link fills the guest screen; the fragment goes at once, nothing connects before the click
{
  const linked = readJoinHash(location.hash);
  if (location.hash.startsWith('#join=')) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* harmless */ } }
  if (linked && !REGION.generated) { openMp(); netGuestRole(); $('mpin').value = linked; $('mpmake').focus(); }
}
```

- [ ] **Step 5: Guest messages** in `netPeerState`: the first line becomes
  `if (state === 'timeout') { netTrouble(tr(NET.role === 'G' ? 'mpAnswerUnused' : 'mpIceFail')); return; }`; before the last
  line add `if (NET.role === 'G' && state === 'failed' && !NET.lobby) { netTrouble(tr('mpIceFail')); return; }`.
- [ ] **Step 6: Browser test.** Append to `tests/test_multiplayer_lobby.py` (`server` is the existing fixture):

```python
def test_join_link_prefills_the_guest_and_waits_for_the_click(pair, server):
    host, guest, errors = pair
    host.click("#mpbtn"); host.fill("#mpname", "Anna"); host.click("#mphostbtn")
    host.wait_for_function("() => document.querySelector('#mpcode').value.startsWith('R1H.')", timeout=T)
    code = host.input_value("#mpcode")
    host.evaluate("() => { navigator.clipboard.writeText = (t) => { window.__link = t; return Promise.resolve(); }; }")
    host.click("#mpcopylink")
    assert host.evaluate("() => window.__link").endswith("#join=" + code)
    guest.goto(f"{server}/index.html?netice=none#join={code}")
    guest.wait_for_function(READY, timeout=240000)
    assert guest.input_value("#mpin") == code and "#" not in guest.url and net(guest)["peers"] == []
    guest.click("#mpmake")
    guest.wait_for_function("() => document.querySelector('#mpcode').value.startsWith('R1G.')", timeout=T)
    assert not errors
```

- [ ] **Step 7: Run** the node tests, then the Playwright file (`python3 -m pytest tests/test_multiplayer_lobby.py -x`).
- [ ] **Step 8: CHANGELOG** `[Unreleased]` / `### Fixed`, player voice, dated like neighbours: Gast gibt nach 20 s nicht mehr auf, Codes gelten **zehn Minuten**, **Einladungslink** füllt den Code ein. Commit `fix(multiplayer): invite link and ten-minute codes (#980)`; push.

### Acceptance run (manual, after merge)

- [ ] Two real devices on one Wi-Fi (PC + Chromebook): wait 60 s before pasting the answer; the lobby opens.
