// touch.js (#535 phase 2): the phone controls. STICK / stickVector are pure (node --test imports this file);
// bindStick only runs when index.html calls it.
export const STICK = { radius: 56, dead: 0.15 };
export const TOUCH_LOOK = 2;   // a finger drag turns the walker TOUCH_LOOK times as far as the same mouse movement

// a finger offset from the base's centre, in px, becomes { x right, y forward (screen up) }, each in [-1, 1]:
// zero inside the dead zone, analog in between, clamped to the unit circle past the rim
export function stickVector(dx, dy, cfg = STICK) {
  const m = Math.hypot(dx, dy) / cfg.radius;
  if (m < cfg.dead) return { x: 0, y: 0 };
  const k = Math.min(1, m) / m / cfg.radius;
  return { x: dx * k, y: -dy * k };
}

// the joystick: one pointer at a time, captured, so steering survives the finger leaving the base; onMove({ x, y }) on every change
export function bindStick(base, knob, onMove) {
  let id = null;
  const set = (e) => {
    const r = base.getBoundingClientRect(), v = stickVector(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    knob.style.transform = `translate(${v.x * STICK.radius}px, ${-v.y * STICK.radius}px)`; onMove(v);
  };
  const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; onMove({ x: 0, y: 0 }); };
  base.addEventListener('pointerdown', (e) => { if (id !== null) return; e.preventDefault(); id = e.pointerId; base.setPointerCapture?.(id); set(e); });
  base.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
  base.addEventListener('pointerup', end); base.addEventListener('pointercancel', end);
}
