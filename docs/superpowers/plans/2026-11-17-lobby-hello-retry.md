# Lobby hello retry Implementation Plan

> **For agentic workers:** implement task by task; push after each task.

**Goal:** a guest whose first `hello` is lost still joins the lobby.

**Architecture:** the guest repeats `hello` every second until `lobby`/`deny`; the host answers a repeated `hello` from an admitted peer with that peer's `lobby`.

**Tech Stack:** vanilla JS in `index.html`, Playwright (Python) in `tests/test_multiplayer_lobby.py`.

**Spec:** `docs/superpowers/specs/2026-11-17-lobby-hello-retry-design.md`

## Global Constraints

- Do not raise any timeout (`T`, `CONNECT_MS`, `GATHER_MS`).
- No new message type; `parseMessage` in `netcodec.js` stays unchanged.
- Run Playwright in the foreground; only `tests/test_multiplayer_lobby.py`.

## Review Focus

- A guest that is denied (`deny`) must stop repeating `hello`.
- Leaving (`netLeave`) while the timer runs must stop it (no `send` on a closed link).
- The host must not add the guest twice or rename it on a repeated `hello`.

---

### Task 1: Failing test — the first hello is lost

**Files:**
- Modify: `tests/test_multiplayer_lobby.py` (`open_page` gets an optional `init` script; new test)

- [ ] **Step 1: let `open_page` take an init script**

```python
def open_page(browser, server, init=None):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="en-US")
    if init:
        ctx.add_init_script(init)
    page = ctx.new_page()
```
(the rest of `open_page` stays as it is)

- [ ] **Step 2: write the test**

```python
DROP_FIRST_HELLO = """(() => {
  const send = RTCDataChannel.prototype.send;
  let dropped = false;
  RTCDataChannel.prototype.send = function (data) {
    if (!dropped && typeof data === 'string' && data.startsWith('{"type":"hello"')) { dropped = true; return; }
    return send.call(this, data);
  };
})();"""


def test_lost_first_hello_still_joins(server):
    """#1019: one lost hello must not strand the guest -- it repeats the hello until the lobby comes."""
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        host, host_errors = open_page(browser, server)
        guest, guest_errors = open_page(browser, server, init=DROP_FIRST_HELLO)
        connect(host, guest)
        assert names(host) == ["Anna", "Ben"]
        assert names(guest) == ["Anna", "Ben"]
        assert host_errors + guest_errors == []
        browser.close()
```

- [ ] **Step 3: run it, it fails** (timeout in `connect`, the guest never gets a lobby)

Run: `python3 -m pytest -q tests/test_multiplayer_lobby.py -k lost_first_hello`

- [ ] **Step 4: commit and push**

```bash
git add tests/test_multiplayer_lobby.py
git commit -m "test(multiplayer): a lost first hello strands the guest (#1019)"
git push
```

### Task 2: Guest repeats hello, host re-sends the lobby

**Files:**
- Modify: `index.html` (`netPeerState`, `netGuestMessage`, `netHostHello`, `netLeave`, the `POSE_MS, PING_MS` constant line)

- [ ] **Step 1: the constant** — next to `const POSE_MS = 50, PING_MS = 2000;` add `HELLO_MS = 1000`:

```js
const POSE_MS = 50, PING_MS = 2000, HELLO_MS = 1000;   // #1019: the guest repeats its hello until the lobby comes
```

- [ ] **Step 2: guest sends and repeats** — in `netPeerState`, replace the inline hello send with `netHello()` plus the timer, and add the helpers above `netPeerState`:

```js
// #1019: the hello is repeated until the host's lobby (or a deny) comes back -- one lost message must not strand the guest
function netHello() { NET.link.send(HOST_ID, { type: 'hello', name: NET.name, custom: NET.nameCustom }); }
function stopHello() { clearInterval(NET.helloTimer); NET.helloTimer = null; }
```

```js
  if (state === 'open') { if (NET.role === 'G') { netHello(); stopHello(); NET.helloTimer = setInterval(netHello, HELLO_MS); netPing(); NET.pingTimer = setInterval(netPing, PING_MS); } return; }
```

- [ ] **Step 3: stop on lobby and deny** — in `netGuestMessage`:

```js
  if (msg.type === 'lobby') { stopHello(); NET.lobby = msg; NET.you = msg.you; if (NET.session) syncNetCars(); openLobby(); return; }
```
and at the start of the `deny` branch call `stopHello();`.

- [ ] **Step 4: stop on leave** — first line of `netLeave()`: `stopHello();`. Add `helloTimer: null,` to the `NET` object next to `pingTimer`.

- [ ] **Step 5: host answers a repeat** — in `netHostHello` replace the first line:

```js
  if (NET.slots.has(peerId)) { NET.link.send(peerId, lobbyMessage(NET.lobby, NET.slots.get(peerId))); return; }   // #1019: a repeated hello gets the lobby again (the first answer may be lost)
```

- [ ] **Step 6: run the tests**

Run: `node --test tests/*.test.mjs` (all pass) and `python3 -m pytest -q tests/test_multiplayer_lobby.py` (all pass, incl. the new test).

- [ ] **Step 7: CHANGELOG** — under `[Unreleased]` / `### Fixed`:
`- \`<YYYY-MM-DD HH:MM>\` Mehrspieler: Geht die erste Anmeldung eines Gastes unterwegs verloren, versucht er es jede Sekunde erneut, statt ewig auf die Lobby zu warten.`

- [ ] **Step 8: commit and push**

```bash
git add index.html CHANGELOG.md
git commit -m "fix(multiplayer): the guest repeats its hello until the lobby arrives (#1019)"
git push
```
