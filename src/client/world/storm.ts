import * as THREE from "three";

const wallVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const wallFragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uFlash;
  uniform vec3 uColorLow;
  uniform vec3 uColorHigh;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;

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
    float a = 0.55;
    for (int i = 0; i < 4; i++) {
      v += noise(p) * a;
      p *= 2.11;
      a *= 0.52;
    }
    return v;
  }

  void main() {
    float angle = atan(vWorld.z, vWorld.x);
    float spin = fbm(vec2(angle * 1.6 + uTime * 0.06, vWorld.y * 0.012 - uTime * 0.25));
    float detail = fbm(vec2(angle * 5.0 - uTime * 0.14, vWorld.y * 0.045 + uTime * 0.5));

    float heightFade =
      smoothstep(0.0, 0.05, vUv.y) *
      (1.0 - smoothstep(0.5, 1.0, vUv.y));

    // Far away the wall is a thin luminous ribbon; up close it is a storm.
    float wallDistance = length(cameraPosition - vWorld);
    float proximity = smoothstep(820.0, 190.0, wallDistance);

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), 2.2);

    vec3 color = mix(uColorLow, uColorHigh, clamp(spin * 0.85 + detail * 0.35, 0.0, 1.0));
    float ribbons = smoothstep(0.45, 0.82, detail) * 0.34;
    float alpha = (0.035 + spin * 0.13 + ribbons + rim * 0.3) * heightFade * uIntensity;
    alpha *= mix(0.22, 1.0, proximity);

    // Electric white filaments racing up the wall.
    float filament = smoothstep(0.76, 0.94, detail * (0.6 + uFlash * 0.7));
    color += vec3(0.72, 0.9, 1.0) * filament * (0.3 + uFlash * 1.6);
    alpha += filament * heightFade * 0.18 * uIntensity * mix(0.3, 1.0, proximity);

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.72));
  }
