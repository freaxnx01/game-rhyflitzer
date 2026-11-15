// PoC Sisseln (#987): a Rhyflitzer car driving through the slice. The handling is arcade, not the game's physics --
// the PoC only has to feel plausible enough to look around from behind the wheel.
import * as THREE from 'three/webgpu';
import { makeGrid, gridAdd, gridQuery } from '../../../world.js';
import { SLICE, inSlice } from './sisseln-slice.js';
import { heightAt, pointInRing } from './sisseln-geom.js';
import { createCarLoader, attachGltfBody } from './poc-car-attach.js';
import { setLampsLit } from './poc-car.js';
import { HEADLIGHTS, createVehicleHeadlight, placeVehicleHeadlight } from './vehicle-lights.js';

const DRIVE = {
  topSpeed: 25,        // m/s, about 90 km/h
  reverseSpeed: 8,
  acceleration: 9,
  brake: 20,
  rollingDrag: 1.6,
  steerRate: 1.5,      // rad/s at walking pace
  steerFalloff: 12,    // steering tightens up less the faster the car goes
  rideHeight: 0.06,
  wheelbase: 2.6,
  halfWidth: 0.95
};

// The car's own lights, in the chassis frame: the headlight pair and where the nose is (bulldog.glb is fitted to
// 5.05 m). The lit look of the lamps themselves comes from the model's own emissive lamp materials, via setLampsLit.
const CAR_LAMP_SPEC = { headlight: [0.72, 0.66], zFront: 2.25 };

const CAMERAS = [
  { id: 'chase', label: 'Verfolgung', back: 8.5, up: 3.4, look: 1.2, lag: 3.2 },
  { id: 'close', label: 'Nah', back: 4.2, up: 1.7, look: 0.9, lag: 6.0 },
  { id: 'top', label: 'Vogelschau', back: 0.5, up: 22, look: 0.0, lag: 2.4 }
];

const DRIVE_KEYS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right'
};

/** Keyboard drive input, sampled into a plain object: handlers never touch the car's state directly. */
export function createDriveInput(target = window) {
  const keys = { forward: false, back: false, left: false, right: false };
  const set = (event, down) => {
    const key = DRIVE_KEYS[event.code];
    if (!key) return;
    keys[key] = down;
  };
  target.addEventListener('keydown', (event) => set(event, true));
  target.addEventListener('keyup', (event) => set(event, false));
  return keys;
}

// Every building footprint in the slice, indexed so a collision test only looks at the ones nearby.
function footprintGrid(buildings) {
  const grid = makeGrid(32);
  for (const building of buildings) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of building.ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    gridAdd(grid, minX, minZ, maxX, maxZ, building.ring);
  }
  return grid;
}

function hitsBuilding(grid, x, z, heading) {
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  // the car's nose, tail and both flanks, which is enough to stop it sliding into a wall corner-first
  const probes = [
    [x, z],
    [x + sin * DRIVE.wheelbase, z + cos * DRIVE.wheelbase],
    [x - sin * DRIVE.wheelbase, z - cos * DRIVE.wheelbase],
    [x + cos * DRIVE.halfWidth, z - sin * DRIVE.halfWidth],
    [x - cos * DRIVE.halfWidth, z + sin * DRIVE.halfWidth]
  ];
  for (const [px, pz] of probes) {
    for (const ring of gridQuery(grid, px, pz, 0)) {
      if (pointInRing(px, pz, ring)) return true;
    }
  }
  return false;
}

/** The road point nearest the Plattform, and the heading from it towards the Plattform. */
function startPose(slice) {
  const target = slice.landmarks.plattform || { x: 0, z: 0 };
  let best = null;
  for (const road of slice.roads) {
    for (const [x, z] of road.pts) {
      const distance = (x - target.x) ** 2 + (z - target.z) ** 2;
      if (!best || distance < best.distance) best = { x, z, distance };
    }
  }
  if (!best) return { x: target.x, z: target.z + 30, heading: 0 };
  return { x: best.x, z: best.z, heading: Math.atan2(target.x - best.x, target.z - best.z) };
}

function createHeadlights(chassisPivot) {
  const spots = [-1, 1].map((side) => {
    const spot = createVehicleHeadlight();
    placeVehicleHeadlight(spot, CAR_LAMP_SPEC, side);
    chassisPivot.add(spot, spot.target);
    return spot;
  });
  return spots;
}

