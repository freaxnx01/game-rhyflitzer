// scanner.js — the Rhy Knight's red scanner light in the nose: a light that sweeps across a row of lens segments and back, its
// tail fading behind it. Pure module: no DOM, no three.js, so node --test can import it. index.html sets each segment material's
// emissiveIntensity from scannerGlow(scannerLevels(t, n)[i]); the segments are the Scan0 .. ScanN materials of the model
// (tools/prepare-knight.mjs, extras.scan = the segment index, left to right).
export const SCAN = {
  period: 1.6,   // s for one sweep out and back
  tail: 2.5,     // segments behind the head that still glow, fading
  lead: 0.6,     // ahead of the head the light falls off almost at once
  dim: 0.15, bright: 3,   // emissiveIntensity of a dark and of a full segment
};

// where the light is at time t s: at = a segment position 0 .. n-1 (fractional), dir = +1 sweeping right, -1 sweeping back
export function scannerHead(t, n) {
  const phase = ((t / SCAN.period) % 1 + 1) % 1, out = phase < 0.5;
  return { at: (out ? phase * 2 : 2 - phase * 2) * (n - 1), dir: out ? 1 : -1 };
}

// each segment's brightness 0 .. 1 at time t s
export function scannerLevels(t, n) {
  const { at, dir } = scannerHead(t, n);
  return Array.from({ length: n }, (_, i) => {
    const ahead = (i - at) * dir;
    return Math.max(0, 1 - (ahead > 0 ? ahead / SCAN.lead : -ahead / SCAN.tail));
  });
}

export function scannerGlow(level) { return SCAN.dim + level * (SCAN.bright - SCAN.dim); }
