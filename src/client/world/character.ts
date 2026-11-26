import * as THREE from "three";
import { PLAYER_SPEED } from "../../shared/constants.js";
import { makeGlowTexture, makeNameTexture, makeToonGradient } from "./textures.js";

const toonGradient = makeToonGradient();
const outlineMaterial = new THREE.MeshBasicMaterial({
  color: 0x0d100e,
  side: THREE.BackSide,
});

const skinMaterial = new THREE.MeshToonMaterial({ color: 0xd7a982, gradientMap: toonGradient });
const leatherMaterial = new THREE.MeshToonMaterial({ color: 0x4a3324, gradientMap: toonGradient });
const furMaterial = new THREE.MeshToonMaterial({ color: 0x6a5137, gradientMap: toonGradient });
const armorMaterial = new THREE.MeshToonMaterial({ color: 0x5f636b, gradientMap: toonGradient });
const darkMetalMaterial = new THREE.MeshToonMaterial({ color: 0x343940, gradientMap: toonGradient });
const beardMaterial = new THREE.MeshToonMaterial({ color: 0x38302a, gradientMap: toonGradient });
const tattooMaterial = new THREE.MeshStandardMaterial({
  color: 0x9e2f26,
  emissive: 0x5e0f0b,
  emissiveIntensity: 0.55,
  roughness: 0.7,
});
const axeSteelMaterial = new THREE.MeshToonMaterial({ color: 0xa7b2be, gradientMap: toonGradient });
const axeRuneMaterial = new THREE.MeshStandardMaterial({
  color: 0x9ff6ff,
  emissive: 0x54d8ff,
  emissiveIntensity: 1.2,
  roughness: 0.3,
});

const legGeometry = new THREE.CapsuleGeometry(0.3, 0.7, 4, 8);
const shinGeometry = new THREE.CapsuleGeometry(0.27, 0.78, 4, 8);
const bootGeometry = new THREE.BoxGeometry(0.66, 0.5, 1.05);
const armGeometry = new THREE.CapsuleGeometry(0.25, 0.55, 4, 8);
const forearmGeometry = new THREE.CapsuleGeometry(0.23, 0.52, 4, 8);
const handGeometry = new THREE.SphereGeometry(0.26, 8, 6);
const chestGeometry = new THREE.BoxGeometry(1.7, 1.55, 0.98);
const pelvisGeometry = new THREE.BoxGeometry(1.45, 0.66, 0.9);
const headGeometry = new THREE.SphereGeometry(0.55, 14, 12);
const shoulderGeometry = new THREE.SphereGeometry(0.46, 10, 8);
const barGeometry = new THREE.PlaneGeometry(2.6, 0.28);
const barFillGeometry = new THREE.PlaneGeometry(2.5, 0.18);
const ringGeometry = new THREE.RingGeometry(1.7, 2.1, 44);
const shadowGeometry = new THREE.PlaneGeometry(3.8, 2.5);

const shadowMaterial = new THREE.MeshBasicMaterial({
  map: makeGlowTexture(),
  color: 0x000000,
  transparent: true,
  opacity: 0.38,
  depthWrite: false,
});

export interface CharacterRig {
  group: THREE.Group;
  attack(duration?: number): void;
  setWeapon(weapon: number): void;
  update(
    dt: number,
    elapsed: number,
    vx: number,
    vy: number,
    health: number,
    camera: THREE.Camera,
    raging: boolean
  ): void;
}

function buildAxe(): THREE.Group {
  const axe = new THREE.Group();

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.1, 2.9, 7),
    leatherMaterial
  );
  handle.castShadow = true;
  axe.add(handle);

  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 7), armorMaterial);
  guard.position.y = 1.0;
  axe.add(guard);

  // A broad, hand-shaped double bit. Extruding a 2D silhouette keeps the
  // profile sharp instead of reading as a stack of boxes.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.62);
  shape.lineTo(0.42, 0.74);
  shape.lineTo(0.82, 0.42);
  shape.lineTo(0.98, 0.02);
  shape.lineTo(0.76, -0.56);
  shape.lineTo(0.3, -0.66);
  shape.lineTo(0, -0.42);
  shape.closePath();

  const bladeGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 1,
  });
  bladeGeometry.center();

  for (const side of [-1, 1]) {
    const blade = new THREE.Mesh(bladeGeometry, axeSteelMaterial);
    blade.position.set(side * 0.5, 1.15, 0);
    blade.scale.x = side;
    blade.castShadow = true;
    axe.add(blade);

    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.2), axeRuneMaterial);
    rune.position.set(side * 0.55, 1.15, 0.03);
    rune.scale.set(0.7, 0.8, 0.7);
    axe.add(rune);
  }

  const crown = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.34), darkMetalMaterial);
  crown.position.y = 1.15;
  axe.add(crown);

  return axe;
}

