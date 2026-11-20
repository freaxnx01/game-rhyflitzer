// netmarks.js (#1113): pure helpers for the other players' markers on the map. No DOM, no three.js: node --test only.

// one mark per other player who drives (has a car), is not fading out, has a pose and a set visible flag.
// poseOf(entry) -> { x, z, ry, flags } | null; colorOf(paintId) -> css colour; visibleBit = FLAG.visible
export function netMapMarks(entries, poseOf, colorOf, visibleBit) {
  const marks = [];
  for (const [id, entry] of entries) {
    if (!entry.car || entry.leaving != null) continue;
    const pose = poseOf(entry);
    if (!pose || !(pose.flags & visibleBit)) continue;
    marks.push({ id, x: pose.x, z: pose.z, th: -pose.ry, color: colorOf(entry.paint), name: entry.name ?? '' });
  }
  return marks;
}

// the name is drawn on the full (Tab) map only
export const netMarkLabel = (mark, full) => (full && mark.name ? mark.name : null);