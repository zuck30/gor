import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const finalShader: {
  uniforms: Record<string, THREE.IUniform>;
  vertexShader: string;
  fragmentShader: string;
} = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDamage: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDamage;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p + 19.19);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 dir = vUv - 0.5;
      float dist = length(dir);

      // Gentle lens split towards the edges.
      float aberration = 0.0016 * dist * dist;
      vec3 color;
      color.r = texture2D(tDiffuse, vUv + dir * aberration).r;
      color.g = texture2D(tDiffuse, vUv).g;
      color.b = texture2D(tDiffuse, vUv - dir * aberration).b;

      // Warm highlights, softly cooled shadows.
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(color * vec3(0.93, 0.97, 1.06), color * vec3(1.05, 1.01, 0.93), smoothstep(0.15, 0.8, luma));

      // Vignette + a whisper of film grain.
      float vignette = smoothstep(0.95, 0.3, dist);
      color *= mix(0.68, 1.0, vignette);
      color += (hash(vUv * uResolution + uTime * 47.0) - 0.5) * 0.018;

      // Storm burn around the rim while you are outside the circle.
      float edge = smoothstep(0.18, 0.9, dist);
      color = mix(color, vec3(0.62, 0.03, 0.05), uDamage * edge * 0.6);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export interface PostFX {
  render(dt: number, elapsed: number, damage: number): void;
  resize(width: number, height: number): void;
}

export function createPostFX(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  pixelRatio = Math.min(window.devicePixelRatio, 2)
): PostFX {
  const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloom = new UnrealBloomPass(size, 0.34, 0.55, 0.92);
  composer.addPass(bloom);

  const finalPass = new ShaderPass(finalShader);
  finalPass.uniforms.uResolution.value.copy(size);
  composer.addPass(finalPass);

  const output = new OutputPass();
  composer.addPass(output);

  composer.setSize(size.x, size.y);

  return {
    render(dt, elapsed, damage) {
      finalPass.uniforms.uTime.value = elapsed;
      finalPass.uniforms.uDamage.value = damage;
      composer.render(dt);
    },
    resize(width, height) {
      size.set(width, height);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      finalPass.uniforms.uResolution.value.set(width, height);
      bloom.setSize(width, height);
    },
  };
}
