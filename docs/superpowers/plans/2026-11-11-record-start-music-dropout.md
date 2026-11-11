# Music dropout at recording start — Implementation Plan (#891)

**Goal:** starting a recording with `§` no longer starts the platform AAC encoder. `pickRecordFormat` prefers
H.264 + Opus in MP4, and the music keeps playing through the start.

**Architecture:** a data change in `record.js` only. `FORMATS` gets `video/mp4;codecs=avc1,opus` at the front,
and AAC drops to second place. `startRecord` (`index.html:6842`) already uses whatever `pickRecordFormat` returns,
so `index.html` is not touched. Spec: `docs/superpowers/specs/2026-11-11-record-start-music-dropout-design.md`. It
has the measurements: there is no gap in the graph or the file on the Opus path, cold or warm, so the AAC branch
is the remaining cause.

**Global constraints:** buildless, no new files. Node unit tests run with `node --test tests/record.test.mjs`.
Playwright runs only `tests/test_record.py`, in the foreground, under
`systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. Do not change the tap (`SFX.recordTap`),
the recorder options or the state machine. Line numbers are from `3b99c02`; grep for the code, don't rely on them.

---

### Task 1: prefer Opus in MP4 (record.js)

**Files:** `record.js`, `tests/record.test.mjs`

- [ ] **Step 1: Write the failing test.** Append it to `tests/record.test.mjs`; the imports are already there:

```js
test('pickRecordFormat: H.264 + Opus in mp4 before AAC -- the AAC encoder start drops the music (#891)', () => {
  assert.equal(FORMATS[0], 'video/mp4;codecs=avc1,opus');
  assert.ok(FORMATS.indexOf('video/mp4;codecs=avc1,opus') < FORMATS.indexOf('video/mp4;codecs=avc1,mp4a.40.2'));
  const chrome = new Set(['video/mp4;codecs=avc1,opus', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus']);
  assert.deepEqual(pickRecordFormat(m => chrome.has(m)), { mime: 'video/mp4;codecs=avc1,opus', ext: 'mp4' });
  const noOpusInMp4 = new Set(['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4']);
  assert.deepEqual(pickRecordFormat(m => noOpusInMp4.has(m)), { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' });
});
```

- [ ] **Step 2: Run** `node --test tests/record.test.mjs`. Expected: FAIL, because `FORMATS[0]` is still the AAC mime.

- [ ] **Step 3: Implement.** In `record.js`, replace the `FORMATS` constant and its comment:

```js
// A2: mp4/H.264 preferred (YouTube), else webm vp9/opus -- the first the browser supports wins.
// #891: Opus before AAC in mp4 -- starting Chrome's platform AAC encoder (Media Foundation on Windows) drops the
// music for a moment, live and in the file; Opus is encoded in the page and measured gap-free
export const FORMATS = ['video/mp4;codecs=avc1,opus', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4',
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
```

- [ ] **Step 4: Run** `node --test tests/record.test.mjs`. Expected: PASS, including the existing
  `pickRecordFormat: mp4 before webm` test (`FORMATS[0]` is still an mp4, and the webm fallback is unchanged).

- [ ] **Step 5: Commit** `fix(record): prefer H.264 + Opus in mp4 so the recording start keeps the music (#891)`

### Task 2: browser check and changelog

**Files:** `CHANGELOG.md`

- [ ] **Step 1: Run** the existing recording tests in the foreground:
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_record.py -x -q`.
  Expected: both tests pass. The recorder starts, the download has a valid name, and the audio stays live on
  the second recording.

- [ ] **Step 2: Changelog.** Under `## [Unreleased]` → `### Fixed`, add a line at the top in the existing style,
  in the player's voice, with the date and time it goes live (Europe/Zurich):

```markdown
- `YYYY-MM-DD hh:mm` Starting a **video recording** with <kbd>§</kbd> no longer makes the **music** drop out for a moment, neither in the game nor in the video.
```

- [ ] **Step 3: Commit** `docs(changelog): music keeps playing when a recording starts (#891)`

- [ ] **Step 4: PR note.** The PR body must say that the fix still needs a manual check on **Chrome or Edge for
  Windows**. Record with `§` while music plays, listen, then run
  `ffmpeg -i <file>.mp4 -vn -af silencedetect=n=-50dB:d=0.02 -f null -` on the download. The output must show no
  `silence_start` while music plays. Only a person can do this check; the pipeline has no Windows browser.