function buildSword(): THREE.Group {
  const sword = new THREE.Group();

  const gold = new THREE.MeshStandardMaterial({
    color: 0xd9b45a,
    metalness: 0.65,
    roughness: 0.28,
    emissive: 0x5a3a10,
    emissiveIntensity: 0.4,
  });
  const blade = new THREE.MeshStandardMaterial({
    color: 0xfff3d6,
    metalness: 0.55,
    roughness: 0.22,
    emissive: 0xffc45e,
    emissiveIntensity: 1.2,
  });
  const rune = new THREE.MeshStandardMaterial({
    color: 0xa8fbff,
    emissive: 0x4bd8ff,
    emissiveIntensity: 2.0,
  });

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.105, 1.05, 7), leatherMaterial);
  grip.position.y = 0.1;
  grip.castShadow = true;
  sword.add(grip);

  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), gold);
  pommel.position.y = -0.48;
  sword.add(pommel);

  const guard = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 0.28), gold);
  guard.position.y = 0.64;
  guard.castShadow = true;
  sword.add(guard);

  const bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.1, 0.1), blade);
  bladeMesh.position.y = 2.22;
  bladeMesh.castShadow = true;
  sword.add(bladeMesh);

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.7, 4), blade);
  tip.position.y = 4.08;
  tip.rotation.y = Math.PI / 4;
  sword.add(tip);

  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 2.1, 0.115), rune);
    strip.position.set(side * 0.1, 2.25, 0);
    sword.add(strip);
  }

  const crossRune = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.12), rune);
  crossRune.position.y = 0.92;
  sword.add(crossRune);

  sword.position.set(0.12, 0.25, 0.12);
  sword.rotation.z = 0.08;
  return sword;
}

