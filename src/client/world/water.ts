import * as THREE from "three";

const waterVertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    vec3 p = position;
    vec2 p2 = p.xy;
    float wave =
      sin(p2.x * 0.022 + uTime * 0.75) * 0.42 +
      sin(p2.y * 0.031 - uTime * 0.95) * 0.3 +
      sin((p2.x + p2.y) * 0.011 + uTime * 0.45) * 0.5;
    p.z += wave;

    // Approximate the normal from the analytic derivative of the waves.
    float dx = cos(p2.x * 0.022 + uTime * 0.75) * 0.42 * 0.022 +
               cos((p2.x + p2.y) * 0.011 + uTime * 0.45) * 0.5 * 0.011;
    float dy = cos(p2.y * 0.031 - uTime * 0.95) * 0.3 * 0.031 +
               cos((p2.x + p2.y) * 0.011 + uTime * 0.45) * 0.5 * 0.011;
    vNormal = normalize(mat3(modelMatrix) * normalize(vec3(-dx, -dy, 1.0)));

    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const waterFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uStorm;
  uniform float uFlash;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
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
    for (int i = 0; i < 4; i++) {
      v += noise(p) * a;
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vWorld.xz;
    float radius = length(p);

    // Stylised depth: bright turquoise near the island, deep blue outward.
    vec3 color = mix(uShallow, uDeep, smoothstep(720.0, 1500.0, radius));
    color = mix(color, vec3(0.05, 0.12, 0.22), uStorm * 0.6);

    // Wind-Waker foam: wandering contour bands plus a noisy shoreline lace.
    float warp = fbm(p * 0.0065 + vec2(uTime * 0.025, -uTime * 0.02));
    float band = sin((p.x * 0.7 + p.y * 0.9) * 0.013 + warp * 10.0 + uTime * 0.5);
    float foam = smoothstep(0.9, 1.0, band) * 0.72;

    float band2 = sin((p.x * -0.5 + p.y * 0.8) * 0.0075 - warp * 7.0 - uTime * 0.35);
    foam += smoothstep(0.93, 1.0, band2) * 0.45;

    float shore = smoothstep(840.0, 770.0, radius);
    foam += shore * smoothstep(0.3, 0.72, warp) * 0.9;

    foam *= 1.0 - uStorm * 0.45;
    color = mix(color, uFoam, clamp(foam, 0.0, 1.0));

    // Hard toon specular from the sun.
    vec3 viewDir = normalize(cameraPosition - vWorld);
    vec3 normal = normalize(vNormal);
    vec3 reflectDir = reflect(-normalize(uSunDirection), normal);
    float spec = pow(max(dot(reflectDir, viewDir), 0.0), 70.0);
    spec = step(0.35, spec) * spec;
    color += uSunColor * spec * (1.1 - uStorm * 0.7);
    color += vec3(0.45, 0.62, 1.0) * uFlash * 0.18;

    // Blend into the same fog as the rest of the world.
    float distanceToCamera = length(cameraPosition - vWorld);
    float fog = smoothstep(uFogNear, uFogFar, distanceToCamera);
    color = mix(color, uFogColor, fog);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export interface WaterSystem {
  mesh: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uDeep: { value: THREE.Color };
    uShallow: { value: THREE.Color };
    uFoam: { value: THREE.Color };
    uSunDirection: { value: THREE.Vector3 };
    uSunColor: { value: THREE.Color };
    uFogColor: { value: THREE.Color };
    uFogNear: { value: number };
    uFogFar: { value: number };
    uStorm: { value: number };
    uFlash: { value: number };
  };
  update(dt: number, storm: number, flash: number): void;
}

export function createWater(sunDirection: THREE.Vector3): WaterSystem {
  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x081b3a) },
    uShallow: { value: new THREE.Color(0x157a86) },
    uFoam: { value: new THREE.Color(0xcfeae4) },
    uSunDirection: { value: sunDirection.clone() },
    uSunColor: { value: new THREE.Color(0xffb877) },
    uFogColor: { value: new THREE.Color(0x6f5268) },
    uFogNear: { value: 220 },
    uFogFar: { value: 1100 },
    uStorm: { value: 0 },
    uFlash: { value: 0 },
  };

  const geometry = new THREE.PlaneGeometry(9000, 9000, 180, 180);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -2.2;
  mesh.frustumCulled = false;

  let time = 0;
  return {
    mesh,
    uniforms,
    update(dt, storm, flash) {
      time += dt;
      uniforms.uTime.value = time;
      uniforms.uStorm.value = storm;
      uniforms.uFlash.value = flash;
    },
  };
}
