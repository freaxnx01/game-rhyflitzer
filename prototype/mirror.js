// #92: rear-view mirror -- pure decisions, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
export const MIRROR = { w: 256, h: 80, fov: 36, near: 0.5, far: 4200, every: 2, widthFrac: 0.22, minW: 220, maxW: 420, top: 12, border: 4, drop: 0.1 };

// s: { view: CAM_VIEWS[..].k, back: B held, flying: FLY.on, overlay: start/result screen open, fullMap: Tab held, touch: pointer:coarse }
export function mirrorVisible(s) {
  if (s.view !== 'cockpit') return false;
  return !(s.back || s.flying || s.overlay || s.fullMap || s.touch);
}

// the inset in CSS pixels, y measured from the top edge of the canvas
export function mirrorRect(screenW) {
  const w = Math.min(MIRROR.maxW, Math.max(MIRROR.minW, Math.round(screenW * MIRROR.widthFrac)));
  return { x: (screenW - w) / 2, y: MIRROR.top, w, h: w * MIRROR.h / MIRROR.w };
}

// the target is re-rendered every second frame -- and at once on the first frame it is visible, so the glass is never stale
export function mirrorDue(frame, wasVisible) {
  return !wasVisible || frame % MIRROR.every === 0;
}
