import * as THREE from "three";
import { PLAYER_SPEED } from "../../shared/constants.js";
import { makeGlowTexture, makeNameTexture, makeToonGradient } from "./textures.js";

const toonGradient = makeToonGradient();
const outlineMaterial = new THREE.MeshBasicMaterial({
  color: 0x0c0b0a,
  side: THREE.BackSide,
});

// A dark-skinned storm warrior, built for silhouettes at chase-camera distance.
const skinMaterial = new THREE.MeshToonMaterial({ color: 0x6e4630, gradientMap: toonGradient });
const leatherMaterial = new THREE.MeshToonMaterial({ color: 0x2b211d, gradientMap: toonGradient });
const pantsMaterial = new THREE.MeshToonMaterial({ color: 0x1c2028, gradientMap: toonGradient });
const RAGE_RING = new THREE.Color(0xff4a2a);
const silverMaterial = new THREE.MeshStandardMaterial({
  color: 0xc4ccd5,
  metalness: 0.88,
  roughness: 0.28,
});
const darkSilverMaterial = new THREE.MeshStandardMaterial({
  color: 0x737d87,
  metalness: 0.8,
  roughness: 0.36,
});
const dreadMaterial = new THREE.MeshToonMaterial({ color: 0x1a1411, gradientMap: toonGradient });
const lightningMaterial = new THREE.MeshStandardMaterial({
  color: 0xaef4ff,
  emissive: 0x2fb6ff,
  emissiveIntensity: 2.8,
  roughness: 0.22,
});
const chainMaterial = new THREE.MeshStandardMaterial({
  color: 0x9aa4ae,
  metalness: 0.92,
  roughness: 0.32,
});
const bladeMaterial = new THREE.MeshStandardMaterial({
  color: 0x8d99a6,
  metalness: 0.85,
  roughness: 0.26,
});
const scytheGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0x5fdcff,
  transparent: true,
  opacity: 0.5,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  depthWrite: false,
});
const gearMaterial = new THREE.MeshStandardMaterial({
  color: 0xb8c0c8,
  metalness: 0.92,
  roughness: 0.3,
});

const armorMaterial = new THREE.MeshToonMaterial({ color: 0x5f636b, gradientMap: toonGradient });
const darkMetalMaterial = new THREE.MeshToonMaterial({ color: 0x262b31, gradientMap: toonGradient });
const axeSteelMaterial = new THREE.MeshToonMaterial({ color: 0xa7b2be, gradientMap: toonGradient });
const axeRuneMaterial = new THREE.MeshStandardMaterial({
  color: 0x9ff6ff,
  emissive: 0x54d8ff,
  emissiveIntensity: 1.2,
  roughness: 0.3,
});
const eyeMaterial = new THREE.MeshStandardMaterial({
  color: 0xd8faff,
  emissive: 0x36b8ff,
  emissiveIntensity: 3.6,
  roughness: 0.2,
});

const legGeometry = new THREE.CapsuleGeometry(0.3, 0.7, 4, 8);
const shinGeometry = new THREE.CapsuleGeometry(0.27, 0.78, 4, 8);
const bootGeometry = new THREE.BoxGeometry(0.72, 0.56, 1.16);
const armGeometry = new THREE.CapsuleGeometry(0.25, 0.55, 4, 8);
const forearmGeometry = new THREE.CapsuleGeometry(0.23, 0.52, 4, 8);
const handGeometry = new THREE.SphereGeometry(0.26, 8, 6);
const chestGeometry = new THREE.BoxGeometry(1.7, 1.55, 0.98);
const pelvisGeometry = new THREE.BoxGeometry(1.45, 0.66, 0.9);
const headGeometry = new THREE.SphereGeometry(0.55, 14, 12);
const barGeometry = new THREE.PlaneGeometry(2.6, 0.28);
const barFillGeometry = new THREE.PlaneGeometry(2.5, 0.18);
const ringGeometry = new THREE.RingGeometry(1.7, 2.1, 44);
const shadowGeometry = new THREE.PlaneGeometry(3.8, 2.5);
const dreadGeometry = new THREE.CylinderGeometry(0.055, 0.12, 1.15, 5);
const gearDiscGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.07, 10);
const gearToothGeometry = new THREE.BoxGeometry(0.07, 0.08, 0.09);
const chainLinkGeometry = new THREE.TorusGeometry(0.1, 0.028, 4, 8);
const clothStripGeometry = new THREE.PlaneGeometry(0.3, 1.0);

