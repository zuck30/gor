import * as THREE from "three";
import { makeGlowTexture, makeMoonTexture } from "./textures.js";
import { mulberry32 } from "./noise.js";

const skyVertex = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uStormZenith;
  uniform vec3 uStormHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uStorm;
  uniform float uFlash;
  uniform float uTime;

  varying vec3 vDirection;

  float hash(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += noise(p) * a;
      p *= 2.05;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDirection);
    float height = clamp(dir.y, 0.0, 1.0);

    vec3 calm = mix(uHorizon, uZenith, pow(height, 0.52));
    vec3 dark = mix(uStormHorizon, uStormZenith, pow(height, 0.72));
    vec3 color = mix(calm, dark, uStorm * 0.92);

    // Wide warm halo, then the sun's core.
    float alignment = max(dot(dir, normalize(uSunDirection)), 0.0);
    color += uSunColor * pow(alignment, 7.0) * (0.34 * (1.0 - uStorm * 0.55));
    color += uSunColor * pow(alignment, 480.0) * 3.2;

    // Aurora ribbons: two low bands with noise-driven folds.
    float azimuth = atan(dir.z, dir.x);
    float ribbon = fbm(vec2(azimuth * 1.8 + uTime * 0.018, dir.y * 3.2 - uTime * 0.012));
    float band1 = exp(-pow((dir.y - 0.14 - 0.04 * sin(azimuth * 2.2 + uTime * 0.03)) * 8.5, 2.0));
    float band2 = exp(-pow((dir.y - 0.27 - 0.045 * sin(azimuth * 1.4 - uTime * 0.022)) * 13.0, 2.0));
    float aurora = band1 * smoothstep(0.3, 0.78, ribbon) + band2 * smoothstep(0.42, 0.82, ribbon) * 0.7;
    aurora *= 1.0 - uStorm * 0.75;
    vec3 auroraColor = mix(vec3(0.18, 0.95, 0.58), vec3(0.45, 0.28, 1.0), ribbon);
    color += auroraColor * aurora * 0.85;

    // Storm lightning washes the whole dome for a couple of frames.
    color += vec3(0.55, 0.64, 1.0) * uFlash * (0.35 + height * 0.4);

    // A faint belt of haze just above the horizon line.
    color += vec3(0.04, 0.05, 0.04) * smoothstep(0.18, 0.0, height);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export interface SkySystem {
  group: THREE.Group;
  sunDirection: THREE.Vector3;
  update(dt: number, camera: THREE.Camera, storm: number, flash: number): void;
}

