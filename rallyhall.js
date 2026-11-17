// #859: the rally hall and its three cars (Toyota GR Yaris Rally1, Hyundai i20 N Rally1, Subaru Impreza WRC)
// as pure numbers, no three.js, no DOM: the descriptor, the game's own Rhy Rally standing in for each car with the
// tint its livery gets (the livery texture times this colour), and where everything stands in a room, with the colliders. rallyhallmesh.js builds the hall from
// these numbers; index.html places it and parks the vehicles on the podiums. Unit-tested with `node --test tests/rallyhall.test.mjs`.
//
// The hall's frame: a along its length (into the room, towards the back wall), b across, y = 0 on the floor;
// the front (a = -d/2) is open.
export const RALLYHALL = {
  key: 'rallyhall', h: 14.8,                                // floor to the roof top
  hall: { w: 72, d: 40, wall: 0.6, post: 1.0, floor: 0.15, roof: { y0: 14.0, t: 0.8, canopy: 4 }, glass: { y0: 3, y1: 9 } },
  podium: { r: 4.5, h: 0.5, hw: 3.0, clear: 0.6 },
  apron: { from: 95, hw: 5 },                               // gravel strip from a = -95 to the roof edge
  cars: [                                                   // a, b: centre-relative (a towards the far wall); th: heading in the hall frame, PI = nose to the open front
    { id: 'neuville', at: [4, -22], th: Math.PI + 0.5, len: 4.10, wid: 1.88, hgt: 1.40, vehicle: 'rally', tint: null },       // the Rhy Rally as it comes, light blue and white
    { id: 'evans',    at: [4, 0],   th: Math.PI,       len: 4.07, wid: 1.88, hgt: 1.40, vehicle: 'rally', tint: 0xd0302a },   // red
    { id: 'mccrae',   at: [4, 22],  th: Math.PI - 0.5, len: 4.34, wid: 1.77, hgt: 1.42, vehicle: 'rally', tint: 0x2a4fb0 },   // deep blue
  ],
  colours: { wall: 0xc9c8c2, roof: 0x8d9096, floor: 0x9b9a95, podium: 0xe6e6e2, band: 0x2c3b4d },
  board: { a: 19.34, b: 0, y0: 0.8, w: 6.0, h: 2.2, panel: 0x14171c, gold: 0xd4a83a, lines: [{ text: 'Elfyn Evans', size: 0.22, y: 0.30, weight: 800 }, { text: 'WRC World Champion 2026', size: 0.14, y: 0.58, weight: 700 }, { text: '& Scott Martin', size: 0.09, y: 0.80, weight: 600 }] },
  flags: { a: 19.25, y0: 4.6, w: 5.0, h: 3.0, gap: 1.0, list: [{ id: 'wales', src: './assets/flags/wales.svg' }, { id: 'uk', src: './assets/flags/uk.svg' }] },
  video: { id: 'cZxfLJdhWk8', a: 19.25, b: -13, y0: 3.2, h: 5.6 },   // the WRC's Short of Evans' title day, 9:16
};

// #907: the honour board on the back wall behind the Evans car -- plain numbers in the hall frame (a into the room,
// b across, y up from the floor); rallyhallmesh.js draws it. Hangs on the wall, so it adds no collider.
export function boardLayout(cfg = RALLYHALL) { const { a, b, y0, w, h, lines } = cfg.board; return { a, b, y0, w, h, lines }; }

// the champion's flags over the honour board, Wales then the Union Jack: 5:3 banners side by side on the glass band, centred
// over the board and just off the glass (a = 19.3), in the hall frame. Seen from the open front, -b is on the left. No collider.
export function flagLayout(cfg = RALLYHALL) {
  const { a, y0, w, h, gap, list } = cfg.flags, step = w + gap;
  return list.map((f, i) => ({ id: f.id, src: f.src, a, b: cfg.board.b + (i - (list.length - 1) / 2) * step, y0, w, h }));
}

// the YouTube Short on the glass band left of the flags, 9:16, in the hall frame. index.html shows it as an iframe in a CSS3D
// layer over the canvas, so nothing in the scene can hide it: it is shown only where nothing stands in between (videoShown).
export function videoLayout(cfg = RALLYHALL) { const { a, b, y0, h } = cfg.video; return { a, b, y0, w: h * 9 / 16, h }; }

// the privacy-enhanced embed, muted (browsers only autoplay muted video) and looping its one video (YouTube loops a playlist)
export function videoEmbedUrl(id) {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&playsinline=1&rel=0`;
}

// whether the camera at (a, b, y) in the hall frame (y above the floor) sees the back wall's glass band unblocked: under
// the roof or on the apron, between the side walls' lines and in front of the wall. Outside that box the hall's walls,
// the roof or the room's floor stand in between, and the iframe would draw through them.
export function videoShown(a, b, y, cfg = RALLYHALL) {
  const { hall: H, apron } = cfg;
  return a > -apron.from && a < H.d / 2 - H.wall - 0.1 && Math.abs(b) <= H.w / 2 - H.wall && y > 0 && y < H.roof.y0;
}

// where the hall and its cars stand in a room ({ centre, frame: { f, v }, y } as roomLayout gives it): the hall at the
// room centre turned to the frame, each car on its podium with its nose to the open front, the gravel apron from the
// 95 m loop to the roof edge, and nine colliders (back wall, two side walls, two posts, the roof as a bridge deck,
// one square per podium + car) -- all `low`, so the car stops on the floor and the helicopter passes over each top.
export function rallyhallPlacement(room, cfg = RALLYHALL) {
  const [cx, cz] = room.centre, { f, v } = room.frame, y = room.y, { hall: H, podium, apron } = cfg;
  const th = Math.atan2(f[1], f[0]);
  const loc = (a, b) => [cx + f[0] * a + v[0] * b, cz + f[1] * a + v[1] * b];
  const box = (a, b, hw, hd, h, rallyhall, extra) => { const [x, z] = loc(a, b); return { x, z, hw, hd, c: f[0], s: f[1], h, low: true, rallyhall, ...extra }; };
  const wallTop = { h: y + cfg.h };
  const colliders = [
    box(H.d / 2 - H.wall / 2, 0, H.wall / 2, H.w / 2, wallTop.h, 'back wall'),
    box(0, H.w / 2 - H.wall / 2, H.d / 2, H.wall / 2, wallTop.h, 'side wall'),
    box(0, -(H.w / 2 - H.wall / 2), H.d / 2, H.wall / 2, wallTop.h, 'side wall'),
    box(-H.d / 2 + H.post / 2, H.w / 2 - H.post / 2, H.post / 2, H.post / 2, wallTop.h, 'post'),
    box(-H.d / 2 + H.post / 2, -(H.w / 2 - H.post / 2), H.post / 2, H.post / 2, wallTop.h, 'post'),
    box(-H.roof.canopy / 2, 0, (H.d + H.roof.canopy) / 2, H.w / 2, wallTop.h, 'roof', { bridge: true, y0: y + H.roof.y0 }),
  ];
  const cars = cfg.cars.map(c => {
    const [x, z] = loc(...c.at);
    colliders.push(box(c.at[0], c.at[1], podium.hw, podium.hw, y + podium.h + c.hgt + podium.clear, `car ${c.id}`));
    return { id: c.id, x, z, th: th + c.th };
  });
  return { hall: { x: cx, z: cz, th }, cars, apron: [loc(-apron.from, 0), loc(-(H.d / 2 + H.roof.canopy), 0)], colliders };
}
