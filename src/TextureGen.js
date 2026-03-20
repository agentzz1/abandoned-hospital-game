import * as THREE from 'three';

function createCanvas(w = 512, h = 512) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

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

function fbm(x, y, octaves = 4, scale = 64) {
  let val = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * smoothNoise(x * freq, y * freq, scale / freq);
    amp *= 0.5; freq *= 2;
  }
  return val;
}

function putPixels(ctx, w, h, fn) {
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b, a] = fn(x, y, w, h);
      img.data[i] = r; img.data[i+1] = g; img.data[i+2] = b; img.data[i+3] = a ?? 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function makeTexture(canvas, opts = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeDataTexture(canvas, opts = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  tex.anisotropy = 4;
  return tex;
}

export function generateWoodTexture(size = 512, opts = {}) {
  const { baseR = 92, baseG = 60, baseB = 38, repeat = [2, 2], seed = 0 } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const ring = fbm(x + seed, y, 5, 40);
    const grain = smoothNoise(x + seed, y * 0.3, 8);
    const knot = Math.exp(-((x - size * 0.6) ** 2 + (y - size * 0.4) ** 2) / 8000) * 0.3;
    const ringVal = Math.sin(ring * 20) * 0.5 + 0.5;
    const v = ringVal * 0.4 + grain * 0.3 + knot + 0.3;
    return [Math.min(255, baseR * v + 30), Math.min(255, baseG * v + 15), Math.min(255, baseB * v + 8)];
  });
  return makeTexture(c, { repeat });
}

export function generateWoodNormal(size = 512, opts = {}) {
  const { seed = 0, repeat = [2, 2] } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const h1 = fbm(x + seed, y, 4, 30);
    const dx = (h1 - fbm(x + 1 + seed, y, 4, 30)) * 3;
    const dy = (fbm(x + seed + 100, y + 100, 4, 30) - fbm(x + seed + 100, y + 101, 4, 30)) * 3;
    return [Math.floor((dx * 0.5 + 0.5) * 255), Math.floor((dy * 0.5 + 0.5) * 255), 200, 255];
  });
  return makeDataTexture(c, { repeat });
}

export function generateWoodRoughness(size = 512, opts = {}) {
  const { seed = 0, repeat = [2, 2] } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const v = fbm(x + seed, y, 3, 50) * 0.3 + 0.7;
    return [Math.floor(v * 255), Math.floor(v * 255), Math.floor(v * 255)];
  });
  return makeDataTexture(c, { repeat });
}

export function generateConcreteTexture(size = 512, opts = {}) {
  const { baseR = 60, baseG = 63, baseB = 67, repeat = [4, 4], seed = 0 } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const n1 = fbm(x + seed, y, 5, 32);
    const n2 = smoothNoise(x + seed, y, 6);
    const crack = Math.exp(-Math.abs(Math.sin((x + y * 0.7 + seed) * 0.05) * 30)) * 0.15;
    const stain = smoothNoise(x + seed + 200, y + 200, 80) > 0.7 ? -0.08 : 0;
    const v = n1 * 0.5 + n2 * 0.3 + crack + stain + 0.35;
    return [
      Math.min(255, Math.max(0, baseR * v + 10)),
      Math.min(255, Math.max(0, baseG * v + 10)),
      Math.min(255, Math.max(0, baseB * v + 12))
    ];
  });
  return makeTexture(c, { repeat });
}

export function generateConcreteNormal(size = 512, opts = {}) {
  const { seed = 0, repeat = [4, 4] } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const h = fbm(x + seed, y, 5, 32);
    const dx = (h - fbm(x + 1 + seed, y, 5, 32)) * 4;
    const dy = (h - fbm(x + seed, y + 1, 5, 32)) * 4;
    return [Math.floor((dx * 0.5 + 0.5) * 255), Math.floor((dy * 0.5 + 0.5) * 255), 180, 255];
  });
  return makeDataTexture(c, { repeat });
}

export function generateConcreteRoughness(size = 512, opts = {}) {
  const { seed = 0, repeat = [4, 4] } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const v = fbm(x + seed, y, 4, 40) * 0.25 + 0.72;
    return [Math.floor(v * 255), Math.floor(v * 255), Math.floor(v * 255)];
  });
  return makeDataTexture(c, { repeat });
}

export function generateWallTexture(size = 512, opts = {}) {
  const { baseR = 90, baseG = 95, baseB = 88, repeat = [3, 1.5], seed = 0 } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const plaster = fbm(x + seed, y, 6, 20);
    const dirt = smoothNoise(x + seed + 300, y + 300, 100) > 0.65 ? 0.06 : 0;
    const waterDamage = y > size * 0.6 ? smoothNoise(x + seed, y, 30) * 0.12 : 0;
    const v = plaster * 0.35 + 0.55 - dirt - waterDamage;
    return [
      Math.min(255, Math.max(0, baseR * v)),
      Math.min(255, Math.max(0, baseG * v)),
      Math.min(255, Math.max(0, baseB * v))
    ];
  });
  return makeTexture(c, { repeat });
}

