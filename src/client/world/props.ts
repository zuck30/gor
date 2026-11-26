import * as THREE from "three";
import { fbm, mulberry32 } from "./noise.js";
import {
  makeBannerTexture,
  makeBladeTexture,
  makeGlowTexture,
  makeRuneTexture,
  makeStoneTexture,
} from "./textures.js";

export interface PropsSystem {
  group: THREE.Group;
  brazierPositions: THREE.Vector3[];
  update(dt: number, time: number): void;
}

function insidePlayable(x: number, z: number, margin = 6): boolean {
  return Math.abs(x) < 500 - margin && Math.abs(z) < 500 - margin;
}

export function createProps(anisotropy: number): PropsSystem {
  const group = new THREE.Group();
  const rng = mulberry32(90210);
  const stone = makeStoneTexture(anisotropy);
  stone.repeat.set(4, 4);
  const stoneMaterial = new THREE.MeshStandardMaterial({
    map: stone,
    color: 0xb4ab99,
    roughness: 0.95,
    flatShading: true,
  });
  const darkStoneMaterial = new THREE.MeshStandardMaterial({
    color: 0x6c665a,
    roughness: 1,
    flatShading: true,
  });

  // ------------------------------------------------------------- forest ring
  // Trees live outside the playable square, so nobody ever walks through a
  // trunk: the valley is framed by a dense, unreachable jungle.
  const treeSpots: Array<{ x: number; z: number; scale: number }> = [];
  for (let i = 0; i < 420; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 505 + Math.sqrt(rng()) * 250;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (insidePlayable(x, z, 4)) { continue; }
    if (Math.hypot(x, z) > 755) { continue; }
    if (fbm(x * 0.008, z * 0.008, 3) < 0.33) { continue; }
    treeSpots.push({ x, z, scale: 0.75 + rng() * 0.9 });
  }

  const pines = treeSpots.filter((_, i) => i % 3 !== 0);
  const broadleaf = treeSpots.filter((_, i) => i % 3 === 0);

  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b4a32,
    roughness: 1,
    flatShading: true,
  });
  const pineMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    flatShading: true,
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    flatShading: true,
  });

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  // Pines: trunk + three stacked cones, all instanced.
  const pineTrunkGeometry = new THREE.CylinderGeometry(0.55, 0.95, 11, 6);
  const pineTrunks = new THREE.InstancedMesh(pineTrunkGeometry, trunkMaterial, pines.length);
  const pineLayers = [
    { geometry: new THREE.ConeGeometry(9.5, 16, 7), y: 12.5, colorA: 0x2f6b3c, colorB: 0x3f7f42 },
    { geometry: new THREE.ConeGeometry(7.2, 13, 7), y: 20, colorA: 0x376f3a, colorB: 0x4a8c45 },
    { geometry: new THREE.ConeGeometry(4.8, 11, 7), y: 26.5, colorA: 0x41793f, colorB: 0x549b48 },
  ] as const;
  const pineMeshes = pineLayers.map(
    (layer) => new THREE.InstancedMesh(layer.geometry, pineMaterial.clone(), pines.length)
  );

  pines.forEach((tree, i) => {
    dummy.position.set(tree.x, 5.5 * tree.scale, tree.z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.setScalar(tree.scale);
    dummy.updateMatrix();
    pineTrunks.setMatrixAt(i, dummy.matrix);

    pineLayers.forEach((layer, l) => {
      dummy.position.set(tree.x, layer.y * tree.scale, tree.z);
      dummy.rotation.set(0, rng() * Math.PI, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      pineMeshes[l].setMatrixAt(i, dummy.matrix);
      tint.setHex(layer.colorA).lerp(new THREE.Color(layer.colorB), rng());
      pineMeshes[l].setColorAt(i, tint);
    });
  });
  pineTrunks.castShadow = true;
  pineTrunks.receiveShadow = true;
  for (const mesh of pineMeshes) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (mesh.instanceColor) { mesh.instanceColor.needsUpdate = true; }
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  pineTrunks.frustumCulled = false;
  group.add(pineTrunks);

  // Broadleaf: chunky octahedral canopies.
  const leafTrunkGeometry = new THREE.CylinderGeometry(0.7, 1.15, 14, 6);
  const leafTrunks = new THREE.InstancedMesh(leafTrunkGeometry, trunkMaterial, broadleaf.length);
  const blobGeometry = new THREE.IcosahedronGeometry(6.5, 0);
  const blobs = new THREE.InstancedMesh(blobGeometry, leafMaterial.clone(), broadleaf.length * 5);

  let blobIndex = 0;
  broadleaf.forEach((tree, i) => {
    dummy.position.set(tree.x, 7 * tree.scale, tree.z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.setScalar(tree.scale);
    dummy.updateMatrix();
    leafTrunks.setMatrixAt(i, dummy.matrix);

    for (let b = 0; b < 5; b++) {
      dummy.position.set(
        tree.x + (rng() - 0.5) * 12 * tree.scale,
        (15 + rng() * 7) * tree.scale,
        tree.z + (rng() - 0.5) * 12 * tree.scale
      );
      dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      dummy.scale.setScalar(tree.scale * (0.65 + rng() * 0.55));
      dummy.updateMatrix();
      blobs.setMatrixAt(blobIndex, dummy.matrix);
      tint.setHSL(0.28 + rng() * 0.05, 0.42 + rng() * 0.15, 0.36 + rng() * 0.14);
      blobs.setColorAt(blobIndex, tint);
      blobIndex++;
    }
  });
  leafTrunks.castShadow = true;
  leafTrunks.receiveShadow = true;
  leafTrunks.frustumCulled = false;
  blobs.castShadow = true;
  blobs.receiveShadow = true;
  blobs.frustumCulled = false;
  if (blobs.instanceColor) { blobs.instanceColor.needsUpdate = true; }
  group.add(leafTrunks, blobs);

  // ------------------------------------------------------------------ rocks
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    flatShading: true,
  });
  const rockCount = 190;
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);
  let rockIndex = 0;
  for (let i = 0; i < rockCount; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 90 + Math.sqrt(rng()) * 650;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const outside = !insidePlayable(x, z, 2);
    const scale = outside ? 3 + rng() * 9 : 0.7 + rng() * 2.2;
    dummy.position.set(x, scale * 0.35 - 0.2, z);
    dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    dummy.scale.set(scale * (0.8 + rng() * 0.7), scale, scale * (0.8 + rng() * 0.7));
    dummy.updateMatrix();
    rocks.setMatrixAt(rockIndex++, dummy.matrix);
    tint.setHex(0x958b78).offsetHSL(0, 0, (rng() - 0.5) * 0.12);
    rocks.setColorAt(rockIndex - 1, tint);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.frustumCulled = false;
  if (rocks.instanceColor) { rocks.instanceColor.needsUpdate = true; }
  group.add(rocks);

  // Sea stacks: tall silhouettes at the coast, outside the play area.
  const stackMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d7464,
    roughness: 1,
    flatShading: true,
  });
  for (let s = 0; s < 11; s++) {
    const angle = (s / 11) * Math.PI * 2 + rng() * 0.3;
    const radius = 740 + rng() * 60;
    const baseX = Math.cos(angle) * radius;
    const baseZ = Math.sin(angle) * radius;
    const height = 28 + rng() * 70;
    const pieces = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < pieces; p++) {
      const scale = 8 + rng() * 16;
      const mesh = new THREE.Mesh(rockGeometry, stackMaterial);
      mesh.position.set(
        baseX + (rng() - 0.5) * 26,
        -2 + (p / pieces) * height,
        baseZ + (rng() - 0.5) * 26
      );
      mesh.scale.set(scale * (0.7 + rng() * 0.5), scale * (1.2 + rng() * 0.9), scale * (0.7 + rng() * 0.5));
      mesh.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // ---------------------------------------------------------------- bushes
  const bushGeometry = new THREE.IcosahedronGeometry(1, 0);
  const bushMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    flatShading: true,
  });
  const bushCount = 260;
  const bushes = new THREE.InstancedMesh(bushGeometry, bushMaterial, bushCount);
  for (let i = 0; i < bushCount; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 110 + Math.sqrt(rng()) * 630;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const scale = 1.2 + rng() * 3.2;
    dummy.position.set(x, scale * 0.6, z);
    dummy.rotation.set(rng() * 2, rng() * 3, rng() * 2);
    dummy.scale.set(scale * (1 + rng() * 0.5), scale * (0.7 + rng() * 0.4), scale * (1 + rng() * 0.5));
    dummy.updateMatrix();
    bushes.setMatrixAt(i, dummy.matrix);
    tint.setHSL(0.27 + rng() * 0.06, 0.4 + rng() * 0.2, 0.3 + rng() * 0.12);
    bushes.setColorAt(i, tint);
  }
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  bushes.frustumCulled = false;
  if (bushes.instanceColor) { bushes.instanceColor.needsUpdate = true; }
  group.add(bushes);

  // ------------------------------------------------------------------ grass
  const bladeTexture = makeBladeTexture(anisotropy);
  const tuftGeometry = new THREE.PlaneGeometry(1, 1);
  const tuftMaterial = new THREE.MeshStandardMaterial({
    map: bladeTexture,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    roughness: 1,
    color: 0xffffff,
  });
  const tuftCount = 13000;
  const tufts = new THREE.InstancedMesh(tuftGeometry, tuftMaterial, tuftCount * 2);
  let tuftIndex = 0;
  for (let i = 0; i < tuftCount; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * 730;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.hypot(x, z) < 95) { continue; }
    const scale = 1.1 + rng() * 2.4;
    const yaw = rng() * Math.PI;
    for (let cross = 0; cross < 2; cross++) {
      dummy.position.set(x, scale * 0.46, z);
      dummy.rotation.set(0, yaw + cross * (Math.PI / 2), 0);
      dummy.scale.set(scale * (0.7 + rng() * 0.6), scale, 1);
      dummy.updateMatrix();
      tufts.setMatrixAt(tuftIndex, dummy.matrix);
      tint.setHSL(0.25 + rng() * 0.05, 0.5 + rng() * 0.16, 0.27 + rng() * 0.13);
      tufts.setColorAt(tuftIndex, tint);
      tuftIndex++;
    }
  }
  tufts.count = tuftIndex;
  tufts.receiveShadow = false;
  tufts.castShadow = false;
  tufts.frustumCulled = false;
  if (tufts.instanceColor) { tufts.instanceColor.needsUpdate = true; }
  group.add(tufts);

  // ------------------------------------------------------------------ plaza
  const plazaTexture = makeStoneTexture(anisotropy);
  plazaTexture.repeat.set(7, 7);
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(84, 64),
    new THREE.MeshStandardMaterial({
      map: plazaTexture,
      color: 0xc9bfa9,
      roughness: 0.9,
      flatShading: false,
    })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.04;
  plaza.receiveShadow = true;
  group.add(plaza);

  const runes = new THREE.Mesh(
    new THREE.CircleGeometry(78, 64),
    new THREE.MeshBasicMaterial({
      map: makeRuneTexture(anisotropy),
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  runes.rotation.x = -Math.PI / 2;
  runes.position.y = 0.08;
  group.add(runes);

  // A ring of broken pillars frames the plaza.
  const pillarCount = 12;
  for (let i = 0; i < pillarCount; i++) {
    const angle = (i / pillarCount) * Math.PI * 2;
    const x = Math.cos(angle) * 68;
    const z = Math.sin(angle) * 68;
    const height = i % 4 === 0 ? 12 + rng() * 8 : 26 + rng() * 20;
    const broken = i % 5 === 2;

    const base = new THREE.Mesh(new THREE.BoxGeometry(9, 2.2, 9), darkStoneMaterial);
    base.position.set(x, 1.1, z);
    base.rotation.y = angle;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 4, height, 8),
      stoneMaterial
    );
    column.position.set(x, 2.2 + height / 2, z);
    column.castShadow = true;
    column.receiveShadow = true;
    group.add(column);

    if (!broken) {
      const capital = new THREE.Mesh(new THREE.BoxGeometry(9.5, 2.6, 9.5), darkStoneMaterial);
      capital.position.set(x, 2.2 + height + 1.3, z);
      capital.rotation.y = angle;
      capital.castShadow = true;
      group.add(capital);
    }

    // Two half-fallen lintels suggest the roof that used to be here.
    if (i === 1 || i === 7) {
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(18, 2.2, 4.4), stoneMaterial);
      lintel.position.set(
        Math.cos(angle + Math.PI / pillarCount) * 68,
        2.2 + height + 2.4,
        Math.sin(angle + Math.PI / pillarCount) * 68
      );
      lintel.rotation.y = -angle;
      lintel.rotation.z = 0.06;
      lintel.castShadow = true;
      group.add(lintel);
    }
  }

  // The storm engine: a levitating shard with slow orbital rings.
  const shardMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd98a,
    emissive: 0xffb347,
    emissiveIntensity: 1.5,
    roughness: 0.35,
    metalness: 0.4,
    flatShading: true,
  });
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(7.5, 0), shardMaterial);
  shard.position.set(0, 34, 0);
  group.add(shard);

  const shardGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: 0xffc45e,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  shardGlow.scale.setScalar(24);
  shardGlow.position.copy(shard.position);
  group.add(shardGlow);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 7, 34, 18, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  beam.position.set(0, 17, 0);
  group.add(beam);

  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(15 + i * 4, 0.5, 6, 64),
      new THREE.MeshBasicMaterial({
        color: i === 0 ? 0xffd27a : 0x8fe9ff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ring.position.copy(shard.position);
    ring.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
    group.add(ring);
    rings.push(ring);
  }


  // -------------------------------------------------- landmarks in the valley
  // Ruins, bones and ponds break up the plain in every direction, so the view
  // is interesting no matter which way a player runs.

  const boneMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9cfb4,
    roughness: 0.85,
    flatShading: true,
  });

  const landmarkSpots: Array<[number, number, number]> = [];
  for (let i = 0; i < 5; i++) {
    const angle = 0.45 + (i / 5) * Math.PI * 2;
    const radius = 315 + rng() * 105;
    landmarkSpots.push([Math.cos(angle) * radius, Math.sin(angle) * radius, angle]);
  }

  for (const [lx, lz, angle] of landmarkSpots) {
    const tower = new THREE.Group();
    tower.position.set(lx, 0, lz);
    tower.rotation.y = -angle + 0.3;

    for (const [sx, sz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(3.2, 21, 3.2), stoneMaterial);
      leg.position.set(sx, 10.5, sz);
      leg.rotation.y = rng() * 0.2;
      leg.castShadow = true;
      leg.receiveShadow = true;
      tower.add(leg);
    }

    const deck = new THREE.Mesh(new THREE.BoxGeometry(20, 1.8, 20), stoneMaterial);
    deck.position.y = 21.8;
    deck.castShadow = true;
    deck.receiveShadow = true;
    tower.add(deck);

    for (let b = 0; b < 10; b++) {
      const side = b % 4;
      const along = -8 + (b % 3) * 8;
      const battlement = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 2), darkStoneMaterial);
      if (side === 0) battlement.position.set(along, 24, -9);
      else if (side === 1) battlement.position.set(along, 24, 9);
      else if (side === 2) battlement.position.set(-9, 24, along);
      else battlement.position.set(9, 24, along);
      battlement.rotation.y = side < 2 ? 0 : Math.PI / 2;
      battlement.castShadow = true;
      tower.add(battlement);
    }

    // A broken stair spirals up the outside.
    for (let step = 0; step < 6; step++) {
      const stair = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 7), stoneMaterial);
      stair.position.set(-12 + step * 0.8, 3.5 + step * 2.6, 2 + step * 2.2);
      stair.rotation.y = 0.4;
      stair.castShadow = true;
      tower.add(stair);
    }

    group.add(tower);
  }

  // Three broken archways.
  for (let i = 0; i < 3; i++) {
    const angle = 1.35 + (i / 3) * Math.PI * 2;
    const radius = 255 + rng() * 60;
    const ax = Math.cos(angle) * radius;
    const az = Math.sin(angle) * radius;
    const arch = new THREE.Group();
    arch.position.set(ax, 0, az);
    arch.rotation.y = -angle;
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(4, 18, 4.5), stoneMaterial);
      leg.position.set(side * 7, 9, 0);
      leg.castShadow = true;
      leg.receiveShadow = true;
      arch.add(leg);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(21, 2.4, 5), stoneMaterial);
    lintel.position.y = 18.6;
    lintel.rotation.z = 0.03;
    lintel.castShadow = true;
    arch.add(lintel);
    group.add(arch);
  }

  // A leviathan skeleton half-buried in the grass.
  const skeleton = new THREE.Group();
  {
    const angle = 2.4;
    const radius = 285;
    skeleton.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    skeleton.rotation.y = -angle - 0.6;

    for (let i = 0; i < 8; i++) {
      const vertebra = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 6.6, 6), boneMaterial);
      vertebra.rotation.z = Math.PI / 2;
      vertebra.position.set(-26 + i * 6, 4.2 + Math.sin(i * 0.6) * 0.8, 0);
      vertebra.castShadow = true;
      skeleton.add(vertebra);
    }

    for (let i = 0; i < 7; i++) {
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(9.5 - i * 0.5, 0.8, 5, 14, Math.PI),
        boneMaterial
      );
      rib.rotation.y = Math.PI / 2;
      rib.position.set(-22 + i * 5.4, 4.4, 0);
      rib.castShadow = true;
      skeleton.add(rib);
    }

    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(5.2, 1), boneMaterial);
    skull.position.set(32, 6.4, 0);
    skull.scale.set(1.25, 0.9, 1);
    skull.castShadow = true;
    skeleton.add(skull);

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(8, 2.2, 5), boneMaterial);
    jaw.position.set(34, 2.4, 0);
    jaw.rotation.z = -0.12;
    jaw.castShadow = true;
    skeleton.add(jaw);

    for (const side of [-1, 1]) {
      const socket = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x171410 })
      );
      socket.position.set(35.6, 7.2, side * 2.3);
      skeleton.add(socket);
    }

    for (let i = 0; i < 5; i++) {
      const tail = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2 - i * 0.18, 1.4 - i * 0.18, 6, 6),
        boneMaterial
      );
      tail.rotation.z = Math.PI / 2;
      tail.position.set(-32 - i * 5.5, 3.4 - i * 0.25, 0);
      tail.castShadow = true;
      skeleton.add(tail);
    }
  }
  group.add(skeleton);

  // Shallow ponds with lily pads and a stone lip.
  const pondMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e8a8a,
    roughness: 0.18,
    metalness: 0.1,
  });
  const lilyMaterial = new THREE.MeshStandardMaterial({
    color: 0x4f9a45,
    roughness: 0.9,
    flatShading: true,
  });
  for (let i = 0; i < 2; i++) {
    const angle = 3.9 + i * 2.4;
    const radius = 330 + rng() * 50;
    const px = Math.cos(angle) * radius;
    const pz = Math.sin(angle) * radius;
    const pondRadius = 20 + rng() * 8;
    const pond = new THREE.Mesh(new THREE.CircleGeometry(pondRadius, 32), pondMaterial);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(px, 0.07, pz);
    pond.receiveShadow = true;
    group.add(pond);

    for (let lily = 0; lily < 7; lily++) {
      const lr = rng() * pondRadius * 0.75;
      const la = rng() * Math.PI * 2;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(1.8 + rng() * 1.4, 8), lilyMaterial);
      pad.rotation.x = -Math.PI / 2;
      pad.rotation.z = rng() * Math.PI;
      pad.position.set(px + Math.cos(la) * lr, 0.1, pz + Math.sin(la) * lr);
      group.add(pad);
    }
  }

  // Three drop pods, nose-down and glowing.
  const podMaterial = new THREE.MeshStandardMaterial({
    color: 0x8f97a1,
    roughness: 0.45,
    metalness: 0.6,
    flatShading: true,
  });
  const podGlow = new THREE.MeshStandardMaterial({
    color: 0x63e6d5,
    emissive: 0x35d8c4,
    emissiveIntensity: 2,
    roughness: 0.3,
  });
  for (let i = 0; i < 3; i++) {
    const angle = 5.2 + (i / 3) * Math.PI * 2;
    const radius = 225 + rng() * 45;
    const px = Math.cos(angle) * radius;
    const pz = Math.sin(angle) * radius;
    const pod = new THREE.Group();
    pod.position.set(px, 4.2, pz);
    pod.rotation.set(0.35, angle, 1.9 + rng() * 0.3);

    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(3.6, 8, 6, 14), podMaterial);
    hull.castShadow = true;
    pod.add(hull);

    const nose = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.32, 6, 24), podGlow);
    nose.position.y = 7.4;
    nose.rotation.x = Math.PI / 2;
    pod.add(nose);

    for (let leg = 0; leg < 3; leg++) {
      const a = (leg / 3) * Math.PI * 2;
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 8, 5), podMaterial);
      strut.position.set(Math.cos(a) * 3.4, -4.4, Math.sin(a) * 3.4);
      strut.rotation.z = Math.cos(a) * 0.5;
      strut.rotation.x = Math.sin(a) * 0.5;
      pod.add(strut);
    }
    group.add(pod);
  }


  // ---------------------------------------------------------- the world tree
  // A colossal silhouette beyond the north coast: the trunk is the backdrop the
  // plaza was built beneath.
  const barkMaterial = new THREE.MeshStandardMaterial({
    color: 0x3d2f26,
    roughness: 1,
    flatShading: true,
  });
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f5a35,
    roughness: 1,
    flatShading: true,
  });
  const worldTree = new THREE.Group();
  worldTree.position.set(250, -2, -820);
  {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(18, 44, 430, 11),
      barkMaterial
    );
    trunk.position.y = 215;
    trunk.castShadow = false;
    worldTree.add(trunk);

    const up = new THREE.Vector3(0, 1, 0);
    const branch = (start: THREE.Vector3, end: THREE.Vector3, radius: number) => {
      const dir = end.clone().sub(start);
      const length = dir.length();
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.55, radius, length, 6),
        barkMaterial
      );
      mesh.position.copy(start).add(end).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(up, dir.normalize());
      worldTree.add(mesh);
      return end;
    };

    const tips: THREE.Vector3[] = [];
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + rng() * 0.5;
      const start = new THREE.Vector3(0, 210 + rng() * 120, 0);
      const middle = new THREE.Vector3(
        Math.cos(angle) * (45 + rng() * 40),
        start.y + 60 + rng() * 50,
        Math.sin(angle) * (45 + rng() * 40)
      );
      const tip = new THREE.Vector3(
        Math.cos(angle) * (105 + rng() * 60),
        middle.y + 55 + rng() * 55,
        Math.sin(angle) * (105 + rng() * 60)
      );
      branch(start, middle, 12 + rng() * 5);
      branch(middle, tip, 7 + rng() * 4);
      tips.push(tip);
    }

    for (const tip of tips) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), canopyMaterial);
      crown.position.copy(tip);
      crown.scale.set(40 + rng() * 30, 26 + rng() * 22, 40 + rng() * 30);
      crown.rotation.set(rng() * 2, rng() * 3, rng() * 2);
      worldTree.add(crown);
    }

    const topCrown = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), canopyMaterial);
    topCrown.position.set(0, 400, 0);
    topCrown.scale.set(80, 55, 80);
    worldTree.add(topCrown);
  }
  group.add(worldTree);

  // ------------------------------------------------------- floating islands
  const isles: Array<{ group: THREE.Group; baseY: number; phase: number }> = [];
  const isleGrass = new THREE.MeshStandardMaterial({
    color: 0x4f9a45,
    roughness: 1,
    flatShading: true,
  });
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + rng() * 0.5;
    const radius = 250 + rng() * 300;
    const size = 7 + rng() * 9;
    const isle = new THREE.Group();
    isle.position.set(Math.cos(angle) * radius, 60 + rng() * 85, Math.sin(angle) * radius);
    isle.rotation.y = rng() * Math.PI * 2;

    const base = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), stackMaterial);
    base.scale.set(size * 1.35, size * 0.9, size * 1.15);
    base.position.y = -size * 0.45;
    base.rotation.set(rng() * 2, rng() * 3, rng() * 2);
    base.castShadow = false;
    isle.add(base);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(size * 1.0, size * 0.82, size * 0.3, 9), isleGrass);
    cap.position.y = size * 0.12;
    cap.receiveShadow = false;
    isle.add(cap);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.09, size * 0.12, size * 0.8, 5), trunkMaterial);
    trunk.position.y = size * 0.55;
    isle.add(trunk);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(size * 0.55, size * 1.1, 6), isleGrass);
    canopy.position.y = size * 1.2;
    isle.add(canopy);

    // Roots hanging under the rock.
    for (let r = 0; r < 3; r++) {
      const root = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.06, size * 0.02, size * (0.7 + rng() * 0.8), 4), trunkMaterial);
      root.position.set((rng() - 0.5) * size, -size * (0.9 + rng() * 0.4), (rng() - 0.5) * size);
      root.rotation.z = (rng() - 0.5) * 0.6;
      isle.add(root);
    }

    group.add(isle);
    isles.push({ group: isle, baseY: isle.position.y, phase: rng() * Math.PI * 2 });
  }

  // The relic over the plaza is a real light, not only an emissive prop.
  const shardLight = new THREE.PointLight(0xffb347, 380, 280, 2);
  shardLight.position.set(0, 36, 0);
  group.add(shardLight);

  // ---------------------------------------------------------------- braziers
  const brazierPositions: THREE.Vector3[] = [];
  const flames: THREE.Mesh[] = [];
  const lights: THREE.PointLight[] = [];
  const fireMaterial = new THREE.MeshBasicMaterial({
    color: 0xff9a3d,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(angle) * 76;
    const z = Math.sin(angle) * 76;

    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 1.2, 1.9, 10), darkStoneMaterial);
    bowl.position.set(x, 2.6, z);
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    group.add(bowl);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 2.6, 6), darkStoneMaterial);
    stem.position.set(x, 1.3, z);
    group.add(stem);

    const flame = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.6, 7), fireMaterial);
    flame.position.set(x, 5.2, z);
    group.add(flame);
    flames.push(flame);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        color: 0xffa347,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.scale.setScalar(14);
    glow.position.set(x, 5.4, z);
    group.add(glow);

    if (i % 2 === 0) {
      const light = new THREE.PointLight(0xffa64d, 170, 120, 2);
      light.position.set(x, 6.5, z);
      group.add(light);
      lights.push(light);
    }

    brazierPositions.push(new THREE.Vector3(x, 6, z));
  }

  // ---------------------------------------------------------------- banners
  const bannerTexture = makeBannerTexture(anisotropy);
  const bannerGeometry = new THREE.PlaneGeometry(7, 12, 6, 12);
  const banners: Array<{ mesh: THREE.Mesh; base: Float32Array }> = [];
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3a2b, roughness: 1 });

  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(angle) * 88;
    const z = Math.sin(angle) * 88;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 19, 6), poleMaterial);
    pole.position.set(x, 9.5, z);
    pole.castShadow = true;
    group.add(pole);

    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 0.4), poleMaterial);
    crossbar.position.set(x, 18.4, z);
    crossbar.rotation.y = -angle;
    group.add(crossbar);

    const mesh = new THREE.Mesh(
      bannerGeometry,
      new THREE.MeshStandardMaterial({
        map: bannerTexture,
        side: THREE.DoubleSide,
        roughness: 1,
      })
    );
    mesh.position.set(x, 12.2, z);
    mesh.rotation.y = -angle + Math.PI / 2;
    mesh.castShadow = true;
    group.add(mesh);
    banners.push({
      mesh,
      base: Float32Array.from(bannerGeometry.attributes.position.array),
    });
  }

  // ------------------------------------------------------- crates & barrels
  const crateMaterial = new THREE.MeshStandardMaterial({
    color: 0x9b7446,
    roughness: 1,
    flatShading: true,
  });
  const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 3, 3), crateMaterial, 26);
  for (let i = 0; i < 26; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 96 + rng() * 60;
    dummy.position.set(Math.cos(angle) * radius, 1.5, Math.sin(angle) * radius);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.setScalar(0.7 + rng() * 0.7);
    dummy.updateMatrix();
    crates.setMatrixAt(i, dummy.matrix);
  }
  crates.castShadow = true;
  crates.receiveShadow = true;
  crates.frustumCulled = false;
  group.add(crates);

  const barrelMaterial = new THREE.MeshStandardMaterial({
    color: 0x7a5a3a,
    roughness: 1,
    flatShading: true,
  });
  const barrels = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1.5, 1.5, 3.4, 9),
    barrelMaterial,
    18
  );
  for (let i = 0; i < 18; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 100 + rng() * 55;
    dummy.position.set(Math.cos(angle) * radius, 1.7, Math.sin(angle) * radius);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.setScalar(0.7 + rng() * 0.5);
    dummy.updateMatrix();
    barrels.setMatrixAt(i, dummy.matrix);
  }
  barrels.castShadow = true;
  barrels.receiveShadow = true;
  barrels.frustumCulled = false;
  group.add(barrels);

  let time = 0;
  const bannerPositions = bannerGeometry.attributes.position as THREE.BufferAttribute;

  return {
    group,
    brazierPositions,
    update(dt, elapsed) {
      time = elapsed;

      // Fire flicker.
      flames.forEach((flame, i) => {
        const flicker = 0.82 + Math.sin(time * 11 + i * 2.1) * 0.12 + Math.sin(time * 23 + i) * 0.06;
        flame.scale.set(flicker, 0.85 + flicker * 0.3, flicker);
        flame.rotation.y += dt * 1.4;
      });
      lights.forEach((light, i) => {
        light.intensity = 150 + Math.sin(time * 13 + i * 3) * 40 + Math.sin(time * 31 + i) * 18;
      });

      // Shard and its orbital rings.
      shard.position.y = 34 + Math.sin(time * 0.9) * 1.4;
      shard.rotation.y += dt * 0.4;
      shard.rotation.x = Math.sin(time * 0.35) * 0.2;
      shardGlow.position.y = shard.position.y;
      rings.forEach((ring, i) => {
        ring.position.y = shard.position.y;
        const speed = 0.16 + i * 0.09;
        ring.rotation.x += dt * speed;
        ring.rotation.y += dt * (speed * 0.7);
        ring.rotation.z += dt * (speed * 0.4);
      });
      beam.material.opacity = 0.13 + Math.sin(time * 2.4) * 0.03;
      runes.rotation.z = time * 0.03;
      shardLight.intensity = 320 + Math.sin(time * 2.1) * 70;

      for (const isle of isles) {
        isle.group.position.y = isle.baseY + Math.sin(time * 0.28 + isle.phase) * 3;
        isle.group.rotation.y += dt * 0.045;
      }

      // Cloth: a travelling sine wave down each banner.
      for (const banner of banners) {
        const array = bannerPositions.array as Float32Array;
        for (let v = 0; v < array.length / 3; v++) {
          const baseY = banner.base[v * 3 + 1];
          const baseX = banner.base[v * 3];
          const dip = (12 - (baseY + 6)) / 12;
          const wave = Math.sin(baseX * 0.6 + time * 2.2 + dip * 3) * 0.5 * dip;
          array[v * 3 + 2] = banner.base[v * 3 + 2] + wave;
        }
        bannerPositions.needsUpdate = true;
      }
    },
  };
}
