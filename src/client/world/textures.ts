import * as THREE from "three";
import { mulberry32 } from "./noise.js";

function canvas(size: number) {
  const el = document.createElement("canvas");
  el.width = size;
  el.height = size;
  const ctx = el.getContext("2d")!;
  return { el, ctx };
}

function finish(
  el: HTMLCanvasElement,
  anisotropy: number,
  repeat = 1,
  srgb = true
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = anisotropy;
  if (srgb) { texture.colorSpace = THREE.SRGBColorSpace; }
  return texture;
}

/**
 * A neutral, grainy detail map. Terrain is tinted by vertex colour, so this
 * texture supplies the fine "tooth" without stealing the palette.
 */
export function makeGroundDetail(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const { el, ctx } = canvas(size);
  const rng = mulberry32(1337);

  ctx.fillStyle = "#d9d9d9";
  ctx.fillRect(0, 0, size, size);

  // Broad tonal islands.
  for (let i = 0; i < 90; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 18 + rng() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = Math.floor(190 + rng() * 60);
    g.addColorStop(0, `rgba(${shade},${shade},${shade},0.5)`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Grass-blade flecks.
  for (let i = 0; i < 12000; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const h = 2 + rng() * 7;
    const shade = Math.floor(150 + rng() * 105);
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.18 + rng() * 0.4})`;
    ctx.lineWidth = 0.7 + rng() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 3, y - h);
    ctx.stroke();
  }

  return finish(el, anisotropy, 70);
}

/** Alpha-tested blades used by instanced grass tufts. */
export function makeBladeTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const { el, ctx } = canvas(size);
  const rng = mulberry32(991);

  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 9; i++) {
    const baseX = 18 + rng() * 92;
    const tipX = baseX + (rng() - 0.5) * 70;
    const tipY = 6 + rng() * 52;
    const width = 5 + rng() * 7;
    const g = ctx.createLinearGradient(0, size, 0, tipY);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(235,255,225,0.85)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(baseX - width, size);
    ctx.quadraticCurveTo(baseX - width * 0.35, (size + tipY) / 2, tipX, tipY);
    ctx.quadraticCurveTo(baseX + width * 0.35, (size + tipY) / 2, baseX + width, size);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** Soft radial sprite used for glows, dust, embers and the sun. */
export function makeGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const { el, ctx } = canvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.28, "rgba(255,255,255,0.75)");
  g.addColorStop(0.62, "rgba(255,255,255,0.16)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Glowing sigil rings painted onto the plaza floor. */
export function makeRuneTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const { el, ctx } = canvas(size);
  const rng = mulberry32(4242);
  const c = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "#ffe6a6";
  ctx.shadowColor = "#ffcf5c";
  ctx.shadowBlur = 18;

  const rings: Array<[number, number]> = [
    [0.96, 5],
    [0.86, 2],
    [0.62, 1.5],
    [0.4, 3],
    [0.18, 2],
  ];
  for (const [radius, width] of rings) {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(c, c, radius * c, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Radial ticks.
  ctx.lineWidth = 2;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r0 = c * (i % 6 === 0 ? 0.88 : 0.925);
    const r1 = c * 0.96;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.stroke();
  }

  // Glyphs between the rings.
  ctx.lineWidth = 3;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = c * 0.74;
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    const strokes = 2 + Math.floor(rng() * 3);
    ctx.beginPath();
    for (let s = 0; s < strokes; s++) {
      ctx.moveTo((rng() - 0.5) * 22, (rng() - 0.5) * 22);
      ctx.lineTo((rng() - 0.5) * 22, (rng() - 0.5) * 22);
    }
    ctx.stroke();
    ctx.restore();
  }

  return finish(el, anisotropy);
}

/** Blocky, hand-painted stone. */
export function makeStoneTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const { el, ctx } = canvas(size);
  const rng = mulberry32(606);

  ctx.fillStyle = "#8c8577";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 260; i++) {
    const shade = Math.floor(96 + rng() * 78);
    ctx.fillStyle = `rgba(${shade},${shade - 6},${shade - 18},${0.12 + rng() * 0.2})`;
    const w = 20 + rng() * 90;
    const h = 10 + rng() * 50;
    ctx.fillRect(rng() * size, rng() * size, w, h);
  }

  // Masonry seams.
  ctx.strokeStyle = "rgba(48,42,36,0.55)";
  ctx.lineWidth = 2;
  for (let row = 0; row < 8; row++) {
    const y = (row / 8) * size + 6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
    const offset = row % 2 === 0 ? 0 : size / 10;
    for (let x = offset; x < size; x += size / 5) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - size / 8);
      ctx.stroke();
    }
  }

  // Cracks and moss.
  ctx.strokeStyle = "rgba(38,34,30,0.5)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    let x = rng() * size;
    let y = rng() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (rng() - 0.5) * 44;
      y += (rng() - 0.5) * 44;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(74,104,58,0.20)";
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, 4 + rng() * 20, 0, Math.PI * 2);
    ctx.fill();
  }

  return finish(el, anisotropy, 2);
}

/** Cloth banner with a storm sigil. */
export function makeBannerTexture(anisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 384;
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  const ctx = el.getContext("2d")!;

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#b8352f");
  g.addColorStop(0.55, "#8f2526");
  g.addColorStop(1, "#5f171d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(255,214,128,0.92)";
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.36, 42, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#ffe3a1";
  ctx.lineWidth = 7;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const y = h * 0.36 + 8 + i * 26;
    ctx.moveTo(w * 0.22, y);
    ctx.bezierCurveTo(w * 0.4, y - 26, w * 0.6, y + 26, w * 0.78, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,214,128,0.75)";
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  const texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

export function makeNameTexture(name: string, color = "#d6b84a"): THREE.CanvasTexture {
  const w = 1024;
  const h = 256;
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  const ctx = el.getContext("2d")!;

  ctx.clearRect(0, 0, w, h);
  // Wide enough for a 16 character name at this size.
  ctx.font = "700 92px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 16;
  ctx.strokeStyle = "rgba(6,10,8,0.92)";
  ctx.strokeText(name, w / 2, h / 2 - 16);
  ctx.fillStyle = "#f7efdc";
  ctx.fillText(name, w / 2, h / 2 - 16);

  // A short bar in the warrior's chosen colour under the name.
  const width = Math.min(w - 80, Math.max(90, ctx.measureText(name).width * 0.62));
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillRect(w / 2 - width / 2, h / 2 + 50, width, 11);

  const texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Pale, cratered moon card. */
export function makeMoonTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const { el, ctx } = canvas(size);
  const rng = mulberry32(8181);
  const g = ctx.createRadialGradient(size * 0.38, size * 0.34, size * 0.08, size * 0.5, size * 0.5, size * 0.62);
  g.addColorStop(0, "#fff8e6");
  g.addColorStop(0.6, "#efe2c8");
  g.addColorStop(1, "#cbb89c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 90; i++) {
    const r = 4 + rng() * 34;
    const x = rng() * size;
    const y = rng() * size;
    const crater = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r);
    crater.addColorStop(0, "rgba(150,132,108,0.38)");
    crater.addColorStop(0.7, "rgba(170,150,124,0.18)");
    crater.addColorStop(1, "rgba(220,205,180,0)");
    ctx.fillStyle = crater;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** Three-step ramp for MeshToonMaterial. */
export function makeToonGradient(): THREE.DataTexture {
  const data = new Uint8Array([70, 150, 220, 255]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