const shadowMaterial = new THREE.MeshBasicMaterial({
  map: makeGlowTexture(),
  color: 0x000000,
  transparent: true,
  opacity: 0.38,
  depthWrite: false,
});

const scytheGeometry = (() => {
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

export interface CharacterRig {
  group: THREE.Group;
  attack(duration?: number): void;
  setWeapon(weapon: number): void;
  throwChain(): void;
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

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 2.9, 7), leatherMaterial);
  handle.castShadow = true;
  axe.add(handle);

  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 7), armorMaterial);
  guard.position.y = 1.0;
  axe.add(guard);

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
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 2.1, 0.115), lightningMaterial);
    strip.position.set(side * 0.1, 2.25, 0);
    sword.add(strip);
  }

  const crossRune = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.12), lightningMaterial);
  crossRune.position.y = 0.92;
  sword.add(crossRune);

  sword.position.set(0.12, 0.25, 0.12);
  sword.rotation.z = 0.08;
  return sword;
}

function buildChainBlade(side: -1 | 1): THREE.Group {
  const group = new THREE.Group();

  const start = new THREE.Vector3(0, 0, 0);
  const mid = new THREE.Vector3(side * 0.18, -0.75, 0.18);
  const end = new THREE.Vector3(side * 0.38, -1.55, 0.42);

  for (let i = 1; i <= 7; i++) {
    const t = i / 8;
    const a = start.clone().lerp(mid, t);
    const b = mid.clone().lerp(end, t);
    const point = a.lerp(b, t);
    const link = new THREE.Mesh(chainLinkGeometry, chainMaterial);
    link.position.copy(point);
    link.rotation.set(
      Math.PI / 2 + (i % 2 === 0 ? 0.5 : -0.5),
      side * 0.3 + i * 0.22,
      Math.PI / 2
    );
    link.scale.setScalar(0.9 + i * 0.03);
    group.add(link);
  }

  const blade = new THREE.Mesh(scytheGeometry, bladeMaterial);
  blade.position.copy(end).add(new THREE.Vector3(0, -0.25, 0.1));
  blade.rotation.set(0.1, side * Math.PI * 0.5, side * -0.38);
  blade.scale.setScalar(1.05);
  blade.castShadow = true;
  group.add(blade);

  const glow = new THREE.Mesh(scytheGeometry, scytheGlowMaterial);
  glow.position.copy(blade.position);
  glow.rotation.copy(blade.rotation);
  glow.scale.copy(blade.scale).multiplyScalar(1.08);
  group.add(glow);

  for (let i = 0; i < 3; i++) {
    const spark = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.035), lightningMaterial);
    spark.position.set(
      side * (0.45 + i * 0.13),
      -1.58 + i * 0.14,
      0.28
    );
    spark.rotation.z = side * (0.7 + i * 0.25);
    group.add(spark);
  }

  const glowSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: 0x3fc8ff,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  glowSprite.scale.setScalar(1.1);
  glowSprite.position.copy(end).add(new THREE.Vector3(0, -0.25, 0.1));
  group.add(glowSprite);

  return group;
}

function makeSpiral(radius = 0.3, turns = 2.1): THREE.Mesh {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 44; i++) {
    const t = i / 44;
    const angle = t * Math.PI * 2 * turns;
    const r = 0.04 + t * radius;
    points.push(new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, 0));
  }
  const geometry = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points),
    44,
    0.022,
    4,
    false
  );
  return new THREE.Mesh(geometry, darkSilverMaterial);
}

function makeGear(radiusScale = 1): THREE.Group {
  const gear = new THREE.Group();
  const disc = new THREE.Mesh(gearDiscGeometry, gearMaterial);
  disc.rotation.z = Math.PI / 2;
  disc.scale.setScalar(radiusScale);
  gear.add(disc);

  for (let i = 0; i < 8; i++) {
    const tooth = new THREE.Mesh(gearToothGeometry, gearMaterial);
    const angle = (i / 8) * Math.PI * 2;
    tooth.position.set(0, Math.cos(angle) * 0.17 * radiusScale, Math.sin(angle) * 0.17 * radiusScale);
    tooth.rotation.x = angle;
    gear.add(tooth);
  }

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6), lightningMaterial);
  hub.rotation.z = Math.PI / 2;
  gear.add(hub);
  return gear;
}

