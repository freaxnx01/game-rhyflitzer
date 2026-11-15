// PoC Sisseln (#987): the TSL materials the Sisseln slice needs, taken out of poc/webgpu/js/tsl-materials.js
// (MIT, (c) Mr.doob -- see LICENSE) and trimmed: no city-config.js, no Manhattan bounds, no Times Square neon.
// Kept as they were: the shared time-of-day uniforms, the noise and bump helpers, and the puddle / wetness masks
// that make `R` (wet roads) work. New here: village plaster, industrial wall, roof, field and river materials.
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec2,
  vec3,
  color,
  uniform,
  attribute,
  varying,
  positionWorld,
  positionView,
  normalLocal,
  normalView,
  normalWorldGeometry,
  modelNormalMatrix,
  cameraPosition,
  cameraViewMatrix,
  time,
  sin,
  abs,
  floor,
  fract,
  min,
  max,
  clamp,
  mix,
  step,
  smoothstep,
  dot,
  length,
  normalize,
  pow,
  sqrt,
  fwidth,
  select,
  If
} from 'three/tsl';

// Shared live uniforms controlled by the lighting / time-of-day presets (lighting.js writes them).
const cityUniforms = {
  uSunColor: uniform(new THREE.Color(0xffca92)),
  uSkyTopColor: uniform(new THREE.Color(0x2c568c)),
  uSkyHorizonColor: uniform(new THREE.Color(0xebd1b5)),
  uSkySunDir: uniform(new THREE.Vector3(-0.66, 0.34, -0.67).normalize()),
  uInteriorGlow: uniform(0.78),
  uRoadWetness: uniform(0.38),
  uCanyonBounce: uniform(0.52)
};

// Fast deterministic 2D -> 1D hash in TSL
const hash2D = Fn(([p]) => {
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
});