`;

export interface StormSystem {
  group: THREE.Group;
  update(
    dt: number,
    centreX: number,
    centreZ: number,
    radius: number,
    closing: boolean,
    intensity: number
  ): number;
}

export function createStorm(startRadius: number): StormSystem {
  const group = new THREE.Group();
  const WALL_HEIGHT = 170;

  const wallUniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 1 },
    uFlash: { value: 0 },
    uColorLow: { value: new THREE.Color(0x4b2a8c) },
    uColorHigh: { value: new THREE.Color(0x74d8ff) },
  };

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 192, 1, true),
    new THREE.ShaderMaterial({
      uniforms: wallUniforms,
      vertexShader: wallVertex,
      fragmentShader: wallFragment,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  wall.position.y = WALL_HEIGHT / 2;
  wall.scale.set(startRadius, WALL_HEIGHT, startRadius);
  wall.frustumCulled = false;
  wall.renderOrder = 5;
  group.add(wall);

  const innerUniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 0.65 },
    uFlash: { value: 0 },
    uColorLow: { value: new THREE.Color(0x2b1b5c) },
    uColorHigh: { value: new THREE.Color(0x3fb4e6) },
  };
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 128, 1, true),
    new THREE.ShaderMaterial({
      uniforms: innerUniforms,
      vertexShader: wallVertex,
      fragmentShader: wallFragment,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  inner.position.y = WALL_HEIGHT / 2 - 8;
  inner.scale.set(startRadius * 0.985, WALL_HEIGHT * 0.94, startRadius * 0.985);
  inner.frustumCulled = false;
  inner.renderOrder = 4;
  group.add(inner);

  // Ground glow: a soft disc under the wall plus a hard edge ring.
  const glowDisc = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1, 160),
    new THREE.MeshBasicMaterial({
      color: 0x8a63ff,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  glowDisc.rotation.x = -Math.PI / 2;
  glowDisc.position.y = 0.1;
  glowDisc.scale.setScalar(startRadius);
  group.add(glowDisc);

  const edgeRing = new THREE.Mesh(
    new THREE.RingGeometry(0.988, 1.006, 192),
    new THREE.MeshBasicMaterial({
      color: 0xb69bff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  edgeRing.rotation.x = -Math.PI / 2;
  edgeRing.position.y = 0.16;
  edgeRing.scale.setScalar(startRadius);
  group.add(edgeRing);

  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(1.012, 1.1, 192),
    new THREE.MeshBasicMaterial({
      color: 0x6d8dff,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.14;
  outerRing.scale.setScalar(startRadius);
  group.add(outerRing);

  // Pre-allocated lightning bolts.
  const boltMaterial = new THREE.LineBasicMaterial({
    color: 0xd6f2ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const bolts: Array<{ line: THREE.Line; life: number; angle: number }> = [];
  for (let i = 0; i < 3; i++) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(16 * 3);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(geometry, boltMaterial.clone());
    line.frustumCulled = false;
    line.renderOrder = 6;
    group.add(line);
    bolts.push({ line, life: 0, angle: 0 });
  }

  let time = 0;
  let flash = 0;
  let nextStrike = 2.5;
  let ringPulse = 0;

  return {
    group,
    update(dt, centreX, centreZ, radius, closing, intensity) {
      time += dt;
      ringPulse += dt;

      const boost = closing ? 1.35 : 1;
      wallUniforms.uTime.value = time;
      wallUniforms.uIntensity.value = intensity * boost;
      innerUniforms.uTime.value = time * 1.25;
      innerUniforms.uIntensity.value = intensity * boost * 0.8;

      group.position.set(centreX, 0, centreZ);
      wall.scale.set(radius, WALL_HEIGHT, radius);
      inner.scale.set(radius * 0.985, WALL_HEIGHT * 0.94, radius * 0.985);
      glowDisc.scale.setScalar(radius);
      edgeRing.scale.setScalar(radius);
      outerRing.scale.setScalar(radius);

      const pulse = 0.55 + Math.sin(ringPulse * 2.2) * 0.18 + (closing ? 0.12 : 0);
      (edgeRing.material as THREE.MeshBasicMaterial).opacity = pulse;
      (outerRing.material as THREE.MeshBasicMaterial).opacity = pulse * 0.25;
      (glowDisc.material as THREE.MeshBasicMaterial).opacity = (closing ? 0.16 : 0.09);

      // Lightning: more frequent while the wall is moving.
      nextStrike -= dt * (closing ? 1.8 : 0.7);
      if (nextStrike <= 0) {
        nextStrike = 2.2 + Math.random() * 4.5;
        flash = 1;
        const bolt = bolts[(Math.random() * bolts.length) | 0];
        bolt.life = 0.34;
        bolt.angle = Math.random() * Math.PI * 2;
      }
      flash = Math.max(0, flash - dt * 3.4);
      wallUniforms.uFlash.value = flash;
      innerUniforms.uFlash.value = flash;

      for (const bolt of bolts) {
        const material = bolt.line.material as THREE.LineBasicMaterial;
        if (bolt.life <= 0) {
          material.opacity = 0;
          continue;
        }
        bolt.life -= dt;
        material.opacity = Math.min(1, bolt.life * 4) * 0.95;

        const positions = bolt.line.geometry.attributes.position as THREE.BufferAttribute;
        const baseAngle = bolt.angle;
        let x = Math.cos(baseAngle) * radius * 0.997;
        let z = Math.sin(baseAngle) * radius * 0.997;
        const steps = positions.count;
        for (let i = 0; i < steps; i++) {
          const t = i / (steps - 1);
          const jitter = 10 + t * 26;
          x += (Math.random() - 0.5) * jitter;
          z += (Math.random() - 0.5) * jitter;
          positions.setXYZ(i, x, 6 + t * (WALL_HEIGHT * 0.82), z);
        }
        positions.needsUpdate = true;
      }

      return flash;
    },
  };
}
