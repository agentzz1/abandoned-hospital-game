import * as THREE from 'three';

// Procedural textures, generated once at startup. Generation blocks the main thread, so the
// expensive parts are shared: each material computes its height field once and derives the
// normal map from neighbouring height samples instead of re-running the noise per pixel.

function noise2D(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, y, scale) {
  const sx = x / scale, sy = y / scale;
  const ix = Math.floor(sx), iy = Math.floor(sy);
  const fx = sx - ix, fy = sy - iy;
  const a = noise2D(ix, iy), b = noise2D(ix + 1, iy);
  const c = noise2D(ix, iy + 1), d = noise2D(ix + 1, iy + 1);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Octaves whose cell size drops below ~0.75px only add sub-pixel noise, so they are skipped.
function fbm(x, y, octaves, scale) {
  const usable = Math.min(octaves, Math.max(1, Math.floor(Math.log2(scale / 0.75)) + 1));
  let val = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < usable; i++) {
    val += amp * smoothNoise(x * freq, y * freq, scale / freq);
    amp *= 0.5; freq *= 2;
  }
  return val;
}

function heightField(size, fn) {
  const h = new Float32Array(size * size);
  for (let y = 0, i = 0; y < size; y++) for (let x = 0; x < size; x++, i++) h[i] = fn(x, y);
  return h;
}

// Fills a canvas by calling fn(x, y, out) per pixel; fn writes r, g, b (and optionally a) into out.
function paint(size, fn) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const out = [0, 0, 0, 255];
  for (let y = 0, i = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i += 4) {
      out[3] = 255;
      fn(x, y, out);
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Normal map from height differences to the right and below (dx from hx, dy from hy).
function normalFromHeight(size, hx, hy, strength, blue) {
  return paint(size, (x, y, out) => {
    const i = y * size + x;
    const right = x + 1 < size ? i + 1 : i - 1;
    const below = y + 1 < size ? i + size : i - size;
    const dx = (hx[i] - hx[right]) * strength;
    const dy = (hy[i] - hy[below]) * strength;
    out[0] = Math.floor((dx * 0.5 + 0.5) * 255);
    out[1] = Math.floor((dy * 0.5 + 0.5) * 255);
    out[2] = blue;
  });
}

// Roughness maps are low-contrast and get half resolution, sampling the same pattern scale.
function roughnessMap(size, fn) {
  const half = size >> 1;
  return paint(half, (x, y, out) => {
    const v = Math.floor(Math.max(0, Math.min(1, fn(x * 2, y * 2))) * 255);
    out[0] = out[1] = out[2] = v;
  });
}

function colorTexture(canvas, repeat) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function dataTexture(canvas, repeat) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  return tex;
}

function clamp255(v) {
  return Math.min(255, Math.max(0, v));
}

function woodMaterial(size, seed, repeat, base) {
  const { r: baseR = 120, g: baseG = 80, b: baseB = 50 } = base;
  const map = paint(size, (x, y, out) => {
    const ring = fbm(x + seed, y, 7, 25);
    const grain = smoothNoise(x + seed, y * 0.2, 5);
    const knot = Math.exp(-((x - size * 0.6) ** 2 + (y - size * 0.4) ** 2) / 6000) * 0.4;
    const ringVal = Math.sin(ring * 25) * 0.5 + 0.5;
    const v = ringVal * 0.35 + grain * 0.25 + knot + 0.35;
    out[0] = Math.min(255, baseR * v + 20); out[1] = Math.min(255, baseG * v + 12); out[2] = Math.min(255, baseB * v + 5);
  });
  const hx = heightField(size, (x, y) => fbm(x + seed, y, 5, 20));
  const hy = heightField(size, (x, y) => fbm(x + seed + 100, y + 100, 5, 20));
  return new THREE.MeshStandardMaterial({
    map: colorTexture(map, repeat),
    normalMap: dataTexture(normalFromHeight(size, hx, hy, 4, 200), repeat),
    roughnessMap: dataTexture(roughnessMap(size, (x, y) => fbm(x + seed, y, 4, 30) * 0.25 + 0.7), repeat),
    normalScale: new THREE.Vector2(1.0, 1.0), roughness: 0.8,
  });
}

