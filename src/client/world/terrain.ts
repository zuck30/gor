import * as THREE from "three";
import { fbm } from "./noise.js";

/**
 * One island mesh for the whole world: flat playable valley, an irregular
 * beach, then a slope into the sea. The playable square (1000 x 1000) sits
 * entirely on the flat green shelf.
 */
export function createIsland(anisotropy: number): THREE.Mesh {
  const size = 3600;
  const segments = 240;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);

  const grassA = new THREE.Color(0x5f9a43);
  const grassB = new THREE.Color(0x3f7534);
  const grassDark = new THREE.Color(0x2b5528);
  const sand = new THREE.Color(0xd9bd82);
  const sandWet = new THREE.Color(0xa88e60);
  const rock = new THREE.Color(0x776e61);
  const shallow = new THREE.Color(0x6f9b80);
  const deep = new THREE.Color(0x35595c);

  const colour = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const radius = Math.hypot(x, z);

    // An irregular coast so the island never reads as a perfect disc.
    const coast =
      772 +
      (fbm(x * 0.0032 + 17.3, z * 0.0032 - 8.1, 4) - 0.5) * 70;

    let y: number;
    if (radius < coast) {
      y = (fbm(x * 0.02, z * 0.02, 3) - 0.5) * 0.34;
    } else if (radius < coast + 90) {
      const t = (radius - coast) / 90;
      y = THREE.MathUtils.lerp(0, -2.8, t * t);
    } else {
      const t = Math.min(1, (radius - coast - 90) / 420);
      y = THREE.MathUtils.lerp(-2.8, -13, t * t);
    }
    position.setY(i, y);

    // Grass shelf → sand → shallow → deep sea floor.
    const patch = fbm(x * 0.0075 + 3.1, z * 0.0075 - 2.4, 4);
    const micro = fbm(x * 0.055, z * 0.055, 2);
    if (radius < coast - 26) {
      colour.copy(grassB).lerp(grassA, patch * 0.78 + micro * 0.22);
      if (patch < 0.42) {
        colour.lerp(grassDark, (0.42 - patch) * 1.9);
      }
      // Worn earth clearings.
      const dirt = fbm(x * 0.02 + 40, z * 0.02 + 12, 3);
      if (dirt > 0.66) {
        colour.lerp(rock, (dirt - 0.66) * 1.25);
      }
      const fleck = fbm(x * 0.31 + 8, z * 0.31 - 5, 1);
      colour.offsetHSL(0, 0, (fleck - 0.5) * 0.05);
    } else if (radius < coast + 100) {
      colour.copy(sand);
      const wet = THREE.MathUtils.smoothstep(radius, coast + 20, coast + 100);
      colour.lerp(sandWet, wet * 0.7);
    } else {
      const t = Math.min(1, (radius - coast - 100) / 420);
      colour.copy(sandWet).lerp(shallow, Math.min(1, t * 4));
      if (t > 0.25) {
        colour.lerp(deep, (t - 0.25) / 0.75);
      }
    }

    colors[i * 3] = colour.r;
    colors[i * 3 + 1] = colour.g;
    colors[i * 3 + 2] = colour.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

/**
 * Low ruined kerbstones mark the server's square boundary without walling off
 * the sea view. Purely decorative - the authoritative clamp is in shared code.
 */
export function createBoundaryStones(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0x6f6a5d,
    roughness: 0.95,
    flatShading: true,
  });
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const edge = 494;
  const count = 120;

  const stones = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  let index = 0;
  for (let side = 0; side < 4; side++) {
    const steps = 30;
    for (let i = 0; i < steps; i++) {
      const along = -edge + (i / (steps - 1)) * edge * 2 + (Math.random() - 0.5) * 12;
      if (side === 0) pos.set(along, 0, -edge);
      else if (side === 1) pos.set(along, 0, edge);
      else if (side === 2) pos.set(-edge, 0, along);
      else pos.set(edge, 0, along);

      const h = 0.8 + Math.random() * 2.4;
      pos.y = h * 0.35;
      scl.set(1.2 + Math.random() * 1.8, h, 1.2 + Math.random() * 1.6);
      quat.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3));
      matrix.compose(pos, quat, scl);
      stones.setMatrixAt(index++, matrix);
    }
  }
  stones.count = index;
  stones.castShadow = true;
  stones.receiveShadow = true;
  stones.frustumCulled = false;
  group.add(stones);
  return group;
}
