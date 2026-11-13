// #859: the rally hall and its three cars as meshes -- built from rallyhall.js's numbers (which are pure and
// unit-tested; this file is not): every part is a box or a wheel cylinder, one merged mesh per colour (each with
// userData.role = 'rallyhall'), no textures, no text, no logos, no liveries. buildHall stands on the floor, +x along
// the room's forward axis (into the hall's depth), +z across; a car's frame: +x nose, y up with the tyres at y = 0.
// Verified by the browser test (#859).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RALLYHALL, carParts, boardLayout } from './rallyhall.js';

// one merged mesh per colour from ready-made geometries (like artemismesh.js's partsGroup, but for boxes and wheels)
function boxGroup(entries) {
  const group = new THREE.Group(), byColour = {};
  const add = (colour, g) => (byColour[colour] ||= []).push(g.index ? g.toNonIndexed() : g);
  for (const [colour, g] of entries) add(colour, g);
  for (const [colour, geos] of Object.entries(byColour)) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), new THREE.MeshLambertMaterial({ color: Number(colour) }));
    m.userData.role = 'rallyhall'; group.add(m);
  }
  return group;
}

// one rally car in its own frame (+x nose, y up with the tyres at y = 0, z across), from carParts's boxes and wheels
export function buildCar(car, cfg = RALLYHALL) {
  const entries = [];
  for (const p of carParts(car, cfg)) {
    const g = p.kind === 'box' ? new THREE.BoxGeometry(p.sx, p.sy, p.sz) : new THREE.CylinderGeometry(p.r, p.r, p.w, 16);
    if (p.kind === 'wheel') g.rotateX(Math.PI / 2);   // the wheel's axis across the car, along z
    g.translate(p.x, p.y, p.z);
    entries.push([p.colour, g]);
  }
  return boxGroup(entries);
}

// the hall in its own frame (+x into its depth, +z across its width, y = 0 on the floor): the floor slab, the back
// wall with its dark glass band, the two side walls, the two corner posts at the open front, the roof slab with its
// canopy past the front, and the three round podiums with a car on each, its nose turned by its descriptor heading.
export function buildHall(cfg = RALLYHALL) {
  const { hall: H, podium, colours: C } = cfg, entries = [];
  const box = (x, y, z, sx, sy, sz, colour) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); entries.push([colour, g]); };
  box(0, H.floor / 2, 0, H.d, H.floor, H.w, C.floor);                                                 // the floor slab
  box(H.d / 2 - H.wall / 2, cfg.h / 2, 0, H.wall, cfg.h, H.w, C.wall);                                // the back wall
  for (const s of [-1, 1]) box(0, cfg.h / 2, s * (H.w / 2 - H.wall / 2), H.d, cfg.h, H.wall, C.wall);   // the two side walls
  for (const s of [-1, 1]) box(-H.d / 2 + H.post / 2, cfg.h / 2, s * (H.w / 2 - H.post / 2), H.post, cfg.h, H.post, C.wall);   // the two corner posts at the open front
  box(H.d / 2 - H.wall - 0.075, (H.glass.y0 + H.glass.y1) / 2, 0, 0.05, H.glass.y1 - H.glass.y0, H.w - 2 * H.wall, C.band);   // the dark glass band, just off the wall's inside
  box(-H.roof.canopy / 2, H.roof.y0 + H.roof.t / 2, 0, H.d + H.roof.canopy, H.roof.t, H.w, C.roof);   // the roof slab, its canopy reaching past the open front
  for (const car of cfg.cars) {                                                                       // the three podiums, each with its car on top
    const pd = new THREE.CylinderGeometry(podium.r, podium.r, podium.h, 32);
    pd.translate(car.at[0], podium.h / 2, car.at[1]);
    entries.push([C.podium, pd]);
  }
  const group = boxGroup(entries);
  for (const car of cfg.cars) {
    const c = buildCar(car, cfg);
    c.position.set(car.at[0], podium.h, car.at[1]); c.rotation.y = -car.th;
    group.add(c);
  }
  group.add(buildBoard(cfg));
  return group;
}

// #907: the honour board on the back wall -- a dark panel, a gold frame and a lettering plane, in the hall frame
// (+x into the depth/a, +z across/b; the group is turned -PI/2 about y so the plane's normal +z faces -a, towards the
// open front, and the lettering reads left to right). Canvas texture only, no external asset, no logo. Hangs on the
// wall, so it adds no collider.
export function buildBoard(cfg = RALLYHALL) {
  const B = boardLayout(cfg), board = cfg.board, { w, h } = B, group = new THREE.Group();
  group.userData.role = 'rallyhallboard';
  group.position.set(B.a, B.y0 + B.h / 2, B.b);
  group.rotation.y = -Math.PI / 2;
  group.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), new THREE.MeshLambertMaterial({ color: board.panel })));
  const goldMat = new THREE.MeshLambertMaterial({ color: board.gold }), strip = 0.08;
  const addStrip = (sx, sy, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.03), goldMat); m.position.set(x, y, 0.035); group.add(m); };
  addStrip(w, strip, 0, h / 2 - strip / 2);                    // top
  addStrip(w, strip, 0, -(h / 2 - strip / 2));                 // bottom
  addStrip(strip, h - 2 * strip, -(w / 2 - strip / 2), 0);     // left
  addStrip(strip, h - 2 * strip, w / 2 - strip / 2, 0);         // right
  const cw = 1536, ch = Math.round(cw * (h - 0.3) / (w - 0.3));
  const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
  drawBoard(canvas.getContext('2d'), cw, ch, board);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, h - 0.3), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.z = 0.06; group.add(face);
  return group;
}

// the lettering canvas: the panel colour filled, a gold inner rule, then each line centred in gold. ch spans the
// plane's (h - 0.3) m, so the font px is sized for the line's metre cap-height (line.size * board.h) to hold.
function drawBoard(g, cw, ch, board) {
  const panel = '#' + board.panel.toString(16).padStart(6, '0'), gold = '#' + board.gold.toString(16).padStart(6, '0');
  g.fillStyle = panel; g.fillRect(0, 0, cw, ch);
  g.strokeStyle = gold; g.lineWidth = 4; g.strokeRect(8, 8, cw - 16, ch - 16);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = gold;
  for (const line of board.lines) {
    const px = Math.round(line.size * board.h / (board.h - 0.3) * ch / 0.7);
    g.font = `${line.weight} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    g.fillText(line.text, cw / 2, line.y * ch, cw - 120);
  }
}

// the group's triangle count (like artemisTriangles)
export function rallyhallTriangles(group) {
  let tris = 0;
  group.traverse(o => { if (!o.isMesh) return; const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += n * (o.isInstancedMesh ? o.count : 1); });
  return tris;
}
