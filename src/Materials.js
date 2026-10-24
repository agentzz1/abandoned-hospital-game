import * as THREE from 'three';

// Photo-scanned CC0 textures from Poly Haven (polyhaven.com), in public/textures/.
// "hi" is 1024 px colour and normal maps for desktops, "lo" is 512 px for phones.
const SETS = {
  wall:     { name: 'white_rough_plaster', color: 0xc9c6bc, normalScale: 0.9 },
  wainscot: { name: 'painted_concrete',    color: 0xb8c4b6, normalScale: 0.8 },
  floor:    { name: 'worn_tile_floor',     color: 0xa8a8a4, normalScale: 1.0, roughness: 0.85 },
  ceiling:  { name: 'white_plaster_02',    color: 0xcfccc2, normalScale: 0.6 },
  metal:    { name: 'metal_plate',         color: [2.4, 2.4, 2.5], normalScale: 0.8, metalness: 0.25 },
  wood:     { name: 'rough_pine_door',     color: 0xc8b8a4, normalScale: 0.9 },
  locker:   { name: 'green_metal_rust',    color: 0xc0c8bc, normalScale: 0.7, metalness: 0.1 },
};

// The metal scan is very dark rust, so its colour is a multiplier above 1 to lift it to painted steel.
// Fallback colours if a texture fails to load, so the game still starts.
const FALLBACK = {
  wall: 0x8a877e, wainscot: 0x3f5244, floor: 0x3a3b3a, ceiling: 0x6c6a64,
  metal: 0x6e7270, wood: 0x5a4636, locker: 0x3e4a40,
};

// ImageBitmap decoding runs off the main thread; older Safari lacks it, so fall back to <img>.
const canDecodeOffThread = typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined';

function loadTexture(url) {
  return new Promise(resolve => {
    if (canDecodeOffThread) {
      const loader = new THREE.ImageBitmapLoader();
      loader.setOptions({ imageOrientation: 'flipY' });
      loader.load(url, bitmap => {
        const t = new THREE.Texture(bitmap);
        t.flipY = false; // already flipped while decoding
        t.needsUpdate = true;
        resolve(t);
      }, undefined, () => new THREE.TextureLoader().load(url, resolve, undefined, () => resolve(null)));
    } else {
      new THREE.TextureLoader().load(url, resolve, undefined, () => resolve(null));
    }
  });
}

export async function loadMaterials(renderer, { lowQuality = false } = {}) {
  const dir = `./textures/${lowQuality ? 'lo' : 'hi'}/`;
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), lowQuality ? 4 : 8);

  const entries = await Promise.all(Object.entries(SETS).map(async ([key, set]) => {
    const [map, normalMap, roughnessMap] = await Promise.all(
      ['diff', 'nor', 'rough'].map(kind => loadTexture(`${dir}${set.name}_${kind}.jpg`))
    );
    for (const t of [map, normalMap, roughnessMap]) {
      if (!t) continue;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = anisotropy;
    }
    if (map) map.colorSpace = THREE.SRGBColorSpace;

    const material = map
      ? new THREE.MeshStandardMaterial({
          map,
          normalMap: normalMap || null,
          roughnessMap: roughnessMap || null,
          normalScale: new THREE.Vector2(set.normalScale, set.normalScale),
          color: Array.isArray(set.color) ? new THREE.Color().setRGB(...set.color) : set.color,
          roughness: set.roughness ?? 1,
          metalness: set.metalness ?? 0,
        })
      : new THREE.MeshStandardMaterial({ color: FALLBACK[key], roughness: 0.9, metalness: set.metalness ?? 0 });
    return [key, material];
  }));
  return Object.fromEntries(entries);
}

// Rewrites a BoxGeometry's UVs so the texture keeps a fixed real-world size (tile metres per
// repeat) on every face, offset by the box's world position so neighbouring boxes line up.
export function worldBoxUV(geometry, w, h, d, x, y, z, tile) {
  const uv = geometry.attributes.uv;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; four vertices each.
  const faces = [
    [d, h, z - d / 2, y - h / 2], [d, h, z - d / 2, y - h / 2],
    [w, d, x - w / 2, z - d / 2], [w, d, x - w / 2, z - d / 2],
    [w, h, x - w / 2, y - h / 2], [w, h, x - w / 2, y - h / 2],
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv, ou, ov] = faces[f];
    for (let i = f * 4; i < f * 4 + 4; i++) {
      uv.setXY(i, (uv.getX(i) * su + ou) / tile, (uv.getY(i) * sv + ov) / tile);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

export function scalePlaneUV(geometry, w, h, tile) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile);
  uv.needsUpdate = true;
  return geometry;
}
