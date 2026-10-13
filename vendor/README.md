# Vendored libraries

| Library | Version | Licence | Used by | Notes |
|---|---|---|---|---|
| [Leaflet](https://leafletjs.com) | 1.9.4 | BSD-2-Clause (`leaflet/LICENSE`) | `editor/` | `dist/leaflet.js` + `dist/leaflet.css` only; no marker images (unused). Update by re-downloading from unpkg and checking the sha256 in the #169 plan. |
| [ALTCHA widget](https://altcha.org) (`altcha` on npm) | 3.3.0 | MIT (`altcha/LICENSE`) | `editor/human.js` | `dist/main/altcha.min.js` only (styles and PBKDF2/SHA workers inline, no i18n bundle: the page shows its own de/en text). Proof-of-work human check for #168's `POST /api/jobs`; self-hosted, no cookies, no third party. Must match #168's server library (`altcha` on PyPI, PoW v2). Update by re-downloading from unpkg and checking the sha256 in the #169 plan. |