export function createCharacter(options: {
  isSelf: boolean;
  sessionId: string;
  label: string;
  color: string;
}): CharacterRig {
  const { isSelf, sessionId, label, color } = options;
  const chosenColor = new THREE.Color(color || "#1d2f4d");
  const clothMaterial = new THREE.MeshToonMaterial({
    color: chosenColor,
    gradientMap: toonGradient,
    side: THREE.DoubleSide,
  });
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
        color: chosenColor,
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

  const gears: THREE.Group[] = [];

  // ------------------------------------------------------------------- legs
  function makeLeg(side: -1 | 1) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.48, 2.9, 0);

    const thigh = new THREE.Mesh(legGeometry, pantsMaterial);
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

    for (let i = 0; i < 3; i++) {
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8), pantsMaterial);
      wrap.position.y = -0.4 - i * 0.2;
      knee.add(wrap);
    }

    const boot = new THREE.Mesh(bootGeometry, darkMetalMaterial);
    boot.position.set(0, -1.28, 0.14);
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

  const pelvis = new THREE.Mesh(pelvisGeometry, pantsMaterial);
  pelvis.position.y = 0.28;
  pelvis.castShadow = true;
  torso.add(pelvis);

  const kilt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.15, 1.35, 10, 1, true),
    clothMaterial
  );
  kilt.position.y = -0.12;
  kilt.castShadow = true;
  torso.add(kilt);

  // Tattered storm-blue strips hanging from the belt.
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + 0.2;
    const strip = new THREE.Mesh(clothStripGeometry, clothMaterial);
    strip.position.set(
      Math.cos(angle) * 0.92,
      0.05 - (i % 3) * 0.18,
      Math.sin(angle) * 0.92
    );
    strip.rotation.y = -angle + Math.PI / 2;
    strip.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.06;
    strip.scale.y = 0.75 + (i % 4) * 0.16;
    strip.castShadow = true;
    torso.add(strip);
  }

  const belt = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.34, 1.1), leatherMaterial);
  belt.position.y = 0.56;
  belt.castShadow = true;
  torso.add(belt);

  const buckle = makeSpiral(0.15, 1.8);
  buckle.position.set(0, 0.56, 0.58);
  torso.add(buckle);

  const chest = new THREE.Mesh(chestGeometry, leatherMaterial);
  chest.position.y = 1.28;
  chest.castShadow = true;
  torso.add(chest);
  const chestOutline = new THREE.Mesh(chestGeometry, outlineMaterial);
  chestOutline.scale.setScalar(1.035);
  chest.add(chestOutline);

  // Dark leather chest plate and its straps.
  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(1.42, 1.15, 0.2), leatherMaterial);
  chestPlate.position.set(0, 1.34, 0.56);
  chestPlate.castShadow = true;
  torso.add(chestPlate);

  for (const side of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.65, 0.11), leatherMaterial);
    strap.position.set(side * 0.28, 1.3, 0.68);
    strap.rotation.z = side * 0.26;
    torso.add(strap);

    const bucklePlate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.06), darkSilverMaterial);
    bucklePlate.position.set(side * 0.28, 1.55, 0.76);
    torso.add(bucklePlate);
  }

  // Silver pauldrons with raised storm spirals, front and back.
  for (const side of [-1, 1]) {
    const pauldron = new THREE.Group();
    pauldron.position.set(side * 1.0, 1.8, 0);

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.62),
      silverMaterial
    );
    shell.scale.set(1.25, 0.95, 1.15);
    shell.castShadow = true;
    pauldron.add(shell);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.055, 5, 18), darkSilverMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.02;
    pauldron.add(rim);

    for (const zSide of [-1, 1]) {
      const spiral = makeSpiral(0.28, 2.0);
      spiral.position.set(side * 0.08, 0.14, zSide * 0.46);
      spiral.rotation.y = zSide < 0 ? Math.PI : 0;
      pauldron.add(spiral);
    }

    torso.add(pauldron);
  }

  // ------------------------------------------------------------------- arms
  function makeArm(side: -1 | 1) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.0, 1.62, 0);
    pivot.rotation.z = side * 0.14;
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

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.18), silverMaterial);
    plate.position.set(side * 0.1, -0.45, 0.18);
    elbow.add(plate);

    // Mechanical gears on the outside of the bracer.
    for (let i = 0; i < 2; i++) {
      const gear = makeGear(i === 0 ? 1 : 0.7);
      gear.position.set(side * 0.29, -0.4 - i * 0.26, 0);
      elbow.add(gear);
      gears.push(gear);
    }

    // Crackling blue veins on the forearm.
    for (let i = 0; i < 4; i++) {
      const vein = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.38, 0.03), lightningMaterial);
      vein.position.set(
        side * (0.12 + (i % 2) * 0.11),
        -0.25 - i * 0.15,
        0.25
      );
      vein.rotation.z = side * (0.15 + i * 0.1);
      elbow.add(vein);
    }

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

  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.14, 0.24), skinMaterial);
  brow.position.set(0, 0.26, 0.42);
  head.add(brow);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.16), skinMaterial);
  nose.position.set(0, 0.06, 0.55);
  head.add(nose);

  // Dreadlocks, gathered and tied at the back of the skull.
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 1.5 - Math.PI * 0.25;
    const dread = new THREE.Mesh(dreadGeometry, dreadMaterial);
    dread.position.set(
      Math.cos(angle) * 0.38,
      0.42 - (i % 3) * 0.09,
      -0.18 + Math.sin(angle) * 0.18
    );
    dread.rotation.set(-0.55 - (i % 3) * 0.12, 0, angle * 0.25);
    dread.castShadow = false;
    head.add(dread);
  }

  const hairTie = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 5, 10), leatherMaterial);
  hairTie.position.set(0, 0.18, -0.45);
  hairTie.rotation.x = Math.PI / 2;
  head.add(hairTie);

  // Bright blue eyes and their glow.
  const eyeGlowTexture = makeGlowTexture();
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 7, 6), eyeMaterial);
    eye.position.set(side * 0.2, 0.14, 0.52);
    head.add(eye);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: eyeGlowTexture,
        color: 0x56ccff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.scale.setScalar(0.28);
    glow.position.set(side * 0.2, 0.14, 0.57);
    head.add(glow);
  }

  // ------------------------------------------------------------------ weapons
  const axe = buildAxe();
  axe.scale.setScalar(1.25);
  axe.position.set(0.15, -0.15, 0.15);
  axe.rotation.z = 0.28;
  axe.visible = false;
  rightArm.hand.add(axe);

  const sword = buildSword();
  sword.visible = false;
  rightArm.hand.add(sword);

  const chainRight = buildChainBlade(1);
  const chainLeft = buildChainBlade(-1);
  rightArm.hand.add(chainRight);
  leftArm.hand.add(chainLeft);

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
    weapon: 2,
    throwTimer: 0,
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
      state.weapon = weapon;
      axe.visible = weapon === 0;
      sword.visible = weapon === 1;
      chainLeft.visible = weapon === 2;
      chainRight.visible = weapon === 2;
    },
    throwChain() {
      state.throwTimer = 0.62;
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

      leftArm.pivot.rotation.x = -swing * 0.7 + (state.weapon === 2 ? attackSwing : 0);
      rightArm.pivot.rotation.x = swing * 0.7 - attackSwing;
      rightArm.pivot.rotation.z = 0.14 - attackSwing * 0.4;
      leftArm.elbow.rotation.x = 0.25 + Math.max(0, -swing) * 0.3;
      rightArm.elbow.rotation.x = 0.25 + Math.max(0, swing) * 0.3 + attackSwing * 0.4;

      state.throwTimer = Math.max(0, state.throwTimer - dt);
      const throwing = state.throwTimer > 0;
      if (state.weapon === 2) {
        chainLeft.visible = !throwing;
        chainRight.visible = !throwing;
      }
      if (throwing) {
        leftArm.pivot.rotation.x = -1.15;
        rightArm.pivot.rotation.x = -1.15;
        leftArm.pivot.rotation.z = -0.28;
        rightArm.pivot.rotation.z = 0.28;
      }

      torso.rotation.x = 0.04 + speed * 0.14;
      torso.rotation.y = Math.sin(state.phase) * 0.07 * speed + attackSwing * 0.2;
      torso.position.y = 2.9 + bounce;
      head.rotation.x = -0.04 - speed * 0.08 + Math.sin(elapsed * 1.7) * 0.02;

      const idle = 1 + Math.sin(elapsed * 1.9 + state.phase * 0.02) * 0.012 * (1 - speed);
      chest.scale.y = idle;

      for (let i = 0; i < gears.length; i++) {
        gears[i].rotation.x += dt * (i % 2 === 0 ? 1.8 : -2.4);
      }
      lightningMaterial.emissiveIntensity = 2.1 + Math.sin(elapsed * 11) * 0.8;

      if (selfRing) {
        selfRing.rotation.z += dt * 0.6;
        selfRing.scale.setScalar(1 + Math.sin(elapsed * 2.4) * 0.06);
        (selfRing.material as THREE.MeshBasicMaterial).color.copy(raging ? RAGE_RING : chosenColor);
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
