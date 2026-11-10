// #822: where a sign pole may end so it never shows above, beside the tip of, or in front of its panel -- pure.
export const POLE_R = 0.05;     // m: the grey pole's radius, shared by every sign builder
export const FACE_GAP = 0.06;   // m: a panel's centre from the pole axis (radius + 1 cm), so the pole sits behind it
export const signPanelZ = (back) => (back ? -FACE_GAP : FACE_GAP);

// the highest y the pole may reach, fully hidden behind the panel's visible shape
export function poleTop(panel, r = POLE_R, margin = 0.02) {
  const reach = r + margin / 2;   // half-width the shape must still cover at the pole's end
  if (panel.shape === 'rect') return panel.y + panel.h / 2 - margin;
  if (panel.shape === 'disc') return panel.y + Math.sqrt((panel.d / 2) ** 2 - reach ** 2) - margin;
  if (panel.shape === 'tri') return panel.apex - reach / panel.slope - margin;
  throw new Error(`poleTop: unknown shape ${panel.shape}`);
}