export function createCharacter(options: {
  isSelf: boolean;
  sessionId: string;
  label: string;
}): CharacterRig {
  const { isSelf, sessionId, label } = options;
  const root = new THREE.Group();

  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.035;
  root.add(shadow);

  let selfRing: THREE.Mesh | null = null;
  if (isSelf) {
    selfRing = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffc45e,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    selfRing.rotation.x = -Math.PI / 2;
    selfRing.position.y = 0.07;
    root.add(selfRing);
  }

  // ------------------------------------------------------------------- legs
  function makeLeg(side: -1 | 1) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.48, 2.9, 0);

    const thigh = new THREE.Mesh(legGeometry, leatherMaterial);
    thigh.position.y = -0.65;
    thigh.castShadow = true;
    hip.add(thigh);

    const thighOutline = new THREE.Mesh(legGeometry, outlineMaterial);
    thighOutline.scale.setScalar(1.07);
    thigh.add(thighOutline);

    const knee = new THREE.Group();
    knee.position.y = -1.3;
    hip.add(knee);

    const shin = new THREE.Mesh(shinGeometry, leatherMaterial);
    shin.position.y = -0.65;
    shin.castShadow = true;
    knee.add(shin);

    const boot = new THREE.Mesh(bootGeometry, darkMetalMaterial);
    boot.position.set(0, -1.34, 0.12);
    boot.castShadow = true;
    knee.add(boot);

    root.add(hip);
    return { hip, knee };
  }
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  // ------------------------------------------------------------------ torso
  const torso = new THREE.Group();
  torso.position.y = 2.9;
  root.add(torso);

  const pelvis = new THREE.Mesh(pelvisGeometry, leatherMaterial);
  pelvis.position.y = 0.28;
  pelvis.castShadow = true;
  torso.add(pelvis);

  // The fur kilt is the character's widest silhouette below the belt.
  const kilt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.15, 1.35, 10, 1, true),
    furMaterial
  );
  kilt.position.y = -0.12;
  kilt.castShadow = true;
  torso.add(kilt);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 1.08), leatherMaterial);
  belt.position.y = 0.56;
  belt.castShadow = true;
  torso.add(belt);

  const chest = new THREE.Mesh(chestGeometry, skinMaterial);
  chest.position.y = 1.28;
  chest.castShadow = true;
  torso.add(chest);
  const chestOutline = new THREE.Mesh(chestGeometry, outlineMaterial);
  chestOutline.scale.setScalar(1.035);
  chest.add(chestOutline);

  // A single leather baldric across the chest.
  const baldric = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.8, 0.1), leatherMaterial);
  baldric.position.set(0.1, 1.3, 0.51);
  baldric.rotation.z = -0.5;
  torso.add(baldric);

  // Red war paint down the left side of the chest and back.
  const chestTattoo = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.25, 0.07), tattooMaterial);
  chestTattoo.position.set(-0.36, 1.3, 0.5);
  chestTattoo.rotation.z = 0.12;
  torso.add(chestTattoo);

  const backTattoo = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.35, 0.07), tattooMaterial);
  backTattoo.position.set(-0.28, 1.28, -0.5);
  torso.add(backTattoo);

  // Left pauldron + fur mantle.
  const pauldron = new THREE.Mesh(shoulderGeometry, armorMaterial);
  pauldron.position.set(-0.98, 1.78, 0);
  pauldron.scale.set(1.25, 1.1, 1.2);
  pauldron.castShadow = true;
  torso.add(pauldron);

  const mantle = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.72, 0),
    furMaterial
  );
  mantle.position.set(-0.7, 1.95, -0.25);
  mantle.scale.set(1.6, 0.55, 1.1);
  mantle.rotation.z = 0.2;
  torso.add(mantle);

  // ------------------------------------------------------------------- arms
  function makeArm(side: -1 | 1) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.0, 1.62, 0);
    pivot.rotation.z = side * 0.12;
    torso.add(pivot);

    const upper = new THREE.Mesh(armGeometry, skinMaterial);
    upper.position.y = -0.5;
    upper.castShadow = true;
    pivot.add(upper);
    const upperOutline = new THREE.Mesh(armGeometry, outlineMaterial);
    upperOutline.scale.setScalar(1.1);
    upper.add(upperOutline);

    const elbow = new THREE.Group();
    elbow.position.y = -1.0;
    pivot.add(elbow);

    const bracer = new THREE.Mesh(forearmGeometry, leatherMaterial);
    bracer.position.y = -0.48;
    bracer.castShadow = true;
    elbow.add(bracer);

    const hand = new THREE.Group();
    hand.position.y = -1.0;
    elbow.add(hand);

    const fist = new THREE.Mesh(handGeometry, skinMaterial);
    fist.castShadow = true;
    hand.add(fist);

    return { pivot, elbow, hand };
  }
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // Shield strapped to the left forearm.
  const shield = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.72, 0.14, 16),
    armorMaterial
  );
  shield.rotation.z = Math.PI / 2;
  shield.position.set(-0.28, -0.55, 0);
  shield.castShadow = true;
  leftArm.elbow.add(shield);

  const shieldBoss = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 8, 6),
    armorMaterial
  );
  shieldBoss.position.set(-0.4, -0.55, 0);
  leftArm.elbow.add(shieldBoss);

  // ------------------------------------------------------------------ head
  const head = new THREE.Group();
  head.position.y = 2.18;
  torso.add(head);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.4, 8), skinMaterial);
  neck.position.y = -0.35;
  head.add(neck);

  const skull = new THREE.Mesh(headGeometry, skinMaterial);
  skull.position.y = 0.12;
  skull.castShadow = true;
  head.add(skull);
  const skullOutline = new THREE.Mesh(headGeometry, outlineMaterial);
  skullOutline.scale.setScalar(1.08);
  skull.add(skullOutline);

  // Heavy brow.
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.14, 0.24), skinMaterial);
  brow.position.set(0, 0.26, 0.42);
  head.add(brow);

  // Kratos' beard: a broad wedge under the jaw.
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.0, 6), beardMaterial);
  beard.position.set(0, -0.28, 0.2);
  beard.rotation.x = Math.PI;
  beard.castShadow = true;
  head.add(beard);

  const moustache = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.22), beardMaterial);
  moustache.position.set(0, -0.05, 0.45);
  head.add(moustache);

  // The red stripe over the left eye and skull.
  const faceStripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.05, 0.08), tattooMaterial);
  faceStripe.position.set(-0.18, 0.22, 0.53);
  faceStripe.rotation.z = 0.48;
  head.add(faceStripe);

  const scalpStripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.08), tattooMaterial);
  scalpStripe.position.set(-0.05, 0.55, 0.36);
  scalpStripe.rotation.z = 0.35;
  head.add(scalpStripe);

  // Eyes, with a faint storm-blue glint.
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fe7ff,
    emissive: 0x3fb7d6,
    emissiveIntensity: 1.6,
  });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), eyeMaterial);
    eye.position.set(side * 0.2, 0.14, 0.52);
    head.add(eye);
  }

  // ------------------------------------------------------------------ weapons
  const axe = buildAxe();
  axe.scale.setScalar(1.25);
  axe.position.set(0.15, -0.15, 0.15);
  axe.rotation.z = 0.28;
  rightArm.hand.add(axe);

  const sword = buildSword();
  sword.visible = false;
  rightArm.hand.add(sword);

  // -------------------------------------------------- floating status for others
  let healthFill: THREE.Mesh | null = null;
  let status: THREE.Group | null = null;
  if (!isSelf) {
    status = new THREE.Group();
    status.position.y = 7.2;
    root.add(status);

    const barBack = new THREE.Mesh(
      barGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x101a15,
        transparent: true,
        opacity: 0.75,
        depthTest: false,
      })
    );
    barBack.renderOrder = 20;
    status.add(barBack);

    healthFill = new THREE.Mesh(
      barFillGeometry,
      new THREE.MeshBasicMaterial({ color: 0x66d97a, depthTest: false })
    );
    healthFill.position.z = 0.01;
    healthFill.renderOrder = 21;
    status.add(healthFill);

    const nameSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeNameTexture(label),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      })
    );
    nameSprite.scale.set(3.6, 0.9, 1);
    nameSprite.position.y = 0.8;
    nameSprite.renderOrder = 22;
    status.add(nameSprite);
  }

  const state = {
    phase: Math.random() * Math.PI * 2,
    yaw: Math.random() * Math.PI * 2,
    attackTimer: 0,
    attackDuration: 0.48,
  };

  const fillColor = new THREE.Color();

  return {
    group: root,
    attack(duration = 0.48) {
      if (state.attackTimer <= 0) {
        state.attackTimer = duration;
        state.attackDuration = duration;
      }
    },
    setWeapon(weapon) {
      axe.visible = weapon !== 1;
      sword.visible = weapon === 1;
    },
    update(dt, elapsed, vx, vy, health, camera, raging) {
      const speed = Math.min(1, Math.hypot(vx, vy) / PLAYER_SPEED);

      if (speed > 0.04) {
        const target = Math.atan2(vx, vy);
        let delta = target - state.yaw;
        while (delta > Math.PI) { delta -= Math.PI * 2; }
        while (delta < -Math.PI) { delta += Math.PI * 2; }
        state.yaw += delta * Math.min(1, dt * 14);
      }
      root.rotation.y = state.yaw;

      state.phase += dt * (4.5 + speed * 8.5);
      state.attackTimer = Math.max(0, state.attackTimer - dt);

      const swing = Math.sin(state.phase) * speed;
      const bounce = Math.abs(Math.sin(state.phase)) * 0.14 * speed;

      leftLeg.hip.rotation.x = swing * 0.95;
      rightLeg.hip.rotation.x = -swing * 0.95;
      leftLeg.knee.rotation.x = Math.max(0, -swing) * 0.9;
      rightLeg.knee.rotation.x = Math.max(0, swing) * 0.9;

      const attackProgress = state.attackTimer > 0
        ? 1 - state.attackTimer / state.attackDuration
        : 0;
      const attackSwing = state.attackTimer > 0
        ? Math.sin(attackProgress * Math.PI) * 2.2
        : 0;

      leftArm.pivot.rotation.x = -swing * 0.7;
      rightArm.pivot.rotation.x = swing * 0.7 - attackSwing;
      rightArm.pivot.rotation.z = 0.12 - attackSwing * 0.4;
      leftArm.elbow.rotation.x = 0.25 + Math.max(0, -swing) * 0.3;
      rightArm.elbow.rotation.x = 0.25 + Math.max(0, swing) * 0.3 + attackSwing * 0.4;

      torso.rotation.x = 0.04 + speed * 0.14;
      torso.rotation.y = Math.sin(state.phase) * 0.07 * speed + attackSwing * 0.2;
      torso.position.y = 2.9 + bounce;
      head.rotation.x = -0.04 - speed * 0.08 + Math.sin(elapsed * 1.7) * 0.02;

      const idle = 1 + Math.sin(elapsed * 1.9 + state.phase * 0.02) * 0.012 * (1 - speed);
      chest.scale.y = idle;

      if (selfRing) {
        selfRing.rotation.z += dt * 0.6;
        selfRing.scale.setScalar(1 + Math.sin(elapsed * 2.4) * 0.06);
        (selfRing.material as THREE.MeshBasicMaterial).color.setHex(raging ? 0xff4a2a : 0xffc45e);
      }

      shadow.position.y = 0.035 - bounce;

      if (status && healthFill) {
        status.quaternion.copy(camera.quaternion);
        const ratio = Math.max(0, Math.min(1, health / 100));
        healthFill.scale.x = Math.max(0.001, ratio);
        healthFill.position.x = -(1 - ratio) * 1.25;
        fillColor.setHSL(0.32 * ratio, 0.7, 0.52);
        (healthFill.material as THREE.MeshBasicMaterial).color.copy(fillColor);
      }
    },
  };
}
