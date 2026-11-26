import * as THREE from "three";
import { ENEMY_KINDS, ENEMY_STATS, type EnemyKind } from "../../rooms/schema/ArenaState.js";
import { makeGlowTexture, makeToonGradient } from "./textures.js";

const gradientMap = makeToonGradient();
const glowTexture = makeGlowTexture();

const toon = (color: number, extra: Partial<THREE.MeshToonMaterialParameters> = {}) =>
  new THREE.MeshToonMaterial({ color, gradientMap, ...extra });

const materials: Record<EnemyKind, {
  skin: THREE.Material;
  cloth: THREE.Material;
  armor: THREE.Material;
  glow: THREE.Material;
  weapon: THREE.Material;
}> = {
  draugr: {
    skin: toon(0x93a373),
    cloth: toon(0x3c4430),
    armor: toon(0x5e5c4b),
    glow: new THREE.MeshStandardMaterial({ color: 0x9ffcff, emissive: 0x7ff6ff, emissiveIntensity: 2.4 }),
    weapon: toon(0x8d9a9f),
  },
  troll: {
    skin: toon(0x7f8170),
    cloth: toon(0x4b3f33),
    armor: toon(0x574d40),
    glow: new THREE.MeshStandardMaterial({ color: 0xffb35c, emissive: 0xff9236, emissiveIntensity: 2 }),
    weapon: toon(0x5b4936),
  },
  god: {
    skin: toon(0xd9b990),
    cloth: toon(0xe8dfcc),
    armor: toon(0xd3a94f),
    glow: new THREE.MeshStandardMaterial({ color: 0xfff2b4, emissive: 0xffdf7a, emissiveIntensity: 2.6 }),
    weapon: toon(0xe7d8a6),
  },
  colossus: {
    skin: toon(0x625c54),
    cloth: toon(0x413a33),
    armor: toon(0x5a5145),
    glow: new THREE.MeshStandardMaterial({ color: 0xff7b3d, emissive: 0xff4b1e, emissiveIntensity: 3 }),
    weapon: toon(0x4c4237),
  },
};

const barBackGeometry = new THREE.PlaneGeometry(5, 0.5);
const barFillGeometry = new THREE.PlaneGeometry(4.8, 0.32);
const spawnRingGeometry = new THREE.RingGeometry(3.4, 4.2, 40);

export interface EnemyRig {
  group: THREE.Group;
  update(
    dt: number,
    elapsed: number,
    vx: number,
    vy: number,
    health: number,
    maxHealth: number,
    camera: THREE.Camera,
    alive: boolean,
    hitFlash: number
  ): void;
  attack(): void;
  readonly height: number;
}

interface Dims {
  torsoWidth: number;
  torsoHeight: number;
  torsoDepth: number;
  legLength: number;
  armLength: number;
  headRadius: number;
  hunch: number;
}

const DIMS: Record<EnemyKind, Dims> = {
  draugr: { torsoWidth: 1.15, torsoHeight: 1.3, torsoDepth: 0.62, legLength: 2.7, armLength: 2.9, headRadius: 0.44, hunch: 0.22 },
  troll: { torsoWidth: 2.4, torsoHeight: 1.9, torsoDepth: 1.25, legLength: 2.2, armLength: 3.4, headRadius: 0.55, hunch: 0.32 },
  god: { torsoWidth: 1.35, torsoHeight: 1.5, torsoDepth: 0.7, legLength: 2.9, armLength: 3.0, headRadius: 0.48, hunch: 0.04 },
  colossus: { torsoWidth: 3.4, torsoHeight: 2.8, torsoDepth: 1.7, legLength: 3.0, armLength: 4.6, headRadius: 0.8, hunch: 0.3 },
};