export function createSky(anisotropy: number): SkySystem {
  const group = new THREE.Group();
  const sunDirection = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(72),
    THREE.MathUtils.degToRad(32)
  );

  const uniforms = {
    uZenith: { value: new THREE.Color(0x0c1631) },
    uHorizon: { value: new THREE.Color(0x815d78) },
    uStormZenith: { value: new THREE.Color(0x070510) },
    uStormHorizon: { value: new THREE.Color(0x35203c) },
    uSunColor: { value: new THREE.Color(0xffb46a) },
    uSunDirection: { value: sunDirection.clone() },
    uStorm: { value: 0 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
  };

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(4200, 40, 22),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  group.add(dome);

  const glowTexture = makeGlowTexture();
  const sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xfff0bb,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
    })
  );
  sunSprite.scale.setScalar(480);
  sunSprite.renderOrder = -900;
  group.add(sunSprite);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffc978,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
    })
  );
  halo.scale.setScalar(1700);
  halo.renderOrder = -901;
  group.add(halo);

  // --- chunky Wind-Waker clouds -------------------------------------------
  const rng = mulberry32(20240607);
  const puffGeometry = new THREE.IcosahedronGeometry(1, 1);
  const puffMaterial = new THREE.MeshStandardMaterial({
    color: 0xc9c8dd,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    fog: false,
  });

  const clouds = new THREE.Group();
  const puffCount = 17 * 7;
  const puffs = new THREE.InstancedMesh(puffGeometry, puffMaterial, puffCount);
  puffs.frustumCulled = false;
  puffs.castShadow = false;
  puffs.receiveShadow = false;

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  let index = 0;

  for (let c = 0; c < 17; c++) {
    const angle = (c / 17) * Math.PI * 2 + rng() * 0.3;
    const radius = 780 + rng() * 1500;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const cy = 210 + rng() * 230;
    const size = 22 + rng() * 38;

    for (let p = 0; p < 7; p++) {
      const spread = size * 1.15;
      position.set(
        cx + (rng() - 0.5) * spread * 1.8,
        cy + (rng() - 0.5) * size * 0.55,
        cz + (rng() - 0.5) * spread * 1.8
      );
      scale.setScalar(size * (0.55 + rng() * 0.85));
      scale.y *= 0.72;
      quat.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
      matrix.compose(position, quat, scale);
      puffs.setMatrixAt(index, matrix);
      index++;
    }
  }
  puffs.instanceMatrix.needsUpdate = true;
  clouds.add(puffs);
  group.add(clouds);

  // --- stars ---------------------------------------------------------------
  const starCount = 1800;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starColor = new THREE.Color();
  for (let i = 0; i < starCount; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(0.02 + rng() * 0.95);
    const radius = 3950;
    starPositions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    starPositions[i * 3 + 1] = Math.cos(phi) * radius;
    starPositions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    starColor.setHSL(0.55 + rng() * 0.12, 0.3, 0.65 + rng() * 0.3);
    starColors[i * 3] = starColor.r;
    starColors[i * 3 + 1] = starColor.g;
    starColors[i * 3 + 2] = starColor.b;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      size: 2.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  stars.frustumCulled = false;
  group.add(stars);

  // --- a cold moon over the plaza -----------------------------------------
  const moonDirection = new THREE.Vector3()
    .setFromSphericalCoords(1, THREE.MathUtils.degToRad(74), THREE.MathUtils.degToRad(196))
    .multiplyScalar(3500);
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(165, 24, 16),
    new THREE.MeshBasicMaterial({ map: makeMoonTexture(anisotropy), color: 0xffffff, fog: false })
  );
  moon.position.copy(moonDirection);
  group.add(moon);

  const moonGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffe9c9,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  moonGlow.scale.setScalar(950);
  moonGlow.position.copy(moonDirection);
  group.add(moonGlow);

  const sunWorld = new THREE.Vector3();
  const clock = { t: 0 };

  return {
    group,
    sunDirection,
    update(dt, camera, storm, flash) {
      clock.t += dt;
      uniforms.uStorm.value = storm;
      uniforms.uFlash.value = flash;
      uniforms.uTime.value = clock.t;
      stars.rotation.y = clock.t * 0.002;
      (moon.material as THREE.MeshBasicMaterial).color.setHex(storm > 0.55 ? 0xd4c2b0 : 0xf3e2c4);
      puffMaterial.color.setRGB(1, 1, 1).lerp(new THREE.Color(0x554a6e), storm * 0.8);
      puffMaterial.emissive?.setRGB(0.02, 0.02, 0.03);

      // Keep the dome and the sun card centred on the camera.
      group.position.set(camera.position.x, 0, camera.position.z);

      sunWorld.copy(sunDirection).multiplyScalar(3300);
      sunWorld.y = Math.max(sunWorld.y, 120);
      sunSprite.position.copy(sunWorld);
      halo.position.copy(sunWorld);
      sunSprite.material.opacity = 0.95 * (1 - storm * 0.75);
      halo.material.opacity = 0.3 * (1 - storm * 0.7);

      clouds.position.x = Math.sin(clock.t * 0.004) * 80;
      clouds.position.z = Math.cos(clock.t * 0.003) * 60;
      puffs.rotation.y = clock.t * 0.0015;
    },
  };
}
