// loading.js — the stages of the loading screen while the world is built, in the order index.html reaches them. Pure module: no
// DOM, so node --test can import it. Each stage has a (slightly tongue-in-cheek) line in strings.js under load_<stage>; index.html
// shows it with a progress bar and yields a frame so the browser can draw it before the next chunk of synchronous building.
export const LOAD_STAGES = ['map', 'terrain', 'ground', 'roads', 'markings', 'bridges', 'houses', 'props', 'trees', 'signs', 'river', 'cars', 'paint'];
// each stage's share of the bar, roughly its measured time on the Hochrhein world (SwiftShader, 2026-11-03: 33 s in all, ground and
// markings about 7 s each, the river 3 s)
const LOAD_WEIGHTS = { map: 2, terrain: 11, ground: 21, roads: 7, markings: 21, bridges: 3, houses: 1, props: 3, trees: 5, signs: 1, river: 10, cars: 5, paint: 3 };
const LOAD_TOTAL = LOAD_STAGES.reduce((sum, s) => sum + LOAD_WEIGHTS[s], 0);

// step counts from 1; fraction is the share of the bar already done when the stage begins
export function loadProgress(stage) {
  const i = LOAD_STAGES.indexOf(stage);
  if (i < 0) throw new Error(`unknown load stage ${stage}`);
  const before = LOAD_STAGES.slice(0, i).reduce((sum, s) => sum + LOAD_WEIGHTS[s], 0);
  return { step: i + 1, of: LOAD_STAGES.length, fraction: before / LOAD_TOTAL };
}

// numbers follow the OS region, not the UI language; German without a region counts the Swiss way
export function numberLocale(lang, navLang) {
  if (navLang && navLang.includes('-')) return navLang;
  return lang === 'de' ? 'de-CH' : navLang || 'en';
}
