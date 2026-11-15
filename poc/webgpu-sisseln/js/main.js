// PoC Sisseln (#987): builds Sisseln out of the game's own map data and renders it with three's WebGPURenderer,
// using the look of the New York PoC (poc/webgpu/, MIT (c) Mr.doob). The game itself is untouched.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, positionView, metalness, roughness, vec2, smoothstep } from 'three/tsl';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import { parseMmh } from '../../../worlds.js';
import { SLICE, MARGIN, expandBox, sliceWorld } from './sisseln-slice.js';
import { LightingSystem, TIME_PRESETS } from './lighting.js';
import { createPostProcessing } from './post-processing.js';
import { cityUniforms } from './sisseln-materials.js';
import { buildGround } from './sisseln-ground.js';
import { buildRoads } from './sisseln-roads.js';
import { buildBuildings } from './sisseln-buildings.js';
import { buildTrees } from './sisseln-trees.js';
import { buildLandmarks } from './sisseln-landmarks.js';
import { createCar, createDriveInput } from './sisseln-car.js';
import { hasWebGPU, wantsForcedWebGL } from './poc-gate.js';
import { nextTimePreset, roadWetness, isLookKey } from './poc-look.js';
import { isNightPreset } from './poc-car.js';

const WORLD_URL = '../../data/world_hochrhein.json';
const TERRAIN_URL = '../../data/terrain_hochrhein.mmh';

const TIME_LABELS = {
  golden: 'Golden Hour',
  midday: 'Mittag',
  twilight: 'Blaue Stunde',
  midnight: 'Nacht'
};

async function loadWorld(setStatus) {
  setStatus('Karte und Gelände werden geladen …');
  const [worldResponse, terrainResponse] = await Promise.all([fetch(WORLD_URL), fetch(TERRAIN_URL)]);
  if (!worldResponse.ok) throw new Error(`${WORLD_URL}: ${worldResponse.status}`);
  if (!terrainResponse.ok) throw new Error(`${TERRAIN_URL}: ${terrainResponse.status}`);
  const [world, terrainBuffer] = await Promise.all([worldResponse.json(), terrainResponse.arrayBuffer()]);
  return { world, terrain: parseMmh(terrainBuffer) };
}

function createRenderer(container) {
  // Firefox's WebGL2 stalls badly on multisampled float MRT targets, so it renders without MSAA.
  const isFirefox = typeof navigator !== 'undefined' && /Firefox\//.test(navigator.userAgent);
  const renderer = new THREE.WebGPURenderer({
    forceWebGL: wantsForcedWebGL(location.search),
    antialias: !isFirefox,
    powerPreference: 'high-performance',
    reversedDepthBuffer: true
  });
  renderer.setPixelRatio(1.0);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  // The street lamps and the car's headlights are many small unshadowed lights: clustered lighting keeps them cheap.
  renderer.lighting = new ClusteredLighting(256, 32, 28, 48);
  container.appendChild(renderer.domElement);
  return renderer;
}

// Half-resolution screen-space reflections, bloom and filmic grading, as in the New York PoC.
function createPipeline(renderer, scene, camera) {
  const scenePass = pass(scene, camera);
  scenePass.renderTarget.storeMultisampledColorBuffer = false;
  const ssrFade = smoothstep(360.0, 180.0, positionView.z.negate());
  const maxSSRRoughness = 0.75;
  const sceneMRT = mrt({
    output: output,
    normal: normalView,
    metalRough: vec2(roughness.lessThan(maxSSRRoughness).select(metalness.mul(ssrFade), 0), roughness)
  });
  sceneMRT.setBlendMode('normal', new THREE.BlendMode(THREE.MaterialBlending));
  sceneMRT.setBlendMode('metalRough', new THREE.BlendMode(THREE.MaterialBlending));
  scenePass.setMRT(sceneMRT);

  const scenePassColor = scenePass.getTextureNode('output');
  const scenePassMetalRough = scenePass.getTextureNode('metalRough');
  const ssrPass = ssr(scenePassColor, scenePass.getTextureNode('depth'), scenePass.getTextureNode('normal'), {
    metalnessNode: scenePassMetalRough.r,
    roughnessNode: scenePassMetalRough.g,
    camera
  });
  ssrPass.resolutionScale = 0.5;
  ssrPass.blurQuality = 1;
  ssrPass.maxDistance.value = 42;
  ssrPass.thickness.value = 0.85;
  ssrPass.quality.value = 0.25;
  ssrPass.binaryRefine = true;
  ssrPass.intensity.value = 0.5;
  ssrPass.screenEdgeFadeBlack = true;

  // The roughness mip blur must not spread reflections back onto matte surfaces.
  const reflectionMask = scenePassMetalRough.r.greaterThan(0)
    .select(smoothstep(maxSSRRoughness, 0.55, scenePassMetalRough.g), 0);
  const colorGrade = createPostProcessing(renderer, scenePassColor, ssrPass.mul(reflectionMask));
  return { renderPipeline: new THREE.RenderPipeline(renderer, colorGrade.outputNode), colorGrade };
}

