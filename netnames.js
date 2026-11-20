// netnames.js — #979: funny default names for the multiplayer dialog. Pure module; the pool text lives in strings.js.
import { NAME_MAX } from './netcodec.js';

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const isTaken = (taken, name) => taken.some((t) => same(t, name));

export const parsePool = (text) => String(text).split('|').map((n) => n.trim()).filter(Boolean);
export const funnyName = (pool, rnd = Math.random) => pool[Math.floor(rnd() * pool.length)];

// uniqueFunnyName(pool, taken, rnd) — a pool name nobody has; with the pool used up, one with " 2", " 3" ... appended
export function uniqueFunnyName(pool, taken, rnd = Math.random) {
  const free = pool.filter((n) => !isTaken(taken, n));
  if (free.length) return funnyName(free, rnd);
  const base = funnyName(pool, rnd);
  let n = 2;
  while (isTaken(taken, `${base} ${n}`)) n++;
  return `${base} ${n}`.slice(0, NAME_MAX);
}

// rerollName(pool, current, rnd) — a pool name other than the one in the field, when the pool has another
export function rerollName(pool, current, rnd = Math.random) {
  const others = pool.filter((n) => n.trim().toLowerCase() !== String(current).trim().toLowerCase());
  return funnyName(others.length ? others : pool, rnd);
}