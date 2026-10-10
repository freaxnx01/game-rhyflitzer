# Windscreen and rear window stay glass (#225) — implementation plan

**Goal:** a Node regression test that fails if the compact loses its windscreen, rear window or door glass. No production change: the defect in the issue was the pre-#183 body and is already fixed on `main`.
**Spec:** `docs/superpowers/specs/2026-10-10-windscreen-glass-design.md`. **Files:** `prototype/tests/carbody.test.mjs` only. GLM-ready, no browser, no data.

## Global constraints

- Branch `test/225-windscreen-glass-guard`; PR title `test(vehicles): guard the windscreen and rear window glass (#225)`, body `Closes #225`.
- Do not change `prototype/carbody.js` or `prototype/index.html`. If the new test fails on `main`, STOP and report the printed counts: that would mean the spec's finding is wrong.
- Run only Node tests: `node --test prototype/tests/carbody.test.mjs`. No Playwright needed.

### Task 1: The guard test

**Files:** modify `prototype/tests/carbody.test.mjs` (append one test at the end of the file, after the `archRadius` test).

- [ ] **Step 1: write the test.** Append exactly:

```js
test('loftBody: glass on the windscreen, the rear window and the doors (#225)', () => {
  const L = loftBody(COMPACT), P = L.positions, found = { windscreen: 0, rear: 0, door: 0 };
  for (let t = 0; t < L.glassIndices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map(i => L.glassIndices[t + i]);
    const x = (P[3 * a] + P[3 * b] + P[3 * c]) / 3, z = Math.abs(P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3;
    if (z >= 0.62) found.door++; else if (x > 0) found.windscreen++; else if (x < -1.3) found.rear++;
  }
  assert.ok(found.windscreen > 0, `windscreen glass ${JSON.stringify(found)}`);
  assert.ok(found.rear > 0, `rear window glass ${JSON.stringify(found)}`);
  assert.ok(found.door > 0, `door glass ${JSON.stringify(found)}`);
});
```

- [ ] **Step 2: run, expect PASS on first run** (it is a guard for an already-fixed state; the 2026-10-10 probe found windscreen 4, rear 8, doors about 60 triangles):

```bash
node --test prototype/tests/carbody.test.mjs
```

- [ ] **Step 3: prove the guard bites.** Temporarily set `span: { top: false, side: false }` on the station with `x: 0.15` in `prototype/carbody.js`, rerun: the windscreen assertion must FAIL. Then `git checkout prototype/carbody.js` and rerun: PASS. `git diff --stat` must list only `prototype/tests/carbody.test.mjs`.

- [ ] **Step 4:** run the whole Node suite once: `node --test prototype/tests/*.test.mjs` (all pass). Commit, push, open the PR.