export function createEnemy(kindIndex: number, seed: number): EnemyRig {
  const kind = (ENEMY_KINDS[kindIndex] ?? "draugr") as EnemyKind;
  const stats = ENEMY_STATS[kind];
  const dims = DIMS[kind];
  const mat = materials[kind];
  const rng = (() => {
    let state = (seed * 2654435761) >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  })();

  const root = new THREE.Group();
  const scale = stats.scale;
  root.scale.setScalar(scale);

  const hipY = dims.legLength + 0.15;
  const torso = new THREE.Group();
  torso.position.y = hipY;
  torso.rotation.x = dims.hunch;
  root.add(torso);

  const torsoHeight = dims.torsoHeight;
  const chest = new THREE.Mesh(
    new THREE.BoxGeometry(dims.torsoWidth, torsoHeight, dims.torsoDepth),
    mat.cloth
  );
  chest.position.y = torsoHeight * 0.5 + 0.35;
  chest.castShadow = true;
  torso.add(chest);

  // A chest plate or exposed ribs depending on the creature.
  if (kind === "draugr" || kind === "colossus") {
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(dims.torsoWidth * 0.92, 0.14, dims.torsoDepth * 1.02),
        mat.skin
      );
      rib.position.set(0, 0.65 + i * 0.32, 0);
      torso.add(rib);
    }
  } else {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(dims.torsoWidth * 1.06, torsoHeight * 0.62, dims.torsoDepth * 0.5),
      mat.armor
    );
    plate.position.set(0, torsoHeight * 0.52 + 0.35, dims.torsoDepth * 0.55);
    plate.castShadow = true;
    torso.add(plate);
  }

  // Shoulders.
  const shoulderGeo = new THREE.IcosahedronGeometry(dims.torsoWidth * 0.27, 0);
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(shoulderGeo, kind === "god" ? mat.armor : mat.skin);
    shoulder.position.set(side * dims.torsoWidth * 0.62, torsoHeight + 0.15, 0);
    shoulder.castShadow = true;
    torso.add(shoulder);
    if (kind === "colossus") {
      shoulder.scale.set(1.5, 1.2, 1.4);
    }
  }

  // Head.
  const head = new THREE.Group();
  head.position.y = torsoHeight + 0.7;
  torso.add(head);

  const skullMaterial = kind === "draugr" ? mat.armor : mat.skin;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(dims.headRadius, 12, 10), skullMaterial);
  skull.castShadow = true;
  head.add(skull);

  if (kind === "draugr") {
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(dims.headRadius * 1.4, dims.headRadius * 0.5, dims.headRadius * 1.1), mat.armor);
    jaw.position.y = -dims.headRadius * 0.6;
    head.add(jaw);
  }

  if (kind === "troll") {
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.4, 0.6), mat.skin);
    jaw.position.set(0, -0.35, 0.15);
    head.add(jaw);
    for (const side of [-1, 1]) {
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.55, 5), mat.armor);
      tusk.position.set(side * 0.3, -0.28, 0.36);
      tusk.rotation.x = Math.PI;
      head.add(tusk);
    }
  }

  if (kind === "god") {
    const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.58, 0.65, 8), mat.armor);
    helm.position.y = 0.3;
    head.add(helm);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.5), mat.glow);
    crest.position.y = 0.85;
    head.add(crest);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.06, 6, 28),
      mat.glow
    );
    halo.position.y = 0.45;
    halo.rotation.x = Math.PI / 2;
    head.add(halo);
  }

  if (kind === "colossus") {
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 6), mat.armor);
      horn.position.set(side * 0.55, 0.55, 0);
      horn.rotation.z = side * -0.5;
      head.add(horn);
    }
  }

  // Eyes.
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(dims.headRadius * 0.14, 6, 6), mat.glow);
    eye.position.set(side * dims.headRadius * 0.38, dims.headRadius * 0.1, dims.headRadius * 0.88);
    head.add(eye);
  }

  // Legs.
  const legs: Array<{ hip: THREE.Group; knee: THREE.Group }> = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * dims.torsoWidth * 0.27, hipY, 0);
    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22 * (dims.torsoWidth / 1.2), dims.legLength * 0.45, 4, 6),
      mat.skin
    );
    thigh.position.y = -dims.legLength * 0.25;
    thigh.castShadow = true;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -dims.legLength * 0.5;
    hip.add(knee);
    const shin = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.19 * (dims.torsoWidth / 1.2), dims.legLength * 0.42, 4, 6),
      kind === "god" ? mat.armor : mat.skin
    );
    shin.position.y = -dims.legLength * 0.24;
    shin.castShadow = true;
    knee.add(shin);

    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.5 * (dims.torsoWidth / 1.2), 0.28, 1.05),
      kind === "troll" || kind === "colossus" ? mat.armor : mat.skin
    );
    foot.position.set(0, -dims.legLength * 0.48, 0.25);
    foot.castShadow = true;
    knee.add(foot);

    root.add(hip);
    legs.push({ hip, knee });
  }

  // Arms.
  const arms: Array<{ pivot: THREE.Group; elbow: THREE.Group; hand: THREE.Group }> = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * dims.torsoWidth * 0.72, torsoHeight + 0.1, 0);
    pivot.rotation.z = side * 0.08;
    torso.add(pivot);

    const upper = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.17 * (dims.torsoWidth / 1.2), dims.armLength * 0.4, 4, 6),
      mat.skin
    );
    upper.position.y = -dims.armLength * 0.22;
    upper.castShadow = true;
    pivot.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -dims.armLength * 0.45;
    pivot.add(elbow);

    const forearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.15 * (dims.torsoWidth / 1.2), dims.armLength * 0.36, 4, 6),
      kind === "god" ? mat.armor : mat.skin
    );
    forearm.position.y = -dims.armLength * 0.21;
    forearm.castShadow = true;
    elbow.add(forearm);

    const hand = new THREE.Group();
    hand.position.y = -dims.armLength * 0.43;
    elbow.add(hand);

    arms.push({ pivot, elbow, hand });
  }
  // Weapon in the right hand.
  const weapon = buildWeapon(kind, mat);
  if (weapon) {
    arms[1].hand.add(weapon);
  }

  // Creature-specific cloth: tattered skirt, fur kilt, robe.
  if (kind === "draugr") {
    const rags = new THREE.Mesh(new THREE.ConeGeometry(dims.torsoWidth * 0.62, 1.5, 7, 1, true), mat.cloth);
    rags.position.y = hipY - 0.55;
    rags.castShadow = true;
    root.add(rags);
  } else if (kind === "troll" || kind === "colossus") {
    const kilt = new THREE.Mesh(new THREE.CylinderGeometry(dims.torsoWidth * 0.6, dims.torsoWidth * 0.72, 1.3, 9), mat.cloth);
    kilt.position.y = hipY - 0.2;
    kilt.castShadow = true;
    root.add(kilt);
  } else if (kind === "god") {
    const robe = new THREE.Mesh(new THREE.PlaneGeometry(dims.torsoWidth * 1.6, 3.4, 1, 1), mat.cloth);
    robe.position.set(0, hipY - 0.9, -dims.torsoDepth * 0.6);
    robe.material.side = THREE.DoubleSide;
    root.add(robe);

    const cape = new THREE.Mesh(new THREE.PlaneGeometry(dims.torsoWidth * 1.5, 4.2, 4, 6), mat.cloth);
    cape.position.set(0, hipY + 1.05, -dims.torsoDepth * 0.7);
    (cape.material as THREE.Material).side = THREE.DoubleSide;
    cape.castShadow = true;
    root.add(cape);
  }

  // Molten cracks for the colossus.
  if (kind === "colossus") {
    for (let i = 0; i < 6; i++) {
      const crack = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.4 + rng() * 1.2, 0.12),
        mat.glow
      );
      crack.position.set(
        (rng() - 0.5) * dims.torsoWidth * 0.9,
        hipY + 0.4 + rng() * dims.torsoHeight,
        dims.torsoDepth * 0.53
      );
      crack.rotation.z = rng() * Math.PI;
      root.add(crack);
    }
  }

  // Health bar and spawn ring.
  const status = new THREE.Group();
  const height = hipY + torsoHeight + dims.headRadius * 2 + (kind === "colossus" ? 3 : 1.6);
  status.position.y = height;
  root.add(status);

  const barBack = new THREE.Mesh(
    barBackGeometry,
    new THREE.MeshBasicMaterial({ color: 0x160c0b, transparent: true, opacity: 0.8, depthTest: false })
  );
  barBack.renderOrder = 30;
  status.add(barBack);
  const barFill = new THREE.Mesh(
    barFillGeometry,
    new THREE.MeshBasicMaterial({ color: 0xd8563f, depthTest: false })
  );
  barFill.position.z = 0.01;
  barFill.renderOrder = 31;
  status.add(barFill);

  const spawnRing = new THREE.Mesh(
    spawnRingGeometry,
    new THREE.MeshBasicMaterial({
      color: kind === "god" ? 0xffd76a : kind === "colossus" ? 0xff5a2a : 0x8ffcff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  spawnRing.rotation.x = -Math.PI / 2;
  spawnRing.position.y = 0.2;
  root.add(spawnRing);

  const fillColor = new THREE.Color();
  const state = {
    phase: rng() * Math.PI * 2,
    yaw: rng() * Math.PI * 2,
    attackTimer: 0,
    death: 0,
    spawn: 0,
  };

  return {
    group: root,
    height,
    attack() {
      if (state.attackTimer <= 0 && state.death === 0) {
        state.attackTimer = 0.55;
      }
    },
    update(dt, elapsed, vx, vy, health, maxHealth, camera, alive, hitFlash) {
      state.spawn = Math.min(1, state.spawn + dt * 1.4);
      spawnRing.material.opacity = (1 - state.spawn) * 0.9;
      spawnRing.scale.setScalar(0.5 + state.spawn * 1.4);

      if (!alive) {
        state.death = Math.min(1, state.death + dt * 1.1);
        root.rotation.z = state.death * 1.45;
        root.position.y = -state.death * 1.2;
        status.visible = false;
        if (state.death >= 1) {
          root.visible = false;
        }
        return;
      }

      const speed = Math.min(1, Math.hypot(vx, vy) / 55);
      if (speed > 0.05) {
        const target = Math.atan2(vx, vy);
        let delta = target - state.yaw;
        while (delta > Math.PI) { delta -= Math.PI * 2; }
        while (delta < -Math.PI) { delta += Math.PI * 2; }
        state.yaw += delta * Math.min(1, dt * 10);
      }
      root.rotation.y = state.yaw;

      state.phase += dt * (3.2 + speed * 6.5);
      state.attackTimer = Math.max(0, state.attackTimer - dt);

      const swing = Math.sin(state.phase) * speed;
      legs[0].hip.rotation.x = swing * 0.8;
      legs[1].hip.rotation.x = -swing * 0.8;
      legs[0].knee.rotation.x = Math.max(0, -swing) * 0.7;
      legs[1].knee.rotation.x = Math.max(0, swing) * 0.7;

      const attackProgress = state.attackTimer > 0 ? 1 - state.attackTimer / 0.55 : 0;
      const attackSwing = state.attackTimer > 0
        ? Math.sin(attackProgress * Math.PI) * 2.1
        : 0;

      arms[0].pivot.rotation.x = -swing * 0.55;
      arms[1].pivot.rotation.x = swing * 0.55 - attackSwing;
      arms[1].pivot.rotation.z = -0.08 - attackSwing * 0.35;
      arms[0].elbow.rotation.x = 0.25;
      arms[1].elbow.rotation.x = 0.25 + attackSwing * 0.5;

      torso.rotation.x = dims.hunch + Math.sin(elapsed * 2 + state.phase * 0.05) * 0.03;

      status.quaternion.copy(camera.quaternion);
      const ratio = Math.max(0, Math.min(1, health / maxHealth));
      barFill.scale.x = Math.max(0.001, ratio);
      barFill.position.x = -(1 - ratio) * 2.4;
      fillColor.setHSL(0.02, 0.72, 0.36 + ratio * 0.18);
      (barFill.material as THREE.MeshBasicMaterial).color.copy(fillColor);

      // Hit flash: a short, readable pop rather than a shader pass.
      chest.scale.setScalar(1 + hitFlash * 0.03);
      if (hitFlash > 0.4) {
        status.visible = true;
      }
    },
  };
}

function buildWeapon(kind: EnemyKind, mat: { armor: THREE.Material; weapon: THREE.Material; glow: THREE.Material }): THREE.Object3D | null {
  const weapon = new THREE.Group();

  if (kind === "draugr" || kind === "god") {
    const length = kind === "god" ? 5.6 : 3.6;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, length, 6),
      mat.weapon
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = -length * 0.45;
    weapon.add(shaft);

    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.4, 4), mat.weapon);
    blade.rotation.x = -Math.PI / 2;
    blade.position.z = -length * 0.92;
    weapon.add(blade);

    if (kind === "god") {
      const point = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.2, 6), mat.glow);
      point.rotation.x = -Math.PI / 2;
      point.position.z = -length * 0.92;
      weapon.add(point);
      const cross = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.12), mat.armor);
      cross.position.z = -length * 0.2;
      weapon.add(cross);
    }
    weapon.rotation.x = -0.2;
    return weapon;
  }

  if (kind === "troll" || kind === "colossus") {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 5.2, 6), mat.weapon);
    handle.rotation.x = Math.PI / 2;
    handle.position.z = -2.0;
    weapon.add(handle);

    const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 2.2), mat.armor);
    head.position.z = -4.4;
    head.rotation.y = 0.2;
    head.castShadow = true;
    weapon.add(head);

    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 5), mat.weapon);
      const angle = (i / 4) * Math.PI * 2;
      spike.position.set(Math.cos(angle) * 0.9, Math.sin(angle) * 0.9, -4.4);
      spike.rotation.z = angle - Math.PI / 2;
      weapon.add(spike);
    }
    weapon.rotation.x = -0.35;
    return weapon;
  }

  return null;
}