export function generateWallNormal(size = 512, opts = {}) {
  const { seed = 0, repeat = [3, 1.5] } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const h = fbm(x + seed, y, 6, 20);
    const dx = (h - fbm(x + 1 + seed, y, 6, 20)) * 2.5;
    const dy = (h - fbm(x + seed, y + 1, 6, 20)) * 2.5;
    return [Math.floor((dx * 0.5 + 0.5) * 255), Math.floor((dy * 0.5 + 0.5) * 255), 190, 255];
  });
  return makeDataTexture(c, { repeat });
}

export function generateMetalTexture(size = 512, opts = {}) {
  const { baseR = 100, baseG = 105, baseB = 110, repeat = [1, 1], seed = 0 } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const scratch = smoothNoise(x * 3 + seed, y, 4) > 0.6 ? 0.15 : 0;
    const rust = smoothNoise(x + seed + 400, y + 400, 40) > 0.72 ? 0.2 : 0;
    const base = smoothNoise(x + seed, y, 8) * 0.15 + 0.75;
    const v = base + scratch;
    return [Math.min(255, baseR * v + rust * 60), Math.min(255, baseG * v + rust * 15), Math.min(255, baseB * v)];
  });
  return makeTexture(c, { repeat });
}

export function generateMetalRoughness(size = 512, opts = {}) {
  const { seed = 0, repeat = [1, 1] } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const scratch = smoothNoise(x * 3 + seed, y, 4) > 0.6 ? -0.2 : 0;
    const v = fbm(x + seed, y, 3, 60) * 0.15 + 0.35 + scratch;
    return [Math.floor(Math.max(0, v) * 255), Math.floor(Math.max(0, v) * 255), Math.floor(Math.max(0, v) * 255)];
  });
  return makeDataTexture(c, { repeat });
}

export function generateTileTexture(size = 512, opts = {}) {
  const { baseR = 180, baseG = 185, baseB = 178, repeat = [6, 6], seed = 0, tileSize = 64, groutWidth = 3 } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const lx = x % tileSize, ly = y % tileSize;
    if (lx < groutWidth || ly < groutWidth) {
      const gn = smoothNoise(x + seed, y, 6) * 15;
      return [35 + gn, 33 + gn, 30 + gn];
    }
    const stain = smoothNoise(x + seed + 500, y + 500, 60) > 0.75 ? -0.06 : 0;
    const n = fbm(x + seed, y, 3, 40) * 0.08 + 0.9 + stain;
    return [Math.min(255, baseR * n), Math.min(255, baseG * n), Math.min(255, baseB * n)];
  });
  return makeTexture(c, { repeat });
}

export function generateTileNormal(size = 512, opts = {}) {
  const { seed = 0, repeat = [6, 6], tileSize = 64, groutWidth = 3 } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const lx = x % tileSize, ly = y % tileSize;
    if (lx < groutWidth || ly < groutWidth) return [128, 128, 100, 255];
    const h = fbm(x + seed, y, 3, 40);
    const dx = (h - fbm(x + 1 + seed, y, 3, 40)) * 1.5;
    const dy = (h - fbm(x + seed, y + 1, 3, 40)) * 1.5;
    return [Math.floor((dx * 0.5 + 0.5) * 255), Math.floor((dy * 0.5 + 0.5) * 255), 210, 255];
  });
  return makeDataTexture(c, { repeat });
}

export function createPBRMaterial(type, opts = {}) {
  const size = opts.size || 512;
  const repeat = opts.repeat;
  const seed = opts.seed || Math.floor(Math.random() * 1000);
  switch (type) {
    case "wood": {
      const r = repeat || [2, 2];
      return new THREE.MeshStandardMaterial({
        map: generateWoodTexture(size, { repeat: r, seed }),
        normalMap: generateWoodNormal(size, { repeat: r, seed }),
        roughnessMap: generateWoodRoughness(size, { repeat: r, seed }),
        normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.85,
      });
    }
    case "concrete": {
      const r = repeat || [4, 4];
      return new THREE.MeshStandardMaterial({
        map: generateConcreteTexture(size, { repeat: r, seed }),
        normalMap: generateConcreteNormal(size, { repeat: r, seed }),
        roughnessMap: generateConcreteRoughness(size, { repeat: r, seed }),
        normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.92,
      });
    }
    case "wall": {
      const r = repeat || [3, 1.5];
      return new THREE.MeshStandardMaterial({
        map: generateWallTexture(size, { repeat: r, seed }),
        normalMap: generateWallNormal(size, { repeat: r, seed }),
        normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.88,
      });
    }
    case "metal": {
      const r = repeat || [1, 1];
      return new THREE.MeshStandardMaterial({
        map: generateMetalTexture(size, { repeat: r, seed }),
        roughnessMap: generateMetalRoughness(size, { repeat: r, seed }),
        roughness: 0.4, metalness: 0.7,
      });
    }
    case "tile": {
      const r = repeat || [6, 6];
      return new THREE.MeshStandardMaterial({
        map: generateTileTexture(size, { repeat: r, seed }),
        normalMap: generateTileNormal(size, { repeat: r, seed }),
        normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.35,
      });
    }
    case "ceiling": {
      const r = repeat || [3, 3];
      return new THREE.MeshStandardMaterial({
        map: generateConcreteTexture(size, { repeat: r, seed, baseR: 28, baseG: 32, baseB: 38 }),
        roughness: 1,
      });
    }
    default:
      return new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.8 });
  }
}
