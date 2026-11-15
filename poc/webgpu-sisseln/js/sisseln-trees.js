// PoC Sisseln (#987): the forests of the slice. The world file holds forest polygons, not single trees, so trees
// are scattered inside the rings with a seeded generator and drawn as two instanced meshes.
import * as THREE from 'three/webgpu';
import { heightAt, scatterInRing } from './sisseln-geom.js';
import { createFoliageMaterial, createStructureMaterial } from './sisseln-materials.js';

// Trees per square metre of a forest ring's bounding box, and the budget for the whole slice.
const TREE_DENSITY = 0.006;
const TREE_BUDGET = 4000;
const SCATTER_SEED = 0x5155;

function treePositions(forests) {
  const trees = [];
  forests.forEach((forest, index) => {
    for (const point of scatterInRing(forest.ring, TREE_DENSITY, SCATTER_SEED + index)) trees.push(point);
  });
  // Thin the whole slice down to the budget evenly, so no single forest is dropped outright
  if (trees.length <= TREE_BUDGET) return trees;
  const stride = trees.length / TREE_BUDGET;
  return Array.from({ length: TREE_BUDGET }, (_, i) => trees[Math.floor(i * stride)]);
}

export function buildTrees(scene, slice, terrain) {
  const trees = treePositions(slice.forests);
  if (trees.length === 0) return { count: 0, group: null };

  const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.26, 1, 5);
  trunkGeometry.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeometry, createStructureMaterial(0x4a3a2a, 0.95), trees.length);
  trunks.castShadow = true;

  // Two stacked cones read as a crown from a car window and cost four triangles more than one
  const crownGeometry = new THREE.ConeGeometry(1, 1, 7);
  crownGeometry.translate(0, 0.5, 0);
  const crowns = new THREE.InstancedMesh(crownGeometry, createFoliageMaterial(), trees.length * 2);
  crowns.castShadow = true;

  const matrix = new THREE.Matrix4();
  const quiet = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  trees.forEach((tree, index) => {
    // A deterministic spread of sizes from the tree's own coordinates, so no extra random state is needed
    const spread = Math.abs(Math.sin(tree.x * 12.9898 + tree.z * 78.233) * 43758.5453) % 1;
    const height = 9 + spread * 11;
    const radius = height * (0.21 + spread * 0.08);
    const ground = heightAt(terrain, tree.x, tree.z);
    const trunk = height * 0.35;

    position.set(tree.x, ground, tree.z);
    scale.set(1, trunk, 1);
    trunks.setMatrixAt(index, matrix.compose(position, quiet, scale));

    position.set(tree.x, ground + trunk, tree.z);
    scale.set(radius, height * 0.5, radius);
    crowns.setMatrixAt(index * 2, matrix.compose(position, quiet, scale));

    position.set(tree.x, ground + trunk + height * 0.3, tree.z);
    scale.set(radius * 0.72, height * 0.42, radius * 0.72);
    crowns.setMatrixAt(index * 2 + 1, matrix.compose(position, quiet, scale));
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.name = 'trees';
  group.add(trunks, crowns);
  scene.add(group);
  return { count: trees.length, group };
}
