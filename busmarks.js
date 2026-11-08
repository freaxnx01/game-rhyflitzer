// busmarks.js (#711): pure helpers for the Postauto markers on the map. No DOM, no three.js: node --test only.

// one mark per bus still on the road; poseOf(bus) -> { x, z, th } (index.html passes busPose on the bus's route)
export function busMarks(buses, poseOf) {
  const marks = [];
  for (const b of buses) {
    if (b.phase === 'done') continue;
    const p = poseOf(b);
    marks.push({ key: b.key, line: String(b.trip.line), x: p.x, z: p.z, th: p.th });
  }
  return marks;
}

// the line number is drawn on the full map only
export const markLabel = (mark, full) => (full ? mark.line : null);

// canvas px inside the canvas, or at most `pad` px outside it (the arrow's reach)
export const onCanvas = (px, py, w, h, pad = 14) => px >= -pad && py >= -pad && px <= w + pad && py <= h + pad;
