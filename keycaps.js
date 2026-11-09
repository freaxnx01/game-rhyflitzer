// keycaps.js (#700): a key bar / tutorial cap token as <kbd> key graphics, so "WASD" reads as four keys, not a word.
// Pure: no DOM, no three.js (node --test imports it). The labels are escaped: a cap is data from controls.js.
import { esc } from './escape.js';

// a cluster is drawn as its four keys, in keyboard order: the top key first, then the row below it from left to right
const CLUSTERS = { WASD: ['W', 'A', 'S', 'D'], Arrows: ['↑', '←', '↓', '→'] };

const kbd = (label) => `<kbd>${esc(label)}</kbd>`;

export function capKeys(cap) {
  return CLUSTERS[cap] ?? [cap];
}

export function capsRow(cap) {
  return `<span class="caps">${capKeys(cap).map(kbd).join('')}</span>`;
}

// the cluster as it sits on the keyboard: the first key on top in the middle column, the other three below (CSS: .caps.cross)
export function capsCross(cap) {
  const keys = capKeys(cap);
  if (keys.length !== 4) return capsRow(cap);
  return `<span class="caps cross">${keys.map(kbd).join('')}</span>`;
}