// Smooth 2D value noise in TSL
const noise2D = Fn(([p]) => {
  const pv = vec2(p).toVar();
  const i = floor(pv).toVar();
  const f = fract(pv).toVar();
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0))).toVar();
  const a = hash2D(i);
  const b = hash2D(i.add(vec2(1.0, 0.0)));
  const c = hash2D(i.add(vec2(0.0, 1.0)));
  const d = hash2D(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

/** Mikkelsen's surface-gradient hardware derivative bump mapping; `height` is evaluated once as a parameter. */
const bumpNormal = Fn(([height]) => {
  const h = float(height).toVar();
  const dpdx = positionView.dFdx();
  const dpdy = positionView.dFdy();
  const r1 = dpdy.cross(normalView);
  const r2 = normalView.cross(dpdx);
  const det = dpdx.dot(r1);
  const grad = det.sign().mul(h.dFdx().mul(r1).add(h.dFdy().mul(r2)));
  return det.abs().mul(normalView).sub(grad).normalize();
});

/** Box-filtered periodic pulse: the share of a `w`-wide footprint around `x` whose fract() lies in [a, b]. */
const filteredPulse = Fn(([x, a, b, w]) => {
  const p = float(x).toVar();
  const lo = float(a).toVar();
  const hi = float(b).toVar();
  const hw = max(float(w), 0.0001).mul(0.5).toVar();
  const integral = (t) => floor(t).mul(hi.sub(lo)).add(clamp(fract(t), lo, hi).sub(lo));
  return integral(p.add(hw)).sub(integral(p.sub(hw))).div(hw.mul(2.0));
});

/** `detail()` where `active` holds, else the value its own fade settles to: faded-out texture is skipped, not scaled. */
function fadedDetail(active, flat, detail) {
  const out = float(flat).toVar();
  If(active, () => {
    out.assign(detail());
  });
  return out;
}

// The low-lying spots of the road surface, where rainwater collects first.
function roadPuddleField(wx, wz) {
  const nMacro = noise2D(vec2(wx.mul(0.095), wz.mul(0.075)));
  const nMid = noise2D(vec2(wx.mul(0.25).add(19.4), wz.mul(0.22).add(11.8)));
  const nDetail = noise2D(vec2(wx.mul(0.68).sub(7.3), wz.mul(0.68).add(29.1)));
  return nMacro.mul(0.52).add(nMid.mul(0.34)).add(nDetail.mul(0.14));
}

/**
 * Wetness masks over the puddle field, driven by cityUniforms.uRoadWetness (0 = bone dry ... 1 = after a downpour):
 * x = damp stains (darker, satin), y = standing water (mirror-smooth), z = the wet film over everything.
 */
function roadWetMasks(field, drainage = 0.0) {
  const w = cityUniforms.uRoadWetness;
  const level = mix(float(0.86), float(0.56), clamp(w.sub(0.1).div(0.55), 0.0, 1.0)).add(drainage);
  const damp = smoothstep(level.sub(0.09), level.sub(0.015), field);
  const puddle = smoothstep(level, level.add(0.022), field).mul(smoothstep(0.1, 0.22, w));
  const film = smoothstep(0.2, 0.8, w);
  return vec3(damp, puddle, film);
}

/**
 * Swiss village asphalt: a quieter surface than Manhattan's (no utility-cut patches, tar snakes or manholes), with
 * the same puddle field so `R` turns it wet and SSR puts the sky and the street lamps back into the standing water.
 */
function createRoadSurfaceMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0.2, roughness: 0.9 });

  const cAsphaltDark = color(0x3f4145);
  const cAsphaltLight = color(0x6b6d71);

  const pixelSize = length(fwidth(positionWorld.xz));
  const puddleField = roadPuddleField(positionWorld.x, positionWorld.z);
  const wet = roadWetMasks(puddleField);
  const damp = wet.x;
  const puddle = wet.y;
  const film = wet.z;
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const waterFresnel = pow(float(1.0).sub(clamp(viewDir.y, 0.0, 1.0)), 5.0).mul(0.98).add(0.02);

  mat.colorNode = Fn(() => {
    const wx = positionWorld.x;
    const wz = positionWorld.z;
    const px = float(pixelSize).toVar();

    // Two-scale aggregate grit, each settling to its mean before it can alias at grazing angles
    const microAggregate = fadedDetail(px.lessThan(0.06), 0.5, () =>
      mix(float(0.5), noise2D(vec2(wx.mul(16.0), wz.mul(16.0))), smoothstep(0.06, 0.02, px)));
    const fineGrain = fadedDetail(px.lessThan(0.4), 0.5, () =>
      mix(float(0.5), noise2D(vec2(wx.mul(3.2), wz.mul(3.2))), smoothstep(0.4, 0.12, px)));
    const mottle = noise2D(vec2(wx.mul(0.9), wz.mul(0.9)).add(41.0));

    const asphalt = mix(
      cAsphaltDark,
      cAsphaltLight,
      fineGrain.mul(0.3).add(microAggregate.mul(0.22)).add(smoothstep(0.3, 0.7, mottle).mul(0.26)).sub(0.04)
    );
    // Water filling the pores darkens the surface: damp stains and pools most, the overall film a little
    const wetDarkening = mix(mix(float(1.0), float(0.72), damp), float(0.6), puddle).mul(mix(float(1.0), float(0.8), film));
    return asphalt.mul(wetDarkening);
  })();

  mat.roughnessNode = Fn(() => {
    const px = float(pixelSize).toVar();
    const microRough = fadedDetail(px.lessThan(0.08), 0.04, () =>
      mix(float(0.04), noise2D(positionWorld.xz.mul(12.0)).mul(0.08), smoothstep(0.08, 0.03, px)));
    const dry = float(0.90).add(microRough);
    // The wet film only takes the edge off the mattness; real gloss is kept for damp stains and standing water
    const filmed = mix(dry, float(0.68), film.mul(0.7));
    return mix(mix(filmed, float(0.4), damp.mul(0.85)), float(0.1), puddle);
  })();

  // Water's Fresnel (F0 = 0.02) weights SSR and trades diffuse for reflection in the pools
  mat.metalnessNode = clamp(waterFresnel.mul(1.6), 0.0, 0.85).mul(max(puddle, max(damp.mul(0.35), film.mul(0.15))));

  // Gentle paving relief, flattened to mirror-smooth inside the puddles so their reflections stay crisp
  mat.normalNode = Fn(() => {
    const wx = positionWorld.x;
    const wz = positionWorld.z;
    const px = float(pixelSize).toVar();
    const swell = noise2D(vec2(wx.mul(0.55), wz.mul(0.55)).add(23.0)).sub(0.5).mul(0.02);
    const grit = fadedDetail(px.lessThan(0.12), 0.0, () =>
      noise2D(vec2(wx.mul(8.5), wz.mul(8.5))).sub(0.5).mul(0.006).mul(smoothstep(0.12, 0.035, px)));
    return bumpNormal(swell.add(grit).mul(float(1.0).sub(puddle)));
  })();

  // The sky the standing water mirrors, as a cheap base under the screen-space reflection
  mat.emissiveNode = Fn(() => {
    const roadFresnel = pow(clamp(float(1.0).sub(abs(viewDir.y)), 0.0, 1.0), 2.3);
    const skyMirror = mix(cityUniforms.uSkyHorizonColor, cityUniforms.uSkyTopColor, 0.40).mul(0.10);
    return skyMirror.mul(max(puddle, film.mul(0.35))).mul(roadFresnel).mul(cityUniforms.uInteriorGlow).mul(0.07);
  })();

  return mat;
}