export function createCar(scene, slice, terrain) {
  const root = new THREE.Group();
  root.name = 'car';
  const chassisPivot = new THREE.Group();
  root.add(chassisPivot);
  scene.add(root);

  const pose = startPose(slice);
  const grid = footprintGrid(slice.buildings);
  const headlights = createHeadlights(chassisPivot);
  const state = { x: pose.x, z: pose.z, heading: pose.heading, speed: 0 };
  let lamps = [];
  let cameraIndex = 0;
  const cameraTarget = new THREE.Vector3();
  const cameraEye = new THREE.Vector3();
  let cameraPlaced = false;

  root.position.set(state.x, heightAt(terrain, state.x, state.z) + DRIVE.rideHeight, state.z);
  root.rotation.y = state.heading;

  function accelerate(keys, dt) {
    if (keys.forward) state.speed += DRIVE.acceleration * dt;
    else if (keys.back) state.speed -= (state.speed > 0 ? DRIVE.brake : DRIVE.acceleration) * dt;
    else state.speed -= Math.sign(state.speed) * Math.min(Math.abs(state.speed), DRIVE.rollingDrag * dt);
    state.speed = Math.min(Math.max(state.speed, -DRIVE.reverseSpeed), DRIVE.topSpeed);
  }

  function steer(keys, dt) {
    const turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    if (turn === 0 || Math.abs(state.speed) < 0.2) return;
    const grip = DRIVE.steerRate / (1 + Math.abs(state.speed) / DRIVE.steerFalloff);
    state.heading += turn * grip * dt * Math.sign(state.speed);
  }

  // The car's body follows the slope: two height samples a wheelbase apart give the pitch, two more the roll.
  function settleOnTerrain() {
    const sin = Math.sin(state.heading);
    const cos = Math.cos(state.heading);
    const half = DRIVE.wheelbase / 2;
    const front = heightAt(terrain, state.x + sin * half, state.z + cos * half);
    const rear = heightAt(terrain, state.x - sin * half, state.z - cos * half);
    const left = heightAt(terrain, state.x + cos * DRIVE.halfWidth, state.z - sin * DRIVE.halfWidth);
    const right = heightAt(terrain, state.x - cos * DRIVE.halfWidth, state.z + sin * DRIVE.halfWidth);

    root.position.set(state.x, (front + rear) / 2 + DRIVE.rideHeight, state.z);
    root.rotation.set(0, state.heading, 0);
    chassisPivot.rotation.x = -Math.atan2(front - rear, DRIVE.wheelbase);
    chassisPivot.rotation.z = Math.atan2(left - right, DRIVE.halfWidth * 2);
  }

  function update(dt, keys) {
    accelerate(keys, dt);
    steer(keys, dt);

    const nextX = state.x + Math.sin(state.heading) * state.speed * dt;
    const nextZ = state.z + Math.cos(state.heading) * state.speed * dt;
    if (!inSlice(nextX, nextZ, SLICE) || hitsBuilding(grid, nextX, nextZ, state.heading)) {
      state.speed *= -0.15; // a bump, not a stop: the car rebounds and the driver steers away
    } else {
      state.x = nextX;
      state.z = nextZ;
    }
    settleOnTerrain();
  }

  /** Lets the chase camera glide in behind the car rather than snapping to it every frame. */
  function applyCamera(camera, dt) {
    const preset = CAMERAS[cameraIndex];
    const sin = Math.sin(state.heading);
    const cos = Math.cos(state.heading);
    const wanted = new THREE.Vector3(
      root.position.x - sin * preset.back,
      root.position.y + preset.up,
      root.position.z - cos * preset.back
    );
    const blend = cameraPlaced ? 1 - Math.exp(-preset.lag * dt) : 1;
    cameraEye.lerp(wanted, blend);
    cameraTarget.lerp(root.position.clone().setY(root.position.y + preset.look), blend);
    cameraPlaced = true;
    camera.position.copy(cameraEye);
    camera.lookAt(cameraTarget);
  }

  return {
    root,
    update,
    applyCamera,
    get speed() {
      return state.speed;
    },
    get cameraLabel() {
      return CAMERAS[cameraIndex].label;
    },
    cycleCamera() {
      cameraIndex = (cameraIndex + 1) % CAMERAS.length;
      cameraPlaced = false;
      return CAMERAS[cameraIndex].label;
    },
    setNight(isNight) {
      setLampsLit(lamps, isNight);
      for (const spot of headlights) spot.intensity = isNight ? HEADLIGHTS.intensity : 0;
    },
    /** Loads bulldog.glb onto the chassis; the PoC keeps driving an invisible car if the model fails to load. */
    async load() {
      const body = await attachGltfBody({ chassisPivot, wheels: [] }, createCarLoader());
      lamps = body ? body.lamps : [];
      return Boolean(body);
    }
  };
}
