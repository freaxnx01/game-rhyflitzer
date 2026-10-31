// blitz.js — Blitz mode rules (#128): a countdown that every checkpoint tops up, a rank letter at the finish.
// Pure: no DOM, no three.js, so node --test can import it. index.html keeps the glue.

export const BLITZ = { start: 90, bonus: 60, low: 10 };   // seconds: on the clock at the start, per checkpoint, "red" threshold

const RANKS = [[90, 'S'], [60, 'A'], [30, 'B']];

export function tick(left, dt) { return Math.max(0, left - dt); }
export function addBonus(left) { return left + BLITZ.bonus; }
export function isTimeUp(left) { return left <= 0; }
export function rankFor(left) { for (const [min, rank] of RANKS) if (left >= min) return rank; return 'C'; }
export function isNewBest(best, left) { return best === null || left > best; }