// Camera-independent wall frame: resolve the dominant axis in the vertex shader and keep it flat across the face.
const wallNormal = varying(normalize(modelNormalMatrix.mul(normalLocal)), 'vWallNormal');

// Metres along the wall, whichever way it faces, so the window grid does not shear on a turned building.
function wallCoordinate() {
  return select(abs(wallNormal.x).greaterThan(abs(wallNormal.z)), positionWorld.z, positionWorld.x);
}

// Only the upright faces get windows; roofs and floors stay blank.
function wallFacing() {
  return smoothstep(0.35, 0.75, float(1.0).sub(abs(wallNormal.y)));
}

const BAY = 2.2;      // window bay, matching the game's FACADE.half * 2
const STOREY = 3.0;   // storey height, matching the game's FACADE.storey

/**
 * Window grid on a wall: x = pane coverage, y = how lit the pane is. `baseY` is the attribute holding the building's
 * own ground height, so the storeys start at the ground of each building rather than at sea level.
 */
function facadeWindows(litProbability, seed) {
  const u = wallCoordinate().div(BAY);
  const v = positionWorld.y.sub(attribute('baseY', 'float')).sub(0.9).div(STOREY);
  const fw = fwidth(vec2(u, v)).toVar();
  const pane = filteredPulse(fract(u), 0.22, 0.78, fw.x).mul(filteredPulse(fract(v), 0.18, 0.72, fw.y));
  const aboveGround = step(0.0, v);
  const cell = floor(vec2(u, v)).add(seed);
  const lit = step(hash2D(cell), litProbability).mul(cityUniforms.uInteriorGlow.min(1.0));
  return vec2(pane.mul(wallFacing()).mul(aboveGround), lit);
}

/** Swiss village plaster: a warm, slightly uneven render with shuttered windows that light up at night. */
function createPlasterFacadeMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0.0 });
  const windows = facadeWindows(float(0.45), vec2(3.7, 8.1));

  mat.colorNode = Fn(() => {
    // Each building gets its own shade of render, varying slowly across the village
    const tint = noise2D(positionWorld.xz.mul(0.045));
    const plaster = mix(color(0xe8e0d2), color(0xd2c3ad), smoothstep(0.3, 0.8, tint));
    const grain = noise2D(positionWorld.xz.mul(7.0).add(positionWorld.y.mul(7.0))).mul(0.06).sub(0.03);
    const glass = mix(color(0x2a3038), color(0x8aa6b8), float(0.25));
    return mix(plaster.add(grain), glass, windows.x.mul(0.9));
  })();

  mat.roughnessNode = mix(float(0.92), float(0.22), windows.x);
  mat.emissiveNode = color(0xffd9a0).mul(windows.x).mul(windows.y).mul(cityUniforms.uInteriorGlow).mul(1.6);
  return mat;
}

/** The works and sheds of the Sisslerfeld: plain profiled grey wall, a few lit windows at night. */
function createIndustrialWallMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.72, metalness: 0.15 });
  const windows = facadeWindows(float(0.18), vec2(11.3, 2.9));

  mat.colorNode = Fn(() => {
    const shade = noise2D(positionWorld.xz.mul(0.03).add(5.0));
    const panel = mix(color(0x9aa0a6), color(0x7c838a), smoothstep(0.35, 0.75, shade));
    const glass = color(0x39434d);
    return mix(panel, glass, windows.x.mul(0.85));
  })();

  // Trapezoidal sheet profile every 25 cm, only on the upright faces
  mat.normalNode = Fn(() => {
    const rib = sin(wallCoordinate().mul(25.0)).mul(0.0025).mul(wallFacing());
    return bumpNormal(rib);
  })();

  mat.emissiveNode = color(0xdfe6ff).mul(windows.x).mul(windows.y).mul(cityUniforms.uInteriorGlow).mul(1.1);
  return mat;
}

/** Clay-tile roofs for the village, standing-seam grey for the works; `palette` picks the colour. */
function createRoofMaterial(industrial = false) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: industrial ? 0.25 : 0.0 });
  const warm = industrial ? color(0x6e747a) : color(0xa6512f);
  const cool = industrial ? color(0x565c62) : color(0x7e3d26);

  mat.colorNode = Fn(() => {
    const tile = noise2D(positionWorld.xz.mul(industrial ? 1.4 : 3.2));
    return mix(cool, warm, smoothstep(0.25, 0.8, tile));
  })();
  return mat;
}

