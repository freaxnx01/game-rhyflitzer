// #197: what the region editor tells Umami (self-hosted, stats.freaxnx01.ch). Never breaks the page: blocked, offline or missing umami = silent no-op.
// Coarse by design: Gemeinde names, the frame centre rounded to 0.05 degrees, the frame size. Never the LV95 frame, the world id or anything typed.
import { centre, lv95ToWgs, sizeKm } from './geo.js';

export const MAX_NAMES = 4, MAX_TEXT = 200, CELL_DEG = 0.05, SETTLE_MS = 3000, MAX_FRAMES = 10;

const cellOf = (v) => Math.round(Math.round(v / CELL_DEG) * CELL_DEG * 100) / 100;
const cleanNames = (names) => (Array.isArray(names) ? names : []).filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim());

export function frameData(rect, gemeinden) {
  const [lat, lon] = lv95ToWgs(...centre(rect)), { w, h } = sizeKm(rect);
  return { gemeinden: cleanNames(gemeinden).slice(0, MAX_NAMES).join(', ').slice(0, MAX_TEXT), lat: cellOf(lat), lon: cellOf(lon), w_km: w, h_km: h };
}

export function track(name, data) {
  try { const u = globalThis.umami; if (u && typeof u.track === 'function') u.track(name, data); } catch (e) { /* analytics must never break the editor */ }
}

// The editor rewrites ?bbox= (the exact frame) on every commit, so the one pageview carries the path only; auto-tracking is off in index.html.
export function trackPageview() {
  try { const u = globalThis.umami; if (u && typeof u.track === 'function') u.track((props) => ({ ...props, url: globalThis.location.pathname })); } catch (e) { /* see above */ }
}

export function createPreviewReporter({ send = track, delayMs = SETTLE_MS, max = MAX_FRAMES, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const seen = new Set(); let timer = 0;
  const cancel = () => { clearTimer(timer); timer = 0; };
  function frame(data) {
    cancel();
    timer = setTimer(() => {
      timer = 0;
      if (!data.gemeinden || seen.has(data.gemeinden) || seen.size >= max) return;
      seen.add(data.gemeinden); send('editor-frame', data);
    }, delayMs);
  }
  return { frame, cancel };
}