import * as THREE from "three";
import { makeGlowTexture } from "./textures.js";

export interface CombatFX {
  group: THREE.Group;
  shake: number;
  update(dt: number): void;
  swing(x: number, z: number): void;
  hit(x: number, y: number, z: number, kind: number): void;
  kill(x: number, y: number, z: number, kind: number): void;
  chainThrow(startX: number, startZ: number, endX: number, endZ: number): void;
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
  // ------------------------------------------------------------- chain throw
  const chainCableGeometry = new THREE.CylinderGeometry(0.06, 0.06, 1, 6);
  const chainLinkGeometry = new THREE.TorusGeometry(0.13, 0.034, 4, 8);
  const chainMetal = new THREE.MeshStandardMaterial({
    color: 0x9aa4ae,
    metalness: 0.9,
    roughness: 0.34,
  });
  const chainBladeMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d99a6,
    metalness: 0.85,
    roughness: 0.28,
  });
  const chainBladeGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0x5fdcff,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const chainGlowMaterial = new THREE.SpriteMaterial({
    map: glow,
    color: 0x4fc8ff,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const throwBladeGeometry = (() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.08);
    shape.quadraticCurveTo(0.12, 0.86, 1.05, 1.34);
    shape.quadraticCurveTo(0.62, 0.66, 0.45, 0.14);
    shape.quadraticCurveTo(0.24, 0.02, 0, 0.08);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 1,
    });
    geometry.center();
    return geometry;
  })();

  interface ThrowArm {
    cable: THREE.Mesh;
    links: THREE.Mesh[];
    blade: THREE.Mesh;
    glow: THREE.Sprite;
    start: THREE.Vector3;
  }

  interface ChainThrowFx {
    group: THREE.Group;
    arms: ThrowArm[];
    time: number;
    active: boolean;
    impacted: boolean;
    end: THREE.Vector3;
    duration: number;
  }

  const chainThrows: ChainThrowFx[] = [];
  for (let n = 0; n < 2; n++) {
    const throwGroup = new THREE.Group();
    throwGroup.visible = false;
    group.add(throwGroup);
    const arms: ThrowArm[] = [];

    for (let armIndex = 0; armIndex < 2; armIndex++) {
      const cable = new THREE.Mesh(chainCableGeometry, chainMetal);
      cable.visible = false;
      throwGroup.add(cable);

      const links: THREE.Mesh[] = [];
      for (let i = 0; i < 6; i++) {
        const link = new THREE.Mesh(chainLinkGeometry, chainMetal);
        link.visible = false;
        throwGroup.add(link);
        links.push(link);
      }

      const blade = new THREE.Mesh(throwBladeGeometry, chainBladeMaterial);
      blade.visible = false;
      throwGroup.add(blade);

      const bladeGlow = new THREE.Mesh(throwBladeGeometry, chainBladeGlowMaterial);
      bladeGlow.visible = false;
      bladeGlow.scale.setScalar(1.06);
      throwGroup.add(bladeGlow);

      const glowSprite = new THREE.Sprite(chainGlowMaterial);
      glowSprite.scale.setScalar(1.7);
      glowSprite.visible = false;
      throwGroup.add(glowSprite);

      // Store the glow silhouette on the blade so the arm update can move both.
      (blade as any).__glow = bladeGlow;

      arms.push({
        cable,
        links,
        blade,
        glow: glowSprite,
        start: new THREE.Vector3(),
      });
    }

    chainThrows.push({
      group: throwGroup,
      arms,
      time: 0,
      active: false,
      impacted: false,
      end: new THREE.Vector3(),
      duration: 0.68,
    });
  }
  let chainThrowCursor = 0;

  function startChainThrow(startX: number, startZ: number, endX: number, endZ: number) {
    const fx = chainThrows[chainThrowCursor];
    chainThrowCursor = (chainThrowCursor + 1) % chainThrows.length;
    fx.active = true;
    fx.time = 0;
    fx.impacted = false;
    fx.group.visible = true;
    fx.end.set(endX, 2.35, endZ);

    for (let armIndex = 0; armIndex < fx.arms.length; armIndex++) {
      const arm = fx.arms[armIndex];
      const side = armIndex === 0 ? -1 : 1;
      arm.start.set(startX + side * 0.55, 2.65, startZ);
      arm.cable.visible = true;
      arm.blade.visible = true;
      arm.glow.visible = true;
      const bladeGlow = (arm.blade as any).__glow as THREE.Mesh | undefined;
      if (bladeGlow) { bladeGlow.visible = true; }
      for (const link of arm.links) { link.visible = true; }
    }
  }

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

      for (const fx of chainThrows) {
        if (!fx.active) { continue; }
        fx.time += dt;
        const extend = Math.min(1, fx.time / 0.25);
        const retract = Math.max(0, (fx.time - 0.42) / 0.24);
        const reach = Math.max(0, extend * (1 - retract));

        for (const arm of fx.arms) {
          const tip = arm.start.clone().lerp(fx.end, reach);
          const direction = tip.clone().sub(arm.start);
          const length = direction.length();
          if (length < 0.001) { continue; }
          const normalized = direction.clone().normalize();

          arm.cable.position.copy(arm.start).lerp(tip, 0.5);
          arm.cable.scale.set(1, length, 1);
          arm.cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalized);

          arm.links.forEach((link, index) => {
            const fraction = 0.12 + index * 0.14;
            link.position.lerpVectors(arm.start, tip, Math.min(1, fraction));
            link.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normalized);
          });

          arm.blade.position.copy(tip);
          arm.blade.rotation.set(0.2, Math.atan2(direction.x, direction.z), 0);
          arm.glow.position.copy(tip);
          const bladeGlow = (arm.blade as any).__glow as THREE.Mesh | undefined;
          if (bladeGlow) { bladeGlow.position.copy(tip); bladeGlow.rotation.copy(arm.blade.rotation); }
        }

        if (!fx.impacted && fx.time >= 0.24) {
          fx.impacted = true;
          emit(fx.end.x, fx.end.y, fx.end.z, 38, 22, 0x6fdcff, 12);
          ring(fx.end.x, fx.end.z, 0x65dcff, 1.5, 10, 0.42);
          shake = Math.max(shake, 0.46);
        }

        if (fx.time >= fx.duration) {
          fx.active = false;
          fx.group.visible = false;
        }
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
    chainThrow(startX, startZ, endX, endZ) {
      startChainThrow(startX, startZ, endX, endZ);
    },
    kick(amount) {
      shake = Math.max(shake, amount);
    },
  };
}
