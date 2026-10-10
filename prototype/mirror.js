// #92: rear-view mirror -- pure decisions, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
export const MIRROR = { w: 256, h: 80, fov: 36, near: 0.5, far: 4200, every: 2, widthFrac: 0.22, minW: 220, maxW: 420, top: 12, border: 4, gap: 6, drop: 0.1, underMargin: 0.05 };

// s: { view: CAM_VIEWS[..].k, back: B held, flying: FLY.on, overlay: start/result screen open, fullMap: Tab held, touch: pointer:coarse, carsel: car selection open (#7) }
export function mirrorVisible(s) {
  if (s.view !== 'cockpit') return false;
  return !(s.back || s.flying || s.overlay || s.fullMap || s.touch || s.carsel);
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

// how far the top-centre HUD column (#tc, normally MIRROR.top px from the top) moves down so it starts under the mirror frame
export function mirrorHudDrop(rect) {
  return rect.y + rect.h + MIRROR.border + MIRROR.gap - MIRROR.top;
}

// the mirror camera height: drop above the cockpit eye -- but when the main camera is under water (#101) the scene has the
// underwater look, so the mirror camera must stay under the surface too
export function mirrorEyeY(eyeY, waterLevel, under) {
  const y = eyeY + MIRROR.drop;
  return under && waterLevel !== null ? Math.min(y, waterLevel - MIRROR.underMargin) : y;
}
