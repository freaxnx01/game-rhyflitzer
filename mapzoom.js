// mapzoom.js (#843): pure zoom-towards-the-cursor math for the big Tab map. No DOM; index.html applies it.
export const clampCentre = (c, size, z) => Math.min(Math.max(c, size / 2 / z), size - size / 2 / z);

export function zoomAt(view, dir, px, py, w, h, zooms) {
  const i = Math.min(Math.max(zooms.indexOf(view.z) + dir, 0), zooms.length - 1), z = zooms[i];
  if (z === view.z) return { z: view.z, ox: view.ox, oy: view.oy };
  const bx = (px - w / 2) / view.z + view.ox, by = (py - h / 2) / view.z + view.oy;
  return { z, ox: clampCentre(bx - (px - w / 2) / z, w, z), oy: clampCentre(by - (py - h / 2) / z, h, z) };
}