async function initApp() {
  const container = document.getElementById('canvas-container');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingStatus = document.getElementById('loading-status');
  const setStatus = (text) => {
    if (loadingStatus) loadingStatus.textContent = text;
  };
  // Let the status line paint before the next stage blocks the main thread.
  const breathe = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

  const { world, terrain } = await loadWorld(setStatus);
  setStatus('Sisseln wird ausgeschnitten …');
  await breathe();
  // sliceWorld clips to SLICE plus MARGIN; the terrain spans the same outer box, so nothing floats past its edge.
  const slice = sliceWorld(world);
  const box = expandBox(SLICE, MARGIN);

  const renderer = createRenderer(container);
  await renderer.init();

  const scene = new THREE.Scene();
  setStatus('Himmel und Licht …');
  await breathe();
  const lighting = new LightingSystem(scene, renderer);

  setStatus('Gelände, Rhein und Bäche …');
  await breathe();
  buildGround(scene, slice, terrain, box);

  setStatus('Strassen und Laternen …');
  await breathe();
  const roads = buildRoads(scene, slice, terrain);

  setStatus('Häuser und Hallen …');
  await breathe();
  const buildings = buildBuildings(scene, slice, terrain);

  setStatus('Wald …');
  await breathe();
  const trees = buildTrees(scene, slice, terrain);

  setStatus('Plattform und DSM-Kamin …');
  await breathe();
  buildLandmarks(scene, slice, terrain);

  setStatus('Auto …');
  await breathe();
  const car = createCar(scene, slice, terrain);
  const carLoaded = await car.load();
  const input = createDriveInput();

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.3, 6000);
  car.applyCamera(camera, 1);

  setStatus('Spiegelungen und Bloom …');
  await breathe();
  const { renderPipeline, colorGrade } = createPipeline(renderer, scene, camera);

  const look = { time: 'golden', wet: false };
  const elTime = document.getElementById('hud-time');
  const elWet = document.getElementById('hud-wet');
  const elFps = document.getElementById('hud-fps');
  const elSpeed = document.getElementById('hud-speed');
  const elCamera = document.getElementById('hud-camera');

  function applyLook() {
    const night = isNightPreset(look.time);
    lighting.applyPreset(look.time);
    colorGrade.applyPreset(look.time);
    cityUniforms.uRoadWetness.value = roadWetness(TIME_PRESETS[look.time].roadWetness, look.wet);
    roads.setNight(night);
    car.setNight(night);
    if (elTime) elTime.textContent = TIME_LABELS[look.time];
    if (elWet) elWet.textContent = look.wet ? 'nass' : 'trocken';
  }
  applyLook();
  if (elCamera) elCamera.textContent = car.cameraLabel;

  window.addEventListener('keydown', (event) => {
    const key = isLookKey(event);
    if (key === 'time') look.time = nextTimePreset(look.time);
    else if (key === 'wet') look.wet = !look.wet;
    else if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    else if (event.code === 'KeyH') return document.body.classList.toggle('clean-view');
    else if (event.code === 'KeyV') {
      if (elCamera) elCamera.textContent = car.cycleCamera();
      return;
    } else return;
    applyLook();
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // The PoC's test hook: the smoke test waits for `ready` and reads `state()`.
  window.__poc = {
    ready: false,
    state: () => ({
      time: look.time,
      wet: look.wet,
      roadWetness: cityUniforms.uRoadWetness.value,
      buildings: buildings.count,
      roads: slice.roads.length,
      lamps: roads.lampCount,
      trees: trees.count,
      car: carLoaded ? 'bulldog' : 'none',
      camera: car.cameraLabel,
      position: { x: car.root.position.x, y: car.root.position.y, z: car.root.position.z },
      speed: car.speed
    })
  };

  setStatus('Erstes Bild …');
  let lastTime = performance.now();
  let elapsed = 0;
  let frames = 0;
  let fpsTimer = 0;
  let warmedUp = false;

  renderer.setAnimationLoop((now) => {
    const rawDt = (now - lastTime) * 0.001;
    lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    elapsed += dt;

    car.update(dt, input);
    car.applyCamera(camera, dt);
    roads.update(elapsed, car.root.position);
    lighting.update(car.root.position);
    renderPipeline.render();

    if (!warmedUp) {
      warmedUp = true;
      window.__poc.ready = true;
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }

    frames++;
    fpsTimer += Math.max(0, rawDt);
    if (fpsTimer >= 0.25) {
      if (elFps) elFps.textContent = String(Math.round(frames / fpsTimer));
      if (elSpeed) elSpeed.textContent = String(Math.round(Math.abs(car.speed) * 3.6));
      frames = 0;
      fpsTimer = 0;
    }
  });
}

// Start the renderer only with a real WebGPU adapter: three's WebGPURenderer would silently fall back to WebGL2.
// `?webgl=1` is the test and comparison hook that takes the WebGL2 backend on purpose.
async function startWithGate() {
  if (wantsForcedWebGL(location.search) || (await hasWebGPU(navigator))) return initApp();
  document.getElementById('loading-overlay')?.classList.add('hidden');
  document.getElementById('no-webgpu')?.removeAttribute('hidden');
}

startWithGate();
