import * as THREE from 'three';

function createCanvas(w = 1024, h = 1024) {
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

function fbm(x, y, octaves = 6, scale = 64) {
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
  tex.anisotropy = 8;
  return tex;
}

function makeDataTexture(canvas, opts = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  tex.anisotropy = 8;
  return tex;
}

// ===== REALISTIC WOOD =====
export function generateWoodTexture(size = 512, opts = {}) {
  const { baseR = 120, baseG = 80, baseB = 50, repeat = [2, 2], seed = 0 } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const ring = fbm(x + seed, y, 7, 25);
    const grain = smoothNoise(x + seed, y * 0.2, 5);
    const knot = Math.exp(-((x - size * 0.6) ** 2 + (y - size * 0.4) ** 2) / 6000) * 0.4;
    const ringVal = Math.sin(ring * 25) * 0.5 + 0.5;
    const v = ringVal * 0.35 + grain * 0.25 + knot + 0.35;
    return [Math.min(255, baseR * v + 20), Math.min(255, baseG * v + 12), Math.min(255, baseB * v + 5)];
  });
  return makeTexture(c, { repeat });
}

export function generateWoodNormal(size = 512, opts = {}) {
  const { seed = 0, repeat = [2, 2] } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const h1 = fbm(x + seed, y, 5, 20);
    const dx = (h1 - fbm(x + 1 + seed, y, 5, 20)) * 4;
    const dy = (fbm(x + seed + 100, y + 100, 5, 20) - fbm(x + seed + 100, y + 101, 5, 20)) * 4;
    return [Math.floor((dx * 0.5 + 0.5) * 255), Math.floor((dy * 0.5 + 0.5) * 255), 200, 255];
  });
  return makeDataTexture(c, { repeat });
}

export function generateWoodRoughness(size = 512, opts = {}) {
  const { seed = 0, repeat = [2, 2] } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const v = fbm(x + seed, y, 4, 30) * 0.25 + 0.7;
    return [Math.floor(v * 255), Math.floor(v * 255), Math.floor(v * 255)];
  });
  return makeDataTexture(c, { repeat });
}

// ===== REALISTIC CONCRETE =====
export function generateConcreteTexture(size = 512, opts = {}) {
  const { baseR = 140, baseG = 140, baseB = 140, repeat = [4, 4], seed = 0 } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const n1 = fbm(x + seed, y, 7, 20);
    const n2 = smoothNoise(x + seed, y, 4);
    const crack = Math.exp(-Math.abs(Math.sin((x + y * 0.7 + seed) * 0.03) * 25)) * 0.2;
    const stain = smoothNoise(x + seed + 200, y + 200, 50) > 0.72 ? -0.1 : 0;
    const v = n1 * 0.45 + n2 * 0.25 + crack + stain + 0.45;
    return [
      Math.min(255, Math.max(0, baseR * v + 15)),
      Math.min(255, Math.max(0, baseG * v + 12)),
      Math.min(255, Math.max(0, baseB * v + 10))
    ];
  });
  return makeTexture(c, { repeat });
}

export function generateConcreteNormal(size = 512, opts = {}) {
  const { seed = 0, repeat = [4, 4] } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const h = fbm(x + seed, y, 7, 20);
    const dx = (h - fbm(x + 1 + seed, y, 7, 20)) * 5;
    const dy = (h - fbm(x + seed, y + 1, 7, 20)) * 5;
    return [Math.floor((dx * 0.5 + 0.5) * 255), Math.floor((dy * 0.5 + 0.5) * 255), 180, 255];
  });
  return makeDataTexture(c, { repeat });
}

export function generateConcreteRoughness(size = 512, opts = {}) {
  const { seed = 0, repeat = [4, 4] } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const v = fbm(x + seed, y, 5, 25) * 0.2 + 0.75;
    return [Math.floor(v * 255), Math.floor(v * 255), Math.floor(v * 255)];
  });
  return makeDataTexture(c, { repeat });
}

// ===== REALISTIC WALLS (plaster/paint) =====
export function generateWallTexture(size = 512, opts = {}) {
  const { baseR = 180, baseG = 175, baseB = 165, repeat = [3, 1.5], seed = 0 } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const plaster = fbm(x + seed, y, 8, 12);
    const dirt = smoothNoise(x + seed + 300, y + 300, 80) > 0.68 ? 0.05 : 0;
    const waterDamage = y > size * 0.5 ? smoothNoise(x + seed, y, 20) * 0.1 : 0;
    const v = plaster * 0.3 + 0.6 - dirt - waterDamage;
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
    const h = fbm(x + seed, y, 8, 12);
    const dx = (h - fbm(x + 1 + seed, y, 8, 12)) * 3;
    const dy = (h - fbm(x + seed, y + 1, 8, 12)) * 3;
    return [Math.floor((dx * 0.5 + 0.5) * 255), Math.floor((dy * 0.5 + 0.5) * 255), 190, 255];
  });
  return makeDataTexture(c, { repeat });
}

