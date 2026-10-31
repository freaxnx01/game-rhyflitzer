// lights.js — the car lights switch (#270) and the shared lamp state for #271 (hazard) and #230 (brake lights).
// Pure: no DOM, no three.js, so node --test can import it. index.html keeps the glue.
//
// lampState({ head, hazard, blinker, braking, flashOn }) -> { headLevel, tailLevel, left, right }
//   headLevel:  LAMP.head.on if head, else LAMP.head.off
//   tailLevel:  braking -> LAMP.tail.brake; else head -> LAMP.tail.rear; else LAMP.tail.off
//   left/right: hazard -> both = flashOn; else the side equal to blinker = flashOn. Hazard wins over Q/E.

export const LAMP = { head: { off: 0.35, on: 2.0 }, tail: { off: 0.45, rear: 1.0, brake: 2.4 } };

export function lampState({ head = false, hazard = false, blinker = null, braking = false, flashOn = false } = {}) {
  const headLevel = head ? LAMP.head.on : LAMP.head.off;
  const tailLevel = braking ? LAMP.tail.brake : head ? LAMP.tail.rear : LAMP.tail.off;
  const left = hazard ? flashOn : blinker === 'left' && flashOn;
  const right = hazard ? flashOn : blinker === 'right' && flashOn;
  return { headLevel, tailLevel, left, right };
}
