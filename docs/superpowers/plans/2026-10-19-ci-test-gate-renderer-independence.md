# CI test gate: region test without frame-bound clicks, brightness test that tells "no picture" from "dark" (#345) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the two tests #345 names stop failing for renderer reasons: the Ehrendingen region test passes on
SwiftShader, and the hideout brightness test no longer reads "this browser returns no WebGL picture" as "it is dark
outside".

**Architecture:** test-only. (A) `test_region.py` gets a `press()` helper that waits on DOM state with interval
polling and clicks through the DOM, used by `open_worlds` and the region test. (B) `test_hideout.py` gets a
WebGL readback probe and a pure `frame_verdict()`; the brightness test skips with the probe in the reason only
when the browser cannot read back a picture.

**Tech Stack:** Python 3.12, pytest, Playwright 1.63 (sync API), Pillow.

**Spec:** `docs/superpowers/specs/2026-10-19-ci-test-gate-renderer-independence-design.md`

## Global Constraints

- Touch only `prototype/tests/test_region.py` and `prototype/tests/test_hideout.py`. No game code, no
  `conftest.py`, `select_tests.py`, `test-map.json` or `.github/workflows/tests.yml` change. No CHANGELOG entry
  (test-only, the CHANGELOG is player-facing).
- Do not touch `gallery.js`, `test_gallery.py`, `test_smoke.py`, `test_holzbruecke.py`, `test_underpass.py`
  (parallel work on #348 / #353).
- Never change a test's assertions to make it pass; the region test keeps its URL assertions and its
  `wait_for_url(..., wait_until="commit", timeout=240000)`, the brightness test keeps `bo > 25` and `bi > 0.7 * bo`.
- If `conftest.py` on your base already registers a `render` marker (open PR#370), add `@pytest.mark.render` to
  the brightness test; otherwise register nothing.
- Browser runs in the foreground, one test id at a time, against the local SwiftShader browser:
  `env -u PW_CDP_ENDPOINT systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest <id> -v`.
  Exit 137 means the cap was hit: run fewer tests, never raise the cap.
- No IPs or hostnames of the homelab in code, docs, PR text or issue comments (runner labels like `gpu-odroid` are fine).
- Conventional Commits; PR title `test(ci): renderer-independent region and brightness tests (#345)`.

## Review Focus

- A button that is present but hidden (inside a `[hidden]` dialog) must not be clicked by `press()`: it waits and
  then times out, it does not click blind -- pinned by `test_press_waits_for_a_hidden_button` (Task 1).
- `press()` on a button that navigates (`#drivebtn`) must not raise "Execution context was destroyed" -- covered by
  the region test itself (Task 1, Step 4).
- An all-black frame from a browser that *can* read back WebGL is a real failure, not a skip -- pinned by
  `frame_verdict(0, ok) == "black"` (Task 2).
- A missing WebGL2 context in the probe (`blob: None`) counts as "cannot read back" -- pinned in Task 2's pure test.
- A frame with any non-black pixel never takes the skip path, whatever the probe says -- pinned in Task 2.

---

### Task 1: region tests click through the DOM

**Files:**
- Modify: `prototype/tests/test_region.py:26-50` (`open_worlds`, `test_choosing_ehrendingen_reloads_with_the_parameter_and_keeps_vehicle`), add `PRESS_STATE`, `press`, `test_press_waits_for_a_hidden_button`

**Interfaces:**
- Produces: `press(page, sel, timeout=240000) -> None`; `PRESS_STATE` (JS string: `sel => 'missing' | 'hidden' | 'disabled' | 'ready'`).

Measured cause (spec): on SwiftShader the page draws at 0.07-0.24 fps at 1280x720, and Playwright's click waits
for the element to be stable across animation frames: 17-27 s per click against the 30 s default.

- [ ] **Step 1: Confirm the failing test**

Run: `env -u PW_CDP_ENDPOINT systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest "prototype/tests/test_region.py::test_choosing_ehrendingen_reloads_with_the_parameter_and_keeps_vehicle" -v`
Expected: FAIL with `Page.click: Timeout 30000ms exceeded` on `#worldbtn` ("waiting for element to be visible,
enabled and stable"). It failed 2 of 2 local runs on 2026-10-19; one probe click needed 27 s, so a lucky pass is
possible -- if it passes, say so in the PR and go on.

- [ ] **Step 2: Write the test for the hidden case** (append to `prototype/tests/test_region.py`)

```python
def test_press_waits_for_a_hidden_button(server):
    """#345: press() clicks only what a player could click; a button inside the closed Worlds dialog times out."""
    with sync_playwright() as p:
        b, page = boot(p, server)
        assert page.evaluate(f"() => ({PRESS_STATE})('#drivebtn')") == "hidden"
        with pytest.raises(Exception, match="Timeout"):
            press(page, "#drivebtn", timeout=2000)
        assert page.evaluate("() => document.querySelector('#worlds').hidden") is True
        b.close()
```

- [ ] **Step 3: Run it, expect failure**

Run: `env -u PW_CDP_ENDPOINT systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest "prototype/tests/test_region.py::test_press_waits_for_a_hidden_button" -v`
Expected: FAIL with `NameError: name 'PRESS_STATE' is not defined`.

- [ ] **Step 4: Implement** -- replace `open_worlds` (lines 26-29) with the block below, and in
`test_choosing_ehrendingen_reloads_with_the_parameter_and_keeps_vehicle` replace the two `page.click` lines.

```python
PRESS_STATE = """sel => {
  const el = document.querySelector(sel); if (!el) return 'missing';
  const r = el.getBoundingClientRect();
  if (el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden' || !r.width || !r.height) return 'hidden';
  return el.disabled ? 'disabled' : 'ready';
}"""


def press(page, sel, timeout=240000):
    """#345: click like a player, without Playwright's frame-bound actionability wait. Under SwiftShader this page draws at
    0.07-0.24 fps, and waiting for 'stable' across animation frames took 17-27 s per click. Waits on DOM state (polled every
    250 ms, not per frame), then clicks from a timer so a click that navigates cannot break the evaluate."""
    page.wait_for_function(f"sel => ({PRESS_STATE})(sel) === 'ready'", arg=sel, polling=250, timeout=timeout)
    page.evaluate("sel => { setTimeout(() => document.querySelector(sel).click(), 0); }", sel)


def open_worlds(page):
    """#346: the region rows moved into the Worlds dialog behind the start screen's World button."""
    press(page, "#worldbtn")
    page.wait_for_function("() => !document.querySelector('#worlds').hidden", polling=250, timeout=30000)
```

```python
        open_worlds(page)
        press(page, "#region-ehrendingen")                    # #346: selecting is free, only DRIVE HERE reloads
        press(page, "#drivebtn")
        page.wait_for_url(lambda u: "region=ehrendingen" in u, wait_until="commit", timeout=240000)
        assert "region=ehrendingen" in page.url and "vehicle=delorean" in page.url
```

The two timer clicks run in order (one task queue), so the row is selected before DRIVE HERE.

- [ ] **Step 5: Run the three affected tests, one at a time**

Run each with the command from Step 1:
`test_region.py::test_press_waits_for_a_hidden_button`, `test_region.py::test_choosing_ehrendingen_reloads_with_the_parameter_and_keeps_vehicle`, `test_region.py::test_default_is_hochrhein_and_marked`
Expected: PASS each. Measured with DOM clicks: the reload commits after ~36 s.

- [ ] **Step 6: Commit**

```bash
git add prototype/tests/test_region.py
git commit -m "test(region): click the Worlds dialog through the DOM, not per animation frame (#345)"
```

### Task 2: brightness test tells "no picture" from "a dark picture"

**Files:**
- Modify: `prototype/tests/test_hideout.py:649-677` (`crop_brightness`, `test_the_opening_seen_from_inside_the_tunnel_is_as_bright_as_outside`), add `GL_PROBE`, `frame_verdict`, `test_frame_verdict_tells_no_readback_from_a_black_picture`

**Interfaces:**
- Produces: `crop_brightness(page) -> tuple[float, int]` (mean grey of the middle crop, brightest grey of the whole frame);
  `GL_PROBE` (async JS: `{read, blob, lost, renderer}`); `frame_verdict(max_grey: int, probe: dict) -> "picture" | "no-readback" | "black"`.

Fact (spec): on the `gpu-odroid` runner the outside reference frame is all black (`bo == 0.0`, runs 39307582180,
39313003234); on local SwiftShader the test passes. The cause on that runner was not measured, so the test now
measures it.

- [ ] **Step 1: Write the failing pure test** (add after `crop_brightness`)

```python
def test_frame_verdict_tells_no_readback_from_a_black_picture():
    """#345: an all-black frame is 'no-readback' only when this browser cannot return a WebGL picture at all."""
    ok = {"read": 255, "blob": 255, "lost": False, "renderer": "x"}
    assert frame_verdict(12, ok) == "picture"
    assert frame_verdict(12, {**ok, "blob": 0, "lost": True}) == "picture"
    assert frame_verdict(0, ok) == "black"
    assert frame_verdict(0, {**ok, "lost": True}) == "no-readback"
    assert frame_verdict(0, {**ok, "blob": 0}) == "no-readback"
    assert frame_verdict(0, {**ok, "read": 0}) == "no-readback"
    assert frame_verdict(0, {**ok, "blob": None}) == "no-readback"
```

- [ ] **Step 2: Run it, expect failure**

Run: `python3 -m pytest "prototype/tests/test_hideout.py::test_frame_verdict_tells_no_readback_from_a_black_picture" -v`
Expected: FAIL with `NameError: name 'frame_verdict' is not defined`.

- [ ] **Step 3: Implement** -- replace `crop_brightness` (lines 649-655) and add the probe and the verdict:

```python
def crop_brightness(page):
    """Mean grey of the frame's middle (the opening, looking out of the portal) and the brightest grey of the whole frame,
    from the game's own next-frame PNG."""
    import base64, io
    from PIL import Image, ImageStat
    url = page.evaluate("() => window.__mm.photoUrl()")
    img = Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("L"); w, h = img.size
    return ImageStat.Stat(img.crop((int(w * 0.42), int(h * 0.35), int(w * 0.58), int(h * 0.55)))).mean[0], img.getextrema()[1]


GL_PROBE = """async () => {
  const c = document.createElement('canvas'); c.width = c.height = 8;
  const gl = c.getContext('webgl2', { antialias: true });           // like the game's renderer
  const game = document.getElementById('gl').getContext('webgl2');
  const info = game && game.getExtension('WEBGL_debug_renderer_info');
  const out = { read: null, blob: null, lost: game ? game.isContextLost() : null,
                renderer: info ? game.getParameter(info.UNMASKED_RENDERER_WEBGL) : null };
  if (!gl) return out;
  gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); out.read = px[0];
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));    // the game's photo path (capturePhoto)
  if (!blob) return out;
  const bmp = await createImageBitmap(blob); const d = document.createElement('canvas'); d.width = d.height = 8;
  const g = d.getContext('2d'); g.drawImage(bmp, 0, 0); out.blob = g.getImageData(4, 4, 1, 1).data[0];
  return out;
}"""


def frame_verdict(max_grey, probe):
    """'picture' if the frame has any non-black pixel; 'no-readback' if it is all black and this browser cannot return a
    WebGL picture (game context lost, or the white control canvas does not come back white); otherwise 'black'."""
    if max_grey > 0:
        return "picture"
    if probe.get("lost") or probe.get("read") != 255 or probe.get("blob") != 255:
        return "no-readback"
    return "black"
```

- [ ] **Step 4: Run the pure test, expect PASS**

Run: `python3 -m pytest "prototype/tests/test_hideout.py::test_frame_verdict_tells_no_readback_from_a_black_picture" -v`
Expected: PASS.

- [ ] **Step 5: Use it in the brightness test** -- replace the body after `def shot(d):` ... down to the last
assertion (lines 670-677) so it reads:

```python
            page.wait_for_timeout(4000)
            return page.evaluate("() => window.__mm.cave()"), crop_brightness(page)
        inside, (bi, _) = shot(10)
        outside, (bo, bo_max) = shot(-15)
        probe = page.evaluate(GL_PROBE)
        br.close()
    assert errors == []
    assert inside["inside"] is True and outside["inside"] is False, (inside, outside)
    if frame_verdict(bo_max, probe) == "no-readback":
        pytest.skip(f"#345: this browser returns no WebGL picture, so brightness cannot be measured: {probe}")
    assert bo > 25, f"the outside reference is itself dark: {bo} ({probe})"
    assert bi > 0.7 * bo, f"the opening seen from 10 m inside is dark: {bi:.0f} vs outside {bo:.0f} ({probe})"
```

Keep the docstring; add one sentence: "An all-black frame from a browser that cannot read back WebGL skips (#345)."

- [ ] **Step 6: Run the brightness test on SwiftShader**

Run: `env -u PW_CDP_ENDPOINT systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest "prototype/tests/test_hideout.py::test_the_opening_seen_from_inside_the_tunnel_is_as_bright_as_outside" -v -rs`
Expected: PASS (not SKIPPED; ~2 min). A skip here means the probe is wrong on a browser that does read back -- fix
the probe, not the assertions.

- [ ] **Step 7: Commit**

```bash
git add prototype/tests/test_hideout.py
git commit -m "test(hideout): tell a browser without WebGL readback from a dark picture (#345)"
```

- [ ] **Step 8: In the PR description**, list the CI outcome of the brightness test per runner from the PR's own
`tests` run (`gh run view <id> --log | grep -E "opening_seen|#345"`): PASSED, SKIPPED with the probe, or FAILED with
the probe. A FAILED on `gpu-odroid` with `read: 255, blob: 255, lost: false` is a game bug on that GPU: say so, do
not change the test further.
