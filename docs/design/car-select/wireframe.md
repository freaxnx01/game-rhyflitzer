# Car selection — wireframe

**Visual reference:** [`design/mockups/CarSelect.dc.html`](../../../design/mockups/CarSelect.dc.html) — the full mockup at 1920×1080, rendered in a dc-tool bundle.

## Layout

- **Header**: title in Bungee (skewed, large, yellow with shadow), mode subtitle "Time trial · Hochrhein" in Barlow Condensed
- **Main area** (two columns):
  - **Left:** the turntable stage (see-through cut-out of the real scene), ‹ › arrow buttons at the sides, car counter `Car i of n` top-left, rotate hint bottom-center
  - **Right:** info panel with vehicle name/class/description, four stat bars (10-cell grid, score number), paint label + current name, eleven colour swatches in two rows, garage tiles grid
- **Footer**: ‹ Back button (left), Race! › button (right)
- **Phone width (360 px):** single column layout, stage full-width, no horizontal scroll

## Dropped elements (v0 scope)

These are shown in the mockup but not implemented:
- Step tabs (top: 1 · Race ✓ / 2 · Car / 3 · Go!) — no staging steps in v0
- "Fan favourite" badge on the stage — no opponent recommendation
- "Garage · 6 of 9 unlocked" text and unlock progress — no unlock system yet (#48)
- "Next unlock: win all Sisslerfeld races…" — no unlock system
- "Opponents: Trompeter Tom · Fridolin · Rhy Rita" above the Race! button — opponents are a future feature
- Painted stage backdrop — renders the real scene cut-out instead

## Design tokens

All colours, borders, fonts, and spacing from the mockup; implemented via CSS and semantic HTML.

**Key hex values from the mockup:**
- Background: `#1c1f26` (dark)
- Borders: `#4a515e` (medium-dark), `#8d96a3` (medium), `#23272f` (darker)
- Text: `#f5efe0` (cream), `#b9bfc9` (muted), `#14171d` (darkest)
- Accent (selected/lit): `#ffc61a` (yellow), `#ff9a1a` (orange highlight), `#ff7a1a` (orange)

**Paint swatches** (from Assumptions A5):
- Navy `#1b2d5e` (default, today's factory colour, first swatch)
- Sunflower `#ffc61a`
- Signal orange `#ff7a1a`
- Swiss red `#e0322d`
- Rhine blue `#2f6a96`
- Ice `#7fd1ff`
- Meadow `#5f8a4c`
- Cream `#f5efe0`
- Charcoal `#2a2e38`
- Plum `#7b3fa0` (from #25)
- Flamingo `#ff6fa8` (from #25)

**Typography:**
- Title: Bungee, 62 px, skewed -8°, yellow with shadow
- Headings / labels: Barlow Condensed 700–800, letter-spacing
- Body: Barlow Condensed 500–600

**Responsive:**
- Desktop: 1920 × 1080, two-column
- Phone: 360 px width, single column, turntable spans full width
