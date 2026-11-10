// PoC: loads assets/bulldog.glb onto the demo car entity in place of the taxi meshes.
import * as THREE from 'three/webgpu';
import { CAR_URL, TAXI_LENGTH_M, fitScale, lampMaterials } from './poc-car.js';

// The model's front points along +x, the demo car's along +z. Rotating by angle t about y sends x to (cos t, 0, -sin t),
// so t = -PI/2 maps model +x onto +z.
const FORWARD_TURN_Y = -Math.PI / 2;

function hideTaxi(entity) {
  for (const child of entity.chassisPivot.children) {
    if (child.isMesh) child.visible = false; // body, door decals, plates; SpotLights and targets stay
  }
  for (const wheel of entity.wheels) wheel.tire.visible = false;
}

function collectMaterials(model) {
  const materials = [];
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    materials.push(...[].concat(node.material));
  });
  return materials;
}

function fitModel(model) {
  model.rotation.y = FORWARD_TURN_Y;
  model.updateMatrixWorld(true);
  const length = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).z;
  model.scale.setScalar(fitScale(length, TAXI_LENGTH_M));
  model.updateMatrixWorld(true);
  model.position.y -= new THREE.Box3().setFromObject(model).min.y;
}

export async function attachGltfBody(entity, loader) {
  try {
    const gltf = await loader.loadAsync(CAR_URL);
    fitModel(gltf.scene);
    const lamps = lampMaterials(collectMaterials(gltf.scene));
    hideTaxi(entity);
    entity.chassisPivot.add(gltf.scene);
    return { lamps };
  } catch (error) {
    console.warn(`PoC: could not load ${CAR_URL}, keeping the taxi`, error);
    return null;
  }
}
