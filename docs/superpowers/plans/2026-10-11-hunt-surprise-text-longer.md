# Surprise text longer (#218) — plan

Spec: `docs/superpowers/specs/2026-10-11-hunt-surprise-text-longer-design.md`. Anchors are identifiers; PR #281 and the #216/#105 runs touch `prototype/index.html`.

### Task 1: TOAST_S.surprise for the present toast (TDD)

Files: modify `prototype/index.html`, `prototype/tests/toast.test.mjs`, `prototype/tests/test_hunt.py`.

- [ ] Failing node test in `toast.test.mjs`:

```js
test('toast: the surprise-hunt present toast lasts at least 8 s', () => {
  const table = HTML.match(/const TOAST_S = \{([^}]*)\}/)[1];
  const surprise = Number(table.match(/surprise:\s*(\d+)/)?.[1]);
  assert.ok(surprise >= 8, `TOAST_S.surprise is ${surprise}`);
  assert.match(HTML, /toastHtml\(tr\('presentToast'[^;]*TOAST_S\.surprise\)/);
});
```

  Run `node --test prototype/tests/toast.test.mjs`: fails.
- [ ] Add `surprise: 10` to `const TOAST_S` (update its comment) and change the `toastHtml(tr('presentToast', ...), TOAST_S.event)` call in `function collectPresent` to `TOAST_S.surprise`. Node test passes.
- [ ] Playwright in `test_hunt.py` (reuse its `open_page`/`collect` helpers; `collect(page, k)` places the car on spot k): after collecting one present, `__mm.toast().left > 8`. Run only `python3 -m pytest prototype/tests/test_hunt.py -k surprise -x`.

### Task 2: CHANGELOG

- [ ] `[Unreleased]` / `### Changed` entry (add the heading if absent), Zurich timestamp at merge: "`<timestamp>` In the **surprise hunt** the text about what you just won stays on screen twice as long, so everyone can finish reading it."
- [ ] Verification: `node --test prototype/tests/*.test.mjs` + the one `test_hunt.py` selection.
