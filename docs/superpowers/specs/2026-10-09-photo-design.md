# Take a photo in the game (#113)

## Goal

Press **X** and the current 3D view is saved as a PNG download. Client-side only: no server, no upload, no external service.

## Design

- **Key: `X`.** Every other letter except `I L U X Y Z` is taken (F1 help `prototype/index.html:120-142`, keydown handler `:1202`). `e.code` is layout-independent, so `X` works on German keyboards too.
- **What is captured: the WebGL scene only, without HUD.** The HUD, toast, minimap and checkpoint plates are DOM elements over the `#gl` canvas (`:97-112`), so `canvas.toBlob` never includes them. That makes a clean "photo"; compositing the DOM would need a rasteriser (new dependency, forbidden by the stack overlay).
- **Capture method: render right before `toBlob`, no `preserveDrawingBuffer`.** The renderer is created without it (`:1045`), so the drawing buffer is cleared after compositing and a later `toBlob` returns a blank image. `preserveDrawingBuffer: true` would cost performance every frame for a rare action. Instead the keydown handler sets a flag, and `loop()` calls `canvas.toBlob(...)` right after `renderer.render(scene, camera)` (both the normal and the paused path, `:1527-1528`), in the same task while the buffer is still valid. The photo is exactly the frame on screen.
- **Save:** the `toBlob` callback creates an object URL, clicks a temporary `<a download="rhyflitzer-YYYYMMDD-HHMMSS.png">`, revokes the URL. Size is the canvas's pixel size.
- **Feedback:** key toast (`TOAST_S.key`, like the mute toast) "Photo saved" / "Foto gespeichert"; if `toBlob` yields `null`, "Photo failed" / "Foto fehlgeschlagen". A white flash is out of scope.
- **When:** works while driving, flying (F), in any camera (C, B look-back) and while paused (the paused loop still renders). Ignored on the start/result overlay, while the J/O search is open (its handler returns first, `:1202`) and on key repeat.
- **Pure module `prototype/photo.js`** (node-testable, like `pause.js`): `photoFileName(date)` and `canPhoto(overlayHidden, jumpOpen, repeat)`.

## Acceptance criteria

- [ ] Pressing X during a run downloads one PNG named `rhyflitzer-YYYYMMDD-HHMMSS.png` (local time), showing the 3D scene as rendered (not blank), without HUD.
- [ ] Works in all four cameras, with B held, while flying and while paused.
- [ ] X does nothing on the start/result screen, in the J/O search field, or on key repeat; holding X saves one photo.
- [ ] A "Photo saved" / "Foto gespeichert" toast confirms it; failure shows "Photo failed" / "Foto fehlgeschlagen".
- [ ] F1 help lists `X` with `de` and `en` text; the `strings.test.mjs` parity test passes.
- [ ] No server, upload, new dependency or `preserveDrawingBuffer`; no extra per-frame cost when no photo is pending.
- [ ] CHANGELOG `[Unreleased]` has a player-facing English entry.

## Assumptions

- **A1** [high] Key is `X`. Rejected: `L`, `I`, `U` (equally free, no better mnemonic); `P` is pause (`pause.js`), `C` camera. Free set computed from the help list and `keys.*` uses in `index.html`.
- **A2** [med] Photo excludes the HUD. Rejected: compositing the DOM into the image (needs a rasteriser library; the stack overlay forbids new deps).
- **A3** [high] Render-then-`toBlob` in `loop()` instead of `preserveDrawingBuffer` (`index.html:1045`, `:1527`).
- **A4** [med] Allowed while paused (the paused loop still renders, `:1527`).
- **A5** [high] PNG at canvas pixel size, filename by local timestamp, plain download.

## Consequences

- A photo does not show speed, map or checkpoint info; players who want those use a screenshot tool.
- Browsers may ask once for permission to download multiple files.
