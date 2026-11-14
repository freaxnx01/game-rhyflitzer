# Multiplayer: funny default player names (#979)

Assumes #980 has landed (join link and `readJoinHash` exist, the join-link load block calls `openMp()` then `netGuestRole()`).

## Goal

Nobody has to type a name to race with friends. The connect dialog opens with a random funny name already in the field;
a typed name wins and is remembered; a generated name that collides with a name in the lobby is replaced by the host.

## Today

- The dialog refuses an empty name: `netTakeName` shows `mpNeedName` and returns null (`index.html:6167-6172`); callers
  `netHostStart` (`:6176`) and `netGuestAnswer` (`:6212`) stop on null. `openMp` fills the field from `localStorage['mm.mpName']` only (`:6156`).
- Names are cleaned by `cleanName` (1..`NAME_MAX` = 24 chars, `netcodec.js:166`); the `hello` validator keeps only `type` and `name` (`netcodec.js:179`) and is pinned by `tests/netcodec.test.mjs:41`.
- The host adds a guest with `admitHello(lobby, name, running)` (`netrace.js:19`); duplicate names are accepted today (`netHostHello`, `index.html:6257`).
- Tschau Sepp: `NAME_POOL`, `funnyName`, `uniqueFunnyName` (`game-tschau-sepp/index.html:518,545-556`) and a `custom` flag in `hello` (`:1744`): a collision renames only a non-custom name.

## Decisions

| Topic | Decision |
|---|---|
| Pool | 14 names per language, 14-17 characters, car themes (Turbo-Toni, Schlagloch-Sämi / Pothole Paul, Handbrake Hank). Stored in `strings.js` as one pipe-separated string `mpFunnyNames` (en and de), so the strings test covers both languages; split by the pure module `netnames.js`. |
| Prefill | `openMp` fills the field with the stored name, else a random funny name, and remembers which one it generated (`NET.autoName`). The field stays editable. |
| Custom or not | At `netTakeName`: a non-empty field that differs from `NET.autoName` is custom and stored in `localStorage`; an empty field or the untouched generated name is automatic and not stored (a new one each visit). Whitespace-only input counts as empty. `mpNeedName` is removed. |
| Protocol | `hello` carries `custom: boolean`. The validator emits `custom: m.custom === true`, so a hello without the field is automatic. Same game version only (the code version already gates this), no `CODE_VERSION` bump. |
| Collision | `admitHello` gets a fourth argument `{ custom = true, pool = [], rnd }`. On a case-insensitive clash with a name in the lobby and `custom === false` it picks `uniqueFunnyName(pool, taken, rnd)` (a free pool name, else a pool name with ` 2`, ` 3` ...). A custom name is kept, even as a duplicate (as in Tschau Sepp). The host's pool is its own language. |
| Feedback | The guest learns its final name from the lobby message it already gets; nothing else to send. |
| Host name | The host's own name goes through the same prefill and rule; the host has no collision to resolve. |

## Out of scope

- No re-roll (dice) button, no name editing inside the lobby, no profanity filter beyond the fixed pool.
- Single-player and the tutorial are untouched.
