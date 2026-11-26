import * as THREE from "three";
import { makeGlowTexture } from "./textures.js";
import { mulberry32 } from "./noise.js";

export interface AtmosphereSystem {
  group: THREE.Group;
  update(dt: number, elapsed: number): void;
}

export function createAtmosphere(brazierPositions: THREE.Vector3[]): AtmosphereSystem {
  const group = new THREE.Group();
  const rng = mulberry32(778899);
  const glow = makeGlowTexture();

  // --------------------------------------------------------------- dust motes
  const dustCount = 1100;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustPhase = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * 740;
    dustPositions[i * 3] = Math.cos(angle) * radius;
    dustPositions[i * 3 + 1] = 2 + rng() * 60;
    dustPositions[i * 3 + 2] = Math.sin(angle) * radius;
    dustPhase[i] = rng() * Math.PI * 2;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      map: glow,
      color: 0xfff3cf,
      size: 1.15,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
  );
  dust.frustumCulled = false;
  group.add(dust);

  // ------------------------------------------------------------------- embers
  const emberCount = 260;
  const emberPositions = new Float32Array(emberCount * 3);
  const emberVelocity = new Float32Array(emberCount * 3);
  const emberLife = new Float32Array(emberCount);
  const emberSource = new Int32Array(emberCount);

  function respawnEmber(i: number) {
    const source = brazierPositions[(rng() * brazierPositions.length) | 0] ?? new THREE.Vector3(0, 6, 0);
    emberSource[i] = (rng() * brazierPositions.length) | 0;
    emberPositions[i * 3] = source.x + (rng() - 0.5) * 2.5;
    emberPositions[i * 3 + 1] = source.y + rng() * 1.5;
    emberPositions[i * 3 + 2] = source.z + (rng() - 0.5) * 2.5;
    emberVelocity[i * 3] = (rng() - 0.5) * 2.4;
    emberVelocity[i * 3 + 1] = 3 + rng() * 5;
    emberVelocity[i * 3 + 2] = (rng() - 0.5) * 2.4;
    emberLife[i] = 1.4 + rng() * 2.6;
  }
  for (let i = 0; i < emberCount; i++) {
    respawnEmber(i);
    emberLife[i] = rng() * 3;
  }
  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute("position", new THREE.BufferAttribute(emberPositions, 3));
  const embers = new THREE.Points(
    emberGeometry,
    new THREE.PointsMaterial({
      map: glow,
      color: 0xffa54d,
      size: 1.5,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  embers.frustumCulled = false;
  group.add(embers);

  // ---------------------------------------------------------------- fireflies
  const flyCount = 110;
  const flyPositions = new Float32Array(flyCount * 3);
  const flyPhase = new Float32Array(flyCount);
  for (let i = 0; i < flyCount; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 60 + rng() * 420;
    flyPositions[i * 3] = Math.cos(angle) * radius;
    flyPositions[i * 3 + 1] = 3 + rng() * 14;
    flyPositions[i * 3 + 2] = Math.sin(angle) * radius;
    flyPhase[i] = rng() * Math.PI * 2;
  }
  const flyGeometry = new THREE.BufferGeometry();
  flyGeometry.setAttribute("position", new THREE.BufferAttribute(flyPositions, 3));
  const fireflies = new THREE.Points(
    flyGeometry,
    new THREE.PointsMaterial({
      map: glow,
      color: 0xc8ff9e,
      size: 0.85,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  fireflies.frustumCulled = false;
  group.add(fireflies);

  // -------------------------------------------------------------------- gulls
  const gullMaterial = new THREE.MeshBasicMaterial({
    color: 0x2b3640,
    side: THREE.DoubleSide,
  });
  const wingGeometry = new THREE.PlaneGeometry(5.5, 1.4);
  wingGeometry.translate(2.75, 0, 0);

  const gulls: Array<{
    group: THREE.Group;
    left: THREE.Mesh;
    right: THREE.Mesh;
    radius: number;
    speed: number;
    phase: number;
    height: number;
  }> = [];

  for (let i = 0; i < 9; i++) {
    const bird = new THREE.Group();
    const leftWing = new THREE.Mesh(wingGeometry, gullMaterial);
    leftWing.rotation.y = Math.PI;
    const rightWing = new THREE.Mesh(wingGeometry, gullMaterial);
    bird.add(leftWing, rightWing);
    const radius = 190 + rng() * 280;
    const height = 90 + rng() * 70;
    bird.position.set(radius, height, 0);
    bird.scale.setScalar(1.1 + rng() * 0.8);
    group.add(bird);
    gulls.push({
      group: bird,
      left: leftWing,
      right: rightWing,
      radius,
      speed: 0.06 + rng() * 0.06,
      phase: rng() * Math.PI * 2,
      height,
    });
  }

  let flyTime = 0;

  return {
    group,
    update(dt, elapsed) {
      flyTime = elapsed;

      // Dust: lazy vertical bobbing.
      const dustArray = dustGeometry.attributes.position.array as Float32Array;
      for (let i = 0; i < dustCount; i++) {
        dustArray[i * 3 + 1] += Math.sin(elapsed * 0.5 + dustPhase[i]) * dt * 0.35;
      }
      dustGeometry.attributes.position.needsUpdate = true;
      dust.position.x = Math.sin(elapsed * 0.03) * 12;
      (dust.material as THREE.PointsMaterial).opacity = 0.32 + Math.sin(elapsed * 0.8) * 0.06;

      // Embers rise, drift, and respawn at a brazier.
      for (let i = 0; i < emberCount; i++) {
        emberLife[i] -= dt;
        if (emberLife[i] <= 0) {
          respawnEmber(i);
          continue;
        }
        emberPositions[i * 3] += emberVelocity[i * 3] * dt;
        emberPositions[i * 3 + 1] += emberVelocity[i * 3 + 1] * dt;
        emberPositions[i * 3 + 2] += emberVelocity[i * 3 + 2] * dt;
        emberVelocity[i * 3] += Math.sin(elapsed * 4 + i) * dt * 1.5;
        emberVelocity[i * 3 + 2] += Math.cos(elapsed * 3.4 + i) * dt * 1.5;
      }
      emberGeometry.attributes.position.needsUpdate = true;

      // Fireflies orbit their anchor.
      const flyArray = flyGeometry.attributes.position.array as Float32Array;
      for (let i = 0; i < flyCount; i++) {
        const phase = flyPhase[i];
        flyArray[i * 3] += Math.sin(elapsed * 0.7 + phase) * dt * 1.1;
        flyArray[i * 3 + 1] += Math.sin(elapsed * 1.3 + phase * 2) * dt * 0.5;
        flyArray[i * 3 + 2] += Math.cos(elapsed * 0.6 + phase) * dt * 1.1;
        if (flyArray[i * 3 + 1] < 1.5) { flyArray[i * 3 + 1] = 1.5; }
        if (flyArray[i * 3 + 1] > 20) { flyArray[i * 3 + 1] = 20; }
      }
      flyGeometry.attributes.position.needsUpdate = true;
      (fireflies.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(flyTime * 2) * 0.2;

      // Gulls trace wide, slow circles.
      for (const gull of gulls) {
        const angle = gull.phase + flyTime * gull.speed;
        gull.group.position.set(
          Math.cos(angle) * gull.radius,
          gull.height + Math.sin(flyTime * 0.4 + gull.phase) * 4,
          Math.sin(angle) * gull.radius
        );
        gull.group.rotation.y = -angle + Math.PI / 2;
        const flap = Math.sin(flyTime * 5 + gull.phase) * 0.5;
        gull.left.rotation.z = flap;
        gull.right.rotation.z = -flap;
      }
    },
  };
}