// ===== REALISTIC METAL =====
export function generateMetalTexture(size = 512, opts = {}) {
  const { baseR = 160, baseG = 165, baseB = 170, repeat = [1, 1], seed = 0 } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const scratch = smoothNoise(x * 4 + seed, y, 3) > 0.62 ? 0.12 : 0;
    const rust = smoothNoise(x + seed + 400, y + 400, 30) > 0.74 ? 0.15 : 0;
    const base = smoothNoise(x + seed, y, 6) * 0.12 + 0.8;
    const v = base + scratch;
    return [Math.min(255, baseR * v + rust * 80), Math.min(255, baseG * v + rust * 20), Math.min(255, baseB * v)];
  });
  return makeTexture(c, { repeat });
}

export function generateMetalRoughness(size = 512, opts = {}) {
  const { seed = 0, repeat = [1, 1] } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const scratch = smoothNoise(x * 4 + seed, y, 3) > 0.62 ? -0.15 : 0;
    const v = fbm(x + seed, y, 4, 40) * 0.12 + 0.3 + scratch;
    return [Math.floor(Math.max(0, v) * 255), Math.floor(Math.max(0, v) * 255), Math.floor(Math.max(0, v) * 255)];
  });
  return makeDataTexture(c, { repeat });
}

// ===== REALISTIC TILES =====
export function generateTileTexture(size = 512, opts = {}) {
  const { baseR = 210, baseG = 215, baseB = 210, repeat = [8, 8], seed = 0, tileSize = 64, groutWidth = 3 } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const lx = x % tileSize, ly = y % tileSize;
    if (lx < groutWidth || ly < groutWidth) {
      const gn = smoothNoise(x + seed, y, 4) * 12;
      return [50 + gn, 48 + gn, 45 + gn];
    }
    const stain = smoothNoise(x + seed + 500, y + 500, 50) > 0.78 ? -0.05 : 0;
    const n = fbm(x + seed, y, 4, 25) * 0.06 + 0.92 + stain;
    return [Math.min(255, baseR * n), Math.min(255, baseG * n), Math.min(255, baseB * n)];
  });
  return makeTexture(c, { repeat });
}

export function generateTileNormal(size = 512, opts = {}) {
  const { seed = 0, repeat = [8, 8], tileSize = 64, groutWidth = 3 } = opts;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  putPixels(ctx, size, size, (x, y) => {
    const lx = x % tileSize, ly = y % tileSize;
    if (lx < groutWidth || ly < groutWidth) return [128, 128, 100, 255];
    const h = fbm(x + seed, y, 4, 25);
    const dx = (h - fbm(x + 1 + seed, y, 4, 25)) * 2;
    const dy = (h - fbm(x + seed, y + 1, 4, 25)) * 2;
    return [Math.floor((dx * 0.5 + 0.5) * 255), Math.floor((dy * 0.5 + 0.5) * 255), 210, 255];
  });
  return makeDataTexture(c, { repeat });
}

// ===== FACTORY =====
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
        normalScale: new THREE.Vector2(1.0, 1.0), roughness: 0.8,
      });
    }
    case "concrete": {
      const r = repeat || [4, 4];
      return new THREE.MeshStandardMaterial({
        map: generateConcreteTexture(size, { repeat: r, seed, baseR: opts.baseR || 140, baseG: opts.baseG || 140, baseB: opts.baseB || 140 }),
        normalMap: generateConcreteNormal(size, { repeat: r, seed }),
        roughnessMap: generateConcreteRoughness(size, { repeat: r, seed }),
        normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.88,
      });
    }
    case "wall": {
      const r = repeat || [3, 1.5];
      return new THREE.MeshStandardMaterial({
        map: generateWallTexture(size, { repeat: r, seed }),
        normalMap: generateWallNormal(size, { repeat: r, seed }),
        normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.85,
      });
    }
    case "metal": {
      const r = repeat || [1, 1];
      return new THREE.MeshStandardMaterial({
        map: generateMetalTexture(size, { repeat: r, seed }),
        roughnessMap: generateMetalRoughness(size, { repeat: r, seed }),
        roughness: 0.35, metalness: 0.85,
      });
    }
    case "tile": {
      const r = repeat || [6, 6];
      return new THREE.MeshStandardMaterial({
        map: generateTileTexture(size, { repeat: r, seed }),
        normalMap: generateTileNormal(size, { repeat: r, seed }),
        normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.3, metalness: 0.05,
      });
    }
    case "ceiling": {
      const r = repeat || [3, 3];
      return new THREE.MeshStandardMaterial({
        map: generateConcreteTexture(size, { repeat: r, seed, baseR: 160, baseG: 160, baseB: 165 }),
        roughness: 0.95,
      });
    }
    default:
      return new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.8 });
  }
}