/** The Rhine and the village ponds: wind-driven ripples, Fresnel metalness so SSR mirrors the banks and the sky. */
function createWaterMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0.0, roughness: 0.2 });

  // [tile size (m), drift direction, slope]: incommensurate scales so no pattern repeats
  const LAYERS = [
    [37.0, 0.31, 0.055],
    [13.1, 2.17, 0.06],
    [4.7, 4.41, 0.05]
  ];

  // The mean wave slope at this point, as (dy/dx, dy/dz)
  const waveSlope = Fn(() => {
    const p = positionWorld.xz;
    const t = time;
    // Wind patches drifting with the breeze: large-scale wave energy that hides the tiling
    const gust = smoothstep(0.2, 0.8, noise2D(p.mul(0.006).add(vec2(t.mul(0.012), t.mul(-0.008)))));
    const energy = mix(float(0.5), float(1.25), gust).toVar();

    const slope = vec2(0.0, 0.0).toVar();
    for (const [size, heading, sigma] of LAYERS) {
      const drift = vec2(Math.cos(heading), Math.sin(heading)).mul(t.mul(0.9 / Math.sqrt(size)));
      const q = p.div(size).add(drift);
      const here = noise2D(q);
      const dx = noise2D(q.add(vec2(0.04, 0.0))).sub(here);
      const dz = noise2D(q.add(vec2(0.0, 0.04))).sub(here);
      slope.addAssign(vec2(dx, dz).mul(energy.mul(sigma).mul(25.0)));
    }
    return slope;
  })();

  // Banks and weir walls keep their own normal; only the flat top gets waves
  const flatTop = smoothstep(0.5, 0.9, normalWorldGeometry.y);
  const surfaceNormal = normalize(mix(normalWorldGeometry, vec3(waveSlope.x.negate(), 1.0, waveSlope.y.negate()), flatTop));
  mat.normalNode = cameraViewMatrix.transformDirection(surfaceNormal);

  // GGX alpha approximates the RMS slope of the waves too small to resolve
  mat.roughnessNode = clamp(sqrt(length(waveSlope)).mul(0.22).add(0.06), 0.05, 0.5);

  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const fresnel = pow(float(1.0).sub(clamp(dot(surfaceNormal, viewDir), 0.0, 1.0)), 5.0).mul(0.98).add(0.02);
  mat.metalnessNode = clamp(fresnel.mul(1.6), 0.0, 0.9);

  // Alpine river: green-grey where it runs deep, siltier towards the banks
  mat.colorNode = Fn(() => {
    const silt = noise2D(positionWorld.xz.mul(0.004).add(7.3));
    return mix(color(0x1d3a3a), color(0x2d4740), smoothstep(0.25, 0.85, silt));
  })();

  return mat;
}

/**
 * The one ground mesh: the farmland parcels and the forest floor are painted into its vertex colours rather than
 * laid over it as separate meshes, so no decal can z-fight with the terrain or cut into a slope.
 */
function createTerrainMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.96, metalness: 0.0, vertexColors: true });
  mat.colorNode = Fn(() => {
    const furrow = noise2D(positionWorld.xz.mul(1.1)).mul(0.12).add(0.94);
    const patch = noise2D(positionWorld.xz.mul(0.021)).mul(0.16).add(0.92);
    return attribute('color', 'vec3').mul(furrow).mul(patch);
  })();
  return mat;
}

/** Forest canopy: one material for every instanced tree, its shade varying with the tree's world position. */
function createFoliageMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0.0 });
  mat.colorNode = Fn(() => {
    const species = hash2D(floor(positionWorld.xz.mul(0.35)));
    const canopy = mix(color(0x2f5226), color(0x4d6b2c), species);
    const dapple = noise2D(positionWorld.xz.mul(2.2)).mul(0.12).sub(0.06);
    return canopy.add(dapple);
  })();
  return mat;
}

/** Lamp heads, kept dark by day and glowing once the time preset turns the interior glow up. */
function createLampGlobeMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0.0, color: 0x1a1a18 });
  mat.emissiveNode = color(0xffdca8).mul(smoothstep(0.6, 1.2, cityUniforms.uInteriorGlow)).mul(6.0);
  return mat;
}

/** Steel and concrete for the lamp posts, the Plattform frame and the DSM chimney. */
function createStructureMaterial(baseColor = 0x8a8f94, roughness = 0.65) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness, metalness: 0.35, color: baseColor });
  mat.colorNode = Fn(() => {
    const weather = noise2D(positionWorld.xz.mul(0.6).add(positionWorld.y.mul(0.3)));
    return color(baseColor).mul(mix(float(0.85), float(1.1), weather));
  })();
  return mat;
}

export {
  cityUniforms,
  hash2D,
  noise2D,
  bumpNormal,
  roadPuddleField,
  roadWetMasks,
  createRoadSurfaceMaterial,
  createPlasterFacadeMaterial,
  createIndustrialWallMaterial,
  createRoofMaterial,
  createWaterMaterial,
  createTerrainMaterial,
  createFoliageMaterial,
  createLampGlobeMaterial,
  createStructureMaterial
};