function concreteMaps(size, seed, repeat, base) {
  const { r: baseR, g: baseG, b: baseB } = base;
  const h = heightField(size, (x, y) => fbm(x + seed, y, 7, 20));
  const map = paint(size, (x, y, out) => {
    const n1 = h[y * size + x];
    const n2 = smoothNoise(x + seed, y, 4);
    const crack = Math.exp(-Math.abs(Math.sin((x + y * 0.7 + seed) * 0.03) * 25)) * 0.2;
    const stain = smoothNoise(x + seed + 200, y + 200, 50) > 0.72 ? -0.1 : 0;
    const v = n1 * 0.45 + n2 * 0.25 + crack + stain + 0.45;
    out[0] = clamp255(baseR * v + 15); out[1] = clamp255(baseG * v + 12); out[2] = clamp255(baseB * v + 10);
  });
  return { map: colorTexture(map, repeat), height: h };
}

function concreteMaterial(size, seed, repeat, base) {
  const { map, height } = concreteMaps(size, seed, repeat, base);
  return new THREE.MeshStandardMaterial({
    map,
    normalMap: dataTexture(normalFromHeight(size, height, height, 5, 180), repeat),
    roughnessMap: dataTexture(roughnessMap(size, (x, y) => fbm(x + seed, y, 5, 25) * 0.2 + 0.75), repeat),
    normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.88,
  });
}

function wallMaterial(size, seed, repeat) {
  const baseR = 180, baseG = 175, baseB = 165;
  const h = heightField(size, (x, y) => fbm(x + seed, y, 8, 12));
  const map = paint(size, (x, y, out) => {
    const plaster = h[y * size + x];
    const dirt = smoothNoise(x + seed + 300, y + 300, 80) > 0.68 ? 0.05 : 0;
    const waterDamage = y > size * 0.5 ? smoothNoise(x + seed, y, 20) * 0.1 : 0;
    const v = plaster * 0.3 + 0.6 - dirt - waterDamage;
    out[0] = clamp255(baseR * v); out[1] = clamp255(baseG * v); out[2] = clamp255(baseB * v);
  });
  return new THREE.MeshStandardMaterial({
    map: colorTexture(map, repeat),
    normalMap: dataTexture(normalFromHeight(size, h, h, 3, 190), repeat),
    normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.85,
  });
}

function metalMaterial(size, seed, repeat) {
  const baseR = 160, baseG = 165, baseB = 170;
  const map = paint(size, (x, y, out) => {
    const scratch = smoothNoise(x * 4 + seed, y, 3) > 0.62 ? 0.12 : 0;
    const rust = smoothNoise(x + seed + 400, y + 400, 30) > 0.74 ? 0.15 : 0;
    const v = smoothNoise(x + seed, y, 6) * 0.12 + 0.8 + scratch;
    out[0] = Math.min(255, baseR * v + rust * 80); out[1] = Math.min(255, baseG * v + rust * 20); out[2] = Math.min(255, baseB * v);
  });
  return new THREE.MeshStandardMaterial({
    map: colorTexture(map, repeat),
    roughnessMap: dataTexture(roughnessMap(size, (x, y) => {
      const scratch = smoothNoise(x * 4 + seed, y, 3) > 0.62 ? -0.15 : 0;
      return fbm(x + seed, y, 4, 40) * 0.12 + 0.3 + scratch;
    }), repeat),
    roughness: 0.35, metalness: 0.85,
  });
}

export function createPBRMaterial(type, opts = {}) {
  const size = opts.size || 512;
  const seed = opts.seed || Math.floor(Math.random() * 1000);
  switch (type) {
    case "wood":
      return woodMaterial(size, seed, opts.repeat || [2, 2], { r: opts.baseR, g: opts.baseG, b: opts.baseB });
    case "concrete":
      return concreteMaterial(size, seed, opts.repeat || [4, 4], { r: opts.baseR || 140, g: opts.baseG || 140, b: opts.baseB || 140 });
    case "wall":
      return wallMaterial(size, seed, opts.repeat || [3, 1.5]);
    case "metal":
      return metalMaterial(size, seed, opts.repeat || [1, 1]);
    case "ceiling":
      return new THREE.MeshStandardMaterial({
        map: concreteMaps(size, seed, opts.repeat || [3, 3], { r: 160, g: 160, b: 165 }).map,
        roughness: 0.95,
      });
    default:
      return new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.8 });
  }
}
