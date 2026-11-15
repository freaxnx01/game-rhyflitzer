// PoC Sisseln (#987): builds Sisseln out of the game's own map data and renders it with three's WebGPURenderer,
// using the look of the New York PoC (poc/webgpu/, MIT (c) Mr.doob). The game itself is untouched.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, positionView, metalness, roughness, vec2, smoothstep } from 'three/tsl';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { parseMmh } from '../../../worlds.js';
import { SLICE, MARGIN, expandBox, sliceWorld } from './sisseln-slice.js';
import { heightAt } from './sisseln-geom.js';
import { LightingSystem, TIME_PRESETS } from './lighting.js';
import { createPostProcessing } from './post-processing.js';
import { cityUniforms } from './sisseln-materials.js';
import { buildGround } from './sisseln-ground.js';
import { hasWebGPU, wantsForcedWebGL } from './poc-gate.js';
import { nextTimePreset, roadWetness, isLookKey } from './poc-look.js';

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
  const box = expandBox(SLICE, MARGIN);
  const slice = sliceWorld(world, box);

  const renderer = createRenderer(container);
  await renderer.init();

  const scene = new THREE.Scene();
  setStatus('Himmel und Licht …');
  await breathe();
  const lighting = new LightingSystem(scene, renderer);

  setStatus('Gelände, Rhein und Bäche …');
  await breathe();
  buildGround(scene, slice, terrain, box);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.3, 6000);
  const plattform = slice.landmarks.plattform || { x: 0, z: 0 };
  const ground = heightAt(terrain, plattform.x, plattform.z);
  camera.position.set(plattform.x - 90, ground + 55, plattform.z + 120);
  camera.lookAt(plattform.x, ground + 8, plattform.z);

  setStatus('Spiegelungen und Bloom …');
  await breathe();
  const { renderPipeline, colorGrade } = createPipeline(renderer, scene, camera);

  const look = { time: 'golden', wet: false };
  const elTime = document.getElementById('hud-time');
  const elWet = document.getElementById('hud-wet');
  const elFps = document.getElementById('hud-fps');

  function applyLook() {
    lighting.applyPreset(look.time);
    colorGrade.applyPreset(look.time);
    cityUniforms.uRoadWetness.value = roadWetness(TIME_PRESETS[look.time].roadWetness, look.wet);
    if (elTime) elTime.textContent = TIME_LABELS[look.time];
    if (elWet) elWet.textContent = look.wet ? 'nass' : 'trocken';
  }
  applyLook();

  window.addEventListener('keydown', (event) => {
    const key = isLookKey(event);
    if (key === 'time') look.time = nextTimePreset(look.time);
    else if (key === 'wet') look.wet = !look.wet;
    else if (event.code === 'KeyH' && !event.repeat) document.body.classList.toggle('clean-view');
    else return;
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
      buildings: slice.buildings.length,
      roads: slice.roads.length
    })
  };

  setStatus('Erstes Bild …');
  let lastTime = performance.now();
  let frames = 0;
  let fpsTimer = 0;
  let warmedUp = false;

  renderer.setAnimationLoop((now) => {
    const rawDt = (now - lastTime) * 0.001;
    lastTime = now;

    lighting.update(camera.position);
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
