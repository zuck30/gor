import * as THREE from "three";
import { makeGlowTexture } from "./textures.js";

export interface CombatFX {
  group: THREE.Group;
  shake: number;
  update(dt: number): void;
  swing(x: number, z: number): void;
  hit(x: number, y: number, z: number, kind: number): void;
  kill(x: number, y: number, z: number, kind: number): void;
  kick(amount: number): void;
}

const KIND_COLORS = [0x8ffcff, 0xffa34d, 0xffd76a, 0xff5a2a];

export function createCombatFX(): CombatFX {
  const group = new THREE.Group();
  const glow = makeGlowTexture();

  // ------------------------------------------------------------------ sparks
  const MAX = 620;
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const velocities = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  const gravity = new Float32Array(MAX);
  const tint = new THREE.Color();

  for (let i = 0; i < MAX; i++) {
    positions[i * 3 + 1] = -9999;
    maxLife[i] = 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: glow,
      size: 1.9,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
  );
  points.frustumCulled = false;
  group.add(points);

  let cursor = 0;

  function emit(
    x: number,
    y: number,
    z: number,
    count: number,
    speed: number,
    color: number,
    gravityAmount: number,
    spread = 1
  ) {
    tint.setHex(color);
    for (let n = 0; n < count; n++) {
      const i = cursor;
      cursor = (cursor + 1) % MAX;

      const angle = Math.random() * Math.PI * 2;
      const pitch = (Math.random() - 0.35) * 0.9;
      const velocity = speed * (0.35 + Math.random() * 0.9);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      velocities[i * 3] = Math.cos(angle) * Math.cos(pitch) * velocity * spread;
      velocities[i * 3 + 1] = Math.sin(pitch) * velocity + speed * 0.25;
      velocities[i * 3 + 2] = Math.sin(angle) * Math.cos(pitch) * velocity * spread;
      gravity[i] = gravityAmount;

      const duration = 0.35 + Math.random() * 0.6;
      life[i] = duration;
      maxLife[i] = duration;

      const shade = 0.75 + Math.random() * 0.6;
      colors[i * 3] = tint.r * shade;
      colors[i * 3 + 1] = tint.g * shade;
      colors[i * 3 + 2] = tint.b * shade;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }

  // ------------------------------------------------------------------- rings
  const ringMeshes: Array<{
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    life: number;
    maxLife: number;
    growth: number;
  }> = [];
  const ringGeometry = new THREE.RingGeometry(0.86, 1, 48);

  for (let i = 0; i < 10; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffc45e,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.1;
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    ringMeshes.push({ mesh, material, life: 0, maxLife: 1, growth: 16 });
  }
  let ringCursor = 0;

  function ring(x: number, z: number, color: number, size: number, growth: number, duration: number) {
    const entry = ringMeshes[ringCursor];
    ringCursor = (ringCursor + 1) % ringMeshes.length;
    entry.mesh.position.set(x, 0.12, z);
    entry.mesh.scale.setScalar(size);
    entry.material.color.setHex(color);
    entry.material.opacity = 0.9;
    entry.mesh.visible = true;
    entry.life = duration;
    entry.maxLife = duration;
    entry.growth = growth;
  }

  let shake = 0;

  return {
    group,
    get shake() {
      return shake;
    },
    update(dt) {
      let dirty = false;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) { continue; }
        life[i] -= dt;
        dirty = true;

        if (life[i] <= 0) {
          positions[i * 3 + 1] = -9999;
          colors[i * 3] = 0;
          colors[i * 3 + 1] = 0;
          colors[i * 3 + 2] = 0;
          continue;
        }

        velocities[i * 3 + 1] -= gravity[i] * dt;
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;

        const fade = life[i] / maxLife[i];
        const glowScale = fade * fade;
        // Scale the stored colour down so additive blending fades to nothing.
        colors[i * 3] *= 0.985;
        colors[i * 3 + 1] *= 0.985;
        colors[i * 3 + 2] *= 0.985;
        void glowScale;
      }
      if (dirty) {
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
      }

      for (const entry of ringMeshes) {
        if (entry.life <= 0) { continue; }
        entry.life -= dt;
        if (entry.life <= 0) {
          entry.mesh.visible = false;
          entry.material.opacity = 0;
          continue;
        }
        const t = 1 - entry.life / entry.maxLife;
        entry.mesh.scale.setScalar(1 + t * entry.growth);
        entry.material.opacity = (1 - t) * 0.85;
      }

      shake = Math.max(0, shake - dt * 3.2);
    },
    swing(x, z) {
      ring(x, z, 0xffc45e, 1.2, 10, 0.35);
      emit(x, 1.5, z, 12, 10, 0xffd27a, 6, 1.4);
    },
    hit(x, y, z, kind) {
      emit(x, y, z, 22, 16, KIND_COLORS[kind] ?? 0xffc45e, 14);
      ring(x, z, KIND_COLORS[kind] ?? 0xffc45e, 0.8, 5, 0.28);
      shake = Math.max(shake, 0.22);
    },
    kill(x, y, z, kind) {
      emit(x, y, z, 46, 22, KIND_COLORS[kind] ?? 0xffc45e, 16);
      emit(x, y, z, 24, 8, 0x8a1d14, 22, 1.2);
      ring(x, z, KIND_COLORS[kind] ?? 0xffc45e, 1.4, 12, 0.6);
      shake = Math.max(shake, 0.38);
    },
    kick(amount) {
      shake = Math.max(shake, amount);
    },
  };
}
