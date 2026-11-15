// PoC Sisseln (#987): the OSM roads of the slice as one wet-capable asphalt ribbon, plus the street lamps along
// them -- every lamp glows, but only the handful nearest the car cast real light.
import * as THREE from 'three/webgpu';
import { heightAt, roadRibbon, lampSpots, pickLampLights } from './sisseln-geom.js';
import { mergeGeometries } from './sisseln-mesh.js';
import { createRoadSurfaceMaterial, createLampGlobeMaterial, createStructureMaterial } from './sisseln-materials.js';

// Roads sit a few centimetres over the terrain so the ground cannot poke through them on a slope.
const ROAD_LIFT = 0.06;
const LAMP_SPACING = 30;
const LAMP_HEIGHT = 7.2;
const LAMP_CAP = 1600;
// The clustered lighting path can afford this many shadowless point lights; the rest of the lamps glow only.
const LAMP_LIGHTS = 16;
const LAMP_LIGHT_INTENSITY = 420;
const LAMP_LIGHT_DISTANCE = 42;
// Moving 16 lights every frame is wasted work: the car covers under 13 m in half a second at top speed.
const LAMP_REFRESH_SECONDS = 0.5;

function buildRoadSurface(roads, terrain) {
  const geometries = [];
  for (const road of roads) {
    const ribbon = roadRibbon(road.pts, Math.max(road.w || 4, 2.5));
    if (ribbon.indices.length === 0) continue;
    for (let i = 0; i < ribbon.positions.length; i += 3) {
      ribbon.positions[i + 1] = heightAt(terrain, ribbon.positions[i], ribbon.positions[i + 2]) + ROAD_LIFT;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(ribbon.positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(ribbon.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(ribbon.indices, 1));
    geometry.computeVertexNormals();
    geometries.push(geometry);
  }
  if (geometries.length === 0) return null;
  const mesh = new THREE.Mesh(mergeGeometries(geometries), createRoadSurfaceMaterial());
  mesh.receiveShadow = true;
  mesh.name = 'roads';
  return mesh;
}

function placeInstance(mesh, index, x, y, z) {
  const matrix = new THREE.Matrix4().makeTranslation(x, y, z);
  mesh.setMatrixAt(index, matrix);
}

/** One instanced post and one instanced head for every lamp in the slice. */
function buildLampPosts(spots, terrain) {
  const group = new THREE.Group();
  group.name = 'lamps';

  const postGeometry = new THREE.CylinderGeometry(0.09, 0.13, LAMP_HEIGHT, 6);
  postGeometry.translate(0, LAMP_HEIGHT / 2, 0);
  const posts = new THREE.InstancedMesh(postGeometry, createStructureMaterial(0x6f757b, 0.55), spots.length);
  posts.castShadow = true;

  const headGeometry = new THREE.BoxGeometry(0.58, 0.18, 0.3);
  headGeometry.translate(0, LAMP_HEIGHT, 0);
  const heads = new THREE.InstancedMesh(headGeometry, createLampGlobeMaterial(), spots.length);

  spots.forEach((spot, index) => {
    const ground = heightAt(terrain, spot.x, spot.z);
    spot.y = ground + LAMP_HEIGHT;
    placeInstance(posts, index, spot.x, ground, spot.z);
    placeInstance(heads, index, spot.x, ground, spot.z);
  });
  posts.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;

  group.add(posts, heads);
  return group;
}

/**
 * The real lamp lights. They are created once and re-placed around the focus point, so the frame rate holds along
 * a long lit road: the cost is a fixed 16 lights however many lamp posts the slice has.
 */
function createLampLights(scene) {
  const lights = [];
  for (let i = 0; i < LAMP_LIGHTS; i++) {
    const light = new THREE.PointLight(0xffd9a8, 0, LAMP_LIGHT_DISTANCE, 2);
    light.visible = false;
    scene.add(light);
    lights.push(light);
  }
  return lights;
}

export function buildRoads(scene, slice, terrain) {
  const surface = buildRoadSurface(slice.roads, terrain);
  if (surface) scene.add(surface);

  const spots = lampSpots(slice.roads, LAMP_SPACING).slice(0, LAMP_CAP);
  const posts = spots.length > 0 ? buildLampPosts(spots, terrain) : null;
  if (posts) scene.add(posts);

  const lights = createLampLights(scene);
  let litAt = -Infinity;
  let lampsOn = false;

  return {
    surface,
    posts,
    lampCount: spots.length,
    setNight(isNight) {
      lampsOn = isNight;
      litAt = -Infinity; // re-place at once, rather than at the next refresh
    },
    update(elapsed, focus) {
      if (elapsed - litAt < LAMP_REFRESH_SECONDS) return;
      litAt = elapsed;
      const nearest = lampsOn ? pickLampLights(spots, focus.x, focus.z, LAMP_LIGHTS) : [];
      lights.forEach((light, index) => {
        const spot = nearest[index];
        light.visible = Boolean(spot);
        light.intensity = spot ? LAMP_LIGHT_INTENSITY : 0;
        if (spot) light.position.set(spot.x, spot.y, spot.z);
      });
    }
  };
}
